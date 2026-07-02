import { z } from 'zod';

export type UsageRecord = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  sessionId: string;
  cwd: string;
  timestamp: string;
};

export type ModelTotals = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export type PriceMap = {
  asOf: string;
  models: Record<
    string,
    {
      inputPerMillion: number;
      outputPerMillion: number;
      cacheReadPerMillion: number;
      cacheWritePerMillion: number;
    }
  >;
};

export type ParseUsageResult = {
  records: UsageRecord[];
  skipped: number;
};

export type AttributionWindow = {
  windowStart: string;
  windowEnd: string;
};

export type AttributionResult = {
  attributed: UsageRecord[];
  unattributed: UsageRecord[];
};

const AssistantUsageSchema = z.object({
  type: z.literal('assistant'),
  sessionId: z.string(),
  cwd: z.string(),
  timestamp: z.string(),
  message: z.object({
    model: z.string(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number(),
      cache_read_input_tokens: z.number(),
    }),
  }),
});

export function parseUsageRecords(jsonl: string): ParseUsageResult {
  const records: UsageRecord[] = [];
  let skipped = 0;

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }

    const result = AssistantUsageSchema.safeParse(parsed);
    if (!result.success) {
      skipped += 1;
      continue;
    }

    const { sessionId, cwd, timestamp, message } = result.data;
    records.push({
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationTokens: message.usage.cache_creation_input_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      sessionId,
      cwd,
      timestamp,
    });
  }

  return { records, skipped };
}

export function aggregateByModel(records: UsageRecord[]): ModelTotals[] {
  const totals = new Map<string, ModelTotals>();
  for (const record of records) {
    const existing = totals.get(record.model);
    if (existing === undefined) {
      totals.set(record.model, {
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheCreationTokens: record.cacheCreationTokens,
        cacheReadTokens: record.cacheReadTokens,
      });
    } else {
      existing.inputTokens += record.inputTokens;
      existing.outputTokens += record.outputTokens;
      existing.cacheCreationTokens += record.cacheCreationTokens;
      existing.cacheReadTokens += record.cacheReadTokens;
    }
  }
  return [...totals.values()].sort((a, b) => a.model.localeCompare(b.model));
}

export function formatUsageReport(totals: ModelTotals[], skipped: number): string {
  const lines: string[] = [];
  for (const total of totals) {
    lines.push(
      `${total.model}: input=${total.inputTokens} output=${total.outputTokens} ` +
        `cache_creation=${total.cacheCreationTokens} cache_read=${total.cacheReadTokens}`,
    );
  }
  lines.push(`skipped: ${skipped} unrecognized records`);
  return lines.join('\n');
}

const PriceMapSchema = z.object({
  asOf: z.string(),
  models: z.record(
    z.string(),
    z.object({
      inputPerMillion: z.number(),
      outputPerMillion: z.number(),
      cacheReadPerMillion: z.number(),
      cacheWritePerMillion: z.number(),
    }),
  ),
});

export function loadPriceMap(rawJson: string): PriceMap | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }
  const result = PriceMapSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  return result.data;
}

export function applyPrices(
  totals: Pick<ModelTotals, 'model' | 'inputTokens' | 'outputTokens' | 'cacheCreationTokens' | 'cacheReadTokens'>,
  priceMap: PriceMap | null,
): number | null {
  if (priceMap === null) {
    return null;
  }
  const rate = priceMap.models[totals.model];
  if (rate === undefined) {
    return null;
  }
  const million = 1_000_000;
  return (
    (totals.inputTokens / million) * rate.inputPerMillion +
    (totals.outputTokens / million) * rate.outputPerMillion +
    (totals.cacheReadTokens / million) * rate.cacheReadPerMillion +
    (totals.cacheCreationTokens / million) * rate.cacheWritePerMillion
  );
}

export function attributeToStory(
  records: UsageRecord[],
  window: AttributionWindow,
): AttributionResult {
  const start = new Date(window.windowStart).getTime();
  const end = new Date(window.windowEnd).getTime();

  const attributed: UsageRecord[] = [];
  const unattributed: UsageRecord[] = [];

  for (const record of records) {
    const ts = new Date(record.timestamp).getTime();
    if (ts >= start && ts <= end) {
      attributed.push(record);
    } else {
      unattributed.push(record);
    }
  }

  return { attributed, unattributed };
}

export type StoryReportInput = {
  storyId: string;
  attributed: UsageRecord[];
  unattributedSessionIds: string[];
  priceMap: PriceMap | null;
};

export function formatStoryReport(input: StoryReportInput): string {
  const { storyId, attributed, unattributedSessionIds, priceMap } = input;
  const sessionIds = new Set(attributed.map((r) => r.sessionId));
  const totals = aggregateByModel(attributed);

  const lines: string[] = [];
  lines.push(`# story-${storyId} usage report`);
  lines.push('');
  lines.push(`session count: ${sessionIds.size}`);
  lines.push('');
  lines.push('per-model totals:');
  if (totals.length === 0) {
    lines.push('  (none — no attributed sessions)');
  }
  for (const total of totals) {
    const cost = applyPrices(total, priceMap);
    const costNote = cost === null ? 'cost: n/a (no price entry or stale map)' : `cost: $${cost.toFixed(4)} (asOf ${priceMap?.asOf})`;
    lines.push(
      `  ${total.model}: input=${total.inputTokens} output=${total.outputTokens} ` +
        `cache_creation=${total.cacheCreationTokens} cache_read=${total.cacheReadTokens} ${costNote}`,
    );
  }
  lines.push('');
  lines.push(
    'attribution: sessions matched by cwd + commit-window timestamp overlap; ' +
      'confidence is best-effort — overlapping sessions may include unrelated work.',
  );
  lines.push('');
  lines.push('unattributed sessions (outside the story commit window):');
  if (unattributedSessionIds.length === 0) {
    lines.push('  (none)');
  }
  for (const sessionId of unattributedSessionIds) {
    lines.push(`  ${sessionId}`);
  }
  return lines.join('\n') + '\n';
}
