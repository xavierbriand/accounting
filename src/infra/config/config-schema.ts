import { z } from 'zod';
import type { ZodError } from 'zod';
import { Result } from '@core/shared/result.js';
import { Money } from '@core/shared/money.js';
import type { AppConfig, RecurringRule } from '@core/config/app-config.js';
import type { AutoTagRule } from '@core/ingest/auto-tag-rules.js';
import { validateNewCategoryName } from '@core/categories/category-name.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MSG = 'must be ISO 8601 date (YYYY-MM-DD)';

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
      .regex(ISO_DATE_REGEX, ISO_DATE_MSG),
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
  account: z.string().min(1),
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

const RecurringAmendmentRawSchema = z.object({
  validFrom: z.string().regex(ISO_DATE_REGEX, ISO_DATE_MSG),
  amount: z.number().positive(),
});

const RecurringRuleRawSchema = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1),
    cadence: z.enum(['monthly', 'quarterly', 'annual']),
    amount: z.number().positive(),
    validFrom: z.string().regex(ISO_DATE_REGEX, ISO_DATE_MSG),
    validTo: z.string().regex(ISO_DATE_REGEX, ISO_DATE_MSG).optional(),
    amendments: z.array(RecurringAmendmentRawSchema).optional().default([]),
  })
  .superRefine((rule, ctx) => {
    if (rule.validTo !== undefined && rule.validTo < rule.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validTo'],
        message: 'validTo must be >= validFrom',
      });
    }
    for (let i = 0; i < rule.amendments.length; i++) {
      if (i === 0 && rule.amendments[0].validFrom <= rule.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amendments', 0, 'validFrom'],
          message: 'first amendment validFrom must be strictly after rule validFrom',
        });
      }
      if (i > 0 && rule.amendments[i].validFrom <= rule.amendments[i - 1].validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amendments', i, 'validFrom'],
          message: 'amendments must be in strictly ascending validFrom order',
        });
      }
      if (
        rule.validTo !== undefined &&
        i === rule.amendments.length - 1 &&
        rule.amendments[i].validFrom > rule.validTo
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amendments', i, 'validFrom'],
          message: 'last amendment validFrom must be <= validTo (amendment can never apply)',
        });
      }
    }
  });

const AutoTagRuleGroupSchema = z
  .object({
    category: z.string(),
    patterns: z.array(z.string().min(1)).min(1),
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
      })
      .superRefine((buffers, ctx) => {
        for (const i of findDuplicateIndices(buffers, b => b.account)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'account'],
            message: 'duplicate account',
          });
        }
      }),
    recurring: z
      .array(RecurringRuleRawSchema)
      .optional()
      .default([])
      .superRefine((rules, ctx) => {
        for (const i of findDuplicateIndices(rules, r => r.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'name'],
            message: 'duplicate name',
          });
        }
      }),
    autoTagRules: z
      .array(AutoTagRuleGroupSchema)
      .optional()
      .default([])
      .superRefine((groups, ctx) => {
        for (let i = 0; i < groups.length; i++) {
          const categoryResult = validateNewCategoryName(groups[i].category, []);
          if (categoryResult.isFailure) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'category'],
              message: categoryResult.error,
            });
          }
          for (let j = 0; j < groups[i].patterns.length; j++) {
            try {
              new RegExp(groups[i].patterns[j], 'i');
            } catch (err) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [i, 'patterns', j],
                message: err instanceof Error ? err.message : 'invalid regex',
              });
            }
          }
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

  const buffers: Array<{ name: string; account: string; target: Money; cap?: Money }> = [];
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
    buffers.push({ name: b.name, account: b.account, target: targetResult.value, cap });
  }

  const recurring: RecurringRule[] = [];
  for (let i = 0; i < data.recurring.length; i++) {
    const r = data.recurring[i];
    const amountResult = Money.fromDecimal(r.amount, currency);
    if (amountResult.isFailure) {
      return Result.fail(`recurring.${i}.amount: ${amountResult.error}`);
    }
    const amendments: Array<{ validFrom: string; amount: Money }> = [];
    for (let j = 0; j < r.amendments.length; j++) {
      const a = r.amendments[j];
      const aAmountResult = Money.fromDecimal(a.amount, currency);
      if (aAmountResult.isFailure) {
        return Result.fail(`recurring.${i}.amendments.${j}.amount: ${aAmountResult.error}`);
      }
      amendments.push({ validFrom: a.validFrom, amount: aAmountResult.value });
    }
    recurring.push({
      name: r.name,
      category: r.category,
      cadence: r.cadence,
      amount: amountResult.value,
      validFrom: r.validFrom,
      validTo: r.validTo,
      amendments,
    });
  }

  const autoTagRules: AutoTagRule[] = [];
  for (const group of data.autoTagRules) {
    for (const pattern of group.patterns) {
      autoTagRules.push({ pattern: new RegExp(pattern, 'i'), category: group.category });
    }
  }

  return Result.ok({
    dbPath: data.dbPath,
    defaultCurrency: currency,
    timezone: data.timezone,
    splits: data.splits,
    buffers,
    accounts: data.accounts,
    recurring,
    autoTagRules,
  });
}
