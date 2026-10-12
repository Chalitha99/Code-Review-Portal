# Full project structure

A complete listing of every folder and file in the repository, generated from
`git ls-files` (i.e. every file tracked by git) on 2026-09-11. For a narrative
explanation of what each folder is for and why it's organised this way, see
[03-folder-structure.md](./03-folder-structure.md).

Not shown below: `node_modules/` (dependencies, not tracked) and `.husky/`
(git hooks — the directory exists locally but currently has no tracked
contents). `.storybook/` is referenced in some docs but does not exist in the
working tree yet.

The repository was renamed from `FE_Repo_SDP` to `Repo_SDP` to reflect the
planned move to a monorepo holding both frontend and backend code. As of this
listing, no backend code has been added yet — the tree below is still
frontend-only.

```
Repo_SDP/
├── docs/
│   ├── adr/
│   │   ├── 0001-tailwind-design-tokens.md
│   │   ├── 0002-server-and-client-state.md
│   │   ├── 0003-msw-as-the-api-seam.md
│   │   ├── 0004-headless-tables.md
│   │   ├── 0005-framework-free-domain.md
│   │   ├── 0006-administered-checklist.md
│   │   ├── 0007-handover-design.md
│   │   ├── 0008-keyed-remount-not-effects.md
│   │   ├── 0009-charting-library.md
│   │   ├── 0010-soft-delete-and-restore.md
│   │   ├── 0011-row-reordering.md
│   │   ├── 0012-component-tiers-and-the-portal-layer.md
│   │   ├── 0013-single-identity-no-impersonation.md
│   │   ├── 0014-monorepo-shape-and-the-backend-seam.md
│   │   └── README.md
│   ├── frontend/
│   │   ├── developer-workspace-functionality-replan.md
│   │   ├── developer-workspace-guide.md
│   │   ├── migration-correction-report.md
│   │   ├── migration-mapping.md
│   │   ├── migration-report.md
│   │   └── migration-verification-baseline.md
│   ├── 01-getting-started.md
│   ├── 02-architecture.md
│   ├── 03-folder-structure.md
│   ├── 04-coding-standards.md
│   ├── 05-design-patterns.md
│   ├── 06-component-architecture.md
│   ├── 07-design-system.md
│   ├── 08-state-management.md
│   ├── 09-api-architecture.md
│   ├── 10-forms-and-validation.md
│   ├── 11-routing-and-authorization.md
│   ├── 12-accessibility.md
│   ├── 13-testing-strategy.md
│   ├── 14-definition-of-done.md
│   ├── 15-dependency-governance.md
│   ├── 16-mock-api.md
│   ├── 17-performance.md
│   ├── 18-security.md
│   ├── 19-error-handling.md
│   ├── 20-responsive-design.md
│   ├── 21-storybook-standards.md
│   ├── 22-route-modules.md
│   ├── 23-adding-a-new-ui.md
│   ├── 24-test-plan.md
│   └── README.md
├── e2e/
│   ├── screenshots/
│   │   ├── diag.png
│   │   ├── login-desktop-1440.png
│   │   ├── login-laptop-1280.png
│   │   ├── login-mobile-390.png
│   │   └── login-tablet-768.png
│   ├── acceptance.spec.ts
│   ├── accessibility.spec.ts
│   ├── admin.spec.ts
│   ├── developer.spec.ts
│   ├── login.spec.ts
│   ├── mockWorkerRecovery.spec.ts
│   ├── responsive.spec.ts
│   ├── reviewer.spec.ts
│   ├── sessionExpiry.spec.ts
│   ├── settleAnimations.ts
│   └── tabScroll.ts
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── checklist.ts
│   │   │   ├── common.ts
│   │   │   ├── enums.ts
│   │   │   ├── handover.ts
│   │   │   ├── identity.ts
│   │   │   ├── index.ts
│   │   │   ├── notification.ts
│   │   │   ├── primitives.ts
│   │   │   ├── review.ts
│   │   │   ├── task.ts
│   │   │   └── user.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── types/
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── public/
│   ├── logo/
│   │   └── sebsa-logo.svg
│   ├── favicon.svg
│   └── mockServiceWorker.js
├── qa/
│   ├── results/
│   │   ├── .gitkeep
│   │   └── RESULTS-TEMPLATE.md
│   ├── test-cases/
│   │   ├── TC-ADM-workspace.md
│   │   ├── TC-AUTH-auth-and-home.md
│   │   ├── TC-DEV-checklist.md
│   │   ├── TC-DEV-dashboard.md
│   │   ├── TC-DEV-response.md
│   │   ├── TC-DEV-wizard.md
│   │   ├── TC-ENV-environment.md
│   │   ├── TC-HAND-handover.md
│   │   ├── TC-REV-dashboard.md
│   │   ├── TC-REV-history.md
│   │   ├── TC-REV-review.md
│   │   ├── TC-RPT-reports.md
│   │   └── TC-XCUT-cross-cutting.md
│   ├── gap-register.md
│   ├── README.md
│   └── traceability-matrix.md
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppBar.tsx
│   │   ├── AppFooter.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── NotFoundPage.tsx
│   │   ├── providers.tsx
│   │   ├── RequireAuth.tsx
│   │   ├── RequireWorkspace.tsx
│   │   ├── RootLayout.tsx
│   │   ├── routeAdapters.tsx
│   │   ├── routeError.test.tsx
│   │   ├── RouteError.tsx
│   │   ├── router.test.tsx
│   │   ├── routes.tsx
│   │   ├── ScrollRestorationLayout.tsx
│   │   ├── session.ts
│   │   ├── sessionLifecycle.test.tsx
│   │   ├── useSessionReset.ts
│   │   └── useTabScrollPreservation.ts
│   ├── components/
│   │   ├── common/
│   │   │   ├── charts/
│   │   │   │   ├── CategoryBarChart.tsx
│   │   │   │   ├── ChartDataTable.tsx
│   │   │   │   ├── ChartTooltip.tsx
│   │   │   │   ├── chartTooltipPayload.ts
│   │   │   │   ├── DonutChart.tsx
│   │   │   │   ├── MetricBar.tsx
│   │   │   │   └── TrendAreaChart.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── ChoiceDialog.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── DataTable.test.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── dataTableColumns.ts
│   │   │   ├── EmptyIllustration.tsx
│   │   │   ├── ImageDropzone.tsx
│   │   │   ├── ImageGallery.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   ├── layout.stories.tsx
│   │   │   ├── PageContainer.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── Reveal.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── states.stories.tsx
│   │   │   ├── states.tsx
│   │   │   ├── Stepper.tsx
│   │   │   ├── TablePageSize.tsx
│   │   │   └── WorkspaceOutlet.tsx
│   │   └── ui/
│   │       ├── brand/
│   │       │   ├── SebsaLogo.stories.tsx
│   │       │   ├── SebsaLogo.tsx
│   │       │   └── sebsaLogoPaths.ts
│   │       ├── lib/
│   │       │   └── cn.ts
│   │       ├── Alert.tsx
│   │       ├── Button.stories.tsx
│   │       ├── Button.tsx
│   │       ├── buttonVariants.ts
│   │       ├── Card.tsx
│   │       ├── controls.stories.tsx
│   │       ├── controls.tsx
│   │       ├── Dialog.test.tsx
│   │       ├── Dialog.tsx
│   │       ├── Field.stories.tsx
│   │       ├── Field.tsx
│   │       ├── fieldContext.ts
│   │       ├── hoverLift.ts
│   │       ├── index.ts
│   │       ├── SegmentedOptions.tsx
│   │       ├── Select.tsx
│   │       └── Tabs.tsx
│   ├── config/
│   │   ├── env.ts
│   │   ├── routes.ts
│   │   └── workspaceTheme.ts
│   ├── constants/
│   │   ├── index.ts
│   │   ├── portals.ts
│   │   ├── roles.ts
│   │   └── routePaths.ts
│   ├── content/
│   │   ├── a11y.json
│   │   ├── admin.json
│   │   ├── auth.json
│   │   ├── common.json
│   │   ├── home.json
│   │   ├── index.ts
│   │   ├── login.json
│   │   ├── notifications.json
│   │   ├── reviews.json
│   │   └── tasks.json
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api/
│   │   │   │   └── queries.ts
│   │   │   ├── components/
│   │   │   │   ├── Hourglass.tsx
│   │   │   │   ├── SessionExpiredNotice.tsx
│   │   │   │   ├── SessionExpiredScreen.tsx
│   │   │   │   └── UserChip.tsx
│   │   │   ├── domain/
│   │   │   │   └── loginSchema.ts
│   │   │   └── routes/
│   │   │       ├── LoginPage.test.tsx
│   │   │       └── LoginPage.tsx
│   │   ├── home/
│   │   │   ├── api/
│   │   │   │   └── queries.ts
│   │   │   ├── components/
│   │   │   │   └── WorkspaceCard.tsx
│   │   │   └── routes/
│   │   │       ├── HomePage.test.tsx
│   │   │       └── HomePage.tsx
│   │   └── notifications/
│   │       ├── api/
│   │       │   └── queries.ts
│   │       └── components/
│   │           └── NotificationBell.tsx
│   ├── hooks/
│   │   ├── useCurrentUser.ts
│   │   ├── useMediaQuery.ts
│   │   ├── useReveal.ts
│   │   └── useSession.ts
│   ├── lib/
│   │   ├── analyticsTargets.ts
│   │   ├── apiClient.ts
│   │   ├── attachments.test.ts
│   │   ├── attachments.ts
│   │   ├── checklistOrdering.test.ts
│   │   ├── checklistOrdering.ts
│   │   ├── formatters.ts
│   │   ├── kpiBuckets.test.ts
│   │   ├── kpiBuckets.ts
│   │   ├── logger.ts
│   │   ├── permissions.test.ts
│   │   ├── permissions.ts
│   │   ├── queryClient.ts
│   │   ├── reviewStats.test.ts
│   │   ├── reviewStats.ts
│   │   ├── sessionStorage.test.ts
│   │   ├── sessionStorage.ts
│   │   ├── statusMachine.test.ts
│   │   ├── statusMachine.ts
│   │   ├── storedChecklist.test.ts
│   │   ├── storedChecklist.ts
│   │   ├── tabNavigation.test.ts
│   │   └── tabNavigation.ts
│   ├── mocks/
│   │   ├── data/
│   │   │   ├── checklistTemplate.json
│   │   │   ├── credentials.json
│   │   │   ├── customers.json
│   │   │   ├── generalCheck.json
│   │   │   ├── notifications.json
│   │   │   ├── tasks.json
│   │   │   ├── taskTypes.json
│   │   │   └── users.json
│   │   ├── browser.ts
│   │   ├── credentials.test.ts
│   │   ├── db.ts
│   │   ├── handlers.ts
│   │   └── notificationLinks.test.ts
│   ├── portals/
│   │   ├── code-review/
│   │   │   ├── components/
│   │   │   │   ├── charts/
│   │   │   │   │   └── chartPalette.ts
│   │   │   │   ├── badges.stories.tsx
│   │   │   │   ├── badges.tsx
│   │   │   │   ├── cells.tsx
│   │   │   │   ├── checklist.tsx
│   │   │   │   ├── ChecklistSummary.tsx
│   │   │   │   ├── DataTable.stories.tsx
│   │   │   │   ├── ReviewCycleHistory.tsx
│   │   │   │   ├── taskColumns.tsx
│   │   │   │   ├── TaskFilterBar.tsx
│   │   │   │   ├── taskFilters.test.ts
│   │   │   │   └── taskFilters.ts
│   │   │   ├── features/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── checklistAdmin.ts
│   │   │   │   │   │   ├── handovers.ts
│   │   │   │   │   │   └── queries.ts
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── AdminRowActions.tsx
│   │   │   │   │   │   ├── AdminTaskFilterBar.tsx
│   │   │   │   │   │   ├── adminTaskFilters.ts
│   │   │   │   │   │   ├── AssignReviewerDialog.tsx
│   │   │   │   │   │   ├── customerColors.ts
│   │   │   │   │   │   ├── CustomerFormDialog.tsx
│   │   │   │   │   │   ├── NamedRecordDialog.tsx
│   │   │   │   │   │   ├── NamedRecordPanel.tsx
│   │   │   │   │   │   ├── QuestionFormDialog.tsx
│   │   │   │   │   │   ├── QuestionsPanel.tsx
│   │   │   │   │   │   ├── ReassignHandoverDialog.tsx
│   │   │   │   │   │   ├── reportMutationError.ts
│   │   │   │   │   │   └── UserFormDialog.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   ├── useChecklistAdminView.test.ts
│   │   │   │   │   │   └── useChecklistAdminView.ts
│   │   │   │   │   └── routes/
│   │   │   │   │       ├── adminChecklist.test.tsx
│   │   │   │   │       ├── AdminChecklistPage.tsx
│   │   │   │   │       ├── AdminCustomersPage.tsx
│   │   │   │   │       ├── AdminHandoversPage.tsx
│   │   │   │   │       ├── AdminLayout.tsx
│   │   │   │   │       ├── AdminTasksPage.tsx
│   │   │   │   │       ├── AdminUsersPage.tsx
│   │   │   │   │       ├── adminWorkspace.test.tsx
│   │   │   │   │       └── handover.test.tsx
│   │   │   │   ├── reports/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   └── queries.ts
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── ReportBreakdowns.tsx
│   │   │   │   │   │   └── reportPalette.ts
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── reportMetrics.test.ts
│   │   │   │   │   │   └── reportMetrics.ts
│   │   │   │   │   └── routes/
│   │   │   │   │       ├── adminReports.test.tsx
│   │   │   │   │       └── AdminReportsPage.tsx
│   │   │   │   ├── reviews/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   └── queries.ts
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── CodeReviewForm.tsx
│   │   │   │   │   │   └── HandoverDialog.tsx
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── reviewerMetrics.test.ts
│   │   │   │   │   │   ├── reviewerMetrics.ts
│   │   │   │   │   │   ├── reviewRules.test.ts
│   │   │   │   │   │   └── reviewRules.ts
│   │   │   │   │   └── routes/
│   │   │   │   │       ├── reviewerAnalytics.test.tsx
│   │   │   │   │       ├── ReviewerAnalyticsPage.tsx
│   │   │   │   │       ├── ReviewerLayout.tsx
│   │   │   │   │       ├── reviewFormState.test.tsx
│   │   │   │   │       ├── reviewQueue.test.tsx
│   │   │   │   │       ├── ReviewQueuePage.tsx
│   │   │   │   │       └── ReviewTaskPage.tsx
│   │   │   │   └── tasks/
│   │   │   │       ├── api/
│   │   │   │       │   ├── attachments.ts
│   │   │   │       │   └── queries.ts
│   │   │   │       ├── components/
│   │   │   │       │   ├── ReviewFeedbackPanel.tsx
│   │   │   │       │   ├── WizardChecklistStep.tsx
│   │   │   │       │   ├── WizardDetailsStep.tsx
│   │   │   │       │   └── WizardReviewStep.tsx
│   │   │   │       ├── domain/
│   │   │   │       │   ├── checklistRules.test.ts
│   │   │   │       │   ├── checklistRules.ts
│   │   │   │       │   ├── responseRules.test.ts
│   │   │   │       │   ├── responseRules.ts
│   │   │   │       │   ├── taskMetrics.test.ts
│   │   │   │       │   ├── taskMetrics.ts
│   │   │   │       │   ├── taskRules.test.ts
│   │   │   │       │   └── taskRules.ts
│   │   │   │       ├── hooks/
│   │   │   │       │   └── useTaskDraft.ts
│   │   │   │       └── routes/
│   │   │   │           ├── AnalyticsPage.tsx
│   │   │   │           ├── developerAnalytics.test.tsx
│   │   │   │           ├── DeveloperLayout.tsx
│   │   │   │           ├── editTask.test.tsx
│   │   │   │           ├── EditTaskRedirect.tsx
│   │   │   │           ├── myTasks.test.tsx
│   │   │   │           ├── MyTasksPage.tsx
│   │   │   │           ├── NewTaskEntry.tsx
│   │   │   │           ├── newTaskWizard.test.tsx
│   │   │   │           ├── NewTaskWizard.tsx
│   │   │   │           ├── qualityChecklist.qa.test.tsx
│   │   │   │           ├── reviewResponse.test.tsx
│   │   │   │           ├── SubmissionConfirmedPage.tsx
│   │   │   │           ├── taskDetail.qa.test.tsx
│   │   │   │           └── TaskDetailPage.tsx
│   │   │   └── hooks/
│   │   │       ├── useKpiBucket.ts
│   │   │       ├── useReferenceData.ts
│   │   │       ├── useReviews.ts
│   │   │       ├── useTasks.ts
│   │   │       └── useUsers.ts
│   │   ├── delivery/
│   │   │   └── routes/
│   │   │       └── DeliveryComingSoon.tsx
│   │   └── wiki/
│   │       └── routes/
│   │           └── WikiComingSoon.tsx
│   ├── routes/
│   │   ├── codeReviewRoutes.tsx
│   │   ├── index.tsx
│   │   ├── LegacyWorkspaceRedirect.test.tsx
│   │   ├── LegacyWorkspaceRedirect.tsx
│   │   ├── routeHandle.ts
│   │   └── routeParams.ts
│   ├── services/
│   │   └── mockApiService.ts
│   ├── styles/
│   │   ├── base.css
│   │   ├── index.css
│   │   └── Themes.css
│   ├── test/
│   │   ├── accessibility.test.tsx
│   │   ├── axe.ts
│   │   ├── mswServer.ts
│   │   ├── renderWithProviders.tsx
│   │   └── setup.ts
│   ├── types/
│   │   └── index.ts
│   └── main.tsx
├── .gitattributes
├── .gitignore
├── .npmrc
├── .prettierignore
├── .prettierrc.json
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── README.md
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
└── vitest.shims.d.ts
```
