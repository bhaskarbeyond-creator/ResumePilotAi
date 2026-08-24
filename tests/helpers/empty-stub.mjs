// Shared inert stub for module-hook based tests. Provides both a default and
// common named exports so `import X from 'y'` and `import { a } from 'y'`
// both resolve without pulling in the real dependency.
const stub = new Proxy(function noop() {}, {
  get: (target, prop) => (prop === 'default' ? stub : stub),
  apply: () => stub,
  construct: () => stub,
});
export default stub;
export const initializeApp = stub;
export const firestore = stub;
export const auth = stub;
