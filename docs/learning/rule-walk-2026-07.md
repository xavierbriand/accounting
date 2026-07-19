# Rule-expiry walk — 2026-07-18 (story-h13, #164, health-check F1)

The first full § 8 load-bearing walk. Evidence base: [dispositions report](../metrics/dispositions.md)
(688 rows / 55 logs; rates cited with n), mechanical-enforcement inventory (file:line), and
last-real-exercise citations (leading-word-boundary grep — `FR<n>` pollution excluded).
Criteria (pre-committed in [the plan](../plans/story-h13.md)): **retire** on (a) full mechanical
absorption, (b) 100% acknowledge-only at n≥5 **and** ≥10 stories dormant, or (c) supersession;
**load-bearing** requires a concrete citation; **unverified** carries a watch condition.
Tombstones are reversible: the row stays, struck, with rationale — re-minting is un-striking
with a new retro citation.

## Verdicts

| Rule | Verdict | Evidence (rate/n · enforcement · last real exercise) |
| --- | --- | --- |
| R1 | **RETIRE** (a) | 100%/8 ack-only, demoted table-only at h12; plan-file presence is structurally guaranteed by R30's canonical prep commit (the plan IS the commit) + drift-scan Check B path-probing. The row adds nothing the machinery doesn't gate. |
| R2 | keep | 33%/21 — actively catches planning gaps (h12 R2 corrections; 4.4b/4.5b/4.5c live findings). |
| R3 | keep | 58%/12; real scope gap on ephemeral `npx` deps (h3, #132) — a rule with an open workload is load-bearing by definition. |
| R4 | keep | 50%/6; fired correctly-negative at maint-27 (no redundant test when program.ts untouched). |
| R5 | keep | 44%/9; hard half lives in dod-check's gherkin↔step gate; judgment half caught the zero-scenario carve-out gap (maint-23). |
| R6 | keep | 25%/16 — **measured and vindicated at h12** (named a noise suspect; data refuted it). |
| R7 | keep | 36%/11; real honesty near-miss caught at 4.2b. |
| R8 | keep | 50%/18 — measured and vindicated at h12. |
| R9 | keep | 100%/5 ack-only but it is a *permission*, not a check — the carve-out grants inline-fix authority that is actively used; noise already fixed by the h12 table-only demotion. |
| R10 | **RETIRE** (a+c) | 100%/6, demoted at h12; semantics fully absorbed into R28's `countSlices` (`commit-subject.ts:91` counts green-on-landing `test:` as its own slice — the tool is the rule). R28's row rewritten self-contained. |
| R11 | keep | 82%/11 but a used permission (empty refactor slots ship regularly); noise fixed by demotion. |
| R12 | keep | 62%/16 — measured and vindicated at h12. |
| R13 | keep | 54%/22 (largest n); the hard envelope token, exercised every story. |
| R14 | keep | 60%/5; mechanically live envelope variant (min5/max7 token). |
| R15 | **RETIRE** (c) | Superseded in text by R16 ("extends to any zero-behaviour-change story") and **never a live dod-check token** (`ENVELOPE_TOKEN_PATTERN` = R13\|R14\|R16 only) — three consecutive maint stories hit exactly this gap (#200). Retiring R15 *resolves #200*: the lane table now offers R16, which the tooling already understands. |
| R16 | keep | 31%/13; the live generalization that absorbs R15; mechanical (min4/max4). |
| R17 | **RETIRE** (a) | 100%/1, origin-only (maint-16); the fragmentation convention is self-sustaining — `docs/status.d/README.md` documents format + conflict protocol; the row duplicated a README. |
| R18 | keep | 100%/2 but recently *hardened* (h12/#217 push-ownership hard rule is R18's enforcement arm); load-bearing citation: 4.4b push violation. |
| R19 | **RETIRE** (a) | 80%/5; last real exercise is its own origin (maint-16). Substance fully absorbed: § 6.7 mandates the sub-loop, the template's sibling-work step is the check, the sibling-overlap agent is the mechanism, and the uniqueness half is R23. |
| R20 | **RETIRE** (b) | n=1; the mandated retitle has **never once been performed** — both citing retros (h9, maint-20) treated empty slices as acceptable-not-mandatory, contradicting the rule's own text. R11's acceptable-empty-slice framing governs; an empty `feat:` gets the same justification-body treatment. |
| R21 | keep | 80%/5; it *is* the drift-scan infrastructure (Checks A/B/D/F — and now G). Widened in place this story: markers must carry stamps. |
| R22 | **hole closed** | Never minted. Three claimants dispositioned under the new expiry rule: **h1** (over-import trap, 2026-05-11) — expired, no second-story data in 30+ stories; **h2** (delete-identifier grep audit, 2026-05-12) — expired, never re-observed; **h3** (parallel Phase 2 default, 2026-07-02) — **absorbed**: § 6.1 phase 2 prose already mandates the single-message parallel launch, practiced universally since. Tombstone row minted; the two reviewer-spec `*(hole)*` suppressions removed. |
| R23 | keep | 80%/5; actively firing with a real open gap (maint-28: branch-name grep missed a content-level collision). |
| R24 | keep | 67%/6; the Phase-0 gate, exercised every Core story (4.5 family) and converging (maint-22 first-draft-correct). |
| R25 | keep | 40%/5; live DDD leg (4.2a glossary currency; 4.5 vocabulary landings). |
| R26 | keep | 80%/5; lane selection exercised every story; the #200 friction retires with R15. |
| R27 | keep | untagged; hard-mechanical (Check F role/tools + spec-version since h12); blank-frontmatter fail-safe exercised at h12. |
| R28 | keep | n=1 but it is the **absorber** — countSlices is the envelope's semantics (subsumes R10; unifies R13/R14/R16 counting). Row rewritten self-contained post-R10-tombstone. |
| R29 | keep | 50%/2; mechanically enforced (11 eslint test-smell rules) + judgment residuals in the reviewer. |
| R30 | keep | 0%/1 always-actioned; hard-mechanical (`PREP_COMMIT_SUBJECT`); known friction (exact-phrase drift, maint-25/27/28) is an argument for the rule, not against it. |
| R31 | keep | 0%/2 always-actioned but **prose-only** — no tool, not even a reviewer-prompt line. Watch: mechanization candidate (a dod-check advisory when a PR touches `--json` emitters without touching the contract doc) at the next harness story. |
| R32 | **unverified** | Untagged, single incident (maint-26 origin, 2026-07-17). Watch condition: a second `ExitPlanMode` transport anomaly. Watch condition recorded here (no `*(pending)*` marker — R32 is a live-but-unverified rule, not an unminted claim; Check G tracks markers only). Revisit: next walk, or 2026-10-16. |

## Data-quality notes

The dispositions table carries phantom rows (`R96/R97/R98` n=1; an `R22` n=5 despite the hole)
— issue-number/`FR` pollution in the rule-extraction regex, a known h12 limitation. None of the
phantom rows influenced a verdict (each verdict above cites its own enforcement/exercise
evidence, not rates alone).

## Effect

30 rows walked → **6 tombstoned** (R1, R10, R15, R17, R19, R20), **1 hole closed** (R22 —
permanent tombstone; three claims dispositioned), **1 unverified with a stamped watch** (R32),
**22 load-bearing keeps** each with a citation. #200 resolved by R15's retirement. First
subtraction in the loop's history; the next walk is due at the next health check.
