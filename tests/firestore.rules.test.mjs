import fs from 'node:fs';
import { after, before, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env;
const projectId = 'demo-resumepilot-security';

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(new URL('../SecurityRules.txt', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/alice'), { userId: 'alice', email: 'alice@example.com', membership: 'Basic' });
    await setDoc(doc(db, 'users/bob'), { userId: 'bob', email: 'bob@example.com', membership: 'Basic' });
    await setDoc(doc(db, 'jobs/active-job'), { employerId: 'employer', status: 'active', applicationsCount: 0, title: 'Engineer' });
    await setDoc(doc(db, 'jobs/draft-job'), { employerId: 'employer', status: 'pending', applicationsCount: 0, title: 'Draft' });
    await setDoc(doc(db, 'companies/draft-company'), { employerId: 'employer', status: 'pending', name: 'Draft Co' });
    await setDoc(doc(db, 'jobApplications/application-1'), {
      userId: 'alice', jobId: 'active-job', applicantEmail: 'alice@example.com', email: 'alice@example.com', status: 'pending'
    });
    await setDoc(doc(db, 'pb/public-resume'), { id: 'public-resume', ownerUid: 'alice', isPublished: true, publicationMode: 'explicit', object: '{}' });
    await setDoc(doc(db, 'pb/legacy-autosave'), { id: 'legacy-autosave', ownerUid: 'alice', isPublished: true, object: '{"email":"private@example.com"}' });
    await setDoc(doc(db, 'payment_orders/order-a'), { uid: 'alice', status: 'ACTIVE', planId: 'monthly' });
    await setDoc(doc(db, 'data/system_settings'), { ai: { geminiApiKey: 'legacy-secret' } });
    await setDoc(doc(db, 'settings/ai_providers'), { gemini: { apiKey: 'must-not-leak' } });
    await setDoc(doc(db, 'password_reset_tokens/token'), { uid: 'alice' });
  });
});

after(async () => env?.cleanup());

const alice = () => env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();
const bob = () => env.authenticatedContext('bob', { email: 'bob@example.com' }).firestore();
const employer = () => env.authenticatedContext('employer', { email: 'boss@example.com', employer: true }).firestore();
const admin = () => env.authenticatedContext('admin', { email: 'admin@example.com', role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

test('users are isolated and server-owned entitlement fields cannot be changed', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  await assertFails(getDoc(doc(bob(), 'users/alice')));
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Alice' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { membership: 'Premium' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'SUPER_ADMIN' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'new-alice@example.com' }));
  const aliceWithRefreshedEmail = env.authenticatedContext('alice', { email: 'new-alice@example.com' }).firestore();
  await assertSucceeds(updateDoc(doc(aliceWithRefreshedEmail, 'users/alice'), { email: 'new-alice@example.com' }));
  await assertSucceeds(getDoc(doc(admin(), 'users/alice')));
  const preferences = { language: 'en', emailNotifications: true, securityNotifications: true, productUpdates: false, profileDiscoverable: false, revision: 1 };
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { preferences }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { preferences: { ...preferences, productUpdates: true } }));
  await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  await assertFails(deleteDoc(doc(admin(), 'users/alice')));
});

test('new users must bind UID and verified token email and cannot self-assign premium', async () => {
  const charlie = env.authenticatedContext('charlie', { email: 'charlie@example.com' }).firestore();
  await assertSucceeds(setDoc(doc(charlie, 'users/charlie'), {
    userId: 'charlie', email: 'charlie@example.com', firstname: 'Charlie', membership: 'Basic'
  }));
  const mallory = env.authenticatedContext('mallory', { email: 'mallory@example.com' }).firestore();
  await assertFails(setDoc(doc(mallory, 'users/mallory'), {
    userId: 'mallory', email: 'victim@example.com', membership: 'Basic'
  }));
  await assertFails(setDoc(doc(mallory, 'users/mallory'), {
    userId: 'mallory', email: 'mallory@example.com', membership: 'Premium'
  }));
});

test('private resume drafts are owner-scoped and cannot be read or overwritten cross-account', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice/resumes/resume-1'), { firstname: 'Asha', revision: 1, template: 'Cv1' }));
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice/resumes/resume-1'), { firstname: 'Asha Rao', revision: 2 }));
  await assertFails(getDoc(doc(bob(), 'users/alice/resumes/resume-1')));
  await assertFails(getDoc(doc(anonymous(), 'users/alice/resumes/resume-1')));
  await assertFails(setDoc(doc(alice(), 'users/bob/resumes/forged'), { firstname: 'Forged' }));
});

test('portfolio ownership cannot be transferred and public viewers cannot edit content', async () => {
  await assertSucceeds(getDoc(doc(anonymous(), 'pb/public-resume')));
  await assertFails(getDoc(doc(anonymous(), 'pb/legacy-autosave')));
  await assertSucceeds(getDoc(doc(alice(), 'pb/legacy-autosave')));
  await assertFails(updateDoc(doc(bob(), 'pb/public-resume'), { object: '{"stolen":true}' }));
  await assertFails(updateDoc(doc(alice(), 'pb/public-resume'), { ownerUid: 'bob' }));
  await assertSucceeds(updateDoc(doc(alice(), 'pb/public-resume'), { isPublished: false }));
  await assertFails(getDoc(doc(anonymous(), 'pb/public-resume')));
  await assertSucceeds(getDoc(doc(alice(), 'pb/public-resume')));
  await assertSucceeds(updateDoc(doc(alice(), 'pb/public-resume'), { isPublished: true }));
  await assertSucceeds(setDoc(doc(alice(), 'portfolios/portfolio-1'), { userId: 'alice', isPublished: true, views: 0 }));
  await assertFails(updateDoc(doc(alice(), 'portfolios/portfolio-1'), { userId: 'bob' }));
  await assertSucceeds(updateDoc(doc(anonymous(), 'portfolios/portfolio-1'), { views: 1 }));
  await assertFails(updateDoc(doc(anonymous(), 'portfolios/portfolio-1'), { views: 2, title: 'Injected' }));
});

test('personal job tracker records are isolated by account', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice/jobTracker/tracked-1'), { title: 'Engineer', status: 'wishlist' }));
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice/jobTracker/tracked-1'), { status: 'applied' }));
  await assertFails(getDoc(doc(bob(), 'users/alice/jobTracker/tracked-1')));
  await assertFails(setDoc(doc(alice(), 'users/bob/jobTracker/forged'), { title: 'Forged' }));
});

test('employer applications are owner-bound and cannot self-approve', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'employerApplications/alice'), {
    userId: 'alice', status: 'pending', contactEmail: 'alice@example.com', reasonForJoining: 'Hiring'
  }));
  await assertFails(getDoc(doc(bob(), 'employerApplications/alice')));
  await assertSucceeds(getDoc(doc(admin(), 'employerApplications/alice')));
  await assertFails(updateDoc(doc(alice(), 'employerApplications/alice'), { status: 'approved' }));
  await assertFails(setDoc(doc(alice(), 'employerApplications/bob'), { userId: 'bob', status: 'pending' }));
});

test('company moderation is backend-only while employer-owned pending edits remain available', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'companies/draft-company')));
  await assertSucceeds(updateDoc(doc(employer(), 'companies/draft-company'), { name: 'Updated Draft Co' }));
  await assertFails(updateDoc(doc(employer(), 'companies/draft-company'), { status: 'approved' }));
  await assertFails(updateDoc(doc(admin(), 'companies/draft-company'), { status: 'approved' }));
  await assertFails(deleteDoc(doc(admin(), 'companies/draft-company')));
});

test('private job tracker requires monotonic revisions', async () => {
  const reference = doc(alice(), 'users/alice/jobTracker/tracked-1');
  await assertFails(setDoc(reference, { title: 'Role', company: 'ACME', revision: 0 }));
  await assertSucceeds(setDoc(reference, { title: 'Role', company: 'ACME', revision: 1 }));
  await assertFails(updateDoc(reference, { title: 'Stale', revision: 1 }));
  await assertSucceeds(updateDoc(reference, { title: 'Updated', revision: 2 }));
  await assertFails(getDoc(doc(bob(), 'users/alice/jobTracker/tracked-1')));
});

test('jobs expose active listings only and employer edits cannot self-approve', async () => {
  await assertSucceeds(getDoc(doc(anonymous(), 'jobs/active-job')));
  await assertFails(getDoc(doc(anonymous(), 'jobs/draft-job')));
  await assertFails(setDoc(doc(employer(), 'jobs/new-job'), {
    employerId: 'employer', status: 'pending', applicationsCount: 0, title: 'New role'
  }));
  await assertFails(setDoc(doc(employer(), 'jobs/self-approved'), {
    employerId: 'employer', status: 'active', applicationsCount: 0, title: 'Bypass'
  }));
  await assertFails(updateDoc(doc(employer(), 'jobs/draft-job'), { status: 'active' }));
  await assertFails(updateDoc(doc(admin(), 'jobs/draft-job'), { status: 'active' }));
  await assertFails(deleteDoc(doc(admin(), 'jobs/draft-job')));
});

test('job applications are readable only by participants while every lifecycle write is backend-only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'jobApplications/application-1')));
  await assertFails(getDoc(doc(bob(), 'jobApplications/application-1')));
  await assertSucceeds(getDoc(doc(employer(), 'jobApplications/application-1')));
  await assertFails(setDoc(doc(alice(), 'jobApplications/alice_application-2'), {
    userId: 'alice', jobId: 'active-job', applicantEmail: 'alice@example.com', email: 'alice@example.com', status: 'pending'
  }));
  await assertFails(updateDoc(doc(employer(), 'jobApplications/application-1'), { status: 'interview', statusUpdatedAt: new Date() }));
  await assertFails(updateDoc(doc(admin(), 'jobApplications/application-1'), { status: 'accepted' }));
  await assertFails(deleteDoc(doc(alice(), 'jobApplications/application-1')));
  await assertFails(updateDoc(doc(alice(), 'jobs/active-job'), { applicationsCount: 1, updatedAt: new Date() }));
});

test('blog drafts are private and direct writes enforce revisions, fields, bounds, and trusted publication', async () => {
  const basePost = (status, title) => ({
    authorUid: 'alice', status, title, slug: title.toLowerCase(), content: '', excerpt: '', categoryId: '', revision: 1,
    createdAt: new Date(), updatedAt: new Date(), publishedAt: null, viewCount: 0, tags: [], featuredImage: null,
  });
  await assertSucceeds(setDoc(doc(alice(), 'blog_posts/alice_draft'), basePost('draft', 'Draft')));
  await assertFails(getDoc(doc(bob(), 'blog_posts/alice_draft')));
  await assertFails(setDoc(doc(alice(), 'blog_posts/extra_field'), { ...basePost('draft', 'Extra'), injected: true }));
  await assertFails(setDoc(doc(alice(), 'blog_posts/too_large'), { ...basePost('draft', 'Large'), title: 'x'.repeat(201) }));
  await assertFails(setDoc(doc(alice(), 'blog_posts/unsafe_media'), { ...basePost('draft', 'Media'), featuredImage: 'data:image/svg+xml,<svg/>' }));
  await assertFails(updateDoc(doc(alice(), 'blog_posts/alice_draft'), { status: 'pending', content: 'Ready', revision: 1, updatedAt: new Date() }));
  await assertFails(updateDoc(doc(alice(), 'blog_posts/alice_draft'), { status: 'approved', revision: 2, updatedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(alice(), 'blog_posts/alice_draft'), { status: 'pending', content: 'Ready', revision: 2, updatedAt: new Date() }));
  await assertFails(updateDoc(doc(bob(), 'blog_posts/alice_draft'), { status: 'draft', content: 'Stolen', revision: 3, updatedAt: new Date() }));
  await assertSucceeds(deleteDoc(doc(alice(), 'blog_posts/alice_draft')));

  await assertSucceeds(setDoc(doc(alice(), 'blog_posts/alice_review'), basePost('pending', 'Review')));
  await assertFails(updateDoc(doc(alice(), 'blog_posts/alice_review'), { status: 'scheduled', scheduledAt: new Date(Date.now() + 60000), revision: 2, updatedAt: new Date() }));
  await assertSucceeds(updateDoc(doc(admin(), 'blog_posts/alice_review'), { status: 'scheduled', scheduledAt: new Date(Date.now() + 60000), publishedAt: null, revision: 2, updatedAt: new Date() }));
  await assertFails(getDoc(doc(anonymous(), 'blog_posts/alice_review')));
  await assertSucceeds(updateDoc(doc(admin(), 'blog_posts/alice_review'), { status: 'approved', scheduledAt: null, publishedAt: new Date(), revision: 3, updatedAt: new Date() }));
  await assertFails(deleteDoc(doc(alice(), 'blog_posts/alice_review')));
  await assertSucceeds(getDoc(doc(anonymous(), 'blog_posts/alice_review')));
});

test('billing, provider secrets and token registries are server-only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'payment_orders/order-a')));
  await assertFails(getDoc(doc(bob(), 'payment_orders/order-a')));
  await assertFails(updateDoc(doc(alice(), 'payment_orders/order-a'), { status: 'ACTIVE', planId: 'yearly' }));
  await assertFails(getDoc(doc(alice(), 'data/system_settings')));
  await assertFails(getDoc(doc(admin(), 'data/system_settings')));
  await assertFails(getDoc(doc(admin(), 'data/subscriptions')));
  await assertSucceeds(updateDoc(doc(admin(), 'data/system_settings'), { updatedByTest: true }));
  const staleAdmin = env.authenticatedContext('stale-admin', {
    email: 'stale@example.com', role: 'ADMIN', auth_time: Math.floor(Date.now() / 1000) - 3600
  }).firestore();
  await assertFails(updateDoc(doc(staleAdmin, 'data/system_settings'), { staleWrite: true }));
  await assertFails(getDoc(doc(admin(), 'settings/ai_providers')));
  await assertFails(getDoc(doc(admin(), 'settings/admin_configuration')));
  await assertFails(setDoc(doc(admin(), 'settings/admin_configuration'), { smtp: { password: 'browser-secret' } }));
  await assertFails(setDoc(doc(admin(), 'reviews/direct-admin-review'), { status: 'approved', review: 'bypass' }));
  await assertFails(setDoc(doc(admin(), 'trustedBy/direct-admin-logo'), { name: 'Bypass', imageUrl: 'https://example.com/logo.png' }));
  await assertFails(setDoc(doc(admin(), 'ads/direct-admin-ad'), { name: 'Bypass', imageLink: 'https://example.com/ad.png' }));
  await assertFails(setDoc(doc(admin(), 'data/frontendstats'), { activeJobs: 'fake' }));
  await assertFails(setDoc(doc(admin(), 'data/public_config'), { ai: { provider: 'attacker' } }, { merge: true }));
  await assertFails(getDoc(doc(admin(), 'password_reset_tokens/token')));
  await assertFails(deleteDoc(doc(admin(), 'password_reset_tokens/token')));
  await assertFails(setDoc(doc(alice(), 'contact/direct-client-write'), { email: 'alice@example.com', message: 'bypass' }));
});
