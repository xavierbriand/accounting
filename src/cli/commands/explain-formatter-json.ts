import type { ExplainReport } from './explain-report.js';

// Walking-skeleton stub (Slice 2) — replaced by the real documented JSON shape
// in Slice 4. Exists only so explain-command.ts's static import resolves;
// runExplainCommand's Slice-2 tests never reach this path (the one end-to-end
// test exercises input validation, which returns before formatting).
export function formatExplainJson(report: ExplainReport): string {
  return JSON.stringify({ asOf: report.asOf }) + '\n';
}
