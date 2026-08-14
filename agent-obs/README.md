# agent-obs

Observability for two workloads through one pipeline: P1 in production
(`service.name=sluice`) and agent sessions (`service.name=sluice-agent`).

It lives inside this repo because its fingerprint hashes this repo's config. A
sibling repo would be a second thing to keep in sync for no gain.

## Run

```bash
source agent-obs/env.sh   # then run claude from the same shell
cd agent-obs && just up   # Grafana :3000, Phoenix :6006
just smoke                # one span end-to-end
just smoke-offline        # stack DOWN: proves a dead collector cannot stall a session
```

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

- Hook exits 0 in ~0s against a refused endpoint, ~2s against a black-holed one.
  `AbortSignal.timeout` does **not** cut undici's connect phase — it ran to
  undici's 10s connect timeout until a hard watchdog was added. Measured, not assumed.
- OTLP JSON accepted by a listener; `TRACEPARENT` correctly joined; model read
  from the live transcript.
- **Not yet verified end-to-end** — no container runtime on this machine yet, so
  no span has reached Grafana or Phoenix. `just up` / `just smoke` are unrun.

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
