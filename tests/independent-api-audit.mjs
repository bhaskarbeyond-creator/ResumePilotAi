import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../backend/database/mysql.js';
import { getRepository } from '../backend/repositories/index.js';
import { loadProviderConfiguration } from '../backend/services/aiRuntime.js';
import { loadAiAdminSettings } from '../backend/services/aiAdmin.js';
import { getPlatformCurrencyConfig } from '../backend/services/platformCurrency.js';
import { getPaymentSettingsProjection } from '../backend/services/paymentAdmin.js';
import { getUserAiEntitlement } from '../backend/services/adminAiEntitlement.js';

describe('Independent Dual-Database API Audit: MariaDB vs Firestore', () => {
  let mockFirestoreQuotaExhaustedDb;

  before(async () => {
    getPool();
    // Simulate a Firestore DB where every single query throws RESOURCE_EXHAUSTED
    mockFirestoreQuotaExhaustedDb = {
      collection: (_colName) => ({
        doc: (_docId) => ({
          get: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          },
          set: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          },
          delete: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          },
        }),
        where: () => ({
          limit: () => ({
            get: async () => {
              const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
              err.code = 8;
              throw err;
            },
            count: () => ({
              get: async () => {
                const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
                err.code = 8;
                throw err;
              }
            })
          }),
          count: () => ({
            get: async () => {
              const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
              err.code = 8;
              throw err;
            }
          }),
          get: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          }
        }),
        limit: () => ({
          get: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          }
        }),
        count: () => ({
          get: async () => {
            const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
            err.code = 8;
            throw err;
          }
        }),
        orderBy: () => ({
          limit: () => ({
            get: async () => {
              const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
              err.code = 8;
              throw err;
            }
          })
        }),
        get: async () => {
          const err = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
          err.code = 8;
          throw err;
        }
      })
    };
  });

  describe('1. AI Configuration & Provider Loading Independence', () => {
    it('loadProviderConfiguration succeeds with MariaDB when Firestore is quota-exhausted', async () => {
      const config = await loadProviderConfiguration(mockFirestoreQuotaExhaustedDb);
      assert.ok(config, 'Config must be returned');
      assert.ok(config.providers, 'Providers map must exist');
      assert.ok(config.primary, 'Primary provider must be resolved');
    });

    it('loadAiAdminSettings succeeds with MariaDB when Firestore is quota-exhausted', async () => {
      const adminSettings = await loadAiAdminSettings(mockFirestoreQuotaExhaustedDb);
      assert.ok(adminSettings, 'Admin settings must be returned');
      assert.ok(adminSettings.settings, 'Settings object must exist');
      assert.ok(adminSettings.configuredProviders, 'Configured providers map must exist');
    });

    it('getUserAiEntitlement succeeds with MariaDB when Firestore is quota-exhausted', async () => {
      const entitlement = await getUserAiEntitlement({ db: mockFirestoreQuotaExhaustedDb, uid: 'test-audit-user-123' });
      assert.ok(entitlement, 'Entitlement must be returned');
      assert.equal(typeof (entitlement.effectiveLimit || entitlement.dailyLimit), 'number');
      assert.equal(typeof entitlement.remainingToday, 'number');
    });
  });

  describe('2. Currency & Payment Services Independence', () => {
    it('getPlatformCurrencyConfig succeeds with MariaDB when Firestore is quota-exhausted', async () => {
      const currency = await getPlatformCurrencyConfig(mockFirestoreQuotaExhaustedDb);
      assert.ok(currency, 'Currency must be returned');
      assert.ok(currency.code, 'Currency code must be defined');
    });

    it('getPaymentSettingsProjection succeeds with MariaDB when Firestore is quota-exhausted', async () => {
      const payments = await getPaymentSettingsProjection(mockFirestoreQuotaExhaustedDb);
      assert.ok(payments, 'Payment projection must be returned');
      assert.ok(payments.settings, 'Settings must exist');
      assert.ok(payments.publicKeys, 'Public keys must exist');
    });
  });

  describe('3. Repository Layer Independence (All Entities)', () => {
    it('repository handles users CRUD on MariaDB independently', async () => {
      const repo = getRepository(mockFirestoreQuotaExhaustedDb);
      const testUid = 'audit-user-' + Date.now();
      
      // Save
      await repo.saveUser(testUid, { email: `${testUid}@test.local`, firstname: 'Audit', lastname: 'User', membership: 'Free' });
      
      // Get
      const fetched = await repo.getUser(testUid);
      assert.ok(fetched, 'User must be fetched from MariaDB');
      assert.equal(fetched.email, `${testUid}@test.local`);
      
      // Clean up
      await repo.deleteUser(testUid);
    });

    it('repository handles resumes CRUD on MariaDB independently', async () => {
      const repo = getRepository(mockFirestoreQuotaExhaustedDb);
      const testUid = 'audit-resume-user-' + Date.now();
      const testResumeId = 'res-' + Date.now();
      
      // Create user first to satisfy foreign key constraint
      await repo.saveUser(testUid, { email: `${testUid}@test.local`, firstname: 'Resume', lastname: 'Owner' });

      // Save resume
      await repo.saveResume(testUid, testResumeId, { title: 'Software Engineer Resume', template: 'Cv1', status: 'draft' });
      
      // Get resume
      const fetched = await repo.getResume(testUid, testResumeId);
      assert.ok(fetched, 'Resume must be fetched from MariaDB');
      assert.equal(fetched.title, 'Software Engineer Resume');
      
      // List resumes
      const list = await repo.getResumes(testUid);
      assert.ok(Array.isArray(list), 'Resumes list must be an array');
      assert.ok(list.some(r => r.id === testResumeId || r.resumeId === testResumeId));
      
      // Clean up
      await repo.deleteResume(testUid, testResumeId);
      await repo.deleteUser(testUid);
    });

    it('repository handles jobs, blog, and CMS pages on MariaDB independently', async () => {
      const repo = getRepository(mockFirestoreQuotaExhaustedDb);
      const testEmployerUid = 'audit-emp-' + Date.now();
      const testJobId = 'job-' + Date.now();
      const testPostId = 'blog-' + Date.now();
      const testPostSlug = `ats-resume-slug-${Date.now()}`;
      const testPageId = 'page-' + Date.now();
      const testPageSlug = `privacy-audit-slug-${Date.now()}`;

      // Create employer user first
      await repo.saveUser(testEmployerUid, { email: `${testEmployerUid}@company.com`, role: 'EMPLOYER' });

      // Jobs
      await repo.saveJob(testJobId, { employerId: testEmployerUid, title: 'Staff Systems Engineer', companyName: 'TechCorp', location: 'Remote', status: 'ACTIVE' });
      const job = await repo.getJob(testJobId);
      assert.ok(job, 'Job must be retrieved from MariaDB');
      assert.equal(job.title, 'Staff Systems Engineer');
      await repo.deleteJob(testJobId);
      await repo.deleteUser(testEmployerUid);

      // Blog
      await repo.saveBlogPost(testPostId, { title: 'How to Build an ATS Resume', slug: testPostSlug, published: true });
      const post = await repo.getBlogPostBySlug(testPostSlug);
      assert.ok(post, 'Blog post must be retrieved from MariaDB');
      assert.equal(post.title, 'How to Build an ATS Resume');
      await repo.deleteBlogPost(testPostId);

      // CMS Pages
      await repo.saveCustomPage(testPageId, { title: 'Privacy Policy', slug: testPageSlug, published: true });
      const page = await repo.getCustomPageBySlug(testPageSlug);
      assert.ok(page, 'Custom page must be retrieved from MariaDB');
      assert.equal(page.title, 'Privacy Policy');
      await repo.deleteCustomPage(testPageId);
    });
  });
});
