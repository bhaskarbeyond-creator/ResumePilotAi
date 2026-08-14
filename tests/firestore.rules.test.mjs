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
    await setDoc(doc(db, 'jobApplications/application-1'), {
      userId: 'alice', jobId: 'active-job', applicantEmail: 'alice@example.com', email: 'alice@example.com', status: 'pending'
    });
    await setDoc(doc(db, 'pb/public-resume'), { id: 'public-resume', ownerUid: 'alice', isPublished: true, object: '{}' });
    await setDoc(doc(db, 'payment_orders/order-a'), { uid: 'alice', status: 'ACTIVE', planId: 'monthly' });
    await setDoc(doc(db, 'data/system_settings'), { ai: { geminiApiKey: 'must-not-leak' } });
    await setDoc(doc(db, 'password_reset_tokens/token'), { uid: 'alice' });
  });
});

after(async () => env?.cleanup());

const alice = () => env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();
const bob = () => env.authenticatedContext('bob', { email: 'bob@example.com' }).firestore();
const employer = () => env.authenticatedContext('employer', { email: 'boss@example.com', employer: true }).firestore();
const admin = () => env.authenticatedContext('admin', { email: 'admin@example.com', role: 'ADMIN' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

test('users are isolated and server-owned entitlement fields cannot be changed', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  await assertFails(getDoc(doc(bob(), 'users/alice')));
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Alice' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { membership: 'Premium' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'SUPER_ADMIN' }));
  await assertSucceeds(getDoc(doc(admin(), 'users/alice')));
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

test('portfolio ownership cannot be transferred and public viewers cannot edit content', async () => {
  await assertSucceeds(getDoc(doc(anonymous(), 'pb/public-resume')));
  await assertFails(updateDoc(doc(bob(), 'pb/public-resume'), { object: '{"stolen":true}' }));
  await assertFails(updateDoc(doc(alice(), 'pb/public-resume'), { ownerUid: 'bob' }));
  await assertSucceeds(setDoc(doc(alice(), 'portfolios/portfolio-1'), { userId: 'alice', isPublished: true, views: 0 }));
  await assertFails(updateDoc(doc(alice(), 'portfolios/portfolio-1'), { userId: 'bob' }));
  await assertSucceeds(updateDoc(doc(anonymous(), 'portfolios/portfolio-1'), { views: 1 }));
  await assertFails(updateDoc(doc(anonymous(), 'portfolios/portfolio-1'), { views: 2, title: 'Injected' }));
});

test('jobs expose active listings only and employer edits cannot self-approve', async () => {
  await assertSucceeds(getDoc(doc(anonymous(), 'jobs/active-job')));
  await assertFails(getDoc(doc(anonymous(), 'jobs/draft-job')));
  await assertSucceeds(setDoc(doc(employer(), 'jobs/new-job'), {
    employerId: 'employer', status: 'pending', applicationsCount: 0, title: 'New role'
  }));
  await assertFails(setDoc(doc(employer(), 'jobs/self-approved'), {
    employerId: 'employer', status: 'active', applicationsCount: 0, title: 'Bypass'
  }));
  await assertFails(updateDoc(doc(employer(), 'jobs/draft-job'), { status: 'active' }));
});

test('job applications bind applicant identity and only job owner may change status', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'jobApplications/application-2'), {
    userId: 'alice', jobId: 'active-job', applicantEmail: 'alice@example.com', email: 'alice@example.com', status: 'pending'
  }));
  await assertFails(setDoc(doc(alice(), 'jobApplications/forged-applicant'), {
    userId: 'bob', jobId: 'active-job', applicantEmail: 'bob@example.com', email: 'bob@example.com', status: 'pending'
  }));
  await assertFails(setDoc(doc(alice(), 'jobApplications/draft-application'), {
    userId: 'alice', jobId: 'draft-job', applicantEmail: 'alice@example.com', email: 'alice@example.com', status: 'pending'
  }));
  await assertSucceeds(getDoc(doc(employer(), 'jobApplications/application-1')));
  await assertSucceeds(updateDoc(doc(employer(), 'jobApplications/application-1'), { status: 'interview', statusUpdatedAt: new Date() }));
  await assertFails(updateDoc(doc(alice(), 'jobApplications/application-1'), { status: 'accepted' }));
  await assertFails(updateDoc(doc(employer(), 'jobApplications/application-1'), { userId: 'bob', status: 'accepted' }));
});

test('billing, provider secrets and token registries are server-only', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'payment_orders/order-a')));
  await assertFails(getDoc(doc(bob(), 'payment_orders/order-a')));
  await assertFails(updateDoc(doc(alice(), 'payment_orders/order-a'), { status: 'ACTIVE', planId: 'yearly' }));
  await assertFails(getDoc(doc(alice(), 'data/system_settings')));
  await assertSucceeds(getDoc(doc(admin(), 'data/system_settings')));
  await assertFails(getDoc(doc(admin(), 'password_reset_tokens/token')));
  await assertFails(deleteDoc(doc(admin(), 'password_reset_tokens/token')));
});
