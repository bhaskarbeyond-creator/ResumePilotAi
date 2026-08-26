import fs from 'fs';
import path from 'path';

function countTestsInFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Match test( or it(
    // We strip comments to avoid matching commented out tests
    const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');
    
    const matches = stripped.match(/\b(test|it)\s*\(/g) || [];
    return matches.length;
}

function analyzeFolder(dir, ext = '.test.') {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir)
        .filter(f => f.includes(ext))
        .map(f => {
            const fullPath = path.join(dir, f);
            const testCount = countTestsInFile(fullPath);
            return {
                fileName: f,
                filePath: fullPath,
                testCount
            };
        });
    return files;
}

const rootFiles = analyzeFolder('tests', '.test.');
const backendFiles = analyzeFolder('backend/test', '.test.');
const enterpriseFiles = analyzeFolder('backend/enterprise-test', '.test.');
const srcFiles = [{ fileName: 'App.test.js', filePath: 'src/components/welcome/App.test.js', testCount: 1 }];

console.log('=== TEST FILE INVENTORY & STATS ===');
console.log(`Root tests/ : ${rootFiles.length} files, ${rootFiles.reduce((s, f) => s + f.testCount, 0)} static test assertions`);
console.log(`Backend backend/test/ : ${backendFiles.length} files, ${backendFiles.reduce((s, f) => s + f.testCount, 0)} static test assertions`);
console.log(`Enterprise backend/enterprise-test/ : ${enterpriseFiles.length} files, ${enterpriseFiles.reduce((s, f) => s + f.testCount, 0)} static test assertions`);
console.log(`Src src/ : ${srcFiles.length} files, ${srcFiles.reduce((s, f) => s + f.testCount, 0)} test`);

const totalFiles = rootFiles.length + backendFiles.length + enterpriseFiles.length + srcFiles.length;
console.log(`TOTAL UNIQUE TEST FILES = ${totalFiles}`);
