# Retrospective — story-4.5b

The export act of dissolution shipped (PR #233): `accounting export [--out] [--json]` writes the
household's ledger, audit trail, and config copy into an atomically-staged, permission-tightened
directory bundle, records `DataExported` *before* the write so the bundle's own trail contains it
(invariant 8), and prints the manifest-hash export-proof that story-4.5c's wipe will demand.
Bundle fidelity (invariant 9) is pinned by round-tripping the CSVs through the project's own
`csv-parse` — including NULL `idempotency_hash` correction rows and hostile
commas/quotes/newlines fixtures. The RFC-4180 escaper is hand-rolled (no new dependency);
`sanitizeFsError` was generalized out of `YamlConfigWriter` into a shared helper; the JSON
contract gained the export envelope, a widened `WRITE_FAILURE` exit mapping, and a documented
§ Export bundle format. Full lane, 10 slices (R28), 1147 tests green.

## Keep

- **One model note across three stories.** 4.5b started with Phase 0 already signed; the only
  model work was two targeted AskUserQuestion rounds — and they caught two conflicts *inside the
  signed note's own event fields* (`manifestHash` circular with invariant 8; `archiveLocation`
  contradicting the 4.5a no-paths-in-the-trail ruling) before any code existed.
- **Phase-2 grounding against the live codebase, again.** The reviewer killed
  `idempotency-hashes.csv` (a file for a column that lives on `transactions`), caught the
  date-only clock collision, the missing `JSON_CAPABLE_COMMANDS` membership, and the plan's
  wrong exit-code attribution — four would-be defects at plan cost.
- **Stall recovery by continuation, not relaunch.** The implementer hit a transient stream stall
  at its verification step; a `SendMessage` continuation resumed it with all context intact —
  zero rework, and the report covers the whole story seamlessly (4.4b same-agent precedent
  holds for crash recovery too).
- **Anti-shim slice judgment.** The implementer moved manifest hashing forward rather than
  returning a placeholder `manifestHash` from slice 3 — the right call, disclosed as a
  deviation, ratified without churn.

## Change

- **R2 must enumerate the signatures of helpers it names in prose.** `node-timestamp-clock` was
  in the surface list but its actual shape (`timezone` parameter, `config.timezone` threading)
  was discovered mid-implementation — the second story running where the R2 section was almost
  but not quite executable.
- **Derive the slice table from the R2 surface, not from conceptual groupings.** Planned 7,
  landed 10 (timestamp-clock deserved its own listed pair; escaper/sanitizer split; R10
  addition). Second story in a row: the TDD rhythm mints one pair per new module, so the slice
  table should too.
- **Leave Phase-4 headroom inside the envelope.** Both 4.5 halves arrived at Phase 4 already at
  the R13 ceiling, forcing history surgery to fold review fixes into existing slices. Planning
  to ~8 slices for a Full-lane story leaves the refactor slot genuinely open.

## Try

- **4.5c inherits a decided surface:** verbs (`dissolve`), typed-phrase + `--confirm` UX,
  proof consumption, receipt shape — plus two notes from this story's reviews: speak
  "export-proof" (not the shortened `proof`) at the glossary register where user-facing, and
  extract shared `--out`-style path resolution only if `dissolve` actually needs it.
- No new § 8 rule minted — the lessons are planning-habit refinements, not codifiable
  invariants.

## Loop metrics

plan ~285 LOC + Phase-2/4 amendments · 20 commits / 10 slices (R28) within R13 6–10 · 1147 tests
green (1 pre-existing skip; net +48 over the 4.5a baseline) · lint 0 errors / 116 warnings
(baseline 102 + the conditional-test-logic advisory family on new tests) · agents: plan-reviewer,
sibling-overlap, sonnet-implementer (1 stall + continuation), code-reviewer, ddd-modeler Mode B ·
Phase-2: 24 findings (14 adopted, 1 adopt+defer → #232, 1 rejected, rest acknowledged) ·
Phase-4: 12 + 3 findings, **0 P1-blocker / 0 hard violations**, 7 fix-nows folded into the two
rebuilt top slices (envelope held at 10) · issues: #232 filed (restore-from-bundle), #155 closed
at DoD (FR23 umbrella fulfilled).

## Action items

| Item | Where | Status |
|---|---|---|
| Restore-from-bundle command tracked | #232 | Done at Phase 2 |
| #155 (domain-events umbrella) closed — FR23 complete via 4.1 + 4.5a | #155 | Done at DoD |
| Plan R2/slice-table corrections (timestamp-clock signature; landed-slice annotation) | this PR (retro commit) | Done |
| status.md Next line advances to 4.5c; fragment + loop.csv row dropped | this PR (retro commit) | Done |
| Story 4.5c (wipe act) — final Epic-4 story; decided surface inherited | docs/domain/model-notes/story-4.5.md § amendments | Pending |
