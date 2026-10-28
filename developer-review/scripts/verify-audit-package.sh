#!/usr/bin/env bash
# Verification script for Senior Architectural Mandate v3 audit package
# Run: bash developer-review/scripts/verify-audit-package.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DR="$ROOT/developer-review"
echo "=== Audit Package Verification ==="
echo "Repo root: $ROOT"
echo "DR: $DR"
fail=0
pass=0
check() {
  local desc="$1"; local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1)); else echo "FAIL: $desc"; fail=$((fail+1)); fi
}
check_file() {
  if [[ -f "$DR/$1" ]]; then echo "PASS: exists $1"; pass=$((pass+1)); else echo "FAIL: missing $1"; fail=$((fail+1)); fi
}
echo "--- Required artifacts (20) ---"
check_file "README.md"
check_file "EXECUTIVE-GAP-SUMMARY.md"
check_file "DISCREPANCY-LOG.md"
check_file "SWOT-ANALYSIS.md"
check_file "UI-UX-AUDIT.md"
check_file "REPAIR-ACTION-PLAN.md"
check_file "PROVENANCE.md"
check_file "REQUIREMENT-REGISTER.md"
check_file "EVIDENCE-INDEX.md"
check_file "SECURITY-ASSESSMENT.md"
check_file "INTEGRATIONS-INVENTORY.md"
check_file "DATABASE-INVENTORY.md"
check_file "PARITY-MATRIX-V2.md"
check_file "HANDOVER.md"
check_file "appendix/PARITY-MATRIX.md"
check_file "appendix/REFUTED-CANDIDATES.md"
check_file "appendix/UNVERIFIED-SUSPICIONS.md"
check_file "appendix/ENVIRONMENT-GAPS.md"
check_file "appendix/INVENTORIES/routes.md"
check_file "appendix/INVENTORIES/database.md"
check_file "appendix/INVENTORIES/environment-config.md"
check_file "appendix/INVENTORIES/external-integrations.md"
check_file "appendix/INVENTORIES/frontend.md"
check_file "appendix/INVENTORIES/security-tenant-isolation.md"
check_file "appendix/INVENTORIES/tests.md"
check_file "appendix/UI-STATE-MATRIX.md"
check_file "scripts/verify-audit-package.sh"
echo "--- Content checks ---"
check "README mentions PROVENANCE" "grep -q PROVENANCE \"$DR/README.md\""
check "REQUIREMENT-REGISTER has PASS counts" "grep -q \"PASS\" \"$DR/REQUIREMENT-REGISTER.md\""
check "EVIDENCE-INDEX has E-010 tenant isolation" "grep -q \"E-010\" \"$DR/EVIDENCE-INDEX.md\""
check "DISCREPANCY-LOG has 7 findings" "grep -q \"DISC-007\" \"$DR/DISCREPANCY-LOG.md\""
check "No application source modified (git diff excludes DR)" "bash -c 'git -C \"$ROOT\" diff --name-only HEAD | grep -v \"^developer-review/\" | grep -q \"\" && exit 1 || exit 0'"
check "Secret scan: no DB_PASSWORD value in DR" "! grep -R --include='*.md' 'DB_PASSWORD=' \"$DR\" | grep -v 'DB_PASSWORD.*secret' | grep -v 'DB_PASSWORD.*placeholder' | grep -v 'grep -r' | grep -q 'DB_PASSWORD='"
check "Refuted candidates updated (RC-002 High)" "grep -q \"Confidence (updated):.*High\" \"$DR/appendix/REFUTED-CANDIDATES.md\""
echo "--- Summary ---"
echo "PASS: $pass  FAIL: $fail"
if [[ $fail -gt 0 ]]; then echo "VERIFICATION FAILED"; exit 1; else echo "VERIFICATION PASSED"; fi
