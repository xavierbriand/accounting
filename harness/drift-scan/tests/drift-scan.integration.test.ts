import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCANNER = path.join(REPO_ROOT, 'harness', 'drift-scan', 'drift-scan.ts');

function runScanner(extraArgs: string[] = []): SpawnSyncReturns<string> {
  return spawnSync('npx', ['tsx', SCANNER, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempRetroPath(name: string): string {
  return path.join(REPO_ROOT, 'docs', 'retrospectives', name);
}

const TEMP_RETRO_FILES: string[] = [];

afterEach(() => {
  for (const f of TEMP_RETRO_FILES.splice(0)) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
});

describe('drift-scan integration', () => {
  // fails if extractRetroTags skips the unbacked tag, or composeDrift fails to
  // surface a retro-only set member, or main() ignores a non-empty hard-findings
  // list (Gherkin scenario 2: retro references an undocumented rule).
  it('exits 1 and names R98 when a retro references R98 without a marker', () => {
    const retroFile = tempRetroPath('story-test-r98.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR98 should be codified.\n');

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('R98');
  });

  // fails if the pending-marker regex in extractRetroTags is too narrow (misses
  // *(pending)* / _(pending)_ / case variants) or too wide (suppresses tags
  // without an actual marker) (Gherkin scenario 3: pending marker suppresses).
  it('exits 0 when R98 is suppressed with *(pending)* marker', () => {
    const retroFile = tempRetroPath('story-test-r98-pending.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR98 *(pending)*\n');

    const result = runScanner();
    expect(result.status).not.toBe(1);
    expect(result.stderr).not.toContain('R98');
  });

  // fails if Check A or Check B mistakenly classify a clean state as drift
  // (false positive in composeDrift's hard-findings filter or scanPlanPaths's
  // fs probe). Stderr is allowed to carry table-only informational findings
  // (R21 today) but must not contain retro-only/missing-path lines.
  // (Gherkin scenario 1: clean repo passes.)
  it('clean repo exits 0 — passes after R20 and R21 are codified (slice 10)', () => {
    const result = runScanner();
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('retro-only:');
    expect(result.stderr).not.toContain('missing-path:');
  });

  // fails if --all flag handling in main() does not bypass the diff-scope
  // filter, or scanPlanPaths ignores fs.existsSync's false return
  // (Gherkin scenario 6: --all flag surfaces historical drift).
  it('--all flag surfaces drift from plans with missing paths', () => {
    const fakePlan = path.join(REPO_ROOT, 'docs', 'plans', 'story-test-missing.md');
    TEMP_RETRO_FILES.push(fakePlan);
    fs.writeFileSync(
      fakePlan,
      [
        '# Test plan',
        '',
        '## Production-code surface (R2)',
        '',
        '| `src/core/does-not-exist-xyz.ts` *(new)* | new |',
      ].join('\n'),
    );

    const result = runScanner(['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/core/does-not-exist-xyz.ts');
  });

  // fails if formatJsonReport emits a different shape than the unit-tested
  // contract, or if any finding in the array deviates from the discriminated-
  // union spec (R8 mock-diversity gap). Validates EVERY entry's shape, not
  // just the injected R97 — table-only entries (R21) must also conform.
  // (Gherkin scenario 7: --json output shape on a non-empty findings list.)
  it('--json flag emits valid JSON whose every finding matches the documented shape', () => {
    const retroFile = tempRetroPath('story-test-r97-json.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR97 is a finding.\n');

    const result = runScanner(['--json']);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as { findings: unknown[] };
    expect(parsed).toHaveProperty('findings');
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBeGreaterThan(0);

    for (const raw of parsed.findings) {
      const finding = raw as Record<string, unknown>;
      expect(typeof finding['kind']).toBe('string');
      expect(typeof finding['file']).toBe('string');
      const kind = finding['kind'];
      if (kind === 'retro-only' || kind === 'table-only') {
        expect(typeof finding['tag']).toBe('string');
        expect(finding['path']).toBeUndefined();
      } else if (kind === 'missing-path') {
        expect(typeof finding['path']).toBe('string');
        expect(finding['tag']).toBeUndefined();
      } else {
        throw new Error(`unexpected finding kind: ${String(kind)}`);
      }
    }

    const r97Finding = (parsed.findings as Array<Record<string, unknown>>).find(
      (f) => f['tag'] === 'R97',
    );
    expect(r97Finding).toBeDefined();
    expect(r97Finding?.['kind']).toBe('retro-only');
  });
});
