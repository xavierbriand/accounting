import type { Result } from '@core/shared/result.js';

export interface ExportCounts {
  readonly transactions: number;
  readonly events: number;
}

export interface WrittenBundle {
  readonly manifestHash: string;
  readonly location: string;
}

export interface DataExporter {
  counts(): Result<ExportCounts>;
  writeBundle(destinationDir: string, bundleName: string): Promise<Result<WrittenBundle>>;
}
