import type { Result } from '../shared/result.js';

export type ConfigWriterError =
  | { kind: 'mtime-race' }
  | { kind: 'conflict'; existingCategory: string; pattern: string }
  | { kind: 'io'; message: string };

export interface ConfigWriter {
  appendAutoTagRules(
    rules: ReadonlyArray<{ category: string; pattern: string }>,
  ): Promise<Result<void, ConfigWriterError>>;
}
