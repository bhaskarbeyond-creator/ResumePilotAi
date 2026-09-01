import fs from 'fs';
import path from 'path';

console.log('============================================================');
console.log('PHASE 1: INDEPENDENT COMPREHENSIVE UI ACTION CENSUS');
console.log('============================================================\n');

function walk(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
            files = files.concat(walk(full));
        } else if (/\.(jsx|js|tsx|ts)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const adminDirs = [
    path.resolve('src/components/admin'),
    path.resolve('src/enterprise'),
    path.resolve('src/components/Blog/BlogEditor'),
];

const allFiles = adminDirs.flatMap(d => walk(d));
console.log(`Analyzing ${allFiles.length} admin/enterprise component files...\n`);

const controls = [];

for (const file of allFiles) {
    const relPath = path.relative('.', file);
    const content = fs.readFileSync(file, 'utf8');

    // 1. Button tags
    const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let bMatch;
    while ((bMatch = buttonRegex.exec(content)) !== null) {
        const attrs = bMatch[1];
        const innerText = bMatch[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
        const onClickMatch = attrs.match(/onClick=\{([^}]+)\}/);
        const typeMatch = attrs.match(/type=['"]([^'"]+)['"]/);
        const disabledMatch = attrs.match(/disabled=\{?([^}\s]+)?\}?/);
        const ariaLabelMatch = attrs.match(/aria-label=['"]([^'"]+)['"]/);

        controls.push({
            type: 'button',
            file: relPath,
            label: innerText || (ariaLabelMatch ? ariaLabelMatch[1] : 'Icon/Dynamic Button'),
            handler: onClickMatch ? onClickMatch[1] : (typeMatch && typeMatch[1] === 'submit' ? 'form.onSubmit' : 'none'),
            btnType: typeMatch ? typeMatch[1] : 'button',
            disabled: !!disabledMatch
        });
    }

    // 2. Form tags (onSubmit handlers)
    const formRegex = /<form\b([^>]*)>/gi;
    let fMatch;
    while ((fMatch = formRegex.exec(content)) !== null) {
        const attrs = fMatch[1];
        const onSubmitMatch = attrs.match(/onSubmit=\{([^}]+)\}/);
        controls.push({
            type: 'form',
            file: relPath,
            label: 'Form Submission',
            handler: onSubmitMatch ? onSubmitMatch[1] : 'none'
        });
    }

    // 3. Select tags (onChange handlers)
    const selectRegex = /<select\b([^>]*)>/gi;
    let sMatch;
    while ((sMatch = selectRegex.exec(content)) !== null) {
        const attrs = sMatch[1];
        const onChangeMatch = attrs.match(/onChange=\{([^}]+)\}/);
        const nameMatch = attrs.match(/name=['"]([^'"]+)['"]/);
        controls.push({
            type: 'select',
            file: relPath,
            label: nameMatch ? `Select (${nameMatch[1]})` : 'Dropdown Select',
            handler: onChangeMatch ? onChangeMatch[1] : 'none'
        });
    }

    // 4. Input checkboxes / toggles (onChange handlers)
    const inputRegex = /<input\b([^>]*)>/gi;
    let iMatch;
    while ((iMatch = inputRegex.exec(content)) !== null) {
        const attrs = iMatch[1];
        const typeMatch = attrs.match(/type=['"]([^'"]+)['"]/);
        const onChangeMatch = attrs.match(/onChange=\{([^}]+)\}/);
        const nameMatch = attrs.match(/name=['"]([^'"]+)['"]/);
        if (typeMatch && ['checkbox', 'radio', 'file', 'search'].includes(typeMatch[1])) {
            controls.push({
                type: `input-${typeMatch[1]}`,
                file: relPath,
                label: nameMatch ? `Input ${typeMatch[1]} (${nameMatch[1]})` : `Input ${typeMatch[1]}`,
                handler: onChangeMatch ? onChangeMatch[1] : 'none'
            });
        }
    }
}

console.log(`Total interactive controls discovered: ${controls.length}`);

// Group by primary screen / module
const byFile = {};
for (const c of controls) {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push(c);
}

console.log('\nBreakdown by component:');
Object.entries(byFile).forEach(([f, list]) => {
    console.log(`  ${f}: ${list.length} controls`);
});

fs.writeFileSync('test-results/INDEPENDENT_UI_ACTION_CENSUS.json', JSON.stringify({ totalControls: controls.length, byFile, controls }, null, 2));
