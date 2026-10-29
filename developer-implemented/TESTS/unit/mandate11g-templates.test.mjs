import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(currentFile), '../../..');
const require = createRequire(join(root, 'frontend/package.json'));
const ts = require('typescript');
const frontend = join(root, 'frontend');
const source = async path => readFile(join(frontend, 'src', path), 'utf8');
const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const catalogUrl = dataUrl(compile(await source('lib/template-catalog.ts')));
const catalog = await import(catalogUrl);
const layoutCode = compile(await source('lib/template-layouts.ts')).replace("'./template-catalog'", JSON.stringify(catalogUrl)).replace('"./template-catalog"', JSON.stringify(catalogUrl));
const layouts = await import(dataUrl(layoutCode));
const viewModelUrl = dataUrl(compile(await source('lib/resume-view-model.ts')));
const utilCode = compile(await source('cv-templates/templateUtils.ts')).replace("'@/lib/resume-view-model'", JSON.stringify(viewModelUrl)).replace('"@/lib/resume-view-model"', JSON.stringify(viewModelUrl));
const utils = await import(dataUrl(utilCode));
const archetypes = new Set(['modern-split', 'executive-banner', 'minimal-ats', 'tech-grid', 'compact-euro']);
const categories = new Set(catalog.TEMPLATE_CATEGORIES.filter(category => category.id !== 'all').map(category => category.id));
const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function audit(templates, specs) {
  const errors = [];
  if (templates.length !== 100) errors.push('count');
  const ids = new Set();
  const names = new Set();
  for (const template of templates) {
    if (ids.has(template.id)) errors.push(`duplicate:${template.id}`);
    ids.add(template.id);
    if (!template.name?.trim() || names.has(template.name)) errors.push(`name:${template.id}`);
    names.add(template.name);
    if (!archetypes.has(template.archetype)) errors.push(`archetype:${template.id}`);
    if (!categories.has(template.category)) errors.push(`category:${template.id}`);
    for (const key of ['primary', 'secondary', 'accent', 'sidebarBg', 'sidebarText']) {
      if ((key === 'primary' || key === 'secondary' || template[key] !== undefined) && !(key === 'sidebarBg' ? utils.backgroundStops(template[key] || '').length : hex.test(template[key] || ''))) errors.push(`color:${template.id}:${key}`);
    }
    if (!template.font?.trim() || !/(serif|sans-serif|monospace)/.test(template.font)) errors.push(`font:${template.id}`);
    if (!template.thumbnail?.startsWith('/templates/')) errors.push(`thumbnail:${template.id}`);
    const spec = specs.find(specification => specification.id === template.id);
    if (!spec || !layouts.LAYOUT_FAMILIES.includes(spec.family) || !Number.isFinite(spec.asideWidth) || spec.asideWidth < 20 || spec.asideWidth > 45 || !Array.isArray(spec.mainOrder) || !spec.mainOrder.length || !['compact', 'standard', 'spacious'].includes(spec.density)) errors.push(`layout:${template.id}`);
  }
  for (let index = 1; index <= 100; index++) if (!ids.has(`Cv${index}`)) errors.push(`missing:Cv${index}`);
  return errors;
}

test('100 canonical IDs, metadata, layout mappings, thumbnails and lookup', async () => {
  assert.deepEqual(audit(catalog.TEMPLATES, layouts.LAYOUT_SPECS), []);
  assert.equal(new Set(catalog.TEMPLATES.map(template => template.id)).size, 100);
  assert.equal(new Set(layouts.LAYOUT_SPECS.map(spec => spec.fingerprint)).size, 100);
  for (const template of catalog.TEMPLATES) {
    assert.equal(catalog.tryGetTemplateMeta(template.id), template);
    const asset = join(frontend, 'public', template.thumbnail.replace(/^\//, ''));
    assert.ok((await stat(asset)).size > 0, `${template.id} thumbnail`);
    const spec = layouts.getLayoutSpec(template.id);
    const assigned = new Set([...spec.mainOrder, ...spec.asideSections]);
    for (const section of layouts.SECTION_KEYS) assert.ok(assigned.has(section), `${template.id} ${section}`);
    assert.equal(new Set(spec.mainOrder).size, spec.mainOrder.length, `${template.id} duplicate sections`);
    assert.ok(spec.asideSections.every(section => !spec.mainOrder.includes(section)));
  }
  assert.equal(catalog.tryGetTemplateMeta('Cv999'), null);
  assert.throws(() => catalog.getTemplateMeta('Cv999'), /Unknown resume template/);
  assert.throws(() => catalog.getTemplateMeta('Cover999'), /Unknown resume template/);
  assert.equal(catalog.tryGetTemplateMeta(null), null);
  assert.equal(layouts.tryGetLayoutSpec('Cv999'), null);
  assert.deepEqual(new Set(catalog.TEMPLATES.map(item => item.archetype)), archetypes);
  console.log(`Verified actual catalog and layouts: ${catalog.TEMPLATES.map(item => item.id).join(', ')}`);
});

test('validator detects missing IDs, duplicates, malformed colors, invalid archetypes and missing layouts', () => {
  assert.ok(audit(catalog.TEMPLATES.slice(1), layouts.LAYOUT_SPECS).includes('missing:Cv1'));
  assert.ok(audit([...catalog.TEMPLATES.slice(0, 99), catalog.TEMPLATES[0]], layouts.LAYOUT_SPECS).some(error => error.startsWith('duplicate:')));
  const badColor = catalog.TEMPLATES.map((item, index) => index ? item : { ...item, primary: '#xyz' });
  assert.ok(audit(badColor, layouts.LAYOUT_SPECS).includes('color:Cv1:primary'));
  const badFamily = catalog.TEMPLATES.map((item, index) => index ? item : { ...item, archetype: 'invalid' });
  assert.ok(audit(badFamily, layouts.LAYOUT_SPECS).includes('archetype:Cv1'));
  assert.ok(audit(catalog.TEMPLATES, layouts.LAYOUT_SPECS.slice(1)).includes('layout:Cv1'));
});

test('four catalog cover definitions match the separate builder IDs and have real thumbnails', async () => {
  const raw = await source('lib/cover-letters.ts');
  const tree = ts.createSourceFile('cover-letters.ts', raw, ts.ScriptTarget.ESNext, true);
  let initializer;
  for (const statement of tree.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(tree) === 'COVER_TEMPLATES') initializer = declaration.initializer?.getText(tree);
    }
  }
  assert.ok(initializer, 'builder cover definitions found');
  const builder = await import(dataUrl(compile(`export const covers = ${initializer};`)));
  assert.deepEqual(catalog.COVER_TEMPLATES.map(item => item.id), ['Cover1', 'Cover2', 'Cover3', 'Cover4']);
  assert.deepEqual(builder.covers.map(item => item.id), catalog.COVER_TEMPLATES.map(item => item.id));
  for (const cover of catalog.COVER_TEMPLATES) {
    assert.ok(cover.name && cover.description && hex.test(cover.primary) && hex.test(cover.secondary));
    assert.ok((await stat(join(frontend, 'public', cover.thumbnail.replace(/^\//, '')))).size > 0);
    assert.equal(catalog.tryGetTemplateMeta(cover.id), cover);
  }
  assert.ok(builder.covers.every(item => item.name && item.description && item.badge));
});

test('optional sections normalize defensively without inventing content or truncating text', () => {
  const empty = utils.normalizeDocumentResume(null);
  assert.equal(empty.id, '');
  assert.equal(empty.summary, '');
  for (const key of ['experience', 'education', 'skillCategories', 'projects', 'certifications', 'languages', 'achievements', 'hobbies', 'references']) assert.deepEqual(empty[key], []);
  const long = 'a'.repeat(100_123);
  const result = utils.normalizeDocumentResume({ data: JSON.stringify({ firstname: 'Asha', skills: [{ category: 'Tech', skills: ['TypeScript', 'Cloud'] }], experience: [null, { position: 'Engineer', description: long }] }), languages: [null, 'English'], projects: 'invalid' });
  assert.equal(result.heading.firstName, 'Asha');
  assert.equal(result.experience[0].description, long);
  assert.deepEqual(result.skillCategories[0].skills, ['TypeScript', 'Cloud']);
  assert.equal(result.languages[0].name, 'English');
  assert.deepEqual(result.projects, []);
  const hidden = utils.normalizeDocumentResume({ skills: ['Skill'], hiddenSections: ['skills'] });
  assert.deepEqual(hidden.skillCategories, []);
  const hiddenHeading = utils.normalizeDocumentResume({ firstname: 'Hidden', lastname: 'Person', email: 'hidden@example.test', hiddenSections: ['heading'] });
  assert.equal(hiddenHeading.heading.firstName, '');
  assert.equal(hiddenHeading.heading.lastName, '');
  assert.equal(hiddenHeading.heading.email, '');
  const nested = utils.normalizeDocumentResume({ id: 'nested', skills: null, firstname: '', data: JSON.stringify({ firstname: 'Real', skills: ['Real Skill'] }) });
  assert.equal(nested.heading.firstName, 'Real');
  assert.equal(nested.skillCategories[0].skills[0], 'Real Skill');
  for (const privacy of [{ hidePhoto: true }, { includePhoto: false }, { showPhoto: false }]) {
    const model = utils.normalizeDocumentResume({ firstname: 'Real', photo: 'https://example.test/photo.png', ...privacy });
    assert.equal(model.heading.showPhoto, false);
  }
  const emptyEntries = utils.normalizeDocumentResume({ experience: [null, {}, '   '], education: [null, {}], projects: [{}], hobbies: [' ', null] });
  assert.deepEqual(emptyEntries.experience, []);
  assert.deepEqual(emptyEntries.education, []);
  assert.deepEqual(emptyEntries.projects, []);
  assert.deepEqual(emptyEntries.hobbies, []);
});

test('all rendered foreground/background combinations meet AA normal-text contrast', () => {
  for (const template of catalog.TEMPLATES) {
    assert.ok(utils.contrastRatio(utils.readableAccent(template.primary), '#ffffff') >= 4.5, `${template.id} accent`);
    assert.ok(utils.contrastRatio(utils.getContrastTextColor(template.primary), template.primary) >= 4.5, `${template.id} banner`);
    const stops = utils.backgroundStops(template.sidebarBg || '#f1f5f9');
    const foreground = template.sidebarText && stops.every(stop => utils.contrastRatio(template.sidebarText, stop) >= 4.5) ? template.sidebarText : utils.getContrastTextColor(stops[0]);
    assert.ok(stops.every(stop => utils.contrastRatio(foreground, stop) >= 4.5), `${template.id} rail`);
  }
  assert.equal(utils.getTemplateDirection('ar-SA'), 'rtl');
  assert.equal(utils.getTemplateDirection('en'), 'ltr');
});
