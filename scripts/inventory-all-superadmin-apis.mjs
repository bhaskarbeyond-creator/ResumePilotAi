import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the real express app
const app = (await import('../backend/index.js')).default;

function extractRoutes(app) {
    const routes = [];

    function processStack(stack, basePath = '') {
        if (!stack) return;
        for (const layer of stack) {
            if (layer.route) {
                const path = (basePath + (layer.route.path || '')).replace(/\/+/g, '/');
                const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
                routes.push({ path, methods });
            } else if (layer.name === 'router' && layer.handle?.stack) {
                let routerPath = '';
                if (layer.regexp) {
                    const match = layer.regexp.source
                        .replace('\\/?(?=\\/|$)', '')
                        .replace('^\\', '')
                        .replace('\\/?$', '')
                        .replace('(?=\\/|$)', '')
                        .replace(/\\\//g, '/')
                        .replace(/\^/g, '')
                        .replace(/\$/g, '');
                    routerPath = match;
                }
                processStack(layer.handle.stack, basePath + (routerPath ? '/' + routerPath : ''));
            }
        }
    }

    processStack(app.router?.stack || app._router?.stack || []);
    return routes;
}

const allRoutes = extractRoutes(app);
console.log(`Total Express API Routes Extracted: ${allRoutes.length}`);

// Filter admin, platform, enterprise, and data routes
const adminRoutes = allRoutes.filter(r => 
    r.path.startsWith('/api/admin') ||
    r.path.startsWith('/api/platform') ||
    r.path.startsWith('/api/enterprise') ||
    r.path.startsWith('/api/notifications-data') ||
    r.path.startsWith('/api/blog-data') ||
    r.path.startsWith('/api/jobs-data') ||
    r.path.startsWith('/api/users-data')
);

console.log(`Total Super Admin / Platform Routes: ${adminRoutes.length}`);

// Search for frontend consumers in src/
const srcDir = path.join(__dirname, '../src');
function getAllFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx']) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            files.push(...getAllFiles(fullPath, exts));
        } else if (entry.isFile() && exts.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
        }
    }
    return files;
}

const srcFiles = getAllFiles(srcDir);
const srcContents = srcFiles.map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));

const inventory = [];
for (const r of adminRoutes) {
    // Normalize path pattern for searching
    const pathPattern = r.path.replace(/\/:[a-zA-Z0-9_-]+/g, '');
    const consumers = [];
    for (const sc of srcContents) {
        if (sc.content.includes(pathPattern) || sc.content.includes(r.path)) {
            consumers.push(path.relative(srcDir, sc.file).replace(/\\/g, '/'));
        }
    }
    inventory.push({
        path: r.path,
        methods: r.methods.join(', '),
        consumerCount: consumers.length,
        consumers: consumers.slice(0, 3)
    });
}

console.log(JSON.stringify(inventory.slice(0, 20), null, 2));

fs.writeFileSync(
    path.join(__dirname, '../SUPER_ADMIN_API_INVENTORY.json'),
    JSON.stringify(inventory, null, 2)
);
console.log(`Saved ${inventory.length} routes to SUPER_ADMIN_API_INVENTORY.json`);
