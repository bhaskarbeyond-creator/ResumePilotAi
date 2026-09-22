import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const extensionDir = path.join(rootDir, 'extension');
const publicDir = path.join(rootDir, 'public');
const outputZip = path.join(publicDir, 'resumepilot-media-companion.zip');

if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
}

console.log('[Extension Packager] Packaging ResumePilot Media Companion from:', extensionDir);
try {
    execSync(`tar -a -c -f "${outputZip}" -C "${extensionDir}" .`, { stdio: 'inherit' });
    console.log('[Extension Packager] Successfully generated:', outputZip);
} catch (error) {
    console.error('[Extension Packager] Failed to package extension:', error.message);
    process.exit(1);
}
