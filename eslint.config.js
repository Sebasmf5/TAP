import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/storage/**',
      'apps/api/drizzle/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['apps/api/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}', 'packages/contracts/src/**/*.ts'],
    plugins: {
      boundaries,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: [
            './apps/api/tsconfig.json',
            './apps/web/tsconfig.json',
            './packages/contracts/tsconfig.json',
          ],
        },
      },
      'boundaries/include': [
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
        'packages/contracts/src/**/*.ts',
      ],
      'boundaries/elements': [
        {
          type: 'contracts',
          pattern: 'packages/contracts/src',
        },
        {
          type: 'api-app',
          pattern: 'apps/api/src/app',
        },
        {
          type: 'api-shared',
          pattern: 'apps/api/src/shared',
        },
        {
          type: 'api-module-domain',
          pattern: 'apps/api/src/modules/*/domain',
          capture: ['module'],
        },
        {
          type: 'api-module-application',
          pattern: 'apps/api/src/modules/*/application',
          capture: ['module'],
        },
        {
          type: 'api-module-infrastructure',
          pattern: 'apps/api/src/modules/*/infrastructure',
          capture: ['module'],
        },
        {
          type: 'api-module-http',
          pattern: 'apps/api/src/modules/*/http',
          capture: ['module'],
        },
        {
          type: 'api-module',
          pattern: 'apps/api/src/modules/*',
          capture: ['module'],
        },
        {
          type: 'api-root',
          pattern: 'apps/api/src',
        },
        {
          type: 'web-app',
          pattern: 'apps/web/src/app',
        },
        {
          type: 'web-shared',
          pattern: 'apps/web/src/shared',
        },
        {
          type: 'web-feature',
          pattern: 'apps/web/src/features/*',
          capture: ['feature'],
        },
        {
          type: 'web-root',
          pattern: 'apps/web/src',
        },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'api-module-domain' } },
              disallow: {
                to: {
                  module: {
                    origin: 'external',
                    source: [
                      'fastify',
                      '@fastify/*',
                      'fastify-type-provider-zod',
                      'drizzle-orm',
                      'drizzle-orm/*',
                      'pg',
                      'pg-boss',
                      'pino',
                    ],
                  },
                },
              },
              message:
                'La capa domain no puede importar infraestructura (Fastify, Drizzle, pg, pg-boss, pino).',
            },
            {
              from: { element: { type: 'contracts' } },
              allow: { to: { element: { type: 'contracts' } } },
            },
            {
              from: { element: { type: 'api-shared' } },
              allow: { to: { element: { type: ['api-shared', 'contracts'] } } },
            },
            {
              from: { element: { type: 'api-module-domain' } },
              allow: [
                {
                  to: {
                    element: {
                      type: 'api-module-domain',
                      captured: { module: '{{ from.element.captured.module }}' },
                    },
                  },
                },
                { to: { element: { type: ['api-shared', 'contracts'] } } },
              ],
            },
            {
              from: { element: { type: 'api-module-application' } },
              allow: [
                {
                  to: {
                    element: {
                      type: ['api-module-domain', 'api-module-application'],
                      captured: { module: '{{ from.element.captured.module }}' },
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'api-module',
                      fileInternalPath: 'index.ts',
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: ['api-shared', 'contracts'],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'api-module-infrastructure' } },
              allow: [
                {
                  to: {
                    element: {
                      type: [
                        'api-module-domain',
                        'api-module-application',
                        'api-module-infrastructure',
                      ],
                      captured: { module: '{{ from.element.captured.module }}' },
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'api-module',
                      fileInternalPath: 'index.ts',
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: ['api-shared', 'contracts'],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'api-module-http' } },
              allow: [
                {
                  to: {
                    element: {
                      type: ['api-module-domain', 'api-module-application', 'api-module-http'],
                      captured: { module: '{{ from.element.captured.module }}' },
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'api-module',
                      fileInternalPath: 'index.ts',
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: ['api-shared', 'contracts'],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'api-module', fileInternalPath: 'index.ts' } },
              allow: [
                {
                  to: {
                    element: {
                      type: [
                        'api-module-domain',
                        'api-module-application',
                        'api-module-infrastructure',
                        'api-module-http',
                        'api-module',
                      ],
                      captured: { module: '{{ from.element.captured.module }}' },
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'api-module',
                      fileInternalPath: 'index.ts',
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: ['api-shared', 'contracts'],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: ['api-app', 'api-root'] } },
              allow: [
                {
                  to: {
                    element: {
                      type: ['api-app', 'api-shared', 'contracts'],
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'api-module',
                      fileInternalPath: 'index.ts',
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: 'web-shared' } },
              allow: { to: { element: { type: ['web-shared', 'contracts'] } } },
            },
            {
              from: { element: { type: 'web-feature' } },
              allow: [
                {
                  to: {
                    element: {
                      type: 'web-feature',
                      captured: { feature: '{{ from.element.captured.feature }}' },
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'web-feature',
                      fileInternalPath: 'index.{ts,tsx}',
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: ['web-shared', 'contracts'],
                    },
                  },
                },
              ],
            },
            {
              from: { element: { type: ['web-app', 'web-root'] } },
              allow: [
                {
                  to: {
                    element: {
                      type: ['web-app', 'web-shared', 'contracts'],
                    },
                  },
                },
                {
                  to: {
                    element: {
                      type: 'web-feature',
                      fileInternalPath: 'index.{ts,tsx}',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
);
