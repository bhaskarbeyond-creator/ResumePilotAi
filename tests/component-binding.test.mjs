import test from 'node:test';
import assert from 'node:assert/strict';
import { assertComponentBinding } from './helpers/component-binding.mjs';
test('binding sentinel accepts eager and lazy imports with an actual JSX mount', () => {
    for (const binding of ["import Widget from './Widget';", "const Widget = lazy(() => import('./Widget'));"]) {
        assertComponentBinding(`${binding} const view = <Widget />;`, 'Widget', './Widget');
    }
});
test('binding sentinel rejects comments, wrong modules, removed mounts and unrelated imports', () => {
    for (const source of [
        "// import Widget from './Widget';\nconst view = <Widget />;",
        "import Widget from './Wrong'; const view = <Widget />;",
        "const Widget = lazy(() => import('./Widget')); // <Widget />",
        "const Wrong = lazy(() => import('./Widget')); const view = <Widget />;",
    ]) assert.throws(() => assertComponentBinding(source, 'Widget', './Widget'));
});
