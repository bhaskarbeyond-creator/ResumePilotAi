-- Reverse of 032_portfolio_custom_domains.sql
-- Drops only the objects created by migration 032. Verified custom-domain
-- ownership records are removed with the table: take a backup first.
DROP TABLE IF EXISTS portfolio_custom_domains;
