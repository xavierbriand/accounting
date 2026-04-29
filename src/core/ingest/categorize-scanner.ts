import type { AutoTagRule } from './auto-tag-rules.js';
import { isAlreadyClassified } from './auto-classify.js';

export interface UnmatchedGroup {
  readonly description: string;
  readonly count: number;
}

/**
 * Scans a flat list of descriptions for entries not already covered by
 * existingRules (or the card-settlement pattern), groups them by exact
 * string equality, filters by minCount, and returns them sorted by
 * occurrence count descending (frequency ranking, v1).
 *
 * Pure: no I/O, no Node APIs, no process.exit.
 */
export function scanForUnmatched(
  descriptions: readonly string[],
  existingRules: readonly AutoTagRule[],
  opts: { readonly minCount: number },
): readonly UnmatchedGroup[] {
  const counts = new Map<string, number>();

  for (const description of descriptions) {
    if (isAlreadyClassified(description, existingRules)) continue;
    counts.set(description, (counts.get(description) ?? 0) + 1);
  }

  const groups: UnmatchedGroup[] = [];
  for (const [description, count] of counts) {
    if (count >= opts.minCount) {
      groups.push({ description, count });
    }
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}
