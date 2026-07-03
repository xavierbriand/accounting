function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildStoryIdRegExp(storyId: string): RegExp {
  const escaped = escapeRegExp(storyId);
  return new RegExp(
    `(?:\\[story-${escaped}\\]|\\bstory-${escaped}\\b(?!-)|\\bStory ${escaped}\\b)`,
    'i',
  );
}

export function buildStoryIdGitGrepPattern(storyId: string): string {
  const escaped = escapeRegExp(storyId);
  return `(\\[story-${escaped}\\]|(^|[^A-Za-z0-9.-])story-${escaped}([^A-Za-z0-9-]|$)|(^|[^A-Za-z0-9.-])Story ${escaped}([^A-Za-z0-9.]|$))`;
}
