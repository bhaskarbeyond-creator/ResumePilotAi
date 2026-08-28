#!/usr/bin/env python3
"""Retired compatibility entrypoint for the former direct-SCP deployer."""

import sys

MESSAGE = """\
ERROR: scripts/deploy_production.py is retired because it copied directly into
live production without the restricted gateway and transactional health rollback.
Use the approval-gated GitHub 'Production release' workflow instead.
See docs/SAFE_PRODUCTION_WORKFLOW.md.
"""

sys.stderr.write(MESSAGE)
raise SystemExit(64)
