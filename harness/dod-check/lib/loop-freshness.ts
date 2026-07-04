export type LoopFreshnessFinding = {
  kind: 'loop-csv-stale';
  storyId: string;
};

export function checkLoopFreshness(
  planStoryIds: string[],
  csvStoryIds: string[],
  currentStoryId: string | null,
): LoopFreshnessFinding[] {
  const csvSet = new Set(csvStoryIds);
  return planStoryIds
    .filter((storyId) => !csvSet.has(storyId) && storyId !== currentStoryId)
    .map((storyId) => ({ kind: 'loop-csv-stale', storyId }));
}
