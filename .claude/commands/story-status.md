Read every file in docs/status.d/ sorted by filename (newest last) and run:
  gh pr list --state open --json number,title,headRefName,isDraft --limit 30
For each story with a status fragment and/or open PR, output one line:
  `<story-id> · <branch> · <what it is doing> · PR #N (draft|open|none)`
Sort by most-recent status fragment date. If no stories are in flight, say "No stories in flight."
