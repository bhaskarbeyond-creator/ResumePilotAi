#!/usr/bin/env node

console.error(`ERROR: scripts/deploy-live.mjs is retired because it copied directly into
live production without the restricted gateway and transactional health rollback.
Use the approval-gated GitHub "Production release" workflow instead.
See docs/SAFE_PRODUCTION_WORKFLOW.md.`);
process.exit(64);
