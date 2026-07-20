import { builtinModules } from 'node:module';
import packageJson from '../../package.json' with { type: 'json' };

// Dynamic blocklist (P3-1, story-maint-29): a static list of runtime deps went
// stale the moment a new one was added without a matching lint-config edit —
// the probe that found this story's #241 missed 6 of today's deps that way.
// Deriving the blocklist from package.json + node:module's own builtin list
// means a newly-added dependency (or a Node builtin spelled without the
// `node:` prefix) is blocked automatically, no rule edit required.
const CORE_ALLOWED_DEPENDENCY = 'dinero.js';

function forbiddenRuntimeDependencies() {
  // devDependencies too (Phase-4 P3-1): test/tooling packages (fast-check,
  // vitest, ...) are just as installed and importable from core as runtime
  // deps, and equally forbidden there.
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ].filter((name) => name !== CORE_ALLOWED_DEPENDENCY);
}

function forbiddenBuiltinModules() {
  return [...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
}

export const forbiddenCoreExternalPaths = [
  ...forbiddenRuntimeDependencies(),
  ...forbiddenBuiltinModules(),
];

const CORE_BOUNDARY_MESSAGE =
  'src/core/ depends on nothing but dinero.js — see CLAUDE.md § 2 (enforced by no-restricted-imports — story-maint-29).';
const INFRA_BOUNDARY_MESSAGE =
  'src/infra/ must not import src/cli/ — see CLAUDE.md § 2 (enforced by no-restricted-imports — story-maint-29).';
const CATEGORIZE_BOUNDARY_MESSAGE =
  'categorize-command.ts must not import src/infra/db/ directly — see #228 (enforced by no-restricted-imports — story-maint-29).';

// `@core/*` and relative core-to-core paths are allowed by omission — neither
// `paths` nor `patterns` below name them.
export const boundaryConfig = [
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: forbiddenCoreExternalPaths.map((name) => ({
            name,
            message: CORE_BOUNDARY_MESSAGE,
          })),
          patterns: [
            { group: ['**/infra/**', '**/cli/**'], message: CORE_BOUNDARY_MESSAGE },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/cli/**'], message: INFRA_BOUNDARY_MESSAGE }],
        },
      ],
    },
  },
  {
    files: ['src/cli/commands/categorize-command.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/infra/db/**'], message: CATEGORIZE_BOUNDARY_MESSAGE }],
        },
      ],
    },
  },
];

export default boundaryConfig;
