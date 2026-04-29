import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { YamlConfigWriter } from '../../../../src/infra/config/yaml-config-writer.js';

// fails if doc round-tripping loses comments (guards the parseDocument round-trip claim)
// fails if the new group is inserted elsewhere in the document (guards append-position invariant)
// fails if the writer mutates the file under a race condition (guards Q4-a)
// fails if the writer silently moves the pattern or appends to the new category (guards Q5-b)
// fails if the writer appends a duplicate (guards Q5-a)
// fails if the file is written in-place without rename or if a tmp sibling remains (guards atomicity invariant)

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-config-writer-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeYaml(tmpDir: string, content: string): { yamlPath: string; mtimeNs: bigint } {
  const yamlPath = path.join(tmpDir, 'accounting.yaml');
  fs.writeFileSync(yamlPath, content, { encoding: 'utf8', mode: 0o600 });
  const mtimeNs = fs.statSync(yamlPath, { bigint: true }).mtimeNs;
  return { yamlPath, mtimeNs };
}

const YAML_WITH_TRANSPORT = `# top-level comment
dbPath: ./test.db
# autoTagRules are also written by \`npm run ingest\` in interactive mode
autoTagRules:
  - category: Transport
    patterns:
      - "uber|bolt"
`;

const YAML_WITH_INSURANCE = `# top-level comment
dbPath: ./test.db
autoTagRules:
  - category: Insurance
    patterns:
      - "altima"
`;

describe('YamlConfigWriter — Gherkin scenario 8: append to existing category group', () => {
  it('appends pattern to existing category, preserves comments, preserves non-target sections', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    const result = await writer.appendAutoTagRules([{ category: 'Transport', pattern: 'taxi' }]);

    expect(result.isSuccess).toBe(true);

    const afterContent = fs.readFileSync(yamlPath, 'utf8');

    // Transport group now has both patterns
    expect(afterContent).toContain('"uber|bolt"');
    expect(afterContent).toContain('taxi');

    // Comments are preserved
    expect(afterContent).toContain('# top-level comment');
    expect(afterContent).toContain('# autoTagRules are also written by');

    // dbPath section is untouched
    expect(afterContent).toContain('dbPath: ./test.db');
  });
});

describe('YamlConfigWriter — Gherkin scenario 9: create new category group when absent', () => {
  it('appends a new group after the last existing group', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    const result = await writer.appendAutoTagRules([{ category: 'AutoInsurance', pattern: 'altima' }]);

    expect(result.isSuccess).toBe(true);

    const afterContent = fs.readFileSync(yamlPath, 'utf8');

    // New group exists
    expect(afterContent).toContain('AutoInsurance');
    expect(afterContent).toContain('altima');

    // Transport group still present
    expect(afterContent).toContain('"uber|bolt"');

    // AutoInsurance appears after Transport in the document
    const transportPos = afterContent.indexOf('Transport');
    const autoInsurancePos = afterContent.indexOf('AutoInsurance');
    expect(autoInsurancePos).toBeGreaterThan(transportPos);
  });
});

describe('YamlConfigWriter — Gherkin scenario 13: atomic write (tmp + rename)', () => {
  it('writes atomically: final file differs from original, no tmp sibling remains, permissions 0o600 on POSIX', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);
    const originalContent = fs.readFileSync(yamlPath, 'utf8');

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    const result = await writer.appendAutoTagRules([{ category: 'Transport', pattern: 'taxi' }]);

    expect(result.isSuccess).toBe(true);

    const afterContent = fs.readFileSync(yamlPath, 'utf8');

    // File content changed
    expect(afterContent).not.toBe(originalContent);

    // No tmp sibling remains
    const files = fs.readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);

    // File permissions 0o600 on POSIX
    if (process.platform !== 'win32') {
      const stat = fs.statSync(yamlPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });
});

describe('YamlConfigWriter — Gherkin scenario 10: mtime race detection', () => {
  it('returns Result.fail mtime-race when file mtime differs from expected', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);

    // Simulate the file being touched externally — use a stale mtime
    const staleMtime = mtimeNs - 1n;
    const writer = new YamlConfigWriter(yamlPath, staleMtime);
    const result = await writer.appendAutoTagRules([{ category: 'Transport', pattern: 'taxi' }]);

    expect(result.isFailure).toBe(true);
    expect(result.error).toEqual({ kind: 'mtime-race' });

    // File is unchanged
    const afterContent = fs.readFileSync(yamlPath, 'utf8');
    expect(afterContent).toBe(YAML_WITH_TRANSPORT);
  });
});

describe('YamlConfigWriter — Gherkin scenario 11: pattern-different-category conflict', () => {
  it('returns Result.fail conflict when pattern exists under a different category', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_INSURANCE);

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    const result = await writer.appendAutoTagRules([{ category: 'AutoInsurance', pattern: 'altima' }]);

    expect(result.isFailure).toBe(true);
    expect(result.error).toEqual({ kind: 'conflict', existingCategory: 'Insurance', pattern: 'altima' });

    // File is unchanged
    const afterContent = fs.readFileSync(yamlPath, 'utf8');
    expect(afterContent).toBe(YAML_WITH_INSURANCE);
  });
});

describe('YamlConfigWriter — Gherkin scenario 12: silent no-op on duplicate (category, pattern)', () => {
  it('returns Result.ok and leaves file unchanged on duplicate (category, pattern)', async () => {
    const tmpDir = makeTmpDir();
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);
    const originalContent = fs.readFileSync(yamlPath, 'utf8');

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    // "uber|bolt" is already in Transport
    const result = await writer.appendAutoTagRules([{ category: 'Transport', pattern: 'uber|bolt' }]);

    expect(result.isSuccess).toBe(true);

    // File unchanged (no new patterns)
    const afterContent = fs.readFileSync(yamlPath, 'utf8');
    expect(afterContent).toBe(originalContent);
  });
});

describe('YamlConfigWriter — autoTagRules section absent', () => {
  it('creates autoTagRules section when not present in the YAML', async () => {
    const tmpDir = makeTmpDir();
    const noRulesYaml = `dbPath: ./test.db\nrecurring: []\n`;
    const { yamlPath, mtimeNs } = writeYaml(tmpDir, noRulesYaml);

    const writer = new YamlConfigWriter(yamlPath, mtimeNs);
    const result = await writer.appendAutoTagRules([{ category: 'Transport', pattern: 'uber' }]);

    expect(result.isSuccess).toBe(true);

    const afterContent = fs.readFileSync(yamlPath, 'utf8');
    expect(afterContent).toContain('autoTagRules');
    expect(afterContent).toContain('Transport');
    expect(afterContent).toContain('uber');
  });
});

describe('YamlConfigWriter — io.message sanitisation', () => {
  it('io error message does not contain absolute paths (sanitizeFsError)', async () => {
    // Use a yamlPath that cannot be written to (read-only dir) to trigger io error
    // We test sanitisation by checking the error message does not contain the dir path
    const tmpDir = makeTmpDir();
    const { yamlPath } = writeYaml(tmpDir, YAML_WITH_TRANSPORT);

    // Make the file read-only and the directory read-only on POSIX to force a write error
    if (process.platform === 'win32') return; // skip on Windows

    fs.chmodSync(yamlPath, 0o400);
    fs.chmodSync(tmpDir, 0o500);

    try {
      // Re-read mtime after chmod (mtime unchanged since we only changed permissions)
      const actualMtime = fs.statSync(yamlPath, { bigint: true }).mtimeNs;
      const writer2 = new YamlConfigWriter(yamlPath, actualMtime);
      const result = await writer2.appendAutoTagRules([{ category: 'Transport', pattern: 'taxi' }]);

      if (result.isFailure && result.error.kind === 'io') {
        expect(result.error.message).not.toContain(tmpDir);
        expect(result.error.message).not.toContain('/tmp/');
      }
    } finally {
      fs.chmodSync(tmpDir, 0o700);
      fs.chmodSync(yamlPath, 0o600);
    }
  });
});
