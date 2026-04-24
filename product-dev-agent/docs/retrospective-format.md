# Retrospective Format

The format for the per-story retrospective written by `/product-dev-agent:retro`. The retrospective is the loop's mechanism for surfacing lessons and folding them back into the rules.

The retrospective file lives at `docs/retrospectives/story-<id>.md` in the consuming repo. The template lives at `${CLAUDE_PLUGIN_ROOT}/templates/retrospective-template.md` and is also installed by `/bootstrap` to `docs/retrospectives/_template.md`.

## Structure

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

Optional sections (use when relevant):

- **Loop metrics.** Counts: agents invoked, commits, blockers caught at Phase 4, tests added, deps added.
- **Carryovers resolved.** Did the previous story's "Try" items prove out?

## Field guidance

- **Keep** — what worked and should be repeated on the next story. Be specific about *what* worked, not vague approval.
- **Change** — something that happened this story and should be different next time. Be concrete: "the plan under-specified the migration rollback path" beats "better planning". A "Change" without a concrete next-time action is venting, not a retrospective.
- **Try** — an experiment for the *next* story only. If it proves itself, it graduates to "Keep" (and usually into CLAUDE.md / a `docs/` file). If it doesn't, it sunsets — don't carry failed experiments forward.
- **Action items** — concrete and assignable. `Where it lands` is one of: in-PR edit (which file), or an issue link. `Status` is `done`, `open`, or a link.

## The "no rule in retro alone" principle

If the retro identifies a new rule, that rule must land in CLAUDE.md, a `docs/*.md` file, a template, or — when it's generic — be filed as a follow-up against the plugin. Rules that live only in the retro file are inert: future-you reads CLAUDE.md, not retro/story-2.4.md.

`/product-dev-agent:retro` enforces this by requiring any "graduating Try" or new-rule "Change" to come with a same-PR edit to the relevant file.

## Carryover discipline

Each retro must report on the previous story's "Try" items. Three outcomes:

- **Worked.** Graduate to "Keep" + a CLAUDE.md / `docs/` rule.
- **Didn't work.** Note why; the experiment sunsets.
- **Inconclusive.** Carry forward as a "Try" again, or sunset if it's been carried twice.

This prevents the retros from becoming a graveyard of forgotten experiments.

## What the retro is *not*

- Not a place for venting without action items.
- Not a place to relitigate plan decisions that were ratified in Phase 2.
- Not a substitute for the suggestion log — that's for plan-time suggestions; the retro is for execution-time learnings.
- Not a rule storage location — rules go where they will be read.
