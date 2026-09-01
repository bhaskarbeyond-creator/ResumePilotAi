import fs from 'fs';
import path from 'path';

function walk(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
            files = files.concat(walk(full));
        } else if (/\.(js|jsx|ts|tsx|json|html|css|scss)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const srcFiles = walk(path.resolve('src'));
const backendFiles = walk(path.resolve('backend')).filter(f => !f.includes('test') && !f.includes('fixtures'));

const domainPatterns = [
    /https?:\/\/ai-resume-builder\.local/gi,
    /https?:\/\/airesume\.projectdemo\.guru/gi,
    /https?:\/\/localhost:\d+/gi,
];

const findings = [];

for (const file of [...srcFiles, ...backendFiles]) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        for (const pat of domainPatterns) {
            const matches = line.match(pat);
            if (matches) {
                findings.push({
                    file: path.relative('.', file),
                    line: idx + 1,
                    match: matches[0],
                    snippet: line.trim()
                });
            }
        }
    });
}

console.log('=== DOMAIN PORTABILITY AUDIT ===');
console.log('App files scanned (src + backend runtime):', srcFiles.length + backendFiles.length);
console.log('Hardcoded domain findings:', findings.length);
findings.forEach(f => {
    console.log(`  ${f.file}:${f.line} -> ${f.match} [${f.snippet}]`);
});

fs.writeFileSync('test-results/DOMAIN_PORTABILITY_FINDINGS.json', JSON.stringify(findings, null, 2));
