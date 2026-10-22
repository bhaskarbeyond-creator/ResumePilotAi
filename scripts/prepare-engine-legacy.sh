#!/usr/bin/env bash
# Immutable historical frontend source, isolated from the active checkout.
# Shared current locked dependencies/backend deliberately isolate UI-source differences.
set -Eeuo pipefail
: "${RUNNER_TEMP:?CI temporary directory required}"
: "${GITHUB_ENV:?CI environment file required}"
readonly reference=2abbbe4401efd1945e2749127605bb7f80afe941
git cat-file -e "$reference:frontend/package.json"
test -d frontend/node_modules
legacy="$(mktemp -d "$RUNNER_TEMP/engine-legacy.XXXXXX")"
git archive "$reference" frontend | tar -x -C "$legacy"
# Separate Vite optimizer cache; share packages, not writable .vite state.
mkdir -p "$legacy/frontend/node_modules"
for dependency in "$PWD"/frontend/node_modules/* "$PWD"/frontend/node_modules/.bin; do
  ln -s "$dependency" "$legacy/frontend/node_modules/$(basename "$dependency")"
done
printf 'LEGACY_FRONTEND_DIR=%s/frontend\n' "$legacy" >> "$GITHUB_ENV"
printf 'Historical frontend source: `%s`; current locked dependencies and current disposable backend (not a historical production deployment).\n' "$reference" >> "$GITHUB_STEP_SUMMARY"
