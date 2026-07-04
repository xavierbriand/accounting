WHEN_TO_USE: Load this when the user wants to refine the GitHub backlog — "refine the
backlog", "run backlog refinement", "groom the tracker", "/refine-backlog" — or as the
maintenance sub-loop's tracker-hygiene step (CLAUDE.md § 6.7). This refines the *issue
tracker*, not a story (do not confuse with story/Gherkin refinement).

## Backlog refinement (propose → tag → execute)

The agent is **propose-only**: it never touches the tracker. It reads the live tracker
read-only and returns a Backlog refinement report. Every mutation happens HERE, in the
main session, and only after the user has tagged the proposed action. You (main session)
facilitate; the user decides.

1. **Run the refiner.** Invoke the `backlog-refiner` sub-agent (`subagent_type:
   "backlog-refiner"`). Pass it today's date so it can compute ages. (Until the new agent
   spec registers post-restart, invoke `general-purpose` with the contents of
   `.claude/agents/backlog-refiner.md` inline as the prompt — CLAUDE.md § 6.3.)

2. **Present the report.** Show the six-section Backlog refinement report, then focus the
   user on the **⑥ Proposed actions** table. Do not pre-filter or re-rank it — the agent
   does not cap findings and neither do you.

3. **User tags each proposed action** adopt / defer / reject. Use `AskUserQuestion` for
   genuine forks (e.g. "close #80 vs. retitle-and-keep"); a plain list is fine when the
   calls are obvious. Never assume a tag.

4. **Execute only the adopted rows — from here, in the main session.** For each *adopted*
   action run the matching read-write `gh` command (`gh issue close`, `gh issue edit
   --add-label`, `gh issue comment`, retitle via `gh issue edit --title`, or note a
   merge). *Deferred* → file a new tracking issue capturing the residue. *Rejected* →
   drop it. Echo back exactly what was executed, one line per mutation, so the tracker
   change is auditable.

5. **State the contract.** Remind the user that the agent proposed and never wrote; every
   change in step 4 was main-session, post-approval. Nothing the user did not tick was
   touched.
