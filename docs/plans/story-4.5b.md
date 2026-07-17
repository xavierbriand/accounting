# Story 4.5b — Dissolution Act 1: The Export Bundle (FR21, `DataExported`)

## Context

The export act of dissolution — story-4.5's second slice, itself split at planning:
**4.5b (this story: `accounting export` + `DataExported`) / 4.5c (proof-gated wipe + receipt +
`DissolutionPerformed`)**, user-approved 2026-07-17 alongside four CLI-surface fork decisions
(verbs `export`/`dissolve`; directory bundle; typed-phrase + `--confirm` wipe UX — the last two
verbs/UX items are consumed by 4.5c). A standalone export has value with no wipe at all
(backup, migration); 4.5c completes FR21 and Epic 4 by consuming the export-proof this story
mints.

Two signed model-note amendments landed at this planning (see
[model note § Events](../domain/model-notes/story-4.5.md)): `DataExported` drops `manifestHash`
(circular with invariant 8 — the proof is an artifact in `manifest.json`, not a trail fact) and
`archiveLocation` narrows to the bundle **directory name only** (extends the 4.5a
no-absolute-paths-in-the-trail ruling).

**Lane: Full** — new Core event + new Core port (`DataExporter`); Infra-heavy execution.
**Phase 0: satisfied by the shared model note** (signed 2026-07-17 + the amendments above;
invariants 8–9 are this story's; 6, 7, 10 move to 4.5c).

**Branch:** `story-4.5b`, cut from `origin/main` @ `0d31874` (story-4.5a squash) in the session
worktree — the prior session branch's commits were squash-merged and would pollute a new PR.

**Related open issues (inputs, not blockers):**
[#180](https://github.com/xavierbriand/accounting/issues/180) atomic event recording — the
export's record-before-write ordering is the same at-least-once family ·
[#186](https://github.com/xavierbriand/accounting/issues/186) e2e journeys (export→wipe→re-onboard
is a natural candidate once 4.5c lands) ·
[#155](https://github.com/xavierbriand/accounting/issues/155) domain-events umbrella — fully
fulfilled by 4.1 + 4.5a; **close at this story's DoD**.

### Maintenance sub-loop (§ 6.7) run 2026-07-17 pre-planning (second run this date — fresh state)

- **Sibling work check.** **0 open PRs** (Dependabot #218/#221 resolved after maint-27 shipped
  commander 15 + Node 24). 43 open issues scanned — none implements dissolution; new since the
  morning run: [#229](https://github.com/xavierbriand/accounting/issues/229) (CI npm-audit step,
  harness scope, no overlap).
- **Story-id uniqueness (R23).** No `story-4.5b` or `story-4.5c` file on `origin/main`; no open
  PR branches exist at all. Both ids free (4.5c reserved by the split note in
  [epics.md](../epics.md)).
- **Working tree clean.** Clean; fresh branch tracks `origin/main`.
- **Open issues.** Re-prioritised in passing; #155 closure flagged (above).
- **Backlog refinement.** Not run (optional); tracker scanned manually twice today.
- **Open PRs / Dependabot.** None open.
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** yes.

## Story

> As a **User**, I want `accounting export` to write everything the household owns — ledger,
> audit trail, and a copy of the rules — into a portable, machine-readable bundle with a printed
> proof, so that I can back up or migrate at any time, and later present that proof as the
> authorization for a wipe.

## Domain model

Model note: [docs/domain/model-notes/story-4.5.md](../domain/model-notes/story-4.5.md) (signed
2026-07-17; § Events amended at this planning, user-approved — this story implements the export
act).

- **Glossary terms used:** Dissolution, Export bundle, Audit trail / domain event, Configuration
  (accounting.yaml), Idempotency hash.
- **Glossary deltas:** none — the 4.5 vocabulary landed with 4.5a; the amended `DataExported`
  fields are model-note-level, already user-signed.
- **Tactical roles:** `DataExported` event VO (union member); `DataExporter` (new Core port,
  Infra-implemented: count what will travel, write the bundle atomically, return the proof);
  export is app-boundary orchestration (B1 tradition) — no new aggregate, no Core service.
- **Event emitted:** `DataExported { type; archiveLocation /* bundle dir name only */; exported:
  { transactions: number; events: number } }` — recorded **before** the bundle is written
  (invariant 8), so the bundle's own trail contains it.
- **Invariants in scope:**
  - **8 — self-including trail:** `DataExported` is recorded before the bundle is written; the
    bundle's event log contains the export that produced it.
  - **9 — bundle fidelity:** the bundle's ledger and trail equal the DB's content at export
    time; formats are machine-readable CSV + JSON.
  - (6 wipe-gated-on-proof, 7 receipt-before-wipe, 10 wipe-scope-partition → story 4.5c.)

## Selected solution

`accounting export [--out <dir>] [--json]` — a new ledger-opening command (it receives the 4.5a
ambient config observation like its siblings):

1. Load config, `assertMigrated`, observe config change (existing 4.5a helper). `--out` defaults
   to `./exports`; the value is user-controlled, so it is `path.resolve`d and checked
   (exists-or-creatable, writable) up front with a path-cited error — symlink-hijack hardening
   parity is deferred alongside [#88](https://github.com/xavierbriand/accounting/issues/88)'s
   config-path twin.
2. Ask `DataExporter` for the **counts** of what will travel (transactions, events + 1 for the
   event about to exist).
3. Construct and **record `DataExported`** (bundle directory name + counts) via the 4.1 recorder
   — before any file is written, so the subsequent DB read that feeds the bundle includes it
   (invariant 8 falls out naturally rather than by patching the stream).
4. `DataExporter.writeBundle` — write into `<name>.partial`, fsync, **rename** to the final
   directory (atomic-ish; a crashed export leaves only a `.partial` to sweep, never a
   plausible-but-incomplete bundle). Directory `0700`, files `0600` (security-checklist parity —
   the bundle is everything the household owns). If the target directory already exists
   (same-second repeat), fail with a clear message — an export is never overwritten.
5. Print the bundle location (full path — stdout is for the user, not the trail) and the
   **export-proof**: the SHA-256 of `manifest.json`'s bytes.

**Bundle layout** (`accounting-export-<stamp>/`, stamp from a new seconds-resolution boundary
clock — the existing `nodeClock` is date-only and would collide on same-day exports):
`transactions.csv` (all columns **including `idempotency_hash`** — it is a nullable unique
column on `transactions` (migration 003), not a separate table; a separate hashes CSV would be
fiction) · `transaction-entries.csv` · `domain-events.json` (array, `recorded_at` included,
verbatim from the DB) · `accounting.yaml` (byte-verbatim copy) · `manifest.json`
(`schemaVersion`, `createdAt`, counts, `files: [{name, sha256}]`). `config_state` is **excluded
by design** — a derivable detection cache, not household data; QA's "export is complete — every
byte" reads on the household's own records, and the exclusion is documented in the manifest's
schema notes and the contract doc so nothing is silently missing.

**Failure semantics:** any write failure → exit 1, `.partial` directory removed, error envelope
(`error.code: WRITE_FAILURE` — the registry's "typical exit 4" column becomes "1 (export), 4
(ingest/correct)", an R31 same-PR contract edit) as the final stderr line. Filesystem error
text passes through a **shared `sanitizeFsError`** (generalized out of `YamlConfigWriter`'s
private copy) so absolute paths never reach stderr. The already-recorded `DataExported` row is
tolerated as the known at-least-once family (4.5a's record-then-save precedent; umbrella
[#180](https://github.com/xavierbriand/accounting/issues/180)) — the exit code is the truth about
whether a bundle exists (4.4a emit-then-commit precedent). Exit-code reality (corrected per
review): 0 success · 1 config-load failures (the [#231](https://github.com/xavierbriand/accounting/issues/231)
drift, unchanged here) and export read/write failures · 2 dbPath-validation and Commander-level
`INVALID_ARGUMENT` errors — `export` joins `JSON_CAPABLE_COMMANDS` so the latter get the
envelope under `--json`.

**CSV writing:** hand-rolled RFC-4180 escaper (~15 lines, Infra) — **no new dependency** —
property-tested by **round-tripping through the project's own `csv-parse`** (stringify → parse →
byte-equal rows). Descriptions with commas, quotes, and newlines are the exact fixtures.

Alternatives set aside: `csv-stringify` dependency (R3 audit for a 15-line escaper we can
round-trip-prove ourselves); zip/tar bundle (new dependency for packaging only — directory is
dep-free and spreadsheet-friendly); single JSON file (not spreadsheet-openable; unwieldy at
ledger scale); record-after-write (keeps `manifestHash` on the event but breaks invariant 8's
self-inclusion — rejected by user ruling); `dissolve export` subcommand (buries the standalone
backup value under a destructive verb).

## Production-code surface (R2)

- `src/core/events/domain-event.ts` — union gains
  `DataExported { type: 'DataExported'; archiveLocation: string; exported: { transactions: number; events: number } }`.
- **New** `src/core/ports/data-exporter.ts` —
  `ExportCounts { transactions: number; events: number }`;
  `WrittenBundle { manifestHash: string; location: string }`;
  `DataExporter { counts(): Result<ExportCounts>; writeBundle(destinationDir: string, bundleName: string): Promise<Result<WrittenBundle>> }`.
- **New** `src/infra/export/fs-data-exporter.ts` — constructor DI:
  `new FsDataExporter(db, resolvedConfigPath)` (the boundary passes the path
  `FileConfigService` actually resolved — a small resolved-path getter is added to the service
  if not already exposed); reads via the existing SQLite connection; writes CSVs/JSON/manifest
  into `<bundleName>.partial` under `destinationDir`, renames on success (`0700` dir / `0600`
  files); removes `.partial` on failure.
- **New** `src/infra/export/rfc4180.ts` — the CSV field escaper (pure).
- **New (extracted)** `src/infra/fs/sanitize-fs-error.ts` — generalized from
  `YamlConfigWriter`'s private helper (token parameterized); both call sites use it.
- **New** `src/cli/utils/node-timestamp-clock.ts` — seconds-resolution stamp for bundle names;
  injected like `nodeClock`. *(Phase-4 R2 correction: shipped as
  `nodeTimestampClock(timezone: string): string` with `program.ts` threading
  `config.timezone` — the timezone parameter wasn't enumerated here pre-implementation.)*
- **New** `src/cli/commands/export-command.ts` — orchestration per Selected solution; explicit
  `isFailure` branching, envelope on stderr (house style).
- `src/cli/program.ts` — `export` command wiring incl. the 4.5a `observeConfigChangeFor` call
  **and `export` added to `JSON_CAPABLE_COMMANDS`** (Commander-level parse errors get the
  envelope) (**R4: composition-root subprocess test required** — the new export wiring test
  **plus** `tests/integration/cli/config-change-wiring.test.ts` extended to prove `export` as
  the sixth observed command, per that file's own stated purpose).
- `docs/cli-json-contract.md` — **R31 applies**: new command envelope
  (`data: { location, proof, exported: { transactions, events } }`); `WRITE_FAILURE` "typical
  exit" column widened to "1 (export), 4 (ingest/correct)"; **new "Export bundle format"
  section** documenting the directory layout, manifest schema, proof definition, and the
  `config_state` exclusion (QA § Portability: documented, re-importable format).
- No DB migration; no schema change; no new dependency.

## Gherkin acceptance scenarios

**Scenario 1 — export produces a self-describing bundle with a printed proof.**
**Given** a migrated project with ingested transactions and prior audit events
**When** the user runs `accounting export --out <dir>`
**Then** the command exits 0 and `<dir>/accounting-export-<stamp>/` contains
`transactions.csv`, `transaction-entries.csv`, `domain-events.json`, `accounting.yaml`, and
`manifest.json` whose per-file SHA-256 entries match the files' bytes
**And** stdout prints the bundle location and the manifest's SHA-256 as the export-proof
**And** the DB gains one `DataExported` event whose `archiveLocation` is the bundle directory
name (no path separators) **and that same event appears inside the bundle's
`domain-events.json`** (invariant 8)
**And** the manifest's `counts` and the event's `exported` values are equal and match the actual
row counts in the bundle (non-zero on this fixture)
**And** a second run with `--json` exits 0 with the success envelope carrying those non-zero
`exported` counts (R8 diversity — non-default success shape asserted).
*fails if* the record→write ordering is flipped (event missing from its own bundle), the
manifest hashes don't verify, counts drift from contents, or `archiveLocation` leaks a path.
**Mechanism: subprocess.**

**Scenario 2 — bundle fidelity round-trip.**
**Given** the bundle from an export
**When** its CSVs are parsed back (via the project's own CSV parser) and `domain-events.json`
read
**Then** the parsed rows equal the DB's transactions (including the `idempotency_hash` column)
and entries at export time, row for row, and the event log matches `domain_events` — nothing
dropped, nothing transformed (invariant 9).
*fails if* the exporter's serialization drops rows or mangles fields (commas/quotes/newlines in
descriptions are the fixture). **Mechanism: subprocess.**

**Scenario 3 — failed export leaves nothing plausible behind.**
**Given** an `--out` destination that cannot be written (permission-denied directory)
**When** the user runs `accounting export --out <dir> --json`
**Then** it exits 1 with the error envelope as the final stderr line
**And** no bundle directory and no `.partial` remnant exist under the destination.
*fails if* a half-written directory survives (a plausible-but-incomplete "bundle") or the
envelope is missing (R31 path). **Mechanism: subprocess.**

*(Empty-ledger export — bundle with header-only CSVs, zero counts — covered at
unit/integration tier, § 6.6 sizing.)*

## Slice plan

Target 6–10 slices (R13/R28).

1. `test/feat(4.5b)` — acceptance feature file (failing; green with slice 6) + `DataExported`
   VO + union extension (+ purity guard extends to it).
2. `test/feat(4.5b)` — RFC-4180 escaper + round-trip property through `csv-parse`; shared
   `sanitize-fs-error` extraction (both call sites).
3. `test/feat(4.5b)` — `DataExporter` port + `FsDataExporter` counts + CSV/JSON file writers
   (integration, real SQLite + tmp dirs).
4. `test/feat(4.5b)` — manifest hashing + `.partial` atomic rename + permissions +
   exists-refusal (integration).
5. `test/feat(4.5b)` — `export-command` boundary orchestration: `--out`
   resolution/default/validation, record-before-write ordering, failure semantics, envelope
   (units with port mocks).
6. `test/feat(4.5b)` — `program.ts` wiring (+ 4.5a observe call + `JSON_CAPABLE_COMMANDS`) +
   R4 subprocess tests (new export wiring test + `config-change-wiring` sixth-command
   extension); acceptance scenarios green; `cli-json-contract.md` edits ride this slice's feat
   commit (R31 same-PR).
7. `refactor(4.5b)` — Phase-4 slot (R11 empty-with-justification if none).

*(Landed-slice annotation, Phase 4: 10 slices — slice 2 split into sanitizer + escaper pairs
(reversed order); `node-timestamp-clock` minted its own pair (it was surface-listed but not
slice-listed); an R10 coverage-completion slice landed per the Gherkin section's unit-tier
carve-out; the refactor slot carried real content plus folded Phase-4 fixes. Within R13's 6–10;
retro Change item: derive the slice table from the R2 surface.)*

Docs commits: canonical prep `chore(docs): story-4.5b plan + P1/P2/P3 review` (this file, model
-note amendment, epics split update) and `chore(retro)` at Phase 5 — envelope-exempt (R30).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Stale `DataExported` row when the write fails after recording | Documented at-least-once family (4.5a/4.4a precedent); exit code is the truth; umbrella [#180](https://github.com/xavierbriand/accounting/issues/180) |
| CSV escaping bugs corrupt the bundle | Round-trip property through the project's own `csv-parse`; hostile fixtures (commas, quotes, newlines, leading zeros) |
| Partial bundle mistaken for a real one | `.partial` write + atomic rename; failure path removes the remnant (Scenario 3) |
| Proof drift: manifest hash computed differently at 4.5c consumption | Proof = SHA-256 of `manifest.json` bytes, stated in the manifest's own `schemaVersion` contract; 4.5c recomputes from bytes, never re-serializes |
| Large ledger memory (full-table reads) | Acceptable at MVP scale (single household); streaming noted as a 4.5c-era follow-up if ever real |
| Same-second repeat export collides on the bundle name | Target-exists → refuse with a clear message; never overwrite an export |
| fs error text leaks absolute paths to stderr | Shared `sanitizeFsError` (generalized from `YamlConfigWriter`) on every export error path |

Deferred: **story 4.5c** (wipe act: `dissolve --bundle`, typed-phrase + `--confirm` UX, receipt,
proof + staleness refusal — consumes this story's proof) · export→wipe→re-onboard e2e journey
([#186](https://github.com/xavierbriand/accounting/issues/186)) · #155 closure at DoD.

## Verification plan

- `npm run lint && npm run build && npm test` green locally and on CI.
- Subprocess acceptance scenarios 1–3 against the real binary + real SQLite + real tmp dirs.
- R4: composition-root subprocess test exercises the new `program.ts` wiring.
- R31: `docs/cli-json-contract.md` gains the `export` row in the same PR (checked at review).
- Manual: run `export` on a seeded project, open `transactions.csv` in a spreadsheet, verify the
  proof by re-hashing `manifest.json`.
- `npx tsx harness/drift-scan/drift-scan.ts` and `harness/dod-check` clean at mark-ready.

## Suggestion log

Phase-2 review 2026-07-17: `plan-reviewer` (24 findings) + `sibling-overlap` (0 overlaps, clean
verdict). Compliance confirmations consolidated into row 17.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P1: exit-code mislabel — config-parse failures exit 1 (not 2); exit 2 is dbPath-validation + Commander errors | ADOPT | Selected-solution exit-map corrected; #231 cited honestly |
| 2 | P1: `export` missing from `JSON_CAPABLE_COMMANDS` — Commander parse errors would escape the envelope | ADOPT | Added to R2 `program.ts` bullet |
| 3 | P1: no `error.code` named for export write failure; registry ties `WRITE_FAILURE` to exit 4 | ADOPT | Reuse `WRITE_FAILURE`; contract's typical-exit column widened to "1 (export), 4 (ingest/correct)" (R31 edit) |
| 4 | P1: `DataExporter` had no route to the resolved `accounting.yaml` path | ADOPT | Ctor DI (`db`, `resolvedConfigPath`); resolved-path getter on `FileConfigService` if needed |
| 5 | P1: `nodeClock` is date-only — same-day bundle-name collision | ADOPT | New `node-timestamp-clock.ts` (seconds resolution); target-exists → refuse, never overwrite |
| 6 | P1: R4 wiring-test shape ambiguous | ADOPT | Both: new export wiring test + `config-change-wiring.test.ts` extended to prove `export` as sixth command |
| 7 | P1: `idempotency-hashes.csv` maps a nullable column on `transactions`, not a table | ADOPT | File dropped; `transactions.csv` carries the `idempotency_hash` column; Scenario 2 asserts it |
| 8 | P1/P3: `--out` is user-controlled, unvalidated; no default stated | ADOPT | Default `./exports`; `path.resolve` + writability check, path-cited error; symlink parity deferred with [#88](https://github.com/xavierbriand/accounting/issues/88) |
| 9 | P1: no scenario asserts manifest/event counts | ADOPT | Scenario 1 asserts counts equality (manifest = event = actual rows) |
| 10 | P2: QA "documented and re-importable" not addressed | ADOPT + DEFER | Bundle format documented in the contract doc (this PR); restore command deferred → [#232](https://github.com/xavierbriand/accounting/issues/232) |
| 11 | P2: `config_state` exclusion vs QA "every byte" | ADOPT | Exclusion rationale reconciled in plan + documented in manifest schema notes and contract doc |
| 12 | P2/R8: no `--json` success-path scenario with non-zero counts | ADOPT | Scenario 1 gains a `--json` second-run assertion |
| 13 | P3: fs error text would leak paths; `sanitizeFsError` is private to `YamlConfigWriter` | ADOPT | Extracted to shared `src/infra/fs/sanitize-fs-error.ts`; both call sites |
| 14 | P3: no file permissions stated for the bundle | ADOPT | `0700` dir / `0600` files; integration-asserted |
| 15 | P3/R13: slice 3 bundled four behaviours; slice 5 overloaded | ADOPT | Re-sliced to 7 (writers split from manifest/atomicity; contract-doc edits ride the wiring feat) |
| 16 | P3 (soft): `Result.flatMap` chaining in orchestration | REJECT | House style at the CLI boundary is explicit `isFailure` branching (story-4.1 log #7, 4.5a log #15 precedent; reviewer notes consistency itself) |
| 17 | P1/P2 compliance confirmations (FR21/epic alignment, R24 satisfied, no Money arithmetic, append-only intact, no migration) | ACKNOWLEDGE | No action |
| 18 | Sibling-overlap: 0 overlaps (0 open PRs; 48 issues scanned; no 4.5c/export branches) | ACKNOWLEDGE | Clean verdict recorded |

**Phase-4 review (2026-07-17):** `code-reviewer` (12 findings + 2 soft suggestions, **0
blockers**) + `ddd-modeler` Mode B (**0 hard violations**, 3 observations) in parallel. Fix-now
(folded into the two rebuilt top slices — envelope held at 10): `sanitizeSqlError` on the
`counts()`/`record()` failure paths (sibling parity; raw SQLite errors could leak the DB path);
NULL `idempotency_hash`/`corrects_id` correction-row fidelity fixture (the one production path
producing SQL NULL was untested); exact-five-files bundle guard (pins the `config_state`
exclusion); Core-purity sweep widened to all of `src/core/ports/`; `DataExported` fails-if
docstring lines; inaccurate atomicity-test comment corrected; Scenario-3 tiering note.
Doc-fixes (retro commit): R2 timestamp-clock signature correction; landed-slice annotation.
Acknowledged: `proof` vs "export-proof" shortening (contract-documented; 4.5c note),
snake_case-CSV/camelCase-JSON bundle convention (contract-ratified), function-size
naturally-coarse candidates, spreadsheet numeric-coercion (out of invariant scope). Ratified
Phase-3 deviations stand as reported in PR §8.

## DoR checklist

- [x] Phase 0 (Model): satisfied by the shared, signed story-4.5 model note + this planning's
  user-approved § Events amendments (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): 24 + 0 findings
  triaged above (14 adopted, 1 adopt+defer → [#232](https://github.com/xavierbriand/accounting/issues/232),
  1 rejected with reason, rest acknowledged).
- [x] Draft PR with template sections 1–6 filled:
  [#233](https://github.com/xavierbriand/accounting/pull/233).
