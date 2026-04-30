# SPDD vs. this repo's product-dev loop

> **Audience.** Two readers, in order of priority:
>
> 1. **Talk-feeder for Module 6** — the speaker preparing the 45-min agentic-engineering talk needs three slide-ready bullets, named methodology references, and the *places we exceed and trail SPDD* mapped to talk sections.
> 2. **Onboarding for the starter template** — a forking colleague reading this alongside `STARTER.md` to understand *why* the workflow looks the way it does, with both sides steel-manned so they can defend the loop's choices to their own team.
>
> See also: [harness-engineering.md](harness-engineering.md) (the parent curriculum doc).

## § 1. Preamble

[Structured Prompt-Driven Development (SPDD)](https://martinfowler.com/articles/structured-prompt-driven/), authored by Sheng Zhang with Birgitta Böckeler, Bryan Oakley and others on Martin Fowler's site, treats prompts as **first-class delivery artefacts**: versioned, reviewed, kept in sync with code. Its reference implementation is [openspdd](https://github.com/gszhangwei/open-spdd) — a Go CLI that ships Canvas templates as Markdown into `.claude/commands/`, `.cursor/commands/`, and similar harness-specific directories. The methodology targets *team / compliance / standardized-delivery* contexts (5★ in the article's own scoring); it explicitly rates 1–2★ for solo or exploratory work.

This repo's product-dev loop, codified in [CLAUDE.md § 6](../../CLAUDE.md), is a single-author practice that wants to scale up — the [harness-engineering curriculum](harness-engineering.md) defines the end-state evaluation as *"a colleague forks the starter template and ships their first story without me in the loop."*

The interesting question for this comparison is **not** "which is right *here*" — that would over-weight today's solo context. It's **"which of the current loop's choices survive growth, which break, and which should adopt SPDD machinery now to avoid pain later?"**

## § 2. At a glance

| Axis | SPDD | This loop |
| --- | --- | --- |
| Phase count | 6 commands (+ optional `/spdd-story`, `/spdd-code-review`) | 5 phases (Plan / Critical review / Implement / Code review + refactor / Retrospective) |
| Source-of-truth artefact | REASONS Canvas (7 slots: R-E-A-S-O-N-S) | `docs/plans/story-<id>.md` (recurring sections, no enforced schema) |
| Sync direction | Bidirectional (`/spdd-prompt-update` ↔ `/spdd-sync`) | Forward only — plans freeze post-merge |
| Test ordering | After Canvas + code (`/spdd-api-test`) | Outside-in TDD before code (failing acceptance → unit → green) |
| Governance source | Per-Canvas Norms + Safeguards (story-local) | Cumulative R-tag table in [CLAUDE.md § 8](../../CLAUDE.md) (cross-story) |
| Agent topology | Single AI agent driven by user-typed commands | Three role-specialised sub-agents with restricted tool lists ([plan-reviewer](../../.claude/agents/plan-reviewer.md), [code-reviewer](../../.claude/agents/code-reviewer.md), [sonnet-implementer](../../.claude/agents/sonnet-implementer.md)) |
| Eval discipline | Implicit ("~99% intent alignment" claimed without baseline) | Explicit eval-driven harness engineering planned ([Module 4](harness-engineering.md#module-4--eval-driven-agent-engineering--prompt-engineering-centerpiece)) |
| Author scale stance | 5★ team / compliance · 1–2★ solo · acknowledges "high bar on abstraction and modelling" | Single-author today; curriculum end-state is team |

## § 3. Where they agree

Six shared first principles. These are not novel to either side — they're the load-bearing premises both methodologies inherit and would be visible in any serious AI-augmented dev loop.

1. **Specs as first-class.** SPDD's "first-class delivery artefact" maps directly onto R1 (*plan file alongside code*) and the plan-as-contract rule that drives Phase-4 retro-checks here.
2. **Phased pipeline with named human gates.** Both linear; both put humans at named decision points; both refine in-loop rather than one-shot.
3. **Slash commands as workflow primitives.** SPDD's six commands are the visible interface. This loop *plans* to add them in [Module 2](harness-engineering.md#module-2--claude-code-primitives-by-niche).
4. **Spec as normative source.** Both treat the artefact (Canvas / plan) as governing; both audit against it post-implementation.
5. **AI executes, human reviews at gates.** Identical division of labour at the conceptual level.
6. **Story decomposition.** SPDD's INVEST stories (1–5 days) and this repo's "one PR per story" target similar grain.

## § 4. Where they diverge

For each: SPDD position · current-loop position · **scale-up verdict** (does this hold under team growth, multiple authors, compliance pressure?).

### 4.1. Test ordering

SPDD: tests follow Canvas + code (`/spdd-api-test` after `/spdd-generate`). This loop: outside-in TDD before code — failing acceptance → failing unit → minimal green ([CLAUDE.md § 5](../../CLAUDE.md)). **Scale-up verdict:** TDD's catch-net advantage shrinks under heavy team review (more eyes catch coincidence-pass), but doesn't disappear. For Core invariants (money, ledger), test-first remains stronger because peer review can't reproduce the assertion-shape discipline TDD enforces — review checks code, not the *test's framing of the question*. **Holds.**

### 4.2. Static rigid template vs. evolving plan

SPDD: 7-slot REASONS Canvas, fixed schema. Current loop: recurring plan sections (Production-code surface, Gherkin scenarios, slice plan) without enforced shape. **Steel-man for SPDD:** at team scale, *consistency cost dominates contortion cost*. A colleague reading 30 plans in 30 different shapes wastes more time than a fixed schema's friction costs. The article's choice is *correct* for its target regime, not a flaw. **Scale-up verdict:** the current loop's freeform plans optimise for the experienced solo author; they degrade fast under multiple authors. *Borrow more than just an Entities slot — also Safeguards.*

### 4.3. Prompt-first sync rule

SPDD: *"When reality diverges, fix the prompt first — then update the code."* Two commands close the loop: `/spdd-prompt-update` (intent → code) and `/spdd-sync` (code refactor → Canvas). This loop: plans freeze post-merge; refactors update code; retros capture lessons at the rule level. **Scale-up verdict:** at single-author scale, retro-driven learning compensates for plan rot because the author *remembers* the plan. At team scale, plan rot becomes a recurring onboarding tax — the next person reads a plan that no longer matches code. **Significant gap; raises Module 7 priority — see § 7.**

### 4.4. Single agent vs. role-specialised sub-agents

SPDD: one agent driven by user-typed commands. This loop: three specialised sub-agents — `plan-reviewer`, `code-reviewer`, `sonnet-implementer` — each with a restricted tool list. **Scale-up verdict:** specialisation helps *more* at scale, not less. Restricted tool lists become safety rails as more humans enter the loop; an agent that can only read isn't going to push by accident. The current loop is ahead, and the advantage compounds with team size. **Original contribution worth claiming in the talk** — SPDD's authors don't address sub-agent topology at all.

### 4.5. Rule provenance — cumulative R-tags vs. per-Canvas Norms

SPDD encodes governance inside each Canvas (Norms + Safeguards sections). This loop accumulates rules in CLAUDE.md § 8 (R1–R19), each tagged to its originating retro. **Steel-man for SPDD:** under multiple curators, R-tables fork — different curators add different rules from similar incidents, and merging is non-trivial. Per-story Norms avoid the merge problem because each Canvas captures governance for *its* story only. **Scale-up verdict:** the current loop wins on *cumulative learning* — R8 (mock diversity) transfers across all future stories without re-derivation. SPDD wins on *multi-curator coordination*. The right answer at scale is probably **both layers** — a global R-table for cross-story rules, per-plan Safeguards for story-specific ones. The current loop has the global layer; it's missing the per-plan one.

### 4.6. Domain modelling explicitness

SPDD: explicit Entities section in every Canvas, frequently rendered as Mermaid diagrams in the openspdd templates. This loop: DDD discipline lives in [CLAUDE.md § 2](../../CLAUDE.md) and [docs/architecture.md](../architecture.md), but plans don't consistently foreground entity modelling. **Scale-up verdict:** SPDD ahead. For stories touching new Core concepts, an Entities slot in the plan template is cheap, high-signal, and onboard-friendly. *Adopt.*

### 4.7. Bidirectional governance

SPDD: forward + backward sync. This loop: forward only; the retrospective is the only feedback channel. **Scale-up verdict:** the gap is more serious at team scale than at single-author scale — see § 4.3. The retro mechanism doesn't compensate when retros happen monthly per-team rather than per-story per-author; the rule-evolution latency rises and plan-code drift compounds. *Filed as Module 7 sub-issue, not deferred.*

### 4.8. Scale stance

SPDD explicitly targets team / compliance / standardisation; the article warns that SPDD "can look like a method reserved for senior architects." This loop is a single-author practice today. **Scale-up verdict:** the *right* question isn't "where does each fit *now*" but "which choices in the current loop are scale-portable?" Five are (TDD ordering, role-specialised agents, rule provenance, retro discipline, failure-signature taxonomy); three need work (rigid plan template, plan-code sync, slash-command vocabulary as onboarding primitive). The article's "1★ solo" framing is irrelevant to where this curriculum is heading.

## § 5. What this loop has that SPDD lacks

A short ledger, each entry annotated with **scale-up resilience** (does this survive team growth?):

- **R-tag rule provenance** — *needs work at scale.* Cumulative learning is genuinely better than per-Canvas Norms; multi-curator coordination needs design (see § 4.5). Action: think through R-tag forking before a second curator joins.
- **Retrospective discipline** — *needs work.* Per-story retros at team scale degrade to per-sprint; rule-evolution latency rises.
- **Multi-agent role specialisation with restricted tools** — *holds and compounds.* The advantage grows with team size.
- **TDD outside-in** — *holds for Core invariants.* Especially load-bearing where assertion-shape discipline matters (money, ledger). Less load-bearing for CLI cosmetics.
- **Failure-signature taxonomy** ([curriculum Part B](harness-engineering.md#failure-signatures-to-learn-to-spot)) — *holds only if institutionalised.* Right now it lives in a doc, not the workflow. A new team member will not internalise the table by reading it once. *Action item folded into Module 4 below: code-reviewer agent should reference the taxonomy by name in its findings output.*
- **Eval-driven harness engineering** ([Module 4](harness-engineering.md#module-4--eval-driven-agent-engineering--prompt-engineering-centerpiece)) — *holds, but framing softens.* See § 6 below.

## § 6. What SPDD has that this loop is missing

Three, with steel-man arguments for each:

1. **Bidirectional plan-code sync.** The Canvas-as-living-doc rule (`/spdd-sync` after refactor) is more rigorous than retro-driven rule capture. At team scale, plans rot as fast as they're authored; sync mechanisms (drift-detect, plan-update commands) become load-bearing. The retrospective fires too coarsely to fix this — it captures *learning*, not *artefact freshness*.

2. **REASONS Canvas template structure.** Not just an "Entities slot" — *Safeguards* is also weak in current plans (a story that touches the ledger should explicitly enumerate the invariants the diff must not violate, in the plan, before code). The full 7-slot rigid template is the *correct* answer when consistency cost dominates contortion cost (see § 4.2 steel-man). Current plans are more like essays with recurring section headers; Canvas is a form.

3. **Slash-command vocabulary as a teaching primitive.** Six typed commands beats a 165-line CLAUDE.md for onboarding. A colleague who learns six commands has internalised the *workflow shape*; one who reads CLAUDE.md has internalised prose. Vocabulary transfers more reliably than narrative — it survives translation, summarisation, and partial recall in ways prose doesn't.

**Tradeoff to engage explicitly (re: Module 4):** SPDD's claim is that the Canvas reduces hallucination *upstream* so downstream evals matter less. This loop is strong downstream (Module 4's planned eval suite) and weak upstream (no Canvas-style intent capture before code). Both layers are needed. The honest framing isn't "we evaluate harder than SPDD" — it's "we cover different parts of the funnel, and the upstream gap is real." Adopting the Canvas slots from § 6.2 closes the upstream side.

## § 7. Curriculum delta

Module-by-module against [#95–#100](https://github.com/xavierbriand/accounting/issues/94), with one new candidate. Each marked **adopt / no-op / reject / new-work** plus the application path.

**Module 1 — drift-scan automation ([#95](https://github.com/xavierbriand/accounting/issues/95))** → **adopt-from-SPDD (extension).** Drift-scan today checks rule references in retros vs § 8. Extension: detect *plan-code staleness*. After Phase 4 refactor lands, if the plan's "Production-code surface" section names a function that no longer exists in the diff, drift-scan flags it. Cheap; closes a real upstream gap. *Application: comment on #95 with the new acceptance bullet.*

**Module 2 — primitives by niche ([#96](https://github.com/xavierbriand/accounting/issues/96))** → **adopt-from-SPDD (slash-command vocabulary).** Elevate from "one of each primitive" to *the conceptual operations of the loop have slash-command names.* Concrete proposal: `/plan` (open), `/critique` (run plan-reviewer), `/implement` (hand off), `/review` (run code-reviewer), `/retro` (write retrospective), `/sync` (drift-detect on plan vs. code). Even if implementation lags, the *vocabulary* is the teaching primitive. *Application: comment on #96.*

**Module 3 — right-size the gate ([#97](https://github.com/xavierbriand/accounting/issues/97))** → **reframe (no scope change).** Drop "single-dev" framing entirely; reframe the trivial-story lane as the *off-ramp for low-risk work at any scale*. Risk basis (touches Core / DB / migrations? touches Infra? CLI-only?) replaces size basis. The same lane that protects a solo author from over-ceremony protects a 50-person team from over-review on cosmetic CLI changes. *Application: comment on #97; no acceptance change.*

**Module 4 — evals + prompt engineering ([#98](https://github.com/xavierbriand/accounting/issues/98))** → **adopt + soften framing.** Drop the implicit "we exceed SPDD" framing. Engage the upstream/downstream tradeoff: SPDD reduces hallucination upstream (Canvas), this loop catches downstream (evals). Both needed. **New acceptance bullets:** (a) add a *spec-quality eval* — score the plan/Canvas itself before code generation (Entities slot populated? Safeguards slot? Gherkin scenario per acceptance criterion?) — closes the upstream gap; (b) `code-reviewer` agent should reference the failure-signature taxonomy by name in its findings, so the taxonomy lives in the workflow, not just the doc. *Application: comment on #98 with both bullets.*

**Module 5 — cost & telemetry ([#99](https://github.com/xavierbriand/accounting/issues/99))** → **no-op.** SPDD silent on cost / observability. Current proposal stands.

**Module 6 — starter template, talk, glossary ([#100](https://github.com/xavierbriand/accounting/issues/100))** → **adopt-from-SPDD (template + vocabulary).** Larger than the previous draft proposed: starter `STARTER.md` should adopt a fixed 7-slot plan template (Requirements / Entities / Approach / Structure / Operations / Norms — story-local / Safeguards) borrowed from REASONS, not copied. Plus: the six-command vocabulary (Module 2) becomes part of the starter's onboarding. *Application: comment on #100 with two acceptance bullets.*

**Module 7 — bidirectional plan-code sync ([#111](https://github.com/xavierbriand/accounting/issues/111))** → **NEW SUB-ISSUE (filed as part of this work).** Promoted from "considered, deferred" to filed-with-tripwire.

- **Goal:** plan stays mutable through Phase 4; freezes at retro; Phase 4 ends with explicit drift-detect.
- **Sub-tasks:** (a) sync mechanism updates Production-code-surface section when refactor renames functions named there; (b) `/sync` slash command (or hook) running drift-detect on plan claims vs. diff; (c) policy: drifted plan claims trigger an action item in the retro.
- **Sharp tripwire (replaces vague "wasted effort" criterion):** *first story where Phase 4 retro-check finds the Production-code-surface section out of sync with the diff.* That moment is the trigger to ship Module 7. Until then, the issue stays open with a `blocked-on-tripwire` note in its body.
- **Why now, not later:** § 4.3 verdict — the gap widens at team scale; filing the issue locks in the design before the trigger fires, so when it fires we don't have to scramble.

## § 8. Verdict — three slide bullets

Each ≤ 80 chars. These are the slide bullets for talk Section 5 ("How this loop compares to a published methodology") in [Module 6](harness-engineering.md#module-6--teach-back-evaluated-by-colleague-ships-without-you).

- **Multi-agent specialisation is the win SPDD doesn't have.** *Three sub-agents with restricted tools beat one general-purpose agent at team scale; this is the most defensible original contribution.*
- **Rules from retros beat rules in templates — but only with sync.** *Cumulative R-tags compound learning where per-Canvas Norms re-derive it; the missing half is plan-code sync, not rule capture.*
- **Borrow the Canvas slots; keep the TDD discipline.** *Adopt SPDD's template rigour for onboarding; reject its test-after-code ordering for Core invariants.*

## § 9. References

- Sheng Zhang, Birgitta Böckeler, Bryan Oakley et al., *"Structured Prompt-Driven Development"*, [martinfowler.com/articles/structured-prompt-driven](https://martinfowler.com/articles/structured-prompt-driven/).
- [openspdd](https://github.com/gszhangwei/open-spdd) — Go CLI reference implementation; Canvas templates ship as Markdown into `.claude/commands/` and similar harness-specific directories.
- This repo: [CLAUDE.md](../../CLAUDE.md) (workflow + rule provenance), [.claude/agents/](../../.claude/agents/) (sub-agent specs), [docs/learning/harness-engineering.md](harness-engineering.md) (parent curriculum doc).
