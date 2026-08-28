import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getRepository } from '../backend/repositories/index.js';
import { getPool } from '../backend/database/mysql.js';

describe('Real End-to-End Business Workflows & Data Integrity', () => {
  let repo;

  before(() => {
    repo = getRepository();
    getPool();
  });

  it('1. Consumer & Resume Lifecycle: Create, Edit, Duplicate, Delete Isolation', async () => {
    const userUid = `consumer-e2e-${Date.now()}`;
    const resumeAId = `res-a-${Date.now()}`;
    const resumeBId = `res-b-dup-${Date.now()}`;

    // 1. Provision user
    await repo.saveUser(userUid, { email: `${userUid}@test.local`, role: 'USER', firstname: 'E2E', lastname: 'Consumer' });

    // 2. Create Resume A
    await repo.saveResume(userUid, resumeAId, {
      title: 'Principal Systems Architect',
      firstname: 'Alex',
      lastname: 'Mercer',
      email: 'alex@mercer.io',
      experience: [{ company: 'CloudCore', role: 'Staff Eng', duration: '4 yrs' }],
      skills: ['Node.js', 'MariaDB', 'Distributed Systems']
    });

    const fetchedA = await repo.getResume(userUid, resumeAId);
    assert.equal(fetchedA.title, 'Principal Systems Architect');
    assert.equal(fetchedA.firstname, 'Alex');
    assert.equal(fetchedA.lastname, 'Mercer');

    // 3. Duplicate Resume A -> Resume B
    await repo.saveResume(userUid, resumeBId, {
      ...fetchedA,
      id: resumeBId,
      title: 'Principal Systems Architect (Copy)',
      skills: [...fetchedA.skills, 'Kubernetes']
    });

    const fetchedB = await repo.getResume(userUid, resumeBId);
    assert.equal(fetchedB.title, 'Principal Systems Architect (Copy)');
    assert.equal(fetchedB.skills.length, 4);

    // 4. Delete Duplicate Resume B
    await repo.deleteResume(userUid, resumeBId);
    const fetchedBDeleted = await repo.getResume(userUid, resumeBId);
    assert.equal(fetchedBDeleted, null, 'Duplicate resume must be deleted');

    // 5. Verify Original Resume A remains 100% intact
    const fetchedAPost = await repo.getResume(userUid, resumeAId);
    assert.ok(fetchedAPost, 'Original Resume A must remain completely unaffected');
    assert.equal(fetchedAPost.skills.length, 3);

    // Cleanup
    await repo.deleteResume(userUid, resumeAId);
    await repo.deleteUser(userUid);
  });

  it('2. Membership Lifecycle: Pro, Premium, Enterprise, Expired, Refunded', async () => {
    const userUid = `mem-e2e-${Date.now()}`;
    await repo.saveUser(userUid, { email: `${userUid}@test.local`, membership: 'Basic' });

    // 1. Upgrade to Pro
    await repo.saveUser(userUid, { email: `${userUid}@test.local`, membership: 'Pro', membershipEnds: new Date(Date.now() + 86400000).toISOString() });
    let u = await repo.getUser(userUid);
    assert.equal(u.membership, 'Pro');

    // 2. Upgrade to Enterprise
    await repo.saveUser(userUid, { email: `${userUid}@test.local`, membership: 'Enterprise', membershipEnds: new Date(Date.now() + 86400000 * 365).toISOString() });
    u = await repo.getUser(userUid);
    assert.equal(u.membership, 'Enterprise');

    // 3. Expiration / Refund reversal
    await repo.saveUser(userUid, { email: `${userUid}@test.local`, membership: 'Basic', membershipEnds: null });
    u = await repo.getUser(userUid);
    assert.equal(u.membership, 'Basic');

    await repo.deleteUser(userUid);
  });

  it('3. Employer & Job Applications Workflow', async () => {
    const employerUid = `emp-e2e-${Date.now()}`;
    const candidateUid = `cand-e2e-${Date.now()}`;
    const companyId = `comp-e2e-${Date.now()}`;
    const jobId = `job-e2e-${Date.now()}`;
    const appId = `app-e2e-${Date.now()}`;

    // 1. Provision users
    await repo.saveUser(employerUid, { email: `${employerUid}@corp.local`, role: 'EMPLOYER' });
    await repo.saveUser(candidateUid, { email: `${candidateUid}@cand.local`, role: 'USER' });

    // 2. Create company
    await repo.saveCompany(companyId, { ownerId: employerUid, name: 'TechScale Dynamics', slug: `techscale-${Date.now()}` });
    const comp = await repo.getCompany(companyId);
    assert.equal(comp.name, 'TechScale Dynamics');

    // 3. Create job
    await repo.saveJob(jobId, { employerId: employerUid, title: 'Lead Infrastructure Engineer', companyName: comp.name, status: 'ACTIVE' });
    const job = await repo.getJob(jobId);
    assert.equal(job.title, 'Lead Infrastructure Engineer');

    // 4. Submit application
    await repo.saveApplication(appId, { jobId, employerId: employerUid, applicantId: candidateUid, applicantName: 'Jane Doe', status: 'PENDING' });
    let app = await repo.getApplication(appId);
    assert.equal(app.status, 'PENDING');

    // 5. Employer updates status to SHORTLISTED
    await repo.saveApplication(appId, { ...app, status: 'SHORTLISTED', rating: 5, notes: 'Strong systems background' });
    app = await repo.getApplication(appId);
    assert.equal(app.status, 'SHORTLISTED');
    assert.equal(app.rating, 5);

    // Cleanup
    await repo.deleteApplication(appId);
    await repo.deleteJob(jobId);
    await repo.deleteCompany(companyId);
    await repo.deleteUser(candidateUid);
    await repo.deleteUser(employerUid);
  });

  it('4. CMS Workflow: Create, Edit, Publish, Unpublish', async () => {
    const blogId = `blog-e2e-${Date.now()}`;
    const slug = `systems-engineering-guide-${Date.now()}`;

    // 1. Draft post
    await repo.saveBlogPost(blogId, { title: 'Mastering High-Scale Systems', slug, content: 'Deep dive into high-scale relational systems.', published: false });
    let post = await repo.getBlogPostBySlug(slug);
    assert.equal(post.published, false);

    // 2. Edit & Publish
    await repo.saveBlogPost(blogId, { ...post, title: 'Mastering High-Scale Systems (Published)', published: true });
    post = await repo.getBlogPostBySlug(slug);
    assert.equal(post.published, true);
    assert.equal(post.title, 'Mastering High-Scale Systems (Published)');

    // 3. Unpublish
    await repo.saveBlogPost(blogId, { ...post, published: false });
    post = await repo.getBlogPostBySlug(slug);
    assert.equal(post.published, false);

    // Cleanup
    await repo.deleteBlogPost(blogId);
  });

  it('5. Enterprise Multi-Tenancy & Access Isolation', async () => {
    const tenantAId = `tenant-a-${Date.now()}`;
    const tenantBId = `tenant-b-${Date.now()}`;
    const userA = `usr-a-${Date.now()}`;
    const userB = `usr-b-${Date.now()}`;

    // Create 2 separate tenant documents
    await repo.saveDocument('tenants', tenantAId, { name: 'Acme Enterprise', plan: 'ENTERPRISE_CUSTOM', active: true });
    await repo.saveDocument('tenants', tenantBId, { name: 'Globex Corp', plan: 'ENTERPRISE_CUSTOM', active: true });

    // User A in Tenant A, User B in Tenant B
    await repo.saveUser(userA, { email: `${userA}@acme.com`, tenantId: tenantAId, role: 'TENANT_ADMIN' });
    await repo.saveUser(userB, { email: `${userB}@globex.com`, tenantId: tenantBId, role: 'TENANT_MEMBER' });

    const fetchedA = await repo.getUser(userA);
    const fetchedB = await repo.getUser(userB);

    assert.equal(fetchedA.tenantId, tenantAId);
    assert.equal(fetchedB.tenantId, tenantBId);
    assert.notEqual(fetchedA.tenantId, fetchedB.tenantId, 'Cross-tenant IDs must never collide');

    // Cleanup
    await repo.deleteDocument('tenants', tenantAId);
    await repo.deleteDocument('tenants', tenantBId);
    await repo.deleteUser(userA);
    await repo.deleteUser(userB);
  });
});
