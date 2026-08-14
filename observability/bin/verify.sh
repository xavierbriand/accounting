#!/usr/bin/env bash
# Answers "is the whole chain actually working?" — collector, both backends,
# Claude Code's own telemetry, and our hook.
#
# Lives in a script rather than a Justfile recipe because `just` scans recipe
# bodies for {{ }} interpolation, which fights with JSON payloads.
set -uo pipefail

PROJECT="${PROJECT:-sluice-observability}"
cd "$(dirname "$0")/.."
DC=(docker compose -p "$PROJECT" -f compose.yaml)
fail=0
say() { printf '  %-42s %s\n' "$1" "$2"; }

running=$("${DC[@]}" ps --status running -q 2>/dev/null | wc -l | tr -d ' ')
if [ "$running" -lt 3 ]; then
  say "containers running" "$running/3 — run 'just up'"
  echo
  echo "  compose projects currently up:"
  docker compose ls --format json 2>/dev/null \
    | python3 -c "import sys,json;[print('   ',p['Name']) for p in json.load(sys.stdin)]" 2>/dev/null || true
  echo
  echo "  If one is listed under a different name, it is an older stack holding"
  echo "  the ports. Stop it, then 'just up':"
  echo "    docker compose -p <that-name> -f compose.yaml down"
  exit 1
fi
say "containers running" "$running/3 OK"

# Round-trip a uniquely identifiable span, then look for that exact id. A 200
# from the collector only proves acceptance, never arrival.
trace_id=$(openssl rand -hex 16)
payload=$(python3 - "$trace_id" <<'PY'
import json, sys, time, secrets
now = str(int(time.time() * 1e9))
print(json.dumps({"resourceSpans": [{
    "resource": {"attributes": [
        {"key": "service.name", "value": {"stringValue": "dev-loop"}}]},
    "scopeSpans": [{"spans": [{
        "traceId": sys.argv[1], "spanId": secrets.token_hex(8),
        "name": "dev_loop.verify", "kind": 1,
        "startTimeUnixNano": now, "endTimeUnixNano": now}]}]}]}))
PY
)
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST http://localhost:4318/v1/traces \
  -H 'content-type: application/json' -d "$payload")
if [ "$code" = "200" ]; then say "collector accepts spans" "OK"
else say "collector accepts spans" "HTTP $code"; fail=1; fi

sleep 8   # the batch processor holds spans for up to 5s

if "${DC[@]}" exec -T lgtm curl -sf -m 10 "http://localhost:3200/api/traces/$trace_id" 2>/dev/null \
   | grep -q dev_loop.verify
then say "span arrived in Tempo" "OK"
else say "span arrived in Tempo" "NOT FOUND"; fail=1; fi

if curl -s -m 10 "http://localhost:6006/v1/projects/default/spans?limit=200" | grep -q "$trace_id"
then say "span arrived in Phoenix" "OK"
else say "span arrived in Phoenix" "NOT FOUND"; fail=1; fi

# The two above prove the pipeline. These two prove the real emitters, which a
# hand-rolled curl cannot.
seen=$("${DC[@]}" exec -T lgtm curl -sf -m 10 \
  "http://localhost:3200/api/search/tag/name/values" 2>/dev/null || echo '')
if echo "$seen" | grep -q claude_code.interaction
then say "Claude Code is emitting" "OK"
else say "Claude Code is emitting" "no claude_code.* spans yet"; fail=1; fi
if echo "$seen" | grep -q dev_loop.session_outcome
then say "session-outcome hook is emitting" "OK"
else say "session-outcome hook is emitting" "no outcome span yet"; fail=1; fi

echo
if [ "$fail" = 0 ]; then
  echo "  all checks passed"
  echo "  Grafana  http://localhost:3000/explore    Tempo > Search > Service Name"
  echo "  Phoenix  http://localhost:6006"
else
  echo "  SOME CHECKS FAILED — see above"
fi
exit "$fail"
