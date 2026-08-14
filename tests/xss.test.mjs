import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

let sanitizer;
before(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  sanitizer = await import('../src/utils/sanitizeHtml.js');
});

test('rich text strips scriptable tags, event handlers, CSS and javascript URLs', () => {
  const attack = `<p onclick="alert(1)" style="background:url(https://attacker.test/x)">Hello</p>
    <svg><a xlink:href="javascript:alert(1)"><text>X</text></a></svg>
    <a href="javascript:alert(1)" target="_blank">click</a>
    <math><mtext><img src=x onerror=alert(1)></mtext></math>
    <iframe srcdoc="<script>alert(1)</script>"></iframe>`;
  const clean = sanitizer.sanitizeRichText(attack);
  assert.match(clean, /Hello/);
  assert.doesNotMatch(clean, /onclick|style=|javascript:|<svg|<math|<iframe|onerror/i);
});

test('blog HTML preserves safe structure but drops active image/link payloads', () => {
  const clean = sanitizer.sanitizeBlogHtml(`
    <table><tbody><tr><td>Safe</td></tr></tbody></table>
    <img src="https://images.example.com/photo.png" onerror="alert(1)" style="position:fixed">
    <img src="data:image/svg+xml,<svg onload=alert(1)>">
    <a href="javascript:alert(1)">bad</a>`);
  assert.match(clean, /<table>/);
  assert.match(clean, /https:\/\/images\.example\.com\/photo\.png/);
  assert.doesNotMatch(clean, /onerror|style=|javascript:|data:image/i);
});

test('URL sanitizer rejects parser differentials and active schemes', () => {
  for (const value of [
    'javascript:alert(1)', ' java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)', '//evil.example/path', 'file:///etc/passwd', 'https://user:pass@evil.example',
    'mailto:user@example.com?subject=ok%0d%0aBcc:evil@example.com'
  ]) assert.equal(sanitizer.sanitizeUrl(value), '', value);
  assert.equal(sanitizer.sanitizeUrl('/shared/abc_123'), '/shared/abc_123');
  assert.equal(sanitizer.sanitizeUrl('https://example.com/path').startsWith('https://example.com/path'), true);
  assert.equal(sanitizer.sanitizeUrl('mailto:user@example.com'), 'mailto:user@example.com');
});

test('print document sink removes executable markup and network-capable CSS', () => {
  const target = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' }).window;
  sanitizer.writeSanitizedPrintDocument(target, `<!doctype html><html><head>
    <style>@import 'https://evil.test/x.css'; .x{background:url(https://evil.test/pixel)} .y{background:image-set("https://evil.test/y" 1x)} .z{background:u\\72l(https://evil.test/z)}</style>
    </head><body onload="alert(1)"><script>alert(1)</script><div onclick="alert(1)">Invoice</div></body></html>`);
  const output = target.document.documentElement.outerHTML;
  assert.match(output, /Invoice/);
  assert.doesNotMatch(output, /<script|onload|onclick|@import|evil\.test/i);
});
