// Read-only AST census. Route declaration discovery != runtime verification.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'espree';
import { CANDIDATE_NAVIGATION } from '../src/components/cuba/candidateNavigation.js';
const output = 'docs/candidate-audit';
await fs.mkdir(output, { recursive: true });
const files = [
    ['src/main.jsx', ''],
    ['src/components/Dashboard/DashboardMain/DashboardMain.jsx', '/dashboard'],
    ['src/components/BuildResume/BuildResume.jsx', '/build-resume'],
];
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (node.type) visit(node);
    for (const [key, value] of Object.entries(node)) {
        if (['loc', 'range'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}
const navigation = CANDIDATE_NAVIGATION.flatMap(group => group.items);
const routes = [];
for (const [file, prefix] of files) {
    const source = await fs.readFile(file, 'utf8');
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true, loc: true });
    const imports = {};
    walk(tree, node => {
        if (node.type === 'ImportDeclaration') for (const entry of node.specifiers) imports[entry.local.name] = node.source.value;
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression' && node.init.callee.name === 'lazy') {
            walk(node.init, inner => { if (inner.type === 'ImportExpression' && inner.source.type === 'Literal') imports[node.id.name] = inner.source.value; });
        }
    });
    const resolved = {};
    for (const [name, specifier] of Object.entries(imports)) {
        if (!specifier.startsWith('.')) continue;
        const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        for (const extension of ['', '.jsx', '.js']) {
            try { const stat = await fs.stat(candidate + extension); if (stat.isFile()) { resolved[name] = candidate + extension; break; } } catch { /* missing import is left unresolved */ }
        }
    }
    walk(tree, node => {
        if (node.type !== 'JSXElement' || node.openingElement.name?.name !== 'Route') return;
        const attributes = node.openingElement.attributes;
        const route = attributes.find(attribute => attribute.name?.name === 'path');
        const index = attributes.some(attribute => attribute.name?.name === 'index');
        if (!route && !index) return;
        const value = route?.value;
        let paths = [];
        if (index) paths = [prefix || '/'];
        else if (value.type === 'Literal') paths = [prefix + (value.value ? '/' + value.value.replace(/^\//, '') : '')];
        else {
            const expression = source.slice(value.range[0], value.range[1]);
            if (expression.includes('/export/Cv')) paths = Array.from({ length: 51 }, (_, i) => `/export/Cv${i + 1}/:resumeId/:language`);
            else if (expression.includes('/export/Cover')) paths = Array.from({ length: 4 }, (_, i) => `/export/Cover${i + 1}/:resumeId/:language`);
            else paths = [`DYNAMIC:${expression}`];
        }
        const element = attributes.find(attribute => attribute.name?.name === 'element');
        const elements = [];
        let redirect = null;
        walk(element, child => {
            if (child.type === 'JSXOpeningElement') {
                const name = child.name?.name;
                if (name && /^[A-Z]/.test(name)) elements.push(name);
                if (name === 'Navigate') {
                    const to = child.attributes.find(attribute => attribute.name?.name === 'to')?.value;
                    redirect = to?.type === 'Literal' ? to.value : to ? source.slice(to.range[0], to.range[1]) : null;
                }
            }
        });
        for (const url of paths) routes.push({
            route: url || '/', router: file, line: node.loc.start.line, components: elements,
            sources: elements.map(name => resolved[name]).filter(Boolean), redirect,
            access: prefix || elements.includes('RequireAuthenticated') ? 'authenticated; backend ownership/role still required' : elements.includes('RequireExportAccess') ? 'session OR single-use render token; backend checks required' : 'public/conditional; inspect component',
            navigation: navigation.filter(item => item.to.split('?')[0] === url).map(item => item.label),
            verification: url === '/dashboard/notifications' ? 'component/browser SIMULATED API; route guard unverified' : 'static declaration only',
        });
    });
}
const endpoints = [];
for (const file of ['backend/index.js', ...(await fs.readdir('backend/routes')).filter(file => file.endsWith('.js')).map(file => `backend/routes/${file}`)]) {
    const source = await fs.readFile(file, 'utf8');
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true, loc: true });
    walk(tree, node => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
        const method = node.callee.property.name;
        const owner = node.callee.object.name;
        if (!['get','post','put','patch','delete','use'].includes(method) || !/^(app|.*[Rr]outer)$/.test(owner || '')) return;
        const first = node.arguments[0];
        // app.get('setting') is an Express setting lookup, not a route.
        if (method === 'get' && node.arguments.length < 2) return;
        if (first?.type === 'Literal' && typeof first.value === 'string' && !first.value.startsWith('/')) return;
        if (!first || !['Literal','ArrayExpression','Identifier','TemplateLiteral'].includes(first.type)) return;
        endpoints.push({ file, line: node.loc.start.line, receiver: owner, method: method.toUpperCase(), pathExpression: source.slice(first.range[0], first.range[1]), verification: 'static; router mounts and middleware require tracing' });
    });
}
await fs.writeFile(`${output}/route-census.json`, JSON.stringify({ date: '2026-10-14', method: 'Espree JSX AST; expands two known export maps; main includes noncandidate roles for completeness', declarations: routes }, null, 2) + '\n');
await fs.writeFile(`${output}/endpoint-census.json`, JSON.stringify({ date: '2026-10-14', limitations: 'Includes mounts/dynamic expressions; not a count of unique endpoints. Enterprise subrouters/services not recursively expanded.', declarations: endpoints }, null, 2) + '\n');
const escape = value => String(value || '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
await fs.writeFile(`${output}/ROUTE_CENSUS.md`, '# Route declaration census\n\nGenerated by `node scripts/candidate-workspace-inventory.mjs`. Static existence is not execution. Query/tab/modal states need separate review. Main router includes other roles to avoid hiding shared boundaries.\n\n| Route | Component / source | Guard | Navigation | Redirect | Runtime status |\n|---|---|---|---|---|---|\n' + routes.map(row => `| \`${escape(row.route)}\` | ${escape(row.components.join(' → '))}; ${escape(row.sources.join(', '))} (${row.router}:${row.line}) | ${escape(row.access)} | ${escape(row.navigation.join(', '))} | ${escape(row.redirect)} | ${escape(row.verification)} |`).join('\n') + '\n');
console.log(JSON.stringify({ routes: routes.length, endpointsAndMounts: endpoints.length, output }));
