# Security Checklist

Walkable attack-surface checklist. Part of the **P3** critical review (`/product-dev-agent:review-plan`), run against the plan, and again against the implementation diff (`/product-dev-agent:review-impl`). Cross-referenced by `${CLAUDE_PLUGIN_ROOT}/docs/engineering-standards.md`.

A failure of any item at P3-retro is a **merge blocker**, not a deferred suggestion.

The consuming project layers domain-specific items on top via its own `docs/security-checklist.md` (e.g. money-precision rules for financial apps, PHI handling for medical apps, KYC for identity systems).

## Data integrity

- [ ] Domain invariants the project enforces (e.g. balance equations, foreign-key constraints, optimistic concurrency tokens) are checked **at write time**, before the data reaches the persistence layer.
- [ ] All persisted operations execute via parameterised queries / prepared statements / equivalent. No string concatenation or template-literal interpolation into query text.
- [ ] Migrations are numbered and idempotent. Running the migrator twice on a fresh data store is a no-op after the first run.
- [ ] No primary key relies on client-supplied data for uniqueness.
- [ ] If the project has append-only / audit-log tables, no `UPDATE` or `DELETE` statements anywhere against them. Corrections are new entries.

## Validation & boundaries

- [ ] Every external input is validated at the boundary: CLI args, HTTP request bodies, file reads, message-queue payloads, configuration parsing. Validation happens before the data reaches core business logic.
- [ ] Core business logic contains no calls to external systems (filesystem, network, OS-process, time-of-day) — those go through the project's port abstractions.
- [ ] No user-controlled path strings reach filesystem APIs without prior normalisation; no path traversal (`../`) possible via user input.
- [ ] Interface layer (CLI/HTTP/RPC) refuses unknown inputs (unknown flags, unknown fields).

## Secrets & PII

- [ ] Logs and error messages redact PII (names, identifiers, account numbers, email addresses, anything personally identifying in the project's domain). Redaction is the default; plaintext logging requires an explicit per-call opt-in.
- [ ] No `.env`, credentials files, API tokens, or production data committed in any branch. `.gitignore` covers them.
- [ ] Test fixtures contain synthetic data only. No real personal data in source control.
- [ ] Files the project creates that hold sensitive data are created with least-privilege permissions (e.g. `0600` on POSIX). The consuming project's CLAUDE.md names the specific paths.
- [ ] No logging of raw external-input rows (CSV rows, request bodies, etc.) without PII redaction.

## Supply chain

- [ ] Project's audit command is clean of `high` and `critical` advisories. Moderate findings are noted; anything higher becomes an immediate fix issue.
- [ ] New runtime dependencies require a one-line justification in the PR.
- [ ] Dependency-update PRs (Dependabot or equivalent) walk this full checklist before merge.
- [ ] Lock file / pinned dependency manifest is committed and consistent with the dependency declaration.

## Error handling

- [ ] Core returns result-typed values; no thrown exceptions inside core.
- [ ] Adapters catch only exceptions they can translate to a result value; others propagate.
- [ ] No bare `catch` / `except` blocks that swallow errors.
- [ ] Interface boundary converts result failures to a human-readable message plus a non-zero exit code (or appropriate HTTP status, etc.).

## Review cadence

- Run this checklist **in full** at:
  - P3 of the pre-implementation critical review (against the plan).
  - P3 retro-check of the post-implementation review (against the diff).
- At every Dependabot PR review (short-form: supply chain only is mandatory, full walk if the bump touches a critical-path dep).
- Any box that cannot be ticked must either be fixed or resolved via a documented exception (GitHub issue referenced in the suggestion log).
