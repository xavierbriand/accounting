# Retrospectives

Each completed story produces a retrospective here. Format: Keep / Change / Try. Action items either land in the same PR (as CLAUDE.md, `docs/`, or template edits) or become follow-up GitHub issues — nothing is left unresolved.

The retrospective phase of the development loop is described in [CLAUDE.md § 6.1](../../CLAUDE.md). The retro must be committed **before** the merge checklist can be ticked.

> **Legacy references.** Pre-`product-dev-agent`-plugin retrospectives (Stories 1.3 through 2.4) cite `CLAUDE.md § 6.x` and `§ 7` by section number. After accounting completes its migration to the plugin (planned for Story 3.1's retro), those references resolve to the plugin's authoritative workflow doc: `CLAUDE.md § 6.1` → `${CLAUDE_PLUGIN_ROOT}/docs/workflow.md` § "Phases"; `CLAUDE.md § 6.4` → workflow.md § "Commit convention inside a story"; `CLAUDE.md § 6.7` → workflow.md § "Maintenance sub-loop"; `CLAUDE.md § 7` → workflow.md § "Definition of Done". Frozen retro files are not rewritten; this paragraph is the single redirect.

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

## Action items

| Item | Where it lands | Status |
| --- | --- | --- |
|      |                |        |
```

### Field guidance

- **Keep** — what worked and should be repeated on the next story.
- **Change** — something that happened this story and should be different next time. Be specific: "the plan under-specified the migration rollback path" beats "better planning."
- **Try** — an experiment for the next story only. If it proves itself, it graduates to Keep (and usually into CLAUDE.md / a `docs/` file).
- **Action items** — concrete, assignable. `Where it lands` is one of: in-PR edit (which file), or an issue link. `Status` is `done`, `open`, or a link.

## Index

Updated as retrospectives land.

- _(none yet)_
