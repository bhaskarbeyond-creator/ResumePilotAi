'use strict';

/**
 * CSS cascade-order forensics.
 *
 * Root cause this tooling locks down:
 *   Route-level stylesheets are emitted into lazily loaded chunks. Vite appends
 *   each chunk's <link rel="stylesheet"> to <head> the first time that route is
 *   loaded, so the cascade order of two route stylesheets is decided by the
 *   order the routes were FIRST visited in the session. When two such chunks
 *   declare the same selector with different declarations, the rendered result
 *   depends on navigation history — and a hard reload "fixes" it only because a
 *   fresh document loads a different, smaller set of stylesheets.
 *
 * If no two independently loadable chunks declare the same selector or the same
 * custom property, load order cannot change the rendered result. That is the
 * invariant asserted by tests/css-cascade-isolation.test.mjs.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Remove comments and @keyframes/@font-face bodies, which are order-safe. */
function stripNonCascadeAtRules(css) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Drop @keyframes blocks entirely: `from`/`to`/percentage steps are scoped to
  // their own animation name and never participate in the document cascade.
  out = out.replace(/@(-\w+-)?keyframes\s+[^{]+\{(?:[^{}]*\{[^{}]*\}\s*)*\}/g, '');
  out = out.replace(/@font-face\s*\{[^{}]*\}/g, '');
  return out;
}

/**
 * Flatten a stylesheet into selector -> concatenated declarations. At-rule
 * conditions are preserved as part of the key so a rule inside
 * `@media (max-width: 1024px)` is not compared against the unconditional rule.
 */
function selectorMap(css) {
  const source = stripNonCascadeAtRules(css);
  const map = new Map();
  const conditions = [];
  let buffer = '';
  let depth = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      const head = buffer.trim().replace(/\s+/g, ' ');
      buffer = '';
      if (head.startsWith('@')) {
        conditions.push(head);
        depth += 1;
        continue;
      }
      // Read the declaration block for this selector.
      let block = '';
      let inner = 1;
      i += 1;
      for (; i < source.length && inner > 0; i += 1) {
        if (source[i] === '{') inner += 1;
        else if (source[i] === '}') { inner -= 1; if (inner === 0) break; }
        block += source[i];
      }
      const prefix = conditions.length ? `${conditions.join(' && ')} :: ` : '';
      for (const raw of head.split(',')) {
        const selector = raw.trim();
        if (!selector) continue;
        const key = prefix + selector;
        map.set(key, (map.get(key) || '') + normalizeDeclarations(block));
      }
      continue;
    }
    if (ch === '}') {
      if (conditions.length) conditions.pop();
      depth = Math.max(0, depth - 1);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  return map;
}

function normalizeDeclarations(block) {
  return block
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .sort()
    .join(';');
}

/**
 * A shared selector is only order-dependent when the two stylesheets set the
 * SAME property to a DIFFERENT value. Declaring disjoint properties (e.g. two
 * modules adding their own namespaced custom properties to `:root`) is safe
 * regardless of load order.
 */
function conflictingProperties(declarationsA, declarationsB) {
  const parse = text => {
    const map = new Map();
    for (const decl of String(text).split(';')) {
      const index = decl.indexOf(':');
      if (index <= 0) continue;
      map.set(decl.slice(0, index).trim().toLowerCase(), decl.slice(index + 1).trim());
    }
    return map;
  };
  const a = parse(declarationsA);
  const b = parse(declarationsB);
  const clashes = [];
  for (const [property, value] of a) {
    if (!b.has(property)) continue;
    if (b.get(property) !== value) clashes.push(property);
  }
  return clashes;
}

/** Custom properties declared on a global root, which apply to the whole document. */
function globalCustomProperties(css) {
  const map = selectorMap(css);
  const names = new Map();
  for (const [selector, declarations] of map) {
    const bare = selector.includes('::') ? selector.split('::').pop().trim() : selector;
    if (bare !== ':root' && bare !== 'html' && bare !== ':host') continue;
    for (const decl of declarations.split(';')) {
      const match = /^(--[\w-]+)\s*:\s*([\s\S]*)$/.exec(decl.trim());
      if (match) names.set(match[1], match[2].trim());
    }
  }
  return names;
}

/**
 * Read a built `dist` directory and return the stylesheets that are NOT
 * referenced by index.html. Entry stylesheets have a fixed, deterministic order;
 * everything else is appended at route-load time and is therefore order-sensitive.
 */
function readBuiltStylesheets(distDir) {
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) return null;
  const indexHtmlPath = path.join(distDir, 'index.html');
  const indexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf8') : '';
  const entryNames = new Set(
    [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+\.css)"/g)].map(m => m[1])
  );
  const all = fs.readdirSync(assetsDir).filter(name => name.endsWith('.css'));
  return {
    entry: all.filter(name => entryNames.has(name)).map(name => load(assetsDir, name)),
    lazy: all.filter(name => !entryNames.has(name)).map(name => load(assetsDir, name)),
  };
}

function load(dir, name) {
  const css = fs.readFileSync(path.join(dir, name), 'utf8');
  return { name, css, selectors: selectorMap(css), customProperties: globalCustomProperties(css) };
}

/**
 * Compare every pair of independently loadable stylesheets and report selectors
 * that are declared in both with *different* declarations. Each such pair is a
 * navigation-order dependency: the visual result changes with visit order.
 */
function findOrderDependentConflicts(sheets) {
  const conflicts = [];
  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      const a = sheets[i];
      const b = sheets[j];
      for (const [selector, declarations] of a.selectors) {
        if (!b.selectors.has(selector)) continue;
        const clashes = conflictingProperties(declarations, b.selectors.get(selector));
        if (clashes.length) conflicts.push({ selector, a: a.name, b: b.name, properties: clashes });
      }
      for (const [property, value] of a.customProperties) {
        if (!b.customProperties.has(property)) continue;
        if (b.customProperties.get(property) === value) continue;
        conflicts.push({ selector: `${property} (custom property)`, a: a.name, b: b.name, properties: [property] });
      }
    }
  }
  return conflicts;
}

/** Bare element / universal selectors declared unscoped by a module stylesheet. */
const GLOBAL_ELEMENT_SELECTORS = new Set([
  '*', 'html', 'body', 'a', 'p', 'img', 'button', 'input', 'select', 'textarea',
  'table', 'tr', 'td', 'th', 'form', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside',
  'label', 'div', 'span',
]);

function findUnscopedGlobalRules(css) {
  const found = [];
  for (const selector of selectorMap(css).keys()) {
    const bare = (selector.includes('::') ? selector.split('::').pop() : selector).trim();
    const head = bare.split(/[\s>+~]/)[0].trim();
    if (GLOBAL_ELEMENT_SELECTORS.has(head)) found.push(bare);
  }
  return found;
}

module.exports = {
  selectorMap,
  globalCustomProperties,
  conflictingProperties,
  readBuiltStylesheets,
  findOrderDependentConflicts,
  findUnscopedGlobalRules,
  GLOBAL_ELEMENT_SELECTORS,
};
