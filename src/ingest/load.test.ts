import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExportsNotFoundError, loadLedger, loadLedgerData } from './load.ts';
import { reconcileSettlements } from './reconcile.ts';
import { csvFixture, ofxFixture, type FixtureRow, type OfxOptions } from './__fixtures__/build.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function folderOf(
  files: readonly { stem: string; rows: readonly FixtureRow[]; options?: OfxOptions }[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sluice-'));
  created.push(dir);
  for (const { stem, rows, options } of files) {
    await writeFile(join(dir, `${stem}.ofx`), ofxFixture(rows, options));
    await writeFile(join(dir, `${stem}.csv`), csvFixture(rows));
  }
  return dir;
}

const ROWS: FixtureRow[] = [
  { postedOn: '05/01/2025', amount: '-40,00' },
  { postedOn: '06/01/2025', amount: '-60,00' },
];

describe('loadLedgerData', () => {
  it('reads a folder of exports into one ledger', async () => {
    const dir = await folderOf([
      { stem: '00000000001_01012025_31012025', rows: ROWS, options: { balance: '+500.00' } },
    ]);
    const ledger = await loadLedgerData(dir);
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.sources).toHaveLength(1);
  });

  it('folds overlapping exports of one account into a single source', async () => {
    // Transaction de-duplication alone does not make this safe: a balance is not
    // a row, so one source entry per file counts the same cash twice.
    const dir = await folderOf([
      {
        stem: '00000000001_01012025_31012025',
        rows: ROWS,
        options: { from: '20250101', to: '20250131', balance: '+500.00' },
      },
      {
        stem: '00000000001_01012025_28022025',
        rows: ROWS,
        options: { from: '20250101', to: '20250228', balance: '+500.00' },
      },
    ]);

    const ledger = await loadLedgerData(dir);
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.sources).toHaveLength(1);
    expect(reconcileSettlements(ledger).accountBalance).toBe(50000);
  });

  it('takes the newest balance and the widest window across exports', async () => {
    const dir = await folderOf([
      // Disjoint ranges of one account, so the rows carry distinct bank ids as
      // they would in a real pair of exports.
      {
        stem: '00000000001_01032025_31032025',
        rows: [{ postedOn: '05/03/2025', amount: '-10,00', fitId: 'MAR-1' }],
        options: { from: '20250301', to: '20250331', balance: '+900.00' },
      },
      {
        stem: '00000000001_01012025_31012025',
        rows: [{ postedOn: '05/01/2025', amount: '-40,00', fitId: 'JAN-1' }],
        options: { from: '20250101', to: '20250131', balance: '+500.00' },
      },
    ]);

    const [source] = (await loadLedgerData(dir)).sources;
    expect(source?.from).toBe('2025-01-01');
    expect(source?.to).toBe('2025-03-31');
    // A balance describes an instant, so the older one is stale, not additional.
    expect(source?.balance).toBe(90000);
    expect(source?.balanceAsOf).toBe('2025-03-31');
    expect(source?.files).toHaveLength(2);
  });

  it('widens the window from the middle export, not just the ends, and sorts before picking the newest', async () => {
    // Filenames are chosen so their OWN alphabetical order (which
    // loadLedgerData already sorts by, upstream of this) does NOT match the
    // balanceAsOf order these exports actually carry — otherwise the
    // upstream sort would silently do consolidate()'s job for it, and a
    // broken or missing sort inside consolidate() would go unnoticed. By
    // filename, B < C < A; by balanceAsOf, A < B < C.
    //
    // The widest from/to both come from the MIDDLE export by balanceAsOf
    // (B), not the first or the last — a reduce that always kept its first
    // argument would report A's from instead of B's; one that always kept
    // its second would report C's to instead of B's.
    const dir = await folderOf([
      {
        stem: '00000000001_09092025_09092025',
        rows: [{ postedOn: '05/01/2025', amount: '-40,00', fitId: 'A-1' }],
        options: { from: '20250105', to: '20250131', balanceAsOf: '20250131', balance: '+500.00' },
      },
      {
        stem: '00000000001_01012025_01012025',
        rows: [{ postedOn: '05/02/2025', amount: '-60,00', fitId: 'B-1' }],
        options: { from: '20241201', to: '20250630', balanceAsOf: '20250228', balance: '+600.00' },
      },
      {
        stem: '00000000001_05052025_05052025',
        rows: [{ postedOn: '05/03/2025', amount: '-10,00', fitId: 'C-1' }],
        options: { from: '20250301', to: '20250331', balanceAsOf: '20250331', balance: '+700.00' },
      },
    ]);

    const [source] = (await loadLedgerData(dir)).sources;
    expect(source?.from).toBe('2024-12-01');
    expect(source?.to).toBe('2025-06-30');
    expect(source?.balance).toBe(70000);
    expect(source?.balanceAsOf).toBe('2025-03-31');
    // Ordered by balanceAsOf, not by declaration or filename order — the
    // same guarantee the values above depend on, made directly observable.
    expect(source?.files).toEqual([
      '00000000001_09092025_09092025.ofx',
      '00000000001_01012025_01012025.ofx',
      '00000000001_05052025_05052025.ofx',
    ]);
  });

  it('counts only the rows that survived the merge', async () => {
    const dir = await folderOf([
      { stem: '00000000001_01012025_31012025', rows: ROWS, options: { balance: '+500.00' } },
      { stem: '00000000001_01012025_28022025', rows: ROWS, options: { balance: '+500.00' } },
    ]);
    const [source] = (await loadLedgerData(dir)).sources;
    expect(source?.count).toBe(2);
  });

  it('keeps separate accounts separate', async () => {
    const dir = await folderOf([
      { stem: '00000000001_01012025_31012025', rows: ROWS, options: { balance: '+500.00' } },
      { stem: 'carte_1111_01012025_31012025', rows: ROWS, options: { balance: '+0.00' } },
    ]);
    const ledger = await loadLedgerData(dir);
    expect(ledger.sources).toHaveLength(2);
    expect(ledger.transactions).toHaveLength(4);
  });

  it('loads a folder containing a card with no activity in the window', async () => {
    // The realistic case: a card replaced last year, re-exported over a window
    // that starts after it was retired. One idle card must not take the ledger
    // down with it.
    const dir = await folderOf([
      { stem: '00000000001_01012026_31012026', rows: ROWS, options: { balance: '+500.00' } },
      { stem: 'carte_1111_01012026_31012026', rows: [], options: { balance: '+0.00' } },
    ]);

    const ledger = await loadLedgerData(dir);
    expect(ledger.sources).toHaveLength(2);
    expect(ledger.transactions).toHaveLength(2);
    expect(ledger.sources.find((s) => s.source.kind === 'card')?.count).toBe(0);
  });

  it('refuses an ofx with no csv beside it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sluice-'));
    created.push(dir);
    await writeFile(join(dir, '00000000001_01012025_31012025.ofx'), ofxFixture(ROWS));
    await expect(loadLedgerData(dir)).rejects.toThrow(/has no matching/);
  });

  it('refuses a folder with no exports in it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sluice-'));
    created.push(dir);
    await expect(loadLedgerData(dir)).rejects.toThrow(ExportsNotFoundError);
  });

  it('says what to do when the folder does not exist', async () => {
    await expect(loadLedgerData(join(tmpdir(), 'sluice-does-not-exist'))).rejects.toThrow(
      /sluice\.toml/,
    );
  });

  it('keeps the original filesystem error as the cause', async () => {
    // The friendly message says where to point sluice.toml; cause is what a
    // debugger reaches for when "cannot read the folder" isn't the whole
    // story — a permissions error looks identical from the message alone.
    try {
      await loadLedgerData(join(tmpdir(), 'sluice-does-not-exist'));
      expect.unreachable();
    } catch (error) {
      expect((error as ExportsNotFoundError).cause).toBeInstanceOf(Error);
      expect(((error as ExportsNotFoundError).cause as NodeJS.ErrnoException).code).toBe('ENOENT');
    }
  });
});

describe('loadLedger', () => {
  it('reconciles as part of loading, not as a step a caller can forget', async () => {
    const dir = await folderOf([
      { stem: '00000000001_01012025_31012025', rows: ROWS, options: { balance: '+500.00' } },
    ]);
    const ledger = await loadLedger(dir);
    expect(ledger.reconciliation).toBeDefined();
    expect(ledger.reconciliation.accountBalance).toBe(50000);
  });

  it('reports a mismatch rather than refusing to load', async () => {
    // A mismatch is what section 03 exists to show. Throwing here would make the
    // tool useless at exactly the moment it has something worth saying.
    const dir = await folderOf([
      {
        stem: '00000000001_01012025_31122025',
        rows: [
          {
            postedOn: '04/08/2025',
            amount: '-180,00',
            label: 'DEBIT DIFFERE N° ...9999',
            operationType: 'Carte bancaire',
            category: 'Transaction exclue',
            subCategory: 'Transaction differee',
          },
        ],
        options: { from: '20250101', to: '20251231', balance: '+500.00' },
      },
    ]);

    const ledger = await loadLedger(dir);
    expect(ledger.reconciliation.mismatched).toBe(1);
    expect(ledger.transactions).toHaveLength(1);
  });
});
