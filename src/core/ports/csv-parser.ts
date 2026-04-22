import type { Result } from '@core/shared/result.js';
import type { BankFormat, ParseOutcome } from '@core/ingest/types.js';

export interface ParseOptions {
  readonly format: BankFormat;
  readonly currency: string;
  readonly timezone: string;
  readonly sourceAccount: string;
}

export interface CsvParser {
  parse(content: string, opts: ParseOptions): Result<ParseOutcome>;
}
