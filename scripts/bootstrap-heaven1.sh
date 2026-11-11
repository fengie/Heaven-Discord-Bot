#!/usr/bin/env bash
# One-time local bootstrap for the existing Heaven1 Ubuntu WSL2 Docker engine.
# No Bridge privileges, GitHub secret reads, or new remote control service.
set -Eeuo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
tmp_env=""
cleanup() { if [[ -n "$tmp_env" && -e "$tmp_env" ]]; then rm -f -- "$tmp_env"; fi; }
trap cleanup EXIT

# Fail before any network, credential input, or state mutation on other hosts.
if [[ ! -r /proc/sys/kernel/osrelease ]] || ! grep -qi microsoft /proc/sys/kernel/osrelease; then
  fail HEAVEN1_WSL_REQUIRED
fi
command -v powershell.exe >/dev/null 2>&1 || fail WINDOWS_HOST_IDENTITY_UNAVAILABLE
native_host="$(powershell.exe -NoLogo -NoProfile -NonInteractive -Command '[Environment]::MachineName' 2>/dev/null | tr -d '\r\n' | tr '[:lower:]' '[:upper:]')" || fail WINDOWS_HOST_IDENTITY_UNAVAILABLE
[[ "$native_host" == "HEAVEN" ]] || fail HEAVEN1_REQUIRED
# Release HOLD: legacy WSL setup must not bypass required Toolbox adoption.
fail TOOLBOX_INHERITANCE_NOT_VERIFIED
[[ "$(id -u)" != 0 ]] || fail UNPRIVILEGED_WSL_USER_REQUIRED

repo="$(cd "$(dirname "$0")/.." && pwd -P)"
case "$repo" in /mnt/*) fail WSL_NATIVE_FILESYSTEM_REQUIRED;; esac

for program in git docker stat; do
  command -v "$program" >/dev/null 2>&1 || fail "MISSING_PROGRAM_$program"
done
[[ -z "$(printenv DOCKER_HOST 2>/dev/null || true)" ]] || fail REMOTE_DOCKER_HOST_NOT_ALLOWED
[[ -z "$(printenv DOCKER_CONTEXT 2>/dev/null || true)" ]] || fail OVERRIDDEN_DOCKER_CONTEXT_NOT_ALLOWED
endpoint="$(docker context inspect "$(docker context show)" --format '{{ .Endpoints.docker.Host }}' 2>/dev/null)" || fail DOCKER_CONTEXT_UNVERIFIED
[[ "$endpoint" == unix://* ]] || fail LOCAL_DOCKER_CONTEXT_REQUIRED
docker info >/dev/null 2>&1 || fail LOCAL_DOCKER_DAEMON_UNAVAILABLE
docker compose version >/dev/null 2>&1 || fail DOCKER_COMPOSE_V2_REQUIRED

origin="$(git -C "$repo" remote get-url origin 2>/dev/null)" || fail GIT_ORIGIN_MISSING
case "$origin" in
  https://github.com/fengie/Heaven-Discord-Bot|https://github.com/fengie/Heaven-Discord-Bot.git|git@github.com:fengie/Heaven-Discord-Bot.git) ;;
  *) fail NONCANONICAL_BOT_REPO ;;
esac
[[ "$(git -C "$repo" branch --show-current)" == main ]] || fail MAIN_BRANCH_REQUIRED
[[ -z "$(git -C "$repo" status --porcelain --untracked-files=normal)" ]] || fail DIRTY_REPOSITORY_HOLD
git -C "$repo" fetch --quiet --no-tags origin refs/heads/main || fail GIT_FETCH_FAILED
[[ "$(git -C "$repo" rev-parse HEAD)" == "$(git -C "$repo" rev-parse FETCH_HEAD)" ]] || fail MAIN_SOURCE_NOT_CURRENT

cd "$repo"
env_file="$repo/.env"
if [[ -e "$env_file" || -L "$env_file" ]]; then
  [[ -f "$env_file" && ! -L "$env_file" ]] || fail CREDENTIAL_FILE_NOT_REGULAR
  [[ "$(stat -c %u "$env_file")" == "$(id -u)" ]] || fail CREDENTIAL_FILE_NOT_OWNED
  [[ "$(stat -c %a "$env_file")" == 600 ]] || fail CREDENTIAL_FILE_PERMISSIONS_UNSAFE
  printf '%s\n' "Reusing existing owner-only local credentials."
else
  [[ -t 0 ]] || fail INTERACTIVE_CREDENTIAL_PROMPT_REQUIRED
  printf '%s\n' "Enter bot credentials locally on HEAVEN. Nothing is uploaded to GitHub."
  read -r -s -p 'Discord bot token (hidden): ' bot_token
  printf '\n'
  read -r -p 'Discord application ID: ' client_id
  read -r -p 'Discord guild/server ID (optional): ' guild_id

  [[ "$bot_token" =~ ^[A-Za-z0-9._-]{40,200}$ ]] || fail INVALID_TOKEN_FORMAT
  [[ "$client_id" =~ ^[0-9]{17,20}$ ]] || fail INVALID_CLIENT_ID
  [[ -z "$guild_id" || "$guild_id" =~ ^[0-9]{17,20}$ ]] || fail INVALID_GUILD_ID

  tmp_env="$(mktemp "$repo/.env.pending.XXXXXXXX")" || fail CREDENTIAL_STAGE_FAILED
  printf 'DISCORD_TOKEN=%s\nDISCORD_CLIENT_ID=%s\nDISCORD_GUILD_ID=%s\n' "$bot_token" "$client_id" "$guild_id" > "$tmp_env"
  unset bot_token
  chmod 600 "$tmp_env"
  # Atomic no-overwrite publication, protecting an existing operator-owned .env.
  ln -- "$tmp_env" "$env_file" || fail CREDENTIAL_FILE_ALREADY_EXISTS
  rm -f -- "$tmp_env"
  tmp_env=""
fi

existing_container="$(docker compose -p heaven-discord-bot ps -q bot 2>/dev/null)" || fail COMPOSE_SERVICE_STATUS_UNAVAILABLE
if [[ -n "$existing_container" ]]; then
  owner_dir="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$existing_container" 2>/dev/null)" || fail EXISTING_CONTAINER_UNVERIFIED
  [[ "$owner_dir" == "$repo" ]] || fail FOREIGN_COMPOSE_CONTAINER_HOLD
fi

# The Compose file has no exposed ports or host mounts and already defines
# restart: unless-stopped, read_only: true, and cap_drop: ALL.
if ! docker compose -p heaven-discord-bot up -d --build --no-deps bot >/dev/null 2>&1; then
  fail BOT_COMPOSE_START_FAILED
fi

for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker compose -p heaven-discord-bot ps --status running --services 2>/dev/null | grep -Fxq bot; then
    # Keep raw logs private; only return the ready/not-ready classification.
    recent_logs="$(docker compose -p heaven-discord-bot logs --no-color --since 2m bot 2>/dev/null || true)"
    if [[ "$recent_logs" == *'"event":"discord.ready"'* ]]; then
      printf '%s\n' 'HEAVEN_BOT_READY host=HEAVEN service=bot project=heaven-discord-bot'
      printf '%s\n' 'Check /ping, /help and /status inside Discord Besties to finish acceptance.'
      exit 0
    fi
  fi
  sleep 3
done
fail BOT_GATEWAY_READY_NOT_VERIFIED
