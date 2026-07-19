# Story h13 — Subtraction: Rule-Expiry Walk, R22 Resolution, Try-Funnel (#164, health-check F1)

## Context

Implements [#164](https://github.com/xavierbriand/accounting/issues/164) — the health check's
root-cause finding: *the loop can add process but cannot subtract it*. Evidence at filing: 24+
rules, zero ever retired; R22 deadlocked ~2 months across three `*(pending)*` claimants;
≥14 of 25 sampled retro Try items silently dropped; the deferred-suggestion queue at zero
closures in 65 days. The gate condition (product-story evidence through the loop) is satisfied
several times over — Epic 4 shipped in full, plus h12, whose committed
[`docs/metrics/dispositions.{md,json}`](../metrics/dispositions.md) is **this story's evidence
base** (per-rule adoption/acknowledge rates with n).

**Lane: Reduced** — behavior-changing harness code (drift-scan, dod-check) + process docs
(CLAUDE.md § 8, templates). Phase 2: `sibling-overlap` only. Phase 4: `code-reviewer` +
`sibling-overlap`. **Phase 0:** No model impact — dev-harness bounded context; "tombstone",
"expiry", "Try-funnel" are proposed as harness-glossary deltas only if the walk mints them as
load-bearing vocabulary (agents propose, never rewrite — R27).

**Branch:** `story-h13`, cut from `origin/main` @ `0165e93` (story-h12 squash).

### Maintenance sub-loop (§ 6.7) — delta run 2026-07-18 pre-planning

- **Sibling work check.** 1 open PR: #236 (story-E, `src/cli` — zero overlap with this story's
  harness/docs surface). No open issue besides #164 touches § 8 mechanics, drift-scan pending
  markers, or the retro template.
- **Story-id uniqueness (R23).** `story-h13` free on `origin/main`.
- **Working tree clean** · **npm audit** 0 vulnerabilities · metrics current (h12's regen +
  dispositions on main).
- **Drain step (this story institutionalizes it — practiced here first):** #98 closed + #217
  closed + #93/#103 closing via #236 this session; queue moving again.
- **Proceed-to-planning:** yes.

## Story

> As the **loop's operator**, I want every § 8 rule to have earned its place — with measured
> evidence, a working expiry mechanism for pending claims, and a Try-item funnel that cannot
> silently drop — so that process debt is subtracted with the same rigor that added it.

## Domain model

No model impact — dev-harness bounded context (see Context).

## Selected solution

**1. The R-walk (Opus-authored, data-grounded — the story's centerpiece).** A committed walk
artifact `docs/learning/rule-walk-2026-07.md`: every live § 8 row tagged
**load-bearing / retire / unverified**, each with evidence — the dispositions per-rule rates
(n attached), mechanical-enforcement status (drift-scan/dod-check/lint coverage), and
last-exercised citations from git/retro history. Retirement criteria pre-committed:
- **Retire** when a rule is (a) fully absorbed by mechanical enforcement (the prose row adds
  nothing a tool doesn't already gate), or (b) 100% acknowledge-only at n≥5 in dispositions
  **and** its scenario has not recurred in ≥10 stories, or (c) superseded by a later rule.
- **Load-bearing** requires at least one concrete citation (a caught defect, an exercised gate).
- **Unverified** is an honest bucket, not a default — each gets a watch condition.
Retired rules get **tombstone rows** in § 8 (row retained, struck `~~R<n>~~`, one-line
retirement rationale + date + walk link) so row-anchored greps and provenance stay sound;
drift-scan's row-walk treats tombstones as non-live.

**2. R22 resolution.** The three `*(pending)*` claimants (h1/h2/h3 retros) are each
dispositioned in the walk under the new expiry rule (below): codify (mint the row now, with its
originating retro) or drop (tombstone note in the claimant retro, rationale). The § 8
`*(hole)*` marker is then replaced by either the minted R22 row or a permanent tombstone row
("R22 — never minted; claims expired") — the numbering hole closes either way, and drift-scan's
hole-workaround for R22 is removed.

**3. `*(pending)*` expiry mechanism (drift-scan **Check G**).** Every `*(pending)*` /
`*(hole)*` marker must carry a stamp: `*(pending — story-<id>, YYYY-MM-DD)*`. Check G reports
`pending-expired` when a stamped marker is older than **90 days or 10 merged stories**
(whichever first, measured against `docs/status.d/` fragment count) — forcing codify-or-drop.
Unstamped markers report `pending-unstamped`. Advisory tier at introduction (h7's lesson:
checks enter advisory-first), promotion decision recorded at the next health check.

**4. Try-funnel rule.** Retro Try items are valid in exactly two forms: a same-PR edit
(cite the file) or a filed issue (cite the number). The retro template gains the rule + a
one-line-per-Try `→ lands as:` field; dod-check gains an **advisory** `try-unfunneled` finding
(a Try bullet in the story's retro without a file citation or `#N` reference). The deferral
phrase "next process-touching PR" is retired from the template.

**5. Maintenance-sub-loop drain step.** The checklist gains: "**Drain:** close or explicitly
re-justify ≥1 deferred-suggestion/aging item this session (cite it in the plan's Context)."

Alternatives set aside: deleting retired rows outright (breaks row-anchored walks + provenance
— tombstones per #164's own scope note); a hard Check G at introduction (violates
advisory-first); auto-expiry without human disposition (subtraction needs an accountable
decision, not a cron); folding the walk into CLAUDE.md § 8 cell comments (the walk's evidence
is too long for table cells — a separate signed artifact linked from the table).

## Production-code surface (R2)

- **New** `docs/learning/rule-walk-2026-07.md` — the walk artifact (evidence per rule).
  *(Phase-4 R2 correction: the shipped `PendingMarker` discriminant is `kind: 'pending' | 'hole'`,
  not the drafted `tag?`; the `→ lands as:` retro field was descoped — `try-unfunneled` enforces
  the substance, the literal field added only ceremony.)*
- `CLAUDE.md` § 8 — tombstone rows for retirees (strikethrough + rationale + date + walk
  link); R22 hole closed (minted row or permanent tombstone); pending/hole markers gain
  stamps.
- `harness/drift-scan/lib/drift-parser.ts` — `PendingMarker { file; tag?; stampedStory?;
  stampedDate? }`, `extractPendingMarkers(content, file)`, `checkPendingExpiry(markers, {
  now, mergedStoryCount }): DriftFinding[]` (`pending-unstamped` | `pending-expired`;
  tombstoned § 8 rows excluded from the live row-walk in the existing Check A/spec-range
  logic — surgical change, enumerated at implementation).
- `harness/drift-scan/drift-scan.ts` — Check G wiring, **advisory tier** (findings printed
  with `(advisory)`, do not affect exit code — the first advisory-tier check in drift-scan;
  the mechanism mirrors dod-check's `isAlwaysAdvisory`).
- `harness/dod-check/dod-check.ts` + `lib/` — advisory `try-unfunneled` finding (scans the
  story's retro file's `## Try` section for bullets lacking a file citation or `#\d+`).
- `docs/templates/retro-template.md` *(if one exists — else the convention lands in
  CLAUDE.md § 6.1 phase 5 prose)* — Try-funnel rule + `→ lands as:` field.
- `docs/templates/maintenance-sub-loop.md` — drain step.
- No `src/` changes; no dependencies; R31 n/a.

## Gherkin acceptance scenarios

*(Harness pseudo-Gherkin; § 5 carve-out: focused units + one integration test per tool.)*

**Scenario 1 — the walk is complete and the table agrees with it.**
**Given** the committed walk artifact and the edited § 8 table
**When** drift-scan runs
**Then** every live § 8 row carries a walk verdict, every tombstone row cites the walk, no
`*(hole)*` marker remains, and drift-scan is clean (Checks A–F unaffected by tombstones).
*fails if* a tombstone breaks the row-anchored walk or a live rule lacks a verdict.
**Mechanism: integration (real tree) + manual review at the gate.**

**Scenario 2 — pending markers expire.**
**Given** fixture docs with an unstamped marker, a fresh stamped marker, and a stamped marker
older than the threshold
**When** Check G runs
**Then** it reports `pending-unstamped` and `pending-expired` for the first and third,
nothing for the second — all advisory (exit code unchanged).
*fails if* stamps don't parse, thresholds misfire, or advisory findings leak into the exit
code. **Mechanism: in-process units + the drift-scan subprocess advisory-exit test.**

**Scenario 3 — un-funneled Try items surface.**
**Given** a fixture retro whose Try section has one bullet with an issue link, one with a file
citation, and one with neither
**When** dod-check runs
**Then** exactly the third yields an advisory `try-unfunneled` finding.
*fails if* the citation forms aren't recognized or the finding goes hard. **Mechanism:
in-process units + dod-check integration fixture.**

## Slice plan

Target ~7 slices (R13/R28).

1. `feat(h13)` — **the walk + § 8 surgery** (Opus-authored, R10-style green-on-landing: docs +
   data dispositions; validated by drift-scan). Walk artifact, tombstones, R22 resolution,
   marker stamps.
2. `test/feat(h13)` — `extractPendingMarkers` + stamp parsing (units).
3. `test/feat(h13)` — `checkPendingExpiry` thresholds + advisory-tier wiring in drift-scan
   (units + subprocess advisory-exit test) + tombstone-aware row-walk adjustment.
4. `test/feat(h13)` — dod-check `try-unfunneled` (units + fixture integration).
5. `feat(h13)` — template edits (retro Try-funnel + `lands as:`; sub-loop drain step) —
   prose, validated by the new checks against fixtures.
6. `refactor(h13)` — Phase-4 slot (R11 empty-with-justification if none).

Docs commits: canonical prep + `chore(retro)` — envelope-exempt (R30).

## Risks & deferred items

| Risk | Mitigation |
| --- | --- |
| Tombstones break drift-scan's anchored row-walk or dod-check's tag greps | Scenario 1 pins clean runs; the strikethrough syntax is chosen to keep the `^\| R\d+ \|` anchor matching (tombstone marker inside the cell, not the tag) — verified at implementation |
| Retirement calls later prove wrong | Tombstones are reversible by construction (row + rationale retained; re-minting = un-striking with a new retro citation) |
| Check G false-positives on historical docs | Scope: live canon only (CLAUDE.md + .claude specs + templates), not retros/plans archives |
| Advisory findings ignored forever (the h11 lesson) | Promotion decision explicitly scheduled for the next health check; walk artifact records the date |

Deferred: promotion of Check G / `try-unfunneled` to hard tier (next health check) ·
harness-glossary deltas if vocabulary proves load-bearing (user sign-off) · #172/#177 remain
adjacent, untouched.

## Verification plan

- `npm run lint && npm run build && npm test && npm run test:harness` green.
- `npx tsx harness/drift-scan/drift-scan.ts` clean on the edited tree; Check G fixtures red
  where intended; advisory exit preserved.
- dod-check clean; `try-unfunneled` fires on its fixture, not on this story's own retro.
- Manual at the gate: the user reviews every tombstone + the R22 resolution in the walk
  artifact (the subtraction decisions are the reviewable product).

## Suggestion log

Phase-2 review 2026-07-18: `sibling-overlap` only (Reduced lane). 0 blocking; 5 coordinate.

| # | Finding | Tag | Resolution |
|---|---------|-----|------------|
| 1 | #178 is an unresolved design question on the SAME Check A row-walk the tombstone adjustment edits | ADOPT | Implementer instruction: read #178 first; keep one suppression convention; record in the PR whether h13's tombstone design resolves, defers, or is orthogonal to #178's transient |
| 2 | #172 (Check E) — same drift-scan file family, no letter collision (G free) | ACKNOWLEDGE | Proximity note; no active PR |
| 3 | #193 — marker-vocabulary consistency with the Check B *(new)* proposal | ACKNOWLEDGE | Naming glance only; stamped-marker syntax documented in R2 |
| 4 | #198/#176 — two more queued advisory findings for the same dod-check union/table | ACKNOWLEDGE | Noted in PR body as unclaimed file-adjacent backlog |
| 5 | #236 (story-E) confirmed zero-overlap (pure src/cli) | ACKNOWLEDGE | No action |

**Phase-4 review (2026-07-19):** `code-reviewer` (13 findings, **0 blockers**) +
`sibling-overlap` re-scan (clean; closing keywords added for #164/#200 on its catch). Fix-now:
walk arithmetic corrected (31 rows/24 keeps); R20's criterion recorded honestly as **(d)
mandate contradicted by unanimous practice** (outside the pre-committed a/b/c — noted in the
walk preamble); six stale retiree references annotated across sibling docs; Check G/try-funnel
registered in the control inventory; drift-scan README count fixed; Check G `--json` shape
coverage added (one R10-style test slice — the planned refactor slot's budget, justification in
the retro). Adopted: harness-glossary deltas proposed (tombstone/expiry stamp/Try-funnel —
user-gated). Acknowledged: PendingMarker `kind` vs plan's `tag` (ratified deviation family; this
correction), the dropped `→ lands as:` field (the check enforces the substance; field descoped
with rationale), slice-4 split (same class as the ratified slice-3 split), soft R12 subject
note. The #178-note finding was a race with the PR §8 fill (present since before review
completion) — story-E's hold-edits lesson re-minted in the retro.

## DoR checklist

- [x] Phase 0 (Model): No model impact — declared above (R24).
- [x] Phase 1 (Plan): complete in this document.
- [x] Phase 2 (Critical review — `sibling-overlap` only, Reduced lane): 5 findings triaged
  above (1 adopted as an implementer instruction, 4 acknowledged).
- [x] Draft PR with template sections 1–6 filled: see PR.
