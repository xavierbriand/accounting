# Domain model

The living reference for *what this system means* — separate from [architecture.md](../architecture.md), which records *decisions*, and [engineering-standards.md](../engineering-standards.md), which records *how we build*.

| File | What it is |
| --- | --- |
| [glossary.md](glossary.md) | The ubiquitous language — every domain term, defined plain-language-first |
| [context-map.md](context-map.md) | The strategic view — bounded context(s), modules, external systems |
| [model-notes/](model-notes/) | One note per modeled story (template: [docs/templates/model-note.md](../templates/model-note.md)) |

## Ownership

**The glossary and context map are user-authored.** Agents propose deltas — in a model note's Terms section, or as PR suggestions — and never rewrite these files directly. The user signs off every change.

## Conventions

- **Plain-language first.** Every glossary entry opens with a sentence a non-technical partner understands, then a concrete example, then the technical notes. Write for the household conversation, not the code review.
- **Same-PR rule (R25).** New domain vocabulary in code updates [glossary.md](glossary.md) in the same PR. Code identifiers use glossary terms; a synonym in code is drift, and drift is a defect.
- **Model notes precede plans (R24).** A story that adds or changes a Core domain concept gets a Phase-0 model note before its plan; the plan's `## Domain model` section derives from it.
