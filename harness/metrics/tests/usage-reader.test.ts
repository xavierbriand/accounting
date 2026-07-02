import { describe, it, expect } from 'vitest';
import {
  parseUsageRecords,
  aggregateByModel,
  attributeToStory,
  formatUsageReport,
  formatStoryReport,
  loadPriceMap,
  applyPrices,
  type UsageRecord,
} from '../lib/usage-reader.js';

const MIXED_JSONL = [
  '{"type":"queue-operation","operation":"enqueue","timestamp":"2026-06-01T09:00:00.000Z","sessionId":"fixture-session-a","content":"synthetic queue content"}',
  '{"type":"queue-operation","operation":"dequeue","timestamp":"2026-06-01T09:00:01.000Z","sessionId":"fixture-session-a"}',
  '{"parentUuid":null,"isSidechain":false,"type":"assistant","uuid":"fixture-uuid-1","timestamp":"2026-06-01T09:05:00.000Z","cwd":"/Users/fixture/Projects/accounting","sessionId":"fixture-session-a","version":"2.1.197","message":{"model":"claude-sonnet-5","usage":{"input_tokens":1000,"output_tokens":200,"cache_creation_input_tokens":500,"cache_read_input_tokens":300}}}',
  '{"parentUuid":"fixture-uuid-1","isSidechain":false,"type":"assistant","uuid":"fixture-uuid-2","timestamp":"2026-06-01T09:10:00.000Z","cwd":"/Users/fixture/Projects/accounting","sessionId":"fixture-session-a","version":"2.1.197","message":{"model":"claude-sonnet-5","usage":{"input_tokens":2000,"output_tokens":400,"cache_creation_input_tokens":0,"cache_read_input_tokens":1000}}}',
  '{"parentUuid":"fixture-uuid-2","isSidechain":false,"type":"assistant","uuid":"fixture-uuid-3","timestamp":"2026-06-01T09:15:00.000Z","cwd":"/Users/fixture/Projects/accounting","sessionId":"fixture-session-a","version":"2.1.197","message":{"model":"claude-fable-5","usage":{"input_tokens":500,"output_tokens":100,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}',
  '{"type":"some-future-record-shape","sessionId":"fixture-session-a","timestamp":"2026-06-01T09:20:00.000Z","unrecognizedField":"synthetic"}',
  '{"type":"another-unknown-shape","weird":true}',
].join('\n');

describe('parseUsageRecords', () => {
  // fails if: an unrecognized record type (queue-operation, or the two
  // synthetic unknown shapes) crashes the parser or is silently coerced
  // into a fabricated usage record — guards the "never a crash, never a
  // fabricated zero" invariant (Scenario B fails-if note).
  it('parses only assistant-type records with a usage object; skips the rest with a count', () => {
    const result = parseUsageRecords(MIXED_JSONL);
    expect(result.records).toHaveLength(3);
    expect(result.skipped).toBe(4);
  });

  // fails if: token fields are misread from the wrong nesting level —
  // guards the message.usage.* extraction path against schema drift.
  it('extracts input/output/cache token fields and model from each assistant record', () => {
    const result = parseUsageRecords(MIXED_JSONL);
    expect(result.records[0]).toMatchObject({
      model: 'claude-sonnet-5',
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationTokens: 500,
      cacheReadTokens: 300,
      sessionId: 'fixture-session-a',
      cwd: '/Users/fixture/Projects/accounting',
    });
  });
});

describe('aggregateByModel', () => {
  // fails if: totals are computed per-record instead of summed per model,
  // or a model with multiple records collapses into only its last record
  // — guards the arithmetic the Gherkin scenario B asserts against.
  it('sums token counters per model across all records', () => {
    const records: UsageRecord[] = [
      { model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 200, cacheCreationTokens: 500, cacheReadTokens: 300, sessionId: 's', cwd: 'c', timestamp: '2026-06-01T09:05:00.000Z' },
      { model: 'claude-sonnet-5', inputTokens: 2000, outputTokens: 400, cacheCreationTokens: 0, cacheReadTokens: 1000, sessionId: 's', cwd: 'c', timestamp: '2026-06-01T09:10:00.000Z' },
      { model: 'claude-fable-5', inputTokens: 500, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0, sessionId: 's', cwd: 'c', timestamp: '2026-06-01T09:15:00.000Z' },
    ];
    const aggregated = aggregateByModel(records);
    expect(aggregated).toEqual([
      { model: 'claude-fable-5', inputTokens: 500, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
      { model: 'claude-sonnet-5', inputTokens: 3000, outputTokens: 600, cacheCreationTokens: 500, cacheReadTokens: 1300 },
    ]);
  });
});

describe('formatUsageReport', () => {
  // fails if: the skipped-record count is omitted from stdout — the
  // Gherkin scenario B requires "skipped: N unrecognized records" verbatim.
  it('reports per-model rows plus the skipped-record count', () => {
    const report = formatUsageReport(
      [
        { model: 'claude-sonnet-5', inputTokens: 3000, outputTokens: 600, cacheCreationTokens: 500, cacheReadTokens: 1300 },
      ],
      4,
    );
    expect(report).toContain('claude-sonnet-5');
    expect(report).toContain('input=3000');
    expect(report).toContain('output=600');
    expect(report).toContain('cache_creation=500');
    expect(report).toContain('cache_read=1300');
    expect(report).toContain('skipped: 4 unrecognized records');
  });
});

describe('loadPriceMap', () => {
  // fails if: a malformed price map (missing asOf, wrong field types)
  // crashes instead of degrading to token-only output.
  it('returns null for a malformed price map instead of throwing', () => {
    expect(loadPriceMap('{"not": "a price map"}')).toBeNull();
  });

  it('parses a valid price map with asOf and per-model rates', () => {
    const map = loadPriceMap(
      JSON.stringify({
        asOf: '2026-07-02',
        models: {
          'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
        },
      }),
    );
    expect(map).not.toBeNull();
    expect(map?.asOf).toBe('2026-07-02');
  });
});

describe('applyPrices', () => {
  // fails if: cost is computed via float arithmetic in a way that silently
  // ignores a missing model rate — guards the "stale prices degrade to
  // token-only, never guess" rule.
  it('returns a cost figure when the model has a price entry', () => {
    const priceMap = loadPriceMap(
      JSON.stringify({
        asOf: '2026-07-02',
        models: {
          'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
        },
      }),
    );
    const cost = applyPrices(
      { model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0 },
      priceMap,
    );
    expect(cost).toBe(18);
  });

  it('returns null when the model has no price entry — never guesses', () => {
    const priceMap = loadPriceMap(
      JSON.stringify({
        asOf: '2026-07-02',
        models: {
          'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
        },
      }),
    );
    const cost = applyPrices(
      { model: 'unknown-model', inputTokens: 100, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
      priceMap,
    );
    expect(cost).toBeNull();
  });

  it('returns null when no price map is available', () => {
    const cost = applyPrices(
      { model: 'claude-sonnet-5', inputTokens: 100, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
      null,
    );
    expect(cost).toBeNull();
  });
});

describe('attributeToStory', () => {
  const IN_WINDOW: UsageRecord = {
    model: 'claude-sonnet-5',
    inputTokens: 1500,
    outputTokens: 300,
    cacheCreationTokens: 100,
    cacheReadTokens: 200,
    sessionId: 'fixture-session-in-window',
    cwd: '/Users/fixture/Projects/accounting',
    timestamp: '2026-07-02T09:30:00.000Z',
  };
  const OUT_OF_WINDOW: UsageRecord = {
    model: 'claude-fable-5',
    inputTokens: 900,
    outputTokens: 180,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    sessionId: 'fixture-session-out-of-window',
    cwd: '/Users/fixture/Projects/accounting',
    timestamp: '2026-05-01T09:00:00.000Z',
  };

  // fails if: out-of-window usage is folded into the story's totals —
  // per-story cost would be inflated silently (Scenario C fails-if note).
  it('includes only sessions whose timestamps overlap the commit window; lists the rest as unattributed', () => {
    const result = attributeToStory([IN_WINDOW, OUT_OF_WINDOW], {
      windowStart: '2026-07-01T00:00:00.000Z',
      windowEnd: '2026-07-03T00:00:00.000Z',
    });
    expect(result.attributed).toHaveLength(1);
    expect(result.attributed[0]?.sessionId).toBe('fixture-session-in-window');
    expect(result.unattributed).toHaveLength(1);
    expect(result.unattributed[0]?.sessionId).toBe('fixture-session-out-of-window');
  });
});

describe('formatStoryReport', () => {
  // fails if: the unattributed session list is omitted from the report —
  // Scenario C requires the out-of-window session to be "listed as
  // unattributed", not merely excluded from the totals.
  it('includes totals, session count, attribution-confidence note, and the unattributed session list', () => {
    const report = formatStoryReport({
      storyId: 'h4',
      attributed: [
        { model: 'claude-sonnet-5', inputTokens: 1500, outputTokens: 300, cacheCreationTokens: 100, cacheReadTokens: 200, sessionId: 'fixture-session-in-window', cwd: 'c', timestamp: '2026-07-02T09:30:00.000Z' },
      ],
      unattributedSessionIds: ['fixture-session-out-of-window'],
      priceMap: null,
    });
    expect(report).toContain('story-h4');
    expect(report).toContain('session count: 1');
    expect(report).toContain('attribution');
    expect(report).toContain('fixture-session-out-of-window');
  });
});
