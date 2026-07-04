export type WeightRatioHeavyFinding = {
  kind: 'weight-ratio-heavy';
  planLoc: number;
  shippedLoc: number;
  ratio: number;
};

export function checkWeightRatio(planLoc: number, shippedLoc: number): WeightRatioHeavyFinding | null {
  if (shippedLoc === 0) {
    return null;
  }
  const ratio = planLoc / shippedLoc;
  if (ratio <= 1.0) {
    return null;
  }
  return { kind: 'weight-ratio-heavy', planLoc, shippedLoc, ratio };
}
