# Story E — Same-Run Re-Application of Remembered Rules (#93 Option B, closes #103)

## Context

The literal bug fix deferred from Story D: a rule remembered mid-`ingest` never applies to later
rows of the same run — the user is re-prompted for a merchant they just taught
([#93](https://github.com/xavierbriand/accounting/issues/93) root cause: the matcher's rule list
is frozen at startup; remembered rules only round-trip via YAML into the *next* invocation).
Story D shipped Option A (`categorize` warms the YAML first); this ships **Option B** from
[#103](https://github.com/xavierbriand/accounting/issues/103): re-apply remembered rules within
the running `ingest`, contained to `runInteractiveLoop`, `TransactionBuilder` immutability
preserved. Closes #103 and (with Option A already shipped) closes #93.

**Lane: Reduced** — `src/cli` only, no Core change, no schema change. Phase 2:
`sibling-overlap` only. Phase 4: `code-reviewer` + `sibling-overlap`.
**Phase 0:** No model impact — repairs shipped behavior to match its own documented expectation
(#93 § Expected); no new domain vocabulary (auto-tag rule, category, confidence all existing).

**Branch:** `story-E`, cut from `origin/main` @ `7ce66d3`. Independent of the h12/h13 harness
track (no file contact) — runs while PR #235's merge gate pends.

### Maintenance sub-loop (§ 6.7) — delta run 2026-07-18 pre-planning

- **Sibling work check.** 1 open PR: #235 (story-h12, harness — zero file overlap with
  `src/cli/commands/ingest-command.ts` / `tests/features/ingest*`). No issue other than
  #93/#103 touches the interactive loop.
- **Story-id uniqueness (R23).** No `story-E` file on `origin/main`; branch fresh.
- **Working tree clean** · **npm audit** 0 vulnerabilities (verified this session) ·
  **metrics drains** run this session (loop.csv on h12's branch; dispositions committed there).
- **Proceed-to-planning:** yes.

## Story

> As a **User teaching categories mid-ingest**, I want a rule I just remembered to auto-tag
> every later matching row in the same run, so that I never re-answer a question I already
> answered — matching the behavior the next invocation would give me anyway.

## Domain model

No model impact — see Context.

## Selected solution

**Visit-time matching inside `runInteractiveLoop`** (equivalent to #103's "re-classify after
each remember," implemented lazily): before prompting for each pending low-confidence outcome,
test its description against the rules remembered **so far this run**
(`new RegExp(pattern, 'i')` — the exact semantics `config-schema.ts` gives the same pattern on
the next invocation). On a match: apply the same category-rewrite the manual `change` branch
performs (expense-side entry account rebuilt, confidence promoted, `Transaction.create`
re-validated with the same practically-unreachable-failure guard), emit one stderr notice
(`Auto-tagged "<description>" → <category> (rule remembered this run)`), and **skip the
prompt**. The existing rewrite block is extracted into a shared helper
(`applyCategoryChange(outcome, category): BuildOutcome | null`) so the manual branch and the
new auto branch cannot drift.

Semantics pinned: **forward-only** (rows already visited and kept are not revisited — #103 says
"remaining rows"); first-matching-rule-wins in insertion order (deterministic); a rule
remembered with a user-edited pattern that happens to match nothing simply never fires; the
remembered rule still lands in YAML at commit exactly as today (this changes prompting, not
persistence).

Alternatives set aside: eager re-scan of the whole pending list after each remember (same
outcome, more moving state); making `TransactionBuilder` mutable / rebuilding it mid-run
(violates its immutability, #103's own constraint); prompting with a "apply to N similar rows?"
confirmation (new UX surface; the next-invocation behavior is already silent, and matching it
is the bug's own definition of Expected).

## Production-code surface (R2)

- `src/cli/commands/ingest-command.ts` only:
  - **New local helper** `applyCategoryChange(outcome: BuildOutcome, category: string):
    BuildOutcome | null` — extraction of the existing `change`-branch rewrite (entries map,
    `Transaction.create` guard); `null` on the unreachable-failure path (caller keeps the
    original and warns, exactly as today).
  - `runInteractiveLoop`: visit-time check against `rememberedMap` values before each prompt;
    auto-resolved rows update `resolved[idx]` via the helper and emit the stderr notice.
  - No signature changes to `runInteractiveLoop` or any export; no `program.ts` touch (R4 n/a);
    no `--json` shape change (R31 n/a — the non-interactive path never reaches the loop).
- No Core/Infra/schema/dependency changes.

## Gherkin acceptance scenarios

**Scenario — a remembered rule auto-tags later rows in the same run.**
**Given** a project with no auto-tag rule for `MERCHANT-A` and a CSV where `MERCHANT-A` appears
on two distinct dates
**When** the user ingests interactively (scripted prompts), assigns a new category to the first
occurrence and remembers a pattern matching `MERCHANT-A`
**Then** the second occurrence is auto-tagged to that category **without a second prompt**
(script exhaustion proves no prompt was consumed), a stderr notice names the auto-tag, both
rows persist with the category's expense account, and the rule lands in `accounting.yaml` once.
*fails if* the visit-time check is missing (second prompt fires), the rewrite diverges from the
manual branch (wrong account persisted), or the notice is absent. **Mechanism: subprocess**
(scripted-prompts, real SQLite — the existing ingest.feature pattern).

*(Unit tier: helper extraction equivalence (manual branch behavior unchanged);
first-rule-wins ordering; forward-only semantics; non-matching remembered pattern never fires;
case-insensitivity matches next-invocation semantics.)*

## Slice plan

Target ~5 slices (small bug story; R13's 6–10 is a target, not a floor — noted for review).

1. `test(E)` — acceptance scenario (failing: second prompt currently consumed).
2. `refactor(E)` — extract `applyCategoryChange` from the `change` branch (green-preserving;
   existing ingest tests stay green).
3. `test/feat(E)` — visit-time matching + notice (units with scripted prompter; acceptance
   green).
4. `test(E)` — edge coverage: forward-only, first-rule-wins, non-matching pattern,
   case-insensitivity (green on landing, R10).
5. `refactor(E)` — Phase-4 slot (R11 empty-with-justification if none).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Auto-branch drifts from manual-branch rewrite semantics | Single shared helper — drift is structurally impossible |
| Regex semantics differ from next-invocation behavior | Same `new RegExp(pattern, 'i')` construction as `config-schema.ts`; case-insensitivity unit-pinned |
| Scripted-prompt tests silently tolerate an extra prompt | Script exhaustion is an error in `ScriptedPrompter` — an unexpected second prompt fails loudly |

Deferred: #103's sibling ideas (multi-file categorize #105, similarity ranker #106) untouched.

## Verification plan

- `npm run lint && npm run build && npm test` green; the new scenario green at subprocess tier.
- Manual: two-occurrence CSV, interactive run — observe one prompt, one auto-tag notice, both
  rows categorized; `accounting.yaml` gains the rule once.
- drift-scan + dod-check clean at mark-ready.

## Suggestion log

Phase-2 review 2026-07-18: `sibling-overlap` only (Reduced lane). 0 blocking; 1 coordinate.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | #117 targets the shared `fresh migrated DB` Given step this scenario reuses | ACKNOWLEDGE | Coordination note only — no active PR; whichever lands second re-checks the step |
| 2 | #215/#213/#104/#107 share `ingest-command.ts` but touch disjoint regions; #235 zero-file-overlap; no other attempt at Option B | ACKNOWLEDGE | No action |

**Phase-4 review (2026-07-18):** `code-reviewer` (13 findings, **0 blockers**) +
`sibling-overlap` re-scan (clean; #117 dormant). Fix-now (one feat slice `a034507`):
invalid-pattern crash guard in `findMatchingRememberedRule` (the reviewer proved the throw
REACHABLE — ScriptedPrompter passes patterns through unvalidated, unlike the inquirer
prompter's validate callback and config-schema's next-invocation superRefine) + unit test;
fails-if block itemizes the four edge modes + the guard (R6). CodeQL `js/regex-injection`
(high): assessed as the feature itself — user-authored regex, byte-identical construction to
config-schema's — crash edge now guarded; **dismissal decision presented to the user at the
merge gate**. Process finding accepted: the guard surfaced as an uncommitted worktree change
mid-review — retro Change item minted (hold Phase-4 edits until the review lands).
Acknowledged: `runInteractiveLoop` 83 LOC (naturally-coarse interactive router; second data
point annotated on #110), `applyCategoryChange` null-path untested (practically unreachable by
construction; shared helper preserves equivalence), makeDeps duplication (opportunistic),
feature fails-if precision nit. Slice count 4+1 fix — under R13's target, dod-check-confirmed
advisory.

## DoR checklist

- [x] Phase 0 (Model): No model impact — declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): 2 findings triaged
  above (both acknowledged).
- [x] Draft PR with template sections 1–6 filled:
  [#236](https://github.com/xavierbriand/accounting/pull/236).
