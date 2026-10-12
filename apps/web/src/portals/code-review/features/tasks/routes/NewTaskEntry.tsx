import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes.ts';
import { useTaskDraft } from '../hooks/useTaskDraft.ts';

/**
 * `/crp/developer/tasks/new` — the "New Review Task" entry point.
 *
 * Clears the wizard store before redirecting to step 1, so this URL always means
 * a NEW task. It used to be a bare `<Navigate>`, which was harmless only while
 * nothing ever loaded an existing task into the store; `TaskDetailPage` now
 * resumes a draft through `hydrate()`, so without this reset the New button
 * would silently reopen whichever task was last edited and PATCH that one.
 *
 * Resumption bypasses this route entirely — it navigates straight to
 * `newTaskStep(...)` with the store already populated.
 *
 * Lives beside the wizard rather than in `app/routeAdapters.tsx`: it is an
 * adapter for one Code Review route and reaches into that feature's own store,
 * so putting it in the shell made `src/app` import a portal for no reason other
 * than where the file happened to sit.
 */
export function NewTaskEntry() {
  const navigate = useNavigate();

  /*
   * In an EFFECT, not in render. `reset()` writes to a Zustand store, and a
   * store write during render invalidates components that have already
   * rendered — the "Cannot update a component while rendering a different
   * component" violation `RootLayout` documents at length. Rendering `null` for
   * one frame is invisible on a redirect.
   */
  useEffect(() => {
    useTaskDraft.getState().reset();
    void navigate(ROUTES.developer.newTaskStep('details'), { replace: true });
  }, [navigate]);

  return null;
}
