'use strict';
// Operator-provisioned evidence only. This is not a client-controlled score or a second router.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const TASKS = new Set(['resume-write', 'resume-extract', 'job-match', 'ats-format', 'groundedness', 'injection', 'grammar', 'multilingual', 'interview']);
const OPERATION_TASK = Object.freeze({ 'generate-summary': 'resume-write', 'generate-work-description': 'resume-write', 'generate-project-description': 'resume-write', 'parse-resume': 'resume-extract', 'check-grammar': 'grammar', 'generate-interview-questions': 'interview' });
function scopeFor(candidate, tenantContext) {
  // An unidentified tenant cannot inherit platform evidence.
  const tenant = tenantContext ? String(tenantContext.tenantId || tenantContext.id || 'unidentified-tenant') : 'platform';
  return createHash('sha256').update(JSON.stringify([tenant, candidate.provider, candidate.baseUrl?.replace(/\/$/, ''), candidate.model, candidate.key || ''])).digest('hex');
}
function readEvidence() {
  const path = process.env.FREELMAPI_QUALIFICATION_FILE;
  if (!path) return [];
  try {
    if (fs.statSync(path).size > 256 * 1024) return [];
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    return data.schemaVersion === 1 && Array.isArray(data.records) && data.records.length <= 256 ? data.records : [];
  } catch { return []; } // Malformed/missing evidence never becomes approval.
}
function qualificationFor(candidate, { task, tenantContext, json = false, outputTokens = 0, records = readEvidence(), now = Date.now() } = {}) {
  if (!task) return { status: 'not-requested' };
  if ((tenantContext && !tenantContext.tenantId && !tenantContext.id) || !TASKS.has(task)) return { status: 'unknown', task };
  const scope = scopeFor(candidate, tenantContext);
  const rows = records.filter(row => row && typeof row === 'object' && row.scope === scope && row.task === task && row.jsonMode === Boolean(json) && Number.isFinite(row.measuredAt) && row.measuredAt <= now && now - row.measuredAt <= 24 * 3600000);
  // Newest evidence wins, including a failed or unreviewed run. Old approvals cannot mask failures.
  const row = rows.sort((a, b) => b.measuredAt - a.measuredAt || Number(b.criticalPassed === false) - Number(a.criticalPassed === false))[0];
  if (!row) return { status: 'unknown', task };
  if (row.criticalPassed === false) return { status: 'failed', task, evidenceId: row.evidenceId };
  const reviewed = row.semanticReview?.approved === true && typeof row.semanticReview.reviewer === 'string' && row.semanticReview.reviewer.trim() && typeof row.semanticReview.reviewedCommit === 'string' && /^[a-f0-9]{40}$/.test(row.semanticReview.reviewedCommit) && row.semanticReview.reviewedCommit === row.sourceCommit;
  const qualified = row.criticalPassed === true && Number.isInteger(row.samples) && row.samples >= 3 && Number.isInteger(row.repeats) && row.repeats >= 3 && Number.isInteger(row.outputBudget) && row.outputBudget >= outputTokens && reviewed && typeof row.evidenceId === 'string' && row.evidenceId.trim().length > 0;
  return { status: qualified ? 'qualified' : 'tested-unqualified', task, evidenceId: row.evidenceId, semanticQuality: 'unknown-unless-independently-reviewed' };
}
module.exports = { TASKS, OPERATION_TASK, scopeFor, qualificationFor };
