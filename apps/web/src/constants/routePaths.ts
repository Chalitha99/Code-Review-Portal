/**
 * Every route path in the application, in one file.
 *
 * Paths are kept out of the routing implementation on purpose: `src/routes/`
 * declares *structure*, this file declares *addresses*. A component that needs
 * to link somewhere imports from here and never writes a path literal.
 *
 * `SEGMENTS` is the single source of truth. The absolute `routePaths` used for
 * links and the relative segments used by the router are both derived from it,
 * so the two can never drift apart — which is the failure mode that previously
 * left three navigation cards pointing at unmounted routes.
 */

/** Path segments, as the router nests them. */
export const SEGMENTS = {
  crp: 'crp',
  delivery: 'delivery',
  wiki: 'wiki',

  developer: 'developer',
  reviewer: 'reviewer',
  admin: 'admin',

  tasks: 'tasks',
  new: 'new',
  edit: 'edit',
  confirmed: 'confirmed',
  analytics: 'analytics',
  myTasks: 'my-tasks',
  history: 'history',
  users: 'users',
  customers: 'customers',
  checklist: 'checklist',
  handovers: 'handovers',
  handover: 'handover',
  reports: 'reports',
  activity: 'activity',
  login: 'login',
  setPassword: 'set-password',
  forgotPassword: 'forgot-password',
  linkExpired: 'link-expired',
} as const;

const CRP = `/${SEGMENTS.crp}` as const;

/**
 * Absolute paths. Builder functions take the values a dynamic segment needs, so
 */
export const routePaths = {
  /**
   * The Service Delivery Portal root.
   */
  root: '/',

  /** Unauthenticated entry point. Sits outside the app shell — no app bar. */
  login: `/${SEGMENTS.login}`,

  /**
   * Guest-only screens of the temporary local sign-in, beside `login`. The
   * set-password link carries its one-time token in the fragment
   * (`#token=...`), never in the path or query, so it is not built here.
   */
  setPassword: `/${SEGMENTS.setPassword}`,
  forgotPassword: `/${SEGMENTS.forgotPassword}`,
  linkExpired: `/${SEGMENTS.linkExpired}`,

  crp: {
    /**
     * The Code Review Portal's own workspace
     */
    home: CRP,
    root: CRP,

    developer: {
      dashboard: `${CRP}/${SEGMENTS.developer}`,
      analytics: `${CRP}/${SEGMENTS.developer}/${SEGMENTS.analytics}`,
      newTask: `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${SEGMENTS.new}`,
      newTaskStep: (step: string) =>
        `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${SEGMENTS.new}/${encodeURIComponent(step)}`,
      task: (taskId: string) =>
        `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}`,
      editTask: (taskId: string) =>
        `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}/${SEGMENTS.edit}`,
      editTaskStep: (taskId: string, step: string) =>
        `${CRP}/${SEGMENTS.developer}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}/${SEGMENTS.edit}/${encodeURIComponent(step)}`,
    },

    reviewer: {
      dashboard: `${CRP}/${SEGMENTS.reviewer}`,
      myTasks: `${CRP}/${SEGMENTS.reviewer}/${SEGMENTS.myTasks}`,
      history: `${CRP}/${SEGMENTS.reviewer}/${SEGMENTS.history}`,
      analytics: `${CRP}/${SEGMENTS.reviewer}/${SEGMENTS.analytics}`,
      task: (taskId: string) =>
        `${CRP}/${SEGMENTS.reviewer}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}`,
    },

    admin: {
      dashboard: `${CRP}/${SEGMENTS.admin}`,
      users: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.users}`,
      customers: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.customers}`,
      checklist: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.checklist}`,
      handovers: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.handovers}`,
      task: (taskId: string) =>
        `${CRP}/${SEGMENTS.admin}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}`,
      handover: (handoverId: string) =>
        `${CRP}/${SEGMENTS.admin}/${SEGMENTS.handovers}/${encodeURIComponent(handoverId)}`,
      handoverTask: (taskId: string) =>
        `${CRP}/${SEGMENTS.admin}/${SEGMENTS.tasks}/${encodeURIComponent(taskId)}/${SEGMENTS.handover}`,
      reports: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.reports}`,
      activity: `${CRP}/${SEGMENTS.admin}/${SEGMENTS.activity}`,
    },
  },

  delivery: {
    /**
     * The Delivery Portal's own workspace - Phase 2
     */
    root: `/${SEGMENTS.delivery}`,
  },

  wiki: {
    /**
     * The Wiki Portal's own workspace - Phase 3
     */
    root: `/${SEGMENTS.wiki}`,
  },
} as const;

/**
 * The router mounts children relative to their parent.
 */
export const relativePaths = {
  crp: {
    developer: SEGMENTS.developer,
    reviewer: SEGMENTS.reviewer,
    admin: SEGMENTS.admin,
  },
} as const;

export type RoutePaths = typeof routePaths;
