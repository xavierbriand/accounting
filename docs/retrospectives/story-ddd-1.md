# Retrospective — story-ddd-1 (DDD adoption: model first, then forward)

## Keep

- **Model-first, zero-retrofit.** Naming the latent model (Money = value object, Transaction = aggregate root, canonicalization = anti-corruption layer) cost one docs story and no code churn; the reverse-engineering model note doubled as the format's first worked example.
- **Plain-language-first glossary shape.** Everyday definition → example with numbers → technical notes reads well at both altitudes; the non-technical entry point is the first sentence, the agent's contract is the third block.
- **Skill + agent split for co-design.** Interactive dialogue in the main session (`model-session` skill), non-interactive candidate generation and conformance scanning in the one-shot `ddd-modeler` agent — same division of labor the Phase-2 reviewers already proved.

## Change

- **Phase 0 enters the workflow (R24).** Stories touching Core domain concepts get a user-signed model note at `docs/domain/model-notes/story-<id>.md` before the plan; the plan's new `## Domain model` section derives from it. No-model-impact stories declare the skip with a reason.
- **Phase 4 gains model conformance (R25).** `ddd-modeler` Mode B runs in parallel with `code-reviewer` when a model note exists: identifiers against glossary, invariants against tests, events against the note. New domain vocabulary updates the glossary in the same PR.
- **`docs/templates/plan-template.md` now exists** — the dangling `new-story-preflight` step-3 reference (noted since story-h5) resolves.

## Try

- **First real Phase 0 at Epic 4 story definition** — model soft edits (FR19/20) and the audit trail (FR23) as domain events (plain value objects via a `DomainEventRecorder` port) before any code exists; the two *(forthcoming)* glossary entries are the session's seed.
- **Glossary-conformance tooling only if the convention slips** — R25 is convention-enforced; escalate to a drift-scan Check C after 2–3 data points, per house pattern.
- **Revisit § 6.3's restart caveat** — this session's harness registered `ddd-modeler` live from the freshly written spec (no restart); if that reproduces in a fresh session, soften the doctrine. The `general-purpose`-with-spec-inline fallback stays documented either way.

New rules: **R24**, **R25** — rows added to CLAUDE.md § 8 in this PR (numbering continues from R24 per story-maint-18's reservation; the R22 *(pending)* slot stays contested).
