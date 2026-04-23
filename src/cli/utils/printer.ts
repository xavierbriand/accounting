import Table from 'cli-table3';
import chalk from 'chalk';
import type { BuildOutcome } from '@core/ingest/types.js';

function formatAmount(outcome: BuildOutcome): string {
  const entry = outcome.transaction.entries.find((e) => e.side === 'debit');
  if (!entry) return '';
  const amount = entry.amount;
  const euros = (amount.amount / 100).toFixed(2);
  return `${euros} ${amount.currency}`;
}

function confidenceMark(outcome: BuildOutcome): string {
  return outcome.confidence === 'high' ? chalk.green('✓') : chalk.yellow('?');
}

export function formatSummaryTable(outcomes: readonly BuildOutcome[]): string {
  const table = new Table({
    head: ['Date', 'Description', 'Amount', 'Category', 'Conf'],
    style: { head: [], border: [] },
  });

  for (const o of outcomes) {
    const tx = o.transaction;
    const date = tx.occurredAt.slice(0, 10);
    const desc = tx.description.slice(0, 40);
    table.push([date, desc, formatAmount(o), o.category, confidenceMark(o)]);
  }

  return table.toString();
}
