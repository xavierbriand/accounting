# For SUBPROCESSES only — the eval runner, scripts, anything not Claude Code itself.
#
# Claude Code sessions in this repo get these from `env` in .claude/settings.json
# instead. That matters: Claude Code can run as a desktop app launched from the
# GUI, which never sees a shell's exports — `source env.sh && claude` then
# silently does nothing, and telemetry looks enabled while emitting no spans.
# settings.json is read by Claude Code itself, so it works as either the app or
# the CLI, and it version-controls with the repo.
#
# Claude Code emits interaction/llm_request/tool spans natively. Do not hand-roll
# session or tool spans; the only thing this repo emits is the sibling
# dev_loop.session_outcome span (see hooks/session-outcome.ts).

export CLAUDE_CODE_ENABLE_TELEMETRY=1
export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1   # traces are beta-gated

export OTEL_TRACES_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp

export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Two workloads share this collector. This is the agent one; the product in
# production uses service.name=sluice.
export OTEL_SERVICE_NAME=dev-loop

# Claude Code does NOT pass OTEL_* to subprocesses (hooks, Bash, MCP servers),
# so the hook reads its endpoint from this variable instead and defaults to
# localhost when unset. TRACEPARENT *is* propagated, which is what lets the
# outcome span join the session's trace.
export SLUICE_OTLP_HTTP_ENDPOINT=http://localhost:4318
