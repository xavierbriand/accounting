// Shared test-side unwrap helpers for the global JSON envelope contract
// (story-4.4b) — one parse rule for every command's `--json` output, reused by
// unit tests, feature steps, and integration tests alike instead of each
// duplicating its own JSON.parse + field-access logic.

export interface JsonErrorShape {
  readonly code: string;
  readonly message: string;
  readonly suggestedAction?: string;
  readonly details?: unknown;
}

interface RawEnvelope {
  readonly command: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: JsonErrorShape;
}

export interface CliStreams {
  readonly stdout: string;
  readonly stderr: string;
}

function lastNonEmptyLine(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  return lines[lines.length - 1];
}

export function parseEnvelope(raw: string): RawEnvelope {
  return JSON.parse(raw.trim()) as RawEnvelope;
}

export function unwrapSuccess<T = Record<string, unknown>>(raw: string): T {
  const envelope = parseEnvelope(raw);
  if (!envelope.ok) throw new Error(`Expected ok:true envelope, got ok:false: ${raw}`);
  return envelope.data as T;
}

export function unwrapError(raw: string): JsonErrorShape {
  const envelope = parseEnvelope(raw);
  if (envelope.ok) throw new Error(`Expected ok:false envelope, got ok:true: ${raw}`);
  if (envelope.error === undefined) throw new Error(`ok:false envelope missing error field: ${raw}`);
  return envelope.error;
}

export function lastStderrLine(stderr: string): string {
  const line = lastNonEmptyLine(stderr);
  if (line === undefined) throw new Error('stderr contains no non-empty lines');
  return line;
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
    if (envelope.ok) return envelope.data as Record<string, unknown>;
  }
  const error = unwrapError(lastStderrLine(result.stderr));
  return (error.details ?? {}) as Record<string, unknown>;
}
