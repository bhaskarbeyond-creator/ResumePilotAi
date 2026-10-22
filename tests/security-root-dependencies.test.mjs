import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mergeAttributes } from '@tiptap/core';
import mammoth from 'mammoth';
const require = createRequire(import.meta.url);

test('patched editor attributes do not inherit executable DOM attributes from a __proto__ input', () => {
  const attrs = mergeAttributes(JSON.parse('{"__proto__":{"onclick":"fixture"}}'), { class: 'editor' });
  assert.equal(attrs.onclick, undefined);
  assert.equal({}.onclick, undefined);
});
test('Mammoth CLI remains compatible after replacing its unused vulnerable sprintf dependency chain', () => {
  const help = execFileSync(process.execPath, [require.resolve('mammoth/bin/mammoth'), '--help'], { encoding: 'utf8' });
  assert.match(help, /docx-path/);
});
test('actual DOCX parsing survives the compatible security dependency refresh', async () => {
  const { Document, Packer, Paragraph } = require('../backend/node_modules/docx');
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Security regression fixture')] }] }));
  const output = await mammoth.extractRawText({ buffer });
  assert.equal(output.value.trim(), 'Security regression fixture');
});
