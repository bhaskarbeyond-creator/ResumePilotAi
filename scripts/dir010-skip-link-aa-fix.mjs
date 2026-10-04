import fs from 'node:fs';

const target = 'src/index.css';
let css = fs.readFileSync(target, 'utf8');

// The two legacy-ramp selectors, exactly as they appear on disk (CRLF file).
const baseSel = 'a:not([class*="bg-"]):not([class*="text-"]):not([class*="btn"]):not([class*="cuba-"]):not([class*="enterprise-"]):not([class*="button"]) {';
const hoverSel = 'a:not([class*="bg-"]):not([class*="text-"]):not([class*="btn"]):not([class*="enterprise-"]):not([class*="button"]):hover {';

if (!css.includes(baseSel)) throw new Error('base legacy-ramp selector not found on disk');
if (!css.includes(hoverSel)) throw new Error('hover legacy-ramp selector not found on disk');

// 1. Exclude the document skip link from both rules so neither can repaint its
//    #ffffff label with legacy blue #4a6cf7 (which is 4.06:1 on its own #0f172a
//    plate, i.e. below the WCAG 2.1 AA 4.5:1 text bar).
const basePatched = baseSel.replace(']) {', ']):not([class*="skip"]) {');
const hoverPatched = hoverSel.replace(']) {', ']):not([class*="cuba-"]):not([class*="skip"]) {');

css = css.replace(baseSel, basePatched).replace(hoverSel, hoverPatched);

// 2. Document WHY, in the file itself, so the next agent does not "simplify"
//    the selector list away and silently reintroduce a 4.06:1 regression.
const note = [
    '/* Legacy default link ink. The exclusion list is what stops this ramp from',
    ' * taking over controls that already declare their own colour.',
    ' *',
    ' * The `:not([class*="skip"])` clause is a WCAG 2.1 AA fix, not a cosmetic',
    ' * one. The document-level skip link (index.html) is a fixed dark plate',
    ' * (#0f172a) carrying a #ffffff label = 17.9:1. Its class contains none of',
    ' * the other substrings excluded below, so this selector at (0,6,1) used to',
    ' * outrank `.skip-link` at (0,1,0) and repaint that label #4a6cf7, which',
    ' * measures 4.06:1 against its own plate - under the 4.5:1 bar. Both the base',
    ' * and the :hover rule exclude it so neither can reintroduce the failure.',
    ' *',
    ' * :hover additionally gains the `:not([class*="cuba-"])` clause that the base',
    ' * rule already carried, so a tokenized Cuba link cannot flip to legacy blue',
    ' * on hover while its resting state is correctly exempt. */',
].join('\r\n') + '\r\n';

css = css.replace(basePatched, note + basePatched);

fs.writeFileSync(target, css);
console.log('patched src/index.css');