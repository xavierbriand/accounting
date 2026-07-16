// Global JSON contract (story-4.4b, FR20): every `--json` command wraps its stdout
// success document and stderr failure document in the same envelope shape, so a
// script or LLM agent can parse any command's result with a single rule — `ok` is
// the discriminator. Command names are hardcoded string literals at each call site
// (see docs/cli-json-contract.md) rather than threaded through CLI deps, keeping
// program.ts untouched.

export type JsonErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_FOUND'
  | 'NEEDS_REVIEW'
  | 'READ_FAILURE'
  | 'QUERY_FAILURE'
  | 'SNAPSHOT_FAILURE'
  | 'WRITE_FAILURE'
  | 'CONFIG_WRITE_FAILURE';

export interface JsonError {
  readonly code: JsonErrorCode;
  readonly message: string;
  readonly suggestedAction?: string;
  readonly details?: unknown;
}

export interface JsonSuccessEnvelope<T> {
  readonly command: string;
  readonly ok: true;
  readonly data: T;
}

export interface JsonErrorEnvelope {
  readonly command: string;
  readonly ok: false;
  readonly error: JsonError;
}

export type JsonEnvelope<T> = JsonSuccessEnvelope<T> | JsonErrorEnvelope;

export function formatJsonSuccess<T>(command: string, data: T): string {
  const envelope: JsonSuccessEnvelope<T> = { command, ok: true, data };
  return JSON.stringify(envelope) + '\n';
}

export function formatJsonError(command: string, error: JsonError): string {
  const envelope: JsonErrorEnvelope = { command, ok: false, error };
  return JSON.stringify(envelope) + '\n';
}

/**
 * Writes the error envelope to `stream` only when `json` is true — the
 * "prose always, envelope only under --json" pattern repeated at every
 * failure site across the five commands. `stream` is typed structurally
 * (not `NodeJS.WritableStream`) so callers can pass either a real stream or
 * a test double without a cast.
 */
export function writeJsonErrorIf(
  stream: { write(chunk: string): unknown },
  json: boolean,
  command: string,
  error: JsonError,
): void {
  if (json) stream.write(formatJsonError(command, error));
}
