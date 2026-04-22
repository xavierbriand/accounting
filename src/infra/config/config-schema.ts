import { z } from 'zod';
import type { ZodError } from 'zod';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { AppConfig } from '@core/config/app-config.js';

const SplitRuleSchema = z.object({
  partner: z.string().min(1),
  ratio: z.number().min(0).max(1),
});

const BufferBucketRawSchema = z.object({
  name: z.string().min(1),
  target: z.number().nonnegative(),
  cap: z.number().nonnegative().optional(),
});

const AccountConfigSchema = z
  .object({
    id: z.string().min(1),
    filenamePrefix: z.string().min(1),
  })
  .strict();

const RawConfigSchema = z
  .object({
    dbPath: z.string().min(1),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code'),
    timezone: z
      .string()
      .min(1)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'must be a valid IANA timezone (e.g. Europe/Paris, UTC)'),
    accounts: z
      .array(AccountConfigSchema)
      .min(1)
      .superRefine((accts, ctx) => {
        const ids = accts.map(a => a.id);
        const prefixes = accts.map(a => a.filenamePrefix);
        ids.forEach((id, i) => {
          if (ids.indexOf(id) !== i) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: 'duplicate id' });
          }
        });
        prefixes.forEach((p, i) => {
          if (prefixes.indexOf(p) !== i) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'filenamePrefix'], message: 'duplicate prefix' });
          }
        });
      }),
    splits: z
      .array(SplitRuleSchema)
      .min(1)
      .superRefine((splits, ctx) => {
        const sum = splits.reduce((acc, s) => acc + s.ratio, 0);
        if (Math.abs(sum - 1.0) > 1e-9) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `ratios must sum to 1.0 (got ${sum.toFixed(4)})`,
          });
        }
        const names = splits.map(s => s.partner);
        names.forEach((name, i) => {
          if (names.indexOf(name) !== i) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'partner'],
              message: 'duplicate name',
            });
          }
        });
      }),
    buffers: z
      .array(BufferBucketRawSchema)
      .superRefine((buffers, ctx) => {
        buffers.forEach((b, i) => {
          if (b.cap !== undefined && b.cap < b.target) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'cap'],
              message: 'cap must be >= target',
            });
          }
        });
      })
      .superRefine((buffers, ctx) => {
        const names = buffers.map(b => b.name);
        names.forEach((name, i) => {
          if (names.indexOf(name) !== i) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'name'],
              message: 'duplicate name',
            });
          }
        });
      }),
  })
  .strict();

export function formatZodError(err: ZodError): string {
  const issues = err.issues.map(issue => {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
    return `  - ${pathStr}${issue.message}`;
  });
  return `Invalid accounting config:\n${issues.join('\n')}`;
}

export function parseRawConfig(raw: unknown): Result<AppConfig> {
  const parsed = RawConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return Result.fail(formatZodError(parsed.error));
  }

  const data = parsed.data;
  const currency = data.defaultCurrency;

  const buffers: Array<{ name: string; target: Money; cap?: Money }> = [];
  for (let i = 0; i < data.buffers.length; i++) {
    const b = data.buffers[i];
    const targetResult = Money.fromDecimal(b.target, currency);
    if (targetResult.isFailure) {
      return Result.fail(`buffers.${i}.target: ${targetResult.error}`);
    }
    let cap: Money | undefined;
    if (b.cap !== undefined) {
      const capResult = Money.fromDecimal(b.cap, currency);
      if (capResult.isFailure) {
        return Result.fail(`buffers.${i}.cap: ${capResult.error}`);
      }
      cap = capResult.value;
    }
    buffers.push({ name: b.name, target: targetResult.value, cap });
  }

  return Result.ok({
    dbPath: data.dbPath,
    defaultCurrency: currency,
    timezone: data.timezone,
    splits: data.splits,
    buffers,
    accounts: data.accounts,
  });
}
