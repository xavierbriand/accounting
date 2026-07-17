# Retrospective — story-4.5a

Config-change detection shipped (PR #230), the first half of Epic 4's final story (4.5 split
4.5a/4.5b at Phase 1). Any change to `accounting.yaml` — however made — is now noticed at the
next ledger-opening command and recorded as a `ConfigChanged` event carrying a verbatim,
identity-keyed old→new diff; cosmetic YAML edits never emit; a parse-time tripwire (mod-97 IBAN,
Luhn card) enforces the new **PII-safe-by-construction** Configuration invariant so values can be
quoted verbatim with zero redaction machinery. `Money` canonicalizes via `Money.toString()`
(digest stable across dinero bumps), `dbPath` is excluded from the trail, `categorize` keeps its
story-D no-DB invariant, and story-3.5's read-only AC carries a deliberate, user-approved audit
exception. Full lane, 10 slices (R28), 1090 tests green. Glossary gained the full story-4.5
vocabulary (both halves) under user sign-off; 4.5b (dissolution: export bundle + wipe + receipt,
`DataExported` + `DissolutionPerformed`) reuses the same model note.

## Keep

- **Interview the why before candidate shapes.** Two discovery questions (dissolution scenario,
  config-change scope) reframed the epic text before `ddd-modeler` ran; the user's
  "manage the risk at the source" counter-proposal then deleted an entire design axis (the
  redaction allowlist) that all three candidate shapes had taken as given. The best model idea of
  the story came from the user, not the candidates — the interview is what made room for it.
- **Phase-2 plan review as the cheap fix point.** Four would-be defects died before a line of
  code: the `categorize` wiring would have broken a shipped, subprocess-tested invariant;
  naive Money serialization would have made every dinero bump fire spurious events; the migration
  sketch lacked its `PRAGMA user_version` bump (would re-run forever); `dbPath` would have leaked
  absolute paths into the append-only trail.
- **Maintenance sub-loop in parallel with modeling.** Three Dependabot merges, the Node-24 +
  commander-15 escalation (#223 — shipped by the user as maint-27 the same day), and a failed
  dev-deps group disposition all ran interleaved with Phase 0; neither track blocked the other.
- **One model note across the split** (4.3 precedent held): 4.5b starts with its domain model,
  glossary vocabulary, and invariants 6–10 already signed off.

## Change

- **Verify claimed exit paths against live behavior at Phase 1.** The plan asserted the tripwire
  "reuses the existing config-parse exit-2 path"; empirically that path has always exited 1. The
  R2 sweep enumerated files but not observed behavior — one `spawnCli` probe during planning
  would have caught it. It surfaced as a Phase-3 deviation instead and left a real drift issue
  (#231) between epics 3.5's AC and the shipped mapping.
- **Plan slices at the granularity strict TDD will actually produce.** The plan bundled "event VO
  + diff VOs" and "boundary helper + wiring" as single slices; one-red-one-green discipline split
  them, landing 11 slices against the 6–10 envelope and forcing a post-hoc consolidation (fold
  R10 coverage into its feat; drop the placeholder refactor). Plan the pairs the rhythm will
  mint, not the conceptual groupings.
- **State dod-check's literal story-id token requirement in the implementer handoff.** The
  implementer followed § 6.4 subjects faithfully but two early commits used only the `(4.5a)`
  scope token; fixing them cost a `filter-branch` history rewrite. One sentence in the handoff
  template removes the whole failure mode.

## Try

- **Mechanical branch coverage.** The 100%-core gate was verified by manual code-path audit;
  the implementer found real gaps by hand and one unreachable comparator branch remains formally
  unproven. Install `@vitest/coverage-v8` in a maintenance story (noted on #209) so the gate is
  a report, not an audit.
- No new § 8 rule minted this retro — the story's process lessons are handoff-template and
  planning-habit changes, not codifiable invariants.

## Loop metrics

plan ~240 LOC + Phase-2/4 amendments · diff 11 src files (+~600 LOC), 13 test files (+~1100 LOC)
· 10 slices (R28) within R13 6–10 after consolidation · 1090 tests green (1 pre-existing skip) ·
lint 0 errors / 102 warnings (baseline 100 + 2 advisory on the new property's guard) · agents:
ddd-modeler ×2 (Mode A, Mode B), plan-reviewer, sibling-overlap, code-reviewer,
sonnet-implementer · Phase-2: 28 findings (15 adopted, 1 deferred → #228, 1 rejected, rest
acknowledged) · Phase-4: 21 + 3 findings, **0 P1 / 0 hard violations**, 5 fix-now in one
refactor slice, rest acknowledged · issues filed: #223 (shipped same-day as maint-27), #228,
#231 · Dependabot: #219/#220/#222 merged in the sub-loop, #218 left to auto-recreate, #221
superseded by maint-27.

## Action items

| Item | Where | Status |
|---|---|---|
| Exit-code drift issue filed (config-load exits 1 vs documented 2) | #231 | Done at DoD |
| story-D ESLint-enforcement gap issue filed | #228 | Done at DoD |
| Coverage-tooling suggestion noted on the branch-coverage issue | #209 | Done at DoD |
| Plan Scenario-3/R31 exit-code wording corrected; model-note detector signature tidied | this PR (retro commit) | Done |
| status.md Next line advances to 4.5b; fragment dropped | this PR (retro commit) | Done |
| Story 4.5b (dissolution half) — next product story, model note ready | docs/domain/model-notes/story-4.5.md | Pending |
