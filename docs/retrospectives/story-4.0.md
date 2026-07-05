# Retrospective — story-4.0 (Epic-4 defining session: corrections + audit trail)

PR #179 · Issue #156 (Epic-4 story definition) · seeds #155 (`DomainEventRecorder`)

The first Phase-0 modeling session that produces *story definitions* rather than a single feature. Epic 4 ("Trust, Transparency & Lifecycle", FR14/19/20/21/23) carried a "to be defined" placeholder; this session ran `ddd-modeler` Mode A for candidate correction/event shapes, converged the six policy questions with the user fork-by-fork (AskUserQuestion), wrote the shared model note, promoted the two reserved glossary terms, and sliced the epic into stories 4.1–4.5. Zero code — the numbered stories carry it.

**Converged model.** Reverse-and-correct: a correction writes a **reversal** + a **correcting entry**, never mutating the original; both new rows carry the original date (receipt truth, no Core clock); all fields editable; reason required; all rows visible; unlimited chaining; no actor. Recorded as a `TransactionCorrected` domain event via the `DomainEventRecorder` port (#155); recorder call-site deferred to story-4.1.

**Vocabulary correction mid-session.** The user rejected "soft edit" as UI-language and asked for the accounting-idiomatic term. Landed on **Correction** (concept + CLI verb `correct`, replacing the FR14 "Soft Edit" command name) and **Correcting entry** (replacing "restatement", which in accounting means restating *issued statements*). This forced a rename walk across all active canon — `prd.md` (FR14, command list, UX note), `architecture.md`, `quality-assurance.md`, `glossary.md`, `context-map.md`, `epics.md` — so no canon contradicts the new glossary. Historical point-in-time files (ddd-1 plan/retro/model-note) left as-is.

## Keep / Change / Try

- **Keep:** `ddd-modeler` Mode A → fork-by-fork `AskUserQuestion` convergence. Candidate shapes with explicit trade-offs let the user own each of the six policy calls without the agent deciding — exactly the judge/scan split (§ 6.2). The model came out crisp and testable (8 invariants, each mapped to a story-4.2 test).
- **Change:** the naming fork surfaced late (during glossary sign-off), after the model note + slices were already drafted against "soft edit". A one-line "is this term accounting-idiomatic?" check at the glossary-seed step (Phase 0 step 1) would have caught it before the first draft, saving a rename pass.
- **Try:** make "walk every *active* canon reference when a term is renamed" an explicit definition-session checklist item (operationalizes issue #87). This session did it by grep after the fact; codifying it prevents a half-renamed glossary shipping.

## Loop metrics

- **Lane:** Light (R26) — docs/process only; no `src/`, no tests, no `harness/`, no `.claude/`. Phase 0 = this session itself (the modeling *is* the deliverable); Phase 2 review dropped (Light); Phase 4 = `code-reviewer` only; plan folded into the PR #179 body.
- **Commits:** R16 docs-only collapse — `chore(docs)` (model note + glossary + slices + vocab reconciliation) + empty `refactor:` (R11) + `chore(retro)` (this file + status). 3 body commits, no separate Sonnet/plan commit (Light).
- **Vocabulary blast radius:** 7 docs files reconciled for the `soft edit → Correction` / `restatement → Correcting entry` rename; drift-scan green (Check A/B/D) post-rename.
- **Sibling coordination:** only in-flight sibling at Phase-1 was `story-ddd-2` (harness context, PR #174) — merged into `origin/main` before this branch was cut; no overlap. Issues #155 (`DomainEventRecorder` port) and #156 (this definition) are the direct seeds; #155 stays open for story-4.1.

## Handoffs

- **story-4.1** (next): `DomainEventRecorder` port + append-only event store + first event (`TransactionIngested`); decides the recorder call-site (B1/B2, deferred here). Its plan's `## Domain model` section derives from this note (R24). Closes #155.
- **story-4.5** must promote the reserved **Dissolution** glossary term and ship `ConfigChanged` before Epic-5 Story 5.4.
