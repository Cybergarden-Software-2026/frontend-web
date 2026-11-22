#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  UNDERCTRL_NODE=$(command -v node)
elif [ -x /Users/a111/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ]; then
  UNDERCTRL_NODE=/Users/a111/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
else
  echo 'Установите Node.js 24 LTS и выполните pnpm install.'
  exit 1
fi
case "${1:-dev}" in
  dev) exec "$UNDERCTRL_NODE" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort ;;
  build) "$UNDERCTRL_NODE" node_modules/typescript/bin/tsc --noEmit
         "$UNDERCTRL_NODE" node_modules/vite/bin/vite.js build
         exec "$UNDERCTRL_NODE" node_modules/vite/bin/vite.js build --config vite.sw.config.ts ;;
  preview) exec "$UNDERCTRL_NODE" node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4174 --strictPort ;;
  test) exec "$UNDERCTRL_NODE" --test tests/*.test.mjs ;;
  *) echo 'Используйте: ./scripts/run.sh [dev|build|preview|test]'; exit 1 ;;
esac
