# harness/dod-check

Deterministic Definition-of-Done gates, moved out of the P1/P2/P3 reviewer prompts (story-h6, #144).
Widened with four honesty gates (story-h11, #163) that verify the *expensive* DoD claims — no
dressed-up placeholders, a ticked merge checklist, evidenced Phase-4 runs, a fresh loop.csv — rather
than only the cheap-to-fake commit-subject/TBD/envelope surface.

Eight checks, one findings union:

- **Commit subjects** — every commit subject in `origin/main...HEAD` must reference the current
  story id (bracket `[story-<id>]`, bare `story-<id>`, or capitalized `Story <id>`); the slice count is
  checked against the R13/R14/R16 envelope declared in the story's plan (`docs/plans/story-<id>.md`
  § Slice plan / Sizing heading). The count is **behaviour slices** (`countSlices`, R28): commits
  carrying the story id in their subject, excluding the preparatory `chore(docs): ... plan + P1/P2/P3
  review` commit, the `chore(retro): ...` commit, **and each `test: … — failing` red-half** — the TDD
  rhythm (§6.4) splits every behaviour into a `test: — failing` + `feat: — minimal green` pair, so
  collapsing the red half yields one slice per behaviour (`refactor:` and R10 green-on-landing `test:`
  commits stand as their own slices). Counting raw commits instead would double the figure and
  false-hard-fail once out of draft. `countChangeBodyCommits` (the pre-R28 raw count) is retained for
  R16 zero-behaviour stories, where the two agree (no failing/green pairs). Merge
  commits are excluded from the scan entirely (`git log --no-merges`): they never carry the story-id
  convention, and a GitHub `pull_request` build checks out a synthetic merge commit (`Merge <sha>
  into <base>`) that would otherwise be a false `missing-story-id`.
- **TODO / TBD** — `TODO` comments anywhere in tracked `src/`, `tests/`, `harness/` source; `TBD` (or
  a standalone `Pending...` line — #152's `_Pending Phase 3/5_` regression) left in a PR body section
  (excluding the § 10 merge checklist, which legitimately uses placeholder language). This check key
  also runs the merge-checklist scan (below) — both consume the same resolved PR body.
- **Merge checklist** — counts unticked (`- [ ]`) rows in the § 10 merge checklist, **excluding** the
  two rows that are unticked by construction at CI time (`PR out of draft`, `User approval` — matched
  case-insensitively as substrings, not exact text, since template wording may drift). Catches the
  #149 regression (§ 10 merged entirely unticked). Draft-aware: advisory while the PR is a draft, hard
  once ready-for-review.
- **Phase evidence** — pairs a *ticked* § 10 box mentioning phase-4 with a § 7 suggestion-log row
  carrying `P4` in the Phase column. Fires `phase-evidence-missing` iff the claim is ticked and no P4
  row evidences it. Catches the ddd-1/#153 regression (Phase-4 gate ticked with no code-reviewer run
  evidenced anywhere). Always-advisory — the newest check, highest false-positive risk; in particular
  a legitimate R9 trivial-inline-fix carve-out (no Phase-4 review needed) has no way to signal that
  today and will show this finding — a future promotion story may add a `P4: none — carve-out`
  sentinel row as accepted evidence.
- **Loop-csv freshness** — every `docs/plans/story-<id>.md` file should have a matching row in
  `docs/metrics/loop.csv` (regenerated via `npm run metrics:loop`); a plan id absent from the csv,
  other than the current story's own not-yet-generated row, reports `loop-csv-stale`. Catches missed
  manual `loop.csv` regenerations (F7, #157). Always-advisory.
- **Gherkin↔step mapping** — every `tests/features/*.feature` scenario step must resolve against a
  `tests/features/steps/*.ts` step definition (string cucumber-expression or regex literal); every
  Gherkin scenario declared in the current story's plan (inside a ` ```gherkin ` fenced block) must
  exist in the feature files.
- **Weight ratio** — compares the current story's plan LOC (line count of `docs/plans/story-<id>.md`)
  against the shipped diff LOC since `origin/main` (`git diff --numstat`, filtered through the shared
  process-artifact filter so plan/retro/status-fragment churn doesn't count as "shipped"). A ratio
  above 1.0 (plan bigger than what shipped) reports a `weight-ratio-heavy` finding — a signal the plan
  over-specified relative to the actual change, never a merge blocker.
- **Try-funnel** (story-h13) — scans the current story's own retro file's `## Try` section. A Try
  bullet must carry either a file citation (a backtick-fenced path, or a markdown link) or an issue
  reference (`#<n>`); a bullet with neither reports `try-unfunneled`. The recurring "No new § 8 rule
  minted" close-out phrase family is exempt. Always-advisory. Degrades gracefully (no finding) when
  the story id can't resolve or the retro file doesn't exist yet — the common case while a story is
  still in flight.

## Invocation

```sh
# All checks
npx tsx harness/dod-check/dod-check.ts

# One check only
npx tsx harness/dod-check/dod-check.ts --check commits
npx tsx harness/dod-check/dod-check.ts --check todo-tbd
npx tsx harness/dod-check/dod-check.ts --check gherkin
npx tsx harness/dod-check/dod-check.ts --check weight-ratio
npx tsx harness/dod-check/dod-check.ts --check phase-evidence
npx tsx harness/dod-check/dod-check.ts --check loop-freshness
npx tsx harness/dod-check/dod-check.ts --check try-funnel

# Machine-readable output
npx tsx harness/dod-check/dod-check.ts --json
```

## Enforcement model

Three tiers:

| Finding | Enforcement |
| --- | --- |
| `missing-story-id` | **hard** — always exit 1 |
| `todo-comment` | **hard** — always exit 1 |
| `unmapped-scenario` / `orphan-step` | **hard** — always exit 1 |
| `pr-tbd` | **draft-aware** — advisory while the PR is a draft, hard once ready-for-review |
| `merge-checklist-unticked` | **draft-aware** — same as `pr-tbd`; the `PR out of draft` / `User approval` rows are excluded from the count (see below) |
| `commit-envelope`, count **over** the declared max | **draft-aware** — same as `pr-tbd` |
| `commit-envelope`, count **under** the declared min | **always-advisory** — reported, never gates |
| `commit-envelope`, rule **not declared** in the plan | **always-advisory** — reported, never gates |
| `story-id-unresolved` (non-story PR — Dependabot/chore) | **always-advisory** — reported, never gates |
| `weight-ratio-heavy` (plan LOC exceeds shipped diff LOC) | **always-advisory** — reported, never gates |
| `phase-evidence-missing` (ticked phase-4 box, no § 7 P4 row) | **always-advisory** — reported, never gates |
| `loop-csv-stale` (plan id missing from `docs/metrics/loop.csv`) | **always-advisory** — reported, never gates |
| `try-unfunneled` (Try bullet with no file/issue citation) | **always-advisory** — reported, never gates |

Exit code: `1` iff a **hard** finding exists, **or** a **draft-aware** finding exists and the PR is
out of draft. **Always-advisory** findings never affect the exit code — a non-story PR, an
under-target (small) story, or a plan with no declared envelope is reported but not blocked. The
envelope's job is to cap stories that are *too big* (§ 6.6 sizing); being small, or having no story at
all, is not a merge blocker. Human report lines distinguish the three envelope cases: `over the
R<n> (min–max) envelope`, `under the R<n> (min–max) target (advisory)`, and `envelope not declared in
plan (advisory)`.

Two coupling nuances worth flagging explicitly:

- **`merge-checklist-unticked` exclusion is text-matched, not positional.** The two rows unticked by
  construction at CI time — `PR out of draft` and `User approval` — are excluded via a
  case-insensitive substring match (`/out of draft/i`, `/user approval/i`), not by row index. If the
  PR template's § 10 wording drifts, the exclusion (or the check itself) may silently stop matching;
  any drift surfaces as advisory noise in draft, never a silently-passed hard gate once ready.
- **`phase-evidence-missing` has a known R9 carve-out false positive.** A story that legitimately
  used the R9 trivial-inline-fix carve-out (≤5 LOC, single file, pre-specified — no Phase-4 review
  needed) has no way to signal that today; ticking the phase-4 box with zero `P4` suggestion-log rows
  will still fire this finding. It's always-advisory, so it never blocks — but expect the noise on
  R9-carve-out stories until a future promotion story adds an explicit `P4: none — carve-out`
  sentinel row as accepted evidence.

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

Human-readable findings go to **stderr**, grouped `Commit subjects:` / `TODO/TBD:` / `Gherkin↔step:`
(the `TODO/TBD:` group also carries `merge-checklist-unticked` lines, since both checks share the
`todo-tbd` key and PR-body resolution), followed by any ungrouped `weight-ratio-heavy`,
`phase-evidence-missing`, `loop-csv-stale`, and `try-unfunneled` lines. Draft-aware findings carry an
`(advisory — PR is draft)` suffix while the PR is a draft; always-advisory findings carry a bare
`(advisory)` suffix regardless of draft state. `--json` sends
`{ "findings": DodFinding[], "degraded": string[] }` to **stdout** instead.

## Story-id resolution

1. Current branch name, if it matches `story-<id>`.
2. Otherwise, the single plan file added in `git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'`.
3. If neither resolves (e.g. a Dependabot/chore PR, or zero/multiple plan files added), the
   commit-subject check is skipped and reports a `story-id-unresolved` **always-advisory** finding
   naming why — it never gates the exit code.

## Wiring

- **CI** (`.github/workflows/ci.yml`): a `Run DoD checks` step, with `DOD_PR_DRAFT` /
  `DOD_PR_NUMBER` wired from `github.event.pull_request.*`, `GH_TOKEN: ${{ github.token }}` so
  `gh pr view` works, and the job-level `permissions: pull-requests: read` that token needs.
- **PostToolUse hook** (`.claude/settings.json`): runs `--check gherkin` when an edit touches
  `tests/features/**`.
