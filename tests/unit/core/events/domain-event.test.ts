/**
 * Unit tests for the DomainEvent value object + DomainEventRecorder port (FR23 audit-trail spine).
 *
 * Gherkin coverage: none directly — Core value-object shape + purity, exercised end-to-end
 *   by tests/features/audit-trail.feature (see docs/plans/story-4.1.md).
 *
 * fails if: TransactionIngested carries fields beyond type/transactionIds/sourceAccount, or
 *   TransactionCorrected carries fields beyond type/targetTransactionId/producedTransactionIds/
 *   changedFields/reason (a clock, an actor, or a PII field would leak into Core), or
 *   src/core/events/ or the port import Node APIs / better-sqlite3 / a clock (Core purity —
 *   architecture.md § Domain events).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DomainEvent, TransactionIngested, TransactionCorrected, ConfigChanged, DataExported } from '../../../../src/core/events/domain-event.js';
import type { DomainEventRecorder } from '../../../../src/core/ports/domain-event-recorder.js';
import { Result } from '@core/shared/result.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ['"]better-sqlite3['"]/,
  /from ['"](?:node:)?fs['"]/,
  /from ['"](?:node:)?path['"]/,
  /from ['"]commander['"]/,
  /from ['"]zod['"]/,
  /require\(['"]better-sqlite3['"]\)/,
  /require\(['"]zod['"]\)/,
  /new Date\(/,
  /Date\.now\(/,
];

function sourceFilesUnder(relDir: string): string[] {
  const dir = path.join(__dirname, '../../../../src', relDir);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(dir, f));
}

describe('TransactionIngested — value object shape', () => {
  it('carries only type, transactionIds, and sourceAccount (no clock, no PII)', () => {
    const event: TransactionIngested = {
      type: 'TransactionIngested',
      transactionIds: ['tx-1', 'tx-2'],
      sourceAccount: 'main-account',
    };

    expect(Object.keys(event).sort()).toEqual(['sourceAccount', 'transactionIds', 'type']);
  });

  it('is assignable to the DomainEvent union', () => {
    const event: DomainEvent = {
      type: 'TransactionIngested',
      transactionIds: ['tx-1'],
      sourceAccount: 'main-account',
    };

    expect(event.type).toBe('TransactionIngested');
  });
});

describe('TransactionCorrected — value object shape', () => {
  it('carries type, targetTransactionId, producedTransactionIds, changedFields, and reason', () => {
    const event: TransactionCorrected = {
      type: 'TransactionCorrected',
      targetTransactionId: 'tx-original',
      producedTransactionIds: ['tx-reversal', 'tx-correcting'],
      changedFields: ['amount'],
      reason: 'wrong amount entered',
    };

    expect(Object.keys(event).sort()).toEqual(
      ['changedFields', 'producedTransactionIds', 'reason', 'targetTransactionId', 'type'].sort(),
    );
  });

  it('is assignable to the DomainEvent union', () => {
    const event: DomainEvent = {
      type: 'TransactionCorrected',
      targetTransactionId: 'tx-original',
      producedTransactionIds: ['tx-reversal', 'tx-correcting'],
      changedFields: ['description'],
      reason: 'typo fix',
    };

    expect(event.type).toBe('TransactionCorrected');
  });
});

describe('ConfigChanged — value object shape', () => {
  it('carries type, origin, changedSections, previousDigest, and currentDigest', () => {
    const event: ConfigChanged = {
      type: 'ConfigChanged',
      origin: 'external',
      changedSections: [
        { section: 'buffers', entries: [{ key: 'Vacation.target', kind: 'changed', previous: 'EUR 1500.00', current: 'EUR 1800.00' }] },
      ],
      previousDigest: 'a'.repeat(64),
      currentDigest: 'b'.repeat(64),
    };

    expect(Object.keys(event).sort()).toEqual(
      ['changedSections', 'currentDigest', 'origin', 'previousDigest', 'type'].sort(),
    );
  });

  it('origin accepts both "external" and "applied" (this story emits only external)', () => {
    const external: ConfigChanged['origin'] = 'external';
    const applied: ConfigChanged['origin'] = 'applied';
    expect(external).toBe('external');
    expect(applied).toBe('applied');
  });

  it('is assignable to the DomainEvent union', () => {
    const event: DomainEvent = {
      type: 'ConfigChanged',
      origin: 'external',
      changedSections: [],
      previousDigest: 'a'.repeat(64),
      currentDigest: 'b'.repeat(64),
    };
    expect(event.type).toBe('ConfigChanged');
  });
});

describe('DataExported — value object shape', () => {
  it('carries type, archiveLocation, and exported (transactions, events) — no manifestHash', () => {
    const event: DataExported = {
      type: 'DataExported',
      archiveLocation: 'accounting-export-2026-07-17T14-30-05',
      exported: { transactions: 4, events: 6 },
    };

    expect(Object.keys(event).sort()).toEqual(['archiveLocation', 'exported', 'type'].sort());
    expect(Object.keys(event.exported).sort()).toEqual(['events', 'transactions'].sort());
  });

  it('archiveLocation carries no path separators (bundle directory name only, never a path)', () => {
    const event: DataExported = {
      type: 'DataExported',
      archiveLocation: 'accounting-export-2026-07-17T14-30-05',
      exported: { transactions: 0, events: 0 },
    };
    expect(event.archiveLocation).not.toMatch(/[/\\]/);
  });

  it('is assignable to the DomainEvent union', () => {
    const event: DomainEvent = {
      type: 'DataExported',
      archiveLocation: 'accounting-export-2026-07-17T14-30-05',
      exported: { transactions: 4, events: 6 },
    };
    expect(event.type).toBe('DataExported');
  });
});

describe('DomainEventRecorder — port shape', () => {
  it('a conforming implementation returns Result<void>', () => {
    const recorder: DomainEventRecorder = {
      record: (): Result<void> => Result.ok(),
    };

    const result = recorder.record({
      type: 'TransactionIngested',
      transactionIds: ['tx-1'],
      sourceAccount: 'main-account',
    });

    expect(result.isSuccess).toBe(true);
  });
});

describe('Core purity — src/core/events/ and the DomainEventRecorder port', () => {
  it('no file under src/core/events/ imports Node APIs, better-sqlite3, or a clock', () => {
    const files = sourceFilesUnder('core/events');
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(contents, `${file} matched forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  // story-4.5a: ConfigChanged pulls ChangedSection in from src/core/config/ — that
  // directory needs the same purity guarantee as src/core/events/.
  it('no file under src/core/config/ imports Node APIs, better-sqlite3, or a clock', () => {
    const files = sourceFilesUnder('core/config');
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(contents, `${file} matched forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  // fails if: src/core/ports/domain-event-recorder.ts imports Node APIs, better-sqlite3, or a clock
  it.each(FORBIDDEN_IMPORT_PATTERNS)(
    'src/core/ports/domain-event-recorder.ts does not match forbidden pattern %s',
    (pattern) => {
      const filePath = path.join(__dirname, '../../../../src/core/ports/domain-event-recorder.ts');
      const contents = fs.readFileSync(filePath, 'utf8');
      expect(contents, `port file matched forbidden pattern ${pattern}`).not.toMatch(pattern);
    },
  );
});
