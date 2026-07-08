import type { ExplainReport } from './explain-report.js';

// Walking-skeleton stub (Slice 2) — replaced by the real CFO-headline/table
// renderer in Slice 3. Exists only so explain-command.ts's static import
// resolves; runExplainCommand's Slice-2 tests never reach this path (the one
// end-to-end test exercises input validation, which returns before formatting).
export function formatExplainHuman(report: ExplainReport): string {
  return `explain report for ${report.asOf} (human formatter not yet implemented)\n`;
}
