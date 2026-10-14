import assert from 'node:assert/strict';
import { parse } from 'espree';

// Structural regression check: comments cannot satisfy an import or mount.
// Both eager and React.lazy imports must resolve the exact expected module.
export function assertComponentBinding(source, name, expectedModule) {
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } });
    let bound = false;
    let mounted = false;
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'ImportDeclaration' && node.source.value === expectedModule) {
            bound ||= node.specifiers.some(specifier => specifier.type === 'ImportDefaultSpecifier' && specifier.local.name === name);
        }
        if (node.type === 'VariableDeclarator' && node.id.name === name && node.init?.callee?.name === 'lazy') {
            const importer = node.init.arguments[0];
            bound ||= importer?.type === 'ArrowFunctionExpression' && importer.body.type === 'ImportExpression' && importer.body.source.value === expectedModule;
        }
        if (node.type === 'JSXOpeningElement' && node.name.name === name) mounted = true;
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') visit(value);
        }
    }
    visit(tree);
    assert.ok(bound, `${name} must bind ${expectedModule}`);
    assert.ok(mounted, `${name} must be mounted, not merely imported`);
}
