import { CSV_COLUMNS } from '../csv.ts';

/**
 * Builders for synthetic exports.
 *
 * Every fixture in the suite is written here by hand. No real transaction, from
 * any real account, is ever committed to this repository — the real exports live
 * outside the working tree entirely, and the tests must be runnable by someone
 * who has never seen them.
 */

export interface FixtureRow {
  readonly postedOn: string; // DD/MM/YYYY
  readonly valueOn?: string; // DD/MM/YYYY, defaults to postedOn
  readonly amount: string; // "-21,51" or "+4500,00"
  readonly label?: string;
  readonly category?: string;
  readonly subCategory?: string;
  readonly operationType?: string;
  readonly notes?: string;
  readonly fitId?: string;
}

export function csvFixture(rows: readonly FixtureRow[]): Uint8Array {
  const lines = [CSV_COLUMNS.join(';')];
  for (const r of rows) {
    const negative = r.amount.startsWith('-');
    const cells = [
      r.postedOn,
      r.label ?? 'MERCHANT',
      r.label ?? 'MERCHANT',
      '',
      r.notes ?? '',
      r.operationType ?? 'Carte bancaire',
      r.category ?? 'Alimentation',
      r.subCategory ?? 'Supermarche',
      negative ? r.amount : '',
      negative ? '' : r.amount,
      r.postedOn,
      r.valueOn ?? r.postedOn,
      '0',
    ];
    lines.push(cells.join(';'));
  }
  return Buffer.from(lines.join('\r\n') + '\r\n', 'latin1');
}

export interface OfxOptions {
  readonly accountId?: string;
  readonly from?: string; // YYYYMMDD
  readonly to?: string; // YYYYMMDD
  readonly balance?: string; // "+264.21"
  readonly omitBalance?: boolean;
}

function ofxDate(french: string): string {
  const [d = '', m = '', y = ''] = french.split('/');
  return `${y}${m}${d}`;
}

function ofxAmount(french: string): string {
  return french.replace(',', '.');
}

export function ofxFixture(rows: readonly FixtureRow[], options: OfxOptions = {}): Uint8Array {
  const {
    accountId = '00000000001',
    from = '20250101',
    to = '20261231',
    balance = '+0.00',
    omitBalance = false,
  } = options;

  const body = rows
    .map((r, i) =>
      [
        '<STMTTRN>',
        `<TRNTYPE>${r.amount.startsWith('-') ? 'DEBIT' : 'CREDIT'}`,
        `<DTPOSTED>${ofxDate(r.postedOn)}`,
        `<TRNAMT>${ofxAmount(r.amount)}`,
        `<FITID>${r.fitId ?? `FIT${i + 1}`}`,
        `<NAME>${r.label ?? 'MERCHANT'}`,
        '</STMTTRN>',
      ].join('\r\n'),
    )
    .join('\r\n');

  const ledgerBalance = omitBalance
    ? ''
    : ['<LEDGERBAL>', `<BALAMT>${balance}`, `<DTASOF>${to}`, '</LEDGERBAL>'].join('\r\n') + '\r\n';

  const text = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    '',
    '<OFX>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<STMTRS>',
    '<CURDEF>EUR',
    '<BANKACCTFROM>',
    `<ACCTID>${accountId}</ACCTID>`,
    '</BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${from}`,
    `<DTEND>${to}`,
    body,
    '</BANKTRANLIST>',
    ledgerBalance + '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\r\n');

  return Buffer.from(text, 'latin1');
}
