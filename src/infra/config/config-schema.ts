import { z } from 'zod';
import type { ZodError } from 'zod';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { AppConfig } from '@core/config/app-config.js';

function findDuplicateIndices<T>(items: readonly T[], keyFn: (t: T) => string): number[] {
  const seen = new Map<string, number>();
  const dupes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const key = keyFn(items[i]);
    if (seen.has(key)) {
      dupes.push(i);
    } else {
      seen.set(key, i);
    }
  }
  return dupes;
}

const SplitRuleSchema = z.object({
  partner: z.string().min(1),
  ratio: z.number().min(0).max(1),
});

const SplitWindowSchema = z
  .object({
    validFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be ISO 8601 date (YYYY-MM-DD)'),
    // min(2): enforces the couples-app product constraint — at least two partners.
    rules: z.array(SplitRuleSchema).min(2),
  })
  .strict()
  .superRefine((win, ctx) => {
    const sum = win.rules.reduce((a, r) => a + r.ratio, 0);
    if (Math.abs(sum - 1.0) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rules'],
        message: `ratios must sum to 1.0 (got ${sum.toFixed(4)})`,
      });
    }
    for (const i of findDuplicateIndices(win.rules, r => r.partner)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rules', i, 'partner'],
        message: 'duplicate partner',
      });
    }
  });

const BufferBucketRawSchema = z.object({
  name: z.string().min(1),
  target: z.number().nonnegative(),
  cap: z.number().nonnegative().optional(),
});

const AccountConfigSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['bank', 'card']),
    filenamePrefix: z.string().min(1),
    cardSuffix: z.string().regex(/^\d{4}$/).optional(),
  })
  .strict()
  .superRefine((acct, ctx) => {
    if (acct.type === 'card' && acct.cardSuffix === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cardSuffix'],
        message: 'cardSuffix is required for card accounts',
      });
    }
    if (acct.type === 'bank' && acct.cardSuffix !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cardSuffix'],
        message: 'cardSuffix must not be set on bank accounts',
      });
    }
  });

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
        for (const i of findDuplicateIndices(accts, a => a.id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: 'duplicate id' });
        }
        for (const i of findDuplicateIndices(accts, a => a.filenamePrefix)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'filenamePrefix'], message: 'duplicate prefix' });
        }
      }),
    splits: z
      .array(SplitWindowSchema)
      .min(1)
      .superRefine((wins, ctx) => {
        for (let i = 1; i < wins.length; i++) {
          if (wins[i].validFrom <= wins[i - 1].validFrom) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'validFrom'],
              message: `must be strictly after the previous window's validFrom`,
            });
          }
        }
        // Partner roster must be identical across all windows (set equality,
        // order-insensitive). Path-cited, partner names NOT echoed (PII).
        const ref = new Set(wins[0].rules.map(r => r.partner));
        for (let i = 1; i < wins.length; i++) {
          const here = new Set(wins[i].rules.map(r => r.partner));
          if (here.size !== ref.size || [...here].some(p => !ref.has(p))) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'rules'],
              message: `partner roster differs from window 0`,
            });
          }
        }
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
        for (const i of findDuplicateIndices(buffers, b => b.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'name'],
            message: 'duplicate name',
          });
        }
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
