import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCANNER = path.join(REPO_ROOT, 'harness', 'drift-scan', 'drift-scan.ts');

function runScanner(extraArgs: string[] = []): ReturnType<typeof spawnSync> {
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
  it('exits 1 and names R98 when a retro references R98 without a marker', () => {
    const retroFile = tempRetroPath('story-test-r98.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR98 should be codified.\n');

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('R98');
  });

  it('exits 0 when R98 is suppressed with *(pending)* marker', () => {
    const retroFile = tempRetroPath('story-test-r98-pending.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR98 *(pending)*\n');

    const result = runScanner();
    expect(result.status).not.toBe(1);
    expect(result.stderr).not.toContain('R98');
  });

  it('clean repo exits 0 — passes after R20 and R21 are codified (slice 10)', () => {
    const result = runScanner();
    expect(result.status).toBe(0);
  });

  it('--all flag surfaces drift from plans with missing paths', () => {
    const tempPlanDir = os.tmpdir();
    const tempPlan = path.join(tempPlanDir, 'story-test-missing.md');
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
    void tempPlan;
  });

  it('--json flag emits valid JSON with findings array when drift exists', () => {
    const retroFile = tempRetroPath('story-test-r97-json.md');
    TEMP_RETRO_FILES.push(retroFile);
    fs.writeFileSync(retroFile, '# Test retro\n\nR97 is a finding.\n');

    const result = runScanner(['--json']);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout as string) as { findings: unknown[] };
    expect(parsed).toHaveProperty('findings');
    expect(Array.isArray(parsed.findings)).toBe(true);
    const r97Finding = (parsed.findings as Array<Record<string, unknown>>).find(
      (f) => f['tag'] === 'R97',
    );
    expect(r97Finding).toBeDefined();
    expect(r97Finding?.['kind']).toBe('retro-only');
  });
});
