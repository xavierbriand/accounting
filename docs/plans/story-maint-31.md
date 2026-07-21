# Story maint-31 — Extract the program.ts ledger-command wrapper + hoist shared test fixtures

## Context

Issue [#246](https://github.com/xavierbriand/accounting/issues/246), from the
[2026-07-20 critical project review](../reviews/2026-07-20-critical-project-review.md)
(§ 2 smell 1 + § 3 weakness 3; § 4 top-five action #3): `src/cli/program.ts` (560 LOC)
is the file every story touches, and each ledger-opening command copy-pastes the same
~15-line boilerplate; per-file test-fixture duplication taxes every new command's tests.

Pre-planning probe (2026-07-21):

- **Six textually identical blocks** — *resolveDbPathForCommand → exit-on-failure →
  getDb → assertMigrated → exit-2-on-failure → observeConfigChangeFor*: ingest
  (136–149), correct (225–238), status (273–286), explain (316–329), export (360–373),
  dissolve (400–417). `migrate` (no assertMigrated — it migrates) and `categorize`
  (never opens the DB — story-D invariant) deliberately differ, but both still
  duplicate the 5-line *resolve → exit-on-failure* sub-block → 8 copies of that.
- **Fixtures:** `makeTmpDir` reimplemented in 27 files (`mkdtempSync` appears in 34 —
  7 further inline call sites); `makeEur` in 12 files (`makeUsd` in only 2 — below the
  ≥3-caller threshold, stays local); no-op port stubs in 4 files with naming drift
  (`makeNoOpConfigWriterStub` vs `makeNoOpConfigWriter`).
- **Noted, deferred:** the ~23-line scripted-prompts + configWriter-mtime block is
  duplicated between ingest (156–178) and categorize (461–483) — issue
  [#253](https://github.com/xavierbriand/accounting/issues/253) filed at Phase 2.

### Maintenance sub-loop (§ 6.7) run 2026-07-21 pre-planning

- **Sibling work:** 4 open PRs, **none touching this story's files**
  (`src/cli/program.ts`, a new `src/cli/ledger-command.ts`, `tests/_helpers/*`):
  #247 (doc hygiene, #244), #248 (story-5.0 Epic-5 canon refresh), #249 (pixelmatch
  devDep chore), #250 (PRD verb reconciliation, #245). Adjacent-but-distinct open
  issues, untouched: #107 (shared command-*deps type* — typing, not wiring
  boilerplate), #211 (conditional-test-logic smells), #110/#109 (categorize
  internals), #186 (e2e journeys — a future *consumer* of leg 2's helper).
- **Story-id uniqueness (R23):** this session first drafted as `maint-30` and
  **hit a live collision** — PRs #247 *and* #250 (two other parallel sessions) both
  carry `story-maint-30` in their titles and commit subjects while their branches are
  named `claude/issue-<n>-<hash>`. The R23 check as written (plans/retros/status.d on
  `origin/main` + open PR **branch names**) does not see an id claimed only in a PR
  title, so all three sessions read the id as free. Renamed to **maint-31**, re-verified
  free: `git ls-tree origin/main` empty for `maint-31`, no open PR title or branch
  carries it. Rule-gap logged as a Phase-5 Try candidate (see Risks & deferred).
- **Working tree:** clean; session branch `claude/issue-246-91652b` even with
  `origin/main` (6c3084b) — session-branch precedent story-ddd-1.
- **Open PRs / Dependabot:** no pending bumps (#249 is a manual devDep removal).
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Drain (story-h13, #164):** this session's first drain pick, **#57** (pixelmatch
  workaround, obsolete since quickpickle 1.11.2 lazy-imports it as an optional peer),
  was claimed mid-session by **PR #249** from a parallel session — that leg is dropped
  here rather than duplicated. Replacement drain: **#117** (aging since 2026-04-30) —
  part 1 (`writeStubYaml` typed fixture options) is absorbed as leg 3 below; part 2
  (scope-narrowing the shared Gherkin step) is explicitly re-justified as still-open
  and out of scope, because it rewrites 14 scenario sites across 4 feature files.
- **Backlog refinement:** deep `/refine-backlog` pass skipped (not required every
  loop); tracker reviewed line-by-line above. Pending metrics chore picked up here:
  `docs/metrics/loop.csv` is stale (missing `h14`, `maint-29`) — regenerated in the
  retro commit, else `loop-csv-stale` advisory fires.
- **Proceed-to-planning:** yes.

**Lane: Reduced** (R26) — `src/cli` + `tests/` only; no Core, schema, or migration
surface. Phase 0 skipped (No-model-impact below). Phase 2 = `sibling-overlap` only
(plan-reviewer dropped per lane table). Phase 4 = `code-reviewer` + `sibling-overlap`.
Envelope R13.

No FR coverage — evolvability/maintenance story (review § 4 action #3: "god-file +
evolvability tax" pair), zero product-behaviour change.

## Story

> As the project's maintainers (human + agents), I want the ledger-opening wiring
> extracted into a single wrapper and the copy-pasted test fixtures hoisted into
> shared helpers, so that the next command (or test) cannot be wired subtly
> differently and the god-file + fixture tax stops growing with every story.

## Domain model

No model impact — CLI composition-root and test-infrastructure dedup; no domain
concept, port, schema, or behaviour change (maint story, R24 default).
"Ledger-opening command" is existing `program.ts` vocabulary (story-4.5a FR23
comment), not a new glossary term.

## Selected solution

**Leg 1 — `src/cli/ledger-command.ts`** (new module, extracted from `program.ts`):

- `resolveLedgerConfigOrExit(options)` — the *resolve → stderr → process.exit* block
  (all 8 command call sites today).
- `openLedgerCommand(options)` → `{ config, resolvedDbPath, configService, db }` —
  resolveLedgerConfigOrExit → `getDb` → `assertMigrated` (failure → stderr +
  `process.exit(2)`) → `observeConfigChangeFor` → return context. Adopted by the six
  ledger-opening commands.
- `resolveDbPathForCommand`, `observeConfigChangeFor`, and the `DbPathError` /
  `ResolvedDb` types move into the module (module-private except the two entry
  points). The FR23 ambient-audit doc comment — including the categorize-exclusion
  note — moves with them.
- `migrate` keeps its distinct shape (resolveLedgerConfigOrExit → `runMigrate` →
  `observeConfigChangeFor` on a fresh `getDb`); `categorize` uses
  resolveLedgerConfigOrExit only (no-DB invariant preserved).
- **Byte-identical rule:** stderr writes, exit codes, and call order per command are
  unchanged — this is a move-and-dedupe, not a redesign. In particular the
  resolve-failure branch keeps `process.exit(result.error.code)` (exit **1** for a
  config-load failure): [#231](https://github.com/xavierbriand/accounting/issues/231)
  argues that should be exit 2, and this story deliberately does **not** fix it in
  passing — the branch is moved verbatim (Phase-2 finding S8).

**Leg 2 — `tests/_helpers/` additions** (precedent #43: ≥3-caller threshold, here
27×/12×/4×):

- `tempdir.ts`: `useTmpDirs(prefix?)` — registers the `afterEach`
  `rmSync(recursive, force)` best-effort cleanup **at call time** (test-file module
  scope) and returns the `makeTmpDir` factory; per-file prefixes preserved.
  Call-time hook registration keeps per-file cleanup semantics under any vitest
  isolation config (a module-top-level hook would silently bind to one file if
  `isolate` were ever turned off).
- `money-fixtures.ts`: `makeEur(cents)` = `Money.fromCents(cents, 'EUR').value`.
  `makeUsd` stays local (2 callers < 3).
- `fakes.ts`: `makeNoOpTransactionRepo`, `makeNoOpConfigWriter`,
  `makeNoOpSnapshotService`, `makeNoOpDomainEventRecorder` — `vi.fn`-backed
  `Result.ok` returns; naming unified (the `…Stub` variant folds in).
- **Adoption rule: drop-in replacements only.** A file whose fixture semantics differ
  (cleanup timing, stub behaviour, extra bookkeeping) keeps its local version and is
  named in the Sonnet return report rather than force-fit. Inline `mkdtempSync` call
  sites adopt only where drop-in.

**Leg 3 — `writeStubYaml` typed fixture options** (absorbs #117 part 1, this
session's drain): add `additionalAccounts?` / `additionalAutoTagRules?` to
`InlineConfigOverrides` in `tests/_helpers/inline-config.ts`, and replace the
`fs.readFileSync` + `String.replace('splits:', …)` YAML injection in
`tests/features/steps/ingest.steps.ts` (lines ~70–76) with the typed option — same
"fixture construction lives in one place" claim as leg 2. #117 part 2 (scope-narrow
the shared `Given a fresh migrated DB…` step) stays open and re-justified: it
rewrites 14 scenario sites across 4 feature files, which is its own story.

Alternatives set aside:

- *HOF wrapper `withLedgerCommand(fn)`* (the issue's sketch) — same cannot-diverge
  guarantee, but an extra indirection level around every action body; the plain
  context-returning call keeps control flow flat and the byte-identical claim
  trivially auditable.
- *Keep helpers module-private in `program.ts`* — misses the god-file-shrink half of
  the review finding; the wrapper is composition-root wiring either way.
- *vitest fixtures/globalSetup API for tmpdirs* — heavier machinery, changes per-file
  cleanup semantics; the factory preserves today's exact behaviour.
- *Leaving migrate/categorize resolve-blocks inline* — misses 2 of the 8 copies for
  no benefit.
- *Riding the pixelmatch devDep drop (#57)* — dropped from this plan: PR #249 (a
  parallel session) already ships it.

## Production-code surface (R2)

- **No JSON shape, error-code, exit-code, stdout/stderr text, or CLI flag changes**
  (R31 not triggered) — byte-identical wiring refactor.
- New internal module `src/cli/ledger-command.ts` exporting `openLedgerCommand` +
  `resolveLedgerConfigOrExit` (CLI-internal wiring, not a product surface);
  `program.ts` loses the equivalent private helpers and six boilerplate blocks
  (~560 → ~430 LOC expected).
- `tests/_helpers/inline-config.ts`: `InlineConfigOverrides` gains two optional
  fields (test-only type, additive — no existing caller changes).
- No `src/core`, schema, migration, or `package.json` changes; core coverage gate
  unaffected.

## Acceptance scenarios

Scenario 1 — six ledger-opening commands share the unmigrated-DB contract
(subprocess; R7; the R4 composition-root leg):

```gherkin
Given a project dir with a valid accounting.yaml and no migrated database
When each of ingest / correct / status / explain / export / dissolve runs
Then each exits 2 and stderr contains "database not initialised" and the migrate hint
```

`fails if` any of the six commands' wiring diverges from the shared
*resolve → open → assert-migrated → observe* path in `program.ts` — the exact
production path the wrapper unifies. *(Mechanism: extends
`tests/integration/cli/uninit-db-hint.test.ts` — `spawnCli` against the dist build,
subprocess (R7); together with the existing 12-file `tests/integration/cli/` suite
this satisfies R4 for a `program.ts`-touching story. Green-on-landing (R28): the six
blocks are textually identical today; the test converts that inspection claim into an
executable regression net before the extraction lands, then pins it after.)*

Scenario 2 — behaviour preservation across the whole surface (subprocess +
in-process; R7):

```gherkin
Given the full existing suite (15 feature files, unit, property, integration)
When lint, build, and the full test run execute after each slice
Then all pass, with no assertion changes outside the mechanical fixture-hoist edits
```

`fails if` the extraction alters any command's stderr text, exit code,
config-observation ordering, or DB-open behaviour. Per-command nets already in place:
`config-change-wiring.test.ts` spawns five of the six ledger-opening commands
(all but `status`) plus `migrate` through the observe path; `status-program.test.ts`,
`ingest-end-to-end-wiring`, `export-wiring`, `dissolve-wiring`,
`commander-parse-error-envelope`, `symlink-dbpath-refuse`, and the acceptance
features cover the rest.

R4 note: `program.ts` **is** touched → the composition-root subprocess requirement is
met by Scenario 1 + the existing `tests/integration/cli/` suite (all `spawnCli`-based).

## Slice plan

R13 envelope, 8 slices (id `maint-31` in every subject; R30 prep + retro exempt):

1. `test(cli): maint-31 pin uniform unmigrated-DB contract across six ledger-opening commands — green-on-landing`
   (R28 sibling condition: the six `program.ts` blocks are already textually
   identical — the pin lands green against them, then guards the extraction)
2. `refactor(cli): maint-31 extract ledger-command module, adopt in ingest + correct`
3. `refactor(cli): maint-31 adopt openLedgerCommand in status/explain/export/dissolve, resolve-or-exit in migrate/categorize`
4. `refactor(tests): maint-31 add tempdir helper, adopt across tests/integration/cli`
5. `refactor(tests): maint-31 adopt tempdir helper in remaining suites`
6. `refactor(tests): maint-31 add money-fixtures makeEur, adopt in unit suites`
7. `refactor(tests): maint-31 add no-op port fakes, adopt in command suites`
8. `refactor(tests): maint-31 writeStubYaml typed fixture options, drop String.replace injection (#117 part 1)`

+ exempt: `chore(docs): story-maint-31 plan + P1/P2/P3 review` (prep, R30) and
`chore(retro): story-maint-31 …` (also carries the loop.csv regen — § 6.7 chore).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Subtle behaviour drift in the extraction (stderr order, observe timing, exit codes) | Slice-1 pinning test + config-change-wiring + full suite green after every slice; byte-identical rule stated in Selected solution |
| The moved resolve-failure branch invites an unplanned #231 "helpful fix" (exit 1 → 2) mid-refactor | Byte-identical rule names #231 explicitly (Phase-2 S8); Phase-4 `code-reviewer` checks exit codes unchanged |
| Fixture hoist changes hook semantics across vitest isolation configs | `useTmpDirs` registers hooks at call time in each test file's module scope — per-file semantics independent of the `isolate` setting |
| 39+-file mechanical churn hides a semantic edit | Per-group slices; drop-in-only adoption rule; deviants kept local and named in the Sonnet report |
| Same-file churn with #211's 15 deferred test-logic smells (3 files overlap: `safe-transfer-calculator.test.ts`, `sqlite-transaction-repo.test.ts`, `yaml-config-writer.test.ts`) | Different regions (fixture-definition/import lines vs. in-body assertion logic); #211 has no open PR — no live race |
| Parallel sessions racing for the next story id (three claimed `maint-30`) | Renamed to `maint-31` before any commit; R23 gap logged as a Phase-5 Try candidate — the check should also scan open PR **titles/commit subjects**, not just branch names |

Deferred: [#253](https://github.com/xavierbriand/accounting/issues/253)
(scripted-prompts + configWriter-mtime dedup, filed at Phase 2);
[#117](https://github.com/xavierbriand/accounting/issues/117) part 2 (scope-narrow
the shared Gherkin step — re-justified, stays open);
[#231](https://github.com/xavierbriand/accounting/issues/231) (exit-code drift —
deliberately untouched here).

## Verification plan

- `npm run lint && npm run build && npm test` green after every slice (includes the
  src/core coverage gate — untouched here).
- Scenario-1 pin green **before** slice 2 (against the six inline blocks) and after
  slice 3 (against the wrapper).
- `git diff --stat` on `program.ts` shows the god-file shrink (~560 → ~430 LOC);
  actual figure reported in the PR body.
- Grep audit in the PR body: zero remaining local `function makeTmpDir` /
  `function makeEur` / `function makeNoOp*` definitions in adopted files; deviant
  files listed with reasons.
- `npx tsx harness/drift-scan/drift-scan.ts` + `npx tsx harness/dod-check/dod-check.ts` green.
- Closes #246 on merge; closes #117 part 1 (part 2 re-justified in-issue).

## Suggestion log

Phase 2 run 2026-07-21 (Reduced lane, R26: `sibling-overlap` only — plan-reviewer
dropped). 9 findings:

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| S1 | **Blocking** — story id `maint-30` already claimed by open PR #247 (and, after the scan, #250): both carry it in PR title + commit subjects while their branches are `claude/issue-<n>-<hash>`, so the R23 branch-name check missed it | ADOPT | Renamed to `maint-31` before any commit (plan file was still untracked); re-verified free against `origin/main` + all open PR titles/branches. R23 gap → Phase-5 Try candidate (Risks table) |
| S2 | No open PR/issue independently implements legs 1–2 (scan saw PRs #247, #248 only) | ADOPT (corrected) | Correct for legs 1–2. **Stale for leg 3:** PR #249 opened mid-scan and ships the pixelmatch drop (#57). Leg 3 removed from this plan; drain replaced with #117 part 1 |
| S3 | #107 (shared command-deps base type) targets a different type/file — `CommandDepsBase` inside `src/cli/commands/*` vs. this story's `{config, resolvedDbPath, configService, db}` context in a new module | ACKNOWLEDGE | No action — confirms no overlap; #107 stays open |
| S4 | #117's `writeStubYaml` work is a sibling file inside `tests/_helpers/`, not one of leg 2's additions | ADOPT | Part 1 absorbed as **leg 3** (this session's drain replacement); part 2 re-justified as out of scope (14 scenario sites, 4 feature files) |
| S5 | #110/#109 (categorize internals) sit inside `runCategorizeCommand`; leg 1 only swaps the registration-site resolve block | ACKNOWLEDGE | No action — no overlap |
| S6 | #211's deferred test-logic smells name 3 files that are also leg-2 fixture-hoist targets | ACKNOWLEDGE | Recorded in the Risks table (different regions; #211 has no open PR) |
| S7 | #186 (e2e journeys) is a future consumer of leg 2's `tempdir.ts` | ACKNOWLEDGE | No action — leg 2 makes #186 cheaper, no conflict |
| S8 | The extraction moves the exact `process.exit(result.error.code)` branch #231 wants changed (1 → 2), making it a natural target for an unplanned fix | ADOPT | Byte-identical rule now names #231 explicitly (Selected solution leg 1); added to Risks table as a Phase-4 check |
| S9 | #245 (PRD verbs) and #239 (dod-check R16 range) neither constrain this plan; #239 bears on the *other* maint-30 (Light/R16) | ACKNOWLEDGE | No action — reinforces S1 (unrelated stories, id-only collision) |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — sibling-overlap; Reduced lane): findings triaged above.
- [ ] Draft PR with template sections 1–6 filled.
