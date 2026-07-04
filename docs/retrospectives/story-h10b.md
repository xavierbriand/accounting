# Retrospective — story-h10b (drift-scan over `.claude/`: guard the single-sourced rule system)

Plan: [docs/plans/story-h10b.md](../plans/story-h10b.md) · PR #173 · Issue #162 (F5, scope item 3, scanner half)

The **scanner half** of #162. h10a (specs half, PR #171) converted both reviewers' rule-coverage
walks to a row-driven walk over the live § 8 table and removed the frozen `R1..R15` enumeration.
Nothing prevented a future edit from re-freezing that range or citing a tag that doesn't exist —
drift-scan already guarded § 8 ↔ retro (Check A) and plan ↔ source (Check B) but deliberately
skipped `.claude/` (F5), the largest drift surface. h10b adds **Check D — `.claude/` rule-tag
drift**: always scans the full `.claude/agents/*.md` + `.claude/commands/*.md` corpus (not
diff-scoped, like Check A) for two finding kinds — `claude-range` (an enumerated rule-range
pattern, always flagged, no legitimate use) and `claude-stale-tag` (a bare `R<n>` reference not in
the live § 8 set, unless marked `*(hole)*` — mirroring Check A's `*(pending)*` mechanism). The two
"§ 8 skips the numbering-hole tag *(pending)*" mentions h10a authored are the check's first real
exercise: both marked `*(hole)*` in the specs themselves so the clean-repo scan passes without
resolving the numbering hole itself (that stays #164's job — this retro deliberately avoids
writing the bare tag id, which Check A would otherwise read as an undocumented-rule reference).

## Loop metrics

- **Lane:** Reduced (R26) — `harness/drift-scan/` is behavior-changing harness code. Phase 0
  skipped (`No model impact` declared); Phase 2 = `sibling-overlap` only; Phase 3 restored the
  real Sonnet TDD loop (h10a's Opus-only run had muddied the Sonnet/Opus tier split); Phase 4 =
  `code-reviewer` + `sibling-overlap`.
- **Commits:** prep (`chore(docs)`, not counted) + 6 body slices (2 `test:`, 3 `feat:`, 1 `chore:`)
  + 1 empty `refactor:` (R11) + this retro = 8 body commits total, inside the R13 6–10 envelope.
- **Sibling coordination (Phase 1 maintenance sub-loop):** #154 (Check C, glossary conformance)
  shares the scan-and-cross-ref mechanism but a different corpus/function — h10b took the next
  label, **Check D**, as a sibling, not a widen. #164 owns § 8 numbering-integrity/tombstone rows;
  h10b works around the hole with `*(hole)*`, forward-compatible (a future tombstone row makes the
  marker redundant, not wrong). #119 touches the same file (`drift-scan.ts`) on a disjoint concern
  (`getPlanFiles`/Check B diff-scope) — no overlap.
- **Verification:** `npx tsx harness/drift-scan/drift-scan.ts --all` exits 0 on the landed repo; a
  temp `.claude/agents/*.md` fixture with `R1..R15` exits 1 naming it under Check D; `--json`
  emits `{"kind":"claude-range","range":"R1..R15","file":".claude/agents/tmp-verify.md"}` for that
  fixture — matches the plan's manual verification plan exactly.
- **Test count:** drift-scan's suite grew from ~30 to 47 tests (unit + property + integration);
  full `npm run test:harness` (189 tests, 15 files) and `npm run lint && npm run build && npm test`
  (689 tests, 62 files) green throughout.

## Keep

- **Sibling-check labeling (Check D, not a widened Check A) held up in practice.** The plan's
  rationale — Check A is bidirectional retro↔§8, Check D is a one-directional spec scan — proved
  correct once implemented: `runClaudeCheck` shares zero control flow with `runRuleCheck` beyond
  reusing `extractSectionEightTags` for the live tag set. Keeping them as separate functions (not a
  parameterized generalization) kept both readable and let Check D's full-corpus scan coexist with
  Check A's per-retro-file scan without a shared abstraction fighting two different shapes.
- **Reusing the `*(pending)*` mechanism verbatim for `*(hole)*` (same regex shape, different
  literal) made the stale-tag suppression a near-zero-risk addition.** `extractClaudeTagRefs` is
  structurally identical to `extractRetroTags` — two functions with the same shape, differing only
  in the marker word and the tag-collection field name. The house style's precedent for
  case-insensitive, dash/underscore/paren-variant markers transferred directly; no new suppression
  design was needed, and the property test transferred almost line-for-line from
  `composeDrift`'s existing pattern to `composeClaudeDrift`.
- **The word-boundary regex risk (`R[0-9]+` false-matching as a range or stale tag) was called out
  in the plan's Risks table before implementation and verified explicitly post-green** (both via a
  dedicated unit test and a manual `node -e` check of `RANGE_PATTERN`/`extractClaudeTagRefs`
  against the exact literal from the reviewer specs). Naming the risk in the plan turned a subtle
  regex-engineering trap into a checklist item instead of a Phase-4 surprise.

## Change

- **The plan's slice table implicitly assumed the acceptance scenario for slices 1–4 would stay
  fully red until slice 5's wiring — worth stating that expectation more explicitly in future
  parser-then-wire plans.** Slices 1–4 correctly turned the *unit* tests green while the
  *subprocess* acceptance test (which exercises `main()`'s exit gate) stayed red by design; that's
  correct TDD but is easy to misread as "the slice is behind schedule" without the plan's own
  framing. h10a/h10b both hit this; a short one-line note in the slice table ("acceptance scenario
  N stays red until slice M — expected") would remove any doubt during implementation.
- **Slice 6 bundled four unrelated concerns (hole markers, PostToolUse hook regex, README, R21
  wording) into one `chore:` commit.** The plan specified this bundling explicitly (it's the
  "clean-repo-green + wiring + canon" slice), and story-maint-04's commit-bundle-separation
  guidance is about not mixing `chore:` tooling with `feat:`/`test:` story commits — this slice is
  itself entirely `chore:`-shaped canon/wiring work, so no violation occurred. Still, four
  file-groups in one commit is on the coarser end of R13's "one behaviour per slice" guidance;
  worth a data point for whether Reduced-lane "wiring + canon" slices should split further when
  they touch this many independent files.

## Try

- **Wire a coordinating note onto #154 at merge** (per the plan's Phase-1 note): "h10b landed as
  sibling Check D, not a widened Check C — no code/label conflict, #154 free to claim Check C for
  glossary conformance."
- **Reference/close #162 from the PR at merge** — both scanner (h10b) and specs (h10a) halves of
  the F5 umbrella are now shipped.
- **Consider auditing `docs/domain/model-notes/*.md` for the same `R<n>` bare-token risk** if a
  future story ever adds cross-references from model notes into § 8 — Check D's scope is
  deliberately narrow (`.claude/agents` + `.claude/commands` only) per the plan; model notes are a
  different corpus with no current rule-tag references, so out of scope today, but worth a search
  if that changes.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
| Coordinating note on #154 (Check D vs Check C, no conflict) | at merge | open |
| Reference/close #162 (F5 scanner + specs halves both shipped) | at merge | open |
| §6.2-tier-list-vs-frontmatter drift check (h10a retro Try, out of h10b scope) | [#172](https://github.com/xavierbriand/accounting/issues/172) | open |
| § 8 numbering-hole resolution / tombstone row for the hole tag (h10b works around, doesn't resolve) | [#164](https://github.com/xavierbriand/accounting/issues/164) | open |
