-- 62. Employer interview scheduling (FP-A15 / DISC-028).
--
-- One row per bookable interview slot owned by an employer. The booking itself
-- is a single conditional UPDATE (`... WHERE id = ? AND is_booked = 0`), so
-- exactly one of N concurrent bookings can win; the row state and the booking
-- identity are therefore never split across two writes.
--
-- PHYSICAL SCHEMA NOTES (adaptations from the proposed logical schema):
--   * `booked_by_app_id` is VARCHAR(128), not VARCHAR(64): `applications.id` is
--     VARCHAR(128) and a foreign key requires an identical type on both sides.
--   * `end_time > start_time` and the duration whitelist are enforced by CHECK
--     constraints, so an invalid interval cannot be persisted by any code path
--     (including a direct SQL client).
--   * `uq_interview_slot_employer_start` is the database-level guarantee that a
--     duplicate slot for the same employer/start can never be created, even if
--     two requests pass an application-side overlap pre-check at the same time.
--   * Deleting an application releases the slot (ON DELETE SET NULL) instead of
--     deleting the employer's calendar history; deleting the employer removes
--     their slots (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS interview_slots (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    employer_id VARCHAR(128) NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_minutes INT NOT NULL,
    is_booked BOOLEAN NOT NULL DEFAULT FALSE,
    booked_by_app_id VARCHAR(128) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_interview_slots_employer FOREIGN KEY (employer_id)
      REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_interview_slots_application FOREIGN KEY (booked_by_app_id)
      REFERENCES applications (id) ON DELETE SET NULL,
    CONSTRAINT chk_interview_slot_interval CHECK (end_time > start_time),
    CONSTRAINT chk_interview_slot_duration CHECK (duration_minutes IN (15, 30, 45, 60)),
    UNIQUE KEY uq_interview_slot_employer_start (employer_id, start_time),
    INDEX idx_interview_slots_employer_time (employer_id, start_time, end_time),
    INDEX idx_interview_slots_employer_booking (employer_id, is_booked, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
