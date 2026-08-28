#!/usr/bin/env bash
# ForcedCommand entrypoint for the dedicated GitHub Actions deployment key.
# Never invoke a shell supplied by SSH_ORIGINAL_COMMAND.
set -Eeuo pipefail
umask 077

readonly DEPLOY_LIB="$HOME/.local/lib/resumepilot-deploy"
readonly RECEIVER="$DEPLOY_LIB/remote-deploy.sh"
readonly ORIGINAL="${SSH_ORIGINAL_COMMAND:-}"
readonly CLEAN_PATH="/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"

[[ -x "$RECEIVER" ]] || { printf 'Deployment receiver is unavailable.\n' >&2; exit 126; }

if [[ "$ORIGINAL" == "status" ]]; then
  exec env -i HOME="$HOME" USER="$(id -un)" PATH="$CLEAN_PATH" \
    "$RECEIVER" status
fi

if [[ "$ORIGINAL" =~ ^release\ ([0-9a-f]{40})\ ([0-9a-f]{64})\ ([A-Za-z0-9_-]{86})$ ]]; then
  readonly SHA="${BASH_REMATCH[1]}"
  readonly BUNDLE_SHA256="${BASH_REMATCH[2]}"
  readonly SIGNATURE="${BASH_REMATCH[3]}"
  exec env -i HOME="$HOME" USER="$(id -un)" PATH="$CLEAN_PATH" \
    "$RECEIVER" receive "$SHA" "$BUNDLE_SHA256" "$SIGNATURE"
fi

printf 'Denied: this SSH key can only query status or stream a signed release bundle.\n' >&2
exit 126
