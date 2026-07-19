import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
import {
  extractSectionEightTags,
  extractSectionEightRows,
  extractRetroTags,
  composeDrift,
  extractPlanSurfacePaths,
  extractEnumeratedRuleRanges,
  extractClaudeTagRefs,
  composeClaudeDrift,
  checkAgentSpecRoles,
  checkAgentSpecVersions,
  checkControlCompleteness,
  extractInventoryControlPaths,
  extractPendingMarkers,
  checkPendingExpiry,
  isAdvisoryFinding,
  stripSectionEightRegion,
  formatJsonReport,
  type DriftFinding,
  type AgentSpecEntry,
  type PendingMarker,
} from './lib/drift-parser.js';
import { parseAgentSpecFrontmatter } from '../lib/agent-spec.js';

function runRuleCheck(repoRoot: string): DriftFinding[] {
  const claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const sectionEightTags = extractSectionEightTags(claudeMd);
  const tombstonedTags = new Set(
    extractSectionEightRows(claudeMd)
      .filter((row) => row.tombstoned)
      .map((row) => row.tag),
  );

  const retroDir = path.join(repoRoot, 'docs', 'retrospectives');
  const retroFiles = fs
    .readdirSync(retroDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md');

  const allRetroTags = new Set<string>();
  const tagSourceMap = new Map<string, string>();
  for (const file of retroFiles) {
    const content = fs.readFileSync(path.join(retroDir, file), 'utf8');
    const tags = extractRetroTags(content);
    for (const tag of tags) {
      allRetroTags.add(tag);
      if (!tagSourceMap.has(tag)) {
        tagSourceMap.set(tag, path.join('docs', 'retrospectives', file));
      }
    }
  }

  const { retroOnly, tableOnly } = composeDrift(sectionEightTags, allRetroTags);
  const findings: DriftFinding[] = [];
  for (const tag of retroOnly) {
    findings.push({ kind: 'retro-only', tag, file: tagSourceMap.get(tag) ?? 'docs/retrospectives/unknown.md' });
  }
  for (const tag of tableOnly) {
    // Tombstoned rows (struck, or the R22-style permanent "never minted"
    // row) carry their retirement rationale in-row + the linked walk — no
    // live retro reference is expected (Story h13).
    if (tombstonedTags.has(tag)) {
      continue;
    }
    findings.push({ kind: 'table-only', tag, file: 'CLAUDE.md' });
  }
  return findings;
}

function getPlanFiles(repoRoot: string, all: boolean): string[] {
  if (all) {
    const plansDir = path.join(repoRoot, 'docs', 'plans');
    if (!fs.existsSync(plansDir)) return [];
    return fs
      .readdirSync(plansDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join('docs', 'plans', f));
  }
  try {
    const output = execSync("git diff --name-only origin/main...HEAD -- 'docs/plans/*.md'", {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

function runPlanCheck(repoRoot: string, planFiles: string[]): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const planFile of planFiles) {
    const fullPath = path.join(repoRoot, planFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const paths = extractPlanSurfacePaths(content);
    for (const p of paths) {
      if (!fs.existsSync(path.join(repoRoot, p))) {
        findings.push({ kind: 'missing-path', path: p, file: planFile });
      }
    }
  }
  return findings;
}

function getClaudeSpecFiles(repoRoot: string): string[] {
  const dirs = [
    path.join('.claude', 'agents'),
    path.join('.claude', 'commands'),
  ];
  const files: string[] = [];
  for (const dir of dirs) {
    const fullDir = path.join(repoRoot, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const f of fs.readdirSync(fullDir)) {
      if (f.endsWith('.md')) {
        files.push(path.join(dir, f));
      }
    }
  }
  return files;
}

function runClaudeCheck(repoRoot: string): DriftFinding[] {
  const claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const sectionEightTags = extractSectionEightTags(claudeMd);

  const findings: DriftFinding[] = [];
  for (const specFile of getClaudeSpecFiles(repoRoot)) {
    const content = fs.readFileSync(path.join(repoRoot, specFile), 'utf8');

    for (const range of extractEnumeratedRuleRanges(content)) {
      findings.push({ kind: 'claude-range', range, file: specFile });
    }

    const tagRefs = extractClaudeTagRefs(content);
    const staleTags = composeClaudeDrift(tagRefs, sectionEightTags);
    for (const tag of staleTags) {
      findings.push({ kind: 'claude-stale-tag', tag, file: specFile });
    }
  }
  return findings;
}

function getAgentSpecFiles(repoRoot: string): string[] {
  const agentsDir = path.join(repoRoot, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join('.claude', 'agents', f));
}

function runAgentSpecCheck(repoRoot: string): DriftFinding[] {
  const agentSpecFiles = getAgentSpecFiles(repoRoot);

  const entries: AgentSpecEntry[] = agentSpecFiles.map((specFile) => {
    const content = fs.readFileSync(path.join(repoRoot, specFile), 'utf8');
    const parsed = parseAgentSpecFrontmatter(content);
    return { file: specFile, role: parsed.role, tools: parsed.tools, specVersion: parsed.specVersion };
  });
  const roleFindings = checkAgentSpecRoles(entries);
  const specVersionFindings = checkAgentSpecVersions(entries);

  const inventoryPath = path.join(repoRoot, 'docs', 'harness', 'control-inventory.md');
  const inventoryPaths = fs.existsSync(inventoryPath)
    ? extractInventoryControlPaths(fs.readFileSync(inventoryPath, 'utf8'))
    : new Set<string>();
  const allControlFiles = getClaudeSpecFiles(repoRoot);
  const completenessFindings = checkControlCompleteness(allControlFiles, inventoryPaths);

  return [...roleFindings, ...specVersionFindings, ...completenessFindings];
}

const STATUS_FRAGMENT_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}-.*\.md$/;

function getStatusFragmentDates(repoRoot: string): Date[] {
  const dir = path.join(repoRoot, 'docs', 'status.d');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => STATUS_FRAGMENT_FILE_PATTERN.test(f))
    .map((f) => new Date(`${f.slice(0, 10)}T00:00:00Z`));
}

function getTemplateFiles(repoRoot: string): string[] {
  const dir = path.join(repoRoot, 'docs', 'templates');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join('docs', 'templates', f));
}

// Check G's scope is "live canon" only (CLAUDE.md + .claude specs +
// templates), never retros/plans archives — a merged retro is frozen
// narrative, not a live opt-out (plan Risks table).
function runPendingExpiryCheck(repoRoot: string): DriftFinding[] {
  const markers: PendingMarker[] = [];

  const claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  markers.push(...extractPendingMarkers(stripSectionEightRegion(claudeMd), 'CLAUDE.md'));

  for (const specFile of getClaudeSpecFiles(repoRoot)) {
    const content = fs.readFileSync(path.join(repoRoot, specFile), 'utf8');
    markers.push(...extractPendingMarkers(content, specFile));
  }

  for (const templateFile of getTemplateFiles(repoRoot)) {
    const content = fs.readFileSync(path.join(repoRoot, templateFile), 'utf8');
    markers.push(...extractPendingMarkers(content, templateFile));
  }

  return checkPendingExpiry(markers, {
    now: new Date(),
    statusFragmentDates: getStatusFragmentDates(repoRoot),
  });
}

function formatHumanReport(findings: DriftFinding[]): string {
  const lines: string[] = [];
  const ruleFindings = findings.filter(
    (f) => f.kind === 'retro-only' || f.kind === 'table-only',
  );
  const pathFindings = findings.filter((f) => f.kind === 'missing-path');
  const claudeFindings = findings.filter(
    (f) => f.kind === 'claude-range' || f.kind === 'claude-stale-tag',
  );
  const agentSpecFindings = findings.filter(
    (f) =>
      f.kind === 'missing-role' ||
      f.kind === 'role-tools-violation' ||
      f.kind === 'unlisted-control' ||
      f.kind === 'missing-spec-version',
  );

  if (ruleFindings.length > 0) {
    lines.push('Check A — R-tag drift:');
    for (const f of ruleFindings) {
      if (f.kind === 'retro-only') {
        lines.push(`  retro-only: ${f.tag} (in ${f.file}, not in CLAUDE.md § 8)`);
      } else if (f.kind === 'table-only') {
        lines.push(`  table-only: ${f.tag} (in CLAUDE.md § 8, no retro reference)`);
      }
    }
  }
  if (pathFindings.length > 0) {
    lines.push('Check B — plan ↔ source drift:');
    for (const f of pathFindings) {
      if (f.kind === 'missing-path') {
        lines.push(`  missing-path: ${f.path} (referenced in ${f.file}, not on disk)`);
      }
    }
  }
  if (claudeFindings.length > 0) {
    lines.push('Check D — `.claude/` rule-tag drift:');
    for (const f of claudeFindings) {
      if (f.kind === 'claude-range') {
        lines.push(`  claude-range: ${f.range} (in ${f.file}, enumerated range antipattern)`);
      } else if (f.kind === 'claude-stale-tag') {
        lines.push(`  claude-stale-tag: ${f.tag} (in ${f.file}, not in CLAUDE.md § 8)`);
      }
    }
  }
  if (agentSpecFindings.length > 0) {
    lines.push('Check F — agent-spec role conformance:');
    for (const f of agentSpecFindings) {
      if (f.kind === 'missing-role') {
        lines.push(`  missing-role: ${f.file} (${f.detail})`);
      } else if (f.kind === 'role-tools-violation') {
        lines.push(`  role-tools-violation: ${f.tool} (in ${f.file}, non-doer role carries a mutation tool)`);
      } else if (f.kind === 'unlisted-control') {
        lines.push(`  unlisted-control: ${f.file} (no row in docs/harness/control-inventory.md)`);
      } else if (f.kind === 'missing-spec-version') {
        lines.push(`  missing-spec-version: ${f.file} (no spec-version frontmatter key)`);
      }
    }
  }
  const pendingExpiryFindings = findings.filter(
    (f) => f.kind === 'pending-unstamped' || f.kind === 'pending-expired',
  );
  if (pendingExpiryFindings.length > 0) {
    lines.push('Check G — pending/hole marker expiry (advisory):');
    for (const f of pendingExpiryFindings) {
      if (f.kind === 'pending-unstamped') {
        lines.push(`  pending-unstamped: ${f.file} (${f.markerKind} marker, no stamp) (advisory)`);
      } else if (f.kind === 'pending-expired') {
        lines.push(
          `  pending-expired: ${f.file} (${f.markerKind} marker, stamped story-${f.stampedStory}, ${f.stampedDate}) (advisory)`,
        );
      }
    }
  }
  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const json = args.includes('--json');

  const repoRoot = process.cwd();

  const ruleFindings = runRuleCheck(repoRoot);
  const planFiles = getPlanFiles(repoRoot, all);
  const planFindings = runPlanCheck(repoRoot, planFiles);
  const claudeFindings = runClaudeCheck(repoRoot);
  const agentSpecFindings = runAgentSpecCheck(repoRoot);
  const pendingExpiryFindings = runPendingExpiryCheck(repoRoot);
  const findings = [
    ...ruleFindings,
    ...planFindings,
    ...claudeFindings,
    ...agentSpecFindings,
    ...pendingExpiryFindings,
  ];

  if (json) {
    process.stdout.write(formatJsonReport(findings) + '\n');
  } else if (findings.length > 0) {
    process.stderr.write(formatHumanReport(findings) + '\n');
  }

  const hardFindings = findings.filter((f) => !isAdvisoryFinding(f));
  process.exit(hardFindings.length > 0 ? 1 : 0);
}

main();
