import type { AccountConfig } from '@core/config/app-config.js';
import type { UuidGen } from '@core/ports/uuid-gen.js';
import type { IngestItem, BuildOutcome, BuildBatchOutcome } from './types.js';
import type { AutoTagRule } from './auto-tag-rules.js';
import { DEFAULT_RULES } from './auto-tag-rules.js';
import { Result } from '@core/shared/result.js';

const defaultUuidGen: UuidGen = (): string => {
  throw new Error('TransactionBuilder: idGen not wired — provide a UuidGen in constructor');
};

export class TransactionBuilder {
  constructor(
    private readonly accounts: readonly AccountConfig[],
    private readonly rules: readonly AutoTagRule[] = DEFAULT_RULES,
    private readonly idGen: UuidGen = defaultUuidGen,
  ) {}

  build(_item: IngestItem): Result<BuildOutcome> {
    return Result.fail('TransactionBuilder.build: not implemented');
  }

  buildAll(_items: readonly IngestItem[]): Result<BuildBatchOutcome> {
    return Result.fail('TransactionBuilder.buildAll: not implemented');
  }
}
