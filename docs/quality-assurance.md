# Quality Assurance

Product-level invariants this project must preserve for its users. Walked during every **P2** of the critical review (see [CLAUDE.md § 6.1](../CLAUDE.md)) on the plan, and again at the P2 retro-check on the implementation. On conflict with a summary elsewhere, this document wins.

The distinction from [engineering-standards.md](engineering-standards.md) and [security-checklist.md](security-checklist.md): QA is about *what the product promises to its users*, not *how the code is structured* or *how we defend against attackers*.

## Accounting correctness

- Every recorded transaction satisfies `sum(debits) == sum(credits)`, enforced at write time. See also [architecture.md](architecture.md).
- Account balances are mathematically derivable from the ledger alone. No hidden state, no cached totals that can drift from the journal.
- **Currency consistency per account.** An account has exactly one currency for its lifetime. Mixed-currency operations fail loudly with `Result.Fail`; silent coercion is unacceptable.
- **Allocations are conservative to the cent.** Splits use Largest Remainder so `sum(parts) == total` exactly; no rounding error leaks out of an allocation.
- **Determinism.** Historical recalculations produce identical results given the same inputs. If a user runs the same report twice with the same data, the numbers match byte-for-byte.
- **Validity windows.** Versioned rules (split ratios, buffer targets) apply the rule that was active on the transaction's date, not today's rule. A transaction dated 2024-05 recomputes with the 2024-05 split, regardless of later config changes.
- **No silent data loss.** Ingesting the same CSV twice produces zero new transactions (idempotent). Ingesting a CSV with a malformed row produces all valid rows plus an explicit per-row error report.

## Privacy & data sovereignty

- **Local-only is a hard promise.** No network egress of ledger data under any flag. The product never phones home.
- **PII is never logged verbatim.** Names, IBANs, account identifiers, and bank references are redacted before logging or error output. Test fixtures contain synthetic data only.
- **Portability.** The user can export every byte of their data at any time, in a documented and re-importable format ("Graceful Dissolution"). Export is complete — no "admin-only" fields, no opaque blobs.
- **File permissions.** DB and config files are created with `0600`. A shared-machine scenario cannot leak data to a second account via file reads.

## Coherence with the product brief

- **User journeys reachable.** Every journey documented in [product-brief-accounting-2026-02-02.md](product-brief-accounting-2026-02-02.md) must remain achievable through the CLI. A refactor that orphans a journey is a P2 blocker, not a deferred item.
- **"Conversational CFO" truthfulness.** Human-readable explanations must match the mathematical result they reference. A sentence like "you'll be short €240 in March" must be backed by a deterministic calculation the user can reproduce.
- **Audit trail.** Every user action that changes state leaves a traceable entry (ledger row, audit-log row, or both). "What changed and why" must be answerable from the local data alone.
- **Soft edits, not hard edits.** Corrections are recorded as new balancing transactions (reversal + correction). The original is never mutated.

## Observability of failures

- **Batch operations surface per-row outcomes.** A 500-row CSV with 3 bad rows must report *exactly* which 3 failed and why; the other 497 must commit atomically.
- **Human-readable error messages at the CLI boundary.** A user never sees a raw stack trace, a raw `Result.Fail` payload, or a TypeScript type name. Errors translate to a sentence the user can act on.
- **Exit codes reflect outcome.** `0` for full success, non-zero for any failure. Scripts calling the CLI can branch on it reliably.

## Non-goals (to preempt false-positive reviews)

- Multi-user concurrent writes. This is a single-user local tool; SQLite WAL is overkill already.
- High availability, replication, backups beyond the user's own local filesystem tools.
- Complex authentication or authorization. The OS handles that.
- International tax compliance. The tool records and predicts; it is not an accountant.
