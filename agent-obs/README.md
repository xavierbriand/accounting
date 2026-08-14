# agent-obs

Observability for two workloads through one pipeline: the product in
production (`service.name=sluice`) and agent sessions
(`service.name=sluice-agent`).

It lives inside this repo because its fingerprint hashes this repo's config. A
sibling repo would be a second thing to keep in sync for no gain.

## Run

```bash
cd agent-obs && just up   # Grafana :3000, Phoenix :6006
just smoke                # one span end-to-end
just smoke-offline        # stack DOWN: proves a dead collector cannot stall a session
```

Claude Code picks up telemetry from `env` in `.claude/settings.json` — no shell
setup. `env.sh` is only for subprocesses (the eval runner), which do not inherit
`OTEL_*` from the session.

## Shape

```
claude (native OTel)  ──grpc:4317──┐
                                   ├──> collector ──┬──> LGTM    (traces+metrics+logs)
hooks/session-outcome ──http:4318──┘                └──> Phoenix (traces)
```

Claude Code emits `claude_code.interaction` / `.llm_request` / `.tool` natively.
Do not hand-roll session or tool spans.

You cannot mutate a span you did not create, so the fingerprint rides a **sibling**
span, `agent_obs.session_outcome`, joined to the session on `session.id`. When
`TRACEPARENT` is present the sibling lands inside the session's own trace.

## Verified (2026-08-14)

Stack up, `just smoke` accepted, and the span confirmed **present in both Tempo
and Phoenix** — the fan-out works, not just the receive.

The `agent_obs.session_outcome` span reached both backends carrying all nine
fingerprint attributes, correctly parented under `TRACEPARENT`, with the model
read live from the transcript (`claude-opus-5`).

Resilience, measured rather than assumed: the hook exits 0 in ~0s against a
refused endpoint and ~2s against a black-holed one. `AbortSignal.timeout` does
**not** cut undici's connect phase — the first version ran to undici's 10s connect
timeout, stalling every session stop, until a hard watchdog was added.

**Still unverified: the native `claude_code.*` waterfall.** No session has yet
started with telemetry enabled, so nothing has emitted `claude_code.interaction`.
The `env` block landed after this session began; the first session started *after*
it should produce the waterfall, and that is what closes M0.

## Known gaps

- `agent.mcp_servers` only sees repo-level `.mcp.json` / `.claude/settings.json`.
  Servers configured at user scope are invisible to the fingerprint.
- `agent.version` reads `claude --version`; records `unknown` when not on PATH.
- Traces are beta. For **interactive** CLI sessions they also require org
  allowlisting; `-p`/SDK sessions are not gated. If interactive waterfalls never
  appear, that gate is the first thing to check, not this config.

## Phases

A capture · B fingerprint — here. C outcomes (needs a test suite) · D replay
suite · E views as code — later, behind the dogfood gate.
