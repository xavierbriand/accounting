import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENTRYPOINT = path.join(REPO_ROOT, 'harness', 'disposition-report', 'disposition-report.ts');
const COMMITTED_JSON_PATH = path.join(REPO_ROOT, 'docs', 'metrics', 'dispositions.json');

type Report = {
  totalRows: number;
  parsedLogCount: number;
  byTag: Record<string, number>;
  byPhase: Array<{ phase: string; total: number; legs: string[]; byTag: Record<string, number> }>;
  byRule: Array<{ rule: string; total: number; acknowledged: number; acknowledgeRate: number }>;
  byStory: Array<{ story: string; total: number; byTag: Record<string, number> }>;
};

describe('disposition-report subprocess — real repo tree', () => {
  // fails if: a dialect goes unparsed silently (buckets wouldn't sum to
  // totalRows), the CLI writes into the real repo instead of the requested
  // --out dir, or fewer than 50 of docs/plans' ~55+ Suggestion logs parse
  // (Gherkin Scenario 1: the report reflects the real logs).
  it('exits 0, writes both artifacts to a tmp --out dir, reports >=50 parsed logs, buckets sum, totals agree', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disposition-report-'));
    try {
      const result = spawnSync('npx', ['tsx', ENTRYPOINT, '--out', tmpDir], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('disposition-report:');

      const mdPath = path.join(tmpDir, 'dispositions.md');
      const jsonPath = path.join(tmpDir, 'dispositions.json');
      expect(fs.existsSync(mdPath)).toBe(true);
      expect(fs.existsSync(jsonPath)).toBe(true);

      const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Report;
      expect(report.parsedLogCount).toBeGreaterThanOrEqual(50);

      const tagSum = Object.values(report.byTag).reduce((a, b) => a + b, 0);
      expect(tagSum).toBe(report.totalRows);

      const phaseSum = report.byPhase.reduce((a, p) => a + p.total, 0);
      expect(phaseSum).toBe(report.totalRows);

      const md = fs.readFileSync(mdPath, 'utf8');
      expect(md).toContain(String(report.totalRows));

      // "asserted against committed artifacts' shape" (plan's stated
      // mechanism) — structural comparison only, never content equality:
      // docs/plans/ grows between this artifact's last regen and CI runs on
      // later PRs, so byte-identity would make this test flake on every
      // unrelated story merge (staleness is an accepted, documented risk).
      const committed = JSON.parse(fs.readFileSync(COMMITTED_JSON_PATH, 'utf8')) as Report;
      expect(Object.keys(report).sort()).toEqual(Object.keys(committed).sort());
      expect(Object.keys(report.byPhase[0]).sort()).toEqual(Object.keys(committed.byPhase[0]).sort());
      expect(Object.keys(report.byStory[0]).sort()).toEqual(Object.keys(committed.byStory[0]).sort());
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // fails if: main() ignores an empty docs/plans/ directory instead of
  // exiting 1 (the plan's self-check requirement — a silently-empty report
  // would look identical to "the loop just doesn't produce dispositions").
  it('exits 1 when zero suggestion logs are found (self-check)', () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'disposition-report-empty-'));
    const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'disposition-report-empty-out-'));
    try {
      fs.mkdirSync(path.join(tmpRepo, 'docs', 'plans'), { recursive: true });

      const result = spawnSync('npx', ['tsx', ENTRYPOINT, '--out', tmpOut], {
        cwd: tmpRepo,
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('zero logs parsed');
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
      fs.rmSync(tmpOut, { recursive: true, force: true });
    }
  });

  // fails if: running the tool twice against the same tree produces
  // different bytes (a hidden non-determinism — timestamp, Map/Set
  // iteration order, unsorted array — would silently break "reruns diff
  // cleanly", the plan's stated idempotency requirement).
  it('is idempotent — two runs against the same tree produce byte-identical artifacts', () => {
    const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'disposition-report-idem1-'));
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'disposition-report-idem2-'));
    try {
      spawnSync('npx', ['tsx', ENTRYPOINT, '--out', tmpDir1], { cwd: REPO_ROOT, encoding: 'utf8' });
      spawnSync('npx', ['tsx', ENTRYPOINT, '--out', tmpDir2], { cwd: REPO_ROOT, encoding: 'utf8' });

      const json1 = fs.readFileSync(path.join(tmpDir1, 'dispositions.json'), 'utf8');
      const json2 = fs.readFileSync(path.join(tmpDir2, 'dispositions.json'), 'utf8');
      expect(json1).toBe(json2);

      const md1 = fs.readFileSync(path.join(tmpDir1, 'dispositions.md'), 'utf8');
      const md2 = fs.readFileSync(path.join(tmpDir2, 'dispositions.md'), 'utf8');
      expect(md1).toBe(md2);
    } finally {
      fs.rmSync(tmpDir1, { recursive: true, force: true });
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });
});
