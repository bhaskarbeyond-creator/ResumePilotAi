const fs = require('fs');
const P = 'tests/e2e/dir009-candidate-dashboard.spec.js';
const L = fs.readFileSync(P, 'utf8').split(/\r?\n/);
// 1-based inclusive slices, verified against the corrupted file.
const head      = L.slice(0, 421);   // through stage-3's closing expect(...)
const stage4a   = L.slice(421, 480); // stage-4 comment .. "el.focus();"
const stage4b   = L.slice(528, 537); // stage-4 tail .. "});"
const stage5    = L.slice(480, 500); // stage-5 comment .. "});"
const stage6    = L.slice(501, 527); // stage-6 comment .. "});"
const frozenFn  = L.slice(542, 549); // frozenDiffStat helper

const stage3Tail = [
    '        }',
    '',
    "        assertNoDefects('stage 3', defects);",
    '    });',
    '',
];
const out = [
    ...head, ...stage3Tail,
    ...stage4a, ...stage4b, '',
    ...stage5, '',
    ...stage6,
    '});',
    '',
    ...frozenFn, '',
].join('\n');
fs.writeFileSync(P, out);
console.log('rewritten lines:', out.split('\n').length);