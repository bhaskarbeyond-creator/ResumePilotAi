import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(repoRoot, 'frontend/dist');
const destDir = path.resolve(repoRoot, 'dist');

if (fs.existsSync(srcDir)) {
  fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  const destAssets = path.join(destDir, 'assets');
  const srcAssets = path.join(srcDir, 'assets');
  if (fs.existsSync(destAssets) && fs.existsSync(srcAssets)) {
    const srcFiles = new Set(fs.readdirSync(srcAssets));
    for (const f of fs.readdirSync(destAssets)) {
      if (f.startsWith('smart-resume-document-') && !srcFiles.has(f)) {
        fs.unlinkSync(path.join(destAssets, f));
      }
      if (f.startsWith('index-') && !srcFiles.has(f)) {
        fs.unlinkSync(path.join(destAssets, f));
      }
    }
  }
  console.log('✓ Successfully synchronized frontend/dist -> dist');
} else {
  console.warn('Warning: frontend/dist does not exist. Run build in frontend first.');
}
