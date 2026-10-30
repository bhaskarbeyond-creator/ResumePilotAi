-- FP-B01 / FP-B02: enterprise tenant quotas and custom domains.
--
-- WHY THESE COLUMNS: `enterprise_tenants` previously carried no commercial
-- capacity at all, so `MySqlTenantRegistry.updateTenantProfile()` silently
-- discarded `seatQuota`, `monthlyAiCredits` and `customDomain`, and the seat
-- guard could only read a JSON `commercials.seatLimit` from
-- `enterprise_tenant_configurations`. Purchased capacity was therefore not a
-- property of the tenant record it belongs to.
--
-- seat_quota is deliberately NULLABLE:
--   NULL  = "no cap configured on the tenant record" (the established
--           `memberSeats.resolveSeatLimit` semantics) and enforcement keeps
--           falling back to `enterprise_tenant_configurations.commercials`.
--   >0    = an explicit purchased cap; the most restrictive positive cap wins.
-- A NOT NULL DEFAULT 5 would retroactively cap every existing enterprise tenant
-- at five seats, which is a commercial regression rather than a migration.
--
-- monthly_ai_credits is NOT NULL DEFAULT 1000: no code path reads it yet, so the
-- default cannot change existing tenant behaviour; it gives the platform console
-- a persisted, editable allowance instead of an implied one.
--
-- custom_domain is uniquely indexed (MySQL/MariaDB allow multiple NULLs), so two
-- tenants can never claim the same hostname.
--
-- Idempotent by construction (`IF NOT EXISTS`) because the runner executes each
-- statement independently and records the file version only after it succeeds.

ALTER TABLE enterprise_tenants
  ADD COLUMN IF NOT EXISTS seat_quota INT NULL DEFAULT NULL
    COMMENT 'Purchased enterprise seat cap; NULL means no tenant-level cap',
  ADD COLUMN IF NOT EXISTS monthly_ai_credits INT NOT NULL DEFAULT 1000
    COMMENT 'Monthly AI credit allowance for the tenant',
  ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Verified customer-owned hostname; unique across tenants';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ent_tenant_domain
  ON enterprise_tenants (custom_domain);
