-- Migration 039: Dynamic Tenant Branding & Whitelabel Implementation (Module 15 / FP-A15)
-- Adds explicit branding column to enterprise_tenant_configurations for custom logos, colors, fonts, and whitelabeling.

ALTER TABLE enterprise_tenant_configurations
    ADD COLUMN IF NOT EXISTS branding LONGTEXT NULL DEFAULT NULL AFTER commercials;
