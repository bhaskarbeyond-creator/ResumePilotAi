/**
 * Regression coverage for forensic-audit defect D6:
 *
 *   In src/firestore/dbOperations.js, `listBlogPosts()` destructured `page` and
 *   `limit` from `options` INSIDE its try block. They were therefore block-scoped
 *   to the try and not visible in the `catch`, so the "graceful empty list"
 *   fallback threw `ReferenceError: page is not defined` instead of returning.
 *   The degradation path was dead and callers received an unrelated runtime
 *   error. ESLint flagged this as `no-undef`, but `npm run lint` was not part of
 *   `npm test`, so the green suite never saw it.
 *
 * This test loads the REAL module with its Firebase dependency stubbed via
 * Node's module hooks and calls the real function, so it fails if the fallback
 * regresses to referencing an out-of-scope binding.
 *
 * Run: node --test tests/blog-list-fallback.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const abs = p => pathToFileURL(path.resolve(root, p)).href;

const FIRE_URL = abs('src/conf/fire.js');
const CONFIG_URL = abs('src/conf/configuration.js');

/** Firestore stub whose query chain always rejects, forcing the catch path. */
const failingDb = {
  collection() {
    const chain = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      startAfter: () => chain,
      get: async () => {
        throw new Error('simulated Firestore outage');
      },
    };
    return chain;
  },
};

const fireStub = {
  auth: () => ({ currentUser: null }),
  firestore: () => failingDb,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('conf/fire') || specifier.endsWith('conf/fire.js')) {
      return { url: FIRE_URL, shortCircuit: true, format: 'module' };
    }
    if (specifier.endsWith('conf/configuration') || specifier.endsWith('conf/configuration.js')) {
      return { url: CONFIG_URL, shortCircuit: true, format: 'module' };
    }
    if (specifier === 'firebase/compat/app' || specifier === 'axios') {
      return { url: abs('tests/helpers/empty-stub.mjs'), shortCircuit: true, format: 'module' };
    }
    // The app source uses bundler-style extensionless relative imports, which
    // Node's ESM resolver rejects. Resolve them against the real filesystem so
    // the genuine module graph is loaded.
    if (specifier.startsWith('.') && context?.parentURL?.startsWith('file:')) {
      const parentPath = fileURLToPath(context.parentURL);
      const base = path.resolve(path.dirname(parentPath), specifier);
      for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, 'index.js')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true, format: 'module' };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === FIRE_URL) {
      return { format: 'module', shortCircuit: true, source: `export default globalThis.__FIRE_STUB__;\n` };
    }
    if (url === CONFIG_URL) {
      return { format: 'module', shortCircuit: true, source: `export default {};\n` };
    }
    return nextLoad(url, context);
  },
});

globalThis.__FIRE_STUB__ = fireStub;

test('D6: listBlogPosts degrades to an empty envelope instead of throwing ReferenceError', async () => {
  const mod = await import('../src/firestore/dbOperations.js');
  assert.equal(typeof mod.listBlogPosts, 'function', 'the real listBlogPosts must be exercised');

  let result;
  await assert.doesNotReject(
    async () => {
      result = await mod.listBlogPosts({ page: 3, limit: 25, status: 'approved' });
    },
    err => {
      // The historical failure mode: the catch handler itself threw.
      assert.notEqual(err?.name, 'ReferenceError', 'the fallback must not reference an out-of-scope binding');
      return true;
    },
    'listBlogPosts must not reject when Firestore fails'
  );

  assert.equal(result.success, true, 'the documented fallback contract is success:true with an empty list');
  assert.deepEqual(result.posts, []);
  assert.equal(result.pagination.totalCount, 0);
  assert.equal(result.pagination.hasNextPage, false);
  assert.equal(result.pagination.hasPreviousPage, false);
  // The caller-supplied paging context must survive the failure path.
  assert.equal(result.pagination.currentPage, 3, 'currentPage must echo the requested page');
  assert.equal(result.pagination.limit, 25, 'limit must echo the requested limit');
});

test('D6: the fallback still works when no paging options are supplied', async () => {
  const mod = await import('../src/firestore/dbOperations.js');
  const result = await mod.listBlogPosts({});
  assert.equal(result.success, true);
  assert.equal(result.pagination.currentPage, 1, 'defaults must apply when options are absent');
  assert.equal(result.pagination.limit, 10);
});
