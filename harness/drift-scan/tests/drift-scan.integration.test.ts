import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initTempRepo, writeAndCommit, cleanupTempDirs } from '../../lib/temp-git-repo.js';
import { parseAgentSpecFrontmatter } from '../../lib/agent-spec.js';
import {
  checkAgentSpecRoles,
  checkAgentSpecVersions,
  checkControlCompleteness,
  extractInventoryControlPaths,
} from '../lib/drift-parser.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCANNER = path.join(REPO_ROOT, 'harness', 'drift-scan', 'drift-scan.ts');

const MINIMAL_CLAUDE_MD = `# CLAUDE.md\n\n## 8. Rule provenance\n\n| Tag | Rule (one-line) | Originating retro |\n| --- | --- | --- |\n| R1 | Placeholder rule | [story-fixture](docs/retrospectives/story-fixture.md) |\n`;

function runScannerAt(cwd: string, extraArgs: string[] = []): SpawnSyncReturns<string> {
  return spawnSync('npx', ['tsx', SCANNER, ...extraArgs], { cwd, encoding: 'utf8' });
}

function inventoryRow(controlPath: string): string {
  return `| \`${controlPath}\` |\n`;
}

function buildAgentSpecFixtureRepo(): string {
  const tmpDir = initTempRepo();
  writeAndCommit(tmpDir, 'CLAUDE.md', MINIMAL_CLAUDE_MD, 'chore: fixture CLAUDE.md');
  fs.mkdirSync(path.join(tmpDir, 'docs', 'plans'), { recursive: true });
  writeAndCommit(
    tmpDir,
    'docs/retrospectives/story-fixture.md',
    '# Fixture retro\n\nApplied R1.\n',
    'chore: fixture retro backing R1',
  );
  writeAndCommit(
    tmpDir,
    'docs/harness/control-inventory.md',
    `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}`,
    'chore: fixture control inventory',
  );
  return tmpDir;
}

function runScanner(extraArgs: string[] = []): SpawnSyncReturns<string> {
  return spawnSync('npx', ['tsx', SCANNER, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function tempRetroPath(name: string): string {
  return path.join(REPO_ROOT, 'docs', 'retrospectives', name);
}

function tempClaudeAgentPath(name: string): string {
  return path.join(REPO_ROOT, '.claude', 'agents', name);
}

const TEMP_RETRO_FILES: string[] = [];
let CLAUDE_MD_SNAPSHOT: string | null = null;

afterEach(() => {
  for (const f of TEMP_RETRO_FILES.splice(0)) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  }
});

afterEach(() => {
  if (CLAUDE_MD_SNAPSHOT !== null) {
    fs.writeFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), CLAUDE_MD_SNAPSHOT, 'utf8');
    CLAUDE_MD_SNAPSHOT = null;
  }
});

describe('drift-scan integration', () => {
  // fails if extractRetroTags skips the unbacked tag, or composeDrift fails to
  // surface a retro-only set member, or main() ignores a non-empty findings
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
  // (false positive in the exit-code gate in drift-scan.ts or composeDrift
  // in drift-parser.ts). A clean repo has no drift of any kind on stderr
  // (retro-only, missing-path, or table-only — every § 8 row has an
  // originating retro reference on main).
  // (Gherkin scenario 1: clean repo passes.)
  it('clean repo exits 0 — passes after R20 and R21 are codified (slice 10)', () => {
    const result = runScanner();
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('retro-only:');
    expect(result.stderr).not.toContain('missing-path:');
    expect(result.stderr).not.toContain('table-only:');
    expect(result.stderr).not.toContain('missing-role:');
    expect(result.stderr).not.toContain('role-tools-violation:');
    expect(result.stderr).not.toContain('unlisted-control:');
    expect(result.stderr).not.toContain('missing-spec-version:');
    expect(result.stderr).not.toContain('pending-unstamped:');
    expect(result.stderr).not.toContain('pending-expired:');
  });

  // (Gherkin scenario: real registry conforms.) In-process: composes the
  // exported Check F functions against the live tree — the same composition
  // runAgentSpecCheck performs inside main(); the CLI wiring itself is
  // covered by the subprocess outline tests below.
  // fails if a real spec false-positives (absent optional frontmatter keys
  // trip the parser) or the committed inventory misses a real agent/command
  // file.
  it('real registry conforms — composed Check F functions return zero findings', () => {
    const agentsDir = path.join(REPO_ROOT, '.claude', 'agents');
    const commandsDir = path.join(REPO_ROOT, '.claude', 'commands');
    const listMd = (dir: string): string[] =>
      fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

    const entries = listMd(agentsDir).map((f) => {
      const frontmatter = parseAgentSpecFrontmatter(
        fs.readFileSync(path.join(agentsDir, f), 'utf8'),
      );
      return {
        file: `.claude/agents/${f}`,
        role: frontmatter.role,
        tools: frontmatter.tools,
        specVersion: frontmatter.specVersion,
      };
    });
    const controlFiles = [
      ...listMd(agentsDir).map((f) => `.claude/agents/${f}`),
      ...listMd(commandsDir).map((f) => `.claude/commands/${f}`),
    ];
    const inventory = fs.readFileSync(
      path.join(REPO_ROOT, 'docs', 'harness', 'control-inventory.md'),
      'utf8',
    );

    const findings = [
      ...checkAgentSpecRoles(entries),
      ...checkAgentSpecVersions(entries),
      ...checkControlCompleteness(controlFiles, extractInventoryControlPaths(inventory)),
    ];
    expect(findings).toEqual([]);
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
        expect(finding['range']).toBeUndefined();
      } else if (kind === 'missing-path') {
        expect(typeof finding['path']).toBe('string');
        expect(finding['tag']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
      } else if (kind === 'claude-stale-tag') {
        expect(typeof finding['tag']).toBe('string');
        expect(finding['path']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
      } else if (kind === 'claude-range') {
        expect(typeof finding['range']).toBe('string');
        expect(finding['path']).toBeUndefined();
        expect(finding['tag']).toBeUndefined();
      } else if (kind === 'missing-role') {
        expect(typeof finding['detail']).toBe('string');
        expect(finding['path']).toBeUndefined();
        expect(finding['tag']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
        expect(finding['tool']).toBeUndefined();
      } else if (kind === 'role-tools-violation') {
        expect(typeof finding['tool']).toBe('string');
        expect(finding['path']).toBeUndefined();
        expect(finding['tag']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
        expect(finding['detail']).toBeUndefined();
      } else if (kind === 'unlisted-control') {
        expect(finding['path']).toBeUndefined();
        expect(finding['tag']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
        expect(finding['detail']).toBeUndefined();
        expect(finding['tool']).toBeUndefined();
      } else if (kind === 'missing-spec-version') {
        expect(finding['path']).toBeUndefined();
        expect(finding['tag']).toBeUndefined();
        expect(finding['range']).toBeUndefined();
        expect(finding['detail']).toBeUndefined();
        expect(finding['tool']).toBeUndefined();
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

  // fails if the exit-code gate in drift-scan.ts excludes table-only from
  // the exit-1 condition. Mutates CLAUDE.md in place and restores it via
  // afterEach — if a hard crash leaks the mutation, run
  // `git checkout CLAUDE.md` to recover (the appended R96 row is the only
  // diff). (Gherkin scenario h2-1: orphan § 8 row exits 1.)
  it('table-only finding contributes to exit 1', () => {
    const claudeMdPath = path.join(REPO_ROOT, 'CLAUDE.md');
    CLAUDE_MD_SNAPSHOT = fs.readFileSync(claudeMdPath, 'utf8');
    fs.writeFileSync(
      claudeMdPath,
      CLAUDE_MD_SNAPSHOT + '\n| R96 | drift-scan test orphan | [none](docs/retrospectives/none.md) |\n',
      'utf8',
    );

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('R96');
    expect(result.stderr).toContain('table-only:');
  });

  // fails if Check A's tombstone exemption doesn't reach the CLI wiring —
  // a struck (`~~...~~`) row with no retro reference must NOT be reported,
  // while a live (non-struck) orphan row still is (Story h13 slice 3:
  // tombstone-aware Check A, real-tree regression guard).
  it('a struck (tombstoned) row with no retro reference does not contribute to table-only', () => {
    const claudeMdPath = path.join(REPO_ROOT, 'CLAUDE.md');
    CLAUDE_MD_SNAPSHOT = fs.readFileSync(claudeMdPath, 'utf8');
    fs.writeFileSync(
      claudeMdPath,
      CLAUDE_MD_SNAPSHOT +
        '\n| R96 | ~~drift-scan test orphan~~ *Retired 2026-07-19 (test): superseded* | [none](docs/retrospectives/none.md) |' +
        '\n| R97 | drift-scan test orphan, still live | [none](docs/retrospectives/none.md) |\n',
      'utf8',
    );

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('R96');
    expect(result.stderr).toContain('R97');
    expect(result.stderr).toContain('table-only:');
  });

  // fails if the R22 hole-closing tombstone regresses — the ONE finding
  // this story's slice 3 must permanently clear (Story h13, table-only:R22).
  it('the real tree reports no table-only finding for R22 (permanent tombstone resolved)', () => {
    const result = runScanner();
    expect(result.stderr).not.toContain('R22');
  });

  // fails if runClaudeCheck/extractEnumeratedRuleRanges doesn't detect the
  // enumerated-range antipattern in a .claude/ spec (Gherkin scenario 1:
  // enumerated range in a spec fails the scan).
  it('exits 1 and names the range when a .claude/ spec hard-codes R1..R15', () => {
    const specFile = tempClaudeAgentPath('story-test-range.md');
    TEMP_RETRO_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nWalk rules R1..R15 in order.\n');

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check D');
    expect(result.stderr).toContain('R1..R15');
  });

  // fails if extractClaudeTagRefs/composeClaudeDrift doesn't surface a
  // non-§8 reference (Gherkin scenario 2: a tag not in § 8 fails the scan).
  it('exits 1 and names R95 as a stale tag when a .claude/ spec cites it', () => {
    const specFile = tempClaudeAgentPath('story-test-r95.md');
    TEMP_RETRO_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nApplies R95 unconditionally.\n');

    const result = runScanner();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check D');
    expect(result.stderr).toContain('R95');
  });

  // fails if the suppression regex in extractClaudeTagRefs is missing/too
  // narrow (the R22-hole mentions would then break a clean scan) (Gherkin
  // scenario 3: *(hole)* marker suppresses a deliberate non-§8 reference).
  it('does not flag R95 when marked *(hole)*', () => {
    const specFile = tempClaudeAgentPath('story-test-r95-hole.md');
    TEMP_RETRO_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nApplies R95 *(hole)* unconditionally.\n');

    const result = runScanner();
    expect(result.stderr).not.toContain('R95');
  });

  // fails if a legit spec tag or a marked R22 is flagged, or the JSON
  // discriminated-union shape drops range/tag/file for the new Check D kinds
  // (Gherkin scenario 4: clean repo passes, and --json carries new kinds).
  it('--json emits valid claude-range and claude-stale-tag findings for injected fixtures', () => {
    const rangeSpec = tempClaudeAgentPath('story-test-json-range.md');
    TEMP_RETRO_FILES.push(rangeSpec);
    fs.writeFileSync(rangeSpec, '# Test agent\n\nWalk rules R1..R15 in order.\n');

    const staleTagSpec = tempClaudeAgentPath('story-test-json-stale-tag.md');
    TEMP_RETRO_FILES.push(staleTagSpec);
    fs.writeFileSync(staleTagSpec, '# Test agent\n\nApplies R94 unconditionally.\n');

    const result = runScanner(['--json']);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as { findings: Array<Record<string, unknown>> };

    const rangeFinding = parsed.findings.find((f) => f['kind'] === 'claude-range');
    expect(rangeFinding).toBeDefined();
    expect(rangeFinding?.['range']).toBe('R1..R15');
    expect(typeof rangeFinding?.['file']).toBe('string');
    expect(rangeFinding?.['tag']).toBeUndefined();
    expect(rangeFinding?.['path']).toBeUndefined();

    const staleTagFinding = parsed.findings.find(
      (f) => f['kind'] === 'claude-stale-tag' && f['tag'] === 'R94',
    );
    expect(staleTagFinding).toBeDefined();
    expect(typeof staleTagFinding?.['file']).toBe('string');
    expect(staleTagFinding?.['range']).toBeUndefined();
    expect(staleTagFinding?.['path']).toBeUndefined();
  });

  it('clean repo produces no Check D finding after R22 mentions are marked *(hole)*', () => {
    const result = runScanner();
    expect(result.stderr).not.toContain('Check D');
    expect(result.stderr).not.toContain('claude-range:');
    expect(result.stderr).not.toContain('claude-stale-tag:');
  });
});

describe('drift-scan Check F — agent-spec role + control completeness (temp repo)', () => {
  const TEMP_DIRS: string[] = [];

  afterEach(() => {
    cleanupTempDirs(TEMP_DIRS);
  });

  // fails if runAgentSpecCheck is never wired into main(), or the parser
  // silently skips a spec with no role: key (Gherkin outline row 1: agent
  // spec without role: -> missing-role).
  it('exits 1 and names the file + missing-role when an agent spec has no role: key', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/agents/no-role.md',
      '---\nname: no-role\ntools: Read\n---\nBody.\n',
      'chore: fixture agent spec without role',
    );
    writeAndCommit(
      tmpDir,
      'docs/harness/control-inventory.md',
      `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}${inventoryRow('.claude/agents/no-role.md')}`,
      'chore: register no-role in inventory',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check F');
    expect(result.stderr).toContain('missing-role');
    expect(result.stderr).toContain('.claude/agents/no-role.md');
  });

  // fails if the CLI wiring never runs checkAgentSpecVersions (the unit tests
  // prove the function; this proves drift-scan actually reports the finding —
  // the sibling shape missing-role/role-tools-violation/unlisted-control have,
  // story-h12 Phase-4 gap-fill).
  it('exits 1 and names the file + missing-spec-version when an agent spec has no spec-version: key', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/agents/unversioned.md',
      '---\nname: unversioned\ntools: Read\nrole: judge\n---\nBody.\n',
      'chore: fixture agent spec without spec-version',
    );
    writeAndCommit(
      tmpDir,
      'docs/harness/control-inventory.md',
      `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}${inventoryRow('.claude/agents/unversioned.md')}`,
      'chore: register unversioned in inventory',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check F');
    expect(result.stderr).toContain('missing-spec-version');
    expect(result.stderr).toContain('.claude/agents/unversioned.md');
  });

  // fails if the parser coerces an invalid role value into a valid one
  // instead of reporting it (Gherkin outline row 2: role: reviewer (invalid
  // value) -> missing-role).
  it('exits 1 and names missing-role when an agent spec has role: reviewer (invalid value)', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/agents/bad-role.md',
      '---\nname: bad-role\ntools: Read\nrole: reviewer\n---\nBody.\n',
      'chore: fixture agent spec with invalid role',
    );
    writeAndCommit(
      tmpDir,
      'docs/harness/control-inventory.md',
      `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}${inventoryRow('.claude/agents/bad-role.md')}`,
      'chore: register bad-role in inventory',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check F');
    expect(result.stderr).toContain('missing-role');
    expect(result.stderr).toContain('.claude/agents/bad-role.md');
  });

  // fails if the tools invariant misses Edit, or does not distinguish judge
  // from doer (Gherkin outline row 3: role: judge spec listing Edit ->
  // role-tools-violation).
  it('exits 1 and names role-tools-violation when a judge spec lists Edit', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/agents/judge-with-edit.md',
      '---\nname: judge-with-edit\ntools: Read, Edit\nrole: judge\n---\nBody.\n',
      'chore: fixture judge spec listing Edit',
    );
    writeAndCommit(
      tmpDir,
      'docs/harness/control-inventory.md',
      `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}${inventoryRow('.claude/agents/judge-with-edit.md')}`,
      'chore: register judge-with-edit in inventory',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check F');
    expect(result.stderr).toContain('role-tools-violation');
    expect(result.stderr).toContain('.claude/agents/judge-with-edit.md');
  });

  // fails if the completeness diff ignores .claude/commands/ (Gherkin
  // outline row 4: agent or command file with no inventory row ->
  // unlisted-control).
  it('exits 1 and names unlisted-control when a command playbook has no inventory row', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/commands/orphan-playbook.md',
      'WHEN_TO_USE: fixture playbook with no inventory row.\n',
      'chore: fixture orphan command playbook',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Check F');
    expect(result.stderr).toContain('unlisted-control');
    expect(result.stderr).toContain('.claude/commands/orphan-playbook.md');
  });

  it('exits 0 when every agent spec has a valid role, no non-doer lists a mutation tool, and every file is registered', () => {
    const tmpDir = buildAgentSpecFixtureRepo();
    TEMP_DIRS.push(tmpDir);
    writeAndCommit(
      tmpDir,
      '.claude/agents/clean-doer.md',
      '---\nname: clean-doer\ntools: Read, Write, Edit\nrole: doer\nspec-version: 1\n---\nBody.\n',
      'chore: fixture clean doer spec',
    );
    writeAndCommit(
      tmpDir,
      '.claude/commands/clean-playbook.md',
      'WHEN_TO_USE: fixture clean playbook.\n',
      'chore: fixture clean command playbook',
    );
    writeAndCommit(
      tmpDir,
      'docs/harness/control-inventory.md',
      `# Control inventory\n\n${inventoryRow('.claude/agents/known-agent.md')}${inventoryRow('.claude/commands/known-command.md')}${inventoryRow('.claude/agents/clean-doer.md')}${inventoryRow('.claude/commands/clean-playbook.md')}`,
      'chore: register clean fixtures in inventory',
    );

    const result = runScannerAt(tmpDir, ['--all']);
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Check F');
  });
});

describe('drift-scan Check G — pending/hole marker expiry (advisory tier)', () => {
  const TEMP_FILES: string[] = [];

  afterEach(() => {
    for (const f of TEMP_FILES.splice(0)) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
  });

  // fails if an unstamped marker in live canon is silently ignored, or if
  // the advisory tier wrongly gates the exit code (Gherkin scenario 2, first
  // fixture leg; Story h13 slice 3: advisory-exit subprocess proof).
  it('reports pending-unstamped (advisory) and exits 0 for an unstamped marker', () => {
    const specFile = tempClaudeAgentPath('story-test-g-unstamped.md');
    TEMP_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nSee R95 *(hole)* pending review.\n');

    const result = runScanner();
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Check G');
    expect(result.stderr).toContain('pending-unstamped');
    expect(result.stderr).toContain('(advisory)');
  });

  // fails if the 90-day expiry threshold isn't wired end-to-end through the
  // CLI, or if an expired advisory finding wrongly gates the exit code
  // (Gherkin scenario 2, third fixture leg).
  it('reports pending-expired (advisory) and exits 0 for a long-stamped marker', () => {
    const specFile = tempClaudeAgentPath('story-test-g-expired.md');
    TEMP_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nSee R95 *(hole — story-h1, 2026-01-01)* still open.\n');

    const result = runScanner();
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Check G');
    expect(result.stderr).toContain('pending-expired');
    expect(result.stderr).toContain('(advisory)');
  });

  // fails if a fresh stamp is misclassified as expired (Gherkin scenario 2,
  // second fixture leg — "nothing for the second").
  it('reports nothing for a fresh stamped marker', () => {
    const specFile = tempClaudeAgentPath('story-test-g-fresh.md');
    TEMP_FILES.push(specFile);
    fs.writeFileSync(specFile, '# Test agent\n\nSee R95 *(hole — story-h13, 2026-07-19)* still open.\n');

    const result = runScanner();
    expect(result.stderr).not.toContain('Check G');
  });

  // fails if CLAUDE.md's own R21 row — which documents the stamped-marker
  // *format* using literal `*(pending)*` / `*(hole)*` examples — is scanned
  // without excluding § 8 first. Without the exclusion this fires forever on
  // a clean tree (the self-referential trap sampled directly from CLAUDE.md
  // for slice 2's fixtures). Real-tree proof, no injected fixture.
  it('the real tree reports no Check G finding (CLAUDE.md § 8 self-reference excluded)', () => {
    const result = runScanner();
    expect(result.stderr).not.toContain('pending-unstamped:');
    expect(result.stderr).not.toContain('pending-expired:');
  });
});
