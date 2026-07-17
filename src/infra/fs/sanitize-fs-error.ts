// Replaces absolute filesystem paths in Node error messages with a caller-chosen
// token, so fs error text never leaks filesystem layout to stderr
// (security-checklist.md § Secrets & PII). Extracted from YamlConfigWriter's
// private copy (story-4.5b) — FsDataExporter is the second call site.
export function sanitizeFsError(err: unknown, token: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/(?:\/[^\s:,'"]+|[A-Za-z]:\\[^\s:,'"]+)/g, token);
}
