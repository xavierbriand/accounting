import { Result } from '@core/shared/result.js';
import type { BufferBucket } from '@core/config/app-config.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';
import type { BufferState } from './buffer-state.js';

export class BufferStateService {
  constructor(
    private readonly _buffers: readonly BufferBucket[],
    private readonly _defaultCurrency: string,
    private readonly _ledger: BufferLedgerQuery,
  ) {}

  getStateAsOf(date: string): Result<readonly BufferState[]> {
    void date;
    return Result.fail('BufferStateService.getStateAsOf: not implemented');
  }
}
