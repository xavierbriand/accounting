# source agent-obs/env.sh  — then run `claude` from the same shell.
#
# Claude Code emits interaction/llm_request/tool spans natively. Do not hand-roll
# session or tool spans; the only thing this repo emits is the sibling
# agent_obs.session_outcome span (see hooks/session-outcome.ts).

export CLAUDE_CODE_ENABLE_TELEMETRY=1
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1   # traces are beta-gated

export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp

export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Two workloads share this collector. This is the agent one; P1 in production
# uses service.name=sluice.
export OTEL_SERVICE_NAME=sluice-agent

# Claude Code does NOT pass OTEL_* to subprocesses (hooks, Bash, MCP servers),
# so the hook reads its endpoint from this variable instead and defaults to
# localhost when unset. TRACEPARENT *is* propagated, which is what lets the
# outcome span join the session's trace.
export SLUICE_OTLP_HTTP_ENDPOINT=http://localhost:4318
