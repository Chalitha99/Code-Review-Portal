import { expect } from 'vitest';
import { cleanup, waitFor } from '@testing-library/react';
import { apiStub } from './apiStub.ts';

/**
 * Unmounts, then waits for every write the test left in flight.
 *
 * For suites that drive the autosaving review page: a debounced save that lands
 * after the test would otherwise be counted against the NEXT test. Unmounting
 * first cancels any save that has not started yet.
 */
export async function settleRequests(): Promise<void> {
  cleanup();
  await waitFor(() => {
    expect(apiStub.pendingWrites()).toBe(0);
  });
}
