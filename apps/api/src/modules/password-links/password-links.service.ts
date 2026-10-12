import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash } from 'argon2';
import { Prisma, type PasswordLinkPurpose, type UserStatus } from '@prisma/client';
import { failedPasswordRules, isPersonalPassword } from '@sdp/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiException } from '../../common/api-error.js';
import { RateLimiterService } from '../../common/rate-limiter.service.js';
import { Mailer } from '../../integrations/mail/mailer.js';
import { MailTemplates } from '../../integrations/mail/templates/mail-templates.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCanManageUser } from '../user-roles/role-policy.js';
import { assignedRoleCodes } from '../users/user-response.js';

// One-time password links; the contract is in docs/18-security.md ("Password links").

/** Wrong passwords tolerated on one link before it answers 429. */
export const MAX_SET_PASSWORD_ATTEMPTS = 5;
/** Forgot-password requests per email per window (counted even with no account). */
export const MAX_FORGOT_REQUESTS = 3;
export const FORGOT_WINDOW_MS = 15 * 60 * 1000;
/** Per-IP ceiling across the public endpoints, on top of the per-subject limits. */
export const MAX_PUBLIC_REQUESTS_PER_IP = 30;
export const IP_WINDOW_MS = 15 * 60 * 1000;
/** Real tokens are 43 characters; the cap stops hashing arbitrary payloads. */
const MAX_TOKEN_LENGTH = 256;
const MAX_EMAIL_LENGTH = 254;
/** Forgot-password replies take at least this long, so timing does not reveal an account. */
export const FORGOT_MIN_RESPONSE_MS = 400;

type Db = Prisma.TransactionClient | PrismaService;

export type ValidateResult =
  | { status: 'valid'; purpose: PasswordLinkPurpose; emailHint: string; expiresAt: string }
  | { status: 'expired'; purpose: PasswordLinkPurpose }
  | { status: 'invalid' };

export interface IssuedLink {
  linkId: string;
  token: string;
  expiresAt: Date;
  issuedAt: Date;
}

interface LinkSubject {
  id: string;
  email: string;
  fullName: string;
}

const linkWithUser = {
  user: { select: { id: true, email: true, fullName: true, status: true, deletedAt: true } },
} satisfies Prisma.PasswordLinkInclude;
type LinkWithUser = Prisma.PasswordLinkGetPayload<{ include: typeof linkWithUser }>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** "j***@company.com" — enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** A link is only good while its account is still in the state it was issued for. */
function isEligible(status: UserStatus, deletedAt: Date | null, purpose: PasswordLinkPurpose) {
  if (deletedAt !== null) return false;
  return status === (purpose === 'INVITE' ? 'INVITED' : 'ACTIVE');
}

@Injectable()
export class PasswordLinksService implements OnModuleDestroy {
  private readonly logger = new Logger(PasswordLinksService.name);
  private readonly background = new Set<Promise<void>>();
  forgotMinResponseMs = FORGOT_MIN_RESPONSE_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly limiter: RateLimiterService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly templates: MailTemplates,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.drainBackground();
  }

  /** Waits for detached sends (forgot-password, notices) to finish. */
  async drainBackground(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  private ttlMs(purpose: PasswordLinkPurpose): number {
    return purpose === 'INVITE'
      ? this.config.getOrThrow<number>('passwordLinks.inviteTtlMs')
      : this.config.getOrThrow<number>('passwordLinks.resetTtlMs');
  }

  /** The link timings the screens show; the values come from configuration only. */
  linkPolicy() {
    return {
      inviteTtlMinutes: this.ttlMs('INVITE') / 60_000,
      resetTtlMinutes: this.ttlMs('RESET') / 60_000,
      resendCooldownSeconds:
        this.config.getOrThrow<number>('passwordLinks.resendCooldownMs') / 1000,
    };
  }

  private runDetached(label: string, work: () => Promise<unknown>): void {
    const task: Promise<void> = work()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.warn(
          `${label} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      })
      .finally(() => this.background.delete(task));
    this.background.add(task);
  }

  /* ------------------------------------------------------------- issuing */

  /**
   * Creates a link and revokes the user's older live links for the same
   * purpose. Runs inside the caller's transaction; deliver it with `deliver`
   * only after that transaction commits, so no email is sent for a rolled-back
   * account.
   */
  async createLink(db: Db, userId: string, purpose: PasswordLinkPurpose): Promise<IssuedLink> {
    const now = new Date();
    await db.passwordLink.updateMany({
      where: { userId, purpose, revokedAt: null, usedAt: null },
      data: { revokedAt: now },
    });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.ttlMs(purpose));
    const link = await db.passwordLink.create({
      data: { userId, purpose, tokenHash: hashToken(token), expiresAt },
      select: { id: true },
    });
    return { linkId: link.id, token, expiresAt, issuedAt: now };
  }

  /** Emails the link and records whether the transport accepted it. Never throws. */
  async deliver(
    link: IssuedLink,
    user: LinkSubject,
    purpose: PasswordLinkPurpose,
  ): Promise<'SENT' | 'FAILED'> {
    const input = {
      name: user.fullName,
      token: link.token,
      expiresAt: link.expiresAt,
      issuedAt: link.issuedAt,
    };
    const content =
      purpose === 'INVITE' ? this.templates.userInvite(input) : this.templates.passwordReset(input);
    let emailStatus: 'SENT' | 'FAILED' = 'SENT';
    try {
      await this.mailer.send({
        to: user.email,
        toName: user.fullName,
        ...content,
        tags: [purpose === 'INVITE' ? 'user-invite' : 'password-reset'],
      });
    } catch (error) {
      emailStatus = 'FAILED';
      this.logger.warn(
        `Could not send ${purpose.toLowerCase()} email for user ${user.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    try {
      await this.prisma.passwordLink.update({ where: { id: link.linkId }, data: { emailStatus } });
    } catch (error) {
      this.logger.warn(
        `Could not record email status for link ${link.linkId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    return emailStatus;
  }

  async issueAndDeliver(user: LinkSubject, purpose: PasswordLinkPurpose) {
    const link = await this.createLink(this.prisma, user.id, purpose);
    const emailStatus = await this.deliver(link, user, purpose);
    return { expiresAt: link.expiresAt, emailStatus };
  }

  /** Kills every live link a user holds — on password set, deactivation and revoke. */
  revokeAllFor(db: Db, userId: string) {
    return db.passwordLink.updateMany({
      where: { userId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /* -------------------------------------------------------------- public */

  /** Never consumes the token, and never says whether an account exists. */
  async validate(token: unknown, ip: string | undefined): Promise<ValidateResult> {
    this.limitIp(ip);
    const resolved = await this.resolve(token);
    if (resolved.state === 'invalid') return { status: 'invalid' };
    if (resolved.state === 'expired') return { status: 'expired', purpose: resolved.link.purpose };
    return {
      status: 'valid',
      purpose: resolved.link.purpose,
      emailHint: maskEmail(resolved.link.user.email),
      expiresAt: resolved.link.expiresAt.toISOString(),
    };
  }

  async setPassword(token: unknown, newPassword: unknown, ip: string | undefined): Promise<void> {
    this.limitIp(ip);
    const resolved = await this.resolve(token);
    if (resolved.state === 'invalid') throw new ApiException('TOKEN_INVALID', 'TOKEN_INVALID');
    if (resolved.state === 'expired') throw new ApiException('TOKEN_EXPIRED', 'TOKEN_EXPIRED');
    const { link } = resolved;

    if (link.failedAttempts >= MAX_SET_PASSWORD_ATTEMPTS) {
      throw new ApiException('RATE_LIMITED', 'Too many attempts. Request a new link.');
    }
    if (typeof newPassword !== 'string') {
      throw new ApiException('PASSWORD_POLICY', 'PASSWORD_POLICY', [], { failedRules: [] });
    }

    // The server re-checks the policy; the browser's checklist is a convenience.
    const failedRules = failedPasswordRules(newPassword);
    if (failedRules.length > 0) {
      await this.countFailure(link.id);
      throw new ApiException('PASSWORD_POLICY', 'PASSWORD_POLICY', [], { failedRules });
    }
    // Not counted: the browser cannot check this rule, it does not know the name.
    if (isPersonalPassword(newPassword, { name: link.user.fullName, email: link.user.email })) {
      throw new ApiException('PASSWORD_PERSONAL', 'PASSWORD_PERSONAL');
    }

    // Same Argon2id parameters as AuthService.hashPassword (OWASP minimum).
    const passwordHash = await hash(newPassword, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Single use, enforced by the database: the update only matches a link
      // that is still unused, so two concurrent submits cannot both succeed.
      const consumed = await tx.passwordLink.updateMany({
        where: { id: link.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new ApiException('TOKEN_INVALID', 'TOKEN_INVALID');
      await this.revokeAllFor(tx, link.userId);
      await tx.user.update({
        where: { id: link.userId },
        data: { passwordHash, status: 'ACTIVE' },
      });
      // A new password ends every existing session.
      await tx.refreshSession.updateMany({
        where: { userId: link.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          userId: link.userId,
          actorName: link.user.fullName,
          actorRole: '',
          action: link.purpose === 'INVITE' ? 'INVITE_ACCEPTED' : 'PASSWORD_RESET',
          entityType: 'USER',
          entityId: link.userId,
          targetUserId: link.userId,
          description:
            link.purpose === 'INVITE'
              ? `${link.user.fullName} accepted their invite and set a password`
              : `${link.user.fullName} reset their password`,
        },
      });
    });

    const { email, fullName } = link.user;
    this.runDetached('Password-changed notice', () =>
      this.mailer.send({
        to: email,
        toName: fullName,
        ...this.templates.passwordChanged({
          name: fullName,
          at: now,
          firstPassword: link.purpose === 'INVITE',
        }),
        tags: ['password-changed'],
      }),
    );
  }

  /**
   * Always resolves (202). A live account gets a reset link; an account still
   * waiting on its invite gets the invite again, since that is the link it can use.
   */
  async forgotPassword(raw: unknown, ip: string | undefined): Promise<void> {
    const startedAt = Date.now();
    this.limitIp(ip);
    if (typeof raw === 'string' && raw.length <= MAX_EMAIL_LENGTH) {
      const email = raw.trim().toLowerCase();
      // Counted per address whether or not it has an account, so the limit itself
      // cannot be used to tell the two apart.
      if (!this.limiter.consume(`forgot:${email}`, MAX_FORGOT_REQUESTS, FORGOT_WINDOW_MS)) {
        throw new ApiException('RATE_LIMITED', 'Too many requests. Try again later.');
      }
      // Lookup and send run after the reply, so known and unknown addresses take the same time.
      this.runDetached('Forgot-password link', () => this.sendForgotLink(email));
    }
    const wait = this.forgotMinResponseMs - (Date.now() - startedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  private async sendForgotLink(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, fullName: true, status: true },
    });
    if (!user) return;
    if (user.status === 'ACTIVE') await this.issueAndDeliver(user, 'RESET');
    else if (user.status === 'INVITED') await this.issueAndDeliver(user, 'INVITE');
  }

  /** From the link-expired screen. Always resolves; a real token gets a fresh link. */
  async resendLink(token: unknown, ip: string | undefined): Promise<void> {
    this.limitIp(ip);
    if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) return;
    const link = await this.prisma.passwordLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: linkWithUser,
    });
    if (link?.usedAt !== null || link.revokedAt !== null) return;
    if (!isEligible(link.user.status, link.user.deletedAt, link.purpose)) return;

    if ((await this.resendWaitSeconds(link.userId, link.purpose)) > 0) {
      throw new ApiException('RATE_LIMITED', 'Wait a minute before requesting another link.');
    }
    await this.issueAndDeliver(link.user, link.purpose);
  }

  /* --------------------------------------------------------------- admin */

  /** Users tab "Resend". Same authorisation as editing the user. */
  async resendInvite(userId: string, actor: AuthenticatedUser) {
    const user = await this.invitedUser(userId, actor);
    const wait = await this.resendWaitSeconds(user.id, 'INVITE');
    if (wait > 0) {
      throw new ApiException('RATE_LIMITED', `Wait ${String(wait)}s before resending.`);
    }
    const sent = await this.issueAndDeliver(user, 'INVITE');
    return { invite: { expiresAt: sent.expiresAt.toISOString(), emailStatus: sent.emailStatus } };
  }

  /** Users tab "Send reset link" for an active account. Same authorisation as editing the user. */
  async sendResetLink(userId: string, actor: AuthenticatedUser) {
    const user = await this.managedUser(userId, actor);
    if (user.status !== 'ACTIVE') {
      throw new ApiException(
        'NOT_ACTIVE',
        user.status === 'INVITED'
          ? 'This user has not set a password yet. Resend the invite instead.'
          : 'Reactivate this user before sending a reset link.',
      );
    }
    const wait = await this.resendWaitSeconds(user.id, 'RESET');
    if (wait > 0) {
      throw new ApiException('RATE_LIMITED', `Wait ${String(wait)}s before sending another link.`);
    }
    const sent = await this.issueAndDeliver(user, 'RESET');
    await this.audit.record(this.prisma, actor, {
      actionType: 'PASSWORD_RESET_LINK_SENT',
      entityType: 'USER',
      entityId: user.id,
      targetUserId: user.id,
      description: `${actor.name} sent a password reset link to ${user.fullName}`,
      metadata: { targetLabel: user.fullName, emailStatus: sent.emailStatus },
    });
    return { reset: { expiresAt: sent.expiresAt.toISOString(), emailStatus: sent.emailStatus } };
  }

  /**
   * Withdraws an invite. The account never signed in and owns nothing, so it is
   * removed outright — which is also what lets the admin invite the address
   * again — and the withdrawal is kept in the audit log.
   */
  async revokeInvite(userId: string, actor: AuthenticatedUser): Promise<void> {
    const user = await this.invitedUser(userId, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      // Conditional on the state checked above: if the user set their password
      // in the meantime, the account is ACTIVE and must not be deleted. The
      // throw rolls back the role removal too.
      const removed = await tx.user.deleteMany({ where: { id: user.id, status: 'INVITED' } });
      if (removed.count !== 1) {
        throw new ApiException('NOT_INVITED', 'This user has already accepted the invite.');
      }
      await this.audit.record(tx, actor, {
        actionType: 'INVITE_REVOKED',
        entityType: 'USER',
        entityId: user.id,
        targetUserId: user.id,
        description: `${actor.name} revoked the invite for ${user.fullName} <${user.email}>`,
        oldValue: { name: user.fullName, email: user.email, status: 'INVITED' },
        metadata: {
          targetLabel: `${user.fullName} <${user.email}>`,
          reason: 'Invite withdrawn before first sign-in.',
        },
      });
    });
  }

  /** Latest live invite per user, for the Users tab (`inviteExpiresAt`, `inviteEmailStatus`). */
  async inviteStates(userIds: readonly string[]) {
    if (userIds.length === 0) return new Map<string, InviteState>();
    const links = await this.prisma.passwordLink.findMany({
      where: { userId: { in: [...userIds] }, purpose: 'INVITE', revokedAt: null, usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, expiresAt: true, emailStatus: true },
    });
    const states = new Map<string, InviteState>();
    for (const link of links) {
      if (!states.has(link.userId)) {
        states.set(link.userId, { expiresAt: link.expiresAt, emailStatus: link.emailStatus });
      }
    }
    return states;
  }

  /* ------------------------------------------------------------- helpers */

  private async resolve(
    token: unknown,
  ): Promise<
    | { state: 'valid'; link: LinkWithUser }
    | { state: 'expired'; link: LinkWithUser }
    | { state: 'invalid' }
  > {
    if (typeof token !== 'string' || token === '' || token.length > MAX_TOKEN_LENGTH) {
      return { state: 'invalid' };
    }
    const link = await this.prisma.passwordLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: linkWithUser,
    });
    if (link?.usedAt !== null || link.revokedAt !== null) return { state: 'invalid' };
    if (!isEligible(link.user.status, link.user.deletedAt, link.purpose)) {
      return { state: 'invalid' };
    }
    return { state: Date.now() >= link.expiresAt.getTime() ? 'expired' : 'valid', link };
  }

  private async invitedUser(userId: string, actor: AuthenticatedUser) {
    const user = await this.managedUser(userId, actor);
    if (user.status !== 'INVITED') {
      throw new ApiException('NOT_INVITED', 'This user is no longer in the invited state.');
    }
    return user;
  }

  private async managedUser(userId: string, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { where: { role: { deletedAt: null } }, include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    try {
      assertCanManageUser(actor, assignedRoleCodes(user));
    } catch {
      throw new ApiException(
        'PRIVILEGED_ROLE_REQUIRED',
        'Only a Super Admin can manage a privileged account.',
      );
    }
    return user;
  }

  private async resendWaitSeconds(userId: string, purpose: PasswordLinkPurpose) {
    const last = await this.prisma.passwordLink.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return 0;
    return Math.max(
      0,
      Math.ceil(
        (last.createdAt.getTime() +
          this.config.getOrThrow<number>('passwordLinks.resendCooldownMs') -
          Date.now()) /
          1000,
      ),
    );
  }

  private async countFailure(linkId: string) {
    await this.prisma.passwordLink.updateMany({
      where: { id: linkId, failedAttempts: { lt: MAX_SET_PASSWORD_ATTEMPTS } },
      data: { failedAttempts: { increment: 1 } },
    });
  }

  private limitIp(ip: string | undefined) {
    if (ip === undefined) return;
    if (!this.limiter.consume(`ip:${ip}`, MAX_PUBLIC_REQUESTS_PER_IP, IP_WINDOW_MS)) {
      throw new ApiException('RATE_LIMITED', 'Too many requests. Try again later.');
    }
  }
}

export interface InviteState {
  expiresAt: Date;
  emailStatus: 'SENT' | 'FAILED' | null;
}
