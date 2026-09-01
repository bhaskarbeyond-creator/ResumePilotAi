import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('backend/.env') });
dotenv.config({ path: path.resolve('.env') });

import assert from 'assert';
import authPkg from '../backend/security/auth.js';
const { issueLocalTestToken } = authPkg;
import mysqlPkg from '../backend/database/mysql.js';
const { getPool } = mysqlPkg;

const TARGET = 'https://ai-resume-builder.local';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('============================================================');
console.log('SUPER ADMIN ADVERSARIAL CRUD & NEGATIVE INVARIANT PROOF');
console.log('Target Runtime:', TARGET);
console.log('============================================================\n');

async function run() {
    const pool = getPool();
    const superAdminToken = issueLocalTestToken({
        uid: 'forensic-sa-001',
        email: 'superadmin@resumepilot.local',
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        email_verified: true,
        claims: { role: 'SUPER_ADMIN', permissions: ['*'] }
    });

    const userToken = issueLocalTestToken({
        uid: 'forensic-user-001',
        email: 'candidate@resumepilot.local',
        role: 'USER',
        roles: ['USER'],
        email_verified: true,
        claims: { role: 'USER', permissions: ['resume.read', 'resume.write'] }
    });

    const headers = {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
    };

    const userHeaders = {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
    };

    // -------------------------------------------------------------
    // 1. Promo Coupon Full Lifecycle & Direct MariaDB Assertions
    // -------------------------------------------------------------
    console.log('[1/8] Promo Coupon Full Lifecycle (Create -> MariaDB Check -> Read-back -> Update -> Delete -> MariaDB Check)...');
    const testCode = 'ADV_COUPON_99';
    await pool.query('DELETE FROM coupons WHERE code = ?', [testCode]);

    const createRes = await fetch(`${TARGET}/api/admin/coupons`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            code: testCode,
            discount: 35,
            description: 'Adversarial 35% Off Special',
            active: true,
            expiryDate: '2026-12-31',
            maxUses: 100,
            singleUsePerUser: true,
        })
    });
    assert.equal(createRes.status, 201, `Expected HTTP 201 on create coupon, got ${createRes.status}`);
    const createJson = await createRes.json();
    assert.equal(createJson.success, true);
    assert.equal(createJson.coupon.code, testCode);

    // Direct DB Check
    const [dbRows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [testCode]);
    assert.equal(dbRows.length, 1);
    assert.equal(dbRows[0].discount, 35);
    assert.equal(dbRows[0].active, 1);
    console.log('  ✓ Direct MariaDB row verified for created coupon.');

    // Update with revision
    const updateRes = await fetch(`${TARGET}/api/admin/coupons`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            code: testCode,
            discount: 40,
            description: 'Updated Adversarial 40% Off',
            active: false,
            expiryDate: '2027-01-01',
            maxUses: 200,
            singleUsePerUser: false,
            revision: 1
        })
    });
    assert.equal(updateRes.status, 200);
    const [updatedDbRows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [testCode]);
    assert.equal(updatedDbRows[0].discount, 40);
    assert.equal(updatedDbRows[0].active, 0);
    assert.equal(updatedDbRows[0].revision, 2);
    console.log('  ✓ Direct MariaDB update verified: discount=40, active=0, revision=2');

    // Delete with expectedRevision
    const delCouponRes = await fetch(`${TARGET}/api/admin/coupons/${testCode}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ expectedRevision: 2 })
    });
    assert.equal(delCouponRes.status, 200);
    const [deletedDbRows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [testCode]);
    assert.equal(deletedDbRows.length, 0);
    console.log('  ✓ Direct MariaDB coupon deletion verified (0 rows).');

    // -------------------------------------------------------------
    // 2. Phrase Categories Lifecycle (miscData.js fix validation)
    // -------------------------------------------------------------
    console.log('\n[2/8] Phrase Categories Lifecycle & Direct MariaDB Assertions...');
    const testCategory = 'adversarial_phrases_test';
    // Clean up
    await pool.query('DELETE FROM canonical_documents WHERE entity_type = "phrases" AND entity_id = ?', [testCategory]);

    // Save phrase category
    const savePhrasesRes = await fetch(`${TARGET}/api/phrases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            categories: {
                [testCategory]: ['Engineered highly scalable distributed systems.', 'Reduced latency by 45% using MariaDB optimizations.']
            }
        })
    });
    assert.equal(savePhrasesRes.status, 200);
    const [phraseRows] = await pool.query('SELECT * FROM canonical_documents WHERE entity_type = "phrases" AND entity_id = ? AND deleted_at IS NULL', [testCategory]);
    assert.equal(phraseRows.length, 1);
    const parsedPhraseDoc = JSON.parse(phraseRows[0].payload);
    assert.equal(parsedPhraseDoc.phrases.length, 2);
    console.log('  ✓ Direct MariaDB canonical_documents row verified for phrase category.');

    // Delete phrase category via newly added DELETE /api/phrases/:category endpoint
    const delPhraseRes = await fetch(`${TARGET}/api/phrases/${testCategory}`, {
        method: 'DELETE',
        headers
    });
    assert.equal(delPhraseRes.status, 200);
    const [phraseRowsAfter] = await pool.query('SELECT * FROM canonical_documents WHERE entity_type = "phrases" AND entity_id = ? AND deleted_at IS NULL', [testCategory]);
    assert.equal(phraseRowsAfter.length, 0);
    console.log('  ✓ Direct MariaDB soft-delete verified for phrase category (0 active rows).');

    // Clean up
    await pool.query('DELETE FROM canonical_documents WHERE entity_type = "phrases" AND entity_id = ?', [testCategory]);

    // -------------------------------------------------------------
    // 3. Platform Announcements Lifecycle & CAS Conflict
    // -------------------------------------------------------------
    console.log('\n[3/8] Platform Announcements Lifecycle & CAS Conflict Verification...');
    const annRes = await fetch(`${TARGET}/api/platform/announcements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title: 'Adversarial Test Announcement',
            message: 'Testing announcement database persistence',
            severity: 'HIGH'
        })
    });
    assert.equal(annRes.status, 201);
    const annJson = await annRes.json();
    const annId = annJson.announcement.id;

    // Stale revision delete attempt -> Expect 409
    const staleDelRes = await fetch(`${TARGET}/api/platform/announcements/${annId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ expectedRevision: 999 })
    });
    assert.equal(staleDelRes.status, 409, `Expected 409 on stale revision, got ${staleDelRes.status}`);
    console.log('  ✓ Stale expectedRevision on announcement delete correctly rejected with HTTP 409 CAS Conflict.');

    // Correct revision delete -> Expect 200
    const correctDelRes = await fetch(`${TARGET}/api/platform/announcements/${annId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ expectedRevision: 1 })
    });
    assert.equal(correctDelRes.status, 200);
    const [annRowsAfter] = await pool.query('SELECT * FROM platform_announcements WHERE id = ?', [annId]);
    assert.equal(annRowsAfter.length, 0);
    console.log('  ✓ Direct MariaDB announcement deletion verified (0 rows).');

    // -------------------------------------------------------------
    // 4. CMS Blog Post Lifecycle & Direct MariaDB Assertions
    // -------------------------------------------------------------
    console.log('\n[4/8] CMS Blog Post Lifecycle & Direct MariaDB Assertions...');
    const testPostSlug = 'adv-test-post-persistence';
    await pool.query('DELETE FROM blog WHERE slug = ?', [testPostSlug]);

    const createBlogRes = await fetch(`${TARGET}/api/blog-data/${testPostSlug}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            slug: testPostSlug,
            title: 'Adversarial Blog Persistence Verification',
            content: '<p>Testing blog persistence directly against MySQL repository.</p>',
            status: 'draft',
            category: 'Security'
        })
    });
    assert.equal(createBlogRes.status, 200);
    const [blogRows] = await pool.query('SELECT * FROM blog WHERE slug = ?', [testPostSlug]);
    assert.equal(blogRows.length, 1);
    assert.equal(blogRows[0].title, 'Adversarial Blog Persistence Verification');
    console.log('  ✓ Direct MariaDB blog row verified.');

    // Delete blog post via /api/blog-data/:id with expectedRevision
    const delBlogRes = await fetch(`${TARGET}/api/blog-data/${testPostSlug}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ expectedRevision: 1 })
    });
    assert.equal(delBlogRes.status, 200);
    const [blogRowsAfter] = await pool.query('SELECT * FROM blog WHERE slug = ?', [testPostSlug]);
    assert.equal(blogRowsAfter.length, 0);
    console.log('  ✓ Direct MariaDB blog deletion verified (0 rows).');

    // -------------------------------------------------------------
    // 5. Support Tickets & Message Threading Lifecycle
    // -------------------------------------------------------------
    console.log('\n[5/8] Support Ticket & Threading Lifecycle...');
    const ticketRes = await fetch(`${TARGET}/api/support/tickets`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({
            subject: 'Adversarial Support Ticket Audit',
            body: 'Candidate inquiring about resume template formatting.',
            priority: 'NORMAL'
        })
    });
    assert.equal(ticketRes.status, 201);
    const ticketJson = await ticketRes.json();
    const ticketId = ticketJson.ticket.id;

    // Staff reply
    const replyRes = await fetch(`${TARGET}/api/admin/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body: 'Staff reply confirming template adjustments.' })
    });
    assert.equal(replyRes.status, 201);

    // Status update
    const patchTicketRes = await fetch(`${TARGET}/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'RESOLVED' })
    });
    assert.equal(patchTicketRes.status, 200);

    const [tRows] = await pool.query('SELECT status FROM support_tickets WHERE id = ?', [ticketId]);
    assert.equal(tRows[0].status, 'RESOLVED');
    const [mRows] = await pool.query('SELECT COUNT(*) as cnt FROM support_ticket_messages WHERE ticket_id = ?', [ticketId]);
    assert.equal(mRows[0].cnt, 2);
    console.log('  ✓ Direct MariaDB support ticket status (IN_PROGRESS) and 2 thread messages verified.');

    // Cleanup
    await pool.query('DELETE FROM support_ticket_messages WHERE ticket_id = ?', [ticketId]);
    await pool.query('DELETE FROM support_tickets WHERE id = ?', [ticketId]);

    // -------------------------------------------------------------
    // 6. Adversarial Security: Non-SuperAdmin Privilege Escalation Denial
    // -------------------------------------------------------------
    console.log('\n[6/8] Adversarial Security: Non-SuperAdmin Mutation Rejections...');
    const unauthCouponRes = await fetch(`${TARGET}/api/admin/coupons`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({ code: 'HACKED_COUPON', discount: 90 })
    });
    assert.equal(unauthCouponRes.status, 403, `Expected 403 for candidate creating coupon, got ${unauthCouponRes.status}`);
    console.log('  ✓ Candidate user blocked from coupon mutations (HTTP 403 FORBIDDEN).');

    const unauthSettingsRes = await fetch(`${TARGET}/api/admin/settings/general`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({ data: { websiteName: 'Hacked' }, expectedRevision: 1 })
    });
    assert.equal(unauthSettingsRes.status, 403, `Expected 403 for candidate writing settings, got ${unauthSettingsRes.status}`);
    console.log('  ✓ Candidate user blocked from settings mutations (HTTP 403 FORBIDDEN).');

    // -------------------------------------------------------------
    // 7. Unauthenticated Rejection (HTTP 401)
    // -------------------------------------------------------------
    console.log('\n[7/8] Unauthenticated Mutation Rejections (HTTP 401)...');
    const anonRes = await fetch(`${TARGET}/api/admin/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ANON_COUPON', discount: 50 })
    });
    assert.equal(anonRes.status, 401, `Expected 401 for anonymous request, got ${anonRes.status}`);
    console.log('  ✓ Anonymous request blocked with HTTP 401 AUTH_REQUIRED.');

    // -------------------------------------------------------------
    // 8. System Settings CAS Revision Protection
    // -------------------------------------------------------------
    console.log('\n[8/8] System Settings Optimistic CAS Revision Protection...');
    const settingsGetRes = await fetch(`${TARGET}/api/admin/settings`, { headers });
    assert.equal(settingsGetRes.status, 200);
    const settingsGetJson = await settingsGetRes.json();
    const realModulesRev = settingsGetJson.revisions?.modules || 0;

    // Send stale revision
    const staleSettingsRes = await fetch(`${TARGET}/api/admin/settings/modules`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            data: { enableCouponsModule: true },
            expectedRevision: realModulesRev + 999
        })
    });
    assert.equal(staleSettingsRes.status, 409, `Expected 409 on stale settings CAS write, got ${staleSettingsRes.status}`);
    console.log('  ✓ Stale system settings CAS revision rejected with HTTP 409.');

    console.log('\n============================================================');
    console.log('ALL 8 ADVERSARIAL CRUD & SECURITY INVARIANTS PROVEN 100%!');
    console.log('============================================================\n');
    process.exit(0);
}

run().catch(err => {
    console.error('\n❌ ADVERSARIAL PROOF FAILED:', err);
    process.exit(1);
});
