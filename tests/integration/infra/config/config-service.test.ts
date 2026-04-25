import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileConfigService } from '../../../../src/infra/config/config-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Walk up from this test file to the repo root to find accounting.example.yaml
const repoRoot = path.resolve(__dirname, '../../../../');

function writeConfig(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

const validYaml = `
dbPath: ./data/ledger.db
defaultCurrency: EUR
timezone: Europe/Paris
splits:
  - validFrom: "2024-01-01"
    rules:
      - { partner: Alex, ratio: 0.5 }
      - { partner: Sam,  ratio: 0.5 }
buffers:
  - name: Car
    target: 1000
  - name: House
    target: 5000
    cap: 10000
accounts:
  - id: main-12345678901
    type: bank
    filenamePrefix: "12345678901_"
  - id: card-1234
    type: card
    cardSuffix: "1234"
    filenamePrefix: "carte_1234_"
`;

describe('FileConfigService', () => {
  let tmpDir: string;
  let xdgDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-config-test-'));
    xdgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accounting-xdg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(xdgDir, { recursive: true });
    vi.unstubAllEnvs();
  });

  it('loads accounting.yaml from projectDir when present', () => {
    writeConfig(tmpDir, 'accounting.yaml', validYaml);
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if FileConfigService does not read accounting.yaml from projectDir
    const result = service.load();

    expect(result.isSuccess).toBe(true);
    const config = result.value;
    expect(config.defaultCurrency).toBe('EUR');
    expect(config.splits).toHaveLength(1);
    expect(config.splits[0].validFrom).toBe('2024-01-01');
    expect(config.splits[0].rules).toHaveLength(2);
    expect(config.splits[0].rules[0].partner).toBe('Alex');
    expect(config.splits[0].rules[0].ratio).toBe(0.5);
    expect(config.buffers[0].target.amount).toBe(100000);
    expect(config.buffers[0].target.currency).toBe('EUR');
  });

  it('falls back to XDG_CONFIG_HOME/accounting/config.yaml', () => {
    const xdgSubDir = path.join(xdgDir, 'accounting');
    fs.mkdirSync(xdgSubDir, { recursive: true });
    writeConfig(xdgSubDir, 'config.yaml', validYaml);
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if FileConfigService does not fall back to XDG path when project file absent
    const result = service.load();

    expect(result.isSuccess).toBe(true);
    expect(result.value.defaultCurrency).toBe('EUR');
  });

  it('fails with both-missing error citing both paths AND mentioning accounting.example.yaml', () => {
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if FileConfigService does not report both searched paths when neither file exists
    const result = service.load();

    expect(result.isFailure).toBe(true);
    const err = result.error;
    expect(err).toContain(path.join(tmpDir, 'accounting.yaml'));
    expect(err).toContain(path.join(xdgDir, 'accounting', 'config.yaml'));
    expect(err).toContain('accounting.example.yaml');
  });

  it('fails on malformed YAML syntax with readable message (no stack trace)', () => {
    writeConfig(tmpDir, 'accounting.yaml', 'key: [unclosed bracket');
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if malformed YAML throws instead of returning Result.fail
    const result = service.load();

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('Malformed YAML');
    expect(result.error).not.toContain('at Object');
    expect(result.error).not.toContain('Error:');
  });

  it('fails on schema violation (propagates schema error)', () => {
    writeConfig(tmpDir, 'accounting.yaml', 'dbPath: ./data/ledger.db\ndefaultCurrency: EUR\n');
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if schema validation errors are not propagated from FileConfigService
    const result = service.load();

    expect(result.isFailure).toBe(true);
    expect(result.error).toContain('splits');
  });

  it('accounting.example.yaml at repo root itself validates', () => {
    const examplePath = path.join(repoRoot, 'accounting.example.yaml');
    const exampleContent = fs.readFileSync(examplePath, 'utf8');
    writeConfig(tmpDir, 'accounting.yaml', exampleContent);
    const service = new FileConfigService({ projectDir: tmpDir, xdgConfigHome: xdgDir });

    // fails if accounting.example.yaml drifts from the schema and no longer validates
    const result = service.load();

    expect(result.isSuccess).toBe(true);
  });

  it('falls back to os.homedir() when HOME is unset and no explicit homeDir is provided', () => {
    const systemHome = os.homedir();
    vi.stubEnv('HOME', undefined);
    const service = new FileConfigService({ projectDir: tmpDir });

    // fails if FileConfigService uses /tmp instead of os.homedir() when HOME is unset
    const result = service.load();

    expect(result.isFailure).toBe(true);
    const expectedXdgPath = path.join(systemHome, '.config', 'accounting', 'config.yaml');
    expect(result.error).toContain(expectedXdgPath);
    expect(result.error).not.toContain('/tmp/.config');
  });
});
