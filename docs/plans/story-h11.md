# Story h11 — honesty gates in dod-check: placeholders, merge checklist, phase evidence, loop.csv freshness

Issue [#163](https://github.com/xavierbriand/accounting/issues/163). Implements finding **F4** (+ part of **F7**) of [docs/learning/harness-health-check-2026-07-03.md](../learning/harness-health-check-2026-07-03.md). Last of the h8–h11 pre-Epic-4 harness arc.

> **Lane: Reduced** (R26) — behavior-changing `harness/` code. Phase 0 skipped; Phase 2 = `sibling-overlap` only (plan-reviewer dropped); Phase 4 = `code-reviewer` + `sibling-overlap`; envelope R13; plan at `docs/plans/story-h11.md`.

## Context

`dod-check` (shipped h6, tiered h7) polices the **cheap-to-fake**: commit-subject strings, literal `TBD`, envelope counts. Meanwhile the **expensive claims went unverified on merged PRs** (F4):

- **#149** merged with § 10 merge checklist **entirely unticked** (DoD 11).
- **#152** shipped § 8/§ 9 as permanent `_Pending Phase 3/5_` placeholders — `pr-tbd` matches only literal `TBD`, so it slipped through (DoD 6).
- **story-ddd-1 / PR #153** ticked the Phase-4 gate with **no code-reviewer run evidenced** anywhere.
- Separately (F7), the manual `loop.csv` regen missed ddd-1's row within a day (#157 → PR #159) — no freshness signal.

This story adds four honesty gates to `dod-check` + the CLAUDE.md § 7 reference that h6 dropped. The scope header of #163 mandates **advisory-first** (h7's lesson: never ship a hard gate cold); we honor it except where the user has chosen a draft-aware landing that catches the exact #149 failure (see tier table).

No FR coverage — harness/dev-loop tooling, not product behaviour.

### Maintenance sub-loop (§ 6.7) run 2026-07-04 pre-planning
- **Sibling work:** no open PRs. Open harness issues: #163 is this story; #162 (h10b drift-scan over `.claude/`) and #164/#165/#166/#170 (post-Epic-4) are sequenced successors — none overlaps `dod-check`/`loop.csv` surface. Confirm at Phase 2 via `sibling-overlap`.
- **Story-id uniqueness (R23):** `story-h11` free across `docs/plans/`, `docs/retrospectives/`, `docs/status.d/` on `origin/main`; no open PR branch holds it.
- **Working tree:** clean; branch `story-h11` cut from `origin/main` (`e931041`) — never work on `main` (R18).
- **Open issues / PRs:** no Dependabot PRs; deferred-suggestion backlog unchanged.
- **`npm audit --audit-level=high`:** 0 vulnerabilities.
- **Proceed:** yes.

### Locked decisions (user-confirmed at planning)
- **Merge-checklist tier:** **draft-aware** (advisory in draft, hard when ready-for-review) — honors issue item 2 literally — **but** the unticked count **excludes** the two rows that are unticked by construction at CI time (`PR out of draft`, `User approval`). Without that exclusion a draft-aware-hard check would false-hard-fail every ready PR (the very "hard gate cold" regression h7 exists to prevent).
- **Scope:** keep loop.csv freshness (F7) in this story — one Reduced-lane story, not a sibling. Bundling avoids doubling plan/retro ceremony for ~15 LOC (the F2/F3 ceremony-floor concern).
- **loop-csv self-exclusion:** the current story's own plan legitimately has no `loop.csv` row yet (added post-merge by `metrics:loop`), so the freshness scan **drops the current story id** — else every PR nags about its own not-yet-generated row.

## Story

> As a dev-loop maintainer, I want `dod-check` to verify the expensive DoD claims — no dressed-up placeholders, a ticked merge checklist, evidenced Phase-4 runs, a fresh loop.csv — so the gate stops policing only the cheap-to-fake while merged PRs violate the claims that matter.

## Domain model

**No model impact** — harness tooling + process docs, no Core domain concept (R24; process/harness stories qualify by default).

## Selected solution

Four checks + two doc edits, all built on the existing `dod-check` architecture (one `DodFinding` union; `HARD_KINDS`/`isAlwaysAdvisory` classify tier; per-check `run*` fn registered in the `checks` record; `format*Lines` per group). Tiering is **emergent**: a finding is draft-aware unless it's in `HARD_KINDS` (always gates) or `isAlwaysAdvisory` returns `true` (never gates).

1. **`pr-tbd` widened** (extend `lib/todo-tbd.ts`, reuse `PrTbdFinding`, tier unchanged = draft-aware). Broaden `TBD_PLACEHOLDER_LINE` to also match a standalone `Pending…` line: `/^\s*[*_`]*(?:TBD|Pending(?:\b[^\n]*)?)[*_`]*\s*$/im`. The **full-line anchor is load-bearing** — it keeps mid-sentence "pending review" prose and § 10 rows (`- [ ] User approval TBD until ticked`) from firing. Catches #152's `_Pending Phase 3/5_`.
2. **`merge-checklist-unticked`** (NEW, in `lib/todo-tbd.ts` — reuses the § 10 heading-region extractor; refactor `extractSectionRegion(body, number)` out of `scanPrBodyTbd` and share it). Finding `{ kind: 'merge-checklist-unticked'; uncheckedCount: number }`. Counts `- [ ]` rows in § 10 **excluding** any whose text matches `/out of draft/i` or `/user approval/i`. Tier: **draft-aware** (not in `HARD_KINDS`, not in `isAlwaysAdvisory`) → advisory in draft, hard when ready. Catches #149.
3. **`phase-evidence-missing`** (NEW module `lib/phase-evidence.ts`, consumes PR body via `resolvePrBody`). Finding `{ kind: 'phase-evidence-missing'; claim: string }`. **Trigger:** a *ticked* § 10 box mentioning phase-4 (`/^\s*[-*] \[[xX]\].*\bphase[- ]?4\b/im`). **Evidence:** ≥1 § 7 suggestion-log row with `P4` in the Phase column (`/^\s*\|\s*P4\b/im` scoped to the § 7 region). Fires iff claim present AND zero P4 rows. Tier: **always-advisory** (add branch to `isAlwaysAdvisory`) — newest check, highest false-positive risk. Catches ddd-1.
4. **`loop-csv-stale`** (NEW module `lib/loop-freshness.ts` — pure `checkLoopFreshness(planStoryIds, csvStoryIds, currentStoryId)`; I/O in a `runLoopFreshnessCheck` wrapper). Finding `{ kind: 'loop-csv-stale'; storyId: string }` per plan id absent from `docs/metrics/loop.csv` column 1, **excluding the current story id**. Register `'loop-freshness'` in the `checks` record + `--check loop-freshness`. Tier: **always-advisory** (issue: "CI advisory").
5. **Doc edits (same PR, DoD 10):** CLAUDE.md § 7 gains a lead sentence tying DoD items 4/5/6/7/11 to `harness/dod-check` (the F4 quick-fix + h6's dropped Try item). `harness/dod-check/README.md` updates the check count, checks list, `--check` invocations, and the **Enforcement model** table with the three new finding kinds.

*Alternatives set aside:* separate module for merge-checklist (rejected — duplicates the § 10 parser already in `todo-tbd.ts`); prose grep for phase-4 evidence (rejected — ddd-1's body likely mentioned "Phase 4" in prose, giving it a free pass; a structured `P4` row is what "evidenced run" means); accept loop-csv self-noise (rejected — self-exclusion is cheap via `resolveStoryId`); split F7 to a sibling (rejected by user — ceremony cost).

## Production-code surface (R2)

- **New finding kinds** in the `DodFinding` union (`dod-check.ts`): `merge-checklist-unticked`, `phase-evidence-missing`, `loop-csv-stale`.
- **`isAlwaysAdvisory`** gains branches for `phase-evidence-missing` and `loop-csv-stale` (both `true`). `merge-checklist-unticked` deliberately added to **neither** `HARD_KINDS` nor `isAlwaysAdvisory` → draft-aware.
- **`todo-tbd.ts`**: `TBD_PLACEHOLDER_LINE` regex widened; new exported `extractSectionRegion` + `scanMergeChecklist`; new `MergeChecklistFinding` type.
- **New modules**: `lib/phase-evidence.ts` (`PhaseEvidenceFinding`, `checkPhaseEvidence`), `lib/loop-freshness.ts` (`LoopFreshnessFinding`, `checkLoopFreshness`).
- **`checks` record** gains `'loop-freshness'`; `merge-checklist`/`phase-evidence` run alongside `pr-tbd` inside the existing `todo-tbd` key (or a new key — decide at implement; simplest is to fold merge-checklist into `todo-tbd` and phase-evidence into its own key). New `format*Lines` group(s) for the new kinds. `--json` output surface gains the 3 kinds.
- **Output format**: new human-report lines; `--check loop-freshness` selector.
- Docs: CLAUDE.md § 7, `harness/dod-check/README.md`.

## Acceptance scenarios (harness — vitest unit + subprocess integration, no `.feature` file)

> Harness stories carry no `tests/features/*.feature`; scenarios below map to vitest tests. **Deliberately not in a ` ```gherkin ` fence** — `dod-check`'s own gherkin-map check hard-flags plan scenarios absent from feature files, so fencing these would make the tool fail itself.

1. **Pending placeholder caught** — *Given* a PR body with a standalone `_Pending Phase 3/5_` line in § 8, *When* `pr-tbd` runs, *Then* a `pr-tbd` finding fires for § 8. `fails if:` the widened `TBD_PLACEHOLDER_LINE` regex misses the Pending variant (`lib/todo-tbd.ts`). *(unit + subprocess via `DOD_PR_BODY_FILE`)*
2. **Mid-sentence "pending" ignored** — *Given* a § 4 line "The design is pending review.", *When* `pr-tbd` runs, *Then* no finding. `fails if:` the full-line anchor is dropped and prose is caught. *(unit)*
3. **Unticked § 10 caught, draft-aware** — *Given* a ready-for-review PR (`DOD_PR_DRAFT=false`) whose § 10 has unticked substantive rows, *When* dod-check runs, *Then* `merge-checklist-unticked` fires and **exit code is 1**; in draft the same body exits 0 with an `(advisory — PR is draft)` suffix. `fails if:` the check isn't draft-aware, or exclusion drops substantive rows. *(subprocess)*
4. **§ 10 with only human/CI rows unticked passes when ready** — *Given* a ready PR whose § 10 has every row ticked **except** `PR out of draft` and `User approval`, *When* dod-check runs, *Then* no `merge-checklist-unticked` finding (exit 0). `fails if:` the exclusion of the two construction-unticked rows breaks. *(unit + subprocess)*
5. **Phase-4 claim without evidence caught (advisory)** — *Given* a body with a ticked § 10 phase-4 box and zero `| P4 |` § 7 rows, *When* dod-check runs, *Then* `phase-evidence-missing` fires, **exit 0** (always-advisory) with `(advisory)` suffix. A second body with a `| P4 |` row → no finding. `fails if:` the claim/evidence pairing inverts, or it gates. *(unit + subprocess)*
6. **Stale loop.csv caught (advisory), current story excluded** — *Given* a repo with `docs/plans/story-xx.md` and a `loop.csv` lacking that row, *When* dod-check runs on a different current story, *Then* `loop-csv-stale{storyId:'xx'}` fires, exit 0; the current story's own missing row is **not** flagged. `fails if:` the set-difference inverts or self-exclusion breaks. *(unit + subprocess)*
7. **`--json` covers every new kind (R8)** — *Given* a fixture producing all three new findings, *When* `--json` runs, *Then* the emitted shapes match the union exactly. `fails if:` a new kind is missing from `--json` or a field deviates. *(subprocess; extends the existing every-kind fixture)*

## Slice plan (R13, target 6–10; 6 behaviour slices)

1. `chore(docs): story-h11 plan + P1/P2/P3 review` — prep (excluded from envelope count).
2. `feat(dod-check): pr-tbd catches Pending/placeholder variants — story-h11` — widen regex; scenarios 1–2.
3. `feat(dod-check): merge-checklist-unticked draft-aware check — story-h11` — refactor `extractSectionRegion`, new check + exclusion; scenarios 3–4.
4. `feat(dod-check): phase-evidence-missing advisory check — story-h11` — new `phase-evidence.ts`, `isAlwaysAdvisory` branch; scenario 5.
5. `feat(dod-check): loop-csv-stale advisory freshness check — story-h11` — new `loop-freshness.ts`, self-exclusion, register `--check`; scenario 6.
6. `test(dod-check): --json covers new honesty-gate kinds — story-h11` — extend every-kind fixture + README Enforcement-model table / checks list / `--check` list; scenario 7.
7. `docs(dod-check): CLAUDE.md § 7 references dod-check — story-h11` — DoD 10 doc edit.
8. `chore(retro): story-h11 Keep/Change/Try` — retro (excluded from count).

Behaviour-slice count (slices 2–7) = **6**, inside R13's 6–10.

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| `pr-tbd` "Pending" false positives ("Pending" is common English) | Full-line anchor — only a line *starting* with the placeholder fires; unit test asserts mid-sentence "pending" is ignored; draft-aware cushions residue. |
| `merge-checklist` false-hard-fail on ready PRs (`PR out of draft` / `User approval` unticked by construction) | Text-match exclusion of those two rows from the count; scenario 4 guards it; case-insensitive substring match documented in README. |
| Template wording drift breaks the exclusion / phase-4 anchor | Match on distinctive substrings, not exact lines; README notes the coupling; any drift surfaces as advisory noise, never a silent pass. |
| `phase-evidence` fires on a legit R9-carve-out story with no P4 findings | Always-advisory → never blocks; deferred: a future promotion story may accept an explicit `P4: none — carve-out` sentinel row as evidence (file issue at Phase 2 if reviewers want it tracked). |
| PR body / loop.csv unavailable (degraded mode) | All PR-body checks route through `resolvePrBody`; loop-freshness guards the csv read — each pushes a `degraded:` line and returns `[]`, never crashes (matches existing contract). |
| `dod-check` running against its own plan (gherkin-map, envelope) | Scenarios kept out of a ` ```gherkin ` fence; envelope R13 declared in this § Slice plan heading; self-check dogfooded before mark-ready. |

## Verification plan

- `npm run lint && npm run build && npm test` green (new unit + integration tests included).
- `npx tsx harness/dod-check/dod-check.ts --json` on a crafted `DOD_PR_BODY_FILE` fixture emits the three new kinds with correct shapes.
- `npx tsx harness/dod-check/dod-check.ts --check loop-freshness` reports stale plans, excludes the current story, exits 0.
- Dogfood on this PR: with § 10 unticked in draft → advisory suffix, exit 0; simulate `DOD_PR_DRAFT=false` → `merge-checklist-unticked` gates (exit 1) until § 10's substantive rows are ticked. phase-evidence/loop-csv findings never change the exit code.
- CI `Run DoD checks` step passes (draft), and the enforcement is visible when the PR is marked ready.

## Suggestion log

<!-- Filled at Phase 2: sibling-overlap (Reduced lane drops plan-reviewer). Every row tagged ADOPT / DEFER (issue) / REJECT / ACKNOWLEDGE. -->

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | **sibling-overlap:** no scope overlap — zero open PRs; every candidate issue (#162 h10b drift-scan, #164/#165/#166/#170 post-Epic-4, #147 test:quiet, #172 Check E) targets a disjoint file surface (`.claude/`, `drift-scan`, `harness-engineering.md`, `package.json`) or is gated post-Epic-4. No in-flight branch can conflict on `harness/dod-check/`, `docs/metrics/loop.csv`, or CLAUDE.md § 7. | ACKNOWLEDGE | No coordination needed; proceed. |
| 2 | **sibling-overlap (aside):** #160 (story-h8 issue) is merged but still open — stale/closeable. Not an h11 overlap. | ACKNOWLEDGE | Out of scope for h11; leave for the next backlog-refiner pass. |
| 3 | **Design nuance (self-raised):** `phase-evidence-missing` false-positives on a legitimate R9-carve-out story with zero P4 findings. | ACKNOWLEDGE | Always-advisory tier means it never blocks; a `P4: none — carve-out` sentinel escape-hatch is left to a future promotion story (documented in README as a known advisory nuance). Not filed as an issue — speculative, no reviewer demand. |
| 4 | **P4 code-reviewer [R2]:** plan's Production-code-surface section left the merge-checklist/phase-evidence check-key placement as an explicit open decision; implementation folded merge-checklist into the `todo-tbd` key (`runPrBodyHonestyChecks`) and gave phase-evidence its own key. | ACKNOWLEDGE | One of the two pre-declared options — not a surface-change discovery. No action. |
| 5 | **P4 code-reviewer [R13]:** 10 behaviour commits (each of 4 feat slices split into `test:—failing` + `feat:—green` pairs) sits at the R13 outer edge (6–10). | ACKNOWLEDGE | Within envelope; dod-check's own `commit-envelope` computes 10 ≤ 10 (no over-max). Proper TDD rhythm, not bundling. |
| 6 | **P4 code-reviewer (soft):** `loop-csv-stale` immediately surfaces real F7 debt — `h9`/`h10a`/`h10b` plans lack `loop.csv` rows on `origin/main`; advisory noise will persist until regen. | ACKNOWLEDGE | Routine regen debt, not a defect deferral. In-story regen would add an 11th commit (over the R13 envelope) and can't run correctly until h11 is on `main` (siblings would compute `n/a` rows). Captured as a retro action item for the next maintenance sub-loop (`npm run metrics:loop`). The check working as designed found the debt; the envelope is why it isn't paid down here. |
| 7 | **P4 code-reviewer (soft):** `getPlanStoryIds`/`getLoopCsvStoryIds` hand-roll `readdir`/`readFile` pipelines; extract a shared `listStoryIds` helper if a 5th consumer appears. README intro prose lightly duplicates the bullet list. | ACKNOWLEDGE | Not now — 2 call sites; intro-then-detail is a normal doc shape. No fix-now. |
| 8 | **Scope divergence (coordinator-raised):** story-h8's action item pointed h11 at *both* loop.csv freshness **and** Cost-section enforcement (F7 remainder); issue #163 scoped only the freshness half. | DEFER | h11 ships the freshness half. Cost-section enforcement was never in #163's scope or the approved plan, and adding it would breach the R13 envelope. Filed as [#176](https://github.com/xavierbriand/accounting/issues/176). |

## DoR checklist

- [x] Phase 0 (Model): `No model impact` declared (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap`; Reduced lane drops plan-reviewer): findings triaged above (no overlap).
- [ ] Draft PR with template sections 1–6 filled.
