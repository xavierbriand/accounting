#!/usr/bin/env node
// Emits agent_obs.session_outcome — a SIBLING span to Claude Code's native
// claude_code.interaction tree. You cannot mutate a span you did not create, so
// the fingerprint rides its own span and is joined on session.id at query time.
//
// Zero dependencies on purpose: raw OTLP/HTTP JSON over fetch. No SDK to keep in
// step with a beta trace shape, and no npm install before the product's stack
// is chosen.
//
// SessionStart captures the config the session began under; Stop emits.

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = join(REPO, 'agent-obs', '.state');
const ENDPOINT = process.env.SLUICE_OTLP_HTTP_ENDPOINT ?? 'http://localhost:4318';
const EXPORT_TIMEOUT_MS = 2000;

// Files whose content defines how the agent behaves. A change to any of these is
// a different agent, and comparing runs across such a change is comparing apples
// to oranges — which is the entire reason the fingerprint exists.
const FINGERPRINTED = ['CLAUDE.md', '.claude/settings.json', '.mcp.json', 'agent-obs/evals/rubric.md'];

type HookInput = {
  session_id?: string;
  hook_event_name?: string;
  transcript_path?: string;
  cwd?: string;
};

type Attr = { key: string; value: Record<string, unknown> };

function str(key: string, value: string): Attr {
  return { key, value: { stringValue: value } };
}

function int(key: string, value: number): Attr {
  return { key, value: { intValue: String(value) } };
}

function strArray(key: string, values: string[]): Attr {
  return { key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } };
}

function sha256(path: string): string {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return 'absent';
  }
}

function agentVersion(): string {
  try {
    return execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return 'unknown';
  }
}

function mcpServers(): string[] {
  for (const candidate of ['.mcp.json', '.claude/settings.json']) {
    try {
      const parsed = JSON.parse(readFileSync(join(REPO, candidate), 'utf8'));
      const servers = parsed.mcpServers;
      if (servers) return Object.keys(servers).sort();
    } catch {
      // Not present, or not valid JSON. Either way there is nothing to report.
    }
  }
  return [];
}

function skills(): string[] {
  try {
    return readdirSync(join(REPO, '.claude', 'skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

// The transcript is the only place the model actually used is recorded; the hook
// payload does not carry it.
function modelFromTranscript(transcriptPath: string | undefined): string {
  if (!transcriptPath || !existsSync(transcriptPath)) return 'unknown';
  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      const model = JSON.parse(lines[i])?.message?.model;
      if (typeof model === 'string') return model;
    }
  } catch {
    // A truncated or mid-write transcript is not worth failing a session over.
  }
  return 'unknown';
}

function fingerprint(input: HookInput): Attr[] {
  const attrs: Attr[] = [
    str('agent.version', agentVersion()),
    strArray('agent.mcp_servers', mcpServers()),
    strArray('agent.skills', skills()),
    str('agent.model', modelFromTranscript(input.transcript_path)),
  ];
  for (const file of FINGERPRINTED) {
    attrs.push(str(`agent.config_sha256.${file.replace(/^\.+/, '')}`, sha256(join(REPO, file))));
  }
  return attrs;
}

// Set by Claude Code in hook subprocesses when tracing is active, which is what
// lets this span land in the same trace as the interaction it describes.
function traceContext(): { traceId: string; parentSpanId?: string } {
  const parts = (process.env.TRACEPARENT ?? '').split('-');
  if (parts.length === 4 && parts[1]?.length === 32 && parts[2]?.length === 16) {
    return { traceId: parts[1], parentSpanId: parts[2] };
  }
  return { traceId: randomBytes(16).toString('hex') };
}

async function emit(input: HookInput, startedAtNs: bigint, attrs: Attr[]): Promise<void> {
  const { traceId, parentSpanId } = traceContext();
  const body = {
    resourceSpans: [
      {
        resource: { attributes: [str('service.name', process.env.OTEL_SERVICE_NAME ?? 'sluice-agent')] },
        scopeSpans: [
          {
            scope: { name: 'sluice.agent-obs' },
            spans: [
              {
                traceId,
                spanId: randomBytes(8).toString('hex'),
                ...(parentSpanId ? { parentSpanId } : {}),
                name: 'agent_obs.session_outcome',
                kind: 1,
                startTimeUnixNano: String(startedAtNs),
                endTimeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
                attributes: attrs,
              },
            ],
          },
        ],
      },
    ],
  };

  // A dead collector must never stall a session. Bounded timeout, errors swallowed.
  await fetch(`${ENDPOINT}/v1/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
  });
}

function statePath(sessionId: string): string {
  return join(STATE_DIR, `${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

async function main(): Promise<void> {
  const raw = readFileSync(0, 'utf8');
  const input: HookInput = raw.trim() ? JSON.parse(raw) : {};
  const sessionId = input.session_id ?? 'unknown';

  if (input.hook_event_name === 'SessionStart') {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(statePath(sessionId), JSON.stringify({ startedAtNs: String(BigInt(Date.now()) * 1_000_000n) }));
    return;
  }

  let startedAtNs = BigInt(Date.now()) * 1_000_000n;
  try {
    startedAtNs = BigInt(JSON.parse(readFileSync(statePath(sessionId), 'utf8')).startedAtNs);
  } catch {
    // No SessionStart seen (hook added mid-session): a zero-width span still
    // carries the fingerprint, which is the point of Phase B.
  }

  const attrs = [str('session.id', sessionId), ...fingerprint(input)];

  // AbortSignal.timeout does not cut undici's connect phase: against a black-holed
  // endpoint the fetch runs to undici's 10s connect timeout, stalling session stop.
  // Measured, not assumed — see `just smoke-offline`. A hard watchdog is the only
  // thing that actually bounds this. Losing a span to a dead collector is free;
  // making the user wait is not.
  const watchdog = setTimeout(() => process.exit(0), EXPORT_TIMEOUT_MS);
  try {
    await emit(input, startedAtNs, attrs);
  } catch {
    // Collector down is the normal case on a laptop; exit immediately rather
    // than idling out the watchdog.
  } finally {
    clearTimeout(watchdog);
  }
}

// Nothing this hook does is worth failing a session over.
main().catch(() => {});
