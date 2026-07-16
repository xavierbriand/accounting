/**
 * Unit tests for the global JSON envelope helper (story-4.4b, Slice 1).
 *
 * fails if: formatJsonSuccess/formatJsonError omit a required envelope field,
 *   pretty-print instead of emitting a single compact line, or leak an
 *   `undefined` key into the serialized document (optional error fields must
 *   be entirely absent when not supplied, not present-with-value-undefined).
 */
import { describe, it, expect } from 'vitest';
import { formatJsonSuccess, formatJsonError } from '../../../../src/cli/utils/json-envelope.js';

describe('formatJsonSuccess', () => {
  it('wraps data in a {command, ok: true, data} envelope as a single compact line', () => {
    const out = formatJsonSuccess('status', { asOf: '2026-04-29' });

    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().split('\n')).toHaveLength(1);

    const parsed = JSON.parse(out) as { command: string; ok: boolean; data: { asOf: string } };
    expect(parsed).toEqual({ command: 'status', ok: true, data: { asOf: '2026-04-29' } });
  });

  it('does not indent — compact JSON.stringify, no pretty-printing', () => {
    const out = formatJsonSuccess('status', { a: 1, b: 2 });

    expect(out).not.toContain('\n  ');
    expect(out.trim()).toBe(JSON.stringify({ command: 'status', ok: true, data: { a: 1, b: 2 } }));
  });
});

describe('formatJsonError', () => {
  it('wraps an error in a {command, ok: false, error} envelope', () => {
    const out = formatJsonError('correct', { code: 'NOT_FOUND', message: 'no transaction found with id "tx-x"' });

    const parsed = JSON.parse(out) as { command: string; ok: boolean; error: { code: string; message: string } };
    expect(parsed).toEqual({
      command: 'correct',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no transaction found with id "tx-x"' },
    });
  });

  it('includes suggestedAction and details when provided', () => {
    const out = formatJsonError('ingest', {
      code: 'NEEDS_REVIEW',
      message: '2 item(s) need manual review.',
      suggestedAction: 'Run without --non-interactive to review them.',
      details: { lowConfidence: ['tx-1', 'tx-2'] },
    });

    const parsed = JSON.parse(out) as { error: { suggestedAction: string; details: { lowConfidence: string[] } } };
    expect(parsed.error.suggestedAction).toBe('Run without --non-interactive to review them.');
    expect(parsed.error.details.lowConfidence).toEqual(['tx-1', 'tx-2']);
  });

  it('omits suggestedAction and details entirely when not supplied (no undefined-key pollution)', () => {
    const out = formatJsonError('status', { code: 'QUERY_FAILURE', message: 'DB unreachable' });

    const parsed = JSON.parse(out) as Record<string, unknown>;
    const error = parsed['error'] as Record<string, unknown>;
    expect(Object.keys(error)).toEqual(['code', 'message']);
  });

  it('the single compact line contains no embedded newline before the trailing one', () => {
    const out = formatJsonError('ingest', {
      code: 'WRITE_FAILURE',
      message: 'Commit failed',
      details: { nested: { a: 1 } },
    });

    expect(out.slice(0, -1)).not.toContain('\n');
  });
});
