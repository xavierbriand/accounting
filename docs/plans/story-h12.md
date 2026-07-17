# Story h12 — Evals-Lite: Disposition Rates & Spec-Version Headers (#165, health-check F6)

## Context

Implements [#165](https://github.com/xavierbriand/accounting/issues/165) — the cheap eval built
from data the loop already produces. Two deliverables: (1) a **disposition report** aggregating
the ~55 suggestion logs in `docs/plans/` into adopted/deferred/rejected/acknowledged rates (per
phase, per R-rule where finding text names one, per review leg by heuristic), committed as an
artifact so the **subtraction story (#164, next) can ground its retire/keep calls in measured
adoption rates**; (2) **`spec-version` headers** on all six agent specs — the precondition for
any future golden-fixture evals (#98 § 4a). Then *act on the data* in the same PR: demote or
delete reviewer-checklist bullets whose findings are >80% acknowledge-only, and re-land the
property-test vacuity check in the `sonnet-implementer` spec (the story-3.3 dropped action item
#165 names). Fixture-based evals (#98 § 4d) are built only if a regression class repeats after
this — the decision is documented either way.

**Lane: Reduced** — behavior-changing `harness/` code + `.claude/agents` spec edits (R26:
harness specs are Reduced, never Light). Phase 2: `sibling-overlap` only (plan-reviewer
dropped per the lane table). Phase 4: `code-reviewer` + `sibling-overlap`.
**Phase 0:** No model impact — dev-harness bounded context; the work *uses* the existing
harness-glossary term **disposition record** (ddd-2) without changing it; any genuinely new
harness vocabulary discovered at implementation is proposed as a glossary delta, not assumed
(agents propose, never rewrite — R27).

**Branch:** `story-h12`, cut from `origin/main` @ `7ce66d3` (story-4.5c squash — **Epic 4
complete**, the #164/#165/#166 gate condition satisfied).

**Sequencing:** this story **feeds #164** (subtraction) — its report is that story's evidence
base. #166 (thesis refresh) runs after #164.

### Maintenance sub-loop (§ 6.7) run 2026-07-17 pre-planning (fourth run this date)

- **Sibling work check.** 0 open PRs (#234 merged — Epic 4 complete). Tracker unchanged since
  the 4.5c scan; #164/#165/#166 are this program's own queue; no other item touches
  `harness/metrics`, suggestion-log formats, or agent-spec frontmatter.
- **Story-id uniqueness (R23).** `story-h12` (and the queued `h13`/`h14`/`E`) free on
  `origin/main`; no open PR branches.
- **Working tree clean** — after the sub-loop's own drain step: **`npm run metrics:loop` run
  per the story-h11 standing follow-up**, regenerating `docs/metrics/loop.csv` (adds the
  missing maint-26/27/28 rows; clears three standing dod-check advisories; one stale skip
  noted by the tool: maint-17 has no resolvable merge commit). Rides the prep commit.
- **Open issues.** Queue executed in this program's order (165 → 164 → 93/103 → 166).
- **`npm audit --audit-level=high`.** 0 vulnerabilities.
- **Proceed-to-planning:** yes.

## Story

> As the **loop's operator**, I want the suggestion-log verdicts the harness already records
> aggregated into per-rule, per-leg disposition rates — and the reviewer checklists pruned where
> the data says a check produces acknowledge-only noise — so that the next story can retire
> rules on evidence instead of intuition, and agent-spec changes become versioned.

## Domain model

No model impact — dev-harness bounded context (see Context). Harness-glossary terms used:
disposition record, judge, doer, gate. No product-glossary contact.

## Selected solution

**1. `harness/disposition-report/`** (new tool, harness conventions: README + focused unit
tests + one integration test — coverage-exempt per CLAUDE.md § 5):

- `parse-suggestion-log.ts` — pure: extracts suggestion-log table rows from a plan's markdown.
  Tolerant of the two live dialects (`| # | Finding | Tag | Resolution |` with `ADOPT`-family
  tags in any casing/bolding, and the older `| Phase | Suggestion | Resolution | Link/Reason |`),
  normalizes tags to `adopted | deferred | rejected | acknowledged | fix-now | no-action`
  (fix-now buckets as adopted for rate math; unparseable rows land in an `unparsed` bucket —
  **counted, never silently dropped**).
- `attribute.ts` — pure heuristics, honesty-first: phase from row prefix/section markers
  (`P4-` ids or a `**Phase-4 review` marker split the table; before = Phase 2, after = Phase 4);
  review leg from phase (Phase 2 → plan-reviewer/sibling; Phase 4 → code-reviewer/ddd-modeler);
  R-rule from `R\d+` mentions in the finding text. Anything ambiguous goes to an explicit
  `unattributed` bucket — the report's credibility is the product.
- `disposition-report.ts` — CLI entry (`npm run metrics:dispositions`): walks
  `docs/plans/*.md`, emits `docs/metrics/dispositions.md` (human report: per-tag totals,
  per-phase rates, per-R-rule acknowledge-only rates ranked, per-story table) and
  `docs/metrics/dispositions.json` (the #164 machine input). Deterministic output (sorted keys,
  no timestamps in the body) so reruns diff cleanly.

**2. Run it and commit the artifacts** — the measured baseline #164 consumes.

**3. Act on the measured rates (Opus-authored edits, rationale per edit):**
- Reviewer-checklist bullets whose associated findings are **>80% acknowledge-only across ≥5
  findings** are demoted (moved under an explicit "advisory, low signal" note) or deleted in
  `.claude/agents/plan-reviewer.md` / `code-reviewer.md` — each edit cites the measured rate.
  The #165-named candidates (R6/R8/R12 boilerplate rows) are hypotheses the data confirms or
  refutes; the criterion is pre-committed here, the specific edits follow the report.
- `sonnet-implementer.md` gains the **property-test vacuity sanity check** (assert the property
  can fail: a generator that never exercises the mutated branch is a vacuous pass — the
  recurring Phase-4 catch class from story-3.3's dropped action item) **and the #217
  push-ownership hard rule** (the implementer never pushes; the main session owns every push —
  promoted from per-prompt instruction to spec law; ride-along adopted at Phase 2, closes
  [#217](https://github.com/xavierbriand/accounting/issues/217) at DoD — same file, same
  version bump).

**4. `spec-version` headers:** every `.claude/agents/*.md` gains `spec-version: 1` frontmatter;
`harness/lib/agent-spec.ts` (the single frontmatter reader — R27; #172's precondition) parses
and exposes it; drift-scan Check F extended to require the key (missing → finding, same tier as
`role`). Any spec edit in this PR bumps that spec's version to 2 — the header is live from birth.

**5. Fixture-evals decision:** documented in the README's "What this deliberately isn't"
section — not built now; the trigger (a regression class repeating post-h12) is stated.

Alternatives set aside: full golden-fixture eval harness now (#98's own contrarian beat —
cathedral-early); per-row LLM re-judging of dispositions (expensive, unnecessary — the tags ARE
the judgments); silent-drop of unparseable rows (credibility loss; counted buckets instead);
Light lane (touches `.claude/agents` + behavior-changing harness code — Reduced by R26).

## Production-code surface (R2)

- **New** `harness/disposition-report/parse-suggestion-log.ts` —
  `parseSuggestionLog(markdown: string): SuggestionLogRow[]`;
  `SuggestionLogRow { story: string; phase: 'p2' | 'p4' | 'unattributed'; tag: NormalizedTag; rules: readonly string[]; finding: string }`;
  `NormalizedTag = 'adopted' | 'deferred' | 'rejected' | 'acknowledged' | 'unparsed'`
  (fix-now → adopted; no-action/compliance rows → acknowledged).
- **New** `harness/disposition-report/aggregate.ts` —
  `aggregate(rows): DispositionReport` (per-tag totals, per-phase, per-rule ranked
  acknowledge-only rates with n, per-story).
- **New** `harness/disposition-report/disposition-report.ts` — CLI entry; writes
  `docs/metrics/dispositions.{md,json}`; exit 1 on zero logs parsed (self-check).
- **New** `harness/disposition-report/README.md` — usage, honesty limits (heuristic
  attribution, unparsed/unattributed buckets), the fixture-evals non-decision.
- `package.json` — script `"metrics:dispositions": "tsx harness/disposition-report/disposition-report.ts"`.
- `harness/lib/agent-spec.ts` — frontmatter schema gains required `specVersion: number`
  (key `spec-version`).
- `harness/drift-scan/drift-scan.ts` — Check F requires `spec-version` (missing-spec-version
  finding).
- `.claude/agents/*.md` (all six) — `spec-version` added; specs edited in slice 5 carry
  version 2; `sonnet-implementer.md` gains the vacuity bullet; `plan-reviewer.md`/
  `code-reviewer.md` demotions per measured rates.
- **New artifacts** `docs/metrics/dispositions.md` + `dispositions.json` (committed output).
- No `src/` changes; no dependency changes; R31 n/a (no CLI product surface).

## Gherkin acceptance scenarios

*(Harness tool — pseudo-Gherkin at the tool boundary, R7-classified; the § 5 harness carve-out
applies: focused unit tests + one integration test.)*

**Scenario 1 — the report reflects the real logs.**
**Given** the repository's `docs/plans/` as-is
**When** `npm run metrics:dispositions` runs
**Then** it exits 0, writes both artifacts, reports ≥50 parsed logs, every table row lands in
exactly one tag bucket, `unparsed + unattributed` are reported as counts, and the totals in
`.md` and `.json` agree.
*fails if* a dialect goes unparsed silently or buckets don't sum. **Mechanism: integration
(real repo tree, tmp output dir asserted against committed artifacts' shape).**

**Scenario 2 — dialect coverage.**
**Given** fixture logs covering both table dialects, tag casing/bolding variants, fix-now ids,
and a malformed row
**When** the parser runs
**Then** rows normalize to the expected tags/phases/rules and the malformed row lands in
`unparsed` (never dropped).
*fails if* normalization or the honesty buckets regress. **Mechanism: in-process unit.**

**Scenario 3 — spec-version is enforced.**
**Given** an agent spec missing `spec-version`
**When** drift-scan runs
**Then** Check F reports a `missing-spec-version` finding; with all six headers present it
reports none.
*fails if* the reader or Check F ignores the key. **Mechanism: in-process unit against fixture
specs + the real `.claude/agents/` tree.**

## Slice plan

Target ~7 slices (R13/R28; derive-from-surface lesson).

1. `test/feat(h12)` — `parse-suggestion-log` (both dialects, tag normalization, honesty
   buckets; fixture-driven units).
2. `test/feat(h12)` — `attribute` heuristics (phase markers, R-rule extraction,
   unattributed bucket).
3. `test/feat(h12)` — `aggregate` + report/JSON writers (deterministic output).
4. `test/feat(h12)` — CLI entry + integration test over the real tree; run it; **commit the
   artifacts**; README rides this feat.
5. `test/feat(h12)` — `agent-spec.ts` `spec-version` + drift-scan Check F extension + all six
   headers at version 1.
6. `feat(h12)` — Opus-authored data-driven spec edits: demotions per measured rates (cited),
   vacuity bullet in sonnet-implementer; edited specs bump to version 2. *(No red half — spec
   prose edits validated by drift-scan + Check F, R20-titled if it lands empty because the data
   refutes every demotion candidate.)*
7. `refactor(h12)` — Phase-4 slot (R11 empty-with-justification if none).

Docs commits: canonical prep `chore(docs): story-h12 plan + P1/P2/P3 review` (plan +
loop.csv drain) and `chore(retro)` — envelope-exempt (R30).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Heuristic attribution over-claims precision | Explicit `unattributed`/`unparsed` counted buckets; README states limits; #164 consumes rates with n attached |
| Demotion criterion fires on thin data | ≥5-findings floor in the criterion; below-floor rules reported but not acted on |
| Log-dialect drift breaks future runs | Parser tolerant + `unparsed` surfaces breakage; exit-1 on zero logs |
| Check F change floods CI before headers land | Headers + check land in the same slice (5) |
| Committed artifacts go stale as new stories merge | README states regen expectation (each sub-loop may rerun `metrics:dispositions` alongside `metrics:loop`); staleness is visible via the per-story table's last entry |

Deferred: fixture-based golden evals (#98 § 4d — trigger documented, not built) · #164 consumes
this story's output next.

## Verification plan

- `npm run lint && npm run build && npm test` green (harness tests included).
- `npm run metrics:dispositions` idempotent: second run produces a byte-identical report.
- `npx tsx harness/drift-scan/drift-scan.ts` clean with all six headers; red when one is
  removed (manual spot-check at review).
- dod-check clean at mark-ready; the three loop-csv-stale advisories cleared by the drain.
- Manual: read `docs/metrics/dispositions.md`; sanity-check two stories' rows against their
  plans by hand.

## Suggestion log

Phase-2 review 2026-07-17: `sibling-overlap` only (Reduced lane). 0 blocking; 4 coordinate-tier.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | #98 (evals umbrella): h12 satisfies 4a + the disposition/demotion items; 4b–4d stay open | ADOPT | Annotate #98 at DoD (partial closure note; fixture-evals trigger documented in the README) |
| 2 | #172 (Check E) must build on h12's extended `agent-spec.ts` schema | ACKNOWLEDGE | Coordinate note; no active PR; h12 lands the schema first by design |
| 3 | #217 (push-ownership hard rule) targets the same `sonnet-implementer.md` h12 edits + version-bumps | ADOPT (ride-along) | Folded into slice 6; closes #217 at DoD |
| 4 | #177 (non-doer Bash sandboxing) touches the same six specs | ACKNOWLEDGE | Future-sequencing note only; no active PR |
| 5 | #97 confirmed CLOSED (rule-walk scope belongs to #164) | ACKNOWLEDGE | No action |

## DoR checklist

- [x] Phase 0 (Model): No model impact — declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): 5 findings triaged
  above (2 adopted incl. the #217 ride-along, 3 acknowledged).
- [x] Draft PR with template sections 1–6 filled:
  [#235](https://github.com/xavierbriand/accounting/pull/235).
