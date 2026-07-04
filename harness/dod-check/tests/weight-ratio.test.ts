import { describe, it, expect } from 'vitest';
import { checkWeightRatio } from '../lib/weight-ratio.js';

describe('checkWeightRatio', () => {
  // fails if: the ratio > 1.0 guard is inverted or dropped — a plan-heavier
  // story must emit the finding with the computed ratio (S3 Gherkin scenario).
  it('emits a weight-ratio-heavy finding when planLoc exceeds shippedLoc', () => {
    const finding = checkWeightRatio(200, 50);
    expect(finding).toEqual({
      kind: 'weight-ratio-heavy',
      planLoc: 200,
      shippedLoc: 50,
      ratio: 4,
    });
  });

  // fails if: a plan ≤ shipped diff nonetheless emits a finding — guards S4.
  it('returns null when planLoc is less than or equal to shippedLoc', () => {
    expect(checkWeightRatio(50, 200)).toBeNull();
    expect(checkWeightRatio(100, 100)).toBeNull();
  });

  // fails if: shippedLoc === 0 is treated as a valid ratio (division by
  // zero) instead of returning null — the caller handles the degraded case.
  it('returns null when shippedLoc is zero', () => {
    expect(checkWeightRatio(100, 0)).toBeNull();
  });
});
