'use strict';

/**
 * In-memory Firestore Admin SDK simulation for enterprise tests.
 *
 * Implements the API surface the enterprise data plane uses: collection/doc
 * references, chained where/orderBy/limit/startAfter queries, get/set/update/
 * delete/create, runTransaction with serialized commit semantics (a faithful
 * stand-in for Firestore's serialized transactions), FieldValue sentinels
 * (serverTimestamp, increment, delete), and Timestamp objects with toMillis().
 *
 * This is TEST INFRASTRUCTURE ONLY. Production code paths use the real Admin
 * SDK; the harness exists so tenant isolation, concurrency, and durability
 * logic can be verified without external services.
 */

class HarnessTimestamp {
  constructor(milliseconds) {
    this._milliseconds = milliseconds;
  }
  static fromMillis(milliseconds) { return new HarnessTimestamp(milliseconds); }
  static now() { return new HarnessTimestamp(Date.now()); }
  toMillis() { return this._milliseconds; }
  toDate() { return new Date(this._milliseconds); }
  isEqual(other) { return other && typeof other.toMillis === 'function' && other.toMillis() === this._milliseconds; }
  valueOf() { return this._milliseconds; }
}

class HarnessFieldValue {
  static serverTimestamp() { return { __sentinel: 'serverTimestamp' }; }
  static increment(n) { return { __sentinel: 'increment', amount: Number(n) || 0 }; }
  static delete() { return { __sentinel: 'delete' }; }
  static arrayUnion(...values) { return { __sentinel: 'arrayUnion', values }; }
}

function isSentinel(value) {
  return value && typeof value === 'object' && '__sentinel' in value;
}

function normalizeWriteValue(value, commitTime) {
  if (isSentinel(value)) {
    if (value.__sentinel === 'serverTimestamp') return HarnessTimestamp.fromMillis(commitTime);
    if (value.__sentinel === 'increment') return 0;
    if (value.__sentinel === 'delete') return undefined;
    if (value.__sentinel === 'arrayUnion') return [...value.values];
    throw new Error('Unsupported sentinel at top level');
  }
  if (value instanceof Date) return HarnessTimestamp.fromMillis(value.getTime());
  if (value && typeof value.toMillis === 'function') return new HarnessTimestamp(value.toMillis());
  return structuredCloneSafe(value);
}

function structuredCloneSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (item && typeof item.toMillis === 'function') return { __ts: item.toMillis() };
    return item;
  }), (key, item) => {
    if (item && typeof item === 'object' && '__ts' in item) return HarnessTimestamp.fromMillis(item.__ts);
    return item;
  });
}

function setPath(target, pathSegments, value) {
  let cursor = target;
  for (let i = 0; i < pathSegments.length - 1; i += 1) {
    const segment = pathSegments[i];
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null || Array.isArray(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[pathSegments[pathSegments.length - 1]] = value;
}

function applyFieldValueDocument(existing, data, commitTime) {
  const next = existing ? JSON.parse(JSON.stringify(existing, (key, item) => {
    if (item && typeof item.toMillis === 'function') return { __ts: item.toMillis() };
    return item;
  }), (key, item) => {
    if (item && typeof item === 'object' && '__ts' in item) return HarnessTimestamp.fromMillis(item.__ts);
    return item;
  }) : {};
  for (const [field, rawValue] of Object.entries(data)) {
    const segments = field.split('.');
    if (isSentinel(rawValue)) {
      if (rawValue.__sentinel === 'delete') {
        deletePath(next, segments);
      } else if (rawValue.__sentinel === 'serverTimestamp') {
        setPath(next, segments, HarnessTimestamp.fromMillis(commitTime));
      } else if (rawValue.__sentinel === 'increment') {
        const current = getPath(next, segments);
        setPath(next, segments, Number(current || 0) + rawValue.amount);
      } else if (rawValue.__sentinel === 'arrayUnion') {
        const current = getPath(next, segments);
        const list = Array.isArray(current) ? [...current] : [];
        for (const entry of rawValue.values) if (!list.some(item => JSON.stringify(item) === JSON.stringify(entry))) list.push(entry);
        setPath(next, segments, list);
      } else {
        throw new Error('Unsupported FieldValue sentinel');
      }
    } else {
      setPath(next, segments, normalizeWriteValue(rawValue, commitTime));
    }
  }
  return next;
}

function getPath(target, segments) {
  let cursor = target;
  for (const segment of segments) {
    if (cursor === undefined || cursor === null || typeof cursor !== 'object') return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function deletePath(target, segments) {
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    cursor = cursor?.[segments[i]];
    if (!cursor || typeof cursor !== 'object') return;
  }
  if (cursor) delete cursor[segments[segments.length - 1]];
}

class HarnessQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  forEach(fn) { this.docs.forEach(fn); }
}

class HarnessDocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this._data = data;
    this.id = ref.id;
    this.exists = data !== null && data !== undefined;
  }
  data() { return this._data === null || this._data === undefined ? undefined : structuredCloneSafe(this._data); }
  get(field) { return this.exists ? getPath(this._data, String(field).split('.')) : undefined; }
}

function compareValues(left, right) {
  const millis = value => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);
  const leftMillis = millis(left);
  const rightMillis = millis(right);
  if (leftMillis !== null || rightMillis !== null) return (leftMillis ?? -Infinity) - (rightMillis ?? -Infinity);
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function valuesEqual(left, right) {
  return compareValues(left, right) === 0;
}

const OPERATORS = {
  '==': (doc, field, value) => valuesEqual(getPath(doc, field.split('.')), value),
  '!=': (doc, field, value) => !valuesEqual(getPath(doc, field.split('.')), value),
  '<': (doc, field, value) => compareValues(getPath(doc, field.split('.')), value) < 0,
  '<=': (doc, field, value) => compareValues(getPath(doc, field.split('.')), value) <= 0,
  '>': (doc, field, value) => compareValues(getPath(doc, field.split('.')), value) > 0,
  '>=': (doc, field, value) => compareValues(getPath(doc, field.split('.')), value) >= 0,
  in: (doc, field, value) => (Array.isArray(value) ? value.some(entry => valuesEqual(getPath(doc, field.split('.')), entry)) : false),
 'array-contains': (doc, field, value) => Array.isArray(getPath(doc, field.split('.'))) && getPath(doc, field.split('.')).some(entry => valuesEqual(entry, value)),
};

class HarnessQuery {
  constructor(collection, overlays = [], mutations = []) {
    this.collection = collection;
    this._where = [];
    this._orderBy = [];
    this._limit = null;
    this._startAfter = null;
    this.overlays = overlays; // [{ref, data}] staged writes visible inside a transaction
    this.mutations = mutations;
  }

  where(field, operator, value) {
    if (!OPERATORS[operator]) throw new Error(`Memory Firestore harness: unsupported operator ${operator}`);
    const next = new HarnessQuery(this.collection, this.overlays, this.mutations);
    next._where = [...this._where, { field: String(field), operator, value }];
    next._orderBy = [...this._orderBy];
    next._limit = this._limit;
    next._startAfter = this._startAfter;
    return next;
  }

  orderBy(field, direction = 'asc') {
    const next = new HarnessQuery(this.collection, this.overlays, this.mutations);
    next._where = [...this._where];
    next._orderBy = [...this._orderBy, { field: String(field), direction: String(direction).toLowerCase() }];
    next._limit = this._limit;
    next._startAfter = this._startAfter;
    return next;
  }

  limit(count) {
    const next = new HarnessQuery(this.collection, this.overlays, this.mutations);
    next._where = [...this._where];
    next._orderBy = [...this._orderBy];
    next._limit = Number(count);
    next._startAfter = this._startAfter;
    return next;
  }

  startAfter(snapshotOrValue) {
    const next = new HarnessQuery(this.collection, this.overlays, this.mutations);
    next._where = [...this._where];
    next._orderBy = [...this._orderBy];
    next._limit = this._limit;
    next._startAfter = snapshotOrValue && typeof snapshotOrValue === 'object' && 'data' in snapshotOrValue
      ? snapshotOrValue.data()
      : snapshotOrValue;
    return next;
  }

  async get() {
    this.collection.store.assertQueryAllowed(this);
    let entries = await this.collection.store.listDocuments(this.collection.path, this.overlays);
    for (const predicate of this._where) {
      entries = entries.filter(({ data }) => {
        try { return OPERATORS[predicate.operator](data, predicate.field, predicate.value); } catch { return false; }
      });
    }
    for (const order of this._orderBy) {
      entries.sort((left, right) => {
        const result = compareValues(getPath(left.data, order.field.split('.')), getPath(right.data, order.field.split('.')));
        return order.direction === 'desc' ? -result : result;
      });
    }
    if (this._startAfter !== null && this._startAfter !== undefined && this._orderBy.length) {
      const order = this._orderBy[this._orderBy.length - 1];
      // Real Firestore accepts either a snapshot or the raw orderBy value(s) in
      // startAfter. Honour both: objects are projected onto the field path,
      // scalars are used directly as the cursor boundary.
      const boundary = this._startAfter !== null && typeof this._startAfter === 'object'
        ? getPath(this._startAfter, order.field.split('.'))
        : this._startAfter;
      let index = entries.findIndex(({ data }) => valuesEqual(getPath(data, order.field.split('.')), boundary));
      if (index >= 0) entries = entries.slice(index + 1);
    }
    if (this._limit !== null) entries = entries.slice(0, this._limit);
    return new HarnessQuerySnapshot(entries.map(({ ref, data }) => new HarnessDocumentSnapshot(ref, structuredCloneSafe(data))));
  }
}

class HarnessDocumentReference {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path.split('/').pop();
  }

  async get(overlayData = undefined) {
    if (overlayData !== undefined) {
      return new HarnessDocumentSnapshot(this, overlayData === null ? null : structuredCloneSafe(overlayData));
    }
    const data = await this.store.readDocument(this.path);
    return new HarnessDocumentSnapshot(this, data === undefined ? null : structuredCloneSafe(data));
  }

  async set(data, options = {}) {
    await this.store.writeDocument(this.path, data, { mode: options.merge ? 'merge' : 'set' });
    return this;
  }

  async update(data) {
    const existing = await this.store.readDocument(this.path);
    if (existing === undefined) {
      const error = new Error('5 NOT_FOUND: document does not exist');
      error.code = 5;
      throw error;
    }
    await this.store.writeDocument(this.path, data, { mode: 'update' });
    return this;
  }

  async delete() {
    await this.store.deleteDocument(this.path);
    return true;
  }

  async create(data) {
    const existing = await this.store.readDocument(this.path);
    if (existing !== undefined) {
      const error = new Error('6 ALREADY_EXISTS: document already exists');
      error.code = 6;
      throw error;
    }
    await this.store.writeDocument(this.path, data, { mode: 'set' });
    return this;
  }

  collection(name) {
    return new HarnessCollectionReference(this.store, `${this.path}/${name}`);
  }

  parent() {
    const segments = this.path.split('/');
    if (segments.length < 2) return null;
    const parentPath = segments.slice(0, -1).join('/');
    return segments.length % 2 === 1
      ? new HarnessCollectionReference(this.store, parentPath)
      : new HarnessDocumentReference(this.store, parentPath);
  }
}

class HarnessCollectionReference {
  constructor(store, path) {
    this.store = store;
    this.path = path.replace(/\/+$/, '');
    this.id = this.path.split('/').pop();
  }

  doc(id = null) {
    const docId = id === null ? `auto-${this.store.nextAutoId()}` : String(id);
    if (docId.includes('/')) throw new Error('Document id must not contain "/"');
    return new HarnessDocumentReference(this.store, `${this.path}/${docId}`);
  }

  async add(data) {
    const reference = this.doc();
    await reference.set(data);
    return reference;
  }

  where(field, operator, value) { return this._query().where(field, operator, value); }
  orderBy(field, direction) { return this._query().orderBy(field, direction); }
  limit(count) { return this._query().limit(count); }

  _query() { return new HarnessQuery(this); }

  async get() { return this._query().get(); }
}

class MemoryFirestore {
  constructor({ failWrites = false } = {}) {
    this.documents = new Map(); // path -> data
    this.mutex = Promise.resolve();
    this.autoId = 0;
    this.failWrites = failWrites;
    this.queryLog = [];
  }

  static get FieldValue() { return HarnessFieldValue; }
  static get Timestamp() { return HarnessTimestamp; }
  get FieldValue() { return HarnessFieldValue; }

  nextAutoId() {
    this.autoId += 1;
    return String(this.autoId).padStart(20, '0');
  }

  collection(path) {
    return new HarnessCollectionReference(this, path);
  }

  doc(path) {
    const segments = path.split('/');
    if (segments.length % 2 !== 0) throw new Error('Document path must have an even number of segments');
    return new HarnessDocumentReference(this, path);
  }

  /** WriteBatch: staged writes committed atomically. */
  batch() {
    const store = this;
    const operations = [];
    return {
      set(ref, data, options = {}) {
        operations.push({ ref, data, options, kind: 'set' });
        return this;
      },
      update(ref, data) {
        operations.push({ ref, data, kind: 'update' });
        return this;
      },
      delete(ref) {
        operations.push({ ref, kind: 'delete' });
        return this;
      },
      async commit() {
        if (store.failWrites) {
          const error = new Error('14 UNAVAILABLE: simulated Firestore outage');
          error.code = 14;
          throw error;
        }
        return store.enqueue(async () => {
          const commitTime = Date.now();
          for (const operation of operations) {
            const existing = store.documents.get(operation.ref.path);
            if (operation.kind === 'delete') {
              store.documents.delete(operation.ref.path);
              continue;
            }
            if (operation.kind === 'update' && existing === undefined) {
              const error = new Error('5 NOT_FOUND: document does not exist');
              error.code = 5;
              throw error;
            }
            const next = operation.kind === 'set' && !operation.options.merge
              ? applyFieldValueDocument({}, operation.data, commitTime)
              : applyFieldValueDocument(existing ?? {}, operation.data, commitTime);
            store.documents.set(operation.ref.path, next);
          }
        });
      },
    };
  }

  async listDocuments(collectionPath, overlays = []) {
    const overlayMap = new Map(overlays.map(({ ref, data }) => [ref.path, data]));
    const prefix = `${collectionPath}/`;
    const results = [];
    const seen = new Set();
    for (const [path, data] of this.documents) {
      if (!path.startsWith(prefix)) continue;
      const remainder = path.slice(prefix.length);
      if (remainder.includes('/')) continue; // direct children only
      seen.add(path);
      results.push({ ref: new HarnessDocumentReference(this, path), data });
    }
    for (const [path, data] of overlayMap) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      if (seen.has(path)) continue;
      if (data !== null) results.push({ ref: new HarnessDocumentReference(this, path), data });
    }
    return results;
  }

  assertQueryAllowed() {
    this.queryLog.push(new Date().toISOString());
  }

  async readDocument(path) {
    return this.documents.get(path);
  }

  async writeDocument(path, data, { mode }) {
    if (this.failWrites) {
      const error = new Error('14 UNAVAILABLE: simulated Firestore outage');
      error.code = 14;
      throw error;
    }
    return this.enqueue(async () => {
      const commitTime = Date.now();
      const existing = this.documents.get(path);
      if (mode === 'create' && existing !== undefined) {
        const error = new Error('6 ALREADY_EXISTS: document already exists');
        error.code = 6;
        throw error;
      }
      if (mode === 'update' && existing === undefined) {
        const error = new Error('5 NOT_FOUND: document does not exist');
        error.code = 5;
        throw error;
      }
      // set() without merge replaces the document; merge/update patch it.
      const next = mode === 'set'
        ? applyFieldValueDocument({}, data, commitTime)
        : applyFieldValueDocument(existing ?? {}, data, commitTime);
      this.documents.set(path, next);
      return undefined;
    });
  }

  async deleteDocument(path) {
    if (this.failWrites) {
      const error = new Error('14 UNAVAILABLE: simulated Firestore outage');
      error.code = 14;
      throw error;
    }
    return this.enqueue(async () => {
      this.documents.delete(path);
      return undefined;
    });
  }

  /** Serializes mutations the way Firestore serializes committed transactions. */
  enqueue(operation) {
    const run = this.mutex.then(operation);
    this.mutex = run.then(() => undefined, () => undefined);
    return run;
  }

  async runTransaction(body) {
    if (this.failWrites) {
      const error = new Error('14 UNAVAILABLE: simulated Firestore outage');
      error.code = 14;
      throw error;
    }
    const overlays = [];
    const release = await this.acquireLock();
    const findOverlay = ref => overlays.find(entry => entry.ref.path === ref.path);
    const stage = (ref, data, mode) => {
      const existingIndex = overlays.findIndex(entry => entry.ref.path === ref.path);
      const entry = { ref, data, mode };
      if (existingIndex >= 0) overlays[existingIndex] = entry;
      else overlays.push(entry);
      return entry;
    };
    const transaction = {
      get: async ref => {
        const overlay = findOverlay(ref);
        if (overlay) return new HarnessDocumentSnapshot(ref, overlay.data === null ? null : structuredCloneSafe(overlay.data));
        if (ref instanceof HarnessDocumentReference) return ref.get();
        throw new Error('Transaction.get requires a document reference');
      },
      set: (ref, data, options = {}) => {
        const mode = options.merge ? 'merge' : 'set';
        if (mode === 'merge') {
          const overlay = findOverlay(ref);
          const current = overlay ? overlay.data : this.documents.get(ref.path);
          stage(ref, applyFieldValueDocument(current ?? {}, data, Date.now()), 'set-replace');
        } else {
          stage(ref, data, 'set-replace');
        }
        return transaction;
      },
      update: (ref, data) => {
        const overlay = findOverlay(ref);
        const current = overlay ? overlay.data : this.documents.get(ref.path);
        if (current === undefined || current === null) {
          const error = new Error('5 NOT_FOUND: document does not exist');
          error.code = 5;
          throw error;
        }
        stage(ref, applyFieldValueDocument(current, data, Date.now()), 'set-replace');
        return transaction;
      },
      create: (ref, data) => {
        const overlay = findOverlay(ref);
        const current = overlay ? overlay.data : this.documents.get(ref.path);
        if (current !== undefined && current !== null) {
          const error = new Error('6 ALREADY_EXISTS: document already exists');
          error.code = 6;
          throw error;
        }
        stage(ref, data, 'create');
        return transaction;
      },
      delete: ref => {
        stage(ref, null, 'delete');
        return transaction;
      },
    };
    try {
      const result = await body(transaction);
      const commitTime = Date.now();
      for (const { ref, data, mode } of overlays) {
        if (mode === 'delete') {
          this.documents.delete(ref.path);
          continue;
        }
        if (mode === 'create' && this.documents.get(ref.path) !== undefined) {
          const error = new Error('6 ALREADY_EXISTS: document already exists');
          error.code = 6;
          throw error;
        }
        const existing = this.documents.get(ref.path);
        const next = mode === 'set-replace' && existing !== undefined
          // A non-merge set replaces the document; sentinels still resolve.
          ? applyFieldValueDocument({}, data, commitTime)
          : applyFieldValueDocument(existing ?? {}, data, commitTime);
        this.documents.set(ref.path, next);
      }
      return result;
    } finally {
      overlays.length = 0;
      release();
    }
  }

  async acquireLock() {
    const previous = this.mutex;
    let release;
    this.mutex = new Promise(resolve => { release = resolve; });
    await previous;
    return () => release();
  }

  /** Test helper: raw dump of every stored document path. */
  dump() {
    return Object.fromEntries([...this.documents.entries()].map(([path, data]) => [path, structuredCloneSafe(data)]));
  }
}

/** Admin-compatible facade: firestore() + FieldValue/Timestamp sentinels. */
function createMemoryAdmin({ db = new MemoryFirestore() } = {}) {
  // The real firebase-admin module exposes `admin.firestore` as a callable
  // namespace carrying FieldValue/Timestamp; mirror that shape exactly.
  const firestoreApi = () => db;
  firestoreApi.FieldValue = HarnessFieldValue;
  firestoreApi.Timestamp = HarnessTimestamp;
  return {
    firestore: firestoreApi,
    FieldValue: HarnessFieldValue,
    Timestamp: HarnessTimestamp,
  };
}

module.exports = {
  HarnessFieldValue,
  HarnessTimestamp,
  MemoryFirestore,
  createMemoryAdmin,
};
