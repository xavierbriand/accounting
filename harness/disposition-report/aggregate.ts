import type { NormalizedTag, SuggestionLogRow } from './parse-suggestion-log.js';
import { legsForPhase, type Phase } from './attribute.js';

export type TagCounts = Record<NormalizedTag, number>;

export type PhaseStat = {
  phase: Phase;
  legs: readonly string[];
  total: number;
  byTag: TagCounts;
};

export type RuleStat = {
  rule: string;
  total: number;
  acknowledged: number;
  acknowledgeRate: number;
};

export type StoryStat = {
  story: string;
  total: number;
  byTag: TagCounts;
};

export type DispositionReport = {
  totalRows: number;
  parsedLogCount: number;
  byTag: TagCounts;
  byPhase: PhaseStat[];
  byRule: RuleStat[];
  byStory: StoryStat[];
};

const TAG_ORDER: readonly NormalizedTag[] = [
  'adopted',
  'deferred',
  'rejected',
  'acknowledged',
  'unparsed',
];

const PHASE_ORDER: readonly Phase[] = ['p2', 'p4', 'unattributed'];

function emptyTagCounts(): TagCounts {
  const counts = {} as TagCounts;
  for (const tag of TAG_ORDER) {
    counts[tag] = 0;
  }
  return counts;
}

function ruleNumber(rule: string): number {
  return Number(rule.slice(1));
}

function aggregateByTag(rows: readonly SuggestionLogRow[]): TagCounts {
  const counts = emptyTagCounts();
  for (const row of rows) {
    counts[row.tag] += 1;
  }
  return counts;
}

function aggregateByPhase(rows: readonly SuggestionLogRow[]): PhaseStat[] {
  return PHASE_ORDER.map((phase) => {
    const phaseRows = rows.filter((row) => row.phase === phase);
    return {
      phase,
      legs: legsForPhase(phase),
      total: phaseRows.length,
      byTag: aggregateByTag(phaseRows),
    };
  });
}

function aggregateByRule(rows: readonly SuggestionLogRow[]): RuleStat[] {
  const totals = new Map<string, number>();
  const acknowledgedCounts = new Map<string, number>();
  for (const row of rows) {
    for (const rule of row.rules) {
      totals.set(rule, (totals.get(rule) ?? 0) + 1);
      if (row.tag === 'acknowledged') {
        acknowledgedCounts.set(rule, (acknowledgedCounts.get(rule) ?? 0) + 1);
      }
    }
  }
  const stats = [...totals.entries()].map(([rule, total]) => {
    const acknowledged = acknowledgedCounts.get(rule) ?? 0;
    return { rule, total, acknowledged, acknowledgeRate: acknowledged / total };
  });
  return stats.sort((a, b) => {
    if (b.acknowledgeRate !== a.acknowledgeRate) {
      return b.acknowledgeRate - a.acknowledgeRate;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return ruleNumber(a.rule) - ruleNumber(b.rule);
  });
}

function aggregateByStory(rows: readonly SuggestionLogRow[]): StoryStat[] {
  const byStory = new Map<string, SuggestionLogRow[]>();
  for (const row of rows) {
    const existing = byStory.get(row.story);
    if (existing) {
      existing.push(row);
    } else {
      byStory.set(row.story, [row]);
    }
  }
  return [...byStory.entries()]
    .map(([story, storyRows]) => ({
      story,
      total: storyRows.length,
      byTag: aggregateByTag(storyRows),
    }))
    .sort((a, b) => a.story.localeCompare(b.story));
}

export function aggregate(rows: readonly SuggestionLogRow[]): DispositionReport {
  return {
    totalRows: rows.length,
    parsedLogCount: new Set(rows.map((row) => row.story)).size,
    byTag: aggregateByTag(rows),
    byPhase: aggregateByPhase(rows),
    byRule: aggregateByRule(rows),
    byStory: aggregateByStory(rows),
  };
}

function formatTagCountsLine(counts: TagCounts): string {
  return TAG_ORDER.map((tag) => `${tag}=${counts[tag]}`).join(', ');
}

function formatRuleTable(byRule: readonly RuleStat[]): string {
  if (byRule.length === 0) {
    return '_No R-rule mentions found._';
  }
  const lines = ['| Rule | n | acknowledged | acknowledge-only rate |', '| --- | --- | --- | --- |'];
  for (const stat of byRule) {
    const pct = (stat.acknowledgeRate * 100).toFixed(1);
    lines.push(`| ${stat.rule} | ${stat.total} | ${stat.acknowledged} | ${pct}% |`);
  }
  return lines.join('\n');
}

function formatStoryTable(byStory: readonly StoryStat[]): string {
  if (byStory.length === 0) {
    return '_No stories with a Suggestion log._';
  }
  const lines = [
    '| Story | total | adopted | deferred | rejected | acknowledged | unparsed |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const stat of byStory) {
    lines.push(
      `| ${stat.story} | ${stat.total} | ${stat.byTag.adopted} | ${stat.byTag.deferred} | ${stat.byTag.rejected} | ${stat.byTag.acknowledged} | ${stat.byTag.unparsed} |`,
    );
  }
  return lines.join('\n');
}

export function formatMarkdownReport(report: DispositionReport): string {
  const sections = [
    '# Disposition report',
    '',
    `Total rows: ${report.totalRows} (${report.parsedLogCount} parsed logs).`,
    '',
    '## Per-tag totals',
    '',
    formatTagCountsLine(report.byTag),
    '',
    '## Per-phase rates',
    '',
    ...report.byPhase.map(
      (p) => `- **${p.phase}** (${p.legs.join(', ') || 'no leg mapping'}): total=${p.total} — ${formatTagCountsLine(p.byTag)}`,
    ),
    '',
    '## Per-rule acknowledge-only rates (ranked)',
    '',
    formatRuleTable(report.byRule),
    '',
    '## Per-story table',
    '',
    formatStoryTable(report.byStory),
    '',
  ];
  return sections.join('\n');
}

export function formatJsonReport(report: DispositionReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}
