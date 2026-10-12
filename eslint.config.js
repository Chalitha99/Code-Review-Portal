import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import boundaries from 'eslint-plugin-boundaries';
import storybook from 'eslint-plugin-storybook';
import prettier from 'eslint-config-prettier';

/**
 * SDP lint policy.
 *
 * These rules are not style preferences. Each one encodes an architectural
 * decision so that violations fail CI instead of surviving review:
 *
 *   - `domain/` stays framework-free, so the rules stay portable to the
 *     Phase 2 backend
 *   - features never reach into each other's internals
 *   - the app shell never imports a portal, which is what lets Delivery and
 *     Wiki be built without depending on Code Review
 *   - no `dangerouslySetInnerHTML`, because reviewer findings are untrusted
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.nx/**',
      '**/*.config.js',
      '**/*.config.mjs',
      // Plain Node tooling for the e2e database/server, checked by `// @ts-check`
      // like the *.config.mjs files above; not part of any tsconfig.
      'apps/api/scripts/*.mjs',
    ],
  },

  /* ------------------------------------------------------------------ base */
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* `any` defeats the point of the strict tsconfig, so make it an error. */
      '@typescript-eslint/no-explicit-any': 'error',

      /* Unused vars are errors, but an `_` prefix is the documented opt-out. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      /* Keeps `import type` explicit, which `verbatimModuleSyntax` requires. */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      /* Floating promises silently swallow mutation failures. */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      /* Prefer `??` and `?.` over truthiness checks that mis-handle 0 and ''.
         Review cycle 0 and an empty CRIM ID are both meaningful values here. */
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use a `const` array plus a union type instead of `enum`. Enums do not tree-shake and are disallowed under erasableSyntaxOnly. See @sdp/contracts/enums.ts.',
        },
      ],
    },
  },

  /* --------------------------------------------------- React application */
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      /* Reviewer findings and uploaded filenames are untrusted. */
      'no-restricted-properties': [
        'error',
        {
          property: 'dangerouslySetInnerHTML',
          message:
            'Untrusted content (review findings, filenames, remarks) is rendered throughout this app. Render it as text.',
        },
      ],

      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use a `const` array plus a union type instead of `enum`. See @sdp/contracts/enums.ts.',
        },
        {
          /**
           * `bg-[--color-x]` is Tailwind v3 syntax. Under v4 it compiles to
           * `background-color: --color-x`, which is not a valid CSS value, so
           * the browser drops the declaration and the element renders
           * unstyled. Nothing else catches this: typecheck, lint and build all
           * pass. This repo shipped exactly that class of bug — six gradient
           * utilities pointing at custom properties that were never declared.
           */
          selector:
            'Literal[value=/(^|\\s)-?(bg|text|border|fill|stroke|shadow|rounded|font|ring|outline|divide|accent|caret|from|via|to)-\\[--/]',
          message:
            'Tailwind v4: `utility-[--css-var]` compiles to invalid CSS and is silently dropped. Use the token utility generated from @theme (for example `bg-status-approved-surface`), or `utility-(--css-var)` for a genuine one-off.',
        },
      ],
    },
  },

  /* ------------------------------------------ architecture: layer boundaries */
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['apps/web/src/**/*'],

      /**
       * Every `boundaries/elements` pattern below is a plain string matched
       * against the file path, and by default the plugin resolves that path
       * relative to `process.cwd()` — NOT to this config file's directory.
       * Run `eslint .` from anywhere but the repo root (e.g. from apps/web,
       * which `npx eslint --print-config` and IDE tooling both do) and every
       * pattern stops matching, every file goes unclassified, and
       * `boundaries/dependencies` silently allows everything. Pinning an
       * absolute root here is what makes the architecture gate invocation-
       * directory independent instead of quietly vacuous.
       */
      'boundaries/root-path': import.meta.dirname,

      /**
       * REQUIRED, and easy to miss. Without a resolver the plugin parses
       * `@/features/...` as an external scoped npm package named `@/features`,
       * leaves the target element unclassified, and silently matches no policy
       * — so every rule below passes and the architecture is unenforced while
       * lint stays green.
       *
       * Verified with deliberate cross-boundary probes — do not assume a silent
       * lint run means these rules are working.
       */
      'import/resolver': {
        typescript: { project: 'apps/web/tsconfig.app.json' },
      },

      /**
       * Order matters: the plugin takes the FIRST matching pattern, so the
       * portal sub-elements must precede the generic portal patterns, and
       * `components/ui` and `components/common` must precede nothing else that
       * would swallow them.
       */
      'boundaries/elements': [
        { type: 'app', pattern: 'apps/web/src/app' },
        { type: 'routes', pattern: 'apps/web/src/routes' },

        // Application-wide features: auth, home, notifications. Not owned by a
        // portal, because /login sits outside /crp and Home is the picker.
        { type: 'feature', pattern: 'apps/web/src/features/*', capture: ['featureName'] },

        // Portal internals, most specific first.
        {
          type: 'portal-feature',
          pattern: 'apps/web/src/portals/*/features/*',
          capture: ['portalName', 'featureName'],
        },
        {
          type: 'portal-shared',
          pattern: 'apps/web/src/portals/*/components',
          capture: ['portalName'],
        },
        {
          type: 'portal-hooks',
          pattern: 'apps/web/src/portals/*/hooks',
          capture: ['portalName'],
        },
        {
          type: 'portal-routes',
          pattern: 'apps/web/src/portals/*/routes',
          capture: ['portalName'],
        },

        // Component tiers.
        { type: 'ui', pattern: 'apps/web/src/components/ui' },
        { type: 'common', pattern: 'apps/web/src/components/common' },

        { type: 'hooks', pattern: 'apps/web/src/hooks' },
        { type: 'lib', pattern: 'apps/web/src/lib' },
        { type: 'config', pattern: 'apps/web/src/config' },
        { type: 'constants', pattern: 'apps/web/src/constants' },
        { type: 'content', pattern: 'apps/web/src/content' },
        { type: 'types', pattern: 'apps/web/src/types' },
        { type: 'mocks', pattern: 'apps/web/src/mocks' },
        { type: 'services', pattern: 'apps/web/src/services' },
        { type: 'test', pattern: 'apps/web/src/test' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          message: '{{from.type}} is not allowed to import {{to.type}}',
          policies: [
            {
              /*
               * The app shell wires everything together.
               *
               * It may NOT import a portal. That is the rule which lets
               * Delivery and Wiki exist without depending on Code Review, and
               * it is why auth, home and notifications are app-wide features
               * rather than portal ones. The single remaining exception carries
               * an inline disable and an explanation.
               */
              from: { element: { type: 'app' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'app',
                        // `App.tsx` renders <RouterProvider router={router}>.
                        // The router lives in src/routes only so that the file
                        // exporting it holds nothing else, which is what Fast
                        // Refresh needs; shell and router are one composition
                        // root split across two folders.
                        'routes',
                        'feature',
                        'common',
                        'ui',
                        'hooks',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                        'mocks',
                      ],
                    },
                  },
                },
              },
            },
            {
              /* The router is the one place allowed to name every portal. */
              from: { element: { type: 'routes' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'routes',
                        'app',
                        'feature',
                        'portal-feature',
                        'portal-routes',
                        'portal-shared',
                        'common',
                        'ui',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                      ],
                    },
                  },
                },
              },
            },
            {
              /* An app-wide feature may use shared code, never a sibling feature
                 and never a portal. */
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'common',
                        'ui',
                        'hooks',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                        'services',
                      ],
                    },
                  },
                },
              },
            },
            {
              /* ...and its own internals. */
              from: { element: { type: 'feature' } },
              allow: {
                to: {
                  element: {
                    type: 'feature',
                    captured: { featureName: '{{from.captured.featureName}}' },
                  },
                },
              },
            },
            {
              /* A portal feature may use shared code and app-wide features. */
              from: { element: { type: 'portal-feature' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'feature',
                        'common',
                        'ui',
                        'hooks',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                        'services',
                      ],
                    },
                  },
                },
              },
            },
            {
              /* ...its own internals, and its own portal's shared layers. */
              from: { element: { type: 'portal-feature' } },
              allow: {
                to: {
                  element: {
                    type: 'portal-feature',
                    captured: {
                      portalName: '{{from.captured.portalName}}',
                      featureName: '{{from.captured.featureName}}',
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'portal-feature' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['portal-shared', 'portal-hooks'] },
                    captured: { portalName: '{{from.captured.portalName}}' },
                  },
                },
              },
            },
            {
              /* Portal-shared components carry that portal's domain vocabulary,
                 so they may not reach into its features. */
              from: { element: { type: 'portal-shared' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'common',
                        'ui',
                        'hooks',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'portal-shared' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['portal-shared', 'portal-hooks'] },
                    captured: { portalName: '{{from.captured.portalName}}' },
                  },
                },
              },
            },
            {
              from: { element: { type: 'portal-hooks' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['hooks', 'lib', 'config', 'constants', 'types'] },
                  },
                },
              },
            },
            {
              from: { element: { type: 'portal-hooks' } },
              allow: {
                to: {
                  element: {
                    type: 'portal-hooks',
                    captured: { portalName: '{{from.captured.portalName}}' },
                  },
                },
              },
            },
            {
              from: { element: { type: 'portal-routes' } },
              allow: {
                to: {
                  element: {
                    types: [
                      'common',
                      'ui',
                      'lib',
                      'config',
                      'constants',
                      'content',
                      'types',
                      'portal-shared',
                    ],
                  },
                },
              },
            },
            {
              /* Tier 2 is app-aware but portal-agnostic. If it needs a portal or
                 a feature, it is not tier 2. */
              from: { element: { type: 'common' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'common',
                        'ui',
                        'hooks',
                        'lib',
                        'config',
                        'constants',
                        'content',
                        'types',
                      ],
                    },
                  },
                },
              },
            },
            {
              /* Tier 1 knows React and its own helpers. `content` and
                 `lib/tabNavigation` are the two documented exceptions, carried
                 over from the source project. */
              from: { element: { type: 'ui' } },
              allow: {
                to: { element: { types: { anyOf: ['ui', 'lib', 'content', 'types'] } } },
              },
            },
            {
              from: { element: { type: 'hooks' } },
              allow: {
                to: {
                  element: { types: { anyOf: ['hooks', 'lib', 'config', 'constants', 'types'] } },
                },
              },
            },
            {
              from: { element: { type: 'lib' } },
              allow: {
                to: { element: { types: { anyOf: ['lib', 'config', 'constants', 'types'] } } },
              },
            },
            {
              from: { element: { type: 'config' } },
              allow: {
                to: { element: { types: { anyOf: ['config', 'constants', 'content', 'types'] } } },
              },
            },
            {
              from: { element: { type: 'constants' } },
              allow: {
                to: { element: { types: { anyOf: ['constants', 'content', 'types'] } } },
              },
            },
            {
              from: { element: { type: 'content' } },
              allow: { to: { element: { types: { anyOf: ['content', 'types'] } } } },
            },
            {
              from: { element: { type: 'types' } },
              allow: { to: { element: { type: 'types' } } },
            },
            {
              /* Mocks may read domain types and feature schemas to stay in sync. */
              from: { element: { type: 'mocks' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'mocks',
                        'lib',
                        'config',
                        'constants',
                        'types',
                        'feature',
                        'portal-feature',
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'services' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['services', 'lib', 'config', 'constants', 'types'] },
                  },
                },
              },
            },
            {
              /* Test setup is infrastructure and sits outside the layer graph. */
              from: { element: { type: 'test' } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ['test', 'lib', 'config', 'constants', 'types', 'mocks'] },
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },

  /* ------------------- architecture: domain layer must stay framework-free */
  {
    /**
     * taskRules / checklistRules / reviewRules are the single source of truth
     * shared by every flow that needs them. The moment one imports React it
     * stops being portable to the Phase 2 backend and the flows drift.
     */
    files: ['apps/web/src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'domain/ must stay framework-free so every flow and the backend can share these rules. Move UI concerns to hooks/ or components/.',
            },
            { name: 'react-dom', message: 'domain/ must stay framework-free.' },
            {
              name: 'react-router-dom',
              message: 'domain/ must stay framework-free. Navigation belongs in routes/.',
            },
            {
              name: 'zustand',
              message: 'domain/ must be pure functions. State lives in hooks/.',
            },
          ],
          patterns: [
            {
              group: ['@/components/*', '@/portals/*/components/*', '@/features/*/components/*'],
              message: 'domain/ must not depend on components.',
            },
          ],
        },
      ],
    },
  },

  /* ------------------------------------------------------------ test files */
  {
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      'apps/web/src/test/**/*.{ts,tsx}',
      '**/*.stories.tsx',
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',

      /**
       * Tests sit outside the layer graph by design: a feature test needs the
       * render harness and the MSW server, which are neither shared UI nor lib.
       * Exempting test FILES specifically keeps the production policy strict —
       * widening the policies would have let shipped code import test helpers.
       */
      'boundaries/dependencies': 'off',
    },
  },

  /* --------------------------------------------------------------- stories */
  ...storybook.configs['flat/recommended'],

  /* ----------------------------------------- node-side config/tooling files */
  {
    /**
     * These live in `tsconfig.node.json`, which `projectService` does not
     * discover because it only looks for files literally named `tsconfig.json`.
     * Point the parser at it explicitly so these files still get type-aware
     * linting instead of dropping out of the sweep.
     */
    files: [
      'apps/web/vite.config.ts',
      'apps/web/vitest.config.ts',
      'apps/web-e2e/playwright.config.ts',
      'apps/web-e2e/tests/**/*.ts',
      'apps/web/.storybook/*.ts',
      'apps/api/vitest.e2e.config.ts',
      'apps/api/vitest.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: false,
        project: ['./tsconfig.node.json', './apps/web-e2e/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Storybook's own config types are declared as `type`, and our objects
      // must match them structurally.
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },

  /* ------------------------------------------------------------- apps/api */
  {
    /**
     * `apps/api/tsconfig.json` is a bare solution file (`files: [],
     * references: [...]`), same shape as apps/web/tsconfig.json - pointed at
     * explicitly rather than trusted to `projectService`'s reference-
     * following, matching the same caution taken for apps/web-e2e above.
     */
    files: ['apps/api/src/**/*.ts', 'apps/api/test/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: false,
        project: ['./apps/api/tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /**
       * apps/api/tsconfig.app.json turns `verbatimModuleSyntax` off for
       * exactly this reason: Nest's DI reads each constructor parameter's
       * runtime type via `emitDecoratorMetadata`, and this rule would rewrite
       * a constructor-only class reference into `import type`, silently
       * stripping the runtime import that metadata needs - a DI failure at
       * startup, not a style issue. Targeted override, not a weakening; every
       * other project keeps the rule.
       */
      '@typescript-eslint/consistent-type-imports': 'off',

      /**
       * The workspace-wide enum ban (`no-restricted-syntax` in the base
       * rules block) exists because `erasableSyntaxOnly` forbids enums
       * everywhere else. apps/api turns `erasableSyntaxOnly` off for the
       * same DI reasons above, so the ban no longer applies here.
       */
      'no-restricted-syntax': 'off',
    },
  },

  /* Must be last: switches off every rule that would fight Prettier. */
  prettier,
);
