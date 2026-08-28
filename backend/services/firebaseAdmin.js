'use strict';

// Identity-only Firebase Admin adapter. Application data, files, queues, and
// telemetry are intentionally unavailable from this module by construction.
const appApi = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const unwrap = app => app?._delegate || app;
const wrap = app => ({
  _delegate: app,
  name: app.name,
  options: app.options,
  auth: () => getAuth(app),
  delete: () => appApi.deleteApp(app),
});

const firebaseAdminIdentity = {
  initializeApp(options, name) { return wrap(appApi.initializeApp(options, name)); },
  app(name) { return wrap(appApi.getApp(name)); },
  get apps() { return appApi.getApps().map(wrap); },
  auth(app) { return getAuth(unwrap(app) || appApi.getApp()); },
  credential: { cert: appApi.cert, applicationDefault: appApi.applicationDefault },
};

module.exports = firebaseAdminIdentity;
