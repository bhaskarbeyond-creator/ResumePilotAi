// Narrow compatibility adapter for Firebase Admin's modular API. Keeping this local makes
// the v14 migration explicit without spreading initialization mechanics through routes.
const appApi = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const firestoreApi = require('firebase-admin/firestore');

const unwrap = app => app?._delegate || app;
const wrap = app => ({
  _delegate: app,
  name: app.name,
  options: app.options,
  auth: () => getAuth(app),
  firestore: () => firestoreApi.getFirestore(app),
  delete: () => appApi.deleteApp(app),
});

const firebaseAdmin = {
  initializeApp(options, name) { return wrap(appApi.initializeApp(options, name)); },
  app(name) { return wrap(appApi.getApp(name)); },
  get apps() { return appApi.getApps().map(wrap); },
  auth(app) { return getAuth(unwrap(app) || appApi.getApp()); },
  firestore(app) { return firestoreApi.getFirestore(unwrap(app) || appApi.getApp()); },
  credential: { cert: appApi.cert, applicationDefault: appApi.applicationDefault },
};

firebaseAdmin.firestore.FieldValue = firestoreApi.FieldValue;
firebaseAdmin.firestore.Timestamp = firestoreApi.Timestamp;
firebaseAdmin.firestore.FieldPath = firestoreApi.FieldPath;

module.exports = firebaseAdmin;
