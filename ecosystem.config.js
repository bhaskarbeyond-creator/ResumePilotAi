/**
 * PM2 process definition for the ResumePilot AI backend.
 *
 * Secrets and deployment-specific identifiers are intentionally absent. PM2
 * inherits them from the approved process environment or secret manager; do
 * not copy credentials into this tracked file. MariaDB owns application data,
 * while Firebase Admin is used only for identity operations.
 */
module.exports = {
  apps: [
    {
      name: 'resumepilot-backend',
      cwd: __dirname,
      script: 'backend/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        ENTERPRISE_TENANCY_ENABLED: 'false',
        ENTERPRISE_DATA_PROVIDER: 'mysql',
        ENTERPRISE_OUTBOX_WORKER_ENABLED: 'false',
        NOTIFICATION_OUTBOX_WORKER_ENABLED: 'true',
        CMS_SCHEDULER_ENABLED: 'false',
        TENANT_GC_WORKER_ENABLED: 'false',
      },
    },
  ],
};
