# harness/dod-check

Deterministic Definition-of-Done gates, moved out of the P1/P2/P3 reviewer prompts (story-h6, #144).

Three checks, one findings union:

- **Commit subjects** — every commit subject in `origin/main...HEAD` must reference the current
  story id (bracket `[story-<id>]`, bare `story-<id>`, or capitalized `Story <id>`); commit count is
  checked against the R13/R14/R16 envelope declared in the story's plan (`docs/plans/story-<id>.md`
  § Slice plan / Sizing heading). The count is **behaviour-slice commits only**
  (`countChangeBodyCommits`): commits carrying the story id in their subject, excluding the
  preparatory `chore(docs): ... plan + P1/P2/P3 review` commit and the `chore(retro): ...` commit —
  both are bookkeeping, not TDD slices, and including them would inflate the count past the declared
  envelope (e.g. a 10-slice story would read 11 or 12 and false-hard-fail once out of draft). Merge
  commits are excluded from the scan entirely (`git log --no-merges`): they never carry the story-id
  convention, and a GitHub `pull_request` build checks out a synthetic merge commit (`Merge <sha>
  into <base>`) that would otherwise be a false `missing-story-id`.
- **TODO / TBD** — `TODO` comments anywhere in tracked `src/`, `tests/`, `harness/` source; `TBD` left
  in a PR body section (excluding the § 10 merge checklist, which legitimately uses placeholder
  language).
- **Gherkin↔step mapping** — every `tests/features/*.feature` scenario step must resolve against a
  `tests/features/steps/*.ts` step definition (string cucumber-expression or regex literal); every
  Gherkin scenario declared in the current story's plan (inside a ` ```gherkin ` fenced block) must
  exist in the feature files.

## Invocation

```sh
# All checks
npx tsx harness/dod-check/dod-check.ts

# One check only
npx tsx harness/dod-check/dod-check.ts --check commits
npx tsx harness/dod-check/dod-check.ts --check todo-tbd
npx tsx harness/dod-check/dod-check.ts --check gherkin

# Machine-readable output
npx tsx harness/dod-check/dod-check.ts --json
```

## Enforcement model

| Finding | Enforcement |
| --- | --- |
| `missing-story-id` | **hard** — always exit 1 |
| `todo-comment` | **hard** — always exit 1 |
| `unmapped-scenario` / `orphan-step` | **hard** — always exit 1 |
| `commit-envelope` | **draft-aware** — advisory while the PR is a draft, hard once ready-for-review |
| `pr-tbd` | **draft-aware** — same as above |
| `story-id-unresolved` | advisory — reported, never a crash; skips the commit-subject check |

Exit code: `1` if any hard finding exists, or any advisory finding exists **and** the PR is out of
draft. `0` otherwise.

## Draft-state resolution

Priority order:

1. `DOD_PR_DRAFT` env var (`"true"` / `"false"`) — set by CI from the Actions `pull_request` event
   payload (`github.event.pull_request.draft`), since that field is a workflow expression, not
   ambient env.
2. `gh pr view --json isDraft` — local fallback. `DOD_PR_NUMBER` (env) selects the PR when set;
   otherwise `gh` infers it from the current branch.

Any `git`/`gh` failure (no PR, unauthenticated, rate-limited, network error, or an unparseable
`isDraft` field) collapses to the advisory-fallback path (`isDraft = true`) with a reported
degradation line on stderr — never a crash, never a suppressed hard finding.

## Security

Every `git`/`gh` invocation uses `execFileSync` with **array** arguments — never a string-interpolated
shell command. The branch-name-derived story id and any other repo-controlled string never reach a
shell.

## PR body resolution

1. `DOD_PR_BODY_FILE` env var, if set — reads the PR body from that file instead of calling `gh`.
   This makes the `pr-tbd` check subprocess-testable without a real PR/network dependency, and is
   also usable directly by CI when the body is already available as a workflow artifact.
2. Otherwise, `gh pr view --json body -q .body` (`DOD_PR_NUMBER` selects the PR when set).

Any failure to resolve the PR body (file read error, or the `gh` failure modes above) collapses to a
reported degradation line — the `pr-tbd` check is skipped for that run, never crashes.

## Degradation reporting

`resolvePrBody`, `getCommitLog`, and `resolveStoryId` never throw on a `git`/`gh` failure — each
collects a degradation message instead (matching the existing `resolveDraftState` pattern). Hard
findings are still computed and reported regardless of any degradation. Degradations surface as:

- Human mode: one `degraded: <message>` line per degradation, on stderr, before the findings report.
- `--json` mode: a `degraded: string[]` field alongside `findings`.

## Output

Human-readable findings go to **stderr**, grouped `Commit subjects:` / `TODO/TBD:` / `Gherkin↔step:`,
with an `(advisory — PR is draft)` suffix on draft-aware findings while the PR is a draft. `--json`
sends `{ "findings": DodFinding[], "degraded": string[] }` to **stdout** instead.

## Story-id resolution

1. Current branch name, if it matches `story-<id>`.
2. Otherwise, the single plan file added in `git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'`.
3. If neither resolves (e.g. a maintenance PR, or zero/multiple plan files added), the commit-subject
   check is skipped and reports a `story-id-unresolved` advisory finding naming why.

## Wiring

- **CI** (`.github/workflows/ci.yml`): a `Run DoD checks` step, with `DOD_PR_DRAFT` /
  `DOD_PR_NUMBER` wired from `github.event.pull_request.*`, `GH_TOKEN: ${{ github.token }}` so
  `gh pr view` works, and the job-level `permissions: pull-requests: read` that token needs.
- **PostToolUse hook** (`.claude/settings.json`): runs `--check gherkin` when an edit touches
  `tests/features/**`.
