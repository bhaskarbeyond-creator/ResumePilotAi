# Database Entity Parity: MariaDB (38 Tables) ↔ Firestore Collections

**Generated**: 2026-08-26T06:03:09.673Z  
**Total Certified Tables**: 38  
**Parity Metric**: 38/38 Entities Fully Mapped (100% Semantic Parity)  

| # | MariaDB Table | Firestore Path | Primary Key | Foreign Keys | Revision Guard | Query Methods | Mutation Methods |
|---|---|---|---|---|---|---|---|
| 1 | `admin_audit_logs` | `admin_audit_logs/{id}` | `id` | None | `N/A` | `getAdminAuditLogs` | `recordAdminAuditLog` |
| 2 | `applications` | `applications/{appId}` | `id` | job_id ➔ jobs(id)<br>employer_id ➔ users(id)<br>applicant_id ➔ users(id) | `revision` | `getApplication, getApplications` | `saveApplication, deleteApplication` |
| 3 | `blog` | `blog/{postId}` | `id` | None | `revision` | `getBlogPostBySlug, getBlogPosts` | `saveBlogPost, deleteBlogPost` |
| 4 | `canonical_documents` | `canonical_documents/{docId}` | `entity_type, entity_id` | None | `revision` | `getDocument, listDocuments` | `saveDocument, deleteDocument` |
| 5 | `companies` | `companies/{companyId}` | `id` | owner_id ➔ users(id) | `revision` | `getCompany, getCompanies` | `saveCompany, deleteCompany` |
| 6 | `contact_messages` | `contact/{msgId}` | `id` | None | `N/A` | `getContactMessages` | `saveContactMessage` |
| 7 | `conversations` | `conversations/{convId}` | `id` | None | `N/A` | `listDocuments` | `saveDocument` |
| 8 | `coupon_redemptions` | `coupon_redemptions/{id}` | `id` | coupon_code ➔ coupons(code) | `N/A` | `getCouponRedemption` | `saveCouponRedemption, deleteCouponRedemption` |
| 9 | `coupons` | `coupons/{couponId}` | `code` | None | `revision` | `getCoupon` | `saveCoupon` |
| 10 | `covers` | `users/{uid}/covers/{coverId}` | `id` | user_id ➔ users(id) | `N/A` | `getCover, getCovers` | `saveCover, deleteCover` |
| 11 | `custom_pages` | `custom_pages/{pageId}` | `id` | None | `N/A` | `getCustomPageBySlug, getCustomPages` | `saveCustomPage, deleteCustomPage` |
| 12 | `database_authority` | `settings/database_authority` | `id` | None | `N/A` | `getSetting` | `saveSetting` |
| 13 | `database_engine_state` | `settings/database_engine_state` | `id` | None | `N/A` | `getSetting` | `saveSetting` |
| 14 | `database_switch_audit` | `security_audit_logs/{id}` | `id` | None | `N/A` | `getSecurityAuditLogs` | `recordSecurityAuditLog` |
| 15 | `failover_events` | `security_audit_logs/{id}` | `id` | None | `N/A` | `getSecurityAuditLogs` | `recordSecurityAuditLog` |
| 16 | `favourites` | `users/{uid}/favourites/{favId}` | `id` | user_id ➔ users(id) | `N/A` | `listDocuments` | `saveDocument, deleteDocument` |
| 17 | `job_tracker` | `users/{uid}/job_tracker/{id}` | `id` | user_id ➔ users(id) | `N/A` | `listDocuments` | `saveDocument, deleteDocument` |
| 18 | `jobs` | `jobs/{jobId}` | `id` | employer_id ➔ users(id) | `revision` | `getJob, getJobs` | `saveJob, deleteJob` |
| 19 | `messages` | `messages/{msgId}` | `id` | conversation_id ➔ conversations(id) | `N/A` | `listDocuments` | `saveDocument, deleteDocument` |
| 20 | `notifications` | `users/{uid}/notifications/{id}` | `id` | user_id ➔ users(id) | `N/A` | `getNotifications` | `saveNotification` |
| 21 | `payment_orders` | `payment_orders/{orderId}` | `id` | None | `revision` | `getPaymentOrder, findPaymentOrderByProviderIntent, getUserPaymentOrders` | `savePaymentOrder` |
| 22 | `payment_webhook_events` | `payment_webhook_events/{id}` | `event_id` | None | `N/A` | `claimWebhookEvent` | `claimWebhookEvent` |
| 23 | `portfolios` | `users/{uid}/portfolios/{portfolioId}` | `id` | user_id ➔ users(id) | `N/A` | `getPortfolio, getPortfolios` | `savePortfolio, deletePortfolio` |
| 24 | `processed_mutations` | `processed_mutations/{mutationId}` | `mutation_id` | None | `N/A` | `getSetting` | `saveSetting` |
| 25 | `public_resumes` | `pb/{resumeId}` | `id` | None | `source_revision` | `getPublicResume, getResumePublication` | `publishResume, unpublishResume` |
| 26 | `resumes` | `users/{uid}/resumes/{resumeId}` | `id` | user_id ➔ users(id) | `revision` | `getResume, getResumes, getUserContentCounts` | `saveResume, deleteResume` |
| 27 | `reviews` | `reviews/{reviewId}` | `id` | None | `N/A` | `getReview` | `saveReview, deleteReview` |
| 28 | `security_audit_logs` | `security_audit_logs/{id}` | `id` | None | `N/A` | `getSecurityAuditLogs` | `recordSecurityAuditLog` |
| 29 | `stats` | `data/stats` | `id` | None | `N/A` | `getStats` | `incrementStat` |
| 30 | `subscriptions` | `data/subscriptions` | `id` | None | `N/A` | `getSetting` | `saveSetting` |
| 31 | `sync_conflicts` | `sync_conflicts/{id}` | `id` | None | `mysql_version` | `getSetting` | `saveSetting` |
| 32 | `sync_outbox` | `sync_outbox/{id}` | `id` | None | `version` | `getSetting` | `saveSetting` |
| 33 | `sync_tombstones` | `sync_tombstones/{id}` | `entity_type, entity_id` | None | `version` | `getSetting` | `saveSetting` |
| 34 | `sync_worker_state` | `settings/sync_worker_state` | `worker_id` | None | `N/A` | `getSetting` | `saveSetting` |
| 35 | `system_settings` | `settings/{category} & data/{category}` | `category` | None | `revision` | `getSetting` | `saveSetting` |
| 36 | `transactions` | `orders/{orderId}` | `id` | None | `N/A` | `getPaymentOrder` | `savePaymentOrder` |
| 37 | `trusted_by` | `trusted_by/{id}` | `id` | None | `N/A` | `getTrustedBy` | `saveTrustedBy, deleteTrustedBy` |
| 38 | `users` | `users/{uid}` | `id` | None | `revision` | `getUser, getUserByEmail, getUsers` | `saveUser, deleteUser` |

## Detailed Entity Specifications

### 1. `admin_audit_logs` ↔ `admin_audit_logs/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `actor_uid`, `action`, `created_at`
- **Nullable Fields (12)**: `actor_email`, `actor_role`, `category`, `severity`, `outcome`, `method`, `pathname`, `status_code`, `resource_type`, `resource_id`, `metadata`, `request_id`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getAdminAuditLogs`
- **Equivalent Mutation Methods**: `recordAdminAuditLog`

### 2. `applications` ↔ `applications/{appId}`

- **Primary Key**: `id`
- **Foreign Keys**: `job_id` references `jobs(id)` [ON DELETE CASCADE], `employer_id` references `users(id)` [ON DELETE CASCADE], `applicant_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (7)**: `id`, `job_id`, `employer_id`, `applicant_id`, `created_at`, `updated_at`, `revision`
- **Nullable Fields (10)**: `applicant_name`, `applicant_email`, `applicant_phone`, `resume_id`, `resume_url`, `cover_letter`, `status`, `rating`, `notes`, `extra_json`
- **JSON Columns (2)**: `cover_letter`, `notes`
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getApplication`, `getApplications`
- **Equivalent Mutation Methods**: `saveApplication`, `deleteApplication`

### 3. `blog` ↔ `blog/{postId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (6)**: `id`, `title`, `slug`, `created_at`, `updated_at`, `revision`
- **Nullable Fields (13)**: `content`, `excerpt`, `cover_image`, `author`, `author_id`, `category`, `tags`, `published`, `published_at`, `views`, `likes`, `status`, `scheduled_at`
- **JSON Columns (1)**: `content`
- **Date/Temporal Columns (4)**: `published_at`, `created_at`, `updated_at`, `scheduled_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getBlogPostBySlug`, `getBlogPosts`
- **Equivalent Mutation Methods**: `saveBlogPost`, `deleteBlogPost`

### 4. `canonical_documents` ↔ `canonical_documents/{docId}`

- **Primary Key**: `entity_type, entity_id`
- **Foreign Keys**: None
- **Required Fields (6)**: `entity_type`, `entity_id`, `payload`, `revision`, `created_at`, `updated_at`
- **Nullable Fields (1)**: `deleted_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (3)**: `deleted_at`, `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getDocument`, `listDocuments`
- **Equivalent Mutation Methods**: `saveDocument`, `deleteDocument`

### 5. `companies` ↔ `companies/{companyId}`

- **Primary Key**: `id`
- **Foreign Keys**: `owner_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (6)**: `id`, `owner_id`, `name`, `created_at`, `updated_at`, `revision`
- **Nullable Fields (9)**: `logo`, `website`, `description`, `industry`, `size`, `location`, `verified`, `extra_json`, `status`
- **JSON Columns (1)**: `description`
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getCompany`, `getCompanies`
- **Equivalent Mutation Methods**: `saveCompany`, `deleteCompany`

### 6. `contact_messages` ↔ `contact/{msgId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `email`, `created_at`, `updated_at`
- **Nullable Fields (6)**: `name`, `message`, `website`, `status`, `ip`, `is_read`
- **JSON Columns (1)**: `message`
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getContactMessages`
- **Equivalent Mutation Methods**: `saveContactMessage`

### 7. `conversations` ↔ `conversations/{convId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `participant1_id`, `participant2_id`, `created_at`, `updated_at`
- **Nullable Fields (2)**: `last_message`, `unread_count`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `listDocuments`
- **Equivalent Mutation Methods**: `saveDocument`

### 8. `coupon_redemptions` ↔ `coupon_redemptions/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: `coupon_code` references `coupons(code)` [ON DELETE CASCADE]
- **Required Fields (5)**: `id`, `uid`, `coupon_code`, `order_id`, `updated_at`
- **Nullable Fields (3)**: `status`, `expires_at`, `used_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (3)**: `expires_at`, `used_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getCouponRedemption`
- **Equivalent Mutation Methods**: `saveCouponRedemption`, `deleteCouponRedemption`

### 9. `coupons` ↔ `coupons/{couponId}`

- **Primary Key**: `code`
- **Foreign Keys**: None
- **Required Fields (4)**: `code`, `discount`, `created_at`, `updated_at`
- **Nullable Fields (7)**: `description`, `active`, `expiry_date`, `max_uses`, `used_count`, `single_use_per_user`, `revision`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (3)**: `expiry_date`, `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getCoupon`
- **Equivalent Mutation Methods**: `saveCoupon`

### 10. `covers` ↔ `users/{uid}/covers/{coverId}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (5)**: `id`, `user_id`, `title`, `created_at`, `updated_at`
- **Nullable Fields (2)**: `template`, `data`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getCover`, `getCovers`
- **Equivalent Mutation Methods**: `saveCover`, `deleteCover`

### 11. `custom_pages` ↔ `custom_pages/{pageId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `title`, `slug`, `created_at`, `updated_at`
- **Nullable Fields (5)**: `content`, `published`, `nav_order`, `show_in_nav`, `show_in_footer`
- **JSON Columns (1)**: `content`
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getCustomPageBySlug`, `getCustomPages`
- **Equivalent Mutation Methods**: `saveCustomPage`, `deleteCustomPage`

### 12. `database_authority` ↔ `settings/database_authority`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `generation`, `write_engine`, `mode`, `updated_at`
- **Nullable Fields (3)**: `lease_owner`, `lease_expires_at`, `reason`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `lease_expires_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 13. `database_engine_state` ↔ `settings/database_engine_state`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `active_engine`, `standby_engine`, `sync_mode`, `last_switched_at`
- **Nullable Fields (3)**: `last_switched_by`, `switch_in_progress`, `switch_lock_expires_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `last_switched_at`, `switch_lock_expires_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 14. `database_switch_audit` ↔ `security_audit_logs/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (6)**: `id`, `switched_by`, `from_engine`, `to_engine`, `status`, `created_at`
- **Nullable Fields (1)**: `error_message`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSecurityAuditLogs`
- **Equivalent Mutation Methods**: `recordSecurityAuditLog`

### 15. `failover_events` ↔ `security_audit_logs/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (3)**: `id`, `event_type`, `created_at`
- **Nullable Fields (5)**: `from_engine`, `to_engine`, `mode`, `reason`, `payload`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSecurityAuditLogs`
- **Equivalent Mutation Methods**: `recordSecurityAuditLog`

### 16. `favourites` ↔ `users/{uid}/favourites/{favId}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (4)**: `id`, `user_id`, `item_id`, `created_at`
- **Nullable Fields (2)**: `item_type`, `data`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `listDocuments`
- **Equivalent Mutation Methods**: `saveDocument`, `deleteDocument`

### 17. `job_tracker` ↔ `users/{uid}/job_tracker/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (6)**: `id`, `user_id`, `job_title`, `company`, `created_at`, `updated_at`
- **Nullable Fields (9)**: `status`, `location`, `salary`, `date_applied`, `url`, `notes`, `contact_person`, `contact_email`, `deadline`
- **JSON Columns (1)**: `notes`
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `listDocuments`
- **Equivalent Mutation Methods**: `saveDocument`, `deleteDocument`

### 18. `jobs` ↔ `jobs/{jobId}`

- **Primary Key**: `id`
- **Foreign Keys**: `employer_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (6)**: `id`, `employer_id`, `title`, `created_at`, `updated_at`, `revision`
- **Nullable Fields (17)**: `company_name`, `company_logo`, `description`, `requirements`, `location`, `job_type`, `workplace_type`, `salary_min`, `salary_max`, `salary_currency`, `experience_level`, `skills`, `status`, `applicants_count`, `featured`, `expires_at`, `extra_json`
- **JSON Columns (1)**: `description`
- **Date/Temporal Columns (3)**: `expires_at`, `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getJob`, `getJobs`
- **Equivalent Mutation Methods**: `saveJob`, `deleteJob`

### 19. `messages` ↔ `messages/{msgId}`

- **Primary Key**: `id`
- **Foreign Keys**: `conversation_id` references `conversations(id)` [ON DELETE CASCADE]
- **Required Fields (5)**: `id`, `conversation_id`, `sender_id`, `receiver_id`, `created_at`
- **Nullable Fields (3)**: `content`, `is_read`, `read_at`
- **JSON Columns (1)**: `content`
- **Date/Temporal Columns (2)**: `read_at`, `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `listDocuments`
- **Equivalent Mutation Methods**: `saveDocument`, `deleteDocument`

### 20. `notifications` ↔ `users/{uid}/notifications/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (4)**: `id`, `user_id`, `created_at`, `updated_at`
- **Nullable Fields (8)**: `event_id`, `type`, `title`, `message`, `data`, `is_read`, `state`, `delivery_state`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getNotifications`
- **Equivalent Mutation Methods**: `saveNotification`

### 21. `payment_orders` ↔ `payment_orders/{orderId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (10)**: `id`, `uid`, `plan_id`, `provider`, `amount`, `currency`, `created_at`, `updated_at`, `revision`, `recovery_needed`
- **Nullable Fields (17)**: `original_amount`, `coupon_code`, `coupon_discount`, `single_use_per_user`, `status`, `membership_ends`, `provider_payment_id`, `provider_order_id`, `provider_payment_intent_id`, `provider_client_secret`, `failure_code`, `activated_at`, `reversed_at`, `mutation_id`, `recovery_reason`, `last_payment_gateway`, `provider_refund_id`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (5)**: `membership_ends`, `activated_at`, `reversed_at`, `created_at`, `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getPaymentOrder`, `findPaymentOrderByProviderIntent`, `getUserPaymentOrders`
- **Equivalent Mutation Methods**: `savePaymentOrder`

### 22. `payment_webhook_events` ↔ `payment_webhook_events/{id}`

- **Primary Key**: `event_id`
- **Foreign Keys**: None
- **Required Fields (4)**: `event_id`, `provider`, `event_type`, `received_at`
- **Nullable Fields (2)**: `order_id`, `payload`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `received_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `claimWebhookEvent`
- **Equivalent Mutation Methods**: `claimWebhookEvent`

### 23. `portfolios` ↔ `users/{uid}/portfolios/{portfolioId}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (5)**: `id`, `user_id`, `title`, `created_at`, `updated_at`
- **Nullable Fields (3)**: `theme`, `is_published`, `data`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getPortfolio`, `getPortfolios`
- **Equivalent Mutation Methods**: `savePortfolio`, `deletePortfolio`

### 24. `processed_mutations` ↔ `processed_mutations/{mutationId}`

- **Primary Key**: `mutation_id`
- **Foreign Keys**: None
- **Required Fields (6)**: `mutation_id`, `entity_type`, `entity_id`, `operation`, `source_engine`, `processed_at`
- **Nullable Fields (0)**: ``
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `processed_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 25. `public_resumes` ↔ `pb/{resumeId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (3)**: `id`, `owner_uid`, `updated_at`
- **Nullable Fields (6)**: `is_published`, `publication_mode`, `object`, `source_revision`, `publication_revision`, `published_at`
- **JSON Columns (1)**: `object`
- **Date/Temporal Columns (2)**: `published_at`, `updated_at`
- **Revision Field**: `source_revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getPublicResume`, `getResumePublication`
- **Equivalent Mutation Methods**: `publishResume`, `unpublishResume`

### 26. `resumes` ↔ `users/{uid}/resumes/{resumeId}`

- **Primary Key**: `id`
- **Foreign Keys**: `user_id` references `users(id)` [ON DELETE CASCADE]
- **Required Fields (5)**: `id`, `user_id`, `title`, `created_at`, `updated_at`
- **Nullable Fields (31)**: `template`, `revision`, `firstname`, `lastname`, `email`, `phone`, `occupation`, `country`, `city`, `address`, `postalcode`, `website`, `linkedin`, `github`, `photo`, `showPhoto`, `summary`, `employments`, `educations`, `skills`, `languages`, `hobbies`, `projects`, `certifications`, `achievements`, `references`, `customSections`, `sectionOrder`, `hiddenSections`, `completedSteps`, `deleted_at`
- **JSON Columns (2)**: `photo`, `summary`
- **Date/Temporal Columns (3)**: `created_at`, `updated_at`, `deleted_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `CASCADE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getResume`, `getResumes`, `getUserContentCounts`
- **Equivalent Mutation Methods**: `saveResume`, `deleteResume`

### 27. `reviews` ↔ `reviews/{reviewId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `name`, `created_at`, `updated_at`
- **Nullable Fields (7)**: `role`, `company`, `avatar`, `content`, `rating`, `featured`, `status`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getReview`
- **Equivalent Mutation Methods**: `saveReview`, `deleteReview`

### 28. `security_audit_logs` ↔ `security_audit_logs/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `actor_uid`, `action`, `created_at`
- **Nullable Fields (8)**: `target_uid`, `category`, `severity`, `target_type`, `target_id`, `changes`, `metadata`, `request_id`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSecurityAuditLogs`
- **Equivalent Mutation Methods**: `recordSecurityAuditLog`

### 29. `stats` ↔ `data/stats`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (3)**: `id`, `data`, `updated_at`
- **Nullable Fields (0)**: ``
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getStats`
- **Equivalent Mutation Methods**: `incrementStat`

### 30. `subscriptions` ↔ `data/subscriptions`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `user_id`, `created_at`, `updated_at`
- **Nullable Fields (2)**: `type`, `payment_type`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 31. `sync_conflicts` ↔ `sync_conflicts/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `entity_type`, `entity_id`, `resolution`, `created_at`
- **Nullable Fields (8)**: `mysql_version`, `firestore_version`, `mysql_hash`, `firestore_hash`, `mysql_payload`, `firestore_payload`, `resolved_by`, `resolved_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `resolved_at`, `created_at`
- **Revision Field**: `mysql_version`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 32. `sync_outbox` ↔ `sync_outbox/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (12)**: `id`, `entity_type`, `entity_id`, `operation`, `version`, `source_engine`, `content_hash`, `status`, `retry_count`, `max_retries`, `created_at`, `updated_at`
- **Nullable Fields (5)**: `payload`, `last_error`, `processed_at`, `mutation_id`, `idempotency_key`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (3)**: `created_at`, `processed_at`, `updated_at`
- **Revision Field**: `version`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 33. `sync_tombstones` ↔ `sync_tombstones/{id}`

- **Primary Key**: `entity_type, entity_id`
- **Foreign Keys**: None
- **Required Fields (6)**: `entity_type`, `entity_id`, `version`, `mutation_id`, `source_engine`, `deleted_at`
- **Nullable Fields (0)**: ``
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `deleted_at`
- **Revision Field**: `version`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 34. `sync_worker_state` ↔ `settings/sync_worker_state`

- **Primary Key**: `worker_id`
- **Foreign Keys**: None
- **Required Fields (7)**: `worker_id`, `worker_pid`, `worker_status`, `last_heartbeat_at`, `consecutive_failures`, `total_events_processed`, `created_at`
- **Nullable Fields (4)**: `last_sync_started_at`, `last_sync_completed_at`, `last_successful_event_at`, `last_failed_event_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (6)**: `last_heartbeat_at`, `last_sync_started_at`, `last_sync_completed_at`, `last_successful_event_at`, `last_failed_event_at`, `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 35. `system_settings` ↔ `settings/{category} & data/{category}`

- **Primary Key**: `category`
- **Foreign Keys**: None
- **Required Fields (3)**: `category`, `data`, `updated_at`
- **Nullable Fields (1)**: `revision`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `updated_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getSetting`
- **Equivalent Mutation Methods**: `saveSetting`

### 36. `transactions` ↔ `orders/{orderId}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `user_id`, `txn_id`, `created_at`
- **Nullable Fields (14)**: `plan_name`, `plan_type`, `payment_method`, `amount`, `subtotal`, `tax_amount`, `tax_rate`, `tax_name`, `company_tax_id`, `customer_tax_id`, `currency`, `status`, `duration_months`, `created_date_string`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (1)**: `created_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getPaymentOrder`
- **Equivalent Mutation Methods**: `savePaymentOrder`

### 37. `trusted_by` ↔ `trusted_by/{id}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (4)**: `id`, `name`, `created_at`, `updated_at`
- **Nullable Fields (4)**: `logo_url`, `website_url`, `display_order`, `active`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (2)**: `created_at`, `updated_at`
- **Revision Field**: `None`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `IMPLICIT`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getTrustedBy`
- **Equivalent Mutation Methods**: `saveTrustedBy`, `deleteTrustedBy`

### 38. `users` ↔ `users/{uid}`

- **Primary Key**: `id`
- **Foreign Keys**: None
- **Required Fields (5)**: `id`, `email`, `created_at`, `updated_at`, `revision`
- **Nullable Fields (24)**: `firstname`, `lastname`, `displayName`, `photoUrl`, `avatarUrl`, `phone`, `jobTitle`, `bio`, `city`, `country`, `website`, `membership`, `membershipEnds`, `paymentStatus`, `lastPaymentGateway`, `lastPaymentOrderId`, `lastPaymentAmount`, `lastPaymentCurrency`, `lastPaymentDate`, `cancellationRequested`, `suspended`, `role`, `extra_data`, `deleted_at`
- **JSON Columns (0)**: None
- **Date/Temporal Columns (5)**: `membershipEnds`, `lastPaymentDate`, `created_at`, `updated_at`, `deleted_at`
- **Revision Field**: `revision`
- **Deletion Semantics**: `HARD_DELETE_AND_TOMBSTONE`
- **Tombstone Semantics**: `PERSISTED_IN_SYNC_TOMBSTONES`
- **Idempotency Semantics**: `MUTATION_ID_DEDUPLICATION_GUARD`
- **Equivalent Query Methods**: `getUser`, `getUserByEmail`, `getUsers`
- **Equivalent Mutation Methods**: `saveUser`, `deleteUser`

