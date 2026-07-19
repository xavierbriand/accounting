# Harness glossary — the ubiquitous language of the Dev Harness

Every term the development control system speaks, defined for outsiders — not just the people (and agents) inside the loop. Entry shape mirrors the product glossary: **Everyday definition** (one plain sentence) → **Example** (concrete, from this repo) → **Technical notes** (artifact, enforcement, provenance).

User-authored; agents propose changes but never edit this file directly — the same ownership rule as [docs/domain/glossary.md](../domain/glossary.md). This is the language of the **Dev Harness** bounded context ([context map](../domain/context-map.md)); it shares no terms with the product context, and words that appear on both sides ("rule", "gate", "window") mean different things there.

Seeded 2026-07-04 (story-ddd-2) from the 2026 harness-engineering literature. Definitions are **operational** — they mean what this repo does — and citations are provenance, not pointers: if the field's vocabulary moves, ours changes by ordinary glossary delta, not by reference rot. One deliberate rename: the literature's "Doer–**Verifier**" pair becomes doer/**judge** here, because "verify" already belongs to test vocabulary and "judge" names the author≠judge separation our enforcement exists for.

---

## Harness

**Everyday definition.** Everything around the AI coding agent that makes its work reliable: the rules it reads, the helpers it delegates to, and the checks that catch what slips.

**Example.** When a story runs, the harness is what's acting besides the model: CLAUDE.md steering the session, the plan template shaping intent, sub-agents reviewing, drift-scan and CI catching divergence.

**Technical notes.** Spans `.claude/**` (sub-agents, slash commands/skills, hooks, settings), CLAUDE.md, the `docs/` canon, and `harness/` tools. The boundary is *logical*: `.claude/` placement is Claude Code's discovery contract, and the `harness/` folder holds only the domain's computational tools. *Provenance:* Böckeler, martinfowler.com (Apr 2026) — "Agent = Model + Harness"; OpenAI, *Harness engineering* (Feb–Mar 2026).

## Control

**Everyday definition.** Any mechanism that steers agent work before it happens or checks it after.

**Example.** The lane table is a control; so is drift-scan; so is the code-reviewer agent.

**Technical notes.** Classified on two axes — [guide](#guide)/[sensor](#sensor) (direction) × [computational](#computational)/[inferential](#inferential) (mechanism) — with named kinds beyond the axes: [gate](#gate), [braided control](#braided-control), [disposition record](#disposition-record), [meta-control](#meta-control), [authorization boundary](#authorization-boundary), [playbook](#playbook). Every control is registered in the [control inventory](#control-inventory). *Provenance:* Böckeler (Apr 2026).

## Guide

**Everyday definition.** A control that acts *before* the agent does — raising the odds the first attempt is right.

**Example.** CLAUDE.md § 3's money rules; the plan template's fixed sections; this glossary.

**Technical notes.** Feedforward. Guides without paired sensors are the classic failure ("you never find out whether they worked") — the inventory's Paired-counterpart column exists to expose exactly that. *Provenance:* Böckeler (Apr 2026), "guides".

## Sensor

**Everyday definition.** A control that observes *after* the agent acts and reports what diverged.

**Example.** drift-scan noticing a § 8 rule with no retro provenance; the code-reviewer returning findings on a diff.

**Technical notes.** Feedback. Sensors without guides mean agents repeat the same mistakes until caught. Sensor output is *findings*; what humans decide about findings lives in a [disposition record](#disposition-record). *Provenance:* Böckeler (Apr 2026), "sensors".

## Computational

**Everyday definition.** A control mechanism that is deterministic — same input, same verdict, in milliseconds.

**Example.** drift-scan, dod-check, ESLint, the CI pipeline.

**Technical notes.** Cheap, reliable, narrow: it checks only what can be mechanized. Anything that must *never* be violated belongs here, not in prose. *Provenance:* Böckeler (Apr 2026); Salesforce Engineering, *7 patterns* (Jun 2026) — "a prompt is a request, not a rule."

## Inferential

**Everyday definition.** A control mechanism that relies on model judgment — slower, costlier, and not guaranteed to repeat.

**Example.** plan-reviewer's P1/P2/P3 walk; ddd-modeler Mode B scanning a diff for vocabulary drift.

**Technical notes.** Covers what computation can't (intent, design, semantics) at the price of non-determinism. Pair with computational controls rather than choosing between them. *Provenance:* Böckeler (Apr 2026).

## Gate

**Everyday definition.** A sensor wired to block: work does not proceed until the check passes.

**Example.** CI's required checks; DoR before implementation; DoD before merge.

**Technical notes.** dod-check implements the distinction in code: `HARD_KINDS` vs `isAlwaysAdvisory` ([dod-check.ts](../../harness/dod-check/dod-check.ts)) is precisely "gate" vs "advisory sensor". *Provenance:* Salesforce (Jun 2026) — "a failed gate stops everything."

## Doer

**Everyday definition.** An agent that authors the artifacts under review.

**Example.** sonnet-implementer writing failing tests, then the code that turns them green.

**Technical notes.** The only [role](#roles) allowed file-mutation tools (`Write`, `Edit`, `NotebookEdit`, `MultiEdit`) — enforced by drift-scan Check F (`role-tools-violation`). *Provenance:* Anthropic, *Building effective human-agent teams* (Jun 2026) — the "Doer" of Doer–Verifier.

## Judge

**Everyday definition.** An agent that evaluates work it did not author, against a declared standard, and returns findings — never decisions.

**Example.** code-reviewer walking a story diff at Phase 4; ddd-modeler (Mode B) checking identifiers against the product glossary.

**Technical notes.** Read-only for files; keeps `Bash` for git/gh reads (a documented residual — see the inventory's gaps). Findings go to the main session and user for disposition; per CLAUDE.md § 6.2, judges "produce findings; none decide." The author≠judge separation exists because agents systematically overrate their own output. *Provenance:* Anthropic (Jun 2026), renamed from "Verifier"; Salesforce (Jun 2026) — separate the test author from the judge.

## Advisor

**Everyday definition.** An agent that proposes options or actions for a human to choose from — it gates nothing and judges nothing.

**Example.** backlog-refiner returning a tagged proposed-actions table the user then approves or strikes.

**Technical notes.** Read-only like a judge; differs by output contract (proposals, not findings-against-a-standard). The judge/advisor line is documentation-of-intent today — tool grants are identical — and gains teeth only if a sandboxing follow-up lands. No direct literature term; ours.

## Roles

**Everyday definition.** The one-word answer to "what may this agent do to the repo": doer, judge, or advisor.

**Example.** `role: judge` in code-reviewer's frontmatter.

**Technical notes.** Exactly one role per spec (`.claude/agents/*.md` frontmatter), enforced by drift-scan Check F (`missing-role`). [Playbooks](#playbook) carry no role. Orthogonal to CLAUDE.md § 6.2's model tiers: tiers say which *model* runs; roles say what the agent may *author*. ddd-modeler is judge-with-an-exception (Mode A is advisor-shaped; recorded in its description field).

## Lane

**Everyday definition.** How much supervision a story gets, chosen by what it risks — not by how big it is.

**Example.** Touching `src/core/` puts a story in the Full lane; this story (agents + harness code) rides Reduced; a docs typo rides Light.

**Technical notes.** Full/Reduced/Light, CLAUDE.md § 6 (R26). Each lane fixes Phase-0 requirement, review-agent set, commit envelope, and plan location. *Provenance:* Böckeler (Apr 2026) — supervision calibrated by mistake probability × impact × detectability.

## Envelope

**Everyday definition.** The commit budget a story plans against and is measured by.

**Example.** R13's 6–10 commits for a standard story; this story planned 9.

**Technical notes.** The house example of a [braided control](#braided-control): authored as a guide (a budget in the plan), measured as a sensor (`checkCommitEnvelope` in dod-check), and partially gating (advisory under minimum, hard at/over maximum — `isAlwaysAdvisory`). R13/R14/R16 define the shapes.

## Drift

**Everyday definition.** The gap that opens when canon and reality stop agreeing — a rule with no provenance, a plan naming files that don't exist, a spec nobody updated.

**Example.** A retro references R98 but CLAUDE.md § 8 has no such row: drift-scan exits 1.

**Technical notes.** Caught mechanically by drift-scan's checks at write time (PostToolUse hook) and in CI (R21). *Provenance:* OpenAI (Feb–Mar 2026) — doc-gardening against stale canon.

## Tripwire

**Everyday definition.** A pre-registered signal that, when it fires, forces a recorded decision — so "we'll revisit later" actually happens.

**Example.** The context map's note to reconsider splitting Annual Planning if its language diverges.

**Technical notes.** Used in the context map ("When would we split?") and by backlog-refiner (mis-armed tripwires are a refinement finding). Ours.

## Braided control

**Everyday definition.** A control that is guide and sensor at once — it steers the plan *and* measures the outcome.

**Example.** The [envelope](#envelope): a budget you write down first and a count dod-check verifies after.

**Technical notes.** Braided controls get one inventory row with both classifications and a note, not two rows — the control is one thing with two strands. Named here (full-expansion decision, story-ddd-2); no literature term.

## Disposition record

**Everyday definition.** The written record of what humans decided about what the sensors found.

**Example.** The plan's suggestion log: every reviewer finding tagged ADOPT / DEFER (with issue link) / REJECT (with reason) / ACKNOWLEDGE.

**Technical notes.** Sensors produce findings; judges never decide; this is where deciding leaves a trace. DoD item 7 gates on its completeness (no un-tagged rows). Also: Phase-4 fix-now/defer-issue/acknowledge classifications. Ours.

## Meta-control

**Everyday definition.** A control that produces other controls.

**Example.** A retrospective's Keep/Change/Try becomes a new § 8 rule — this cycle's feedback is next cycle's feedforward.

**Technical notes.** The retro file is a sensor over the finished story whose output (R-rules) instantiates as guides; drift-scan Check A then guards the linkage (rule ↔ retro provenance). Classify meta-controls by what they *are* (sensor), note what they *generate*. Ours.

## Authorization boundary

**Everyday definition.** A control that stops a disallowed action before it happens, rather than noticing it after.

**Example.** `.claude/settings.json` permissions deciding which commands run without asking; the rule that only doers get `Write`/`Edit`.

**Technical notes.** Operates at the capability layer, not the artifact layer — neither advice (guide) nor detection (sensor). The role→tools invariant (Check F) is the spec-frontmatter instance of the same idea. Ours.

## Playbook

**Everyday definition.** A written procedure a session executes step by step — instructions for the *conductor*, not a spec for a *performer*.

**Example.** `.claude/commands/new-story-preflight.md`: the checklist the main session walks before opening a story.

**Technical notes.** The `.claude/commands/*.md` files. Inferential guides that orchestrate; they have no frontmatter, grant no tools, and carry **no role** — only the completeness invariant (`unlisted-control`) applies. Ours.

## Control inventory

**Everyday definition.** The one table where every control is listed and classified — if it's not in the inventory, the harness doesn't know it has it.

**Example.** A new agent spec added without an inventory row fails drift-scan (`unlisted-control`) in the very edit that adds it.

**Technical notes.** [docs/harness/control-inventory.md](control-inventory.md) — agent-maintained (descriptive), unlike this glossary. For file-based `.claude/` controls it is an *enforced registry* (Check F); for prose/CI controls it is documentation kept honest by review. Ours.

## Tombstone *(proposed, story-h13 — user sign-off at the merge gate)*

**Everyday definition.** A retired rule's row, kept in place but struck through, carrying why and when it was retired — subtraction that preserves the record instead of erasing it.

**Example.** R15's row stays in § 8, struck, saying "superseded by R16's generalization" with a link to the walk that retired it; re-minting is un-striking with a new retro citation.

**Technical notes.** Rule cell wrapped in `~~…~~` (the `| R<n> |` grep anchor survives); drift-scan Check A exempts tombstoned rows from the retro-reference requirement; R22 is the one *permanent never-minted* tombstone. Introduced by the 2026-07 rule walk (story-h13, #164).

## Expiry stamp *(proposed, story-h13 — user sign-off at the merge gate)*

**Everyday definition.** The date-and-story tag every pending marker must carry, so a deferred decision cannot quietly live forever.

**Example.** `*(pending — story-h13, 2026-07-18)*` — after 90 days or 10 merged stories, drift-scan's Check G reports it expired, forcing codify-or-drop.

**Technical notes.** Stamped forms parsed by `extractPendingMarkers`; `pending-unstamped` / `pending-expired` are advisory-tier findings (drift-scan's first); scope is live canon only. Widened into R21 by story-h13.

## Try-funnel *(proposed, story-h13 — user sign-off at the merge gate)*

**Everyday definition.** The rule that a retrospective's Try items must land somewhere checkable — a file edited in the same PR or a filed issue — so good intentions cannot silently evaporate.

**Example.** "Install coverage tooling (noted on #209)" funnels; "worth reaching for again" does not, and dod-check surfaces it.

**Technical notes.** dod-check's advisory `try-unfunneled` finding; the "No new § 8 rule minted" close-out family is exempt. Baseline at introduction: 4 of 12 Try bullets across the five prior retros funneled. Introduced by story-h13 (#164) from the ≥14-of-25 silent-drop evidence.
