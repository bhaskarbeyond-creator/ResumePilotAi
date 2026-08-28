/** Explicit API-boundary test adapter; production code never imports this module. */
export function createProfileApiAdapter(initialProfile = {}) {
  let profile = { ...structuredClone(initialProfile), revision: Number(initialProfile.revision || 0) };
  let queue = Promise.resolve();
  const requests = [];

  async function api(path, options = {}) {
    requests.push({ path, options: structuredClone(options) });
    if (path !== '/api/users-data/profile') {
      throw Object.assign(new Error(`Unexpected test API path: ${path}`), { code: 'UNEXPECTED_TEST_REQUEST' });
    }
    const method = String(options.method || 'GET').toUpperCase();
    if (method === 'GET') return { success: true, user: { profile: structuredClone(profile) } };
    if (method !== 'POST') throw new Error(`Unexpected test API method: ${method}`);

    let release;
    const previous = queue;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const body = JSON.parse(options.body || '{}');
      const expectedRevision = Number(body.expectedRevision);
      if (expectedRevision !== profile.revision) {
        const error = Object.assign(new Error('Profile changed in another tab or device.'), {
          status: 409,
          code: 'PROFILE_CONFLICT',
          details: {
            code: 'PROFILE_CONFLICT',
            remoteRevision: profile.revision,
            remoteProfile: structuredClone(profile),
          },
        });
        throw error;
      }
      profile = { ...structuredClone(body.profile || {}), revision: profile.revision + 1 };
      return { success: true, user: { profile: structuredClone(profile) } };
    } finally {
      release();
    }
  }

  return {
    api,
    requests,
    snapshot: () => structuredClone(profile),
  };
}
