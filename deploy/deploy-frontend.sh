#!/usr/bin/env bash
set -euo pipefail

repo=/home/cyber/cybergarden/frontend-web
network=${UNDERCTRL_FRONTEND_NETWORK:-mts-incident-dashboard_default}
live=underctrl-frontend-manual
previous=underctrl-frontend-previous
candidate=underctrl-frontend-candidate
live_port=8005

exec 9>/run/lock/underctrl-frontend-deploy.lock
flock -n 9 || exit 0

git_as_cyber() {
  runuser -u cyber -- env GIT_TERMINAL_PROMPT=0 git -C "$repo" "$@"
}

exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

running() {
  [[ "$(docker container inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" == true ]]
}

require_frontend() {
  local label_and_image
  label_and_image=$(docker container inspect \
    --format '{{index .Config.Labels "io.underctrl.component"}}|{{.Config.Image}}' "$1")
  case "$label_and_image" in
    frontend\|*|*\|underctrl-frontend:manual) ;;
    *)
      echo "Refusing to replace unrelated container: $1" >&2
      return 1
      ;;
  esac
}

check_frontend() {
  local base="http://127.0.0.1:$1"
  local index asset

  curl --noproxy '*' -fs --max-time 4 -o /dev/null "$base/healthz" || return 1
  index=$(curl --noproxy '*' -fs --max-time 4 "$base/") || return 1
  asset=$(sed -nE 's/.*src="(\/assets\/[^"]+\.js)".*/\1/p' <<<"$index")
  [[ "$asset" == /assets/*.js ]] || return 1
  curl --noproxy '*' -fs --max-time 4 -o /dev/null "$base$asset" || return 1
  curl --noproxy '*' -fs --max-time 4 -o /dev/null "$base/sounds/alert-bell.wav"
}

wait_for_frontend() {
  local attempt
  for ((attempt = 0; attempt < 10; attempt++)); do
    if check_frontend "$1"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

check_api() {
  local base="http://127.0.0.1:$1"
  local content_type stream_status=0
  content_type=$(curl --noproxy '*' -fs --max-time 5 -o /dev/null \
    -w '%{content_type}' "$base/api/v1/snapshot") || return 1
  [[ "$content_type" == application/json* ]] || return 1

  : > "$scratch/sse"
  curl --noproxy '*' -fsN --max-time 3 -o "$scratch/sse" \
    "$base/api/v1/events/stream" || stream_status=$?
  [[ "$stream_status" == 0 || "$stream_status" == 28 ]] || return 1
  grep -Eq '^event: snapshot[[:space:]]*$' "$scratch/sse"
}

restore_previous() {
  if ! docker container rename "$previous" "$live" >/dev/null; then
    echo "Could not restore name of previous frontend: $previous" >&2
    return 1
  fi
  if ! running "$live"; then
    docker container start "$live" >/dev/null || return 1
  fi
  echo 'Restored the previous frontend container.' >&2
}

for name in "$live" "$previous" "$candidate"; do
  if exists "$name"; then
    require_frontend "$name"
  fi
done

# Recover a swap interrupted after the prior container was saved.
if exists "$previous" && ! running "$live"; then
  if exists "$live"; then
    docker container rm --force "$live" >/dev/null
  fi
  restore_previous
fi

if exists "$candidate"; then
  docker container rm --force "$candidate" >/dev/null
fi

git_as_cyber fetch --quiet --no-tags --no-write-fetch-head origin \
  '+refs/heads/main:refs/remotes/origin/main'
revision=$(git_as_cyber rev-parse --verify 'refs/remotes/origin/main^{commit}')

if running "$live"; then
  current_revision=$(docker container inspect \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$live")
  if [[ "$current_revision" == "$revision" ]] && check_frontend "$live_port"; then
    exit 0
  fi
fi

docker network inspect "$network" >/dev/null
image="underctrl-frontend:$revision"
echo "Building and testing frontend $revision"
git_as_cyber archive --format=tar "$revision" | docker build --pull \
  --label "org.opencontainers.image.revision=$revision" --tag "$image" -

scratch=$(mktemp -d /run/underctrl-frontend-deploy.XXXXXXXX)
cutover=0
saved_previous=0
cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 && cutover )); then
    if exists "$live" && ! docker container rm --force "$live" >/dev/null; then
      echo "Failed to remove the unsuccessful release: $live" >&2
    elif (( saved_previous )); then
      restore_previous || echo "Rollback failed for $previous" >&2
    fi
  fi
  if exists "$candidate"; then
    docker container rm --force "$candidate" >/dev/null || true
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

docker run --detach --name "$candidate" --network "$network" \
  --label io.underctrl.component=frontend \
  --security-opt no-new-privileges=true --publish '127.0.0.1::8080' \
  "$image" >/dev/null
binding=$(docker container port "$candidate" 8080/tcp)
if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
  echo "Unexpected candidate binding: $binding" >&2
  exit 1
fi
candidate_port=${BASH_REMATCH[1]}
if ! wait_for_frontend "$candidate_port" || ! check_api "$candidate_port"; then
  echo 'Frontend candidate failed the HTML, asset, snapshot or SSE checks.' >&2
  exit 1
fi

if exists "$previous"; then
  docker container rm "$previous" >/dev/null
fi
if exists "$live"; then
  docker container rename "$live" "$previous" >/dev/null
  saved_previous=1
  cutover=1
  docker container stop --time 5 "$previous" >/dev/null
fi
cutover=1
docker run --detach --restart unless-stopped --name "$live" --network "$network" \
  --label io.underctrl.component=frontend \
  --security-opt no-new-privileges=true \
  --publish "127.0.0.1:$live_port:8080" "$image" >/dev/null
if ! wait_for_frontend "$live_port" || ! check_api "$live_port"; then
  echo "Frontend failed the checks on port $live_port" >&2
  exit 1
fi

echo "Deployed frontend $revision on 127.0.0.1:$live_port"
