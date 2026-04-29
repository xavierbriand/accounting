import { Result } from '@core/shared/result.js';
import type { BufferBucket } from '@core/config/app-config.js';
import type { BufferLedgerQuery } from '@core/ports/buffer-ledger-query.js';
import type { Money } from '@core/shared/money.js';
import type { BufferState, BufferStatus } from './buffer-state.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function deriveStatus(
  balance: Money,
  target: Money,
  cap: Money | undefined,
): Result<BufferStatus> {
  const ltTargetResult = balance.lessThan(target);
  if (ltTargetResult.isFailure) return Result.fail(ltTargetResult.error);
  if (ltTargetResult.value) return Result.ok('below');

  if (cap === undefined) return Result.ok('on-target');

  const lteCapResult = balance.lessThanOrEqual(cap);
  if (lteCapResult.isFailure) return Result.fail(lteCapResult.error);
  return Result.ok(lteCapResult.value ? 'on-target' : 'above-cap');
}

export class BufferStateService {
  constructor(
    private readonly buffers: readonly BufferBucket[],
    private readonly defaultCurrency: string,
    private readonly ledger: BufferLedgerQuery,
  ) {}

  getStateAsOf(date: string): Result<readonly BufferState[]> {
    if (!ISO_DATE.test(date)) {
      return Result.fail(`date must be ISO 8601 date (YYYY-MM-DD): got "${date}"`);
    }

    const stateResults: Array<Result<BufferState>> = this.buffers.map(bucket => {
      const balanceResult = this.ledger.sumEntriesByAccount(
        bucket.account,
        this.defaultCurrency,
        date,
      );
      if (balanceResult.isFailure) return Result.fail(balanceResult.error);
      const balance = balanceResult.value;

      const statusResult = deriveStatus(balance, bucket.target, bucket.cap);
      if (statusResult.isFailure) return Result.fail(statusResult.error);

      return Result.ok<BufferState>({
        name: bucket.name,
        balance,
        target: bucket.target,
        cap: bucket.cap,
        status: statusResult.value,
        targetDate: bucket.targetDate,
      });
    });

    return Result.all(stateResults);
  }
}
