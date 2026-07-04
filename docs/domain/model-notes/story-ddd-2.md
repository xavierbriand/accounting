# Model note — story-ddd-2

## Domain question

We build this app with AI agents steered by rules, review agents, and checks. Until now those controls had no shared language — each new one was named ad hoc, and some (the agents, the slash commands) kept being forgotten when we reasoned about "the harness". What *is* the harness as a domain: what are its words, how do its controls classify, and what may each kind of agent do?

## Terms

- **Used:** none from the product glossary — this note *creates* the second context precisely because the two languages must not mix ("rule", "gate", "window" already mean different things on each side). Harness-native terms already in circulation and canonized here: lane (R26), envelope (R13/R14/R16), drift (R21), tripwire.
- **Added:** harness · control · guide · sensor · computational · inferential · gate · doer · judge · advisor · braided control · disposition record · meta-control · authorization boundary · playbook · control inventory — defined in [docs/harness/glossary.md](../../harness/glossary.md), operational meaning owned by this repo, literature cited as provenance (Böckeler, martinfowler.com Apr 2026; Anthropic Doer–Verifier Jun 2026; OpenAI harness-engineering Feb–Mar 2026; Salesforce 7-patterns Jun 2026).
- **Changed:** none in the product glossary. `docs/domain/context-map.md` gains the second context (user-owned file — delta staged with this note's sign-off).

## Model

Two bounded contexts:

- **Shared Finances** (product) — unchanged.
- **Dev Harness** — the control system around the AI agents that develop the product. It spans `.claude/**` (sub-agents, commands/skills, hooks, settings), CLAUDE.md, the docs canon, and `harness/` tools. The boundary is *logical*: `.claude/` placement is Claude Code's discovery contract; the `harness/` folder holds only the domain's computational tools.

**Relationship — observed through an anti-corruption layer** (Mode A killed the drafted "Separate Ways": that term means *no integration*, but the harness consumes product files by design). Harness parsers (`drift-parser`, `agent-spec`, dod-check's readers) are the ACL: product-context text goes in, harness-context findings come out, and product vocabulary never enters harness language. The reverse direction — the harness *governing* the dev process — is process, not data, and lives in CLAUDE.md's guides and gates.

Inside the Dev Harness, a **control** classifies on two axes (Böckeler):

|  | Computational (deterministic) | Inferential (LLM judgment) |
| --- | --- | --- |
| **Guide** (feedforward) | plan template, lane table | CLAUDE.md prose, glossaries, playbooks |
| **Sensor** (feedback) | drift-scan, dod-check, CI | code-reviewer, plan-reviewer |

Beyond the 2×2 (full-expansion decision, 2026-07-04): a **gate** is a sensor wired to block; a **braided control** spans guide and sensor at once (the commit envelope: authored as a budget, measured by dod-check, advisory-under-min / hard-at-max); a **disposition record** holds human rulings on sensor findings (the suggestion log); a **meta-control** is a sensor that generates next cycle's guides (the retrospective → R-rules); an **authorization boundary** blocks actions before they happen rather than observing after (settings permissions, the role→tools invariant); a **playbook** is a procedure a session executes (the `.claude/commands/` files — inferential guides that orchestrate).

Agents carry a **role** — a value object on the spec, exactly one per agent:

- **doer** — authors artifacts under review; the only role allowed file-mutation tools.
- **judge** — evaluates an artifact it did not author against a declared standard; returns findings, never dispositions.
- **advisor** — proposes options/actions for a human decision; gates nothing.

Assignments: sonnet-implementer → doer; code-reviewer, plan-reviewer, sibling-overlap, **ddd-modeler** → judge; backlog-refiner → advisor. ddd-modeler is judge-with-an-exception: Mode A is advisor-shaped, and the exception is recorded **in its description field** (frontmatter-adjacent, not buried prose) — chosen because mislabeling toward judge fails safe (a judge still gets invoked at Phase 4; an "advisor" risks being dropped from the review pair, weakening the R25 gate). Playbooks carry **no role** — they have no frontmatter and no tool grants; only the completeness invariant applies to them. Roles are orthogonal to § 6.2 model tiers: tiers say *which model runs*; roles say *what the agent may author*.

## Invariants

1. Every `.claude/agents/*.md` spec declares `role: doer|judge|advisor`. *(drift-scan Check F: `missing-role`)*
2. Only `role: doer` specs list file-mutation tools — `Write`, `Edit`, `NotebookEdit`, `MultiEdit`. *(Check F: `role-tools-violation`; residual: judges and advisors keep `Bash` for git/gh reads — the judge/advisor distinction is documentation-of-intent, not enforcement, until a sandboxing follow-up gives it teeth)*
3. Every `.claude/agents/*.md` and `.claude/commands/*.md` file has a row in [docs/harness/control-inventory.md](../../harness/control-inventory.md). *(Check F: `unlisted-control` — "forgetting a control" becomes a CI failure)*

*(Check letter F, set at Phase 2: main already has A/B/D after story-h10b; C is reserved for #154, E proposed by #172.)*
4. *(process, not machine-checkable)* Harness glossary and context map are user-owned; agents propose deltas, never rewrite.

## Events

None — the Dev Harness is a control system; drift findings are check output, not domain events.

## Rejected alternatives

- **Move `.claude/agents|commands` into `harness/`** — breaks Claude Code's discovery contract; the forgetting problem is solved by invariant 3 instead.
- **Single shared glossary** — same word, two meanings ("rule", "gate", "window"); translation noise instead of clarity.
- **Two-role doer|judge** — squeezes propose-only agents (backlog-refiner) into a verdict-rendering role they don't have.
- **Keep literature's "verifier"** — collides with test-verification vocabulary; "judge" names the author≠judge separation the enforcement exists for.
- **Separate Ways relationship** — term of art for *no integration*; falsified by drift-scan/ddd-modeler consuming product artifacts (Mode A, 2026-07-04).
- **ddd-modeler as advisor / multi-value role / spec split** — advisor understates the Phase-4 gate; multi-value grows the doer-exclusivity invariant a quantifier; splitting doubles maintenance for one agent's honesty. Revisit the split when h10b single-sources spec structure.
- **Strict 2×2 (no new terms) or hybrid-note middle path** — leaves the envelope/suggestion-log/retro/permissions misfits implicitly classified; user chose full expansion (2026-07-04) so every observed control kind has a name.
- **Full strategic ceremony for every harness story** — Phase 0 stays opt-in for Reduced lane; this story is the precedent, not the mandate.

## Sign-off

- User: Xavier Briand, 2026-07-04 — signed off with glossary (21 terms incl. Roles) and context-map delta as staged.
