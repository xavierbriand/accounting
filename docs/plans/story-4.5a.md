# Story 4.5a — Config-Change Detection & the `ConfigChanged` Event (FR23)

## Context

First half of Epic-4's final story. Story 4.5 split **4.5a (config-change detection +
`ConfigChanged`) / 4.5b (dissolution: export + wipe + receipt)** on the 4.2/4.3 precedent —
two independent behaviours, each with its own acceptance surface. This story completes FR23's
audit-trail triad for config changes (ingests ✓ 4.1, corrections ✓ 4.2, config changes ← here);
4.5b completes FR21. Downstream consumers: Epic-5 Story 5.4 (`plan --apply` fills
`origin: 'applied'`, FR27) and issue
[#203](https://github.com/xavierbriand/accounting/issues/203) (config-change-labelled variance
causes in `explain`).

**Lane: Full** — new Core domain concept (Config change), new event in `src/core/events/`, new
port, DB migration. Phase 0 ran 2026-07-16/17; model note signed off
([docs/domain/model-notes/story-4.5.md](../domain/model-notes/story-4.5.md) — one note covers
4.5a + 4.5b, 4.3 precedent).

**Branch:** session-assigned `claude/story-4-5-explanation-4f0286`, used in place per the
story-ddd-1 session-branch precedent. Rebased on `origin/main` @ `2e2e9d1`.

**Related open issues (planning inputs, not blockers):**
[#203](https://github.com/xavierbriand/accounting/issues/203) `ConfigChanged` consumer ·
[#180](https://github.com/xavierbriand/accounting/issues/180) atomic event recording (UnitOfWork)
— this story's record-then-save ordering leans on it, see Risks ·
[#155](https://github.com/xavierbriand/accounting/issues/155) domain-events umbrella ·
[#215](https://github.com/xavierbriand/accounting/issues/215) empty `TransactionIngested`
(adjacent, unblocked).

### Maintenance sub-loop (§ 6.7) run 2026-07-16 pre-planning

- **Sibling work check.** 5 open PRs, all Dependabot (#218–#222) — no story overlap. 44 open issues
  scanned — none implements 4.5; related issues listed above as planning inputs.
- **Story-id uniqueness (R23).** No `story-4.5*` file in `docs/plans/`, `docs/retrospectives/`, or
  `docs/status.d/` on `origin/main` (re-checked for `4.5a`/`4.5b` after the split); no open PR
  branch carries the id. Free.
- **Working tree clean.** Clean; session branch rebased on `origin/main`.
- **Open issues.** Re-prioritised in passing; filed
  [#223](https://github.com/xavierbriand/accounting/issues/223) (Node runtime upgrade +
  commander 15 maint story).
- **Backlog refinement.** Not run this sub-loop (optional per checklist); tracker scanned manually
  in the sibling-work check.
- **Open PRs / Dependabot dispositions.** Routine minors merged after CI + changelog check:
  [#219](https://github.com/xavierbriand/accounting/pull/219) better-sqlite3 12.11.1 (12.10.0
  dropped Node 20 prebuilds — fed into #223),
  [#220](https://github.com/xavierbriand/accounting/pull/220) zod 4.4.3 (stricter-validation
  notes; full suite green), [#222](https://github.com/xavierbriand/accounting/pull/222)
  @inquirer/prompts 8.5.2. [#218](https://github.com/xavierbriand/accounting/pull/218) dev-deps
  group failed npm `ERESOLVE` — left for Dependabot auto-recreate; re-check next sub-loop.
  [#221](https://github.com/xavierbriand/accounting/pull/221) commander 15 (critical-path
  **major**, ESM-only, Node ≥ 22.12 vs CI's Node 20): **not merged** — escalated to
  [#223](https://github.com/xavierbriand/accounting/issues/223) per policy.
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** yes — no blockers.

## Story

> As a **User**, I want any change to `accounting.yaml` — however made — noticed and recorded in
> the audit trail with exactly what changed, so that explanations and history can name rule
> changes as first-class facts.

## Domain model

Model note: [docs/domain/model-notes/story-4.5.md](../domain/model-notes/story-4.5.md)
(signed off 2026-07-17; covers 4.5a + 4.5b — this story implements the config-change half).

- **Glossary terms used:** Audit trail / domain event, Configuration (accounting.yaml), Config
  change, Buffer, Split rule, Recurring rule, Idempotency hash (`HashFn` reuse).
- **Glossary deltas:** applied on this branch, user-signed (Configuration, Config change, Export
  bundle, Dissolution, Dissolution receipt, `DataExported` in the audit-trail note). 4.5a ships
  them; 4.5b references them.
- **Tactical roles (this story):** `ConfigChangeDetector` (pure domain service), `ConfigDiff` /
  `ChangedSection` / `ChangedEntry` (value objects, verbatim old→new), `ConfigStateStore` (new
  Core port; Infra: single-row `config_state` table), canonical form + digest via existing
  `HashFn` port.
- **Event emitted:** `ConfigChanged` — `origin: 'external' | 'applied'`; this story emits only
  `'external'`. (`DataExported` / `DissolutionPerformed` → 4.5b.)
- **Invariants in scope:** model-note 1–5 (no-op silence, diff exactness, cosmetic-edit
  stability, config PII tripwire, origin honesty). 6–10 → 4.5b.
- **Deliberate AC amendment (user-approved 2026-07-17):** story-3.5's "status is read-only: no DB
  writes" gains one sanctioned exception — ambient audit observation. `docs/epics.md` § Story 3.5
  wording updated in this PR.

## Selected solution

**Ambient sentinel at the app boundary** (model-note Candidate A, amended in session). Every
**ledger-opening** command (`ingest`, `correct`, `status`, `explain` — after config load +
`assertMigrated`; `migrate` — after a successful migration), hands the live `AppConfig` and the
last-seen state to a pure Core detector; on a real difference it records a `ConfigChanged` event
(verbatim field-level diff) and saves the new state; on first run it saves a baseline silently; on
cosmetic edits it does nothing. **`categorize` is excluded:** it never opens the ledger DB — a
shipped story-D invariant enforced by a live subprocess test
(`tests/integration/cli/categorize-end-to-end-wiring.test.ts`) — so a change made before a
`categorize` run is simply recorded by the next ledger-opening command ("any change, however made"
is about completeness of the record, not instantaneity). PII safety is managed **at the source**:
a parse-time tripwire in the config Zod schema rejects IBAN-/card-number-shaped strings, so diffs
may quote values verbatim with no redaction machinery. `dbPath` is excluded from the canonical
form and the diff — relocating the database file is app plumbing, not a household rule, and
absolute paths must not enter the append-only trail
([security-checklist § Secrets & PII](../security-checklist.md)).

Alternatives set aside (full list in the model note): per-section digests (no #203 magnitudes);
two event nouns (`origin` discriminator matches glossary narration); trail-reconstructed last-seen
(makes the trail load-bearing); redaction allowlist (permanent per-schema-change tax, superseded by
source-safety); detection only on mutating commands (user chose completeness + deliberate 3.5 AC
amendment).

## Production-code surface (R2)

- `src/core/events/domain-event.ts` — union gains
  `ConfigChanged { type: 'ConfigChanged'; origin: 'external' | 'applied'; changedSections: readonly ChangedSection[]; previousDigest: string; currentDigest: string }`.
- **New** `src/core/config/config-diff.ts` —
  `ChangedEntry { key: string; kind: 'added' | 'removed' | 'changed'; previous?: string; current?: string }`,
  `ChangedSection { section: string; entries: readonly ChangedEntry[] }`. **Identity mapping for
  nested structures:** entries are keyed by stable identity — buffers/recurring by `name`, accounts
  by `id`, split windows by `validFrom`, auto-tag rules by `pattern`, settlement mappings by
  `account`; an element add/remove is one entry (`kind: 'added' | 'removed'`, the element's
  canonical form as the value); an in-place field edit is one entry keyed
  `<identity>.<field>` with old→new values.
- **New** `src/core/config/config-canonical-form.ts` — `canonicalConfigForm(config: AppConfig):
  string` (stable key order, deterministic JSON; comments/formatting live only in YAML and never
  reach `AppConfig`). Noun-form name on purpose: the glossary's **Canonicalization** term is the
  ingest ACL and is not overloaded (model-note naming caution). **`Money` fields serialize via
  `Money.toString()`** — never the Dinero internal shape, which is not stable across dependency
  bumps; this keeps the digest deterministic across `dinero.js` upgrades and makes diff values
  human-legible ("Car target €1,500.00 → €1,800.00"). **`dbPath` is excluded** (see Selected
  solution).
- **New** `src/core/config/config-change-detector.ts` — `ConfigChangeDetector` (ctor-injected
  `HashFn`): `detect(previous: StoredConfigState | null, current: AppConfig): Result<ConfigChanged | null>`
  — `null` when digests match **or** when `previous` is `null` (bootstrap; caller saves baseline).
- **New** `src/core/ports/config-state-store.ts` —
  `StoredConfigState { canonical: string; digest: string }`;
  `ConfigStateStore { getLast(): Result<StoredConfigState | null>; save(state): Result<void> }`
  (sync, matching the sqlite repo house style).
- **New migration** `src/infra/db/migrations/007-config-state.sql` — single-row table
  `config_state (id INTEGER PRIMARY KEY CHECK (id = 1), canonical TEXT NOT NULL, digest TEXT NOT NULL)`;
  ends with **`PRAGMA user_version = 7;`** — idempotency comes from `migrator.ts`'s
  `fileVersion > userVersion` gate (003/004 precedent), not from `IF NOT EXISTS`.
- **New** `src/infra/db/repositories/sqlite-config-state-store.ts`.
- `src/infra/config/config-schema.ts` (**not** `config-service.ts` — `RawConfigSchema` lives
  here) — Zod tripwire as a **single top-level `superRefine` doing a generic recursive walk over
  the raw parsed object** (future fields are covered automatically; no per-field refinements to
  forget): any string value matching IBAN shape (`[A-Z]{2}\d{2}[A-Za-z0-9]{11,30}` + mod-97 check)
  or card shape (13–19 digits + Luhn) → path-cited parse failure.
- **New** `src/infra/config/sensitive-string-checks.ts` — pure `looksLikeIban` / `looksLikeCardNumber`
  helpers (mod-97, Luhn); Infra-local, next to the schema that uses them.
- **New** `src/cli/utils/observe-config-change.ts` — boundary helper: getLast → detect → on event:
  `record` **then** `save` (at-least-once ordering, see Risks); on bootstrap: `save` baseline; on
  any internal failure: stderr warning, command proceeds (observation never blocks the user;
  state is only saved on success, so the next run re-detects).
- `src/cli/program.ts` — wire the single shared helper into each **ledger-opening** command after
  `assertMigrated` (`ingest`, `correct`, `status`, `explain`) and into `migrate` after a
  successful migration; `categorize` untouched (story-D no-DB invariant). One helper, one call
  per command — broader dedup of `program.ts`'s repeated per-command blocks stays out of scope
  (adjacent: [#107](https://github.com/xavierbriand/accounting/issues/107)).
  (**R4: composition-root subprocess test required**).
- **No `--json` output-shape, error-code, or exit-code mapping changes** → R31 n/a (tripwire
  reuses the existing config-parse exit-2 path).
- Docs: `docs/epics.md` § Story 3.5 AC amendment + § Story 4.5 split/eventing update; glossary +
  model note (already staged on this branch).

## Gherkin acceptance scenarios

**Scenario 1 — external edit detected and recorded.**
**Given** a migrated project whose recorded config state matches `accounting.yaml`
**When** the user raises a buffer target in the file and runs `accounting status`
**Then** the command succeeds, and the `domain_events` table gains one `ConfigChanged` event with
`origin: 'external'` whose diff names the buffer entry with old→new values, and the recorded
config state now matches the file.
*fails if* the observation helper isn't wired at command startup, the detector misses a value
change, or the new state isn't saved. **Mechanism: subprocess** (real binary, real SQLite — R7).

**Scenario 2 — cosmetic edit stays silent.**
**Given** a migrated project whose recorded config state matches `accounting.yaml`
**When** the user reorders keys, adds comments/whitespace (no value change) and runs
`accounting status` twice
**Then** no `ConfigChanged` event is recorded on either run.
*fails if* canonicalization is unstable (key order / formatting leaks into the digest).
**Mechanism: subprocess.**

**Scenario 3 — sensitive value tripwire.**
**Given** `accounting.yaml` containing an IBAN-shaped string in any field
**When** the user runs `accounting status` (representative — the parse gate is shared by every
command via `FileConfigService.load`, before any DB is opened)
**Then** it exits with POSIX code 2 and a path-cited message on stderr, and no event and no DB
write occur.
*fails if* the tripwire refinement is missing from the config schema or doesn't cite the path.
**Mechanism: subprocess.** *(Sentinel fixture values must be clearly synthetic — no real bank
data in fixtures, QA § Privacy.)*

*(Bootstrap — first run saves a baseline silently, no event — is covered at unit/integration tier
(detector + store), not as a fourth acceptance scenario; sizing per § 6.6.)*

## Slice plan

Target 6–10 slices (R13/R28; `test — failing` + `feat — minimal green` pair = one slice).

1. `test(4.5a)/feat(4.5a)` — acceptance feature file + steps (failing) landing with slice 6's
   green; `ConfigChanged` event VO + diff VOs + union extension.
2. `test/feat(4.5a)` — `canonicalConfigForm`: deterministic canonical form + digest via `HashFn`
   (properties: stable under key reorder; `Money` via `Money.toString()` — digest invariant when a
   `Money` value is reconstructed; `dbPath` excluded).
3. `test/feat(4.5a)` — `ConfigChangeDetector`: no-op silence, diff exactness, bootstrap-null
   (properties + units).
4. `test/feat(4.5a)` — `ConfigStateStore` port + sqlite impl + migration 007 (integration:
   round-trip, idempotent migration).
5. `test/feat(4.5a)` — config-schema PII tripwire (units + property: sentinel IBAN/card strings
   anywhere fail with path).
6. `test/feat(4.5a)` — boundary wiring `observe-config-change` + `program.ts`; acceptance
   scenarios green; R4 composition-root subprocess test.
7. `refactor(4.5a)` — post-review refactor slot (R11 empty-with-justification if none).

Docs commits: canonical prep `chore(docs): story-4.5a plan + P1/P2/P3 review` (this file, model
note, glossary deltas, epics amendments) and `chore(retro)` at Phase 5 — both envelope-exempt
(R30).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Canonicalization instability → noise events polluting the trail | Property tests (key-reorder / formatting invariance); canonical form derives from parsed `AppConfig`, so YAML comments/whitespace can never reach it; `Money` via `Money.toString()` so `dinero.js` bumps can't shift the digest |
| Record-then-save partial failure → duplicate `ConfigChanged` on next run | Ordering chosen so the failure mode is a rare duplicate (same digest pair), never a lost fact; atomicity deferred to [#180](https://github.com/xavierbriand/accounting/issues/180) |
| Tripwire false positives (a legit value that looks like an IBAN/card) | Mod-97/Luhn checks (not bare regex); path-cited error tells the user exactly which value; no schema field today plausibly holds such strings |
| Observation failure blocking daily commands | Best-effort: stderr warning + proceed; state saved only on success so detection self-heals next run |

Deferred (issues at Phase-2 tagging if not already tracked): `explain` consumer of
`ConfigChanged` ([#203](https://github.com/xavierbriand/accounting/issues/203), separate story) ·
`origin: 'applied'` emission (Epic-5 5.4) · dissolution half (story 4.5b) · atomic event
recording ([#180](https://github.com/xavierbriand/accounting/issues/180)).

## Verification plan

- `npm run lint && npm run build && npm test` green locally and on CI.
- Subprocess acceptance scenarios 1–3 pass against the real binary + real SQLite.
- Migration idempotency: `migrate` twice on the same DB → second run is a no-op, exit 0.
- R4: composition-root subprocess test exercises `program.ts` wiring.
- `npx tsx harness/drift-scan/drift-scan.ts` clean; `harness/dod-check` clean at mark-ready.
- Manual: edit a buffer target, run `status`, inspect `domain_events` row payload.

## Suggestion log

Phase-2 review 2026-07-17: `plan-reviewer` (27 findings) + `sibling-overlap` (1) in parallel.
Duplicated findings across P-levels are consolidated (P-tags combined).

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P1/P3: tripwire cited `config-service.ts`; `RawConfigSchema` lives in `config-schema.ts` | ADOPT | Surface section corrected |
| 2 | P1: `migrate` never calls `assertMigrated` — wiring claim inapplicable there | ADOPT | `migrate` observes after a successful migration |
| 3 | P1/P2: ambient detection in `categorize` would break story-D's shipped, subprocess-tested no-DB invariant | ADOPT | Detection scoped to ledger-opening commands; `categorize` excluded; model-note clarification added |
| 4 | P1/P2: naive `AppConfig` serialization would embed Dinero internals — digest drifts across `dinero.js` bumps, illegible diff values | ADOPT | Canonical form serializes `Money` via `Money.toString()`; digest-invariance property added to slice 2 |
| 5 | P1: nested→flat diff mapping (arrays, identity, add/remove vs edit) unspecified | ADOPT | Identity-keyed mapping specified in the surface section |
| 6 | P1/P2/P3: migration sketch omitted `PRAGMA user_version = 7` — 007 would re-run every `migrate` | ADOPT | Migration bullet corrected (003/004 precedent) |
| 7 | P1: tripwire mechanism (recursive walk vs per-field refine) uncommitted — per-field risks missing future fields | ADOPT | Single top-level `superRefine` recursive walk over the raw object |
| 8 | P1: Luhn/mod-97 helper location unspecified | ADOPT | `src/infra/config/sensitive-string-checks.ts`, Infra-local |
| 9 | P1: Scenario 3 "any command" not literally testable across the command set | ADOPT | Rephrased to representative `status`; parse gate shared via `FileConfigService.load` |
| 10 | P1: record-then-save ordering is a design decision beyond the signed note's invariants | ADOPT | Boundary-ordering line added to model note § Model |
| 11 | P1/R25: `canonicalizeConfig` verb-form overloads the ingest **Canonicalization** identifier family | ADOPT | Renamed `config-canonical-form.ts` / `canonicalConfigForm` (noun form) |
| 12 | P2/P3: `dbPath` (absolute path, username) would be diffed verbatim into the append-only trail | ADOPT | `dbPath` excluded from canonical form + diff; model-note clarification added |
| 13 | P2: fixture PII — tripwire sentinels must be synthetic | ACKNOWLEDGE | Noted on Scenario 3; Phase-4 retro-check verifies |
| 14 | P3: plan adds another repeated per-command block to `program.ts` without a shared helper | ADOPT (partial) | One shared helper, one call per command; broader `program.ts` dedup stays out of scope ([#107](https://github.com/xavierbriand/accounting/issues/107)) |
| 15 | P3 (soft): use `Result.flatMap` chaining in `observe-config-change` | REJECT | House style at the CLI boundary is explicit `isFailure` branching for per-branch stderr (story-4.1 log #7 precedent) |
| 16 | P3: story-D's claimed ESLint enforcement of the categorize no-DB invariant doesn't exist (only the subprocess test) | DEFER | [#228](https://github.com/xavierbriand/accounting/issues/228) |
| 17 | P2/P3: compliance notes (Money ops, append-only untouched, R8 n/a, layer purity, naming, slice envelope) | ACKNOWLEDGE | No action needed |
| 18 | Sibling: [#224](https://github.com/xavierbriand/accounting/pull/224) (story-maint-26) also edits `program.ts` + composition-root tests; [#227](https://github.com/xavierbriand/accounting/pull/227) executes #223 | ACKNOWLEDGE | Textually disjoint; whichever lands second rebases (R18); no scope change |

## DoR checklist

- [x] Phase 0 (Model): model note committed and signed off (R24) —
  [story-4.5.md](../domain/model-notes/story-4.5.md).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): 28 findings triaged
  above (15 adopted, 1 deferred → [#228](https://github.com/xavierbriand/accounting/issues/228),
  1 rejected with reason, rest acknowledged).
- [x] Draft PR with template sections 1–6 filled:
  [#230](https://github.com/xavierbriand/accounting/pull/230).
