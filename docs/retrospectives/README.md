# Retrospectives

Each completed story produces a retrospective here. Format: Keep / Change / Try. Action items either land in the same PR (as CLAUDE.md, `docs/`, or template edits) or become follow-up GitHub issues — nothing is left unresolved.

The retrospective phase of the development loop is described in [CLAUDE.md § 6.1](../../CLAUDE.md). The retro must be committed **before** the merge checklist can be ticked.

## Template for a new retrospective

Copy into `story-<id>.md` (e.g. `story-1.3.md`) and fill in.

```markdown
# Story <id> retrospective

**PR:** <url>  **Closed:** YYYY-MM-DD

## Keep
-

## Change
-

## Try
-

## Drift scan (mandatory)

- [ ] Did this story introduce contradictions between [CLAUDE.md](../../CLAUDE.md) and any `docs/` file?
- [ ] If yes, reconciled in this PR? (Same-PR fix, not a follow-up issue.)

If both answer "no", note it explicitly — that itself is a positive signal.

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
|      |                |        |
```

### Field guidance

- **Keep** — what worked and should be repeated on the next story.
- **Change** — something that happened this story and should be different next time. Be specific: "the plan under-specified the migration rollback path" beats "better planning."
- **Try** — an experiment for the next story only. If it proves itself, it graduates to Keep (and usually into CLAUDE.md / a `docs/` file).
- **Drift scan** — mandatory. [CLAUDE.md § 8 "Rule provenance"](../../CLAUDE.md) is the canonical source for cross-doc rule placement; if this story changed code-behaviour or process docs, walk § 8 + the architecture/QA/engineering canon and confirm no contradictions.
- **Action items** — concrete, assignable. `Where it lands` is one of: in-PR edit (which file), or an issue link. `Status` is `done`, `open`, or a link.

## Index

See the directory listing of `docs/retrospectives/` for the canonical list — every shipped story has a `story-<id>.md` file. (Maintenance burden of an enumerated index outweighs its scanability gain; `ls docs/retrospectives/` is one command away.)
