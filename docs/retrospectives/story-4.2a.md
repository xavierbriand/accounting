# Retrospective — story-4.2a

The correction domain (PR #184), first half of the 4.2 split: `Transaction` gains
`kind`/`correctsId`; a pure `CorrectionService.correct(original, changes, ids, reason)`
returns `{ reversal, correcting, event }` (reverse-and-correct — the reversal mirrors the
original and nets it out, the correcting entry posts the truth, the original never mutated);
`TransactionCorrected` joins the `DomainEvent` union; migration 006 adds the columns; an
atomic hash-free `saveCorrection` persists the pair. No CLI, no event recording — those are
4.2b. `ddd-modeler` Mode B: **0 conformance violations**. No new glossary vocabulary (all
promoted in 4.0).

## Keep

- **Deriving the plan's Domain-model from the 4.0 note (R24) made the eight invariants a
  ready-made test matrix.** The note explicitly said "each → a property or unit test in
  story-4.2"; Phase 1 mapped all eight to specific scenarios/properties before any code, and
  Phase 4 verified every one has a backing test with zero gaps. The modeling work done once in
  4.0 paid its second dividend here.
- **The implementer stopped at the real `idempotency_hash NOT NULL` blocker instead of
  shimming.** It found migration 004's constraint collided with hash-free correction rows and
  surfaced three honest options (loosen / placeholder / stop-and-ask) rather than silently
  writing a sentinel hash — exactly the "flag the shim, don't ship it" behaviour the harness
  wants. The Opus disposition turned the conflict into a *strengthening*: a kind-conditioned
  DB CHECK (`original` ⇒ hash present; `reversal`/`correcting` ⇒ hash NULL) that makes the
  story-4.0 ACL firewall a database invariant.
- **Splitting 4.2a/4.2b at the domain/CLI seam kept a dense slice coherent.** The epic
  pre-authorized the split; taking it meant 4.2a is pure-domain + persistence (unit + property
  + one integration test) with no CLI surface to mock, and every risky decision (date rule,
  entry-shape scope, atomicity) was settled in the domain layer where it's cheapest to test.
- **Phase-2 caught the multi-entry modelling gap before code.** `CorrectionChanges` has a
  single `amount`/`account`, but `Transaction` holds those per-`Entry`. The plan-reviewer
  flagged that a >2-entry split has no defined mapping; Opus scoped 4.2a to the two-entry
  expense shape with an explicit `Result.fail` guard (scenario 8) and deferred split-correction
  to #183 — a designed boundary, not an untested path.

## Change

- **R13's "6–10 commits" is being read as "6–10 slices."** 4.2a landed 19 code commits (≈8
  behaviour slices × a `test:`+`feat:` pair, + 2 refactors + coverage commits) — roughly double
  the literal figure, exactly as story-4.1 did (~19). The TDD rhythm (§6.4) *mandates* the
  failing/green split, so counting raw commits against "6–10" will always over-shoot. Two
  stories now confirm the drift. Clarified via **R28** (envelope counts slices) — but 4.2a's
  own honest slice count is **14, still over 10**: the mid-story `idempotency_hash` conflict, a
  branch-coverage top-up, and three refactor commits pushed it past a domain-dense story's
  envelope. Accepted and cleared via **squash-on-merge** (user decision 2026-07-06) — `main`
  gets one commit, and R28's honest count stands as the metric for future stories.
- **The date-correction clarification diverged from a *signed* invariant and needs the note
  reconciled in-PR.** The 4.0 note's Invariant 6 + "Correction date" say *both* new rows carry
  the original `occurredAt`; the shipped behaviour (user-approved 2026-07-06) moves the
  correcting entry to the new date when `date` is corrected. Code and tests are faithful, and
  the plan tracked it as a proposed delta — but the glossary + 4.0 note still read the old way.
  Reconciling user-owned model docs *as part of the retro* (proposals for sign-off) should be a
  standing step whenever a story's behaviour supersedes a signed note, not left to "later."
- **A schema-version bump's test fallout landed inside a feature commit again.** Migration 006
  advanced `user_version` to 6, loosening pre-existing assertions in `migration-004`,
  `migration-005`, and `sqlite-hash-repository` tests — bundled into the CHECK feature commit.
  This is the *exact* Change story-4.1 raised ("version-fallout tests belong in their own
  `chore:` commit"). Repeated → worth a lightweight convention, not just a per-retro note.

## Try

- **When a story amends a shipped migration's constraint, pre-write the fallout-commit plan.**
  Both 4.1 and 4.2a touched `user_version` and both scattered the collateral test edits into a
  feature commit. At Phase 1, if the plan's migration slice changes an existing constraint,
  name the `chore(test): version-fallout` commit up front so the implementer has a labelled home
  for it.
- **Carry a one-line "signed-note delta?" check into Phase 4.** `ddd-modeler` Mode B already
  surfaces when code supersedes a signed note; make "does a user-owned model doc need a proposed
  delta this PR?" an explicit line in the Phase-4 disposition so the reconciliation never trails
  the code by a story.

## Phase-4 disposition record

`code-reviewer` + `ddd-modeler` Mode B (parallel). ddd-modeler: **0 conformance violations**
(2 benign notes: the `reason` 4th param is plan-derived; Invariant 6 superseded → reconcile).
code-reviewer: 4 P1, 1 P2 (+ softs), 3 P3 (2 soft). **Fixed now** (cae1d14): R6 `fails if`
clauses added to the four `saveCorrection` scenario-7 tests and the `domain-event.test.ts`
docblock (now names `TransactionCorrected`'s shape guard). **Deferred → issue:** empty-string
vs absent field in `CorrectionChanges` (truthy-check; unreachable until 4.2b's CLI) → #185.
**Acknowledged:** scenario-7's "dangling FK *or* mid-write" maps to two tests (correct);
`fc.pre` nit rejected — `return false` should fail loudly if a valid correction errors, not
skip; `saveBatch` `Result.map` opportunity (next touch); `reason` 4th param (plan-derived).
**Reconciled (user-approved 2026-07-06, this PR):** glossary "Correction" + 4.0-note
Invariant 6/"Correction date" date-rule wording updated to match the shipped behaviour.
**Rule minted (user-approved, this PR):** **R28** — the commit envelope counts *slices* not
raw commits; dod-check's `countSlices` collapses each `test: — failing`/`feat:` pair.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Split-correction (>2-entry) capability | #183 | Open |
| Empty-string vs absent field in `CorrectionChanges` (pick up at 4.2b) | #185 | Open |
| Atomic audit-event recording (`UnitOfWork`) — B1 gap for ingest + correction | #180 | Open (deferred from 4.2a; not a correction-slice concern) |
| Reconcile date-rule wording in glossary + 4.0 note | this PR (user-approved 2026-07-06) | Done |
| Clarify envelope to count slices (test+feat = one slice) | **R28** (CLAUDE.md §8) + dod-check `countSlices` | Done (this PR) |
| Event-family field naming — ratify `producedTransactionIds` (role-precise) vs ingest's `transactionIds` | Resolved here | `TransactionCorrected` shipped `producedTransactionIds` per 4.0 note; ingest's `transactionIds` left as-is (role-precise convention, no retro-rename) |
| `correct` CLI (explicit flags), boundary event-recording (B1), Conversational-CFO wording | story-4.2b | Next |

**R28 minted** this PR (envelope counts slices — see §8), refining R13/R14 the way R16 refined
R15. Otherwise 4.2a consumed existing rules (R24 derive-from-4.0, R25 glossary currency, R6/R7
test honesty). The two repeated Changes (version-fallout commit home, signed-note reconciliation
as a standing retro step) remain Try candidates for a future rule if they recur again.
