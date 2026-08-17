/**
 * Rounds up to a "clean" step (1, 2, or 5 × a power of ten) for a Y-axis
 * tick — the dataviz skill's own rule, shared by every SVG chart under
 * `_components/` rather than reimplemented per chart.
 */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10];
  const step = steps.find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}
