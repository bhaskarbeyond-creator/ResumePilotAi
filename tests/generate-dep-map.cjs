const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const fileExtensions = ['.js', '.jsx', '.ts', '.tsx'];

function getAllFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(getAllFiles(fullPath));
    } else if (fileExtensions.includes(path.extname(item.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractDependencies(content) {
  // Match import statements: import ... from '...'
  const importRegex = /import\s+[^'"\n]+\s+from\s+['"]([^'"\n]+)['"]/g;
  // Match require statements: require('...')
  const requireRegex = /require\(['"]([^'"\n]+)['"]\)/g;
  // Match dynamic import: import('...')
  const dynamicImportRegex = /import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const deps = new Set();
  let match;
  while ((match = importRegex.exec(content)) !== null) deps.add(match[1]);
  while ((match = requireRegex.exec(content)) !== null) deps.add(match[1]);
  while ((match = dynamicImportRegex.exec(content)) !== null) deps.add(match[1]);
  return Array.from(deps);
}

const files = getAllFiles(srcDir);
const graph = {};
for (const file of files) {
  const rel = path.relative(__dirname, '..', file); // relative to project root
  const content = fs.readFileSync(file, 'utf8');
  graph[rel] = extractDependencies(content);
}

// Write to tests/dependency_map.json
fs.writeFileSync(
  path.join(__dirname, 'dependency_map.json'),
  JSON.stringify(graph, null, 2)
);
console.log('Dependency map written to tests/dependency_map.json');