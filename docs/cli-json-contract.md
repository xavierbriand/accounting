# CLI JSON Contract

FR20 (docs/prd.md § Functional Requirements, § Dual Output): every command supports
`--json` for machine-readable output. This document is the authority for that contract —
the envelope, the failure discipline, the naming conventions, and each command's `data`
shape. It targets **scripts and LLM agents** driving the CLI (docs/plans/story-4.4b.md);
there is no other consumer as of this writing, so the shapes here are not yet
version-locked (see "Versioning" below).

**Keeping this document true (R31):** any PR that changes a `--json` output shape, an
error code, or an exit-code mapping must update this document in the same PR
(CLAUDE.md § 8).

## 1. The envelope

Every `--json` command emits exactly one of two shapes, always as a single compact
JSON line (`JSON.stringify(...)`, no pretty-printing) terminated by `\n`:

```jsonc
// success
{ "command": "status", "ok": true, "data": { /* command-specific */ } }

// failure
{ "command": "ingest", "ok": false, "error": {
  "code": "NEEDS_REVIEW",
  "message": "2 item(s) need manual review.",
  "suggestedAction": "Run without --non-interactive to review them...",
  "details": { /* optional, error-code-specific payload */ }
} }
```

`ok` is the discriminator — parse with one rule regardless of command or outcome.
`command` names the subcommand that produced the document (`status`, `explain`,
`correct`, `ingest`, `categorize`, `export`, `dissolve`). `error.suggestedAction`
and `error.details` are present only when the failure has something concrete to
add; absent otherwise (never `null` or an empty object as a placeholder).

## 2. Streams discipline

- **stdout carries data; stderr carries prose and, under `--json`, the failure
  envelope.** Under `--json`, a success document is the *only* thing ever written to
  stdout — no prose, no warnings.
- **The error envelope is the final stderr line.** Prose progress/warning lines (e.g.
  `Found 5 new transactions...`, `Snapshot retained at ... for recovery.`) may precede
  it; a consumer parsing machine-readably reads the **last** line of stderr on failure.
- **Branch on exit code before trusting stdout.** `ingest`'s non-interactive commit
  path writes the success-shaped JSON document to stdout *before* attempting the
  database commit (`commitBatch`'s own success path calls `process.exit(0)` at the
  composition root, which would otherwise silently drop a stdout write attempted after
  it — the emit-then-commit order is intentional, not a bug). If that commit then fails
  (exit 3 snapshot failure, exit 4 write failure), stdout already holds a success-shaped
  document *and* stderr's final line holds the `SNAPSHOT_FAILURE`/`WRITE_FAILURE`
  envelope. **Always check the exit code first.** A non-zero exit means the stdout
  document, if any, does not describe a completed action — read the stderr envelope
  instead. This is the single most important rule in this contract for a scripted
  consumer.
- Interactive-only failure paths (user cancels a confirm prompt, aborts a per-item
  review, declines `dissolve`'s typed DISSOLVE phrase) are unreachable under `--json`
  (`ingest`/`correct`/`status`/`explain`/`dissolve` route around the interactive
  branch when `--json` or `--non-interactive`/`--confirm` is set; categorize's
  `--json` can still combine with its interactive prompt loop — see § 5) and stay
  prose-only; there is no envelope to parse for those.

## 3. Exit codes

Unchanged by this contract — every exit code below existed before story-4.4b; the
codes only gained a matching `error.code` under `--json`.

| Exit | Meaning |
| --- | --- |
| 0 | Success (including `dissolve`'s typed-refusal clean abort — interactive-only, no `--json` envelope) |
| 1 | Unrecoverable read/query failure (DB unreachable, file unreadable, currency mismatch); for `export`, also every write failure (`--out` unwritable, audit-event record failure, bundle write failure) — `export` has no snapshot/rollback pipeline to reserve exit 4 for, so `WRITE_FAILURE` maps to exit 1 there (story-4.5b); `dissolve` follows the same reservation-free mapping for its own receipt/wipe write failures (story-4.5c) |
| 2 | Input validation failure, not-found, or a pending decision under non-interactive/`--json` (needs review) — `dissolve`'s bundle-verification and staleness refusals are `INVALID_ARGUMENT` here too (bad input by the contract's own semantics, not a distinct exit-code family; [#231](https://github.com/xavierbriand/accounting/issues/231)'s drift is about config-load paths and is not extended to dissolve) |
| 3 | Pre-commit snapshot failed (ingest only) |
| 4 | Batch write failed after a successful snapshot (ingest/correct) |
| 5 | `accounting.yaml` config write failed (categorize/ingest's interactive remember-rule path) |

## 4. Error-code registry

| Code | Meaning | Typical exit |
| --- | --- | --- |
| `INVALID_ARGUMENT` | Bad flag/date/option value; source-account filename resolution failed; `dissolve`: `--bundle` resolution failure, export-proof verification failure, or a stale export-proof (live counts diverge from the manifest, or the bundle's own last event isn't `DataExported`) | 2 |
| `NOT_FOUND` | `correct`: target transaction id does not exist | 2 |
| `NEEDS_REVIEW` | `ingest`/`categorize`: a decision is pending under non-interactive/`--json`; `dissolve`: `--json` without `--confirm` (the typed-phrase prompt is unreachable under `--json`, same mode-separation precedent as `ingest`/`categorize`'s own non-interactive routing) | 2 |
| `READ_FAILURE` | Input file unreadable, or CSV parse failure | 1 |
| `QUERY_FAILURE` | Repository/read-model failure — idempotency check, buffer state, contribution query, `findById`, transaction build, `export`'s pre-flight count of what will travel, `dissolve`'s live-counts read for the staleness check | 1 |
| `SNAPSHOT_FAILURE` | Pre-commit DB snapshot failed | 3 |
| `WRITE_FAILURE` | `saveBatch`/`saveCorrection` failed (batch rolled back; snapshot retained on ingest); `export`'s `--out` resolution/validation failure, `DataExported` record failure, or bundle write failure; `dissolve`'s dissolution-receipt write failure (nothing deleted yet) or `StoreReset.wipe()` failure (receipt already durable — re-run completes it) | **1 (export, dissolve), 4 (ingest/correct)** |
| `CONFIG_WRITE_FAILURE` | `accounting.yaml` auto-tag-rule append failed (mtime race or pattern conflict) | 5 |

`NOT_FOUND` and `NEEDS_REVIEW` both disambiguate what used to be an overloaded exit 2 —
check `error.code`, not just the exit code, to tell "bad input" from "nothing matched"
from "a human decision is needed."

### Commander-level parse errors (story-maint-26)

A missing required option/argument, an unknown option, or excess arguments are
caught by Commander's own parser **before any command's action handler runs** —
these used to bypass this contract entirely (Commander's plain-text prose to
stderr, exit 1, unconditionally, regardless of `--json`). They now also produce the
`INVALID_ARGUMENT` failure envelope as stderr's final line, on the same terms as
every other `INVALID_ARGUMENT` site: envelope written only when `--json` is present
**and** the command name (`ingest`, `correct`, `status`, `explain`, `categorize`,
`export`, or `dissolve`) is recognized — this list tracks `JSON_CAPABLE_COMMANDS` in
`program.ts` (story-4.5c added `dissolve`) — exit **2 unconditionally — even
without `--json`** (this is a user-visible behavior change from Commander's
previous default of exit 1 for this error class, made for consistency with every
other `INVALID_ARGUMENT` call site). Commander's own prose precedes the envelope
on stderr, per § 2's "prose may precede the final line" rule.

**Not covered:** `commander.unknownCommand` (a wholly unrecognized subcommand, e.g.
`accounting frobnicate`) — there is no known command name to put in the envelope,
mirroring the `migrate` exclusion in § 8. `--help` and `--version` are unaffected
(still exit 0; these were never failures).

## 5. Conventions

- **camelCase keys everywhere** in `data` and `error.details` — no `snake_case` (the
  pre-4.4b `source_account`/`amount_cents` fields are gone; `sourceAccount`/`amount`
  replace them).
- **Money renders as `Money.toString()`** — a string like `"EUR 45.30"`, never a bare
  number or a `{cents, currency}` pair. Never do float arithmetic on these strings;
  they are pass-through display values — never parse them back into numbers for
  arithmetic.
- **Calendar dates** (config validity windows, buffer target dates, status/explain
  window boundaries) are ISO 8601 date-only: `YYYY-MM-DD`.
- **Transaction timestamps** (`occurredAt`) keep their ISO 8601 offset verbatim:
  `2026-04-21T14:30:00+02:00` — this preserves "receipt truth" (docs/architecture.md);
  never normalized to UTC or truncated to a date.
- **Compact, single-line JSON.** No pretty-printing (`, null, 2` is gone from every
  formatter as of story-4.4b) — a document is always exactly one line.
- **No `contractVersion` field.** Pre-consumer era (no external caller depends on
  today's shapes yet); this document plus git history is the version record. Revisit
  if/when an external consumer appears.

## 6. Per-command `data` schemas

### `status --json`

```jsonc
{
  "asOf": "2026-04-29",
  "window": { "from": "2026-05-01", "to": "2026-05-31" },
  "buffers": [
    { "name": "Vacation", "balance": "EUR 600.00", "target": "EUR 1200.00", "cap": null, "status": "below", "targetDate": "2026-12-01" }
  ],
  "transfer": {
    "totalRequired": "EUR 500.00",
    "perPartner": { "Alex": "EUR 300.00", "Sam": "EUR 200.00" },
    "lineItems": [ { "kind": "forecast", "date": "2026-05-15", "category": "Subscriptions", "description": "Netflix", "gross": "EUR 12.99", "perPartnerSplit": { "Alex": "EUR 7.79", "Sam": "EUR 5.20" } } ]
  },
  "forecast": [ { "date": "2026-05-15", "name": "Netflix", "category": "Subscriptions", "amount": "EUR 12.99" } ]
}
```

`transfer` and `forecast` are **degraded, not absent**, when the underlying calculation
fails (e.g. a stale buffer `targetDate`): `transfer` becomes
`{ "error": string, "suggestedAction": string }` and the command still exits 0 — this is
partial success rendered as data, not a failure envelope. Only genuine input-validation
failures (bad `--as-of`/`--from`/`--to`, `--from` > `--to`) and the unrecoverable
buffer-state read failure produce an `ok: false` envelope (exit 2 / exit 1
respectively).

### `explain --json`

```jsonc
{
  "asOf": "2026-06-28",
  "thisWindow": { "from": "2026-07-01", "to": "2026-07-31" },
  "lastWindow": { "from": "2026-06-01", "to": "2026-06-30" },
  "variance": {
    "lines": [ { "kind": "forecast", "category": "Insurance", "description": "Insurance", "presence": "this-only", "totalDelta": "EUR 200.00", "perPartnerDelta": { "Alex": "EUR 120.00", "Sam": "EUR 80.00" } } ],
    "totalDelta": "EUR 200.00",
    "perPartnerDelta": { "Alex": "EUR 120.00", "Sam": "EUR 80.00" }
  },
  "followThrough": {
    "perPartner": { "Alex": { "suggested": "EUR 500.00", "actual": "EUR 480.00", "delta": "EUR 20.00" } },
    "totalSuggested": "EUR 1000.00",
    "totalActual": "EUR 940.00",
    "totalDelta": "EUR 60.00"
  }
}
```

Same degrade-to-data rule as `status`: `variance` and `followThrough` can each become
`{ "error": string, "suggestedAction": string }`, and `followThrough` can be
`{ "notConfigured": true }` when no `settlement:` section exists in `accounting.yaml`
— all exit 0. `INVALID_ARGUMENT` (bad `--as-of`, exit 2) and `QUERY_FAILURE`
(contribution query read failure, exit 1) are the only failure-envelope paths.

### `correct --json`

```jsonc
{
  "targetTransactionId": "tx-original",
  "producedTransactionIds": ["tx-reversal", "tx-correcting"],
  "changedFields": ["amount", "account"],
  "reason": "wrong amount on receipt"
}
```

`changedFields` names **domain vocabulary** (`account`), not the CLI's `--category`
display name — the human-readable branch remaps `account` → `category` for prose;
the JSON branch does not (docs/domain/glossary.md: account/category). Failure
envelopes: `INVALID_ARGUMENT` (bad flags, or a validation rule like "at least one
field must change", exit 2), `NOT_FOUND` (unknown transaction id, exit 2),
`QUERY_FAILURE` (unexpected `findById` read failure, exit 1), `WRITE_FAILURE`
(`saveCorrection` failed, exit 4).

### `ingest --json`

Success (`--non-interactive` or `--json` alone — both route around the interactive
review loop):

```jsonc
{
  "file": "/path/to/bpce-valid.csv",
  "sourceAccount": "main-account",
  "summary": { "total": 4, "autoTagged": 4, "lowConfidence": 0, "duplicates": 1, "parseErrors": 0 },
  "items": [
    { "id": "...", "occurredAt": "2026-04-20T00:00:00+02:00", "description": "SUPERMARCHE", "amount": "EUR 85.50", "debit": "Expense:Groceries", "credit": "Assets:Bank:main-account", "category": "Groceries", "classification": "expense" }
  ],
  "duplicates": [ { "description": "...", "idempotencyHash": "..." } ]
}
```

`items` is only ever populated on this success path (all rows auto-tagged high
confidence); there is no `lowConfidence` field here — it would always be an empty
array on this path, so it is omitted entirely rather than shipped as dead weight.

**Needs review** (a pending human decision under non-interactive/`--json` — some rows
classified low-confidence): the document that used to sit on stdout now lives in the
`NEEDS_REVIEW` error envelope's `details`, exit 2, stdout empty:

```jsonc
{ "command": "ingest", "ok": false, "error": {
  "code": "NEEDS_REVIEW",
  "message": "2 item(s) need manual review.",
  "suggestedAction": "Run without --non-interactive to review them (you can define new categories inline), or re-ingest after updating accounting.yaml's auto-tag-rules.",
  "details": {
    "file": "...", "sourceAccount": "...",
    "summary": { "total": 5, "autoTagged": 3, "lowConfidence": 2, "duplicates": 0, "parseErrors": 0 },
    "lowConfidence": ["tx-id-1", "tx-id-2"],
    "duplicates": []
  }
} }
```

Other failure envelopes on the non-interactive/`--json` path: `INVALID_ARGUMENT`
(source-account filename resolution, exit 2), `READ_FAILURE` (file unreadable or CSV
parse failure, exit 1), `QUERY_FAILURE` (idempotency check or transaction build
failure, exit 1), `SNAPSHOT_FAILURE` (exit 3), `WRITE_FAILURE` (exit 4 — see the
emit-then-commit interleaving in § 2). The interactive-only YAML config-write path
(remember-rule prompts) never runs under `--json` (it forces the non-interactive
branch), so `CONFIG_WRITE_FAILURE` does not apply to `ingest --json`.

### `categorize --json`

```jsonc
{
  "file": "/path/to/bpce-valid.csv",
  "summary": { "scannedRows": 7, "alreadyMatched": 0, "candidateGroups": 3, "promptedGroups": 3, "rulesAdded": 2, "rulesSkippedByUser": 1 },
  "rules": [ { "category": "Groceries", "pattern": "supermarche" } ]
}
```

Unlike `ingest`, `--json` alone does **not** force `categorize` into non-interactive
mode — a scripted `--scripted-prompts` run can combine `--json` with the normal
review loop, so `CONFIG_WRITE_FAILURE` (YAML append failure, exit 5) *is* reachable
under `--json` here. **Zero candidate groups** now writes a success envelope with
`summary.candidateGroups: 0` (previously nothing was written to stdout even under
`--json`). `--non-interactive` with pending groups emits a `NEEDS_REVIEW` envelope
(exit 2) instead of the old prose-only message. The pre-4.4b hardcoded
`rulesSkippedAsDuplicate: 0` field is gone — it never varied; an honest
reintroduction (making the count real) is tracked as a config-writer feature, not a
shape fix (issue #104).

### `export --json`

```jsonc
{
  "location": "/Users/alex/exports/accounting-export-2026-07-17T14-30-05",
  "proof": "9f2b...64-hex-chars...c1a0",
  "exported": { "transactions": 42, "events": 7 }
}
```

`location` is the **full absolute path** on stdout — stdout is for the user, not the
append-only trail (the `DataExported` event's own `archiveLocation` field, by
contrast, carries the bundle **directory name only**, never a path — see § Export
bundle format below). `proof` is the SHA-256 (hex) of `manifest.json`'s bytes —
`dissolve` (story-4.5c) demands this same proof, re-verified byte-for-byte, before
erasing anything. `exported` counts include the `DataExported` event itself
(`events` is one more than the count of events that existed *before* this run) —
the bundle's own trail contains the export that produced it (invariant 8,
`docs/domain/model-notes/story-4.5.md`).

Failure envelopes: `WRITE_FAILURE` (`--out` cannot be created/is not writable, the
`DataExported` audit-event record failed, or the bundle write failed — exit 1, see
§ 3/§ 4 above) and `QUERY_FAILURE` (the pre-flight count of what will travel failed
— exit 1). There is no `INVALID_ARGUMENT` call site in `export`'s own action handler
today (a bad `--out` value is a write-time failure, not a parse-time one) — Commander-
level parse errors (unknown option, etc.) still route through the shared
`INVALID_ARGUMENT` envelope per § 3 "Commander-level parse errors" (`export` is a
`JSON_CAPABLE_COMMANDS` member).

### `dissolve --json`

```jsonc
{
  "receiptPath": "/Users/alex/project/dissolution-receipt.json",
  "archiveLocation": "accounting-export-2026-07-17T14-30-05",
  "wipedStores": [
    "/Users/alex/project/test.db.bak",
    "/Users/alex/project/test.db"
  ]
}
```

`receiptPath` is the full absolute path to the dissolution receipt (a local file,
not the trail — see § Dissolution receipt format below). `archiveLocation` mirrors
the `DissolutionPerformed` event's own field (the bundle **directory name only**,
matching `DataExported`'s no-paths-in-the-trail convention), even though this
`data` document itself is not the trail and could safely carry a full path — kept
consistent with the receipt's own event payload rather than introducing a second
naming convention. `wipedStores` lists the **full absolute paths** actually
removed by `StoreReset.wipe()` (aux siblings first, DB file last — see § Wipe
order below); it is *not* guaranteed to equal the receipt event's own
`wipedStores` field, which records the pre-wipe prediction (receipt-before-wipe,
invariant 7) — the two agree on every successful run, by construction, but only
this envelope field reflects the actually-observed outcome.

Gating order: `--bundle` resolution → export-proof verification → staleness
(live `DataExporter.counts()` vs the bundle's manifest counts, plus the bundle's
own last event being its `DataExported` sanity marker) → confirmation → receipt
write → `closeDb()` → wipe. Failure envelopes, in gating order: `INVALID_ARGUMENT`
(bad/missing/symlinked `--bundle`, failed verification, or a stale export-proof —
exit 2, nothing touched), `QUERY_FAILURE` (the live-counts read for staleness
failed — exit 1), `NEEDS_REVIEW` (`--json` without `--confirm` — the typed-phrase
prompt never runs under `--json`, exit 2, nothing touched — re-run with
`--confirm`), `WRITE_FAILURE` (the receipt write failed — exit 1, nothing
deleted — or the wipe itself failed after a successful receipt write — exit 1,
re-run to finish; the message names which stores are still present). The typed
DISSOLVE-phrase confirmation (no `--confirm`, no `--json`) is interactive-only:
a declined confirmation exits 0 with a prose message and no envelope (unreachable
under `--json`, same convention as every other interactive-only path in § 2); a
prompt that cannot run at all (non-TTY) exits 2 with a prose message, also with
no envelope, since `--json` mode never reaches this branch.

## 7. Export bundle format (story-4.5b, FR21)

`accounting export [--out <dir>] [--json]` writes a directory named
`accounting-export-<seconds-resolution-stamp>/` (e.g.
`accounting-export-2026-07-17T14-30-05`) under `--out` (default `./exports`,
resolved relative to the current working directory). The directory is staged as
`<name>.partial` and atomic-renamed into place only on full success — a crashed or
failed export leaves at most a `.partial` remnant, never a plausible-but-incomplete
bundle; a target that already exists is refused (an export is never overwritten).
Permissions are least-privilege: `0700` on the directory, `0600` on every file
(POSIX only — no-op on Windows, which has no equivalent permission model).

**Layout:**

| File | Contents |
| --- | --- |
| `transactions.csv` | Every row of the `transactions` table, **including** the nullable `idempotency_hash` column (migration 003) — it is a column, not a separate table. Columns: `id, occurred_at, description, created_at, idempotency_hash, corrects_id, kind`. |
| `transaction-entries.csv` | Every row of `transaction_entries`. Columns: `id, transaction_id, account, side, amount_cents, currency`. |
| `domain-events.json` | A JSON array, one object per `domain_events` row: `{ seq, type, recordedAt, ...eventPayloadFields }` — `type` is the event discriminator (`event_type` column), `recordedAt` is the boundary-stamped recording clock (`recorded_at` column, verbatim), and the remaining fields are the event's own payload, spread in. Includes the bundle's own `DataExported` event (invariant 8 — recorded before the bundle is written). |
| `accounting.yaml` | A byte-verbatim copy of the config file this export ran against. |
| `manifest.json` | `{ schemaVersion, createdAt, counts: { transactions, events }, files: [{ name, sha256 }] }` — `files` lists the four files above (never itself, self-reference isn't meaningful); `counts` equals both the row counts actually written and the `DataExported` event's own `exported` field. |

CSV fields are escaped per RFC 4180 (comma/quote/newline → quoted, doubled internal
quotes) by a small hand-rolled escaper — round-trip-proven against the project's own
`csv-parse` dependency rather than adding a stringify library.

**Proof.** The export-proof printed on success (and returned as `data.proof` under
`--json`) is the SHA-256 of `manifest.json`'s bytes, computed once at write time and
never recomputed by re-serializing — a consumer re-hashes the file on disk to verify
it byte-for-byte.

**`config_state` is excluded by design.** It is a derivable detection cache (the
last-seen canonical config + digest for ambient config-change detection,
story-4.5a) — not household data. QA's "export is complete — every byte"
(`docs/quality-assurance.md` § Portability) reads on the household's own records
(ledger, audit trail, rules); `config_state` regenerates itself on the next
ledger-opening command against whatever `accounting.yaml` the export already copied
verbatim, so nothing is actually lost by leaving it out.

**Restore is not yet implemented.** The bundle is documented and re-importable in
principle (every field is named and typed above), but there is no `accounting
import`/restore command today — tracked at
[#232](https://github.com/xavierbriand/accounting/issues/232).

## 8. Dissolution receipt format (story-4.5c, FR21 completion)

`accounting dissolve --bundle <dir> [--confirm] [--json]` verifies the export-proof
(re-hashing every bundle file and the manifest itself, byte-for-byte — never a
re-serialization), refuses if the live ledger has changed since that export (strict
staleness — no `--allow-stale` escape), demands deliberate confirmation, writes
`dissolution-receipt.json` next to `accounting.yaml`, then wipes the ledger stores.

```jsonc
{
  "schemaVersion": 1,
  "recordedAt": "2026-07-17T14:32:10.418Z",
  "event": {
    "type": "DissolutionPerformed",
    "archiveLocation": "accounting-export-2026-07-17T14-30-05",
    "manifestHash": "9f2b...64-hex-chars...c1a0",
    "wipedStores": [
      "/Users/alex/project/test.db.bak",
      "/Users/alex/project/test.db"
    ]
  },
  "archivePath": "/Users/alex/exports/accounting-export-2026-07-17T14-30-05"
}
```

`recordedAt` is a full ISO-8601 UTC instant computed at this write (not the
filename-safe stamp `export`'s bundle-naming clock uses). `event` is the
`DissolutionPerformed` value object — receipt-only by design: it is deliberately
**not** a member of the `DomainEvent` union in `src/core/events/domain-event.ts`,
so it can never reach `domainEventRecorder.record()` (a type error, not a runtime
check) — it is recorded here, in the receipt, never in the doomed DB (model note
§ Events). `event.wipedStores` is the **pre-wipe prediction** (receipt-before-wipe,
invariant 7 — the receipt must be durably written before `StoreReset` runs, before
the actual outcome is knowable); it lists full absolute paths in wipe order.
`event.archiveLocation` is the bundle **directory name only** (no path — the same
no-paths-in-the-trail convention `DataExported` uses), while `archivePath` (a
receipt-only field, not part of the event) carries the **full path** — a local
file describing where the bundle lives is not the append-only trail, so the path
is safe to record here.

**Durability.** Write-temp + `fsync` + atomic rename, mode `0600` (sensitive-file-
writer parity with `YamlConfigWriter`/`FsDataExporter`) — the receipt must survive
a crash between write and rename, since `StoreReset.wipe()` runs immediately after
this write returns.

**Wipe order.** Auxiliary files first, the DB file last: `<dbPath>.bak`,
`<dbPath>-wal`, `<dbPath>-shm` (each only if present), then `dbPath` itself. A
partial failure (e.g. a permissions error partway through) always leaves either a
re-runnable DB file or an already-effectively-dissolved store — never a half-dead
ledger with some-but-not-all stores gone. **Preserved:** `accounting.yaml` and the
receipt itself; a copy of the config still travels inside the bundle.

**Staleness is strict.** An export-proof authorizes wiping exactly the data it
describes. Because both stores are append-only, count equality is tail equality —
`dissolve` refuses (rather than wiping data an archive doesn't actually contain)
whenever the live `DataExporter.counts()` differs from the bundle manifest's
counts, or the bundle's own last recorded event isn't its `DataExported` sanity
marker (including a config change recorded since the export — dissolve runs the
same ambient config-change observation as every other ledger-opening command). The
remedy is always the same: run `accounting export` again.

## 9. Non-interactive commit semantics (story-4.4a)

`ingest --non-interactive` and `ingest --json` (either flag alone) both persist a
clean batch immediately — there is no dry-run/preview mode today. A future
`--dry-run` flag (issue #213) is expected to add a `data.dryRun: true` marker and
skip the commit; until it lands, every non-interactive/`--json` invocation with no
pending low-confidence decisions writes to the database.

**Empty-batch caveat (issue #215, open):** re-ingesting a CSV where every row is
already a duplicate still runs the full commit lifecycle — snapshot, `saveBatch([])`,
and a `TransactionIngested` domain event with an empty `transactionIds` array — rather
than short-circuiting before the snapshot. This is a behaviour question, not a shape
question, and is intentionally out of this contract's scope; the JSON shape
(`summary.total: 0`, `duplicates` populated) is unaffected either way.

## 10. `migrate` is excluded

`accounting migrate` has no `--json` mode and is not covered by this contract — it is
a one-time schema-setup operation with no structured result to report, and pre-dates
FR20. This is an intentional exclusion, not an oversight.

## 11. Versioning

No `contractVersion` field exists today (see § 5). If an external consumer other than
scripts/LLM agents in this repository appears, this document is the place to add one.
