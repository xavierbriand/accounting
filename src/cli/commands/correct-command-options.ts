import { z } from 'zod';
import { Result } from '@core/shared/result.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_AMOUNT_REGEX = /^[+-]?\d+(\.\d{1,2})?$/;

export interface CorrectCommandOptions {
  readonly transactionId: string;
  readonly amount?: string;
  readonly category?: string;
  readonly date?: string;
  readonly description?: string;
  readonly reason: string;
  readonly json: boolean;
}

export interface ParsedCorrectOptions {
  readonly transactionId: string;
  readonly amountCents?: number;
  readonly category?: string;
  readonly date?: string;
  readonly description?: string;
  readonly reason: string;
  readonly json: boolean;
}

const RawCorrectOptionsSchema = z
  .object({
    transactionId: z.string().min(1),
    amount: z.string().optional(),
    category: z.string().min(1, '--category must not be empty').optional(),
    date: z.string().regex(ISO_DATE_REGEX, '--date must be ISO 8601 date (YYYY-MM-DD)').optional(),
    description: z.string().optional(),
    reason: z.string().min(1, '--reason must not be empty'),
    json: z.boolean(),
  })
  .strict();

/**
 * String-to-integer-cents conversion for a period decimal separator (CLI
 * locale), mirroring node-csv-parser.ts's comma-separated parseCentsFromString.
 * Never constructs a float — security-checklist.md bans Number.parseFloat for
 * money; Result.fail on invalid shape stands on its own (this function owns
 * amount validation — no redundant zod regex ahead of it).
 */
function parseCentsFromDecimalString(raw: string): number | null {
  const trimmed = raw.trim();
  if (!DECIMAL_AMOUNT_REGEX.test(trimmed)) return null;
  const withoutSign = trimmed.replace(/^[+-]/, '');
  const dotIdx = withoutSign.indexOf('.');
  if (dotIdx === -1) {
    return parseInt(withoutSign, 10) * 100;
  }
  const whole = withoutSign.slice(0, dotIdx);
  const frac = withoutSign.slice(dotIdx + 1).padEnd(2, '0');
  return parseInt(whole, 10) * 100 + parseInt(frac, 10);
}

function formatZodError(err: z.ZodError): string {
  const issues = err.issues.map((issue) => {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
    return `${pathStr}${issue.message}`;
  });
  return issues.join('; ');
}

export function parseCorrectOptions(raw: CorrectCommandOptions): Result<ParsedCorrectOptions> {
  const parsed = RawCorrectOptionsSchema.safeParse(raw);
  if (!parsed.success) {
    return Result.fail(formatZodError(parsed.error));
  }
  const data = parsed.data;

  let amountCents: number | undefined;
  if (data.amount !== undefined) {
    const cents = parseCentsFromDecimalString(data.amount);
    if (cents === null) {
      return Result.fail(`--amount: invalid decimal amount "${data.amount}"`);
    }
    amountCents = cents;
  }

  return Result.ok({
    transactionId: data.transactionId,
    amountCents,
    category: data.category,
    date: data.date,
    description: data.description,
    reason: data.reason,
    json: data.json,
  });
}
