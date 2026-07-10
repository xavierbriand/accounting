// Shared test-side unwrap helpers for the global JSON envelope contract
// (story-4.4b) — one parse rule for every command's `--json` output, reused by
// unit tests, feature steps, and integration tests alike instead of each
// duplicating its own JSON.parse + field-access logic.
//
// Reuses the production envelope types directly (src/cli/utils/json-envelope.ts)
// rather than a hand-duplicated shape, so the test-side parse target can never
// drift from what formatJsonSuccess/formatJsonError actually emit.
import type { JsonEnvelope, JsonError } from '../../src/cli/utils/json-envelope.js';

export interface CliStreams {
  readonly stdout: string;
  readonly stderr: string;
}

function lastNonEmptyLine(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return lines[lines.length - 1];
}

export function parseEnvelope<T = Record<string, unknown>>(raw: string): JsonEnvelope<T> {
  return JSON.parse(raw.trim()) as JsonEnvelope<T>;
}

export function unwrapSuccess<T = Record<string, unknown>>(raw: string): T {
  const envelope = parseEnvelope<T>(raw);
  if (!envelope.ok) throw new Error(`Expected ok:true envelope, got ok:false: ${raw}`);
  return envelope.data;
}

export function lastStderrLine(stderr: string): string {
  const line = lastNonEmptyLine(stderr);
  if (line === undefined) throw new Error('stderr contains no non-empty lines');
  return line;
}

/**
 * Unwraps the error envelope from stderr. Accepts either the full captured
 * stderr text (prose progress/warning lines may precede the envelope — the
 * contract's "final line" rule, see docs/cli-json-contract.md) or an
 * already-isolated single JSON line; extracts the last non-empty line either way.
 */
export function unwrapError(rawStderr: string): JsonError {
  const raw = lastStderrLine(rawStderr);
  let envelope: JsonEnvelope<unknown>;
  try {
    envelope = parseEnvelope<unknown>(raw);
  } catch {
    // A bare JSON.parse SyntaxError here ("Unexpected token...") gives no clue which
    // stderr line broke the contract — naming the offending line makes a regression
    // (e.g. prose accidentally appended after the envelope) diagnosable at a glance.
    throw new Error(`expected the final stderr line to be a JSON error envelope, got: ${raw}`);
  }
  if (envelope.ok) throw new Error(`Expected ok:false envelope, got ok:true: ${raw}`);
  return envelope.error;
}

/**
 * Extracts the JSON payload substance regardless of whether the command
 * succeeded (data on stdout) or hit a needs-review/failure path (error.details
 * on the final stderr line) — for steps that assert on payload fields without
 * caring which stream carried them (e.g. ingest.feature's dotted-path "the
 * JSON payload's X" steps, which run against both success and NEEDS_REVIEW
 * fixtures).
 */
export function payloadFrom(result: CliStreams): Record<string, unknown> {
  const stdoutTrimmed = result.stdout.trim();
  if (stdoutTrimmed.length > 0) {
    const envelope = parseEnvelope(stdoutTrimmed);
    if (envelope.ok) return envelope.data;
  }
  const error = unwrapError(result.stderr);
  return (error.details ?? {}) as Record<string, unknown>;
}
