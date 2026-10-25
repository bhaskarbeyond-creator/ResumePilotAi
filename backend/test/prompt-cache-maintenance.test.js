'use strict';

// F-11 (P2): the 6-hourly autonomous maintenance cycle called
// promptCache.cleanExpired(), but LruPromptCache never defined it — the
// TypeError was swallowed by the shared try/catch, so expired prompt-cache
// entries were NEVER proactively purged (only lazily on get() or under LRU
// pressure) and the warning read like a generic maintenance failure. The
// working cooldown step masked the bug.
//
// Fix contract:
//  - LruPromptCache.cleanExpired(now?) purges entries with expiresAt < now
//    (and malformed entries) and returns the purge count;
//  - the maintenance cycle runs its steps in SEPARATE try blocks: a throwing
//    step never skips the next one.

process.env.FREELMAPI_METRICS_DB = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LruPromptCache, promptCache } = require('../freellmapi/services/cache');
const { cooldownManager } = require('../freellmapi/services/cooldown');
const freellm = require('../freellmapi');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('F-11: cleanExpired purges expired entries, keeps fresh ones, returns the count', () => {
    const cache = new LruPromptCache(10, 60_000);
    cache.set([{ role: 'user', content: 'expired fixture' }], 'model-a', 0.5, 'stale');
    cache.set([{ role: 'user', content: 'fresh fixture' }], 'model-a', 0.5, 'fresh');
    // Backdate one entry past its expiry (direct map access is the only way to
    // age an entry without waiting out the TTL).
    const expiredKey = [...cache.cache.keys()][0];
    cache.cache.get(expiredKey).expiresAt = Date.now() - 1000;

    const purged = cache.cleanExpired();
    assert.equal(purged, 1, 'exactly the expired entry is purged');
    assert.equal(cache.size(), 1);
    assert.equal(cache.get([{ role: 'user', content: 'fresh fixture' }], 'model-a', 0.5), 'fresh');
    assert.equal(cache.get([{ role: 'user', content: 'expired fixture' }], 'model-a', 0.5), null);
});

test('F-11: cleanExpired is safe on an empty cache and purges malformed entries', () => {
    const cache = new LruPromptCache(10, 60_000);
    assert.equal(cache.cleanExpired(), 0);
    cache.cache.set('malformed-entry', null);
    assert.equal(cache.cleanExpired(), 1, 'a malformed entry is defensively purged');
    assert.equal(cache.size(), 0);
});

test('F-11: the maintenance cycle actually purges the prompt cache (the method now exists)', async () => {
    promptCache.clear();
    promptCache.cache.set('aged-fixture', { value: 'stale', expiresAt: Date.now() - 5000 });
    promptCache.cache.set('live-fixture', { value: 'live', expiresAt: Date.now() + 60_000 });

    freellm.startAutonomousMaintenance({ intervalMs: 20 });
    try {
        await sleep(90); // >= 3 cycles
    } finally {
        freellm.stopAutonomousMaintenance();
    }

    assert.equal(promptCache.cache.has('aged-fixture'), false, 'expired entry proactively purged by the cycle');
    assert.equal(promptCache.cache.has('live-fixture'), true, 'fresh entry untouched');
    promptCache.clear();
});

test('F-11: a throwing maintenance step no longer skips the next one', async () => {
    promptCache.clear();
    promptCache.cache.set('aged-isolation', { value: 'stale', expiresAt: Date.now() - 5000 });

    const originalCooldownStep = cooldownManager.cleanExpired;
    cooldownManager.cleanExpired = () => { throw new Error('cooldown step fixture failure'); };
    freellm.startAutonomousMaintenance({ intervalMs: 20 });
    try {
        await sleep(90);
    } finally {
        freellm.stopAutonomousMaintenance();
        cooldownManager.cleanExpired = originalCooldownStep;
    }

    assert.equal(promptCache.cache.has('aged-isolation'), false,
        'step 2 ran even though step 1 threw — the steps are isolated');
    promptCache.clear();
});
