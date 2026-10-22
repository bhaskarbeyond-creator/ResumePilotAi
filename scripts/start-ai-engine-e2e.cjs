'use strict';
// Real Express routes, middleware, MariaDB repository, and non-production signed identity verifier.
// No repository/provider/auth mocks. Refuse to start against an unspecified database.
if (process.env.NODE_ENV !== 'test' || !process.env.TEST_AUTH_HMAC_SECRET || !process.env.DB_HOST || !/(?:^|[_-])(?:test|ci|sandbox)(?:$|[_-])/.test(process.env.DB_NAME || '')) {
  throw new Error('Authenticated AI E2E requires explicitly disposable MariaDB and the test-only signed identity verifier');
}
const app = require('../backend/index');
app.listen(8080, '0.0.0.0', () => console.log('Authenticated AI E2E backend listening on 8080'));
