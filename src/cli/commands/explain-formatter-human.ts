import Table from 'cli-table3';
import chalk from 'chalk';
import { Money } from '@core/shared/money.js';
import type { VarianceLine } from '@core/settlement/variance-line.js';
import type { ExplainReport } from './explain-report.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(from: string): string {
  const [year, month] = from.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

// Sign-aware prose for a signed Money delta — "EUR 40.00 less" reads better in a
// sentence than the raw "EUR -40.00" that Money.toString() would produce.
function signedDeltaPhrase(delta: Money): string {
  if (delta.amount === 0) return 'unchanged';
  const abs = Money.fromCents(Math.abs(delta.amount), delta.currency).value;
  return delta.amount > 0 ? `${abs.toString()} more` : `${abs.toString()} less`;
}

const NOT_CONFIGURED_SUGGESTION =
  'Add a settlement: accounts section to accounting.yaml (settlement.accounts[].account/.partner) to compare actual transfers against the suggestion.';

function renderChange(line: VarianceLine): string {
  if (line.presence === 'this-only') return 'new';
  if (line.presence === 'last-only') return 'gone';
  return line.totalDelta.toString();
}

function formatVarianceSection(report: ExplainReport): string[] {
  const lines: string[] = [];

  if (!report.variance.ok) {
    lines.push(`  ${report.variance.error}`);
    lines.push('');
    lines.push(`  Suggested action: ${report.variance.suggestedAction}`);
    return lines;
  }

  const v = report.variance.value;
  const thisLabel = monthLabel(report.thisWindow.from);
  const lastLabel = monthLabel(report.lastWindow.from);
  lines.push(
    `Your suggested transfer for ${thisLabel} is ${signedDeltaPhrase(v.totalDelta)} than ${lastLabel}'s suggestion.`,
  );
  lines.push('');

  const partners = [...v.perPartnerDelta.keys()].sort();
  const table = new Table({ head: ['Cause', 'Change', ...partners], style: { head: [], border: [] } });
  for (const line of v.lines) {
    const partnerCells = partners.map(p => line.perPartnerDelta.get(p)?.toString() ?? '-');
    table.push([line.key.description, renderChange(line), ...partnerCells]);
  }
  lines.push(table.toString());
  return lines;
}

function formatFollowThroughSection(report: ExplainReport): string[] {
  const lines: string[] = [];
  const ft = report.followThrough;

  if (ft.ok) {
    const partners = [...ft.value.perPartner.keys()].sort();
    for (const partner of partners) {
      const pf = ft.value.perPartner.get(partner)!;
      lines.push(`${partner} sent ${pf.actual.toString()} vs a suggested ${pf.suggested.toString()} (${signedDeltaPhrase(pf.delta)}).`);
    }
    lines.push(
      `Total: sent ${ft.value.totalActual.toString()} vs suggested ${ft.value.totalSuggested.toString()} (${signedDeltaPhrase(ft.value.totalDelta)}).`,
    );
    return lines;
  }

  if ('notConfigured' in ft) {
    lines.push('  Not configured.');
    lines.push('');
    lines.push(`  Suggested action: ${NOT_CONFIGURED_SUGGESTION}`);
    return lines;
  }

  lines.push(`  ${ft.error}`);
  lines.push('');
  lines.push(`  Suggested action: ${ft.suggestedAction}`);
  return lines;
}

export function formatExplainHuman(report: ExplainReport): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Settlement variance'));
  lines.push('');
  lines.push(...formatVarianceSection(report));

  lines.push('');
  lines.push(chalk.bold('Follow-through'));
  lines.push('');
  lines.push(...formatFollowThroughSection(report));

  lines.push('');
  lines.push('Note: movement computed with today\'s configuration.');
  lines.push('');

  return lines.join('\n');
}
