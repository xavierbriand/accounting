import type { Money } from '@core/shared/money.js';

// The only supported bank format in Story 2.1. Add a new member when a second bank format lands.
// Callers reading CSV files via Story 2.4 must decode BPCE files using latin1 encoding:
//   fs.readFileSync(path, 'latin1')
// The parser port accepts pre-decoded strings; byte-level encoding is the caller's responsibility.
export type BankFormat = 'bpce';

export type Direction = 'inflow' | 'outflow';

export interface IngestItem {
  readonly sourceAccount: string;
  readonly occurredAt: string;
  readonly description: string;
  readonly direction: Direction;
  readonly amount: Money;
}

export interface ParseError {
  readonly line: number;
  readonly field?: 'date' | 'amount' | 'description' | 'direction' | 'row';
  readonly reason: string;
}

export interface ParseOutcome {
  readonly items: readonly IngestItem[];
  readonly errors: readonly ParseError[];
}

export interface IdempotencyOutcome {
  readonly fresh: readonly IngestItem[];
  readonly duplicates: readonly IngestItem[];
}
