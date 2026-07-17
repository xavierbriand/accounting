# Story 4.5c — Dissolution Act 2: The Proof-Gated Wipe (FR21 completion, Epic 4 finale)

## Context

The wipe act — the last story of Epic 4. Consumes what 4.5b minted: `accounting dissolve
--bundle <path>` verifies the export bundle against its manifest (the **export-proof**), refuses
if the bundle is tampered **or stale** (live data changed since the export), demands deliberate
confirmation (typed phrase interactively; explicit `--confirm` non-interactively), writes the
**dissolution receipt** durably, then wipes the ledger stores — preserving `accounting.yaml` and
the receipt. Completes FR21 and Epic 4.

**Decided surface (user-approved at 4.5b planning, inherited):** verb `dissolve`; typed-phrase +
`--confirm` UX; two composed acts; preserve `accounting.yaml`; archive + local receipt.
**Model note:** [docs/domain/model-notes/story-4.5.md](../domain/model-notes/story-4.5.md)
(signed; invariants 6, 7, 10 are this story's; `DissolutionPerformed` persisted in the receipt,
not the wiped DB). **Lane: Full** — new Core event VO + new Core port (`StoreReset`).
**Phase 0: satisfied by the shared signed note**; two Opus planning calls flagged for review
below (§ Domain model) rather than re-opening the model session.

**Branch:** `story-4.5c`, cut from `origin/main` @ `81a395d` (story-4.5b squash) in the session
worktree.

**Related open issues (inputs, not blockers):**
[#232](https://github.com/xavierbriand/accounting/issues/232) restore-from-bundle (sequenced
after this story — the ritual must exist end-to-end first) ·
[#186](https://github.com/xavierbriand/accounting/issues/186) e2e journeys
(export→dissolve→re-onboard becomes possible after this) ·
[#231](https://github.com/xavierbriand/accounting/issues/231) exit-code drift (this story's
refusal paths use exit 2 deliberately, per the contract's validation semantics — stated in R2).

### Maintenance sub-loop (§ 6.7) run 2026-07-17 pre-planning (third run this date — fresh state)

- **Sibling work check.** **0 open PRs** (#233 merged by the user). Issue tracker unchanged
  since the 4.5b scan except #155 closed and #232 added (both this session's own actions). No
  overlap with the wipe act.
- **Story-id uniqueness (R23).** No `story-4.5c` file on `origin/main`; no open PR branches.
  Free (reserved by the epics split note since 4.5b planning).
- **Working tree clean.** Clean; fresh branch tracks `origin/main` @ `81a395d`.
- **Open issues.** Re-prioritised in passing; nothing new to file.
- **Backlog refinement.** Not run (optional); tracker scanned three times today.
- **Open PRs / Dependabot.** None open.
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** yes.

## Story

> As a **User**, I want `accounting dissolve` to erase the household's ledger stores only after
> verifying my export bundle is genuine and current and after my deliberate confirmation —
> leaving behind my rules file and a receipt saying what happened and where the history went —
> so that winding down is a safe, recorded act that can never destroy data I haven't secured.

## Domain model

Model note: [docs/domain/model-notes/story-4.5.md](../domain/model-notes/story-4.5.md) (signed;
this story implements the wipe act).

- **Glossary terms used:** Dissolution, Export bundle, Dissolution receipt, Configuration
  (accounting.yaml), Snapshot, Audit trail / domain event.
- **Glossary deltas:** none expected.
- **Tactical roles:** `DissolutionPerformed` event VO; `StoreReset` (new Core port,
  Infra-implemented); bundle verification + receipt writing are Infra helpers; the act is
  app-boundary orchestration (B1 tradition) — no new aggregate.
- **Invariants in scope (model note 6, 7, 10):**
  - **6 — wipe gated on proof:** `StoreReset` is never invoked without a bundle whose manifest
    hashes verify **and whose content matches the live stores** (the strict reading — see the
    staleness call below).
  - **7 — receipt-before-wipe:** `DissolutionPerformed` is durably written to the receipt before
    any deletion.
  - **10 — wipe-scope partition:** after a dissolve, the DB + snapshots (+ WAL/SHM siblings)
    are gone; `accounting.yaml` and the receipt remain.
- **Two Opus planning calls (flagged for Phase-2/4 review rather than a model re-session):**
  1. **Strict staleness refusal.** Invariant 6's honest reading: a proof authorizes wiping
     exactly the data it describes. If the live `domain_events` has entries after the bundle's
     own `DataExported`, or the live transaction count differs from the manifest's, the wipe
     refuses and suggests a fresh export (cheap remedy). No `--allow-stale` escape — an archive
     that is missing data must never authorize destroying that data.
  2. **`DissolutionPerformed` is defined in `domain-event.ts` but NOT added to the
     `DomainEvent` union.** The union is "recordable to the trail"; this event is receipt-only
     by signed model note ("persisted in the receipt, not the doomed DB"). Keeping it out of the
     union makes accidental `record()`-ing a type error — the type system enforcing the note's
     sentence. The audit-trail glossary family lists it by *name/shape convention*, which holds.

## Selected solution

`accounting dissolve --bundle <path> [--confirm] [--json]` — a ledger-opening command that
**runs the ambient config observation like every sibling** (Phase-2 reversal of the draft's
skip: an observed config change since the export *correctly* trips the staleness gate below —
the bundle's `accounting.yaml` copy is outdated, so the archive is incomplete; the completeness
promise of model-note clarification (a) holds with no new exception):

1. Load config, `assertMigrated`, `observeConfigChangeFor` (standard wiring).
2. **Resolve the bundle** — `resolveBundleDir(raw, cwd)` in `dissolve-command.ts`: a **read**
   path (unlike `export`'s create-if-missing `--out`): `path.resolve`, must exist, must be a
   directory, refuse a symlinked bundle dir (`lstat`); path-cited error citing the raw value;
   per-file symlink-hardening parity deferred with
   [#88](https://github.com/xavierbriand/accounting/issues/88)'s family.
3. **Verify the bundle:** read `manifest.json`, recompute every per-file SHA-256 and the
   manifest hash (byte-based — never re-serialized, 4.5b proof-drift risk row). Missing
   directory, missing manifest, or any mismatch → refuse, exit 2, nothing touched.
4. **Staleness check (counts-based):** both stores are append-only, so count equality is tail
   equality — the live `DataExporter.counts()` (same port `export` uses, injected here too)
   must equal the manifest's counts exactly, and the bundle's final event must be its own
   `DataExported` (sanity). Any divergence → refuse with "the household's data changed since
   this export-proof was minted — run `accounting export` again", exit 2, nothing touched.
5. **Confirmation:** with `--confirm`, proceed. Without it, the typed **DISSOLVE** phrase is
   prompted after a summary of what will be erased/preserved (new `confirmDissolution` on
   `InteractivePrompter`; `ScriptedPrompter` extended). `--json` without `--confirm` refuses
   with the `NEEDS_REVIEW` envelope, exit 2 (4.4a mode-separation precedent); a prompt that
   throws (non-TTY) exits 2 prose-only per the contract's interactive-failure convention
   *(Phase-4 wording correction — the draft loosely grouped both under the envelope)*. A typed
   refusal aborts cleanly, exit 0, nothing touched.
6. **Receipt before wipe (invariant 7):** write `dissolution-receipt.json` next to
   `accounting.yaml` — `{ schemaVersion, recordedAt (UTC boundary stamp), event:
   DissolutionPerformed { archiveLocation (bundle name), manifestHash, wipedStores }, archivePath
   (full path — a local file, not the trail) }` — write-temp + fsync + rename, **`0600`**
   (sensitive-file-writer parity: `YamlConfigWriter`, `FsDataExporter`).
7. **Wipe:** `closeDb()` first (open handle), then `StoreReset.wipe()` deletes auxiliary files
   first, the DB file **last** (`<dbPath>.bak`, `<dbPath>-wal`, `<dbPath>-shm` where present,
   then `dbPath`) — a partial failure leaves a re-runnable state, never a half-dead ledger.
   Returns the list actually wiped. *(Honesty note: after a clean close, WAL/SHM are usually
   checkpointed away and `.bak` only survives a failed ingest — the wipe handles them
   opportunistically, and the tests plant a stray `.bak` so the multi-file path is real, not
   vacuous.)*
8. Output: human summary (erased list, preserved list, receipt + archive locations, the
   **export-proof** named as such) or the `--json` envelope.

Alternatives set aside: `--allow-stale` escape (an incomplete archive must never authorize the
wipe — strict per invariant 6); recording `DissolutionPerformed` to the DB pre-wipe (a fact in a
store being destroyed; receipt-only per the signed note); in-union event (type-level
misrecording risk); y/N confirm (rejected at 4.5b interview — typed phrase chosen); skipping
observation in dissolve (the draft's position — reversed at Phase 2: observation makes a
config-change-since-export a *detected* staleness cause instead of a blind spot); a live-tail
query port for staleness (unnecessary — append-only stores make count equality tail equality,
so the existing `DataExporter.counts()` suffices).

## Production-code surface (R2)

- `src/core/events/domain-event.ts` — adds
  `DissolutionPerformed { type: 'DissolutionPerformed'; archiveLocation: string; manifestHash: string; wipedStores: readonly string[] }`
  as an exported interface, **not** a `DomainEvent` union member (comment states why; purity
  guard covers the file already).
- **New** `src/core/ports/store-reset.ts` —
  `StoreReset { wipe(): Promise<Result<readonly string[]>> }` (targets ctor-injected in Infra;
  returns the stores actually removed).
- **New** `src/infra/export/manifest.ts` — manifest hashing/verification **extracted from
  `fs-data-exporter.ts`** (both call sites use it; byte-based, never re-serialized).
- **New** `src/infra/export/bundle-verifier.ts` —
  `verifyBundle(bundleDir: string): Promise<Result<VerifiedBundle>>` where
  `VerifiedBundle { manifestHash: string; counts: { transactions: number; events: number }; lastEvent: BundleEvent | null }`
  and `BundleEvent { seq: number; type: string; recordedAt: string }` — the Zod read-back
  schema requires exactly those three fields per event and **passes other fields through**
  (a strict per-type discriminated union would break verification of old bundles when future
  stories add event types; staleness needs only seq/type). The 4.1 forward-pointer (Zod at the
  events read-back boundary) lands here.
- **New** `src/infra/db/fs-store-reset.ts` — `FsStoreReset` (ctor: resolved `dbPath`); wipe
  order aux-first-DB-last; `sanitizeFsError` on failures.
- **New** `src/infra/fs/dissolution-receipt.ts` —
  `writeDissolutionReceipt(receiptPath, receipt): Result<void>`; write-temp + fsync + rename,
  **`0600` mode** (sensitive-writer parity) — durability is invariant 7's teeth.
- `src/cli/utils/interactive.ts` — `confirmDissolution(summary): Promise<boolean>` (typed
  **DISSOLVE** via `@inquirer/prompts` `input`); `src/cli/utils/scripted-prompter.ts` extended.
- **New** `src/cli/commands/dissolve-command.ts` — orchestration per Selected solution; explicit
  `isFailure` branching; envelopes: refusals `INVALID_ARGUMENT`-family… **precisely:** tampered
  bundle / staleness → `NOT_FOUND`? No — **`INVALID_ARGUMENT`, exit 2** (a bundle that fails
  verification is invalid input by the contract's own semantics; the
  [#231](https://github.com/xavierbriand/accounting/issues/231) drift is about *config-load*
  paths and is not extended here); missing `--confirm` non-interactively → `NEEDS_REVIEW`,
  exit 2; receipt-write or wipe failure → `WRITE_FAILURE`, exit 1.
- `src/cli/program.ts` — `dissolve` wiring **with the standard `observeConfigChangeFor` call**
  (Phase-2 reversal — see Selected solution step 1) and `'dissolve'` added to
  `JSON_CAPABLE_COMMANDS` (**R4: composition-root subprocess test required**; the new dissolve
  wiring test plus `config-change-wiring.test.ts` extended to prove dissolve as the seventh
  observed command). `DataExporter` (`FsDataExporter`) is injected for the staleness counts.
- `docs/cli-json-contract.md` — **R31**: `dissolve` envelope row
  (`data: { receiptPath, archiveLocation, wipedStores }`), `NEEDS_REVIEW` usage note, the
  **dissolution-receipt format** documented alongside the bundle-format section, **and
  `dissolve` added to the § Commander-level parse errors literal command list** (it must track
  `JSON_CAPABLE_COMMANDS`). Refusal/success prose says **"export-proof"** (glossary register —
  4.5b retro Try item), pinned by the Gherkin assertions.
- `nodeTimestampClock` reused for the receipt's `recordedAt`? **No** — receipt `recordedAt` is a
  full ISO-8601 UTC instant via `new Date().toISOString()` at the Infra boundary (recorder
  parity), not the filename-safe stamp.
- No DB migration; no schema change; no new dependency.

## Gherkin acceptance scenarios

**Scenario 1 — proof-gated dissolution, receipt left behind.**
**Given** a migrated project with data, a fresh `accounting export` bundle, **and a stray
`<dbPath>.bak` planted** (a prior failed ingest's leftover — so the multi-file wipe path is
exercised, not vacuously satisfied; a cleanly-closed WAL DB has no `-wal`/`-shm` siblings)
**When** the user runs `accounting dissolve --bundle <dir> --confirm --json`
**Then** it exits 0 and the DB file and the planted `.bak` are gone
**And** `accounting.yaml` remains byte-identical and `dissolution-receipt.json` exists beside it
(mode `0600`), carrying `DissolutionPerformed` whose `manifestHash` equals the bundle's manifest
hash and whose `archiveLocation` is the bundle directory name
**And** the envelope's `data.wipedStores` enumerates both deleted files (non-default shape — R8).
*fails if* the wipe runs without verification, the receipt is written after (or not at all), or
the partition (invariant 10) is violated. **Mechanism: subprocess.**

**Scenario 2 — tampered bundle refused, nothing touched.**
**Given** an export bundle with one byte appended to `transactions.csv` after export
**When** the user runs `accounting dissolve --bundle <dir> --confirm --json`
**Then** it exits 2 with an `INVALID_ARGUMENT` envelope naming the failed verification
**And** the DB, snapshots, and `accounting.yaml` are untouched and no receipt exists.
*fails if* per-file hash verification is skipped or a refusal still mutates anything.
**Mechanism: subprocess.**

**Scenario 3 — stale bundle refused with a re-export suggestion.**
**Given** an export bundle, then one more ingested transaction
**When** the user runs `accounting dissolve --bundle <dir> --confirm --json`
**Then** it exits 2, the envelope's message says the data changed since this **export-proof**
was minted and suggests running `accounting export` again, and nothing is deleted.
*fails if* the staleness comparison (live counts vs manifest counts) is missing.
**Mechanism: subprocess.**

*(Unit/integration tier: typed-phrase accept/reject paths; prompt-unavailable without
`--confirm` → `NEEDS_REVIEW`; missing bundle dir / missing `manifest.json` refusals
(verifier tier); wipe order aux-first-DB-last; receipt durability + `0600`; dissolve as the
seventh observed command in `config-change-wiring.test.ts`.)*

## Slice plan

Target 8 planned slices (R13/R28; 4.5b retro — one pair per new module, headroom under the 10
ceiling).

1. `test/feat(4.5c)` — acceptance feature file (failing; green with slice 7) +
   `DissolutionPerformed` VO (out-of-union) + receipt type.
2. `refactor(4.5c)` — **manifest extraction as its own refactor slice** (cross-module move of
   green 4.5b behavior per engineering-standards' refactor classification; `fs-data-exporter`
   onto the shared module, existing tests stay green).
3. `test/feat(4.5c)` — `bundle-verifier` (hash verification, Zod read-back, missing-dir/manifest
   refusals, staleness inputs).
4. `test/feat(4.5c)` — `StoreReset` port + `FsStoreReset` (one slice — the port is types-only;
   its meaningful red is the adapter's failing test; `DataExporter` 4.5b precedent).
5. `test/feat(4.5c)` — `dissolution-receipt` writer (durable, `0600`; integration).
6. `test/feat(4.5c)` — `confirmDissolution` prompter (+ `ScriptedPrompter`) +
   `dissolve-command` orchestration (gating order verify→stale→confirm→receipt→wipe, all
   refusal envelopes; port mocks).
7. `test/feat(4.5c)` — `program.ts` wiring + R4 subprocess tests (dissolve wiring + seventh
   observed command); acceptance green; contract-doc edits ride this feat (R31).
8. `refactor(4.5c)` — Phase-4 slot (R11 empty-with-justification if none).

Docs commits: canonical prep `chore(docs): story-4.5c plan + P1/P2/P3 review` and
`chore(retro)` at Phase 5 — envelope-exempt (R30).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Partial wipe (crash mid-delete) leaves a half-dead ledger | Aux-files-first, DB-last order — any partial state either still has the DB (re-runnable) or is effectively dissolved; receipt already durable before the first delete |
| Receipt written but wipe fails → receipt claims a dissolution that didn't finish | Receipt records intent + proof; command exits 1 naming which stores survived; re-run completes; documented in the contract's receipt-format note (recorded-fact-vs-write-outcome family, umbrella [#180](https://github.com/xavierbriand/accounting/issues/180)) |
| Open DB handle blocks file deletion | `closeDb()` before `StoreReset.wipe()`; wiring test asserts the command doesn't touch the DB after close |
| Staleness check races a concurrent command | Single-user local CLI (one-agent-per-branch analog); WAL sibling deletion after close is safe; accepted at MVP scale |
| Proof drift between 4.5b's computation and this story's re-verification | Shared `manifest.ts` module — one implementation, byte-based, both call sites |

Deferred: restore-from-bundle ([#232](https://github.com/xavierbriand/accounting/issues/232),
now unblocked) · export→dissolve→re-onboard e2e journey
([#186](https://github.com/xavierbriand/accounting/issues/186)) · Epic-4 completion follow-ups
(post-Epic-4 batch: #164/#165/#166) surface at the retro.

## Verification plan

- `npm run lint && npm run build && npm test` green locally and on CI.
- Subprocess acceptance scenarios 1–3 (real binary, real SQLite, real tmp dirs + real bundles
  produced by the shipped `export`).
- R4: dissolve wiring subprocess test + the negative no-observation assertion.
- R31: contract doc gains dissolve row + receipt format in the same PR.
- Manual: seeded project → `export` → `dissolve --bundle` interactively (typed phrase) →
  inspect receipt, confirm `accounting.yaml` intact, `status` fails cleanly on the wiped DB.
- `drift-scan` + `dod-check` clean at mark-ready.

## Suggestion log

Phase-2 review 2026-07-17: `plan-reviewer` (21 findings) + `sibling-overlap` (0 overlaps; #232/
#231 confirmed correctly sequenced/scoped). Consolidated below.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | P1: `BundleEvent` shape / Zod strictness unspecified (4.5b retro's own R2 lesson) | ADOPT | Three required fields + passthrough specified in R2, with the old-bundle-compat rationale |
| 2 | P1: no port named for the live trail tail | ADOPT | Dissolved by design change — append-only stores make count equality tail equality; existing `DataExporter.counts()` reused; live-tail port rejected as unnecessary |
| 3 | P1/P2: Scenario 1's aux-file "gone" assertions vacuous (clean close checkpoints WAL; ingest removes `.bak`) | ADOPT | Stray-`.bak` planted in the Given; wipedStores asserts the multi-file shape (also resolves the R8 non-default-mock gap) |
| 4 | P1: "non-interactive" undefined for dissolve | ADOPT | `--confirm` bypasses; otherwise typed-phrase attempted; prompt-unavailable → `NEEDS_REVIEW` exit 2; unit-tier item added |
| 5 | P1/P3/R25: strict-staleness extends signed invariant 6 without a note amendment | ADOPT | Dated amendment added to model note § Invariants 6 (4.5b amendment pattern); flagged for user review + Mode B scrutiny |
| 6 | P1: receipt-vs-wipe risk row missing the #180 cross-reference | ADOPT | Linked |
| 7 | P1/R31: contract's Commander-parse-error literal command list needs `dissolve` | ADOPT | Added to the R2 contract bullet |
| 8 | P1: `--bundle` resolution unnamed; read-path semantics differ from `--out` | ADOPT | `resolveBundleDir` named: resolve, must-exist, must-be-dir, symlinked-dir refused; per-file parity deferred with [#88](https://github.com/xavierbriand/accounting/issues/88) |
| 9 | P1: missing-bundle/missing-manifest refusal had no named test | ADOPT | Unit/integration-tier list extended (verifier tier) |
| 10 | P2: receipt file permissions unstated | ADOPT | `0600` + write-temp/fsync/rename (writer parity) in R2 and Scenario 1 |
| 11 | P2: observation skip contradicts the note's completeness promise; retry-path blind spot | ADOPT (reversal) | Dissolve now runs `observeConfigChangeFor` like every sibling — an observed config change *correctly* trips staleness (the bundle's config copy is outdated); negative wiring test replaced by the seventh-command extension |
| 12 | P2: "export-proof" register unpinned in user-facing wording | ADOPT | Pinned in Scenario 3's Then + R2 contract bullet (4.5b retro Try item) |
| 13 | P3: `--bundle` symlink/normalization gap (security-checklist) | ADOPT (partial) | Bundle-dir `lstat` refusal now; per-file hardening deferred with #88's family |
| 14 | P3/R13: slices 2/5 bundled multiple modules; 7 < retro's ~8 guidance | ADOPT | Re-sliced to 8 — manifest extraction isolated, verifier separate, prompter+command one behaviour slice |
| 15 | P3: manifest extraction is refactor-classified work inside a test/feat slice | ADOPT | Slice 2 is now a standalone `refactor(4.5c)` commit (green-preserving cross-module move) |
| 16 | P3: port+impl in one slice vs 4.1's three-way split | REJECT | The port is types-only; its meaningful red is the adapter's failing test; 4.5b `DataExporter` precedent (4.1's extra slice was its migration, absent here) |
| 17 | P3: use-case-pattern tension (architecture.md vs B1 boundary orchestration) | ACKNOWLEDGE | Pre-existing since 4.1; reconciliation belongs to the post-Epic-4 docs refresh ([#166](https://github.com/xavierbriand/accounting/issues/166)) |
| 18 | P3 (soft): Result-combinator chaining in the gating pipeline | REJECT | House style at the CLI boundary — explicit `isFailure` branching (fourth story running; reviewer notes the idiom itself) |
| 19 | P1/P2 compliance confirmations + sibling scan (0 overlaps; #232/#231 pre-reconciled) | ACKNOWLEDGE | No action |

**Phase-4 review (2026-07-17):** `code-reviewer` (8 findings — 1 P1, 1 P2, 6 P3 mostly soft,
**0 blockers**) + `ddd-modeler` Mode B (**0 hard violations**, 2 observations + 1 confirmation +
1 glossary gap) in parallel. Fix-now (refactor slot + one R10 slice, envelope at 10):
`sanitizeSqlError` on dissolve's counts() failure (export parity); the **staleness-coupling
subprocess test** (Mode B's catch — config edit after export → refusal, DB intact; removing the
observation wiring now has a failing test); typed-phrase trim-edge cases; two fails-if docstring
extensions. Doc-fixes (retro commit): plan step-5 NEEDS_REVIEW wording; model-note § Model
proof-matching clarification (shipped shape more faithful to B1 than the literal sentence);
**glossary "stale export-proof" delta proposed** (user sign-off at the gate). Acknowledged:
`runDissolveCommand` 104 LOC / `verifyBundle` 64 LOC (naturally-coarse gate pipelines),
async-without-await port conformance, receipt full-path vs event basename split (intentional,
confirmed). Ratified Phase-3 deviations stand as reported in PR §8.

## DoR checklist

- [x] Phase 0 (Model): satisfied by the shared, signed story-4.5 model note; two Opus planning
  calls flagged in § Domain model for review (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): 21 + 0 findings
  triaged above (15 adopted incl. one design reversal, 2 rejected with reason, 2 acknowledged).
- [x] Draft PR with template sections 1–6 filled:
  [#234](https://github.com/xavierbriand/accounting/pull/234).
