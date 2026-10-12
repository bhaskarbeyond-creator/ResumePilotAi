import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * DIR-106 — render the Mermaid flowcharts to SVG so the report can carry
 * *rendered* diagrams, and so an invalid diagram fails loudly instead of
 * shipping as unverified pseudo-code.
 *
 * Mermaid is not a project dependency, so it is loaded from a CDN inside a
 * throwaway browser page. If the CDN is unreachable the script reports that
 * honestly rather than pretending the diagrams were validated.
 */
const DIR = '.bridge/evidence/dir106/flowcharts';
const CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.mmd')).sort();
if (!files.length) throw new Error(`No .mmd files in ${DIR}`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const results = [];
let cdnReachable = true;

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => results.push(`pageerror: ${e.message}`));

  const html = `<!doctype html><html><body style="margin:0;background:#fff">
<div id="host"></div>
<script type="module">
  import mermaid from '${CDN}';
  mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
  window.__render = async (src, id) => {
    const { svg } = await mermaid.render(id, src);
    return svg;
  };
  window.__ready = true;
</script></body></html>`;

  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
} catch (error) {
  cdnReachable = false;
  results.push(`CDN load failed: ${error.message}`);
}

if (cdnReachable) {
  const page = (await browser.contexts()[0].pages())[0];
  let n = 0;
  for (const file of files) {
    const src = await fs.readFile(path.join(DIR, file), 'utf8');
    try {
      const svg = await page.evaluate(
        ([s, id]) => window.__render(s, id),
        [src, `dir106-${n++}`],
      );
      const out = path.join(DIR, file.replace(/\.mmd$/, '.svg'));
      await fs.writeFile(out, svg, 'utf8');
      results.push(`PASS  ${file} -> rendered ${svg.length} bytes SVG`);
    } catch (error) {
      results.push(`FAIL  ${file} -> ${String(error.message).split('\n')[0]}`);
    }
  }
}

await browser.close();
console.log(results.join('\n'));
if (!cdnReachable) {
  console.log('\nNOTE: diagrams NOT rendered (no CDN). Syntax is unverified — do not claim otherwise.');
  process.exit(2);
}
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
