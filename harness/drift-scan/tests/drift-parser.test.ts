import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  extractSectionEightTags,
  extractRetroTags,
  composeDrift,
  extractPlanSurfacePaths,
  extractEnumeratedRuleRanges,
  extractClaudeTagRefs,
  composeClaudeDrift,
  formatJsonReport,
  checkAgentSpecRoles,
  checkControlCompleteness,
  extractInventoryControlPaths,
  type AgentSpecEntry,
} from '../lib/drift-parser.js';

const CLAUDE_MD_FIXTURE = `
# CLAUDE.md

Some preamble text.

## 7. Definition of Done

Not the § 8 section.

## 8. Rule provenance

New retro rules MUST add a row here in the same PR; prose references the tag. Drift scan catches misses.

| Tag | Rule (one-line) | Originating retro |
| --- | --- | --- |
| R1 | Plan file committed alongside the code it plans | [story-2.2](docs/retrospectives/story-2.2.md) |
| R2 | Production-code surface section enumerates type/signature/format changes | [story-maint-10](docs/retrospectives/story-maint-10.md) |
| R3 | Tool-bundle import audit when a new framework/library enters the deps | [story-3.1](docs/retrospectives/story-3.1.md) |
| R4 | Composition-root subprocess test required when \`program.ts\` is touched | [story-maint-09](docs/retrospectives/story-maint-09.md) |
| R5 | Gherkin-to-test mapping audit at Phase 4 | [story-2.5](docs/retrospectives/story-2.5.md) |
`;

const RETRO_FIXTURE_BASIC = `
# Story retro

## Keep

- Used R5 and R8 patterns effectively.

## Try

- R20 should be codified.
`;

describe('extractSectionEightTags', () => {
  it('extracts all R-tags from § 8 region', () => {
    const tags = extractSectionEightTags(CLAUDE_MD_FIXTURE);
    expect(tags).toContain('R1');
    expect(tags).toContain('R2');
    expect(tags).toContain('R3');
    expect(tags).toContain('R4');
    expect(tags).toContain('R5');
    expect(tags.size).toBe(5);
  });

  it('returns empty set when § 8 is absent', () => {
    const tags = extractSectionEightTags('# CLAUDE.md\n\nNo rule table here.');
    expect(tags.size).toBe(0);
  });
});

describe('extractRetroTags', () => {
  // fails if the parser misses R-tags inside list items, headings, or prose
  // (Gherkin scenario 2: retro references an undocumented rule — parser side).
  it('extracts R-tags referenced in a retro', () => {
    const tags = extractRetroTags(RETRO_FIXTURE_BASIC);
    expect(tags).toContain('R5');
    expect(tags).toContain('R8');
    expect(tags).toContain('R20');
  });

  it('returns empty set for retro with no R-tags', () => {
    const tags = extractRetroTags('# Story retro\n\nNothing here.\n');
    expect(tags.size).toBe(0);
  });

  // fails if the pending-marker regex in extractRetroTags is too narrow (misses
  // *(pending)* / _(pending)_ / case variants) or too wide (suppresses tags
  // without an actual marker) (Gherkin scenario 3: pending marker — parser side).
  it('suppresses tags with *(pending)* marker', () => {
    const retro = '# Story\n\nR20 *(pending)*\n';
    const tags = extractRetroTags(retro);
    expect(tags.has('R20')).toBe(false);
  });

  it('suppresses tags with _(pending)_ marker', () => {
    const retro = '# Story\n\nR20 _(pending)_\n';
    const tags = extractRetroTags(retro);
    expect(tags.has('R20')).toBe(false);
  });

  it('suppresses tags with (Pending) case variant', () => {
    const retro = '# Story\n\nR20 (Pending)\n';
    const tags = extractRetroTags(retro);
    expect(tags.has('R20')).toBe(false);
  });

  it('does not suppress a different tag that appears without a pending marker', () => {
    const retro = '# Story\n\nR20 *(pending)*\nR5 is applied.\n';
    const tags = extractRetroTags(retro);
    expect(tags.has('R20')).toBe(false);
    expect(tags.has('R5')).toBe(true);
  });
});

describe('composeDrift', () => {
  it('reports retro-only and table-only tags', () => {
    const sectionEight = new Set(['R1', 'R2', 'R3']);
    const retros = new Set(['R1', 'R3', 'R99']);
    const result = composeDrift(sectionEight, retros);
    expect(result.retroOnly).toContain('R99');
    expect(result.tableOnly).toContain('R2');
    expect(result.retroOnly.size).toBe(1);
    expect(result.tableOnly.size).toBe(1);
  });

  it('returns empty sets when no drift', () => {
    const tags = new Set(['R1', 'R2']);
    const result = composeDrift(tags, tags);
    expect(result.retroOnly.size).toBe(0);
    expect(result.tableOnly.size).toBe(0);
  });

  it('property: retroOnly ∪ both ∪ tableOnly equals union of both inputs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }).map((n) => `R${n}`)).map(
          (arr) => new Set(arr),
        ),
        fc.array(fc.integer({ min: 1, max: 50 }).map((n) => `R${n}`)).map(
          (arr) => new Set(arr),
        ),
        (tableSet, retroSet) => {
          const result = composeDrift(tableSet, retroSet);
          const both = new Set([...tableSet].filter((t) => retroSet.has(t)));
          const reconstructed = new Set([
            ...result.retroOnly,
            ...both,
            ...result.tableOnly,
          ]);
          const union = new Set([...tableSet, ...retroSet]);
          for (const tag of union) {
            if (!reconstructed.has(tag)) return false;
          }
          for (const tag of reconstructed) {
            if (!union.has(tag)) return false;
          }
          return true;
        },
      ),
    );
  });
});

describe('extractPlanSurfacePaths', () => {
  // fails if extractPlanSurfacePaths skips a path token, picks up a non-path
  // token, or honours a stale alias instead of *(renamed → <newpath>)* — these
  // would let plan-vs-source drift slip past Check B (Gherkin scenarios 4-6:
  // plan path scan — parser side).
  it('extracts file path tokens from the Production-code surface section', () => {
    const plan = `
# Plan

## Context

Some intro.

## Production-code surface (R2)

| Path | New/Modified |
|---|---|
| \`src/core/foo.ts\` *(new)* | new |
| \`harness/foo/bar.ts\` *(new)* | new |
| \`tests/unit/foo.test.ts\` | modified |

## Risks

Some text.
`;
    const paths = extractPlanSurfacePaths(plan);
    expect(paths).toContain('src/core/foo.ts');
    expect(paths).toContain('harness/foo/bar.ts');
    expect(paths).toContain('tests/unit/foo.test.ts');
    expect(paths.length).toBe(3);
  });

  it('returns empty array when no Production-code surface section', () => {
    const plan = '# Plan\n\n## Context\n\nNo surface section here.\n';
    expect(extractPlanSurfacePaths(plan)).toHaveLength(0);
  });

  it('skips paths annotated with *(removed)*', () => {
    const plan = `
## Production-code surface (R2)

| \`src/core/deleted.ts\` *(removed)* | removed |
| \`src/core/kept.ts\` | modified |
`;
    const paths = extractPlanSurfacePaths(plan);
    expect(paths).not.toContain('src/core/deleted.ts');
    expect(paths).toContain('src/core/kept.ts');
  });

  it('follows *(renamed → <newpath>)* redirects', () => {
    const plan = `
## Production-code surface (R2)

| \`src/core/old.ts\` *(renamed → src/core/new.ts)* | renamed |
`;
    const paths = extractPlanSurfacePaths(plan);
    expect(paths).not.toContain('src/core/old.ts');
    expect(paths).toContain('src/core/new.ts');
  });

  it('rejects paths with leading dots (traversal guard)', () => {
    const plan = `
## Production-code surface

\`../etc/passwd\` is a bad path.
\`src/core/good.ts\` is fine.
`;
    const paths = extractPlanSurfacePaths(plan);
    expect(paths).not.toContain('../etc/passwd');
    expect(paths).toContain('src/core/good.ts');
  });
});

describe('extractEnumeratedRuleRanges', () => {
  // fails if the range regex misses a separator variant (dash/en-dash/em-dash/
  // ellipsis) that a spec could plausibly use to re-freeze the R1..R15
  // antipattern F5 named (Gherkin scenario 1: enumerated range fails the scan).
  it('detects a double-dot range', () => {
    const ranges = extractEnumeratedRuleRanges('Walk rules R1..R15 in order.');
    expect(ranges).toContain('R1..R15');
  });

  it('detects an en-dash range', () => {
    const ranges = extractEnumeratedRuleRanges('See R2–R9 for details.');
    expect(ranges).toContain('R2–R9');
  });

  it('detects an em-dash range', () => {
    const ranges = extractEnumeratedRuleRanges('See R2—R9 for details.');
    expect(ranges).toContain('R2—R9');
  });

  it('detects a hyphen range', () => {
    const ranges = extractEnumeratedRuleRanges('See R2-R9 for details.');
    expect(ranges).toContain('R2-R9');
  });

  it('detects an ellipsis range', () => {
    const ranges = extractEnumeratedRuleRanges('See R2…R9 for details.');
    expect(ranges).toContain('R2…R9');
  });

  it('returns empty array when there is no range', () => {
    expect(extractEnumeratedRuleRanges('No ranges here, just R5.')).toHaveLength(0);
  });

  // fails if the regex over-matches prose enumerations like "R2 and R3" or
  // "R2, R3" as a range — these are legitimate references to two distinct
  // tags, not a frozen enumeration (plan Risks table: range regex over-broad).
  it('does not match "R2 and R3" as a range', () => {
    expect(extractEnumeratedRuleRanges('Applies to R2 and R3.')).toHaveLength(0);
  });

  it('does not match "R2, R3" as a range', () => {
    expect(extractEnumeratedRuleRanges('Applies to R2, R3.')).toHaveLength(0);
  });

  it('does not match a regex literal like R[0-9]+', () => {
    expect(extractEnumeratedRuleRanges('grep -nE \'^\\| R[0-9]+ \\|\'')).toHaveLength(0);
  });
});

describe('extractClaudeTagRefs', () => {
  // fails if extractClaudeTagRefs misses a bare R-tag reference in a spec —
  // Check D would then silently fail to surface a non-§8 tag (Gherkin
  // scenario 2: a tag not in § 8 fails the scan — parser side).
  it('extracts bare R-tag references', () => {
    const tags = extractClaudeTagRefs('§ 8 skips R95 (no tombstone row).');
    expect(tags.has('R95')).toBe(true);
  });

  it('returns empty set when there are no R-tag references', () => {
    expect(extractClaudeTagRefs('No tags mentioned here.').size).toBe(0);
  });

  // fails if the *(hole)* suppression regex is missing or too narrow — the
  // R22-hole mentions h10a authored would then break a clean scan (Gherkin
  // scenario 3: *(hole)* marker suppresses a deliberate non-§8 reference).
  it('suppresses tags with *(hole)* marker', () => {
    const tags = extractClaudeTagRefs('§ 8 skips R22 *(hole)* (no tombstone row).');
    expect(tags.has('R22')).toBe(false);
  });

  it('suppresses tags with _(hole)_ marker', () => {
    const tags = extractClaudeTagRefs('§ 8 skips R22 _(hole)_ (no tombstone row).');
    expect(tags.has('R22')).toBe(false);
  });

  it('suppresses tags with (Hole) case variant', () => {
    const tags = extractClaudeTagRefs('§ 8 skips R22 (Hole) (no tombstone row).');
    expect(tags.has('R22')).toBe(false);
  });

  it('does not suppress a different tag that appears without a hole marker', () => {
    const tags = extractClaudeTagRefs('R22 *(hole)*\nR13 is applied.');
    expect(tags.has('R22')).toBe(false);
    expect(tags.has('R13')).toBe(true);
  });

  it('does not match a regex literal like R[0-9]+', () => {
    expect(extractClaudeTagRefs("grep -nE '^\\| R[0-9]+ \\|'").size).toBe(0);
  });
});

describe('composeClaudeDrift', () => {
  it('reports tag refs not present in the § 8 set', () => {
    const sectionEight = new Set(['R1', 'R2', 'R13']);
    const refs = new Set(['R1', 'R13', 'R95']);
    const result = composeClaudeDrift(refs, sectionEight);
    expect(result).toContain('R95');
    expect(result.size).toBe(1);
  });

  it('returns empty set when all refs are live § 8 tags', () => {
    const sectionEight = new Set(['R1', 'R2']);
    const refs = new Set(['R1', 'R2']);
    expect(composeClaudeDrift(refs, sectionEight).size).toBe(0);
  });

  it('property: every element of the result is a ref not in sectionEightTags', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }).map((n) => `R${n}`)).map(
          (arr) => new Set(arr),
        ),
        fc.array(fc.integer({ min: 1, max: 50 }).map((n) => `R${n}`)).map(
          (arr) => new Set(arr),
        ),
        (refs, sectionEightTags) => {
          const result = composeClaudeDrift(refs, sectionEightTags);
          for (const tag of result) {
            if (!refs.has(tag)) return false;
            if (sectionEightTags.has(tag)) return false;
          }
          for (const tag of refs) {
            if (!sectionEightTags.has(tag) && !result.has(tag)) return false;
          }
          return true;
        },
      ),
    );
  });
});

describe('formatJsonReport', () => {
  // fails if formatJsonReport emits a different shape than the documented
  // contract { findings: [{ kind, tag?, path?, file }] } — would silently
  // break any hook/consumer that parses --json output (R8 mock-diversity;
  // Gherkin scenario 7: --json output shape — parser side).
  it('emits round-trippable JSON with the expected shape', () => {
    const findings = [
      { kind: 'retro-only' as const, tag: 'R97', file: 'docs/retrospectives/foo.md' },
      { kind: 'missing-path' as const, path: 'src/core/gone.ts', file: 'docs/plans/bar.md' },
    ];
    const output = formatJsonReport(findings);
    const parsed = JSON.parse(output) as { findings: unknown[] };
    expect(parsed).toHaveProperty('findings');
    expect(parsed.findings).toHaveLength(2);
    const first = parsed.findings[0] as Record<string, unknown>;
    expect(first.kind).toBe('retro-only');
    expect(first.tag).toBe('R97');
    expect(first.file).toBe('docs/retrospectives/foo.md');
    const second = parsed.findings[1] as Record<string, unknown>;
    expect(second.kind).toBe('missing-path');
    expect(second.path).toBe('src/core/gone.ts');
  });

  // fails if formatJsonReport special-cases finding kinds rather than
  // serializing generically — the new Check F kinds (missing-role,
  // role-tools-violation, unlisted-control) must round-trip without a code
  // change to the formatter itself (plan Risk: "formatJsonReport may
  // special-case kinds").
  it('emits the three new Check F finding kinds without a formatter change', () => {
    const findings = [
      { kind: 'missing-role' as const, file: '.claude/agents/bad.md', detail: 'absent' },
      { kind: 'role-tools-violation' as const, file: '.claude/agents/bad.md', tool: 'Edit' },
      { kind: 'unlisted-control' as const, file: '.claude/agents/orphan.md' },
    ];
    const output = formatJsonReport(findings);
    const parsed = JSON.parse(output) as { findings: Array<Record<string, unknown>> };
    expect(parsed.findings).toHaveLength(3);
    expect(parsed.findings[0].kind).toBe('missing-role');
    expect(parsed.findings[0].detail).toBe('absent');
    expect(parsed.findings[1].kind).toBe('role-tools-violation');
    expect(parsed.findings[1].tool).toBe('Edit');
    expect(parsed.findings[2].kind).toBe('unlisted-control');
  });
});

const VALID_ROLES = new Set(['doer', 'judge', 'advisor']);
const MUTATION_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'];

function entry(file: string, role: string | undefined, tools: string[]): AgentSpecEntry {
  return { file, role, tools };
}

describe('checkAgentSpecRoles', () => {
  // fails if the check does not fire when role: is entirely absent from a
  // spec's parsed frontmatter (Gherkin outline: agent spec without role: ->
  // missing-role).
  it('reports missing-role when role is undefined', () => {
    const findings = checkAgentSpecRoles([entry('.claude/agents/a.md', undefined, ['Read'])]);
    expect(findings).toContainEqual({ kind: 'missing-role', file: '.claude/agents/a.md', detail: 'absent' });
  });

  // fails if the check accepts any string as a valid role instead of
  // validating against the closed doer|judge|advisor set (Gherkin outline:
  // role: reviewer (invalid value) -> missing-role).
  it('reports missing-role with detail "invalid" when role is present but not one of doer|judge|advisor', () => {
    const findings = checkAgentSpecRoles([entry('.claude/agents/a.md', 'reviewer', ['Read'])]);
    expect(findings).toContainEqual({ kind: 'missing-role', file: '.claude/agents/a.md', detail: 'invalid: reviewer' });
  });

  // fails if the check does not distinguish doer from judge/advisor when
  // scanning for mutation tools (Gherkin outline: role: judge spec listing
  // Edit -> role-tools-violation).
  it('reports role-tools-violation when a judge spec lists Edit', () => {
    const findings = checkAgentSpecRoles([entry('.claude/agents/a.md', 'judge', ['Read', 'Edit'])]);
    expect(findings).toContainEqual({ kind: 'role-tools-violation', file: '.claude/agents/a.md', tool: 'Edit' });
  });

  // fails if the check misses NotebookEdit or MultiEdit — the plan's stated
  // failure mode ("the tools invariant misses NotebookEdit/MultiEdit").
  it('reports role-tools-violation for NotebookEdit and MultiEdit on a non-doer spec', () => {
    const findings = checkAgentSpecRoles([
      entry('.claude/agents/a.md', 'advisor', ['NotebookEdit', 'MultiEdit']),
    ]);
    const tools = findings.filter((f) => f.kind === 'role-tools-violation').map((f) => (f as { tool: string }).tool);
    expect(tools).toContain('NotebookEdit');
    expect(tools).toContain('MultiEdit');
  });

  // fails if a doer spec listing Write/Edit is incorrectly flagged — doers
  // are the only role allowed file-mutation tools (Gherkin: real registry
  // conforms — sonnet-implementer carries Write, Edit).
  it('does not flag a doer spec listing Write and Edit', () => {
    const findings = checkAgentSpecRoles([
      entry('.claude/agents/sonnet-implementer.md', 'doer', ['Read', 'Write', 'Edit']),
    ]);
    expect(findings).toHaveLength(0);
  });

  // fails if a judge/advisor spec keeping Bash (the documented residual) is
  // incorrectly flagged — Bash is not a file-mutation tool per the model
  // note's invariant 2.
  it('does not flag a judge spec that keeps Bash', () => {
    const findings = checkAgentSpecRoles([entry('.claude/agents/a.md', 'judge', ['Read', 'Grep', 'Bash'])]);
    expect(findings).toHaveLength(0);
  });

  // property: for any role×tools combination, a role-tools-violation finding
  // exists for a mutation tool iff the role is not doer — the exact
  // invariant the model note declares (Check F: role-tools-violation).
  it('property: violation exists for a mutation tool iff role is not doer', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_ROLES, 'reviewer', undefined),
        fc.uniqueArray(fc.constantFrom(...MUTATION_TOOLS, 'Read', 'Grep', 'Bash'), { maxLength: 7 }),
        (role, tools) => {
          const findings = checkAgentSpecRoles([entry('.claude/agents/x.md', role, tools)]);
          const violationTools = new Set(
            findings.filter((f) => f.kind === 'role-tools-violation').map((f) => (f as { tool: string }).tool),
          );
          for (const tool of tools) {
            const isMutationTool = MUTATION_TOOLS.includes(tool);
            const isDoer = role === 'doer';
            const shouldViolate = isMutationTool && !isDoer;
            if (violationTools.has(tool) !== shouldViolate) return false;
          }
          return true;
        },
      ),
    );
  });
});

describe('checkControlCompleteness', () => {
  // fails if a `.claude/agents/*.md` file with no inventory row is not
  // reported (Gherkin outline: agent/command file with no inventory row ->
  // unlisted-control).
  it('reports unlisted-control for an agent file absent from the inventory', () => {
    const findings = checkControlCompleteness(
      ['.claude/agents/orphan.md'],
      new Set(['.claude/agents/some-other-agent.md']),
    );
    expect(findings).toContainEqual({ kind: 'unlisted-control', file: '.claude/agents/orphan.md' });
  });

  // fails if the completeness diff silently skips .claude/commands/ files —
  // the plan's stated failure mode ("the completeness diff ignores
  // .claude/commands/").
  it('reports unlisted-control for a command file absent from the inventory', () => {
    const findings = checkControlCompleteness(
      ['.claude/commands/orphan-playbook.md'],
      new Set(['.claude/commands/some-other-command.md']),
    );
    expect(findings).toContainEqual({ kind: 'unlisted-control', file: '.claude/commands/orphan-playbook.md' });
  });

  it('reports nothing when every file has an inventory entry', () => {
    const findings = checkControlCompleteness(
      ['.claude/agents/known.md'],
      new Set(['.claude/agents/known.md']),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('extractInventoryControlPaths', () => {
  // fails if the inventory-path scan misses a `.claude/agents/*.md` path
  // fenced in backticks in the "Where" column — the completeness diff would
  // then false-positive every registered agent as unlisted.
  it('extracts .claude/agents/ paths fenced in backticks', () => {
    const inventory = '| sonnet-implementer | `.claude/agents/sonnet-implementer.md` | doer |\n';
    const paths = extractInventoryControlPaths(inventory);
    expect(paths.has('.claude/agents/sonnet-implementer.md')).toBe(true);
  });

  // fails if the scan silently skips .claude/commands/ rows — the plan's
  // stated failure mode applied to the extraction side of the diff.
  it('extracts .claude/commands/ paths fenced in backticks', () => {
    const inventory = '| model-session | `.claude/commands/model-session.md` | playbook |\n';
    const paths = extractInventoryControlPaths(inventory);
    expect(paths.has('.claude/commands/model-session.md')).toBe(true);
  });

  it('returns an empty set when no control paths are present', () => {
    expect(extractInventoryControlPaths('# No controls here.\n').size).toBe(0);
  });

  // fails if the pattern also greedily matches an unrelated backtick-fenced
  // path (e.g. a CLAUDE.md § 8 reference) — only .claude/agents|commands
  // paths belong in the completeness diff.
  it('does not match unrelated backtick-fenced paths', () => {
    const inventory = '| R1 | `docs/retrospectives/story-2.2.md` | guide |\n';
    expect(extractInventoryControlPaths(inventory).size).toBe(0);
  });

  // fails if the scan matches paths mentioned in prose or a Gaps-section
  // bullet — a future Gaps note naming an unregistered file in backticks
  // would silently satisfy the completeness diff without a real row,
  // breaking Check F's enforced-registry property.
  it('ignores control paths mentioned outside table rows', () => {
    const inventory = [
      'The file `.claude/agents/prose-mention.md` is discussed here.',
      '- Gap: `.claude/commands/gap-example.md` has no paired sensor.',
      '| known | `.claude/agents/known.md` | judge |',
    ].join('\n');
    const paths = extractInventoryControlPaths(inventory);
    expect(paths.has('.claude/agents/prose-mention.md')).toBe(false);
    expect(paths.has('.claude/commands/gap-example.md')).toBe(false);
    expect(paths.has('.claude/agents/known.md')).toBe(true);
  });

  // fails if the pattern admits `..` traversal segments — sibling
  // extractPlanSurfacePaths rejects them (house precedent). The extracted
  // set is membership-only today; the guard keeps the invariant if a future
  // caller resolves these paths against the filesystem.
  it('rejects inventory paths containing traversal segments', () => {
    const inventory = '| evil | `.claude/agents/../../../etc/passwd.md` | doer |\n';
    expect(extractInventoryControlPaths(inventory).size).toBe(0);
  });
});
