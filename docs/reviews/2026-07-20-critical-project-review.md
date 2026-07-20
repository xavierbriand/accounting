# Critical Project Review — 2026-07-20

Three-persona critical review requested by the user: product manager, senior software
engineer, senior test engineer. Findings were gathered by three parallel research passes
(product docs + CLI surface; `src/` architecture with grep-verified claims; `tests/` +
CI configuration) and disputed numbers were re-verified directly against the tree.

Snapshot reviewed: `origin/main` as of 2026-07-20 (last product commit: story-E ingest
bugfix; last merge: story-h13).

---

## 1. Product manager: where is this product at?

### Verdict

**A real, working MVP exists — and product motion has stalled into process.** Epics 1–4
are complete and the claims in [status.md](../status.md) check out against real code.
But the backlog history shows the project spending roughly three quarters of its effort
on its own development process, Epic 5 is unstarted, and the PRD has drifted from what
actually shipped without being reconciled.

### What genuinely works today

Eight commands are registered in `src/cli/program.ts`: `migrate`, `ingest`, `correct`,
`status`, `explain`, `export`, `dissolve`, `categorize`. Together they cover FR1–FR23
(Epics 1–4): CSV ingestion with idempotent dedup and interactive tagging, buffer status
with safe-transfer breakdown, month-over-month settlement variance explanation,
reverse-and-correct corrections, portable export, and verified dissolution. All
user-facing commands honour the maintained JSON contract
([cli-json-contract.md](../cli-json-contract.md)) with a uniform envelope, error-code
registry, and exit-code table — the agent-facing surface is real and current (R31).
No phantom claims were found: every capability status.md declares has corresponding
commands, migrations (001–007), and event recorders.

### The critical findings

1. **Process work outweighs product work roughly 72% / 28%.** Of ~67 planned stories,
   19 plans / 23 retros are product stories (1.x–4.x); 48 plans / 49 retros are
   harness, maintenance, or process stories (maint-01…28, h1…h13, ddd-1/2, A–E).
   The entire post-Epic-4 period (since 2026-07-17) shipped zero new product features:
   one overdue bugfix (story-E, #93/#103), then harness and maintenance work. The most
   recent status fragment's "Next" line points at another harness story (h14, thesis
   refresh) — not at Epic 5.

2. **Epic 5 is unstarted despite being declared the top "Next" candidate.** Zero plans,
   zero retros, zero code for FR24–FR27 (`config plan --review/--revise/--apply`).

3. **The PRD's MVP verb set was never reconciled with reality.** `docs/prd.md` promises
   five core verbs (`ingest`, `status`, `settle`, `config`, `correct`). Two never
   shipped as commands: `settle` (the capability was folded into `status` + `explain`,
   arguably a better design — but the PRD still promises the verb) and `config` (config
   is hand-edited YAML today; the command arrives only with Epic 5). Meanwhile three
   commands the PRD never scoped exist (`categorize`, `export` as a standalone verb,
   `migrate`). The PRD is now a historical document, not a live one.

4. **No evidence of real usage.** Nothing in status.md or the retros indicates the
   product is being dogfooded by an actual couple on actual bank exports. This matters
   doubly because Epic 5's entire premise is "derive buffer targets from a year of
   evidence" — evidence that only accrues if the product is used. Every week spent on
   harness work instead of dogfooding delays the only epic that depends on data.

5. **The process flywheel is self-feeding.** Harness stories generate retro rules
   (32-row provenance table), which generate drift-scan checks, which generate more
   harness stories. The recent "subtraction" story (h13) shows awareness, but the
   trajectory since Epic 4 closed is still process-dominant.

### Recommendations

- Declare the MVP shipped and **start dogfooding now** — real CSVs, real months. This
  unblocks Epic 5's evidence requirement and is the only way to learn whether the
  predictive engine's outputs are actually trusted by its two users.
- Reconcile the PRD: either rename/absorb `settle` and `config` formally, or ship thin
  aliases. A PRD that disagrees with the shipped surface erodes its authority.
- Cap process work explicitly (e.g. at most 1 harness story per product story) until
  Epic 5 lands.

---

## 2. Senior software engineer: architectural quality and changeability

### Verdict

**The architecture inside `src/` is genuinely high quality — enforced, not
aspirational. The changeability problem is everything around it.** The product is
7,256 lines of TypeScript; the repository carries roughly 8× that in tests, docs,
harness tooling, and custom lint. A newcomer will understand the domain code in a day
and spend a week learning how to be allowed to change it.

### What was verified (not just claimed)

- **Layering holds.** Grep of `src/core/**` for `better-sqlite3`, `node:`, `fs`,
  `path`, `process`, `commander`, `zod`, `yaml`: zero hits. The only external import
  in core is `dinero.js` in `src/core/shared/money.ts`. Zod lives exclusively at the
  infra boundary (`src/infra/config/config-schema.ts`).
- **DI is real.** 14 port interfaces in `src/core/ports/`; `src/cli/program.ts` is a
  genuine hand-wired composition root; core services take collaborators via
  constructor. No service containers, no `new SqliteX` inside core.
- **Result discipline is consistent.** `Result<T,E>` (`src/core/shared/result.ts`,
  67 LOC) threads through all core services. The five `throw` sites in core are
  invariant guards (misuse of `Result` itself, unwired-builder guard), not control
  flow.
- **Append-only ledger holds.** `sqlite-transaction-repo.ts` is INSERT + SELECT only;
  corrections are new reversal + correcting entries. The single `UPDATE` in infra is a
  config-snapshot upsert (not ledger); the only DELETEs are the sanctioned dissolution
  wipe path.
- **Money is properly encapsulated.** dinero.js is a private field, never leaked;
  cross-currency ops fail with `Result`; banker's rounding on `fromDecimal`;
  allocation via largest-remainder so splits sum exactly.
- **The domain is not anemic.** `Transaction` (`src/core/ledger/transaction.ts`) is a
  rich entity: private constructor, factory enforcing ≥2 entries, single currency,
  debits == credits. A newcomer learns double-entry from that one file.
- **Hygiene:** no `any`, no TODO/FIXME in src/, explicit return types on exports,
  small files (median well under 100 LOC), comments explain *why* only.

### Concrete smells (all in-scope, all fixable)

1. **`program.ts` (560 LOC) is the god-file and has real duplication.** The
   *resolve-db-path → check failure → getDb → assertMigrated → observeConfigChange*
   block is copy-pasted near-identically across 6–7 command actions (~15 lines each).
   One `withLedgerCommand(...)` wrapper would remove ~90 lines and, more importantly,
   make the next command impossible to wire subtly differently. This file is also the
   one every story touches (the repo's own R4 rule exists because of it).
2. **The layer rule is enforced by convention only.** There is no
   `no-restricted-imports` / boundary rule in `eslint.config.js` — ironic, given 785
   lines of custom ESLint exist for *test smells*. One misdirected import in a future
   PR would land silently. This is the cheapest high-value fix in the repo.
3. **Duplicated cents-parser.** `node-csv-parser.ts` and `correct-command-options.ts`
   carry near-identical string→cents logic (the latter's comment admits it "mirrors"
   the former). Money parsing is exactly the code that must exist once.
4. **`src/cli/utils/printer.ts` hardcodes `/100` + `toFixed(2)`** for display,
   bypassing `Money.toString()` which correctly uses the currency exponent. Latent bug
   for any non-2-exponent currency; inconsistent with the discipline everywhere else.
5. **Result plumbing is verbose.** `flatMap` exists but the dominant idiom is a dozen+
   manual `if (x.isFailure) return Result.fail(x.error)` per service
   (`settlement-variance-service.ts`, `safe-transfer-calculator.ts`). Correct, but
   noisy; and `transaction.ts` unwraps one known-safe `.value` unchecked, breaking its
   own rule.
6. **Mixed import styles** — 40 core files use the `@core/` alias, 15 use relative
   paths. Cosmetic, but inconsistency in a repo this disciplined stands out.

### The changeability headline

For 7,256 lines of product: ~25,500 lines of tests, ~25,500 lines of docs (15,784 of
which are plans, 4,224 retros), 8,626 lines of harness tooling (a second codebase with
its own tests), 785 lines of custom lint, and a 264-line CLAUDE.md with a 32-rule
provenance table. The apparatus is internally consistent (drift-scan mechanically
enforces doc↔rule↔spec coherence), which is impressive — but the cognitive surface a
contributor must absorb before their first compliant PR is dominated by process, not
domain. The code is easy to change; the *project* is expensive to change.

---

## 3. Senior test engineer: quality, coverage, evolvability

### Verdict

**Exceptional testing discipline with one structural embarrassment: the flagship
"100% branch coverage on `src/core`" claim is not machine-verified — coverage tooling
is not wired into the config or CI at all.**

### Strengths (unusual ones, worth naming)

- **Volume with substance:** 1,085 unit/integration cases + 80 Gherkin scenarios + 96
  fast-check properties over 7,256 src LOC (≈3.5:1 test:src).
- **Assertion specificity is near-perfect:** 12 `toBeDefined()` in the entire suite,
  zero `toBeTruthy/Falsy`, zero snapshots. Money tests assert banker's-rounding cases
  exactly; repo round-trips assert every field; `toThrow` assertions match specific
  constraint messages.
- **Property tests are real property tests.** Allocation sum == total, add
  associativity, split ratios sum to 1.0 for any in-range date, window uniqueness at
  boundaries, settlement variance with 10+ numbered invariants including determinism.
  Generators are thoughtful (custom days-since-2000 date generator avoiding
  `fc.date()` edge cases; bounded cents/ratio ranges) — and the allocation file
  documents *why* distributivity doesn't hold and tests the correct weaker invariant.
- **Integration tier is honest:** real `better-sqlite3` (`:memory:` + on-disk), WAL +
  FK pragmas explicit, per-migration tests asserting `PRAGMA user_version`, NOT NULL
  flags, singleton CHECK constraints, and idempotent re-runs. Temp hygiene is clean
  (`mkdtempSync` + drained cleanup arrays, even `realpathSync` for macOS symlinks).
- **Gherkin is behavior, not ceremony:** exact-value scenarios with `# fails if`
  annotations naming the mutation each scenario would catch.
- **A self-enforced test-smell lint layer** (10 custom rules, themselves unit-tested):
  no ignored tests, no unasserted tests, no duplicate/tautological asserts, no real DB
  in core unit tests (structurally enforcing mock-the-port).

### Weaknesses

1. **The coverage claim has no regression barrier.** `vitest.config.ts` has no
   coverage block; CI (`.github/workflows/ci.yml`) never passes `--coverage`;
   `@vitest/coverage-v8` is not installed. The 100%-branch claim rests on manual
   enumeration, admitted in the plans themselves (e.g. story-3.3: "verified… via
   manual enumeration (no @vitest/coverage-v8 installed yet)"). A newly-added
   uncovered branch in core passes CI silently today. For a project this rigorous,
   this is the most surprising gap — and the cheapest to close.
2. **193 untriaged `conditional-test-logic` warnings.** Warn-level, acknowledged in
   the config as "needs a human triage pass", never done. A warning wall this size is
   functionally invisible.
3. **Fixture duplication taxes evolvability.** `makeTmpDir` reimplemented in 27 files,
   `makeEur` in 12, plus repeated no-op port stubs. `tests/_helpers/` exists and is
   good (`spawnCli`, `writeStubYaml`, envelope types reused from production) but the
   fakes never got hoisted. Adding a new command's tests means re-copying scaffolding.
4. **~50 CLI-output string assertions, some on human prose** ("error contains 'Car'
   and… phrase 'set a new targetDate'") — wording-fragile. The contract-anchored ones
   (error codes, envelope fields) are fine; the prose ones will break on copy edits.
5. **Split acceptance mechanism:** 8 of 15 feature files drive the real dist CLI as a
   subprocess; 7 run in-process against core services with fakes. Deliberate and
   labeled per-file, and the integration tier backstops wiring — but "all BDD green"
   does not uniformly mean "the shipped binary works" across features.

### Recommendations (ordered by value/cost)

1. Install `@vitest/coverage-v8`, add a coverage block with 100%-branch threshold on
   `src/core/**`, run it in CI. One afternoon; converts the flagship claim from prose
   to a gate.
2. Hoist `makeTmpDir`, `makeEur`, and the no-op port stubs into `tests/_helpers/`.
3. Triage the 193 conditional-test-logic warnings once; add `fc.pre`/cleanup-guard
   exclusions to the rule and promote it to error.
4. Prefer envelope/error-code assertions over prose in the ~50 string assertions.

---

## 4. Cross-cutting conclusion

This is one of the most disciplined small codebases either reviewer persona will see:
verified hexagonal layering, real DI, honest append-only ledger, encapsulated money,
rich domain entities, and a test suite with near-zero weak assertions and genuine
property-based invariants. The engineering *quality* question is settled.

The critical risks are all one level up:

1. **The process has become the product.** ~72% of story volume is harness/process;
   post-Epic-4 output is 100% process plus one bugfix; Epic 5 — the only remaining
   product epic, and the one that needs real usage data — is untouched.
2. **The two claims most load-bearing for trust are convention-enforced:** the core
   dependency rule (no boundary lint) and the 100%-branch-coverage claim (no coverage
   tooling). Both have one-afternoon mechanical fixes, and the project's own ethos
   (drift-scan, dod-check) argues for exactly that kind of enforcement.
3. **The PRD has silently drifted** from the shipped surface (missing `settle` and
   `config` verbs, unscoped `categorize`).

Top five actions: wire coverage into CI · add the import-boundary lint rule · extract
the `program.ts` per-command wrapper and shared test fakes · reconcile the PRD verb
set · time-box harness work and start Epic 5 by dogfooding real data.
