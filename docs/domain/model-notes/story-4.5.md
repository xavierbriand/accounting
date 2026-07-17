# Model note — story-4.5

*(Template: [docs/templates/model-note.md](../../templates/model-note.md). Phase-0 session 2026-07-16/17; ddd-modeler Mode A supplied three candidate shapes; converged in dialogue. Base shape: Candidate A ("ambient sentinel + orchestrated dissolution"), amended by four user decisions recorded below.)*

## Domain question

How does the household record "the rules changed" and "we wound the data down" as first-class,
trustworthy facts in the audit trail — when most rule changes happen in a text editor, and winding
down destroys the very store the trail lives in?

**User discovery answers (authoritative):** dissolution serves **migrating off the app** and
**fresh start** (not separation, not forensic privacy); `ConfigChanged` captures **any change,
however made** — including hand edits detected out-of-band, recorded as a computed diff, never a
claimed intent.

## Terms

Glossary deltas (user signs off exact wording before they land — R25):

- **Used:** Audit trail / domain event, Ledger, Transaction, Partner, Split rule, Buffer,
  Recurring rule, Snapshot, Idempotency hash (its `HashFn` port is reused for config digests).
- **Added:**
  - **Dissolution** *(promoted from Reserved)* — winding the household's data down: exporting
    everything to a portable bundle, then securely resetting the ledger — two deliberate,
    recorded acts.
  - **Export bundle** — the portable, machine-readable archive (CSV + JSON) of everything the
    household owns: ledger, audit trail, and a copy of the config. Standalone value (backup,
    migration) — not only a dissolution step.
  - **Dissolution receipt** — the small local file that remains after a wipe: the
    `DissolutionPerformed` event plus the bundle's manifest hash and location, so an empty app can
    still say what happened and where the history went.
  - **Config change** — the recorded fact that `accounting.yaml` differs from the last state the
    system saw, carried as a field-level old→new diff. Detected changes carry `origin: 'external'`;
    Epic-5's `plan --apply` records the same fact with `origin: 'applied'`.
  - **Configuration (accounting.yaml)** — the household's user-owned rule file. **PII-safe by
    construction:** no field may be designed to hold bank identifiers or other sensitive values
    (accounts are referenced by user-chosen labels), so its values may be quoted verbatim in the
    audit trail and export.
- **Changed:** *Audit trail / domain event* technical note — event-name list gains `DataExported`
  (see Events; the epic named two events, but the two-act dissolution shape makes export its own
  recorded fact).

**Naming caution flagged for sign-off:** the config digest is computed over a *canonical form* of
the config (stable key order; comments/formatting excluded). The glossary's existing
**Canonicalization** term means the ingest ACL (bank CSV → domain shape) — a different concept.
Proposed: keep "canonical form" as plain prose in Config-change technical notes and do **not**
overload the glossary term.

## Model

One bounded context (Shared Finances), no context-map change. Recorder call-site stays **B1
(app-boundary)** per story-4.1; events remain plain immutable VOs in `src/core/events/`, no base
class, boundary-stamped UTC `recorded_at`, no actor.

**Config-change half (ambient sentinel).**

- `ConfigChangeDetector` — **domain service**, pure:
  `detect(previous: StoredConfigState | null, current: AppConfig): Result<ConfigChanged | null>`.
  Returns `null` when canonical digests match, and on `null` `previous` (bootstrap — the caller
  saves the baseline silently).
- `ConfigDiff` — **value object**: `ChangedSection { section, entries: ChangedEntry[] }`,
  `ChangedEntry { key, kind: 'added' | 'removed' | 'changed', previous?, current? }` — values
  **verbatim** (no redaction machinery; safety comes from the Configuration invariant above).
- `ConfigStateStore` — **new Core port**: `getLast()` / `save(state)`. Infra: single-row
  `config_state` table holding the last-seen canonical config + digest. Digest via the existing
  `HashFn` port.
- **Detection moment:** ambient, at the app boundary, on every command run. This deliberately
  **amends story-3.5's "status is read-only: no DB writes" acceptance criterion** — audit
  observation (recording a detected `ConfigChanged` + updating `config_state`) is the one
  sanctioned exception, for every read command (user decision 2026-07-17; the QA/epics wording is
  updated in this story's PR).

  > *Clarifications (story-4.5a Phase-2 review, 2026-07-17).* (a) "Every command run" means every
  > **ledger-opening** command — `categorize` never opens the DB (shipped story-D invariant,
  > subprocess-tested) and is excluded; a change made before a `categorize` run is recorded by the
  > next ledger-opening command. Completeness of the record, not instantaneity, is the promise.
  > (b) `dbPath` is excluded from the canonical form and the diff — an absolute filesystem path is
  > app plumbing, not a household rule, and must not enter the append-only trail
  > (security-checklist § Secrets & PII). (c) Boundary ordering: the event is recorded **before**
  > the new state is saved — at-least-once semantics; a rare duplicate (same digest pair) is
  > tolerated over a lost fact; atomicity rides #180.
- **PII posture:** superseding the reviewed allowlist/masking designs — **manage the risk at the
  source.** The Configuration invariant above bars sensitive fields by design; a Zod-boundary
  tripwire rejects IBAN-shaped and card-number-shaped strings anywhere in the file with a
  path-cited error. Free-text content typed by the user (e.g. a recurring rule's name) is theirs
  and is not policed.

**Dissolution half (two composed acts, boundary-orchestrated).**

- **Act 1 — export** (standalone, any time): boundary orchestration reads ledger + events + config,
  records `DataExported` (so the bundle's own trail includes it), writes the **export bundle**, and
  emits an **export-proof** (the bundle's manifest hash).
- **Act 2 — wipe** (dissolution completion, possibly days later): consumes an export-proof and
  **refuses to run without one that matches an existing bundle**; records `DissolutionPerformed`
  into the **dissolution receipt** (not the doomed DB), then resets the stores.
- **Wipe scope:** SQLite DB (ledger, events, hashes, config_state) + snapshots/`.bak` files.
  **Preserved:** `accounting.yaml` (user-authored; fresh start keeps the household definition) and
  the receipt. A copy of the config still travels inside the bundle.
- **Ports:** `DataExporter` (write bundle, return manifest hash + counts), `StoreReset` (execute
  the wipe). Core contributes only the event VOs and proof-matching logic; no `DissolutionService`
  aggregate — the acts are boundary orchestration in the 4.1 B1 tradition.
- "Secure" reset means deliberate, verified, receipt-leaving deletion — **not** forensic multi-pass
  shredding (out of scope per the discovery answers).

## Invariants

Each becomes a property / unit / integration test (Phase-4 checked):

1. **No-op silence:** `detect(state, cfg)` where digests match → `Result.ok(null)`; no event
   (property over generated configs).
2. **Diff exactness:** exactly the entries whose canonical values differ appear in `ConfigDiff`;
   unchanged entries never appear (property over config pairs).
3. **Cosmetic-edit stability:** YAML key reordering, whitespace, and comment edits produce no
   `ConfigChanged` (property; highest-risk correctness property of the story).
4. **Config PII tripwire:** an IBAN-shaped or card-number-shaped string anywhere in
   `accounting.yaml` fails config parse with a path-cited error (unit + property).
5. **Origin honesty:** the detection path only ever emits `origin: 'external'`; nothing in this
   story emits `'applied'` (unit).
6. **Wipe gated on proof:** `StoreReset` is never invoked without an export-proof matching an
   existing bundle's manifest hash; mismatch/absence → `Result.fail`, stores untouched (unit with
   reset spy).
7. **Receipt-before-wipe:** `DissolutionPerformed` is durably written to the receipt before
   `StoreReset` executes (ordering unit).
8. **Self-including trail:** `DataExported` is recorded before the bundle is written, so the
   bundle's event log contains the export that produced it (integration).
9. **Bundle fidelity:** the bundle's trail and ledger equal the DB's content at export time;
   formats are machine-readable CSV + JSON (integration).
10. **Wipe-scope partition:** after a wipe, DB + snapshots are gone; `accounting.yaml` and the
    receipt remain, byte-identical to before (integration).

## Events

Past-tense, glossary vocabulary; plain VOs; `recorded_at` boundary-stamped, no actor.

- **`ConfigChanged`** — `type`, `origin: 'external' | 'applied'`, `changedSections:
  readonly ChangedSection[]` (verbatim old→new), `previousDigest`, `currentDigest`. This story
  emits only `'external'`; Epic-5 5.4 fills `'applied'` (and may add a `planFile` field then).
- **`DataExported`** — `type`, `archiveLocation`, `manifestHash`, `exported: { transactions:
  number; events: number }`. *(Delta from the epic text, which named two events — sign-off
  covers it.)*
- **`DissolutionPerformed`** — `type`, `archiveLocation`, `manifestHash`, `wipedStores:
  readonly string[]`. Persisted in the dissolution receipt, not the wiped DB.

## Rejected alternatives

- **Per-section digests, zero values (candidate B)** — cannot give #203 magnitudes; superseded by
  the PII-safe-by-construction posture that makes verbatim values safe.
- **Two nouns `ConfigChanged`/`ConfigApplied` (B)** — one fact with an `origin` discriminator
  matches the glossary's existing narration; fewer union members.
- **Last-seen reconstructed from the trail (B)** — makes the audit trail load-bearing
  infrastructure; a payload-schema drift silently turns every run into a "change".
- **Core `DissolutionService` + manifest partition (C)** — models Infra stores as domain
  abstractions; proof-gating at the boundary buys the same safety without the abstraction tax.
- **Redaction allowlist / field masking (A as originally proposed)** — a permanent per-schema-change
  tax; superseded by managing the risk at the source (Configuration invariant + tripwire).
- **Single `dissolve` ritual** — migration wants export → verify elsewhere → wipe later; a
  standalone export also has value with no wipe at all.
- **Archive-only remnant (no receipt)** — a misplaced archive would make the dissolution locally
  unknowable; the receipt is cheap.
- **Wiping `accounting.yaml`** — it is the user's authored household definition; fresh start
  re-onboards the ledger, not the household.
- **Forensic-grade shredding** — the scenario is portability + hygiene, not an adversarial threat
  model.
- **Detection only on mutating commands** — would keep 3.5's read-only AC intact but delay
  detection; the user chose completeness and a deliberate AC amendment instead.

## Sign-off

- User: approved in session 2026-07-17 — note, exact glossary wording, and the `DataExported`
  epic-delta ("let's go"); deltas applied to docs/domain/glossary.md on the same branch (R25).
