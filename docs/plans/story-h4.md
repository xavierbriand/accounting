# Story h4: Harness Module 5 — cost & telemetry as a retro aid

## Context

Closes [#99](https://github.com/xavierbriand/accounting/issues/99) (Module 5 of the harness-engineering curriculum, umbrella #94). Shipped ahead of Modules 3 (#97) and 4 (#98) deliberately: a token-consumption analysis (2026-07-02 session) identified measurement as the prerequisite for the active token-reduction effort. Modules 3/4 are unaffected and stay next in the cheapest-first sequence.

Like story-h1/h2/h3, this is a harness story outside the epics.md FR/NFR numbering — no FR coverage is claimed; the deliverable is process tooling, not product behaviour.

This story is the first of a three-story token-reduction arc derived from that analysis:

1. **story-h4 (this plan)** — telemetry baseline: measure per-story cost before optimizing.
2. **Context diet** ([#143](https://github.com/xavierbriand/accounting/issues/143)) — quiet vitest reporter for agent runs, scoped canon-doc reads in the three agent specs, bounded `gh` output.
3. **Deterministic DoD checks** ([#144](https://github.com/xavierbriand/accounting/issues/144)) — drift-scan siblings for commit-subject story-ids, TODO/TBD scans, Gherkin↔step mapping.

Analysis headline (motivates the arc): phases 2–4 of each story load ~40 KB of canon docs per sub-agent × 3 sub-agents plus ~33 KB of agent specs — an estimated 60k–160k tokens/story of context before analysis begins. Those numbers are estimates; this story replaces them with measurements.

**Curriculum framing honesty (Module 5 concept):** with ~40 stories and rules that change what gets checked, there is no clean trend line. Telemetry's value here is *case studies and outliers* — "this story cost 3× the median" is a retro prompt, not a regression alarm.

### Ground-truth findings (planning session, 2026-07-02)

- `~/.claude/projects/-Users-xavier-Projects-accounting/*.jsonl` (4 files) carry a **file-operations journal schema** (`content, operation, sessionId, timestamp, type`) — **no token-usage fields**. Cost-per-story cannot be parsed from these; the curriculum's "parse session JSONL" exercise needs a source-discovery spike first.
- 21 of the 37 existing retro files contain a "Loop metrics" section, but as **non-uniform prose bullets** — unsuitable for field extraction. Plan-LOC, diff-LOC, and commit counts are instead computable deterministically from git.
- `docs/metrics/` does not exist yet.

### #99 closure deviations (recorded at DoR)

Three literal #99 checkboxes are intentionally deviated from, all traceable to the JSONL ground-truth finding; a comment on #99 records them so closure doesn't silently under-deliver:

- *"cost per story for ≥5 stories retroactively"* — contingent on the spike finding a usage source; local transcripts carry no usage fields, so retroactive coverage may be impossible. The historical baseline ships as weight-ratio metrics instead.
- *loop.csv columns `phase-4-findings-by-severity`, `tests-added`, `deviations`* — dropped with the rejected prose-scrape; replaced by deterministic git-derived columns plus a `retro_loop_metrics` presence flag.
- *"one existing retro rewritten using the new data"* — kept: C6 annotates the top weight-ratio outlier retro with measured data.

## Maintenance sub-loop (§ 6.7) — run 2026-07-02 pre-planning

- **Sibling work:** open PRs are Dependabot only (#137 dev-deps group, #135 actions/checkout, #126 yaml, #123 zod) — no harness overlap. #127/#128 were merged by the user *during* this check; branch cut from post-merge `origin/main` (d9a54cb). Open issues: #99 is this story; #97/#98 (Modules 3/4) not in flight; #111 (Module 7 plan↔code sync) and #86 (markdown-link-check) are adjacent to arc-story 3 and will be cross-referenced in its issue, not absorbed here.
- **Working tree:** clean; `story-h4` worktree cut from `origin/main` @ d9a54cb (per #139, verified `story-h4` unused across plans, branches, worktrees).
- **Open issues review:** 30 open; no re-prioritisation needed; `deferred-suggestion` items untouched by this scope.
- **npm audit --audit-level=high:** first run reported "3 vulnerabilities (2 moderate, 1 high)"; two immediate re-runs reported **0**. **Corrected at Phase 2:** [#140](https://github.com/xavierbriand/accounting/issues/140) (filed the same day by the story-maint-18 sub-loop) confirms the 3 vulnerabilities are real — devDependency-transitive (vite high; js-yaml, brace-expansion moderate) — so the 0-readings were the anomaly, not the first reading. Fix in flight as lockfile-only [PR #141](https://github.com/xavierbriand/accounting/pull/141). Documented exception per security-checklist § Review cadence: no runtime-dep exposure. **Gate: rebase story-h4 onto main after #141 merges, before Phase 3 starts.**
- **Phase-2 snapshot update (same day):** #135/#126 closed since the pre-planning check; new siblings #141 (audit fix) and #142 (story-maint-18, id-uniqueness check) opened — both assessed no-overlap by the parallel sibling-overlap audit.
- **Proceed:** yes.

## Story

As the developer running this repo's agentic workflow, I want per-story cost and weight-ratio metrics generated from local data, so that retros start from measured numbers ("this story cost X tokens, plan was Y× the diff — surprises?") and the token-reduction arc (context diet, deterministic checks) can prove its savings against a baseline instead of estimates.

## Alternatives considered

- **Adopt RTK (token-optimizing CLI proxy) now** — set aside: only filters Bash output (built-in Read/Grep/Glob bypass it), third-party binary interposed on every shell command; revisit with baseline data.
- **Parse retro "Loop metrics" prose into fields** — rejected: 21 sections are free-form bullets; extraction would be brittle. Git-derived numbers are deterministic and cover all 38 stories.
- **Adopt `ccusage` (community usage parser)** — rejected: depends on transcript JSONL this machine doesn't retain (ground-truth finding above), unpinned external dep, and we need story-attribution logic regardless.
- **One mega-story for the whole token arc** — rejected: § 6.6 sizing (>3 scenarios, >1 Sonnet round); split into the three-story arc above.
- **OTEL-to-collector pipeline** — rejected for now: needs collector infrastructure; violates local-first. A file-based export is in scope for the spike; a collector is not.

## Selected solution

Two harness tools under `harness/metrics/` (same isolation pattern as `harness/drift-scan/`: no imports to/from `src/`, `tests/`; covered by `vitest.harness.config.ts`; coverage-exempt per CLAUDE.md § 5), plus one telemetry-source spike.

### Tool 1 — weight-ratio baseline (`npm run metrics:loop`)

For every `docs/plans/story-*.md`, compute deterministically from git + filesystem:

| Column | Source |
| --- | --- |
| `story_id` | plan filename |
| `plan_loc` | `wc -l` of plan file |
| `diff_loc` | added+deleted lines of the story's merge commit (`git log --grep '[story-<id>]' / PR merge --stat`); `n/a` + skip-report when no merge ref resolves |
| `commits` | count of commits whose subject carries the story id |
| `weight_ratio` | `plan_loc / diff_loc` (the Module 5 heuristic: plan longer than diff ⇒ gate too heavy) |
| `retro_loop_metrics` | boolean: retro file contains a "Loop metrics" section |

Output: `docs/metrics/loop.csv` (committed — it is the baseline artifact) plus a stderr report naming the **top-3 weight-ratio offenders** and **every skipped story with its reason**. No silent truncation: a story that can't be computed is listed, never dropped.

### Spike — token-usage source discovery (time-boxed, one slice)

Decision gate, documented in `harness/metrics/README.md`:

1. **Preferred:** Claude Code OpenTelemetry export (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER` file/console variant) — verify the local CLI version emits token metrics to a local file with zero external infrastructure.
2. **Fallback:** any other local artifact that carries per-session usage (session dirs, cost logs), identified by inspection.
3. **If neither exists:** the reader ships fixture-tested against the documented OTEL shape, wiring documented as "pending CLI support", and the retro records the gap. The story still delivers the historical baseline (Tool 1).

Raw telemetry output lands in a gitignored `.claude/metrics/` (or documented equivalent); **only aggregates are committed**. Token counts and model names only — never session content (PII rule, CLAUDE.md § 3). The spike write-up itself quotes **schema keys and record counts only — never `content` field values** — so no real session content can land in the committed README.

### Tool 2 — usage reader + story report (`npm run metrics:usage`, `npm run metrics:story -- <id>`)

- `metrics:usage <path>`: aggregate per-model input/output/cache-read/cache-write token totals from the spike-selected source. Tokens are the primary unit; an optional cost column reads a checked-in price map (`harness/metrics/prices.json` with an `asOf` date) — stale prices degrade to token-only output, never guess.
- `metrics:story <id>`: attribute sessions to the story via cwd + time-window overlap with the story branch's commit timestamps; emit `docs/metrics/story-<id>.md` (totals, session count, attribution-confidence note). Unattributable sessions are reported, not forced into a story.
- Unknown lines/records in any source: counted and reported (`skipped: N unrecognized records`), never a crash, never fabricated zeros — absence of data is declared as absence.
- **Boundary hygiene (security-checklist intent, applied to harness inputs):** the `<path>` argument is realpath-normalized with symlinks refused (local re-implementation of the `validateDbPath` pattern — no cross-tree `src/` import); entrypoints reject unrecognized argv tokens with usage text; `prices.json` and telemetry records are zod-validated at read (malformed → reported skip, never crash). Error convention follows the `harness/drift-scan/` tier: plain throws/exit codes are acceptable — the `Result<T, E>` mandate is scoped to Core and does not apply here.

### Retro integration

`docs/retrospectives/README.md` gains a "Cost" line in the conventions: paste `metrics:story` output (or "no usage source available — see harness/metrics/README.md") into each new retro. Makes the Module 5 teach-back ("the outlier list is the talk") a standing retro input.

## Production-code surface (R2)

No `src/` files touched. No migrations. No schema changes. No product behaviour change. Harness + docs only.

**New files:**

| File | Purpose |
| --- | --- |
| `harness/metrics/loop-metrics.ts` | Tool 1 lib + entrypoint |
| `harness/metrics/loop-metrics.test.ts` | Fixture-based unit tests |
| `harness/metrics/usage-reader.ts` | Tool 2 lib + entrypoints |
| `harness/metrics/usage-reader.test.ts` | Fixture-based unit tests |
| `harness/metrics/fixtures/` | Synthetic git-shape + telemetry fixtures (no real session content) |
| `harness/metrics/prices.json` | Model→price map with `asOf` date |
| `harness/metrics/README.md` | Invocation, spike findings, source wiring |
| `docs/metrics/loop.csv` | Committed baseline artifact |
| `docs/plans/story-h4.md` | This plan (R1) |
| `docs/retrospectives/story-h4.md` | Phase 5 |
| `docs/status.d/2026-07-02-story-h4.md` | R17 fragment |

**Modified files:**

| File | Change |
| --- | --- |
| `package.json` | `metrics:loop`, `metrics:usage`, `metrics:story` scripts |
| `docs/retrospectives/README.md` | "Cost" line in retro conventions |
| `.gitignore` | Raw telemetry output dir (spike-dependent path) |
| `docs/learning/harness-engineering.md` | Module 5 exercise notes updated to match shipped shape (JSONL finding) |

**Output formats (R2 — new machine-readable surfaces):**

- `docs/metrics/loop.csv` — columns exactly as the Tool 1 table above: `story_id, plan_loc, diff_loc, commits, weight_ratio, retro_loop_metrics`.
- `docs/metrics/story-<id>.md` — fields: story id, session count, per-model token totals (input / output / cache-read / cache-write), optional cost (price-map `asOf` date cited), attribution-confidence note, unattributed-session list.
- `metrics:usage` stdout — per-model rows of the same four token counters + skipped-record count.

## Acceptance scenarios

Harness tooling, not domain logic: scenarios map to harness vitest tests (in-process lib tests + one subprocess smoke per npm script — R7 scope stated per scenario).

**Scenario A — weight-ratio baseline**
```gherkin
Given plan files and merged story commits exist for past stories
When npm run metrics:loop executes
Then docs/metrics/loop.csv contains one row per story with plan_loc, diff_loc, commits, weight_ratio
And stderr names the top-3 weight-ratio offenders
And every story it could not compute is listed as skipped with a reason
fails if: a story is silently dropped from both csv and skip-report — the baseline
would then lie by omission (guards loop-metrics.ts row-emission path; in-process
lib test on fixture repo shape + one subprocess smoke of the npm script)
```

**Scenario B — usage reader honesty**
```gherkin
Given a fixture telemetry file in the spike-selected format containing known token counts
And trailing records in an unrecognized schema
When npm run metrics:usage -- <fixture> executes
Then per-model input/output/cache token totals match the fixture arithmetic
And the unrecognized records are reported as "skipped: N unrecognized records"
fails if: unknown schema crashes the reader or skews totals (guards usage-reader.ts
parse/aggregate paths; in-process — subprocess smoke covers script wiring only)
```

**Scenario C — story attribution declares uncertainty**
```gherkin
Given usage records whose timestamps overlap story-h4's commit window
And one session outside any story's window
When npm run metrics:story -- h4 executes
Then docs/metrics/story-h4.md reports the overlapping sessions' totals with an attribution note
And the out-of-window session is listed as unattributed
fails if: out-of-window usage is forced into the story report — per-story cost
would be inflated silently (guards usage-reader.ts attribution window logic; in-process)
```

## Slice plan (R13: target 6–10 commits)

Preparatory (before Phase 3; not counted per R16):
- **P0:** `chore(docs): story-h4 plan + P1/P2/P3 review [story-h4]`

Change-body commits:
1. **C1:** `test(harness): loop-metrics fixtures — failing [story-h4]`
2. **C2:** `feat(harness): metrics:loop weight-ratio baseline — green [story-h4]` (includes skip-report + top-3 stderr)
3. **C3:** `chore(harness): telemetry-source spike findings + wiring [story-h4]` (README decision record; settings/env or documented gap)
4. **C4:** `test(harness): usage-reader + attribution fixtures — failing [story-h4]`
5. **C5:** `feat(harness): metrics:usage + metrics:story — green [story-h4]`
6. **C6:** `chore(docs): baseline artifacts — loop.csv, top-outlier retro annotated with measured data, retro Cost line, curriculum note [story-h4]` (the retro annotation delivers #99's "one existing retro rewritten using the new data")
7. **C7:** `refactor(harness): <post-review shape> [story-h4]` (R11 empty-with-justification allowed)
8. **C8:** `chore(retro): story-h4 retrospective + status fragment [story-h4]`

**Total: 8 change-body + 1 preparatory.** Within R13.

## R13 vs R16 — why R13 applies

R16's 4-commit collapse covers zero-behaviour-change stories. story-h4 adds three new observable harness behaviours (two CLI tools + telemetry wiring) delivered as TDD slices, so R13's 6–10 envelope applies on its own terms. story-h1 is cited for the harness-tier *isolation pattern* only, not commit-count precedent (h1 ran 11 slices; h3 was non-TDD configuration wiring — neither is a structural match).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| No local usage source exists (JSONL finding) | Spike slice C3 with explicit decision gate; story still lands the historical baseline via Tool 1; gap recorded in README + retro |
| Spike discovers OTEL export parsing needs a new dependency | R3 tool-bundle import audit triggers at that moment; Sonnet must flag it as a deviation, not silently add the dep |
| OTEL support varies by Claude Code version | Spike documents CLI version probed; reader is fixture-tested against the documented shape either way |
| `diff_loc` unresolvable for squash-merged or renamed stories (e.g. h2→h3) | Skip-report with reason; manual override column deferred unless >5 stories skip |
| Model prices drift | `prices.json` carries `asOf`; stale map degrades to token-only output |
| Telemetry artifacts leak session content | Only numeric aggregates committed; raw output gitignored; fixtures synthetic — PII rule § 3 |
| Plan outweighs diff (Module 5's own heuristic) | This plan is ~200 lines; expected diff (2 tools + tests + fixtures) exceeds it; `metrics:loop` will verify reflexively |

## Verification plan

1. `npm run metrics:loop` → `docs/metrics/loop.csv` rows ≥ 35 stories; top-3 offenders printed; skips reasoned.
2. `npm run metrics:usage -- harness/metrics/fixtures/<fixture>` → totals match fixture arithmetic.
3. `npm run metrics:story -- h4` → report file with attribution note (or documented no-source message).
4. `npm run test:harness` → green, including new metrics tests.
5. `npm run lint && npm run build && npm test` → green (product tree untouched).
6. `grep -r "from.*harness" src/ tests/` → empty (no cross-tree imports).
7. `npx tsx harness/drift-scan/drift-scan.ts` → exit 0 on this plan (paths exist post-implementation).
8. Reflexive check: story-h4's own weight ratio computed by its own tool in the retro.

## DoR checklist

- [x] Phase 1 (plan) complete
- [x] Phase 2 (plan-reviewer + sibling-overlap, launched in parallel in a single message) — complete 2026-07-02; all findings tagged below
- [ ] Phase 3 (Sonnet implementation) — pending
- [ ] Phase 4 (code review + refactor) — pending
- [ ] Phase 5 (retrospective) — pending

## Suggestion log

Phase 2 run 2026-07-02: plan-reviewer (29 findings, 12/21 rule-tags apply — R1, R2, R6, R7, R8, R11, R12, R13, R17, R18, R19, R21 all satisfied) + sibling-overlap (no overlap; 2 alignment findings, 1 snapshot delta), in parallel. Pass-confirmations are not repeated below; every substantive finding is tagged.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | Harness-story FR-exemption never stated explicitly (h1/h3 framed it) | adopted | Context: FR-exemption paragraph added |
| P1 | R2 output shapes split across sections, not consolidated | adopted | "Output formats (R2)" subsection added under Production-code surface |
| P1 | Retro denominator "38" counts h4's own future retro; 37 exist | adopted | Corrected to "21 of the 37 existing retro files" |
| P1 | R3 scan point: OTEL parsing may need a new dep mid-implementation | adopted | Risks row added — R3 audit triggers as a flagged deviation |
| P1 | Module 5 literal-exercise text deviates (git-derived vs prose-scrape) | acknowledged | Evidence-based deviation already documented; curriculum-sync edit in Modified files |
| P2 | Spike write-up could paste raw `content` values into committed README | adopted | Spike section: schema-keys-and-counts-only guard added |
| P2 | R8 satisfied at plan (Given) level only — not an assertion-level guarantee | acknowledged | Assertion-level check is Phase 4's R5/R8 walk |
| P3 | npm-audit "registry flake" conclusion contradicted by #140 — vulns real | adopted | Sub-loop corrected; documented exception (devDeps-only); **gate: rebase after #141 merges, before Phase 3** |
| P3 | Zod validation absent for harness external inputs (prices.json, telemetry) | adopted | Boundary-hygiene bullet: zod-at-read, malformed → reported skip |
| P3 | `<path>` arg lacks normalization/symlink refusal (validateDbPath intent) | adopted | Boundary-hygiene bullet: realpath + symlink refusal, local re-implementation |
| P3 | Bespoke entrypoints' unknown-flag handling unstated | adopted | Boundary-hygiene bullet: unrecognized argv rejected with usage text |
| P3 | Harness error convention (Result vs throw) unstated | adopted | Boundary-hygiene bullet: drift-scan-tier throws/exit codes; Result scoped to Core |
| P3 | R13 rationale "mirroring h1/h3" structurally imprecise | adopted | Reworded: R13 on own terms; h1 cited for isolation pattern only |
| P3 | R11 empty-refactor justification deferred, not drafted | acknowledged | R11 requires justification when the empty commit lands (Phase 4), not at plan time |
| P3 | Function-LOC / signature granularity absent from plan | acknowledged | Plan is slice-granular by design; ≤50 LOC standard enforced at Phases 3–4 |
| Sibling | #99 closure would silently under-deliver 3 literal checkboxes | adopted | "#99 closure deviations" section added; C6 delivers the retro-rewrite item; comment posted on #99 at DoR |
| Sibling | Pre-planning PR snapshot stale (#135/#126 closed; #141/#142 new) | adopted | Phase-2 snapshot-update bullet added to sub-loop section |
| Sibling | #119's temp-git-repo scaffolding overlaps C1 fixture needs — reuse candidate | acknowledged | Evaluate shared helper at Phase 4 refactor; no scope change now |
