'use strict';

require('dotenv').config({ path: 'backend/.env' });
const { executeContentOperation, clearProviderConfigurationCache } = require('../services/aiRuntime');

async function verifyAllCandidateOperations() {
  clearProviderConfigurationCache();
  console.log('============================================================');
  console.log('   OPERATIONAL REALITY CHECK: CANDIDATE DASHBOARD AI CALLS  ');
  console.log('============================================================\n');

  const operations = [
    {
      operation: 'generate-skills',
      payload: {
        jobTitle: 'Senior Cloud Architect',
        candidateRoles: [
          {
            title: 'Lead Systems Engineer',
            employer: 'AWS Cloud Services',
            description: 'Designed multi-region serverless architectures and automated Kubernetes deployments using Terraform and Go.',
            startDate: '2021-01-01',
            endDate: '2024-06-01',
            current: false,
          },
        ],
      },
    },
    {
      operation: 'generate-certifications',
      payload: {
        jobTitle: 'Senior Cloud Architect',
        candidateRoles: [
          {
            title: 'Lead Systems Engineer',
            employer: 'AWS Cloud Services',
            description: 'Implemented zero-trust security and IAM policies across Kubernetes clusters.',
            startDate: '2021-01-01',
            endDate: '2024-06-01',
            current: false,
          },
        ],
      },
    },
    {
      operation: 'generate-projects',
      payload: {
        jobTitle: 'Full Stack Engineer',
        candidateRoles: [
          {
            title: 'Full Stack Developer',
            employer: 'FinTech Innovations',
            description: 'Built high-throughput payment transaction ledgers with React and Node.js.',
            startDate: '2022-03-01',
            current: true,
          },
        ],
      },
    },
    {
      operation: 'generate-summary',
      payload: {
        jobTitle: 'Senior Cloud Architect',
        candidateRoles: [
          {
            title: 'Senior DevOps Architect',
            employer: 'Global Enterprise Solutions',
            description: 'Led cloud transformation initiatives managing 100+ microservices.',
            startDate: '2020-01-01',
            endDate: '2024-01-01',
            current: false,
          },
        ],
        targetRole: 'VP of Cloud Infrastructure',
      },
    },
    {
      operation: 'generate-work-description',
      payload: {
        role: 'Senior Software Engineer',
        employer: 'Datadog',
        description: 'Developed distributed tracing pipelines handling 50k spans per second.',
        notes: 'Emphasize latency reduction, Kafka, and Golang microservices.',
      },
    },
    {
      operation: 'autocomplete',
      payload: {
        type: 'skill',
        query: 'Kuber',
      },
    },
  ];

  const results = [];
  let allPassed = true;

  for (const op of operations) {
    const startTime = Date.now();
    process.stdout.write(`Executing operation: ${op.operation.padEnd(30)} ... `);
    try {
      let res;
      for (let attempt = 1; attempt <= 2; attempt++) {
        res = await executeContentOperation({
          operation: op.operation,
          payload: op.payload,
          requestId: `op-verify-${Date.now()}`,
        });
        if (res.data?.diagnosticCode === 'RATE_LIMIT_EXCEEDED' && attempt < 2) {
          process.stdout.write('[429 backoff 4s] ');
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        break;
      }
      const latencyMs = Date.now() - startTime;
      const isFallback = Boolean(res.data?.aiUnavailable) || res.provider === 'fallback';

      if (isFallback) {
        allPassed = false;
        console.log(`[FALLBACK RETURNED] (${latencyMs}ms)`);
        console.log(`  Diagnostic: ${res.data?.diagnosticCode || 'N/A'}`);
        console.log(`  Note      : ${res.data?.note || 'N/A'}`);
        results.push({
          operation: op.operation,
          status: 'FAIL_FALLBACK',
          latencyMs,
          provider: res.provider,
          model: res.model,
          details: res.data,
        });
      } else {
        console.log(`[SUCCESS] (${latencyMs}ms) via ${res.provider}:${res.model}`);
        results.push({
          operation: op.operation,
          status: 'SUCCESS',
          latencyMs,
          provider: res.provider,
          model: res.model,
          dataSnippet: JSON.stringify(res.data).slice(0, 140),
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      allPassed = false;
      console.log(`[EXCEPTION] (${latencyMs}ms) -> ${err.message}`);
      results.push({
        operation: op.operation,
        status: 'EXCEPTION',
        latencyMs,
        error: err.message,
      });
    }
    // Polite pacing to honor free-tier per-minute rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n------------------------------------------------------------');
  console.log('               OPERATIONAL VERIFICATION SUMMARY             ');
  console.log('------------------------------------------------------------');
  for (const r of results) {
    console.log(`${r.operation.padEnd(32)} | ${r.status.padEnd(14)} | ${String(r.latencyMs + 'ms').padEnd(8)} | ${r.provider || '-'}:${r.model || '-'}`);
    if (r.dataSnippet) console.log(`   Sample: ${r.dataSnippet}...`);
  }
  console.log('============================================================');
  console.log(`OVERALL OPERATIONAL STATUS: ${allPassed ? '100% OPERATIONAL (NO FALLBACKS, NO BRICKING)' : 'DEGRADED / FALLBACKS PRESENT'}`);
  console.log('============================================================\n');

  if (!allPassed) {
    process.exitCode = 1;
  }
  return { allPassed, results };
}

if (require.main === module) {
  verifyAllCandidateOperations()
    .then((res) => {
      process.exit(res.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during candidate operations verification:', err);
      process.exit(1);
    });
}

module.exports = { verifyAllCandidateOperations };
