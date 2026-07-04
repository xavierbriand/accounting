# Control inventory — every control in the Dev Harness, classified

Agent-maintained (descriptive) — unlike [the harness glossary](glossary.md), which is user-owned.
For file-based `.claude/` controls (agent specs, command playbooks) this table is the **enforced
registry**: drift-scan Check F (`unlisted-control`) fails the scan if a `.claude/agents/*.md` or
`.claude/commands/*.md` file has no row here. For everything else — prose rules, CI steps, hooks —
this is documentation kept honest by review, not by a mechanical check.

Classifications use only [harness-glossary](glossary.md) vocabulary: Kind is
[guide](glossary.md#guide) / [sensor](glossary.md#sensor) / [gate](glossary.md#gate); Mechanism is
[computational](glossary.md#computational) / [inferential](glossary.md#inferential); Role (agents
only) is [doer](glossary.md#doer) / [judge](glossary.md#judge) / [advisor](glossary.md#advisor).
Braided controls (guide+sensor at once) get one row with both Kind values and a note, per the
glossary's [braided control](glossary.md#braided-control) entry — not two rows.

Seeded 2026-07-04 (story-ddd-2).

## CLAUDE.md § 8 rules (R1–R21, R23–R26)

Every R-tag row is a **guide** — prose steering agent behaviour before the fact. Mechanism is
**inferential** throughout: an agent reads and follows prose, there is no code executing "R12" at
runtime. Where a rule is additionally *sensed* by drift-scan or dod-check, the Paired counterpart
column names the sensor; a rule with no paired sensor is a documented gap, not an oversight (see
Gaps).

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| R1 — plan file committed alongside code | CLAUDE.md § 8 | guide | inferential | drift-scan Check B (`missing-path`, indirectly — checks the plan's *surface* paths exist, not that the plan itself is committed) | Partial pairing only |
| R2 — production-code surface section | CLAUDE.md § 8 | guide | inferential | drift-scan Check B consumes this section's contents | — |
| R3 — tool-bundle import audit on new deps | CLAUDE.md § 8 | guide | inferential | none | No sensor: relies on P3 review noticing an unjustified `package.json` diff |
| R4 — composition-root subprocess test | CLAUDE.md § 8 | guide | inferential | none | No sensor: relies on P3/code-reviewer noticing `program.ts` touched without a subprocess test |
| R5 — Gherkin-to-test mapping audit | CLAUDE.md § 8 | guide | inferential | dod-check Gherkin↔step gate | Fully paired |
| R6 — `fails if` note names the guarded path | CLAUDE.md § 8 | guide | inferential | none | No sensor: code-reviewer reads for it manually |
| R7 — in-process vs subprocess honesty | CLAUDE.md § 8 | guide | inferential | none | Same as R6 |
| R8 — mock-diversity check on structured output | CLAUDE.md § 8 | guide | inferential | none | No sensor |
| R9 — trivial inline fix carve-out | CLAUDE.md § 8 | guide | inferential | none | Bounds an Opus judgment call, not machine-checkable |
| R10 — green-on-landing `test:` acceptable when sibling condition | CLAUDE.md § 8 | guide | inferential | none | — |
| R11 — empty `refactor:` commit acceptable with justification | CLAUDE.md § 8 | guide | inferential | none | — |
| R12 — commit subject summary verb | CLAUDE.md § 8 | guide | inferential | none | — |
| R13 — 6–10 commit envelope | CLAUDE.md § 8 | guide+sensor (braided) | computational | dod-check commit-envelope gate | See [Envelope](#the-commit-envelope-braided-control) below — this row is the guide half |
| R14 — adapter-story 5–7 commit envelope | CLAUDE.md § 8 | guide+sensor (braided) | computational | dod-check commit-envelope gate | Same braided control, different declared range |
| R15 — major-bump-zero-code 4-commit collapse | CLAUDE.md § 8 | guide | inferential | none (dod-check reads the plan's declared rule, not which subcase applies) | — |
| R16 — R15 collapse extended | CLAUDE.md § 8 | guide+sensor (braided) | computational | dod-check commit-envelope gate | Third envelope shape recognized by `EnvelopeRule` |
| R17 — status log fragmentation | CLAUDE.md § 8 | guide | inferential | none | Structural convention, not enforced |
| R18 — worktree push protocol | CLAUDE.md § 8 | guide | inferential | none | Relies on session discipline; no sensor observes `git push` targets |
| R19 — sibling-overlap check before planning | CLAUDE.md § 8 | guide | inferential | `sibling-overlap` agent (judge) at Phase 2/4 | Sensed by an agent, not a computational check |
| R20 — empty `feat:` retitle rule | CLAUDE.md § 8 | guide | inferential | none | — |
| R21 — drift-scan enforces § 8 ↔ retro / plan ↔ source / `.claude/` ↔ § 8 | CLAUDE.md § 8 | guide+sensor (braided) | computational | drift-scan Checks A, B, D (this rule *is* the guide describing those sensors) | The rule and its sensors are two strands of one control |
| R23 — story-id uniqueness check | CLAUDE.md § 8 | guide | inferential | maintenance-sub-loop template checklist item | Sensed by a manual checklist item, not code |
| R24 — Phase-0 model note requirement | CLAUDE.md § 8 | guide | inferential | `ddd-modeler` Mode A (advisor-shaped) at Phase 0 | — |
| R25 — Phase-4 model-conformance review | CLAUDE.md § 8 | guide | inferential | `ddd-modeler` Mode B (judge) at Phase 4 | Fully paired |
| R26 — risk-based lanes | CLAUDE.md § 8 | guide | inferential | none | Lane selection is a plan-authoring decision; see [Lanes](#the-three-lanes) below for the lane table itself as a separate guide |

*(R22 is a numbering hole — see CLAUDE.md § 8 preamble; no row exists and none is invented here.)*

## Agents (`.claude/agents/*.md`, 6 files)

| Control | Where | Kind | Mechanism | Role | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- | --- |
| sonnet-implementer | `.claude/agents/sonnet-implementer.md` | sensor (its output — green tests — is then reviewed) | inferential | doer | code-reviewer judges its diff at Phase 4 | Only spec carrying `Write`/`Edit` |
| code-reviewer | `.claude/agents/code-reviewer.md` | sensor | inferential | judge | Opus disposes its findings fix-now/defer-issue/acknowledge | Phase 4 |
| plan-reviewer | `.claude/agents/plan-reviewer.md` | sensor | inferential | judge | Opus disposes its findings adopt/defer/reject | Phase 2, Full lane only |
| sibling-overlap | `.claude/agents/sibling-overlap.md` | sensor | inferential | judge | Opus disposes; also feeds R19 | Phase 2 + Phase 4 |
| ddd-modeler | `.claude/agents/ddd-modeler.md` | sensor (Mode B) / guide (Mode A, generates candidate shapes before the fact) | inferential | judge (Mode A is advisor-shaped — recorded in the description field, not a second role value; see model note § Rejected alternatives) | user + main-session dialogue converges Mode A; Opus disposes Mode B findings | The one spec with a mode-dependent kind |
| backlog-refiner | `.claude/agents/backlog-refiner.md` | sensor | inferential | advisor | user tags its proposed-actions table | Propose-only; never mutates the tracker |

## Commands (`.claude/commands/*.md`, 4 files) — playbooks, no role

| Control | Where | Kind | Mechanism | Role | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- | --- |
| model-session | `.claude/commands/model-session.md` | guide (playbook) | inferential | — (playbooks carry no role) | none | Orchestrates Phase 0 dialogue |
| new-story-preflight | `.claude/commands/new-story-preflight.md` | guide (playbook) | inferential | — | maintenance-sub-loop template (step 1) | — |
| refine-backlog | `.claude/commands/refine-backlog.md` | guide (playbook) | inferential | — | invokes backlog-refiner | — |
| story-status | `.claude/commands/story-status.md` | guide (playbook) | inferential | — | none | Reads `docs/status.d/` + open PRs |

## drift-scan Checks (computational sensors)

| Control | Where | Kind | Mechanism | Paired counterpart (guide) | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Check A — R-tag drift (§ 8 ↔ retro) | `harness/drift-scan/drift-scan.ts` (`runRuleCheck`) | sensor, wired as a **gate** in CI | computational | R21 | `*(pending)*` opt-out marker |
| Check B — plan ↔ source drift | `harness/drift-scan/drift-scan.ts` (`runPlanCheck`) | sensor, gate in CI | computational | R1, R2 | No opt-out marker (a missing path is never legitimate) |
| Check D — `.claude/` rule-tag drift | `harness/drift-scan/drift-scan.ts` (`runClaudeCheck`) | sensor, gate in CI | computational | R21 | `*(hole)*` opt-out marker |
| Check F — agent-spec role + control completeness | `harness/drift-scan/drift-scan.ts` (`runAgentSpecCheck`), new this story | sensor, gate in CI | computational | this table + model note invariants 1–3 | `missing-role`, `role-tools-violation`, `unlisted-control`; no opt-out marker |

*(There is no "Check C" or "Check E" in this repo yet: C is reserved for a proposed glossary-conformance check (#154), E for a proposed `model:` ↔ § 6.2 conformance check (#172) — both letters held to avoid collision, per the model note.)*

## dod-check gates (computational, draft-aware)

| Control | Where | Kind | Mechanism | Paired counterpart (guide) | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Commit subjects (story-id + envelope) | `harness/dod-check/dod-check.ts` (`runCommitSubjectCheck`) | gate (story-id: hard; envelope: braided, see below) | computational | commit convention (§ 6.4), R13/R14/R16 | — |
| TODO / TBD | `harness/dod-check/dod-check.ts` (`runTodoCheck`, `runPrTbdCheck`) | gate (hard for TODO; draft-aware for PR TBD) | computational | DoD item 4, § 7 | — |
| Gherkin↔step mapping | `harness/dod-check/dod-check.ts` (`runGherkinMapCheck`) | gate, hard | computational | R5 | — |
| Weight ratio | `harness/dod-check/dod-check.ts` (`runWeightRatioCheck`) | sensor, always-advisory (never gates) | computational | story-h8 retro (truthful weight metric) | Deliberately non-blocking |

## Hooks (`.claude/settings.json`)

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| PostToolUse → drift-scan | `.claude/settings.json` `hooks.PostToolUse[0].hooks[0]` | sensor, fires at write time (not a gate — `\|\| true` swallows a non-zero exit) | computational | Checks A/B/D/F | Matcher covers `docs/(retrospectives\|plans)/*.md`, `CLAUDE.md`, `.claude/(agents\|commands)/*.md` |
| PostToolUse → dod-check gherkin | `.claude/settings.json` `hooks.PostToolUse[0].hooks[1]` | sensor, fires at write time | computational | Gherkin↔step gate | Fires only on `tests/features/` edits |
| Stop → lint result cache | `.claude/settings.json` `hooks.Stop[0]` | sensor (writes `.claude/.last-lint-result`, does not itself gate) | computational | `npm run lint` | Session-end convenience, not enforcement |

## Authorization boundary

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Permissions allowlist | `.claude/settings.json` `permissions.allow` | authorization boundary (not guide or sensor — blocks before, not advises or observes after) | computational | none | Bash/gh command allowlist; anything outside it prompts for approval rather than silently running |

## CI (`.github/workflows/ci.yml`)

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Lint step | `.github/workflows/ci.yml` (`Run Lint`) | gate | computational | CLAUDE.md § 4 style rules | — |
| Build step | `.github/workflows/ci.yml` (`Run Build`) | gate | computational | strict TS config | — |
| Product test step | `.github/workflows/ci.yml` (`Run Tests`) | gate | computational | § 5 testing tiers | — |
| Harness test step | `.github/workflows/ci.yml` (`Run Harness Tests`) | gate | computational | § 5 harness exemption (this story's § 5 delta) | — |
| Drift-scan step | `.github/workflows/ci.yml` (`Drift scan`) | gate | computational | Checks A/B/D/F | Runs `drift-scan.ts` with no `--all` — diff-scoped |
| DoD-check step | `.github/workflows/ci.yml` (`Run DoD checks`) | gate | computational | all four dod-check gates | Passes `DOD_PR_DRAFT`/`DOD_PR_NUMBER` from the PR event |

## Lanes (R26)

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Full lane | CLAUDE.md § 6 lane table | guide | inferential | plan-reviewer + sibling-overlap (Phase 2), code-reviewer + ddd-modeler Mode B (Phase 4) | Touches `src/core/`, DB schema, migrations |
| Reduced lane | CLAUDE.md § 6 lane table | guide | inferential | sibling-overlap (Phase 2), code-reviewer + sibling-overlap (Phase 4) | Infra/CLI, behaviour-changing `harness/`, `.claude/` specs — this story's own lane |
| Light lane | CLAUDE.md § 6 lane table | guide | inferential | code-reviewer only (Phase 4) | Docs/process/harness doc-only |

## Templates

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Plan template | `docs/templates/plan-template.md` | guide | inferential | plan-reviewer / sibling-overlap check the filled plan against it | — |
| Model-note template | `docs/templates/model-note.md` | guide | inferential | ddd-modeler Mode B checks conformance at Phase 4 | — |
| Maintenance sub-loop checklist | `docs/templates/maintenance-sub-loop.md` | guide (runnable checklist form of CLAUDE.md § 6.7) | inferential (each item is human/agent-walked, not scripted) | R19, R23 | Runnable form of a prose rule — no script executes it end to end |

## The commit envelope (braided control)

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Commit envelope | Authored: CLAUDE.md § 6.6 + R13/R14/R16 rows, plan "Slice plan" heading. Measured: `harness/dod-check/lib/commit-subject.ts` (`checkCommitEnvelope`, `countChangeBodyCommits`) | guide+sensor (braided) | guide half inferential (a human/Opus writes the slice plan); sensor half computational (`checkCommitEnvelope` is deterministic) | itself — no separate pairing, this row *is* the pairing | Advisory under the declared minimum, hard once at/over the maximum and the PR is out of draft (`isAlwaysAdvisory`) — see glossary [Envelope](glossary.md#envelope) |

## Disposition record

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Suggestion log | Each plan's "Suggestion log" section + PR template § 7 | disposition record | inferential (a human/Opus writes each tag) | plan-reviewer / sibling-overlap findings feed it | DoD item 7 gates on no un-tagged rows — the gate is the DoD checklist walk, not a script |

## Meta-control

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Retrospective files | `docs/retrospectives/story-<id>.md` | meta-control (a sensor over the finished story whose output instantiates as new guides) | inferential | CLAUDE.md § 8 (new R-tag rows originate here); drift-scan Check A senses the linkage | One file per completed story |

## Guides (glossaries + context map)

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Product glossary | `docs/domain/glossary.md` | guide | inferential | ddd-modeler Mode B (Phase 4, R25) | User-owned |
| Harness glossary | `docs/harness/glossary.md` | guide | inferential | this inventory documents its terms' enforcement; no dedicated conformance check yet (see #154 proposal) | User-owned; this story's new file |
| Context map | `docs/domain/context-map.md` | guide | inferential | none | User-owned; strategic view of both bounded contexts as of this story |

## Root README

| Control | Where | Kind | Mechanism | Paired counterpart | Notes/Gap |
| --- | --- | --- | --- | --- | --- |
| Root README status section | `README.md` | guide | inferential | none | See Gaps — refresh trigger is itself a guide with no sensor |

## Gaps

Recorded here, not fixed in this story:

- **Guides with no paired sensor.** R3, R4, R6, R7, R8, R9, R10, R11, R12, R15, R17, R18, R20 (see
  their rows above) rely entirely on inferential review (P3/code-reviewer/Opus judgment) — no
  computational check observes whether the agent actually followed them. This is the expected shape
  for prose that resists mechanization (e.g. "summary verb over scenario enumeration," R12), not a
  todo list to clear; some of these may never get a sensor.
- **Sensors with no guide.** None found in this audit — every drift-scan Check and dod-check gate
  traces back to a CLAUDE.md rule or a plan-authored expectation it measures.
- **Judge-Bash residual (known, deferred to a sandboxing follow-up).** Model-note invariant 2 notes
  that `role: judge` and `role: advisor` specs keep the `Bash` tool for `git`/`gh` reads. Check F's
  `role-tools-violation` finding only flags `Write`/`Edit`/`NotebookEdit`/`MultiEdit` — a judge or
  advisor *could* in principle misuse `Bash` to mutate the repo (e.g. `git commit`, `rm`), and no
  computational control prevents that today. This is documentation-of-intent, not enforcement, until
  a sandboxing follow-up gives the judge/advisor distinction real teeth (tracked as a deferred
  follow-up, not an issue yet at authoring time).
- **Root-README staleness (guide with no sensor).** The README's "Status" section is a guide that
  goes stale the moment an epic ships without a matching README edit — nothing senses the drift (unlike
  `docs/status.md`, which R17 keeps current via per-story fragments). This story refreshes the section
  once (slice 6) but does not add a sensor; a future harness story could teach drift-scan to compare
  the README's stated epic against `docs/status.md`'s Current position line.
