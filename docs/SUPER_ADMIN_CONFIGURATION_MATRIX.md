# Super Admin configuration matrix

This file is retained as the legacy short name. The authoritative expanded matrix is [`ADMIN_SUPER_ADMIN_CONFIGURATION_MATRIX.md`](./ADMIN_SUPER_ADMIN_CONFIGURATION_MATRIX.md).

The implementation exposes a secret-free configuration census at `GET /api/platform/configuration` and a governed runtime flag surface at `GET/PUT /api/platform/feature-flags`. Infrastructure-owned values are operational status only; they are not editable through the Admin UI. See the expanded matrix and the live runbook for exact ownership, restart, audit, and health semantics.
