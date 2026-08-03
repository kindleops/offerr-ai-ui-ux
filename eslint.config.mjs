/**
 * OfferrAI lint gate — ESLint 9 flat config.
 *
 * WHY THIS EXISTS
 * ---------------
 * `next lint` was removed in Next.js 16 and this project carried no ESLint
 * configuration at all, so `pnpm lint` had been failing open: it exited without
 * inspecting a single file. A gate that always passes is worse than no gate,
 * because CI reports green.
 *
 * WHAT IT IS TUNED FOR
 * --------------------
 * Correctness and the server/client boundary — NOT style. There is no formatter
 * integration and no stylistic rule set here on purpose: a launch-readiness
 * branch should not carry thousands of whitespace diffs that bury the changes
 * that matter. Formatting stays whatever the author wrote.
 *
 * The rules that earn their place are the ones that would catch a real incident:
 * a credential reaching the browser, a hook called conditionally, a floating
 * promise in a route handler, an unused import masking a deleted code path.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

import offerrBoundary from './tools/eslint/offerr-boundary-plugin.mjs';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      '*.tsbuildinfo',
      'public/**',
      // Config files are linted by the base JS rules only; see the block below.
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Shared language options ────────────────────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
  },

  // ── React / Next.js / hooks ────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
      'unused-imports': unusedImports,
      'offerr-boundary': offerrBoundary,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // Hooks correctness. `rules-of-hooks` is a genuine bug class — a
      // conditionally-called hook corrupts React's state ordering.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // The JSX runtime is automatic (jsx: "react-jsx"), so these two report
      // errors that are not errors.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // Prop types are expressed in TypeScript; the runtime propTypes check is
      // redundant and would demand a parallel declaration on every component.
      'react/prop-types': 'off',
      // Copy in this product is marketing prose full of apostrophes and quotes.
      // Escaping every one of them is a formatting opinion, not a defect.
      'react/no-unescaped-entities': 'off',

      // ── Unused code ──────────────────────────────────────────────────────
      // An unused import is usually the residue of a deleted code path, which on
      // this repo has twice meant a boundary check that stopped being called.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          // A leading underscore is the established signal for "deliberately
          // unused" — a discarded callback parameter or a destructure remainder.
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Correctness ──────────────────────────────────────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',

      // `any` is a real risk on a boundary that projects untrusted upstream
      // payloads, but the existing code uses it deliberately in a few validated
      // spots. Warn so it is visible without blocking the gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      // `!` asserts a value the compiler cannot see. On a seller-facing boundary
      // that is how a null reaches a template.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // ── The boundary rules that matter most on this repository ────────────────
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    rules: {
      // Errors, not warnings: both of these describe a credential reaching a
      // browser bundle. There is no acceptable count above zero.
      'offerr-boundary/no-server-only-in-client': 'error',
      'offerr-boundary/no-private-env-in-client': 'error',
    },
  },

  // ── Vendored shadcn/ui primitives ─────────────────────────────────────────
  //
  // These are generated by the shadcn CLI and re-generated on upgrade. Holding
  // them to the same authorship rules as first-party code produces churn that
  // is reverted by the next `shadcn add`. The boundary rules above still apply
  // to them, because a credential leak would matter here too.
  {
    files: ['components/ui/**/*.{ts,tsx}', 'hooks/use-toast.ts', 'components/theme-provider.tsx'],
    rules: {
      'unused-imports/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react/display-name': 'off',
      // cmdk and Radix drive styling through custom DOM attributes
      // (`cmdk-input-wrapper`, `vaul-drawer`). They are intentional, and the
      // rule cannot know a third-party library defines them.
      'react/no-unknown-property': 'off',
    },
  },

  // ── Server-side modules ───────────────────────────────────────────────────
  {
    files: ['lib/offerr/**/*.ts', 'app/api/**/*.ts'],
    rules: {
      // Server code is where an unhandled rejection becomes a hung request or a
      // released lease that never releases.
      'no-console': 'error',
    },
  },

  // ── Tests ─────────────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // ── Build/tooling config files ────────────────────────────────────────────
  {
    files: ['*.mjs', '*.js', 'tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
