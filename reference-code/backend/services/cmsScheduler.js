'use strict';

/**
 * Publish scheduled CMS posts through the MariaDB repository's atomic adapter.
 * The adapter owns row locking, revision checks, publication, and audit writes;
 * this service has no non-transactional or alternate-database fallback.
 */
async function publishDueBlogPosts({ actorUid = 'cms-scheduler', requestId = null, repository = null } = {}) {
  const repo = repository || require('../repositories').getRepository();
  if (!repo || typeof repo.publishDueBlogPostsAtomic !== 'function') {
    throw Object.assign(new Error('Atomic CMS publication adapter is unavailable'), {
      code: 'ATOMIC_CMS_PUBLICATION_UNAVAILABLE',
      status: 503,
    });
  }
  return repo.publishDueBlogPostsAtomic({ actorUid, requestId });
}

module.exports = { publishDueBlogPosts };
