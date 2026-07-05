# Retrospective — story-4.1

The FR23 audit-trail spine (PR #182): a Core `DomainEventRecorder` port (#155) + `TransactionIngested`
event value object, migration 005 (append-only `domain_events` table), `SqliteDomainEventRecorder`, and
B1 app-boundary wiring into `commitBatch` recording the first event after a successful ingest commit.
First code materialization of the domain-events tactical pattern modelled in story-4.0. No new glossary
vocabulary (all terms pre-promoted in 4.0).

## Keep

- **The deferred call-site decision was resolved with a written rationale, not a coin-flip.** Story-4.0
  parked B1-vs-B2 for "story-4.1 Phase 1"; the plan decided B1 (app-boundary) with an argument that
  *reconciles* with the 4.0 hybrid model rather than contradicting it (ingest has no Core domain service,
  so the boundary is its natural seam; the atomic-in-service path lands in 4.2's `CorrectionService`). A
  fork inherited from a prior story got closed deliberately, and `ddd-modeler` Mode B confirmed the
  resolution as conformant.
- **The implementer stopped at a real blocker instead of guessing.** Mid-implementation it found that
  `ingest --non-interactive`/`--json` never reaches `commitBatch` for *any* fixture — a pre-existing gap,
  not the fixture problem Phase-2 had anticipated. It halted and asked rather than silently expanding
  scope into `runNonInteractive`. Resolution (interactive scripted-confirm path) kept the story in scope;
  the gap became #181 with a decision recorded, not a silent rider.
- **Model-conformance review at first materialization paid off.** Running `ddd-modeler` Mode B against the
  4.0 note (even without a fresh story-4.1 note) validated the whole event family's foundations — Core
  purity, no base class, timestamp-at-boundary, PII-free payload, past-tense vocabulary — at the exact
  moment the abstraction became code. Two family-naming observations surfaced for 4.2 to inherit.
- **Phase-4 caught a PII-hygiene inconsistency the tests didn't.** Both the acceptance and unit tests were
  green, but `code-reviewer` saw the `record()` failure branch wrote a raw SQLite error to stderr while
  the sibling `saveBatch` branch three lines above sanitized it. Green ≠ consistent; the diff-adjacency
  read is what the human-style review adds over the test suite.

## Change

- **Version-fallout tests belong in their own `chore:` commit.** Migration 005 legitimately advanced
  `user_version` past 4, so two pre-existing tests (`migration-004`, `sqlite-hash-repository`) loosened
  `toBe(4)` → `>=4`. Correct and commented, but bundled into slice 4's feature commit — a slice-boundary
  blur. A schema-version bump has predictable test fallout; carve it into a labelled `chore(test):` slice
  so the feature commit stays about the feature.
- **The event-family field vocabulary needs one ratification pass when the second event lands.**
  `TransactionIngested.transactionIds` vs the modelled `TransactionCorrected.producedTransactionIds` is a
  fork left open (kept `transactionIds` — clearer with no "target" to disambiguate, no consumer exists
  yet). This is fine for one event but becomes real when 4.2 builds the second: decide then whether the
  audit-store payloads should be self-similar (`producedTransactionIds` everywhere) or role-precise.
- **A plan-vs-diff coverage claim went stale between Phase 1 and Phase 3.** The plan promised an in-process
  real-infra assertion in `ingest-commit.test.ts`; the implementer delivered equivalent coverage elsewhere
  (spy unit + subprocess) but left the named file un-asserted. Phase-4 caught it and it was added. When a
  plan names a specific test *location*, the implementer should either honor it or flag the substitution in
  the return report's Deviations — this one wasn't flagged.

## Try

- **Standardize where `fails if` prose lives for `.feature` files.** `audit-trail.feature` is the repo's
  first Gherkin file to embed `fails if` as inline `#` comments; every other test carries it in the step
  docstring or the `it` header. Pick one home (step docstring reads cleanest) so R6 evidence is found in a
  consistent place.
- **Re-verify plan premises at phase *transitions*, not only before pushes.** The `--non-interactive`
  gap would have surfaced at Phase 1 with a five-minute trace of `runNonInteractive`'s call graph. Echoes
  story-ddd-2's "maintenance sub-loop is a point-in-time snapshot" — the same lesson for *code* premises,
  not just tracker state: before locking a plan's acceptance mechanism, trace that the path it names is
  actually reachable.

## Phase-4 disposition record

`code-reviewer` + `ddd-modeler` Mode B (parallel). ddd-modeler: **0 hard violations**. code-reviewer:
2 P1, 1 P2, 1 P3 + 3 soft. **Fixed now** (79615d4): P2 sanitize the `record()` failure error before
stderr; P1/R2 add the promised real-infra `domain_events` assertion in `ingest-commit.test.ts`; P3-soft
harden the Core-purity guard regex for `node:`-prefixed specifiers. **Acknowledged:** version-fallout test
bundling (→ Change above), inline-`#`-comment style (→ Try), recorder `catch` stack-loss (house pattern),
`transactionIds` family naming (→ Change; ratify at 4.2), `sourceAccount` field origination (established
"account" vocabulary, no glossary edit). **Deferred (prior phase):** B1 non-atomicity → #180.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Atomic audit-event recording (`UnitOfWork`) — close B1 gap | #180 | Open (design in 4.2) |
| `ingest --non-interactive`/`--json` never persists (runNonInteractive skips commitBatch) | #181 | Open |
| Ratify event-family payload field naming (`transactionIds` vs `producedTransactionIds`) | story-4.2 Phase 1 | Pending |

No new rule minted — this story consumed existing rules (R24 derive-from-4.0 note, R25 glossary
currency, R13 slicing, R4 composition-root, R6/R7 test honesty).
