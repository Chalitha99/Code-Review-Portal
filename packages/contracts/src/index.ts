/**
 * @sdp/contracts — the shared domain vocabulary for the Service Delivery Portal.
 *
 * Zod schemas are the source of truth; TypeScript types are inferred from them.
 * One definition validates API responses in MSW (Phase 1), validates request
 * bodies in NestJS (Phase 2), and types every component in between — so a
 * contract change cannot silently pass through one layer and break another.
 */
export * from './common.js';
export * from './enums.js';
export * from './identity.js';
export * from './task.js';
export * from './checklist.js';
export * from './review.js';
export * from './handover.js';
export * from './notification.js';
export * from './audit.js';
export * from './systemAudit.js';
export * from './passwordPolicy.js';
