# Story 2.5 retrospective

**PR:** #33 (will be linked on merge)  **Closed:** pending merge

Seventh end-to-end run of the product development loop, and the last story of Epic 2 (Ingest Slice). Widest pre-planning surface to date — Plan-agent stress-tested 6 decisions and flipped 2 (including a silent-data-loss correctness bug in the FK-pragma placement); Opus's P1/P2/P3 critical review on the plan surfaced 5 more findings before implementation started. Sonnet delivered 13 implementation commits + Opus added 2 phase-4 fix commits (round-trip idempotency test + `insertHeader` consolidation). 15 story commits on the branch plus this retro = 16. Test count: 151 → 172 → 212. `runIngestCommand` pulled from 97 LOC down to exactly 55 LOC via mandatory `loadAndParse` extraction.

## Keep

- **Plan-agent caught a silent-data-loss correctness bug pre-implementation.** The original plan put `PRAGMA foreign_keys = OFF;` inside the migration SQL file. SQLite silently no-ops that PRAGMA inside a transaction — and the migrator wraps every migration in `db.transaction()`. With today's zero-row DB it's invisible; with any real data the `DROP TABLE transactions` would cascade-delete `transaction_entries`. Plan-agent spotted it; plan moved the toggle into `migrator.ts` **outside** the transaction, and Opus's P3 review further refined it so `PRAGMA foreign_key_check` runs **inside** the transaction — a failed check rolls back both schema changes and the `user_version` bump atomically. Two reviews, two tightenings, zero landed bugs. The formal multi-phase review is paying off on correctness-critical slices.
- **Plan-agent flipped Decision 6 mid-plan; Opus P3 flipped it again to atomic-rename.** Original plan had `lstat` → refuse-if-symlink → `db.backup`. Plan-agent accepted it. Opus P3 review caught the TOCTOU race window between the two syscalls (an attacker with write access to the dir can swap in a symlink after the check, before the write). Fixed to atomic-rename-from-randomised-tmp: `db.backup(${path}.tmp.${pid}.${rand})` → `chmod 0o600` → `renameSync` over target. Rename unlinks any pre-planted symlink **by name** without following it. Test asserts that a pre-planted symlink gets replaced and its target file stays untouched. This is the kind of finding that's nearly impossible to catch post-landing — review layers earned their budget.
- **Plan structure doubled down on phase-4 findings being merged, not deferred.** Phase 4 retro-check (§ 6.1) uncovered 1 P1 blocker (round-trip idempotency scenario missing from integration tests) + 1 P3 major (dead `insertHeaderWithHash` duplicate + a `legacy-placeholder:` hash fallback in `save()`). Both fixed in the same PR before the retro commit. No follow-up issues, no "will do in Story 3.1". The DoD-on-same-PR rule held.
- **Mandatory slice 13 `loadAndParse` extraction worked as designed.** Story 2.4 retro flagged `runIngestCommand` at 97 LOC; Story 2.3 retro action A codified the 60-LOC-plus-duplication trigger. P3 critical review on the plan promoted slice 13 from "possibly empty refactor" to "mandatory extraction bringing the function under 60 LOC". Sonnet delivered `runIngestCommand` at exactly 55 LOC (verified with `wc -l`). The retro-rule → plan-gate → implementation-delivery chain held across two stories. CLAUDE.md § 6.5 refactor-during-green allowance remains calibrated (behaviour-preserving, under 20 LOC touched).
- **Property test caught the hash-population invariant at the Core contract level.** P3 review on the plan added a `fast-check` property: for any `BuildOutcome[]` of size 1..20 with unique ids/hashes, every row's `idempotency_hash` equals its source outcome's hash (1:1 binding, no off-by-one). Ran 50 iterations. Zero off-by-one regressions possible without failing this. Layered atop the individual happy-path + rollback tests.
- **Mock diversity check (Story 2.4 retro action A) actively caught a risk during P2 review.** The phase-4 P2 agent walked the mock diversity rule against `ingest-command-flags.test.ts` and verified `duplicates: [dupItem]` + `errors: [parseErrorRow]` (non-empty fixtures) are asserted against. Prior to this rule (Story 2.4) the same suite would have passed with all-zero mocks and shipped a hardcoded-value regression. Rule is now catching things pre-review.
- **Adapter-story sizing (§ 6.6) didn't apply, but LOC budgeting at the function level did.** Story 2.5 is not an adapter story (it's a multi-layer wire-up: Core types + Infra migration + Infra adapter + CLI orchestration). 13 planned slices delivered + 2 phase-4 fixes = 15 commits on the branch. Target was 10–12; the 15 is justified by the 2 post-review fixes landing in-PR (which is the DoD). If the phase-4 findings had been deferred to a follow-up PR, it would have been 13 — on-target.

## Change

- **Plan's "1000-row perf test" collided with an undocumented Story 2.2 limit.** `SqliteHashRepository.listKnownHashes` has a 999-variable SQLite binding cap (a Story 2.2 known limit — see that story's source). Sonnet discovered it at test runtime and adjusted the perf fixture from 1000 rows to 999. This is a plan-text + reality mismatch that neither Plan-agent nor Opus P1/P2/P3 caught. **Next time:** when planning a perf/benchmark test with a specific N, grep the existing codebase for hard-coded limits (`999`, `1000`, `Number.parseInt`, SQLite-specific caps) before committing to N in the plan. Or — surface known platform limits in a lookup table at `docs/architecture.md` or `docs/engineering-standards.md` so future plans can reference it. File a follow-up issue to lift the 999 cap with chunked lookups. Action item A.
- **Sonnet's "legacy-placeholder" shortcut bypassed the contract tightening goal.** The plan said "`save()` stays as-is for now — not deleted; used by existing round-trip tests". Migration 004 adds `NOT NULL` to `idempotency_hash`, so `save()` had to write the column. Sonnet made `idempotencyHash` optional with a `legacy-placeholder:${tx.id}` fallback rather than making it required and updating the 3 test call sites. The fallback was silent — no production caller used it, but a future caller could skip the hash and pollute the unique index with placeholders. Phase 4 caught it. **Next time:** when the plan says "keep X for test compatibility", Sonnet should either (a) make the contract tightening and update the tests, or (b) explicitly flag "shim added to preserve test compatibility" in the Deviations section. It was not flagged. Extension to CLAUDE.md § 6.3: Deviations must surface "shim-for-tests" compromises. Action item B.
- **Phase-4 P1 retro-check found a missing Gherkin → test mapping.** The plan had a "round-trip idempotency — second ingest yields 0 fresh" scenario, but no test in the implementation matched it. Sonnet's return report didn't flag the missing scenario; the Gherkin → test cross-reference audit in P1 caught it. **Next time:** Sonnet's Deviations section should explicitly list any Gherkin scenarios that did NOT get a test (with rationale), or a short checklist at the end of the report: "Every Gherkin scenario in the plan has a corresponding test? [yes/no + list]". Harder to slip past the review. Informal agreement for now; if it recurs in Story 3.1 codify it.

## Try

- **Plan-phase grep for known platform limits.** When a plan specifies a numeric threshold (1000 rows, 64 KB CSV, 10 MB file, etc.), the Plan-agent should grep for `NNN \|NN\b` literals in the codebase and cross-reference known limits (SQLite `SQLITE_MAX_VARIABLE_NUMBER = 999`, Node stream highWaterMark defaults, etc.). Add to Plan-agent's stress-test checklist. Would have caught the 999 vs 1000 mismatch before commit. Informal for now — if it happens again, promote to a required Plan-agent pass.
- **Phase-4 P1 audit should include "every Gherkin scenario has a corresponding test".** Currently P1 audits "each `fails if …` note identifies the production path it guards". Extend to: "each Gherkin scenario has exactly one test that fails when the production bug in its 'fails if' clause regresses". Action item C.
- **Consider extracting `commitBatch` and `loadAndParse` to their own files** once Story 3.x adds more CLI commands and duplication emerges. For Story 2.5 they live in `src/cli/commands/ingest-command.ts` — the file is now 260 LOC total which is fine, but if Story 3 adds a `transfer` or `reconcile` command with the same snapshot-before-write pattern, extract `commitBatch` to `src/cli/utils/commit-batch.ts`. Don't pre-extract; wait for the second caller.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| A. File issue "Lift `SqliteHashRepository.listKnownHashes` 999-row cap with chunked lookups" | `gh issue create` after PR opens | after PR opens |
| B. Extend sonnet-implementer.md § 4 with "shim-for-tests compromises go in Deviations" rule | `.claude/agents/sonnet-implementer.md` in this PR | in same commit as this retro |
| C. CLAUDE.md § 6.1 phase 4 — "every Gherkin scenario has a test" audit step | `CLAUDE.md` in this PR | in same commit as this retro |

## Loop metrics (seventh run)

- **Plan phase:** 1 maintenance sub-loop + 1 landscape Explore + 1 Plan-agent stress-test (6 decisions, 2 flipped including 1 correctness bug) + Opus P1/P2/P3 critical review on the plan (9 findings total: 3 P3 majors, 2 P3 minors, 2 P1 adopts, 2 P2 adopts — all adopted).
- **Implementation:** 1 Sonnet task (13 commits of 13 planned; 1 green-on-landing sanitize-sql-error unit test commit + 1 green-on-landing perf commit, both per plan's explicit sanction). `runIngestCommand` delivered at exactly 55 LOC.
- **Phase-4 retro-check:** 3 agents (P1, P2, P3) ran in parallel. P1 found 1 blocker + 3 thin spots; P2 found 0 blockers + 1 thin spot; P3 found 1 major + 1 minor. 2 blockers/majors fixed in-PR; non-blockers deferred to follow-up issues.
- **Retro fixes:** 2 commits on top of Sonnet's 13 (round-trip idempotency test + `insertHeader` consolidation + `save()` contract tightening).
- **Issues closed by this story:** #27 (throughput benchmark), #29 (idempotency_hash NOT NULL), implicitly Epic 2 as a whole.
- **Issues deferred:** #21 (dbPath path-traversal — explicitly scope-deferred in plan; surface widens here but full fix is Epic 3 security pass).
- **Issues opened by this story:** 1 (follow-up for Story 2.2's 999-row cap — see action item A).
- **Total commits on branch:** 16 (1 chore-docs + 2 test/feat types + 2 test/feat db-migration + 2 test/feat saveBatch + 2 test/feat snapshot + 2 test/feat cli + 1 test sanitize (green-on-landing) + 1 test+feat perf + 1 refactor-cli loadAndParse + 1 test-cli round-trip + 1 refactor-db consolidate + 1 retro).
- **Test count:** 212 (was 172 after Story 2.4). +40 tests: migration-004 integration (7 sub-cases), saveBatch integration (5 sub-cases), snapshot-service integration (5 sub-cases), sanitize-sql-error unit (7 sub-cases), ingest-commit integration (4 sub-cases — 3 original + 1 retro-fix), perf (1), plus updated unit tests for new types.
- **New runtime deps:** 0. **New dev deps:** 0.
- **Time-to-DoD:** one working session.

### Measured data (story-h4 addendum, 2026-07-02)

`npm run metrics:loop` names story 2.5 the top weight-ratio offender across
all 35 resolvable stories: `plan_loc=608`, `diff_loc=352`,
`weight_ratio≈1.73` — the plan is roughly 1.7× longer than the diff it
produced, the highest ratio on record. Cross-checking against the prose
above: this is the story with 6 stress-tested planning decisions (2
flipped), a 9-finding P1/P2/P3 critical review, and 2 phase-4 fix commits
folded into the same PR — the heaviest front-loaded review process in the
sample, on a story whose actual code delta (352 LOC across migration +
adapter + CLI wiring) was comparatively small. This corroborates the Keep
note above ("review layers earned their budget") with a number instead of
a narrative: the review weight is visible in `plan_loc`, not just in this
file's bullet count. Module 5's framing applies directly — a `weight_ratio`
this high is a retro prompt ("was 608 lines of plan proportionate to a
352-line diff?"), not evidence of waste; two correctness bugs (the FK-pragma
placement, the TOCTOU race) were caught by that same review process before
implementation, which a lighter plan would have risked shipping.

## Carryovers resolved

- Story 2.3 retro action A (60-LOC + duplication trigger) → paid off: P3 critical review promoted slice 13 from "possibly empty" to mandatory `loadAndParse` extraction. `runIngestCommand` delivered at 55 LOC.
- Story 2.4 retro action A (mock diversity check) → codified in CLAUDE.md § 6.1 phase 4 during that story's retro; now actively caught by P2 phase-4 agent on every story.
- Story 2.2 retro action B (Phase-4 `fails if …` audit) → still working: P1 phase-4 agent walked every Gherkin scenario's `fails if …` clause against the test assertion.
- Issue #24 (quickpickle): still open — no action this story. Upstream `pixelmatch` missing-dep bug from Story 2.4 unresolved.
- Issue #26 (PAIEMENT CARTE classifier): closed pre-planning (Story 2.3 had shipped it; issue was stale).
- Issue #27 (throughput <2s): CLOSED. Measured 358 ms on a 999-row end-to-end pipeline (threshold 3000 ms including 1.5× CI headroom).
- Issue #29 (`idempotency_hash` NOT NULL): CLOSED. Migration 004 tightens the column; FK-safe rebuild with inside-tx `foreign_key_check`.

## Epic 2 close-out

Epic 2 ships five stories — **2.1 CSV Parsing & Normalisation** (one-format BPCE adapter + `timezone`/`accounts` config); **2.2 Idempotency** (SHA-256 hash column + read-side dedup); **2.3 Transaction Builder + Auto-Tagger** (config-driven auto-classification, card-settlement reconciliation); **2.4 Interactive Ingest Command** (`@inquirer/prompts` + `cli-table3` + filename-prefix matcher); **2.5 Atomic Commit with Snapshot** (this PR — `db.backup` snapshot + single-transaction batch commit + `idempotency_hash NOT NULL`). The full "Sunday Morning Audit" workflow is now end-to-end shippable: CSV in, reviewed+committed ledger out, safe to re-run. 212 tests.
