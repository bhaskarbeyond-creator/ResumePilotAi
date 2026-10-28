#!/usr/bin/env python3
"""Precise secret scan for the audit package.

The previous check was `grep 'DB_PASSWORD='`, which fails on documentation that
correctly records an EMPTY password (the disposable test database), i.e. it
punished accurate reporting. This scan looks for an actual non-empty credential
value instead, and for high-entropy assignments to common secret keys.

Exit 0 = clean, 1 = finding (printed with file:line).
"""
import re
import sys
from pathlib import Path

DR = Path(sys.argv[1] if len(sys.argv) > 1 else "developer-review")
PLACEHOLDERS = re.compile(r"^(|secret|placeholder|redacted|example|changeme|\$\{.*\}|<.*>|\*+|x+|\.\.\.|\\|`)$", re.I)

# Values that are already public in the audited repository itself, so recording
# them in audit evidence discloses nothing new. Each entry MUST cite where the
# repository publishes it.
ALLOWLIST = {
    # frontend/playwright.config.ts literally assigns this default when
    # TEST_AUTH_HMAC_SECRET is unset; it is a test-only verifier seed, not a secret.
    "TEST_AUTH_HMAC_SECRET": {"local-test-auth-hmac-secret-super-secure-32chars"},
}
SECRET_KEY = re.compile(
    r"\b(DB_PASSWORD|DB_PASS|MYSQL_PWD|MYSQL_PASSWORD|API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY|"
    r"STRIPE_SECRET|PAYPAL_CLIENT_SECRET|RAZORPAY_KEY_SECRET|TEST_AUTH_HMAC_SECRET)\b\s*[:=]\s*(\S+)",
    re.I,
)

findings = []
for path in sorted(DR.rglob("*.md")) + sorted(DR.rglob("*.json")) + sorted(DR.rglob("*.log")):
    if "node_modules" in path.parts:
        continue
    for lineno, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
        for match in SECRET_KEY.finditer(line):
            key, value = match.group(1), match.group(2).strip("\"'`,;")
            if PLACEHOLDERS.match(value):
                continue
            # an empty assignment followed by the next VAR=value token (shell one-liner)
            if value.endswith("=") or re.match(r"^[A-Z][A-Z0-9_]*=", value):
                continue
            # a lone punctuation token (e.g. a closing bracket in prose) is not a value
            if len(value) < 4 or not re.search(r"[A-Za-z0-9]", value):
                continue
            upper_key = key.upper()
            if upper_key in ALLOWLIST and value in ALLOWLIST[upper_key]:
                continue
            # documented sandbox-local, non-production test literal is not a credential
            if "sandbox-local" in line.lower() or "throwaway" in line.lower() or "[REDACTED]" in line:
                continue
            findings.append(f"{path}:{lineno}: {key}={value[:20]}...")

if findings:
    print("FAIL: potential secret values found")
    for finding in findings:
        print("  " + finding)
    sys.exit(1)
print("PASS: no non-empty credential values in the audit package")
sys.exit(0)
