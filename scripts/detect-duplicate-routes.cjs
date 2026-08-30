#!/usr/bin/env node
'use strict';

/**
 * Duplicate Route Detector v2
 * 
 * Properly resolves router mount prefixes by tracing variable names
 * from require() to app.use() to the actual file.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'backend', 'index.js');
const ROUTES_DIR = path.join(ROOT, 'backend', 'routes');

function extractRoutes(filePath, prefix = '') {
    const content = fs.readFileSync(filePath, 'utf8');
    const routes = [];
    
    // Match router/app.METHOD('path', ...)
    const routeRegex = /(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*(?:\[?\s*)?(['"`])([^'"`]+)\2/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let fullPath = match[3];
        if (fullPath === 'trust proxy' || fullPath === 'x-powered-by') continue;
        if (prefix) fullPath = prefix + fullPath;
        fullPath = fullPath.replace(/\/+$/, '') || '/';
        routes.push({
            method, path: fullPath,
            file: path.relative(ROOT, filePath),
            line: content.substring(0, match.index).split('\n').length,
        });
    }
    
    // Match array-path routes
    const arrayRouteRegex = /(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*\[/g;
    while ((match = arrayRouteRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const bracketEnd = content.indexOf(']', match.index);
        if (bracketEnd === -1) continue;
        const arrayContent = content.substring(match.index, bracketEnd + 1);
        const pathMatch = arrayContent.match(/(['"`])([^'"`]+)\1/g);
        if (pathMatch) {
            for (const p of pathMatch) {
                let fullPath = p.replace(/['"`]/g, '');
                if (prefix) fullPath = prefix + fullPath;
                fullPath = fullPath.replace(/\/+$/, '') || '/';
                routes.push({
                    method, path: fullPath,
                    file: path.relative(ROOT, filePath),
                    line: content.substring(0, match.index).split('\n').length,
                });
            }
        }
    }
    
    return routes;
}

// Build a precise map: variable name -> { prefix, filePath }
function buildMountMap() {
    const content = fs.readFileSync(INDEX_PATH, 'utf8');
    const mounts = [];
    
    // Find require statements: const { X } = require('./routes/Y') or const X = require('./routes/Y')
    const requireMap = new Map(); // varName -> filePath
    const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
        const destructured = match[1];
        const simple = match[2];
        const file = match[3];
        
        if (destructured) {
            for (const v of destructured.split(',').map(s => s.trim().split(':')[0].trim())) {
                if (v) requireMap.set(v, file);
            }
        }
        if (simple) {
            requireMap.set(simple, file);
        }
    }
    
    // Find app.use('prefix', varName) mounts — direct router mounts
    const mountRegex = /app\s*\.\s*use\s*\(\s*(?:\[?\s*)?(['"`])([^'"`]+)\1\s*,\s*(\w+)/g;
    while ((match = mountRegex.exec(content)) !== null) {
        const prefix = match[2].replace(/\/+$/, '');
        const varName = match[3];
        const routeFile = requireMap.get(varName);
        if (routeFile) {
            mounts.push({
                prefix,
                varName,
                routeFile: routeFile + '.js',
                line: content.substring(0, match.index).split('\n').length,
            });
        }
    }
    
    // Find factory-created routers: const X = createFooRouter({...}); app.use('prefix', X);
    // Pattern: const healthRouter = createHealthRouter({...}); app.use('/api', healthRouter);
    const factoryVarRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(create\w+Router)\s*\(/g;
    while ((match = factoryVarRegex.exec(content)) !== null) {
        const varName = match[1];
        const factoryName = match[2];
        // Find the corresponding app.use for this variable
        const useRegex = new RegExp(`app\\s*\\.\\s*use\\s*\\(\\s*(?:\\[?\\s*)?(['"\`])([^'"\`]+)\\1\\s*,\\s*${varName}\\b`);
        const useMatch = content.match(useRegex);
        if (useMatch) {
            const prefix = useMatch[2].replace(/\/+$/, '');
            // Find which file this factory comes from
            const factoryReqRegex = new RegExp(`${factoryName}.*require\\(['"]\\.\\/routes\\/([^'"]+)['"]\\)`);
            const factoryReqMatch = content.match(factoryReqRegex);
            if (factoryReqMatch) {
                const routeFile = factoryReqMatch[1] + '.js';
                // Avoid duplicates
                if (!mounts.some(m => m.prefix === prefix && m.routeFile === routeFile)) {
                    mounts.push({
                        prefix,
                        varName,
                        routeFile,
                        line: content.substring(0, match.index).split('\n').length,
                    });
                }
            }
        }
    }
    
    return mounts;
}

// Main
console.log('=== Duplicate Route Detector v2 ===\n');

const inlineRoutes = extractRoutes(INDEX_PATH);
console.log(`Inline routes in index.js: ${inlineRoutes.length}`);

const mounts = buildMountMap();
console.log(`Mounted routers: ${mounts.length}\n`);

for (const m of mounts) {
    console.log(`  ${m.prefix} -> ${m.routeFile} (${m.varName})`);
}

// Extract routes from each mounted file with correct prefix
const routerRoutes = [];
for (const mount of mounts) {
    const filePath = path.join(ROOT, 'backend', 'routes', mount.routeFile);
    if (!fs.existsSync(filePath)) {
        console.warn(`  ⚠ Route file not found: ${mount.routeFile}`);
        continue;
    }
    const routes = extractRoutes(filePath, mount.prefix);
    for (const r of routes) {
        r.source = 'router';
        r.mountPrefix = mount.prefix;
        r.mountFile = mount.routeFile;
    }
    routerRoutes.push(...routes);
}

console.log(`\nRoutes in mounted routers: ${routerRoutes.length}`);

// Detect duplicates
const allRoutes = [...inlineRoutes, ...routerRoutes];
const seen = new Map();
const duplicates = [];

for (const route of allRoutes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
        const existing = seen.get(key);
        if (existing.file !== route.file) {
            duplicates.push({ key, first: existing, second: route });
        }
    } else {
        seen.set(key, route);
    }
}

console.log(`\nUnique route signatures: ${seen.size}`);
console.log(`Total route registrations: ${allRoutes.length}`);

if (duplicates.length > 0) {
    console.log(`\n❌ DUPLICATE ROUTES DETECTED: ${duplicates.length}\n`);
    for (const dup of duplicates) {
        console.log(`  ${dup.key}`);
        console.log(`    First:  ${dup.first.file}:${dup.first.line}`);
        console.log(`    Second: ${dup.second.file}:${dup.second.line}`);
        console.log('');
    }
    process.exit(1);
} else {
    console.log('\n✅ No duplicate routes detected.\n');
    
    console.log('Route Summary:');
    console.log(`  Inline (index.js): ${inlineRoutes.length}`);
    console.log(`  Mounted routers:   ${routerRoutes.length}`);
    console.log(`  Total unique:      ${seen.size}`);
    
    process.exit(0);
}
