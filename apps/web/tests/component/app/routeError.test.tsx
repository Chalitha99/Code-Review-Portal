import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { signInForTest } from '@tests/support/setup.ts';
import { writeSession } from '@/lib/sessionStorage.ts';
import { RouteError } from '@/app/RouteError.tsx';

/**
 * The route-level error boundary.
 *
 * Worth its own tests because the boundary is what a user sees when everything
 * else has already gone wrong, and the action it offers has to be one that can
 * actually recover. It previously offered only "Back to Dashboard" — a
 * client-side navigation — while the copy claimed a retry was available.
 */

/** Mounts `RouteError` for real, as the `errorElement` of a route that throws. */
function renderThrowing(message: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Boom message={message} />,
        errorElement: <RouteError />,
      },
    ],
    { initialEntries: ['/'] },
  );

  return {
    ...render(<RouterProvider router={router} />),
    user: userEvent.setup({ delay: null }),
  };
}

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  /*
   * A LIVE session envelope, not just `signInForTest()`.
   *
   * The boundary asks `readSession()` first and renders the session-expired
   * screen when it is null — correct behaviour, and not what these tests are
   * about. `signInForTest` sets the store and the mock user id but writes no
   * envelope, so without this every assertion below reads the wrong screen.
   */
  signInForTest();
  writeSession('u-charith', false);
  // The component logs the error for a developer; that is deliberate, and the
  // noise would otherwise bury the real assertion output.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('RouteError', () => {
  it('offers a reload, because the copy promises one', () => {
    renderThrowing('something exploded');

    expect(screen.getByText(/this page ran into a problem/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload the page/i })).toBeInTheDocument();
    // Kept, but secondary — it is still the right action for a genuine app bug.
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('reloads the document rather than navigating', async () => {
    /*
     * The distinction this whole change rests on.
     *
     * Every screen below the shell is a `React.lazy` chunk, so the commonest way
     * to reach this boundary is a dynamic import that failed. A router
     * navigation re-requests the same module from the same broken graph and
     * fails again; only refetching the document can recover.
     */
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    const { user } = renderThrowing('something exploded');
    await user.click(screen.getByRole('button', { name: /reload the page/i }));

    expect(reload).toHaveBeenCalledOnce();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    });
  });

  it('names a failed chunk for what it is', () => {
    // Vite, the browser and the built bundle each word this differently, so the
    // check is on the message. "This page ran into a problem" is true but
    // unhelpful when the real answer is "your tab is stale, reload".
    renderThrowing('Failed to fetch dynamically imported module: /assets/AnalyticsPage-abc.js');

    expect(screen.getByText(/could not finish loading/i)).toBeInTheDocument();
    expect(screen.getByText(/reloading fetches the current version/i)).toBeInTheDocument();
  });

  it('treats an ordinary error as an ordinary error', () => {
    renderThrowing('Cannot read properties of undefined');

    expect(screen.getByText(/this page ran into a problem/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not finish loading/i)).toBeNull();
  });
});
