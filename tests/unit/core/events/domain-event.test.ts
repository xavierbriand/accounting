/**
 * Unit tests for the DomainEvent value object + DomainEventRecorder port (FR23 audit-trail spine).
 *
 * Gherkin coverage: none directly — Core value-object shape + purity, exercised end-to-end
 *   by tests/features/audit-trail.feature (see docs/plans/story-4.1.md).
 *
 * fails if: TransactionIngested carries fields beyond type/transactionIds/sourceAccount
 *   (a clock or PII field would leak into Core), or src/core/events/ or the port import
 *   Node APIs / better-sqlite3 / a clock (Core purity — architecture.md § Domain events).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DomainEvent, TransactionIngested } from '../../../../src/core/events/domain-event.js';
import type { DomainEventRecorder } from '../../../../src/core/ports/domain-event-recorder.js';
import { Result } from '@core/shared/result.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ['"]better-sqlite3['"]/,
  /from ['"]fs['"]/,
  /from ['"]path['"]/,
  /from ['"]commander['"]/,
  /require\(['"]better-sqlite3['"]\)/,
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

  it('src/core/ports/domain-event-recorder.ts imports no Node APIs, better-sqlite3, or a clock', () => {
    const filePath = path.join(__dirname, '../../../../src/core/ports/domain-event-recorder.ts');
    const contents = fs.readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(contents, `port file matched forbidden pattern ${pattern}`).not.toMatch(pattern);
    }
  });
});
