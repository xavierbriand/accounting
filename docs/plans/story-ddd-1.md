# Story ddd-1 — DDD adoption: model first, then forward

## Context

The project has practiced Domain-Driven Design *implicitly* since Epic 1: hexagonal layering with a pure `src/core/`, `Money` ([src/core/shared/money.ts](../../src/core/shared/money.ts)) is a textbook value object, `Transaction` ([src/core/ledger/transaction.ts](../../src/core/ledger/transaction.ts)) is an invariant-guarded aggregate root in all but name. But none of it is *named*: no ubiquitous-language glossary, no context map, no modeling step in the workflow, and DDD vocabulary is absent from the canon docs. The single prior appetite signal is [docs/learning/spdd-comparison.md](../learning/spdd-comparison.md) § 4.6, which recommends an "Entities slot" in the plan template ("DDD discipline lives in CLAUDE.md § 2 and docs/architecture.md, but plans don't consistently foreground entity modelling… Adopt").

Two goals drive the adoption (user intent, collected in the planning dialogue):

1. **Sharper domain model + learning by doing** — practices to bring back to small-team work.
2. **Sharing the mental model with non-technical people** — the glossary and context map are written plain-language-first so a non-technical partner can participate in the design conversation.

The deeper motivation is methodological: when agents write the code, the human designs one level up. Evans's position — *the model is the design; code is one expression of it* — becomes the operating principle. The human authors the model artifacts (glossary, context map, per-story model notes); agents author code that expresses them; Phase-4 review gains the question "does the code say what the model says?".

Epic 4 (soft edits FR19/20, audit trail FR23, dissolution FR21) is next and its stories are undefined — the natural first application of the new practice. This story equips it without touching production code.

No FR coverage (process/docs/workflow story). Pure zero-behaviour-change story — **R16 collapse applies**.

**Maintenance sub-loop (§ 6.7) run 2026-07-03 pre-planning:**

- [x] **Sibling work check.** Open PRs: [#152](https://github.com/xavierbriand/accounting/pull/152) (`story-h7`, dod-check enforcement tiers — harness-only, no file overlap). Open issues reviewed (31): harness-curriculum modules (#94–#100, #111), deferred-suggestion items scoped to their stories, product bugs (#93, #103, #105, #106) — none overlaps DDD adoption. Closest name-match is [#100](https://github.com/xavierbriand/accounting/issues/100) ("Harness module 6: starter template, talk, glossary") — that glossary is the *agentic-engineering curriculum* glossary, not the domain glossary; disjoint scope, noted to avoid future confusion.
- [x] **Story-id uniqueness (R23).** `git ls-tree -r origin/main --name-only -- docs/plans/ docs/retrospectives/ docs/status.d/ | grep -i ddd` — no match; no open PR branch (`story-h7` only) uses the id. `story-ddd-1` is free.
- [x] **Working tree clean.** Clean; branch `claude/ddd-adoption-strategy-6i7txi` rebased on `origin/main` (`00474b2`).
- [x] **Open PRs.** #152 only (draft, sibling harness story) — no overlap.
- [x] **Proceed-to-planning.**

**Branch note.** This session's designated branch is `claude/ddd-adoption-strategy-6i7txi` (session-assigned), used in place of the checklist's `story-<id>` worktree convention; one agent per branch holds (R18).

## Story

> As the engineer designing this system through agents, I want the domain model to exist as explicit, user-owned artifacts (ubiquitous-language glossary, context map, per-story model notes) with a modeling phase and a conformance review wired into the workflow, so that I design at the model level, agents implement against the model, review checks that code expresses the model — and my non-technical partner can read the design.

## Domain model

This story *creates* the domain-model practice, so it is its own first exercise: the model note at [docs/domain/model-notes/story-ddd-1.md](../domain/model-notes/story-ddd-1.md) reverse-engineers the model already latent in `src/core/` (no new concepts are invented; existing ones are named). Glossary terms added: 17 seed terms + 2 reserved *(forthcoming)* Epic-4 entries = 19 total. Aggregates/VOs/services touched in *code*: none — naming only.

## Selected solution

One zero-production-code story, five deliverable groups:

### 1. `docs/domain/` — the user-owned model home

- `docs/domain/README.md` — ownership rules: **glossary + context map are user-authored**; agents propose deltas (PR suggestions, model-note "Terms" sections), never rewrite them directly. Plain-language-first convention. Same-PR maintenance rule (R25).
- `docs/domain/glossary.md` — the ubiquitous language. Fixed three-part entry shape: **Everyday definition** (one sentence a non-technical partner understands) → **Example** (concrete, with numbers) → **Technical notes** (type, file path, DDD pattern name, invariants). Seeded with 17 terms reverse-engineered from `src/core/`: Ledger, Transaction (aggregate root), Entry (value object), Double-entry invariant, Money (value object), Partner, Split rule, Validity window, Buffer, Buffer status, Recurring rule, Forecast occurrence, Safe transfer, Line item, Idempotency hash, Canonicalization, Snapshot — plus two Epic-4 terms marked *(forthcoming)*: Soft edit, Audit trail / domain event (19 entries total).
- `docs/domain/context-map.md` — strategic view with one Mermaid diagram. Records the decision: **one bounded context ("Shared Finances") with named modules** (Ledger, Ingestion, Liquidity & Settlement, Configuration & Rules, future Annual Planning), not multiple contexts — one language, one team; splitting now would be model theater. External systems on the map: bank CSV exports (upstream, conformist — ingest canonicalization is our **anti-corruption layer**), `accounting.yaml` (user-authored policy, Zod boundary), CLI/JSON output (downstream). **Split tripwire documented:** Annual Planning (Epic 5) is the first candidate for a second context if its language diverges; revisit at Epic 5 planning, not before.
- `docs/domain/model-notes/story-ddd-1.md` — first model note (the reverse-engineering note), self-demonstrating the template.

### 2. Templates

- `docs/templates/model-note.md` — Phase-0 output template: Domain question · Terms (used/added/changed) · Model · Invariants · Events · Rejected alternatives · Sign-off. Capped ~1 page.
- `docs/templates/plan-template.md` — **created** (resolves the dangling reference from [.claude/commands/new-story-preflight.md](../../.claude/commands/new-story-preflight.md) step 3, noted as a gap in story-h5's plan). Mirrors the de-facto shape of recent plans and adds the `## Domain model` section (spdd-comparison § 4.6's "Entities slot", generalized).

### 3. Agent + skill — the co-design mechanism

- `.claude/agents/ddd-modeler.md` — read-only agent (Read/Glob/Grep/Bash), modeled on `plan-reviewer.md`, two prompt-selected modes:
  - **Mode A — modeling support (Phase 0):** given a story brief + glossary + context map + relevant Core paths, returns 2–3 *candidate* model shapes (concepts, invariants, proposed type signatures, glossary deltas) with trade-offs and open questions. **Proposes, never decides** — the user + Opus dialogue consumes it.
  - **Mode B — model conformance (Phase 4):** given a diff + plan + model note + glossary, returns structured findings (`## Model-conformance findings`, `## Glossary-delta check`, `## Counters`) in the plan-reviewer observation style. Never tags adopt/defer/reject; never edits.
- `.claude/commands/model-session.md` — skill structuring the *interactive* Phase-0 co-design in the main session (custom subagents are one-shot and cannot converse with the user; the dialogue lives in the main loop, the agent supplies proposals).

### 4. Workflow wiring (CLAUDE.md)

- § 2: one bullet pointing to `docs/domain/` and the same-PR glossary rule.
- § 6.1: **Phase 0 "Model"** inserted before Phase 1 (no renumbering of phases 1–5, which are referenced by name across retros and agent specs). Exit criteria: model note committed; glossary/context-map deltas staged on the branch; plan's `## Domain model` section derives from the note. Escape hatch: stories with no Core-concept impact declare `No model impact — <reason>` in the plan (maint/process/docs stories qualify by default). DoR line becomes "phases 0–2 complete".
- § 6.1 Phase 4: when the story has a model note, invoke `ddd-modeler` (Mode B) in parallel with `code-reviewer` (same two-agent single-message pattern as Phase 2).
- § 6.2: Opus tier gains domain modeling; `ddd-modeler` runs on Opus (design judgment, unlike the scanning-only plan-reviewer on Sonnet).
- § 8: two rows, literal text (numbering per story-maint-18's explicit reservation: "future codifier starts at R24" — the R22 slot stays contested):

  | Tag | Rule (one-line) | Originating retro |
  | --- | --- | --- |
  | R24 | Stories touching Core domain concepts require a Phase-0 model note at `docs/domain/model-notes/story-<id>.md`; the plan's Domain-model section derives from it; no-model-impact stories declare it with a reason | [story-ddd-1](docs/retrospectives/story-ddd-1.md) |
  | R25 | Model-conformance review at Phase 4 (`ddd-modeler` Mode B): code identifiers use glossary terms; new domain vocabulary updates `docs/domain/glossary.md` in the same PR | [story-ddd-1](docs/retrospectives/story-ddd-1.md) |

### 5. Architecture decisions (docs/architecture.md)

- **`### Domain model — named DDD patterns`**: names what exists — `Money` = value object; `Transaction` = the ledger's aggregate root (`Entry` a value object within it); the calculators (`SplitRulesService`, `BufferStateService`, `RecurringForecastService`, `SafeTransferCalculator`) = domain services; ports like `TransactionRepository` = repositories; ingest canonicalization = anti-corruption layer against bank CSV formats; validity window = our temporal-versioning pattern. Points to `docs/domain/`.
- **`### Domain events — plain value objects via a port`**: domain events enter as a first-class tactical pattern with Epic 4 (FR23 audit trail; FR19/20 soft edits are event-shaped; the append-only ledger is already event-thinking). Plain immutable value objects in Core, recorded via a Core port (working name `DomainEventRecorder`); Infra persists append-only. No base class, no dispatcher framework, no event sourcing. **No code in this story** — first implementation lands with the first Epic 4 story that needs it.

### Why this shape

- **Model-first, zero-retrofit:** naming the latent model costs one story and no code churn; a structural retrofit (folder renames, marker abstractions) would burn several stories for no behaviour change and fight R16's own economics.
- **One bounded context:** a second context has no buyer — one team, one language. The context map records the split criteria instead of the split.
- **Skill + agent split:** the modeling *dialogue* needs the user; subagents can't converse. The skill runs the conversation in the main loop; the agent does the parallelizable, non-interactive work (candidate generation, conformance scanning).

## Production-code surface (R2)

None — no `src/`, no `harness/`, no schema/migration, no dependency change. Files touched: `docs/domain/*` (new), `docs/templates/*` (new), `docs/architecture.md`, `CLAUDE.md`, `.claude/agents/ddd-modeler.md` (new), `.claude/commands/model-session.md` (new), plus this plan, the retro, and the status fragment.

## Gherkin acceptance scenarios

None — process/docs story with no executable surface. Verification is by inspection plus the standard sanity gates (see § Verification plan). The one behavioural check is a same-session smoke test of `ddd-modeler` Mode A — *fails if* the spec's Never block doesn't hold in practice: the agent ranks/recommends a single model, omits candidate shapes or user questions, or writes files. (Registration note: this harness registered the new agent spec live, without the session restart CLAUDE.md § 6.3 documents — the smoke test runs against the real `ddd-modeler` agent type; § 6.3's caveat is retained as written until reproduced in a fresh session.)

## Slice plan (R16: 4 change-body commits; 4th slice justified — change spans process AND docs)

Preparatory (before Phase 3; not counted per R16):

- **P0:** `chore(docs): story-ddd-1 plan + P1/P2/P3 review`

Change-body commits:

1. **C1:** `chore(docs): domain model docs — glossary, context map, architecture naming [story-ddd-1]`
   Files: `docs/domain/README.md`, `docs/domain/glossary.md`, `docs/domain/context-map.md`, `docs/domain/model-notes/story-ddd-1.md`, `docs/architecture.md`
2. **C2:** `feat(agent): ddd-modeler agent, model-session skill, Phase 0 workflow [story-ddd-1]`
   Files: `.claude/agents/ddd-modeler.md`, `.claude/commands/model-session.md`, `docs/templates/model-note.md`, `docs/templates/plan-template.md`, `CLAUDE.md`
3. **C3:** `refactor: empty slot — docs/process-only story, no code surface [story-ddd-1]`
   Per R11 — no refactor surface in a docs/process story.
4. **C4:** `chore(retro): story-ddd-1 retrospective + status fragment [story-ddd-1]`
   Files: `docs/retrospectives/story-ddd-1.md`, `docs/status.d/2026-07-03-story-ddd-1.md`

**Total: 4 change-body commits under R16's counting** (C1 docs + C2 process + C3 empty refactor slot + C4 retro). The optional 4th body slice is justified per R16's own carve-out: the change spans domain *docs* (C1) and workflow *process* (C2).

## Risks & deferred items

| Risk | Mitigation |
|------|-----------|
| Glossary staleness (the classic DDD failure mode) | R25 same-PR rule + Phase-4 Mode B findings; escalate to drift-scan tooling (deferred issue) if the convention slips twice, per this repo's 2–3-data-points-before-tooling pattern |
| Multi-context overreach | Explicitly rejected: one context; Epic-5 split tripwire documented in context-map.md |
| Ceremony weight for a solo dev | Phase 0 gated to Core-concept stories only; `No model impact — <reason>` one-liner escape; model note capped ~1 page |
| User-authored artifacts drift toward agent-authored | README ownership statement; skill + agent specs instruct propose-only for glossary/context-map |
| `ddd-modeler` unusable until session restart | Did not materialize — this harness registered the spec live (see § Gherkin note); `general-purpose`-with-spec-inline remains the documented fallback for harnesses that need the restart |
| R24/R25 tag race with the 3 pending R22 candidates | Numbering follows story-maint-18's explicit "start at R24" instruction; re-verified at planning time (R23 remains highest row on `origin/main`) |

Deferred follow-ups (each filed as a GitHub issue at Phase-2 tagging):

1. Drift-scan **Check C — glossary conformance** (model-note/plan Domain-model terms must exist in `glossary.md`; later: diff identifiers vs glossary).
2. **Domain-events port** (`DomainEventRecorder` + append-only event store) — lands with the first Epic 4 story needing FR23; issue links the architecture decision.
3. **Epic 4 story definition runs Phase 0 first** — epics.md's "stories to be defined during implementation" placeholder becomes the first real modeling session (soft edits + audit trail vocabulary, domain events modeled before code).

(An earlier draft deferred "agent registration verification next session"; registration was observed live in this session, so the item dissolved — no issue filed.)

## Verification plan

1. `npx tsx harness/drift-scan/drift-scan.ts --all` — exit 0 (R24/R25 § 8 rows ↔ retro citations consistent; plan ↔ source consistent).
2. `npm run lint && npm run build && npm test` — green (no production surface touched; sanity only).
3. `git diff origin/main --stat` — no `src/` or `harness/` paths.
4. Dangling reference resolved: `docs/templates/plan-template.md` exists where `new-story-preflight.md` step 3 points.
5. Mode A smoke test: invoke `ddd-modeler` (registered live in this session) against a toy Epic-4 question ("model a soft edit") — passes if it returns 2–3 candidate shapes with trade-offs + questions for the user; *fails if* it ranks/recommends a single model, omits candidates or questions, or writes any file.
6. Mermaid diagram renders on the draft PR (GitHub preview).

## Suggestion log

Phase 2 — `plan-reviewer` + `sibling-overlap` in parallel, 2026-07-03. plan-reviewer: 20 findings (9 P1 / 5 P2 / 6 P3, rule-tag walk 12 applies / 22); sibling-overlap: no overlap, 4 adjacencies noted. Substantive items:

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | Glossary term-count arithmetic inconsistent ("~18" vs 17 seed + 2 forthcoming = 19 actual entries) | ADOPT | Plan reworded to "17 seed + 2 *(forthcoming)* = 19 entries" in both places |
| 2 | R24/R25 literal § 8 row text not drafted in the plan itself — reviewer had to reconstruct it from sibling deliverables | ADOPT | Literal table rows added to § 4 workflow wiring |
| 3 | Self-referential sequencing tension: DoR "Phase 0" unchecked while the model note's sign-off claims approval — for the story establishing note-before-plan | ADOPT | DoR Phase-0 line now states the bootstrap explicitly: note authored concurrently with the plan, user plan-mode approval covers both; note-before-plan binds from the next story |
| 4 | Mode A smoke test lacks an explicit `fails if` framing (R6 spirit, though no Gherkin exists) | ADOPT | Verification item 5 and § Gherkin note now carry a `fails if` clause (ranks/recommends, omits candidates/questions, writes files) |
| 5 | `plan-template.md` header comment claims "sections mirror the PR template's 1–6" — inaccurate (template mirrors recent plans; PR sections are filled from them) | ADOPT | Template comment corrected |
| 6 | Commit subjects C1/C2 enumerate artifact nouns; R12 fit "arguable" (original concern was scenario enumeration) | ACKNOWLEDGE | Artifact-noun subjects for R16 multi-artifact docs commits follow story-maint-18 precedent; not scenario enumeration |
| 7 | Drift-scan can't independently confirm R24/R25 row ↔ retro consistency at Phase-2 time (rows/retro land in C2/C4) | ACKNOWLEDGE | Early run showed only the expected `table-only` findings; final gate re-runs post-C4 (Verification item 1) |
| 8 | Story cites no epics.md entry for itself | ACKNOWLEDGE | Follows `story-maint-*`/`story-h*` precedent for non-epic process stories; Epic 4 cited as forward-context only |
| 9 | Remaining findings: confirmations of consistency (architecture.md prose ↔ diff, plan-template self-hosting, preflight reference resolved, R22/R24 numbering verified, PII/naming/R11/R16/R17/R18/R19/R21/R23 compliance) | ACKNOWLEDGE | Clean — nothing to resolve |
| 10 | Sibling-overlap adjacencies: #132 and #87 would edit the same § 8 table (mechanical append conflict at worst — § 6.4.1 protocol covers); #80's future drift agent is conceptually near Mode B (cross-reference when planned); #152's dod-check tiers validate this story's commit shape on CI | ACKNOWLEDGE | Awareness only; no scope overlap, no action |
| 11 | Registration surprise (observed during Phase 2, outside both reports): harness registered `ddd-modeler` live without the § 6.3 restart | ACKNOWLEDGE | Plan risk row + retro Try updated; § 6.3 doctrine unchanged until reproduced in a fresh session |

**Tally:** 5 adopted / 6 acknowledged / 0 deferred / 0 rejected. DoR gate met — no un-tagged suggestions; no deferred rows, so no issue links required.

## DoR checklist

- [x] Phase 0 (Model): satisfied by bootstrap — this story *ships* the phase, so its model note ([story-ddd-1](../domain/model-notes/story-ddd-1.md)) was authored concurrently with this plan rather than before it; the note's sign-off is the user's plan-mode approval of both together. Every subsequent story follows note-before-plan (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — plan-reviewer + sibling-overlap in parallel): complete 2026-07-03; findings triaged above.
- [ ] Draft PR with template sections 1–6 filled.
