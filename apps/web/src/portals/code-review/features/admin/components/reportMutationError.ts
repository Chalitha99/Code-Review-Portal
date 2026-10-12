import { toast } from 'sonner';
import { ApiError } from '@/lib/apiClient.ts';
import common from '@/content/common.json';

/**
 * The standard failure toast for an admin mutation.
 *
 * The server's own message is shown when it sent one — "This customer has tasks.
 * Deactivate them instead." tells the admin what to do next, where a generic
 * "Something went wrong" would not. Anything else (a network drop, a 502) falls
 * back to the shared message, because those carry nothing worth showing.
 *
 * Its own module rather than an export from a component file, so React Fast
 * Refresh can still hot-reload the panels that use it.
 */
export function reportMutationError(cause: unknown): void {
  toast.error(cause instanceof ApiError ? cause.message : common.errors.generic);
}
