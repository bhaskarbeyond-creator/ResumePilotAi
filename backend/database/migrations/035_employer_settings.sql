-- Persistent employer preferences (Mandate 12 workstream 2).
--
-- WHY A DEDICATED TABLE AND NOT `companies.extra_json` / `company_profiles`:
--   * `company_profiles` does not exist in this schema.
--   * `companies` is the employer's BRANDING entity, is revision/CAS guarded and
--     is owned by a different subsystem (POST/PATCH/DELETE /api/employer/companies).
--     Writing hiring preferences into its `extra_json` would make an unrelated
--     CAS revision bump invalidate an in-flight branding edit, and it cannot
--     represent an employer who has not created a company row yet.
--   * One row per verified employer uid is the smallest authority that can answer
--     "what did THIS employer choose", which is the tenant-isolation boundary the
--     settings endpoint enforces.
--
-- `company_name` is the hiring-communication display name used on candidate-facing
-- correspondence. It is seeded ONCE from the employer's primary company record
-- when the row is first created; after that the row is authoritative, so there is
-- exactly one source of truth per field.
--
-- Supported values are enforced here as well as in the route, so a future writer
-- cannot persist an unsupported duration or a negative archive window:
--   default_interview_duration must be one of the scheduler's 15/30/45/60 minutes
--   (interviewScheduling.SLOT_DURATIONS), and auto_archive_days is 0..3650 where
--   0 means "never auto-archive".

CREATE TABLE IF NOT EXISTS employer_settings (
    owner_id VARCHAR(128) NOT NULL PRIMARY KEY,
    company_name VARCHAR(160) NOT NULL DEFAULT '',
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    notification_email VARCHAR(254) NULL,
    default_interview_duration INT NOT NULL DEFAULT 30,
    auto_archive_days INT NOT NULL DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_employer_settings_duration
        CHECK (default_interview_duration IN (15, 30, 45, 60)),
    CONSTRAINT chk_employer_settings_archive
        CHECK (auto_archive_days >= 0 AND auto_archive_days <= 3650)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
