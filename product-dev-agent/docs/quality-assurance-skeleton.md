# Quality Assurance — Skeleton

Skeleton for the consuming project's QA invariants. Walked during every **P2** of `/product-dev-agent:review-plan` (against the plan) and again at the P2 retro-check of `/product-dev-agent:review-impl` (against the implementation).

The plugin owns the **framing** and the **observability + non-goals** sections — universal to any product. The consuming project owns the **domain invariants**: what its product promises to its users.

The distinction from `engineering-standards.md` and `security-checklist.md`: QA is about *what the product promises to its users*, not *how the code is structured* or *how we defend against attackers*.

## Domain invariants (consuming project fills in)

Each invariant should be:

- A user-visible promise (not an implementation detail).
- Checkable — there's a way to assert it from outside the code.
- Tied to a class of bug it prevents.

Examples by domain:

- **Financial / accounting.** Sum of debits equals sum of credits. Currency consistency per account. Allocations conserve to the cent. Determinism of historical recalculations. Validity-window correctness.
- **Identity / auth.** No user can read another user's data via any API path. Credentials never appear in logs. Sessions invalidate on password change.
- **Medical / health.** PHI redacted in error paths. Patient ID resolves consistently across services. Audit trail covers every read.
- **Messaging / chat.** Messages are delivered at-least-once. Read receipts arrive in order with the messages they reference.

The consuming project's `docs/quality-assurance.md` enumerates its own invariants in the same shape.

## Privacy & data sovereignty (consuming project may add)

Generic baseline:

- The product's data-sovereignty promises are explicit. If the product claims "local-only", no network egress under any flag. If the product is multi-tenant, tenant isolation is a P2 invariant.
- PII is never logged verbatim. Redaction is the default; plaintext requires explicit opt-in. Test fixtures contain synthetic data only.
- The user (or tenant) can export every byte of their data at any time, in a documented and re-importable format. Export is complete — no "admin-only" fields, no opaque blobs.
- Files the product creates with sensitive data have least-privilege permissions.

## Observability of failures

- **Human-readable error messages at the interface boundary.** A user never sees a raw stack trace, a raw failure payload, or a type name. Errors translate to a sentence the user can act on.
- **Exit codes / HTTP status codes reflect outcome.** `0` for full success, non-zero for any failure (or appropriate HTTP status for web). Scripts and clients can branch on it reliably.
- **Logs are structured and searchable.** A failure that doesn't surface in the logs is a failure that didn't happen, from operations' perspective.

## Coherence with the product brief

- **User journeys reachable.** Every journey documented in the project's product brief must remain achievable through the project's interface. A refactor that orphans a journey is a P2 blocker, not a deferred item.
- **Truthfulness of human-readable output.** Where the product summarises numerical results in prose ("you'll be short €240 in March", "3 alerts triggered"), the prose must match the underlying calculation the user can reproduce.
- **Audit trail.** Every user action that changes state leaves a traceable entry. "What changed and why" must be answerable from the project's own data.

## Non-goals (to preempt false-positive reviews)

The consuming project enumerates these explicitly so reviewers don't flag missing features that were intentionally out of scope. Common examples:

- "Single-user local tool — no multi-user concurrency."
- "Best-effort delivery — no guaranteed exactly-once."
- "Self-hosted — no cloud-managed SLAs."
- "Audit trail, not regulatory compliance — the tool records but isn't a notary."

Without explicit non-goals, P2 review can drift into "you should add X" critiques for things the project deliberately doesn't promise.
