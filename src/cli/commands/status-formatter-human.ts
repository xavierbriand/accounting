import Table from 'cli-table3';
import chalk from 'chalk';
import type { StatusReport } from './status-report.js';
import { monthLabel } from '../utils/report-format.js';

function statusColor(status: string): string {
  if (status === 'below') return chalk.yellow(status);
  if (status === 'above-cap') return chalk.red(status);
  return chalk.green(status);
}

export function formatStatusHuman(report: StatusReport): string {
  const lines: string[] = [];

  // ─── Buffers section ────────────────────────────────────────────────────────
  lines.push(chalk.bold('Buffers'));
  lines.push('');

  if (report.buffers.length === 0) {
    lines.push('  (no buffers configured)');
  } else {
    const table = new Table({
      head: ['Name', 'Balance', 'Target', 'Cap', 'Status', 'Target Date'],
      style: { head: [], border: [] },
    });

    for (const b of report.buffers) {
      table.push([
        b.name,
        b.balance.toString(),
        b.target.toString(),
        b.cap !== undefined ? b.cap.toString() : '-',
        statusColor(b.status),
        b.targetDate,
      ]);
    }
    lines.push(table.toString());
  }

  lines.push('');

  // ─── Transfer section ────────────────────────────────────────────────────────
  lines.push(chalk.bold('Transfer'));
  lines.push('');

  if (report.transfer.ok) {
    const calc = report.transfer.value;
    const label = monthLabel(report.window.from);

    // Conversational-CFO prose
    const partnerParts: string[] = [];
    for (const [partner, share] of calc.perPartner) {
      partnerParts.push(`${partner} contributes ${share.toString()}`);
    }
    const partnerProse = partnerParts.join('; ');
    lines.push(`Total transfer for ${label}: ${calc.totalRequired.toString()}. ${partnerProse}.`);
    lines.push('');

    // Line items table
    const transferTable = new Table({
      head: ['Date', 'Description', 'Gross', 'Per-partner split'],
      style: { head: [], border: [] },
    });

    for (const item of calc.lineItems) {
      const splitParts: string[] = [];
      for (const [partner, share] of item.perPartnerSplit) {
        splitParts.push(`${partner}: ${share.toString()}`);
      }
      transferTable.push([
        item.date,
        `[${item.kind}] ${item.description}`,
        item.gross.toString(),
        splitParts.join(', '),
      ]);
    }
    lines.push(transferTable.toString());
  } else {
    lines.push(`  ${report.transfer.error}`);
    lines.push('');
    lines.push(`  Suggested action: ${report.transfer.suggestedAction}`);
  }

  lines.push('');

  // ─── Forecast section ────────────────────────────────────────────────────────
  lines.push(chalk.bold('Forecast'));
  lines.push('');

  if (!report.forecast.ok) {
    lines.push(`  ${report.forecast.error}`);
  } else if (report.forecast.value.length === 0) {
    lines.push('  (no forecast occurrences in window)');
  } else {
    const forecastTable = new Table({
      head: ['Date', 'Name', 'Category', 'Amount'],
      style: { head: [], border: [] },
    });

    for (const occ of report.forecast.value) {
      forecastTable.push([
        occ.expectedDate,
        occ.name,
        occ.category,
        occ.amount.toString(),
      ]);
    }
    lines.push(forecastTable.toString());
  }

  lines.push('');
  return lines.join('\n');
}
