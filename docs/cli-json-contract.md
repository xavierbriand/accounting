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
`correct`, `ingest`, `categorize`). `error.suggestedAction` and `error.details` are
present only when the failure has something concrete to add; absent otherwise (never
`null` or an empty object as a placeholder).

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
  review) are unreachable under `--json` (`ingest`/`correct`/`status`/`explain` route
  around the interactive branch when `--json` or `--non-interactive` is set; categorize's
  `--json` can still combine with its interactive prompt loop — see § 5) and stay
  prose-only; there is no envelope to parse for those.

## 3. Exit codes

Unchanged by this contract — every exit code below existed before story-4.4b; the
codes only gained a matching `error.code` under `--json`.

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Unrecoverable read/query failure (DB unreachable, file unreadable, currency mismatch) |
| 2 | Input validation failure, not-found, or a pending decision under non-interactive/`--json` (needs review) |
| 3 | Pre-commit snapshot failed (ingest only) |
| 4 | Batch write failed after a successful snapshot (ingest/correct) |
| 5 | `accounting.yaml` config write failed (categorize/ingest's interactive remember-rule path) |

## 4. Error-code registry

| Code | Meaning | Typical exit |
| --- | --- | --- |
| `INVALID_ARGUMENT` | Bad flag/date/option value; source-account filename resolution failed | 2 |
| `NOT_FOUND` | `correct`: target transaction id does not exist | 2 |
| `NEEDS_REVIEW` | `ingest`/`categorize`: a decision is pending under non-interactive/`--json` | 2 |
| `READ_FAILURE` | Input file unreadable, or CSV parse failure | 1 |
| `QUERY_FAILURE` | Repository/read-model failure — idempotency check, buffer state, contribution query, `findById`, transaction build | 1 |
| `SNAPSHOT_FAILURE` | Pre-commit DB snapshot failed | 3 |
| `WRITE_FAILURE` | `saveBatch`/`saveCorrection` failed (batch rolled back; snapshot retained on ingest) | 4 |
| `CONFIG_WRITE_FAILURE` | `accounting.yaml` auto-tag-rule append failed (mtime race or pattern conflict) | 5 |

`NOT_FOUND` and `NEEDS_REVIEW` both disambiguate what used to be an overloaded exit 2 —
check `error.code`, not just the exit code, to tell "bad input" from "nothing matched"
from "a human decision is needed."

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

## 7. Non-interactive commit semantics (story-4.4a)

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

## 8. `migrate` is excluded

`accounting migrate` has no `--json` mode and is not covered by this contract — it is
a one-time schema-setup operation with no structured result to report, and pre-dates
FR20. This is an intentional exclusion, not an oversight.

## 9. Versioning

No `contractVersion` field exists today (see § 5). If an external consumer other than
scripts/LLM agents in this repository appears, this document is the place to add one.
