-- Interview scorecard persistence (Mandate 12 workstream 3).
--
-- WHY: interview criteria, ratings, notes and stage recommendations were only
-- ever written onto the `applications` row (rating / notes /
-- extra_json.evaluationRecommendation). That is a single review slot per
-- application, so two reviewers silently overwrote each other and no review was
-- independently attributable or auditable.
--
-- SHAPE DECISIONS (validated against the real schema, not assumed):
--   * application_id / reviewer_id are VARCHAR(128), matching
--     `applications.id` and the user identifier width used everywhere else.
--   * ONE row per (application, reviewer): the unique key is the integrity rule
--     that stops a second reviewer from overwriting the first, and it is what the
--     upsert targets.
--   * `rating` 1..5 and the five-value `recommendation` vocabulary are CHECK
--     constraints as well as route validation, so no future writer can persist an
--     out-of-contract evaluation.
--   * FOREIGN KEY on application_id only: it gives real referential integrity and
--     cascades with the application. `reviewer_id` is intentionally NOT a foreign
--     key to `users` because reviewer identity is the verified principal from the
--     identity directory; an employer whose local user row is provisioned lazily
--     must still be able to record a review.
--   * The route also mirrors the same values into the legacy columns
--     (applications.rating / notes / extra_json) so existing consumers, exports
--     and the candidate drawer contract keep working; this table is the
--     relational authority going forward.

CREATE TABLE IF NOT EXISTS application_evaluations (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    application_id VARCHAR(128) NOT NULL,
    reviewer_id VARCHAR(128) NOT NULL,
    rating INT NOT NULL,
    recommendation VARCHAR(50) NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_app_reviewer (application_id, reviewer_id),
    INDEX idx_eval_app (application_id),
    INDEX idx_eval_reviewer (reviewer_id),
    CONSTRAINT chk_app_eval_rating CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT chk_app_eval_recommendation CHECK (
        recommendation IN ('STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO')
    ),
    CONSTRAINT fk_app_eval_application FOREIGN KEY (application_id)
        REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
