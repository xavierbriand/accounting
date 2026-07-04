import { describe, it, expect } from 'vitest';
import { checkPhaseEvidence } from '../lib/phase-evidence.js';

describe('checkPhaseEvidence', () => {
  // fails if: a ticked § 10 phase-4 box with zero § 7 `| P4 |` rows does not
  // fire — guards the ddd-1/#153 regression (Phase-4 gate ticked with no
  // code-reviewer run evidenced anywhere).
  it('reports phase-evidence-missing when a ticked phase-4 box has no P4 suggestion-log row', () => {
    const body = [
      '## 7. Suggestion log',
      '',
      '| Phase | Suggestion | Resolution | Link / Reason |',
      '| --- | --- | --- | --- |',
      '| P1 | some finding | adopted | - |',
      '',
      '## 10. Merge checklist',
      '',
      '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
    ].join('\n');
    const findings = checkPhaseEvidence(body);
    expect(findings).toEqual([
      {
        kind: 'phase-evidence-missing',
        claim: '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
      },
    ]);
  });

  // fails if: a § 7 row with `| P4 |` in the Phase column is not recognized
  // as evidence — guards the claim/evidence pairing's "evidence present" leg.
  it('reports nothing when a § 7 suggestion-log row has P4 in the Phase column', () => {
    const body = [
      '## 7. Suggestion log',
      '',
      '| Phase | Suggestion | Resolution | Link / Reason |',
      '| --- | --- | --- | --- |',
      '| P4 | code-reviewer finding | fix-now | - |',
      '',
      '## 10. Merge checklist',
      '',
      '- [x] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
    ].join('\n');
    expect(checkPhaseEvidence(body)).toEqual([]);
  });

  // fails if: an unticked phase-4 box is treated as a claim — guards against
  // false positives on a PR still mid-review.
  it('reports nothing when the phase-4 box is unticked', () => {
    const body = [
      '## 7. Suggestion log',
      '',
      '| Phase | Suggestion | Resolution | Link / Reason |',
      '| --- | --- | --- | --- |',
      '',
      '## 10. Merge checklist',
      '',
      '- [ ] All phase-4 retro-checks pass (P1 + P2 + P3 against the implementation)',
    ].join('\n');
    expect(checkPhaseEvidence(body)).toEqual([]);
  });

  // fails if: § 10 lacks any phase-4 mention and the check still fires —
  // guards the "no claim → []" short-circuit.
  it('reports nothing when § 10 has no phase-4 claim at all', () => {
    const body = [
      '## 7. Suggestion log',
      '',
      '| Phase | Suggestion | Resolution | Link / Reason |',
      '| --- | --- | --- | --- |',
      '',
      '## 10. Merge checklist',
      '',
      '- [x] `lint` / `build` / `test` green on CI',
    ].join('\n');
    expect(checkPhaseEvidence(body)).toEqual([]);
  });
});
