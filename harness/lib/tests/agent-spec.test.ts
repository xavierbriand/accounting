import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseAgentSpecFrontmatter } from '../agent-spec.js';

const VALID_SPEC = `---
name: sonnet-implementer
description: Execute a planned story.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite
role: doer
---

Body text, not part of frontmatter.
`;

describe('parseAgentSpecFrontmatter', () => {
  // fails if the parser drops a known key or mis-splits the comma-separated
  // tools list — the completeness/role checks (Check F) read every field
  // (Gherkin: real registry conforms — parser side).
  it('extracts every known key from a valid spec', () => {
    const parsed = parseAgentSpecFrontmatter(VALID_SPEC);
    expect(parsed.name).toBe('sonnet-implementer');
    expect(parsed.description).toBe('Execute a planned story.');
    expect(parsed.model).toBe('sonnet');
    expect(parsed.role).toBe('doer');
    expect(parsed.tools).toEqual(['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite']);
  });

  // fails if the parser throws or silently invents a role when the key is
  // absent — Check F's missing-role finding depends on `role` being
  // `undefined`, not a default value (Gherkin outline: agent spec without
  // role: -> missing-role).
  it('leaves role undefined when the key is absent', () => {
    const spec = `---
name: no-role-agent
tools: Read, Grep
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.role).toBeUndefined();
    expect(parsed.tools).toEqual(['Read', 'Grep']);
  });

  // fails if the parser coerces an invalid value into one of the three role
  // strings instead of passing it through verbatim — Check F's missing-role
  // finding must be able to distinguish "absent" from "present but invalid"
  // and report which (Gherkin outline: role: reviewer -> missing-role).
  it('passes through an invalid role value verbatim rather than rejecting it', () => {
    const spec = `---
name: bad-role-agent
tools: Read
role: reviewer
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.role).toBe('reviewer');
  });

  // fails if the parser requires every optional key to be present and
  // throws/false-positives on their absence — real specs like
  // sibling-overlap.md have no explicit forward-compat keys beyond name/
  // model/tools and must parse cleanly (Gherkin: real registry conforms).
  it('does not false-positive when optional keys (name, description, model, role) are all absent', () => {
    const spec = `---
tools: Read, Grep, Bash
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.name).toBeUndefined();
    expect(parsed.description).toBeUndefined();
    expect(parsed.model).toBeUndefined();
    expect(parsed.role).toBeUndefined();
    expect(parsed.tools).toEqual(['Read', 'Grep', 'Bash']);
  });

  // fails if the parser can't handle a spec with no tools: line at all —
  // real command playbooks have no frontmatter fence and should never reach
  // this parser, but a spec with an incomplete tools line must not throw
  // (defensive: absent tools key resolves to an empty array, never undefined,
  // so callers can iterate without a null check).
  it('resolves tools to an empty array when the key is absent', () => {
    const spec = `---
name: no-tools-agent
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.tools).toEqual([]);
  });

  // fails if the parser is confused by whitespace variance around the comma
  // separators or colons — real specs are hand-authored and whitespace is
  // not perfectly uniform across all six files.
  it('trims whitespace around tool names and key/value separators', () => {
    const spec = `---
name:   spaced-agent
tools:  Read ,  Grep,Bash
role: judge
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.name).toBe('spaced-agent');
    expect(parsed.tools).toEqual(['Read', 'Grep', 'Bash']);
    expect(parsed.role).toBe('judge');
  });

  // fails if the parser cannot tolerate an unknown frontmatter key —
  // forward-compat requirement for #172 (model: conformance) and #165
  // (spec-version) sharing this parser (plan Production-code surface note).
  it('tolerates unknown frontmatter keys without throwing or dropping known ones', () => {
    const spec = `---
name: forward-compat-agent
tools: Read
spec-version: 2
role: advisor
---
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.name).toBe('forward-compat-agent');
    expect(parsed.role).toBe('advisor');
    expect(parsed.tools).toEqual(['Read']);
  });

  // fails if the parser reads past the closing `---` fence and picks up body
  // text as if it were frontmatter — would corrupt every field with noise
  // from the markdown body.
  it('does not read frontmatter-shaped lines from the body past the closing fence', () => {
    const spec = `---
name: fenced-agent
tools: Read
role: doer
---

## Section

tools: this looks like frontmatter but is body text
role: this too
`;
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.name).toBe('fenced-agent');
    expect(parsed.tools).toEqual(['Read']);
    expect(parsed.role).toBe('doer');
  });

  // fails if the parser throws on content with no frontmatter fence at all —
  // command playbooks (.claude/commands/*.md) have no `---` fence and this
  // parser must never be pointed at them, but defensive tolerance keeps a
  // caller mistake from crashing the whole scan rather than producing an
  // empty-ish result.
  it('returns an empty-ish result for content with no frontmatter fence', () => {
    const spec = 'WHEN_TO_USE: some playbook text with no frontmatter fence.\n';
    const parsed = parseAgentSpecFrontmatter(spec);
    expect(parsed.tools).toEqual([]);
    expect(parsed.role).toBeUndefined();
  });

  // property: for any well-formed tools: line built from a known tool-name
  // alphabet, joined with variable whitespace around commas, the parser
  // recovers exactly the same ordered list of tool names — guards against
  // regex/split edge cases the example-based tests above don't enumerate.
  it('property: recovers the exact tool list regardless of comma/whitespace variance', () => {
    const TOOL_NAMES = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite', 'NotebookEdit', 'MultiEdit'];
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...TOOL_NAMES), { minLength: 1, maxLength: TOOL_NAMES.length }),
        fc.array(fc.constantFrom('', ' ', '  '), { minLength: 1, maxLength: 1 }),
        (tools, spacingChoices) => {
          const spacing = spacingChoices[0];
          const toolsLine = tools.map((t) => `${spacing}${t}${spacing}`).join(',');
          const spec = `---\ntools:${toolsLine}\n---\n`;
          const parsed = parseAgentSpecFrontmatter(spec);
          return JSON.stringify(parsed.tools) === JSON.stringify(tools);
        },
      ),
    );
  });
});
