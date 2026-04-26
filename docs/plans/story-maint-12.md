# Story maint-12 — Process refresh: CLAUDE.md compression + status.md + maintenance template + drift-detection retro item

## Context

Third story of the **Refactor epic** (Epic M-A) per the senior-engineer refactor backlog plan, focused on the *dev loop itself* rather than product code. PR #67 (story-maint-11) just merged; remaining backlog before opening Story 3.2 planning is process debt that's been accumulating in CLAUDE.md and around the retrospective workflow.

Five process-level deliverables, all rooted in the senior-engineer review's "Product dev loop" findings:

1. **CLAUDE.md compression.** File is 168 lines, dense, with retro-provenance footnotes baked into prose (every "(Story 2.2 retro action B)", "(story-maint-09 retro)", etc.). § 6.1 phase 1 alone runs ~100 lines for *one numbered phase* — 4 nested multi-paragraph rules. § 6.4 has 4 more. Move retro provenance to an appendix table; collapse multi-paragraph rules to one-liners; reconcile § 3's `valid_to` mention with the implicit-`valid_to` implementation chosen in Story 3.1. Target: ≤ 140 lines without losing any active rule.

2. **`docs/status.md` as authoritative current-position source.** § 1's "Current position" line refresh trigger has been unreliable — the line was stale before PR #64 and only got refreshed because story-maint-09 happened to touch that area. User direction: move the line to a generated/maintained file outside CLAUDE.md. § 1 becomes a one-line pointer.

3. **Drift-detection retro item.** CLAUDE.md says "On conflict between this file and a `docs/` file, `docs/` wins. The retrospective phase reconciles drift." But the retro template has no checklist item enforcing the drift scan. Story 3.1 introduced the `valid_to` discrepancy without flagging it. Add an explicit retro-template item.

4. **Maintenance-checklist template.** § 6.7 codifies the maintenance sub-loop conceptually; every maint plan re-derives the runnable steps inline. Extract `docs/templates/maintenance-sub-loop.md` and reference from § 6.7 so each new plan can copy-paste from a single source.

5. **Decision on story-maint-09 retro Try item 1** (pre-scan `program.ts` for "empty collection" anti-pattern at planning time). The companion Try item 2 (subprocess-test rule) was codified; Try-1 sits unresolved. Make the call: subsume into Try-2 (the subprocess test catches the same bug class structurally) or codify as a planning-time grep step. Recommendation: **subsume**; record the rationale.

**Maintenance sub-loop (§ 6.7) run 2026-04-26 pre-planning:**
- `git status` clean post-PR-#67 merge; main rebased to `5b26d5d`. Issues #65 + #56 auto-closed.
- Open issues: 6 deferred-suggestions ([#23](https://github.com/xavierbriand/accounting/issues/23), [#34](https://github.com/xavierbriand/accounting/issues/34), [#43](https://github.com/xavierbriand/accounting/issues/43), [#51](https://github.com/xavierbriand/accounting/issues/51), [#57](https://github.com/xavierbriand/accounting/issues/57), [#59](https://github.com/xavierbriand/accounting/issues/59)). None block this story.
- Dependabot: no open PRs.
- `npm audit`: zero vulnerabilities.
- **Proceed-to-planning.**

## Story

> As a future Opus or Sonnet planning a story, I want to load CLAUDE.md and find a scannable cheat sheet, not a 170-line audit trail of every retro decision; I want a single authoritative source for "where we are" instead of a stale line; I want a copy-paste maintenance checklist instead of re-deriving it; and I want the retro template to actively enforce the drift-detection rule it claims to enforce — so that the loop's documentation footprint stops growing faster than the loop's complexity.

No FR coverage (process refresh; zero behaviour change). Walks [CLAUDE.md § 6](CLAUDE.md), [docs/retrospectives/README.md](docs/retrospectives/README.md), the senior-engineer refactor-backlog plan ([~/.claude/plans/as-an-senior-engineer-cozy-pelican.md](.claude/plans/as-an-senior-engineer-cozy-pelican.md)).

## Selected solution

### 1. CLAUDE.md compression

**Approach:** keep the 7-section structure; compress prose; move retro footnotes to a new § 8 "Rule provenance" appendix.

**Specific changes:**

- **§ 1.** Replace 3-line "Current position" paragraph with: *"Current position: see [docs/status.md](docs/status.md). Refreshed by the retrospective phase of any story that ships an epic-level milestone or changes the 'Next' line."*
- **§ 3.** "Versioned rules (splits, buffer targets) use the Validity Window pattern (`valid_from`, `valid_to`)." → "Versioned rules (splits, buffer targets) use the Validity Window pattern (`validFrom`; `validTo` is implicit — defined by the next window's `validFrom`, last window is open-ended)."
- **§ 6.1 phase 1.** The 4-rule embedded paragraph compresses to:
  ```
  1. **Plan** (Opus): collect intent → diverge on solutions → converge on one →
     capture Gherkin → open draft PR → hand off to Sonnet. Plan file at
     `docs/plans/story-<id>.md`. *Exit:* draft PR with template sections 1–6 filled.
     Required sub-rules — see § 8 [appendix]:
     - **R1.** Plan file committed alongside the code it plans.
     - **R2.** Production-code surface section enumerates type/signature/format changes.
     - **R3.** Tool-bundle import audit when a new framework/library enters the deps.
     - **R4.** Composition-root subprocess test required when `src/cli/program.ts` is touched
       (plus the `tsx --tsconfig` plumbing detail for `cwd`-overriding subprocess tests).
  ```
- **§ 6.1 phase 4.** Same treatment — three sub-rules (P1-honesty audit, Gherkin-to-test mapping, mock-diversity check, test-mechanism honesty) compress to bulleted references into § 8.
- **§ 6.4.** Four multi-paragraph rules (green-on-landing, empty refactor, summary-over-enumeration, plan-in-slices) compress to one-liners + § 8 references.
- **§ 6.7.** Reference the new template: *"Run the [maintenance-sub-loop checklist](docs/templates/maintenance-sub-loop.md) before each plan."* Major-bump-zero-code subcase paragraph compresses to one sentence + § 8 reference.
- **§ 7 #5.** "or the `chore(docs)` / `chore(deps)` / `refactor: empty slot` / `chore(retro)` collapse of § 6.7's major-bump-with-zero-code-change subcase" — keep brief.
- **New § 8 — Rule provenance.** Single table:

  | Tag | Rule (one-line) | Originating retro |
  | --- | --- | --- |
  | R1 | Plan file alongside code | story-2.2 |
  | R2 | Production-code surface section | story-maint-10 |
  | R3 | Tool-bundle import audit | story-3.1 |
  | R4 | Composition-root subprocess test | story-maint-09 |
  | R5 | Gherkin-to-test mapping audit at Phase 4 | story-2.5 |
  | R6 | `fails if` honesty + identifies the production path | story-1.3 / story-2.2 |
  | R7 | Test-mechanism honesty (in-process vs subprocess) | story-maint-10 |
  | R8 | Mock diversity check on structured output | story-2.4 |
  | R9 | Trivial inline fix carve-out (≤5 LOC, single file, pre-specified) | story-maint-01 |
  | R10 | Green-on-landing test commits — when sibling | (general) |
  | R11 | Empty refactor commit with justification | (general) |
  | R12 | Commit subject: summary verb over enumeration | story-1.4 |
  | R13 | Plan in slices, target 6–10 commits | story-1.4 |
  | R14 | Adapter stories: coarser slices, target 5–7 | story-2.1 |
  | R15 | Major-bump-zero-code subcase collapse | story-maint-05/06 |

  Each row is two columns wide; the originating retro is a link (`[story-X.Y](docs/retrospectives/story-X.Y.md)`). The compressed prose elsewhere references rules by tag (`see R4`).

**What stays uncompressed:** the architecture rules (§ 2), the money/precision rules (§ 3 — except the `valid_to` correction), the testing tier table (§ 5), the model-tier mapping (§ 6.2), the Sonnet return format spec (§ 6.3 — already compact), and the DoD list (§ 7). These are reference material, not narrative; compression would hurt scannability.

**Estimated final size:** ~140 lines (down from 168). Most savings from § 6.1, § 6.4, § 6.7.

### 2. `docs/status.md`

New file. Authoritative source for current-position info.

```md
# Project status

Authoritative source for "where we are." [CLAUDE.md § 1](../CLAUDE.md) points here.

## Current position

- **Epic 1** — complete. Stories 1.1–1.4 (Money + Ledger + Config) shipped.
- **Epic 2** — complete. Stories 2.1–2.5 (Ingest + Tagging + Commit) shipped.
- **Epic 3** — in progress. Story 3.1 (Versioned Split Rules) shipped.
- **Refactor epic (Epic M-A)** — story-maint-01 through story-maint-12 shipped.
- **Next:** Story 3.2 planning (Predictive Transfer Engine — see [epics.md](epics.md)).

## Refresh trigger

Update this file in the same commit as the retrospective for any story that:

- ships an epic-level milestone, OR
- starts a new epic, OR
- changes the "Next" line.

## Status log

Append-only one-line summary per merged story. Newest first.

- 2026-04-26 — story-maint-12 merged. Process refresh: CLAUDE.md compressed, status.md introduced, maintenance template extracted, drift-detection retro item added.
- 2026-04-26 — story-maint-11 merged (#67). Result combinators + busy_timeout + YAML-authoritative dbPath (#65, #56).
- 2026-04-26 — story-maint-10 merged (#66). Epic-2 BDD backfill + dist-compile subprocess harness.
- 2026-04-26 — story-maint-09 merged (#64). Ingest CLI factory wiring + retire Story 2.5 prompt (#60, #61).
- 2026-04-25 — Story 3.1 merged (#53). Versioned Split Rules (validity-window foundation).
- 2026-04-25 — story-maint-08 merged (#55). dinero.js v1 → v2 (full Money rewrite).
- 2026-04-25 — story-maint-07 merged (#54). TypeScript 5.9.3 → 6.0.3.
- 2026-04-25 — story-maint-06 merged (#52). ESLint 9 → 10 migration.
- 2026-04-25 — story-maint-04 merged (#50). validateDbPath against symlink hijacking.
- 2026-04-25 — story-maint-05 merged (#48). @inquirer/prompts 5 → 8 migration.
- 2026-04-25 — story-maint-03 merged (#45). Friendly 'run migrate' hint for uninitialised DB.
- 2026-04-25 — story-maint-02 merged (#44). os.homedir() fallback in FileConfigService.
- 2026-04-24 — story-maint-01 merged (#41). tsconfig.test.json so tsc type-checks test files.
- ... (older stories enumerated to maintain the append-only log; newest at top)
```

(The status log entries can be extracted from the existing git log + retros at scaffolding time. Sonnet to enumerate.)

### 3. Drift-detection retro item

Update [docs/retrospectives/README.md](docs/retrospectives/README.md) — extend the template's "Action items" block with a checklist item:

```md
## Drift scan (mandatory)

- [ ] Did this story introduce contradictions between CLAUDE.md and any `docs/` file?
- [ ] If yes, reconciled in this PR? (Otherwise file as a same-PR fix, not a follow-up issue.)

If both answer "no", that itself is a positive signal — note it.
```

Plus a one-line note in the README's "Field guidance" section: *"Drift scan: mandatory; in the same PR if drift exists. CLAUDE.md § 8 'Rule provenance' is the canonical source for cross-doc rule placement."*

### 4. Maintenance-checklist template

New file `docs/templates/maintenance-sub-loop.md`:

```md
# Maintenance sub-loop checklist

Run before opening every new story plan ([CLAUDE.md § 6.7](../../CLAUDE.md)). Copy this list into the plan's "Maintenance sub-loop" section.

- [ ] `git status` clean; main synced (`git fetch && git pull`).
- [ ] Open issues: `gh issue list --state open --limit 50` — re-prioritise, close stale, confirm `deferred-suggestion` items still relevant.
- [ ] Open PRs: `gh pr list --state open` — Dependabot/draft state.
  - Routine bumps (patch or minor, any dep) → merge directly after CI + changelog check.
  - Major bumps of runtime deps, critical-path major bumps (`better-sqlite3`, `dinero.js`, `zod`, `commander`, `vitest`), or any breaking change → file an issue + plan as a full story.
  - Minor/patch bumps of critical-path deps → close changelog read; escalate if non-trivial.
- [ ] `npm audit --audit-level=high` — high/critical → file an issue + fix before this story.
- [ ] **Proceed-to-planning** decision recorded in the plan file's Context section.
```

CLAUDE.md § 6.7 references this file with a one-line pointer.

### 5. story-maint-09 retro Try-1 decision

The Try-1 reads: *"Pre-scan `program.ts` composition root for 'empty collection' anti-pattern when planning. The bug was `new TransactionBuilder([], ...)` — passing an empty collection to a class that requires a populated one to do meaningful work. A quick grep of `new SomeClass([], ` or `new SomeClass({}` in the composition root as part of the plan's feasibility scan would surface this class of bug before the implementation phase. Low-cost, potentially high-catch."*

**Decision: subsume into the codified Try-2** (composition-root subprocess test rule, R4). Rationale:

- R4 catches the bug class structurally (the subprocess test runs against a real fixture; an empty-collection construction surfaces immediately).
- A separate planning-time grep would be belt-and-braces with diminishing returns: the grep catches a *narrow pattern* (`new X([], …)`); R4 catches *any* wiring bug, including ones the grep would miss (factories not threaded, swapped Infra adapters, etc.).
- Without a curated list of anti-patterns, "grep the composition root for X anti-pattern" decays into "vibe-check the composition root before planning" — rule sprawl, low signal.

Document the subsumption in story-maint-09's retro file (one-line update under "Try" → "Try-1: subsumed by Try-2 / R4 per story-maint-12 retro decision."). No CLAUDE.md change needed — Try-2/R4 already covers the bug class.

## Production-code surface

**None.** Story is process/docs-only. Per CLAUDE.md § 6.7's major-bump-zero-code subcase, this is the analogue: zero behavioural change, no test-driven rhythm. Files touched are documentation only.

## Gherkin acceptance scenarios

**None.** Zero behaviour change → no Gherkin. The verification surface is:
- CLAUDE.md ≤ 140 lines without losing any active rule (visual diff + line-count check).
- `docs/status.md` exists, listed in [docs/](docs/) directory, referenced by CLAUDE.md § 1.
- `docs/templates/maintenance-sub-loop.md` exists, referenced by CLAUDE.md § 6.7.
- Retro template's "Drift scan" section present in `docs/retrospectives/README.md`.
- All cross-doc links in CLAUDE.md still resolve (`grep -r '\[.*\](docs/' CLAUDE.md` — no broken refs).

## Slice plan for Sonnet

Major-bump-zero-code-change collapse per [CLAUDE.md § 6.7](CLAUDE.md). Target **5 commits**:

1. **`chore(docs): story-maint-12 plan + P1/P2/P3 review (story-maint-12)`** — this file. (Already authored; this slice is the commit Opus does pre-handoff.)

2. **`chore(docs): consolidate CLAUDE.md — compress § 6.1 + § 6.4 + § 6.7, add § 8 rule-provenance appendix, fix § 3 valid_to (story-maint-12)`**
   - Compress § 1 (point to status.md), § 3 (valid_to reconcile), § 6.1 phase 1 + phase 4, § 6.4, § 6.7.
   - Add § 8 "Rule provenance" appendix with the 15-row table.
   - Verify all rule references resolve (`grep 'see R[0-9]' CLAUDE.md` should match each tag in § 8).
   - Verify line count ≤ 140 (`wc -l CLAUDE.md`).

3. **`chore(docs): add status.md + maintenance-sub-loop template + retro drift-scan item (story-maint-12)`**
   - New `docs/status.md` (current position + refresh trigger + status log).
   - New `docs/templates/maintenance-sub-loop.md`.
   - Update `docs/retrospectives/README.md` — add "Drift scan" section to the template + one-line guidance note.
   - Update `docs/retrospectives/story-maint-09.md` — add the Try-1 subsumption note.

4. **`refactor: empty slot — process-only PR (story-maint-12)`**
   - Per § 6.4 + § 6.7. Body documents the no-op: *"No behaviour change; § 6.7 major-bump-zero-code analogue applies. The compression in slice 2 IS the cleanup; nothing else to refactor. Slot kept aligned with the canonical rhythm."*

5. **`chore(retro): story-maint-12 retrospective`** — Keep / Change / Try.

**Why 5 commits, not 6–10.** § 6.7 explicitly carves out the zero-code-change collapse: `chore(docs): plan + chore(docs): change + refactor: empty slot + chore(retro)`. This story is two `chore(docs):` commits because the changes split cleanly into "CLAUDE.md (one file)" vs "new files + ancillary doc edits" — bundling would muddy the diff. The TDD rhythm in § 6.4 cannot apply by construction. Total 5 ≤ 10 cap.

## Risks & deferred items

- **Compression might lose a rule.** Mitigation: § 8 appendix preserves every rule by tag with retro link. Phase 4 verification: walk every rule in § 8 against pre-merge CLAUDE.md to confirm 1:1 mapping.

- **`docs/status.md` ages on its own.** Same risk the line had inside CLAUDE.md, just relocated. Partial mitigation: the file's own "Refresh trigger" section names the conditions; the new retro-template "Drift scan" item catches mismatches between status.md and reality at story-merge time. Full mitigation (auto-generation from retros) is out of scope — would need a script that parses retro files for "merged" markers and rebuilds the log. Defer to a follow-up issue if the file drifts more than once.

- **The 15-row appendix might miss a rule.** Mitigation: Sonnet greps the pre-merge CLAUDE.md for "(Story" and "(story-maint-" to enumerate all retro footnotes; cross-reference with § 8.

- **Story-maint-09 retro file gets a post-hoc edit.** This is unusual — retros are normally write-once. The Try-1 subsumption note is a one-line append (no rewriting) per CLAUDE.md § 6.4 spirit ("create new commit, don't amend"). The edit lands in slice 3 alongside the other doc changes; commit body explicitly notes "post-hoc Try-1 disposition per story-maint-12 decision."

- **`maintenance-sub-loop.md` template might drift from CLAUDE.md § 6.7.** § 6.7 references it as the canonical source; future edits to the maintenance loop should land in the template, with § 6.7 updated only if the *concept* changes (not the steps). Document this in the template's header.

- **Out of scope:**
  - **`plan-reviewer` sub-agent** — separate story (story-maint-13). User asked to prioritise, but the sub-agent has its own design surface (what passes does it run, return format, tool surface) and benefits from its own PR.
  - **Auto-generation of `docs/status.md`** — defer until manual maintenance proves to drift.
  - **PR template audit** (CLAUDE.md § 7 #6 references a 10-section template; haven't verified it matches the current Sonnet return format) — small enough to fold into a future story or do reactively.
  - **Sonnet § 1 reading-order trim** — marginal; revisit if Sonnet round-trips slow.
  - **Process-debt sweep cadence** — implicit in the loop; no need to schedule yet.

## Verification plan

1. `npm run lint && npm run build && npm test` — green (no production change; all 292 tests still pass).
2. `wc -l CLAUDE.md` — ≤ 140 lines.
3. `grep -c '^- \\*\\*R[0-9]' CLAUDE.md` — at least 15 rule provenance rows in § 8.
4. `grep 'see R[0-9]' CLAUDE.md` — every reference resolves to a § 8 tag.
5. Manual: open CLAUDE.md, confirm scannable; § 1 points to `docs/status.md`; § 6.1 phase 1 fits in ~10 lines instead of ~20.
6. Manual: open `docs/status.md`, `docs/templates/maintenance-sub-loop.md`, `docs/retrospectives/README.md` — confirm new content present and readable.
7. Manual: cross-doc link sanity — `grep -nE '\\[.*\\]\\(docs/' CLAUDE.md | head -20`; spot-check 5 links resolve.
8. Manual: confirm story-maint-09 retro has the Try-1 subsumption note appended.

## Suggestion log

Phase 2 (P1 / P2 / P3) by Opus on 2026-04-26.

| Phase | Suggestion | Resolution | Link / Reason |
| --- | --- | --- | --- |
| P1 | The compression risks losing a rule by accident. Need a verification gate. | adopted | Slice 2 verification step: grep pre-merge CLAUDE.md for retro footnotes; cross-reference with § 8 appendix. Phase 4 walks the appendix against pre-merge to confirm 1:1. |
| P1 | Story-maint-09 retro Try-1 decision needs explicit recording. | adopted | One-line append in slice 3 to story-maint-09.md: "Try-1 subsumed by Try-2 (R4) per story-maint-12 decision." No CLAUDE.md change needed. |
| P1 | The 15-row appendix is the new source of rule truth — what happens when a future story adds rule R16? Where does it land first? | adopted (clarified) | Future stories codifying a new retro rule MUST add the row to § 8 in the same PR. CLAUDE.md prose references the new tag. The drift-scan retro item catches misses. |
| P2 | Privacy: `docs/status.md` enumerates merged story IDs and PR numbers — these are public on GitHub already. | rejected | Not a privacy concern; status log mirrors public repo activity. |
| P2 | Plan-reviewer sub-agent — bundle here or split? User asked to prioritise. | adopted | Split into story-maint-13 (next story). Plan-reviewer has its own design surface (what it reviews, return format, tool surface). Bundling muddies the diff. "Prioritise" means do it next, not bundle. |
| P3 | The "valid_to is implicit" reconciliation in § 3 might mislead future readers — should the doc reference the implementation file? | adopted (lightly) | § 3 reconciliation phrasing: "(`validFrom`; `validTo` is implicit — defined by the next window's `validFrom`, last window is open-ended)" — concise without a code link. |
| P3 | Status.md status-log entries — newest first or oldest first? | adopted | Newest first (mirrors `git log` default; what the reader scans for "latest"). |
| P3 | Should the maintenance-sub-loop template include the "Open Dependabot PRs" handling rules verbatim, or reference § 6.7? | adopted | Include verbatim in the template (it's a runnable checklist; readers shouldn't have to context-switch). § 6.7 + the template will both exist; the template is the runnable form, § 6.7 is the prose explanation. |
| P3 | The retro README "Index" line currently says "_(none yet)_" — refresh? | adopted | Slice 3 also updates the retro README's index to point to the directory listing rather than enumerating stories (maintenance burden if enumerated). |

**Tally:** 6 adopted / 1 rejected / 0 deferred + 2 adopted-clarified. DoR gate met.

## DoR checklist

- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review): 9 findings (8 adopted/clarified, 1 rejected, 0 deferred).
- [ ] Draft PR with template sections 1–6 filled. **Next action.**
