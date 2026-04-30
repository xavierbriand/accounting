import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  extractSectionEightTags,
  extractRetroTags,
  composeDrift,
  extractPlanSurfacePaths,
  formatJsonReport,
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
});

describe('formatJsonReport', () => {
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
});
