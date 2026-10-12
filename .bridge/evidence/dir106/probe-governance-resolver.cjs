'use strict';
// DIR-106 debug: why does the ai-abuse quota test now refuse the first request?
process.env.NODE_ENV = 'test';
const { setPoolForTests } = require('./backend/database/mysql');
const { resolveAiGovernance } = require('./backend/security/aiGovernance');

class FakePool {
  constructor() { this.users = new Map([['user-1', { id: 'user-1', email: 'q@example.test', membership: 'Basic', paymentStatus: 'INACTIVE' }]]); }
  async query(sql, params = []) {
    const n = String(sql).replace(/\s+/g, ' ').trim();
    if (/^SELECT \* FROM users WHERE id = \? LIMIT 1$/i.test(n)) {
      const row = this.users.get(params[0]);
      return [[row ? { ...row } : null].filter(Boolean), []];
    }
    if (/^SELECT data FROM system_settings WHERE category = 'ai_quota' LIMIT 1$/i.test(n)) return [[], []];
    if (/FROM enterprise_memberships m/i.test(n)) return [[], []];
    throw new Error(`Unexpected pool SQL: ${n}`);
  }
  async getConnection() { throw new Error('not needed'); }
}

setPoolForTests(new FakePool());

(async () => {
  const req = { user: { uid: 'user-1', email: 'q@example.test', role: 'USER' } };
  try {
    const g = await resolveAiGovernance(req);
    console.log('source   :', g.source);
    console.log('reason   :', g.reason);
    console.log('tier     :', g.entitlement?.effectiveTier);
    console.log('dailyLimit:', g.entitlement?.dailyLimit);
    console.log('quota    :', JSON.stringify(g.quota));
  } catch (error) {
    console.log('THREW:', error.code || '', error.message);
  }
  process.exit(0);
})();
