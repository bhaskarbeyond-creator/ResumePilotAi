#!/usr/bin/env bash
# Compatibility entrypoint. Unsafe direct-to-live SCP deployment was retired.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DOC="docs/SAFE_PRODUCTION_WORKFLOW.md"

case "${1:-}" in
  diagnose|status)
    exec "$ROOT/scripts/production-release-client.sh" status
    ;;
  deploy)
    shift
    exec "$ROOT/scripts/production-release-client.sh" deploy "$@"
    ;;
  verify)
    SHA="${2:-$(git -C "$ROOT" rev-parse HEAD)}"
    URL="${PRODUCTION_URL:-https://airesume.projectdemo.guru}"
    cd "$ROOT"
    exec node scripts/verify-production-release.mjs "$SHA" "$URL"
    ;;
  backup|rollback|fix-500)
    printf 'ERROR: legacy direct production mutation is disabled. Use the approval-gated Production release workflow.\n' >&2
    printf 'See %s\n' "$DOC" >&2
    exit 64
    ;;
  *)
    cat >&2 <<USAGE
Safe ResumePilot production compatibility client

  $0 status
  $0 deploy [COMMIT_SHA] [BUNDLE_FILE]
  $0 verify [COMMIT_SHA]

Backup, rollback, and direct webroot repair subcommands were intentionally
removed. See $DOC.
USAGE
    exit 64
    ;;
esac
