#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  UNDERCTRL_NODE=$(command -v node)
elif [ -x /Users/a111/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ]; then
  UNDERCTRL_NODE=/Users/a111/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
else
  echo 'Установите Node.js 24 LTS с https://nodejs.org/'
  exit 1
fi
case "${1:-dev}" in
  dev) exec "$UNDERCTRL_NODE" scripts/dev.mjs ;;
  demo) exec "$UNDERCTRL_NODE" scripts/dev.mjs --demo ;;
  build) exec "$UNDERCTRL_NODE" scripts/build.mjs ;;
  test) exec "$UNDERCTRL_NODE" --test tests/*.test.mjs ;;
  start) exec "$UNDERCTRL_NODE" scripts/preview.mjs ;;
  *) echo 'Используйте: ./scripts/run.sh [dev|demo|build|test|start]'; exit 1 ;;
esac
