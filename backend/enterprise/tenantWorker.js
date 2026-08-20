'use strict';

const { validateTenantJobEnvelope } = require('./tenantJobs');

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

class EnterpriseQueueWorkerEngine {
  constructor({ signingSecret = process.env.TENANT_JOB_SIGNING_SECRET || (String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '' : 'staging-enterprise-secret-key-min-32chars!') } = {}) {
    this.signingSecret = signingSecret;
    this.jobQueue = [];
    this.deadLetterQueue = [];
    this.processedJobs = new Map();
    this.handlers = new Map();
    this.isRunning = false;
    this.metrics = {
      enqueuedTotal: 0,
      processedTotal: 0,
      failedTotal: 0,
      dlqTotal: 0,
      replayedTotal: 0,
    };
  }

  registerHandler(jobType, handler) {
    if (typeof handler !== 'function') throw new Error('Handler must be a function');
    this.handlers.set(String(jobType).toUpperCase(), handler);
  }

  async enqueue(envelope) {
    const validated = validateTenantJobEnvelope(envelope, this.signingSecret);
    const existing = this.processedJobs.get(validated.jobId);
    if (existing && existing.status === 'COMPLETED') {
      return { status: 'DUPLICATE_IGNORED', jobId: validated.jobId };
    }

    const jobRecord = {
      envelope: validated,
      jobId: validated.jobId,
      jobType: validated.jobType,
      tenantId: validated.tenantId,
      workspaceId: validated.workspaceId,
      attempts: 0,
      status: 'QUEUED',
      createdAt: Date.now(),
      nextRunAt: Date.now(),
      errors: [],
    };

    this.jobQueue.push(jobRecord);
    this.processedJobs.set(validated.jobId, jobRecord);
    this.metrics.enqueuedTotal++;

    return { status: 'ENQUEUED', jobId: validated.jobId, queueLength: this.jobQueue.length };
  }

  async processNextJob({ contextResolver = null } = {}) {
    if (this.jobQueue.length === 0) return null;

    const now = Date.now();
    const readyIndex = this.jobQueue.findIndex(job => job.nextRunAt <= now);
    if (readyIndex === -1) return null;

    const job = this.jobQueue.splice(readyIndex, 1)[0];
    job.attempts++;
    job.status = 'PROCESSING';

    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      job.status = 'FAILED';
      job.errors.push(`No handler registered for job type ${job.jobType}`);
      this.deadLetterQueue.push(job);
      this.metrics.dlqTotal++;
      return { status: 'FAILED_UNHANDLED', jobId: job.jobId };
    }

    try {
      // Reauthorize context if resolver provided
      if (contextResolver && typeof contextResolver === 'function') {
        const reauthContext = await contextResolver(job.envelope);
        if (!reauthContext || reauthContext.lifecycleState !== 'ACTIVE') {
          throw new Error('Tenant context reauthorization failed: tenant inactive or revoked');
        }
      }

      // Execute handler
      const result = await handler(job.envelope);
      job.status = 'COMPLETED';
      job.completedAt = Date.now();
      job.result = result;
      this.metrics.processedTotal++;
      return { status: 'COMPLETED', jobId: job.jobId, result };
    } catch (err) {
      job.errors.push({ attempt: job.attempts, error: err.message, timestamp: Date.now() });

      if (job.attempts >= MAX_ATTEMPTS) {
        job.status = 'DEAD_LETTER';
        this.deadLetterQueue.push(job);
        this.metrics.dlqTotal++;
        this.metrics.failedTotal++;
        return { status: 'DEAD_LETTER', jobId: job.jobId, error: err.message };
      } else {
        // Exponential backoff
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1);
        job.nextRunAt = Date.now() + backoffMs;
        job.status = 'RETRYING';
        this.jobQueue.push(job);
        this.metrics.failedTotal++;
        return { status: 'RETRY_SCHEDULED', jobId: job.jobId, backoffMs, nextRunAt: job.nextRunAt };
      }
    }
  }

  async drainAll({ contextResolver = null, maxIterations = 50 } = {}) {
    let iterations = 0;
    const results = [];
    while (this.jobQueue.length > 0 && iterations < maxIterations) {
      const res = await this.processNextJob({ contextResolver });
      if (res) results.push(res);
      iterations++;
    }
    return results;
  }

  replayDeadLetterJob(jobId) {
    const index = this.deadLetterQueue.findIndex(j => j.jobId === jobId);
    if (index === -1) return { status: 'NOT_FOUND', jobId };

    const job = this.deadLetterQueue.splice(index, 1)[0];
    job.attempts = 0;
    job.status = 'QUEUED';
    job.nextRunAt = Date.now();
    this.jobQueue.push(job);
    this.metrics.replayedTotal++;
    return { status: 'REPLAYED', jobId };
  }

  getStatus() {
    const healthy = Buffer.byteLength(String(this.signingSecret || '')) >= 32;
    return {
      status: healthy ? 'online' : 'misconfigured',
      healthy,
      durable: false,
      activeQueued: this.jobQueue.length,
      deadLetterCount: this.deadLetterQueue.length,
      metrics: { ...this.metrics },
    };
  }
}

module.exports = {
  EnterpriseQueueWorkerEngine,
};
