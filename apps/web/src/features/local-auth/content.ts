import loginContent from '@/content/login.json';

/**
 * Every string the local-auth screens show, in one file so the copy can be read
 * and changed without opening a component.
 */

export const TIPS = [
  'Use 12 or more characters',
  'Mix upper and lower case, numbers and symbols',
  'Do not reuse a password from another site',
] as const;

export const setPasswordCopy = {
  INVITE: {
    title: 'Create your password',
    leftHeading: 'Welcome to the Service Delivery Portal',
    leftText: 'Your administrator has set up your account. Choose a password to activate it.',
    button: 'Save password',
    successTitle: 'Password saved',
  },
  RESET: {
    title: 'Choose a new password',
    leftHeading: 'Reset your password',
    leftText: 'Choose a new password for your Service Delivery Portal account.',
    button: 'Save password',
    successTitle: 'Password saved',
  },
} as const;

export const setPassword = {
  checkingTitle: 'Checking your link',
  checkingText: 'One moment while we check your link.',
  expiryNote: 'This link works once and expires on {expiresAt}.',
  newPassword: 'New password',
  confirmPassword: 'Confirm password',
  show: 'Show password',
  hide: 'Hide password',
  rulesHeading: 'Password requirements',
  strength: 'Password strength',
  maxReached: 'Passwords can be up to 128 characters.',
  successText: 'Taking you to sign in...',
  successAction: 'Go to sign in',
  validateFailed: "We couldn't check your link. Check your connection and try again.",
  retry: 'Try again',
  errors: {
    PASSWORD_POLICY: "Your password doesn't meet all the rules yet.",
    PASSWORD_PERSONAL:
      "Choose a password that doesn't include your name or email, and isn't a common one.",
    RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
    GENERIC: "We couldn't save your password. Check your connection and try again.",
  },
} as const;

export const forgot = {
  title: 'Forgot your password?',
  leftHeading: 'Reset it in three steps',
  steps: ['Verify your email', 'Open the link we send you', 'Choose a new password'],
  subtitle: 'Enter your work email and we will send you a link to choose a new password.',
  emailLabel: 'Email',
  emailPlaceholder: loginContent.form.emailPlaceholder,
  submit: 'Verify email',
  submitting: 'Verifying…',
  back: 'Back to sign in',
  emailRequired: 'Enter your email address',
  emailInvalid: 'Enter a valid email address, for example name@company.com',
  emailTooLong: 'Email must be 254 characters or fewer',
  sentTitle: 'Check your inbox',
  sentText:
    'If this email belongs to an SDP account, we have sent a link. Check your spam folder too.',
  sentTextWithDuration:
    'If this email belongs to an SDP account, we have sent a link. It is valid for {duration}. Check your spam folder too.',
  differentEmail: 'Use a different email',
  sendAgain: 'Send again',
  sendAgainIn: 'Send again in {seconds}s',
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  failed: "We couldn't send that request. Check your connection and try again.",
} as const;

export const expired = {
  title: 'Link expired',
  leftHeading: 'Links expire to keep your account safe',
  leftText: 'Each link works once, and only the newest email counts.',
  badgeExpired: 'Link expired',
  badgeInvalid: 'Link unavailable',
  expiredTitle: 'This link has expired',
  expiredText:
    'For your security, this link was only valid for {duration}. We can send you a new one.',
  expiredTextNoDuration: 'For your security, this link has expired. We can send you a new one.',
  invalidTitle: "This link can't be used",
  invalidText:
    'It may have been used already, or replaced by a newer email. Sign in, or request a new password link.',
  send: 'Send me a new link',
  sending: 'Sending…',
  sentAgainIn: 'Send again in {seconds}s',
  sent: 'A new link is on its way to your inbox. It can take a minute to arrive.',
  failed: "We couldn't send a new link. Check your connection and try again.",
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  requestNew: 'Request a new link',
  back: 'Back to sign in',
  goToSignIn: 'Go to sign in',
  forgot: 'Forgot password',
} as const;

/** Users tab: the Invite column and the Resend / Revoke row actions. */
export const invite = {
  resent: 'Invite sent again to {email}. Valid until {expiresAt}.',
  resentEmailFailed:
    'The invite is renewed, but the email could not be sent. Try Resend invite again.',
  revoked: 'Invite for {email} revoked.',
  generic: "We couldn't complete that. Please try again.",
  status: { INVITED: 'Invited', ACTIVE: 'Active', DEACTIVATED: 'Deactivated' },
  expiresIn: 'Expires in {hours} h',
  expiresInUnderHour: 'Expires in under 1 h',
  expiredPill: 'Expired',
  emailFailed: 'Email failed',
  resendAction: 'Resend invite for {name}',
  revokeAction: 'Revoke invite for {name}',
  revokeTitle: 'Revoke this invite?',
  revokeText:
    "{name} won't be able to use the link they were sent. You can invite them again later.",
  revokeConfirm: 'Revoke invite',
  notInvited: 'This user is no longer in the invited state.',
  resetAction: 'Send a password reset link to {name}',
  resetSent: 'Password reset link sent to {email}.',
  resetEmailFailed: 'The reset link was created, but the email could not be sent. Try again.',
  notActive: 'Only an active account can get a reset link.',
  rateLimited: 'Please wait a moment before resending.',
} as const;
