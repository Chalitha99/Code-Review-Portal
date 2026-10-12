import { z } from 'zod';

/**
 * Sign-in validation.
 *
 * Framework-free by design (ESLint enforces no React import in `domain/`), so
 * the same rules are unit-testable and could move to the backend unchanged.
 *
 * Messages live here rather than in `content/*.json` because Zod owns the
 * failure path and needs them at schema-definition time. They are the only
 * user-facing strings outside the content layer, and are deliberately generic:
 * "Enter your email address" rather than anything that hints at whether an
 * account exists.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const loginDefaults: LoginInput = {
  email: '',
  password: '',
  remember: true,
};
