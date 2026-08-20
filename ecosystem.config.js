/**
 * PM2 process definition for the ResumePilot AI backend (Hostinger Node.js hosting).
 *
 * The backend is the ONLY long-running process: it serves the API, the
 * enterprise console APIs, and (when ENTERPRISE_OUTBOX_WORKER_ENABLED=true)
 * the Firestore durable-outbox worker timer. There is no PostgreSQL, Redis,
 * broker, or KMS service to supervise.
 *
 * Copy the env block values from your secret store — never commit real values.
 * Full deployment/rollback runbook: docs/ENTERPRISE_LOCAL_INFRASTRUCTURE_HANDOFF.md
 */
module.exports = {
  apps: [
    {
      name: 'resumepilot-backend',
      cwd: __dirname,
      script: 'index.js',
      instances: 1,          // Enterprise leases make multi-instance safe, but
                             // start with one instance on shared hosting.
      exec_mode: 'fork',
      max_memory_restart: '600M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        PROTOCOL: 'https',
        WEBSITE_NAME: 'resumepilot.example',
        // ---- Firebase (identity + Firestore data plane + legacy product data) ----
        FIREBASE_PROJECT_ID: 'project-id',
        FIREBASE_DATABASE_URL: 'https://project-default-rtdb.firebaseio.com',
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@project-id.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nREPLACE\\n-----END PRIVATE KEY-----\\n',
        // ---- Enterprise plane (Firebase-only architecture) ----
        ENTERPRISE_TENANCY_ENABLED: 'true',
        ENTERPRISE_ENCRYPTION_KEYS: '{"v1":"REPLACE_WITH_openssl_rand_base64_32"}',
        TENANT_JOB_SIGNING_SECRET: 'REPLACE_WITH_openssl_rand_base64_32',
        TENANT_ARTIFACT_SIGNING_SECRET: 'REPLACE_WITH_openssl_rand_base64_32',
        ENTERPRISE_OUTBOX_WORKER_ENABLED: 'true',
        ENTERPRISE_OUTBOX_INTERVAL_MS: '15000',
        ENTERPRISE_STORAGE_PROVIDER: 'firebase-storage',
        // ---- Notifications / CMS (existing product workers) ----
        NOTIFICATION_OUTBOX_WORKER_ENABLED: 'true',
        CMS_SCHEDULER_ENABLED: 'false',
      },
    },
  ],
};
