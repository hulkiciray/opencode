#!/usr/bin/env bash
# One-command check of the verify-gate branch.
#
#   ./verify-bench/check.sh                         offline: unit tests, task validation, recorded results
#   ./verify-bench/check.sh live [model] [reps]     also re-runs the benchmark (needs `bun dev auth login` first)
#                                                   default: openai/gpt-5-mini, 3 reps (~$0.60, ~20 min)
set -euo pipefail

bench="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$bench")"

for tool in git bun python3; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

if [ ! -d "$repo/node_modules" ]; then
  echo "== installing dependencies"
  (cd "$repo" && bun install)
fi

echo "== unit tests: verifier plugin + agent loop (stop hook)"
(cd "$repo/packages/opencode" && bun test --timeout 30000 test/plugin/verify.test.ts test/session/prompt.test.ts)

echo "== benchmark task validation"
python3 "$bench/harness.py" validate

echo "== recorded results (180 runs)"
python3 "$bench/harness.py" --runs results report

if [ "${1:-}" = "live" ]; then
  model="${2:-openai/gpt-5-mini}"
  reps="${3:-3}"
  echo "== live benchmark: $model, $reps reps per task, verifier off then on (results in verify-bench/runs)"
  python3 "$bench/harness.py" run --arm off --model "$model" --reps "$reps" --parallel 3
  python3 "$bench/harness.py" run --arm on --model "$model" --reps "$reps" --parallel 3
  python3 "$bench/harness.py" report
fi
