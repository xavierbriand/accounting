import { readdir, readFile } from 'node:fs/promises';
import { join as joinPath } from 'node:path';

import { parseCsv } from './csv.ts';
import { parseOfx, type OfxStatement } from './ofx.ts';
import { joinPositionally } from './join.ts';
import { toTransactions, mergeLedger, type Transaction } from './ledger.ts';
import { csvNameFor, sourceOf, type Source } from './sources.ts';

export interface LoadedSource {
  readonly source: Source;
  readonly statement: OfxStatement;
  readonly count: number;
}

export interface Ledger {
  readonly transactions: readonly Transaction[];
  readonly sources: readonly LoadedSource[];
}

export class ExportsNotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExportsNotFoundError';
  }
}

/**
 * Read a folder of bank exports into one ledger.
 *
 * Every `.ofx` must have a `.csv` beside it over the same range: the OFX carries
 * the row ids and the closing balance, the CSV carries the categories and value
 * dates, and neither alone is enough. A `.qif` in the folder is ignored — it has
 * no ids and no categories, so it is a strict subset of what is already here.
 */
export async function loadLedger(directory: string): Promise<Ledger> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (cause) {
    throw new ExportsNotFoundError(
      `Cannot read the exports folder "${directory}". Set exports.directory in ` +
        `sluice.toml to the folder holding the bank's .ofx and .csv exports.`,
      { cause },
    );
  }

  const ofxFiles = entries.filter((f) => f.toLowerCase().endsWith('.ofx')).sort();
  if (ofxFiles.length === 0) {
    throw new ExportsNotFoundError(
      `No .ofx exports in "${directory}". sluice reads the OFX export for row ids ` +
        `and balances, and the CSV export beside it for categories.`,
    );
  }

  const present = new Set(entries);
  const batches: Transaction[][] = [];
  const sources: LoadedSource[] = [];

  for (const ofxFile of ofxFiles) {
    const csvFile = csvNameFor(ofxFile);
    if (!present.has(csvFile)) {
      throw new ExportsNotFoundError(
        `"${ofxFile}" has no matching "${csvFile}". Both are needed over the same ` +
          `date range: the OFX has the row ids and balance, the CSV has the ` +
          `categories the budget is built from.`,
      );
    }

    const source = sourceOf(ofxFile);
    const statement = parseOfx(await readFile(joinPath(directory, ofxFile)), ofxFile);
    const csvRows = parseCsv(await readFile(joinPath(directory, csvFile)), csvFile);
    const joined = joinPositionally(statement, csvRows, source.id);

    batches.push(toTransactions(joined, source));
    sources.push({ source, statement, count: joined.length });
  }

  return { transactions: mergeLedger(batches), sources };
}
