import { parse as csvParse } from 'csv-parse/sync';
import type { CsvParser, ParseOptions } from '@core/ports/csv-parser.js';
import type { IngestItem, ParseError, ParseOutcome } from '@core/ingest/types.js';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';

const BPCE_COLUMNS = [
  'Date de comptabilisation',
  'Libelle simplifie',
  'Libelle operation',
  'Reference',
  'Informations complementaires',
  'Type operation',
  'Categorie',
  'Sous categorie',
  'Debit',
  'Credit',
  'Date operation',
  'Date de valeur',
  'Pointage operation',
] as const;

const AMOUNT_REGEX = /^[+-]?\d+(,\d{1,2})?$/;
const DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseCentsFromString(raw: string): number | null {
  const trimmed = raw.trim();
  if (!AMOUNT_REGEX.test(trimmed)) return null;
  const withoutSign = trimmed.replace(/^[+-]/, '');
  const commaIdx = withoutSign.indexOf(',');
  if (commaIdx === -1) {
    return parseInt(withoutSign, 10) * 100;
  }
  const whole = withoutSign.slice(0, commaIdx);
  const frac = withoutSign.slice(commaIdx + 1).padEnd(2, '0');
  return parseInt(whole, 10) * 100 + parseInt(frac, 10);
}

function resolveIsoOffset(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(p => [p.type, p.value]),
  );
  const offset = parts['timeZoneName'] ?? 'UTC+00:00';
  // longOffset gives e.g. 'GMT+02:00' or 'GMT+01:00'
  const isoOffset = offset.replace(/^GMT/, '').replace(/^UTC$/, '+00:00') || '+00:00';
  return `${parts['year']}-${parts['month']}-${parts['day']}T00:00:00${isoOffset}`;
}

function parseBpceDate(raw: string, timezone: string): string | null {
  const match = DATE_REGEX.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const dayNum = parseInt(dd, 10);
  const monthNum = parseInt(mm, 10);
  const yearNum = parseInt(yyyy, 10);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  // Construct the local midnight via a UTC date, then resolve offset
  const utcDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  // Validate it's a real date (e.g. 31/02 would roll over)
  const checkFormatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatted = checkFormatter.format(utcDate);
  // formatted is 'MM/DD/YYYY' in en-US locale
  const fParts = formatted.split('/');
  const formattedMonth = parseInt(fParts[0], 10);
  const formattedDay = parseInt(fParts[1], 10);
  if (formattedDay !== dayNum || formattedMonth !== monthNum) return null;
  return resolveIsoOffset(utcDate, timezone);
}

function validateBpceHeader(header: string[]): string[] {
  const missing: string[] = [];
  for (const col of BPCE_COLUMNS) {
    if (!header.includes(col)) missing.push(col);
  }
  return missing;
}

function parseRowBpce(
  row: Record<string, string>,
  lineNumber: number,
  opts: ParseOptions,
): IngestItem | ParseError {
  const description = (row['Libelle simplifie'] ?? '').trim();
  if (!description) {
    return { line: lineNumber, field: 'description', reason: 'empty description' };
  }

  const rawDate = (row['Date operation'] ?? '').trim();
  const occurredAt = parseBpceDate(rawDate, opts.timezone);
  if (occurredAt === null) {
    return { line: lineNumber, field: 'date', reason: 'invalid date format (expected DD/MM/YYYY with valid calendar date)' };
  }

  const rawDebit = (row['Debit'] ?? '').trim();
  const rawCredit = (row['Credit'] ?? '').trim();
  const hasDebit = rawDebit !== '';
  const hasCredit = rawCredit !== '';

  if (hasDebit && hasCredit) {
    return { line: lineNumber, field: 'direction', reason: 'ambiguous: both debit and credit populated' };
  }
  if (!hasDebit && !hasCredit) {
    return { line: lineNumber, field: 'direction', reason: 'no debit or credit amount' };
  }

  const rawAmount = hasDebit ? rawDebit : rawCredit;
  const cents = parseCentsFromString(rawAmount);
  if (cents === null) {
    return { line: lineNumber, field: 'amount', reason: 'invalid amount format (expected decimal with comma separator)' };
  }

  const moneyResult = Money.fromCents(Math.abs(cents), opts.currency);
  if (moneyResult.isFailure) {
    return { line: lineNumber, field: 'amount', reason: 'could not construct monetary amount' };
  }

  return {
    sourceAccount: opts.sourceAccount,
    occurredAt,
    description,
    direction: hasDebit ? 'outflow' : 'inflow',
    amount: moneyResult.value,
  };
}

export class NodeCsvParser implements CsvParser {
  parse(content: string, opts: ParseOptions): Result<ParseOutcome> {
    const cleaned = content.startsWith('\uFEFF') ? content.slice(1) : content;

    const firstLine = cleaned.split('\n')[0] ?? '';
    const semiCount = (firstLine.match(/;/g) ?? []).length;
    const commaCount = (firstLine.match(/,/g) ?? []).length;
    if (semiCount === 0 && commaCount > 5) {
      return Result.fail(
        'Expected semicolon (;) delimiter but the file appears to use commas. ' +
        'BPCE CSV files use semicolons as field separators.',
      );
    }

    let rawRows: Record<string, string>[];
    try {
      rawRows = csvParse(cleaned, {
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
        bom: false,
      }) as Record<string, string>[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Result.fail(`Failed to parse CSV: ${msg}`);
    }

    const header = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const missingCols = validateBpceHeader(header);
    if (missingCols.length > 0) {
      return Result.fail(`Missing required BPCE columns: ${missingCols.join(', ')}`);
    }

    const items: IngestItem[] = [];
    const errors: ParseError[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const result = parseRowBpce(rawRows[i], i + 2, opts);
      if ('sourceAccount' in result) items.push(result); else errors.push(result);
    }

    return Result.ok({ items, errors });
  }
}
