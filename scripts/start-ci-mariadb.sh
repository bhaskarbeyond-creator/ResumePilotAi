#!/usr/bin/env bash
# Start an isolated MariaDB 11.4 container with per-job random credentials.
# Intended for ephemeral GitHub-hosted runners; writes masked connection values
# to GITHUB_ENV without placing credentials in workflow source or command args.
set -Eeuo pipefail

: "${GITHUB_ENV:?GITHUB_ENV is required}"
command -v docker >/dev/null
command -v openssl >/dev/null

readonly IMAGE="${MARIADB_CI_IMAGE:-mariadb@sha256:4f1d8d202fcf7bcb3902f63af09f9c1a050c2922a89652f22abaec0d4f015e83}"
readonly CONTAINER_NAME="resumepilot-mariadb-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}"
readonly DATABASE="${MARIADB_CI_DATABASE:-resumepilot_ci}"
readonly USERNAME="${MARIADB_CI_USER:-resumepilot_ci}"
readonly PORT="${MARIADB_CI_PORT:-3306}"

[[ "$DATABASE" =~ (^|[_-])(test|tests|ci|cert|certification|sandbox|scratch)($|[_-]) ]] || {
  echo "MARIADB_CI_DATABASE must be explicitly disposable." >&2
  exit 2
}
[[ "$USERNAME" =~ ^[a-zA-Z0-9_]+$ ]] || { echo "Unsafe MariaDB user name." >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1 && PORT <= 65535)) || {
  echo "MARIADB_CI_PORT must be a valid TCP port." >&2
  exit 2
}

DB_PASSWORD="$(openssl rand -hex 32)"
MARIADB_ADMIN_PASSWORD="$(openssl rand -hex 32)"
export MARIADB_DATABASE="$DATABASE"
export MARIADB_USER="$USERNAME"
export MARIADB_PASSWORD="$DB_PASSWORD"
export MARIADB_ROOT_PASSWORD="$MARIADB_ADMIN_PASSWORD"
printf '::add-mask::%s\n' "$DB_PASSWORD" "$MARIADB_ADMIN_PASSWORD"

docker run --detach --rm \
  --name "$CONTAINER_NAME" \
  --publish "127.0.0.1:${PORT}:3306" \
  --env MARIADB_DATABASE \
  --env MARIADB_USER \
  --env MARIADB_PASSWORD \
  --env MARIADB_ROOT_PASSWORD \
  --health-cmd='healthcheck.sh --connect --innodb_initialized' \
  --health-interval=2s \
  --health-timeout=5s \
  --health-retries=30 \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$CONTAINER_NAME")"
  [[ "$status" == healthy ]] && break
  if [[ "$status" == unhealthy ]]; then
    docker logs "$CONTAINER_NAME" >&2
    exit 1
  fi
  sleep 1
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER_NAME")" == healthy ]] || {
  docker logs "$CONTAINER_NAME" >&2
  echo "MariaDB did not become healthy." >&2
  exit 1
}

{
  printf 'CI_MARIADB_CONTAINER=%s\n' "$CONTAINER_NAME"
  printf 'DB_HOST=127.0.0.1\nDB_PORT=%s\nDB_USER=%s\nDB_PASSWORD=%s\nDB_NAME=%s\n' \
    "$PORT" "$USERNAME" "$DB_PASSWORD" "$DATABASE"
  printf 'MARIADB_ADMIN_USER=root\nMARIADB_ADMIN_PASSWORD=%s\n' "$MARIADB_ADMIN_PASSWORD"
  printf 'CERT_MARIADB_HOST=127.0.0.1\nCERT_MARIADB_PORT=%s\nCERT_MARIADB_USER=%s\nCERT_MARIADB_PASSWORD=%s\nCERT_MARIADB_DATABASE=%s\n' \
    "$PORT" "$USERNAME" "$DB_PASSWORD" "$DATABASE"
} >> "$GITHUB_ENV"

echo "MariaDB 11.4 certification service is healthy on loopback (credentials masked)."
