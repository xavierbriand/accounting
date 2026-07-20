# Security Checklist

Walkable attack-surface checklist. Part of the **P3** critical review (engineering), run against the plan (phase 2) and again against the implementation diff (phase 4). Cross-referenced by [engineering-standards.md](engineering-standards.md).

A failure of any item at P3-retro is a **merge blocker**, not a deferred suggestion.

## Money precision

- [ ] No `+ - * /` on monetary values anywhere. `Money` / Dinero methods only.
- [ ] All monetary storage uses two columns: `INTEGER NOT NULL` cents + `TEXT NOT NULL` ISO 4217 currency code.
- [ ] Banker's rounding (half-to-even) used wherever rounding is needed.
- [ ] No `Number.parseFloat`, no `toFixed`, no `.toString()` round-trips for money.

## Data integrity

- [ ] Ledger tables are append-only. No `UPDATE` or `DELETE` statements anywhere against them. Corrections are new balancing entries.
- [ ] The `sum(debits) == sum(credits)` invariant is enforced at write time, before the transaction is visible in the DB.
- [ ] All SQL executes via `better-sqlite3` prepared statements. No string concatenation or template-literal interpolation into query text.
- [ ] Migrations are numbered and idempotent. Running the migrator twice on a fresh DB is a no-op after the first run.
- [ ] No transaction ID or other primary key relies on client-supplied data for uniqueness.

## Validation & boundaries

- [ ] Zod schemas validate every external input: CLI args, file reads, config parsing. Validation happens before the data reaches Core.
- [ ] Core (`src/core/`) contains no calls to Node APIs (`fs`, `path`, `os`, `crypto`), no `commander`, no `better-sqlite3`, no `process.exit`.
- [ ] No user-controlled path strings reach `fs` without prior normalization. `dbPath` is additionally validated at the CLI composition root via `validateDbPath` — symlinks at the resolved path are refused with a friendly stderr error + exit 2. `${dbPath}.bak` (Story 2.5 snapshot sibling) is transitively protected: if `dbPath` itself is rejected, snapshot creation never runs; if `dbPath` is valid, Story 2.5's atomic-rename-from-randomised-tmp pattern neutralises a pre-planted symlink at the `.bak` target. No path traversal (`../`) possible via ingestion. **[deferred]** `accounting.yaml` (Story C write path) currently has no equivalent symlink check — tracked at [#88](https://github.com/xavierbriand/accounting/issues/88) for a future maint refactor that generalises the helper.
- [ ] CLI commands refuse unknown flags (commander's default).

## Secrets & PII

- [ ] Logs and error messages redact PII (names, IBANs, account identifiers, email addresses). Redaction is the default; plaintext logging requires an explicit per-call opt-in.
- [ ] **User-typed labels are NOT subject to redaction.** Category names, account aliases, and auto-tag pattern strings authored by the user (Story A inline define, Story B YAML categories, Story C remembered rules) are the user's own classifiers — not third-party PII. Echoing them in error messages (e.g. `'Expense' is reserved`, `pattern 'altima' already exists under category 'Insurance'`, `Already exists as 'Groceries'`) is permitted and helpful for debugging. Three data points across Stories A/B/C confirmed this carve-out is intentional and codified here.
- [ ] **Filesystem error messages from config-write paths must be sanitised** before reaching stderr — absolute paths leak filesystem layout. `YamlConfigWriter` (Story C) uses `sanitizeFsError(err): string` mirroring the existing `sanitizeSqlError` pattern; future config-write paths follow the same rule.
- [ ] No `.env`, credentials files, API tokens, or production data committed in any branch. `.gitignore` covers them.
- [ ] Test fixtures contain synthetic data only. No real IBANs, no real names.
- [ ] DB and config files are created with `0600` permissions. (Rule — wire into `sqlite-client.ts` / config layer in Story 1.4.)
- [ ] No logging of raw CSV rows without PII redaction.

## Supply chain

- [ ] `npm audit` is clean of `high` and `critical` advisories. Moderate findings are noted; anything higher becomes an immediate fix issue.
- [ ] New runtime dependencies require a one-line justification in the PR.
- [ ] Dependency-update PRs (Dependabot) walk this full checklist before merge.
- [ ] Lock file (`package-lock.json`) is committed and consistent with `package.json`.

## Error handling

- [ ] Core returns `Result<T, E>`; no thrown exceptions inside Core for **domain failures**. Carve-out: invariant/programmer-error guards throw deliberately — contract misuse is a bug to surface loudly, not a domain outcome to model (e.g. `src/core/shared/result.ts` throws on Result misuse: accessing `.value` of a failure, constructing a success that carries an error). Tests may assert these throws directly; they are not checklist violations.
- [ ] Infra catches only exceptions it can translate to `Result.fail`; others propagate.
- [ ] No bare `catch` blocks that swallow errors.
- [ ] CLI boundary converts `Result.fail` to a human-readable message plus a non-zero exit code.

## Review cadence

- Run this checklist **in full** at:
  - P3 of the pre-implementation critical review (against the plan).
  - P3 retro-check of the post-implementation review (against the diff).
- At every Dependabot PR review (short-form: supply chain only is mandatory, full walk if the bump touches a critical-path dep).
- Any box that cannot be ticked must either be fixed or resolved via a documented exception (GitHub issue referenced in the suggestion log).
