/**
 * Typed route parameters.
 *
 * `useParams()` returns `Record<string, string | undefined>` by default, which
 * loses every guarantee the route pattern gave us. Declaring the shapes here
 * lets a page write `useParams<TaskRouteParams>()` and get a checked `taskId`.
 */

export interface TaskRouteParams extends Record<string, string | undefined> {
  taskId: string;
}
