/**
 * Which file a row came from is part of its identity.
 *
 * This is not a stylistic choice. The bank files every card statement under one
 * shared account id and restarts row ids per statement, so two different cards
 * really do produce the same (account id, row id) pair for unrelated purchases.
 * Nothing *inside* a card export distinguishes it from another card's. The
 * discriminator that does exist is the filename, so the filename is parsed —
 * carefully, and with the volatile part (the exported date range) stripped, so
 * that re-exporting a different range does not mint a new source and duplicate
 * every row.
 */

export type SourceKind = 'account' | 'card';

export interface Source {
  /** Stable across exports of different date ranges. */
  readonly id: string;
  readonly kind: SourceKind;
  /** Last four digits, for a card. This is what the account's settlement row cites. */
  readonly cardNumber?: string;
  readonly filename: string;
}

export class SourceNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceNameError';
  }
}

/** `<stem>_DDMMYYYY_DDMMYYYY.ext` — the two date stamps are the volatile part. */
const EXPORT_NAME = /^(.+?)_\d{8}_\d{8}\.(ofx|csv)$/i;
const CARD_STEM = /^carte_(\d{4})$/i;

export function sourceOf(filename: string): Source {
  const base = filename.split('/').at(-1) ?? filename;
  const m = EXPORT_NAME.exec(base);
  if (!m) {
    throw new SourceNameError(
      `Cannot tell which account "${base}" belongs to. sluice expects the bank's ` +
        `own export naming, "<account>_DDMMYYYY_DDMMYYYY.ofx" — the date range is ` +
        `ignored, the part before it identifies the account or card.`,
    );
  }

  const stem = m[1] ?? '';
  const card = CARD_STEM.exec(stem);
  if (card) {
    return { id: stem.toLowerCase(), kind: 'card', cardNumber: card[1] ?? '', filename: base };
  }
  return { id: stem.toLowerCase(), kind: 'account', filename: base };
}

/** The `.csv` sitting beside a `.ofx` for the same source. */
export function csvNameFor(ofxFilename: string): string {
  return ofxFilename.replace(/\.ofx$/i, '.csv');
}
