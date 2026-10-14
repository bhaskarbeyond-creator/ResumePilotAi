// Reuse the locked npm Chromium distribution; no browser/OS downloads required.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import chromiumBinary from '@sparticuz/chromium';

export async function candidateBrowserOptions() {
    const env = { ...process.env };
    if (process.platform === 'linux') {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-chromium-'));
        const archive = path.join(directory, 'libs.tar');
        await fs.writeFile(archive, brotliDecompressSync(await fs.readFile(new URL('../../node_modules/@sparticuz/chromium/bin/al2023.tar.br', import.meta.url))));
        execFileSync('tar', ['xf', archive, '-C', directory]);
        env.LD_LIBRARY_PATH = [path.join(directory, 'lib'), env.LD_LIBRARY_PATH].filter(Boolean).join(':');
        return { options: { executablePath: await chromiumBinary.executablePath(), args: safeArgs(), headless: true, env }, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
    }
    return { options: { headless: true }, cleanup: async () => {} };
}
function safeArgs() {
    return chromiumBinary.args.filter(arg => !['--single-process', '--disable-web-security', '--allow-running-insecure-content'].includes(arg));
}
