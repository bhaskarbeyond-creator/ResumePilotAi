/**
 * Synchronise the modern frontend build (frontend/dist) into the repository's
 * Apache DocumentRoot directory (dist/).
 *
 * Invoked automatically by `frontend/package.json` -> "build" after
 * `tsc -b && vite build` succeed, so a normal `npm run build` inside
 * frontend/ refreshes the directory Apache serves.
 *
 * Write boundary (hard guarantees, enforced before anything is copied):
 *   - Source and destination are derived from this file's location only
 *     (scripts/../frontend/dist -> scripts/../dist). No CLI argument, cwd or
 *     environment variable can redirect the destination.
 *   - The *real* (symlink-resolved) destination must stay inside the real
 *     repository root. A `dist` symlink/junction pointing elsewhere is refused.
 *   - Every individual write is checked: an existing destination entry that is
 *     a symlink, or whose parent resolves outside the destination, is refused.
 *   - The source must be a complete Vite build (index.html present); a partial
 *     build is never published into the DocumentRoot.
 *   - Environment files (.env*) are never copied.
 *
 * Merge semantics are intentional: files that only exist in dist/ (for example
 * an operator-managed .htaccess) are preserved. Only superseded entry chunks
 * (`index-*`, `smart-resume-document-*`) are pruned, so long-lived sessions can
 * still lazy-load the route chunks they already reference.
 *
 * Usage:
 *   node scripts/sync-dist.mjs           # validate boundary, then synchronise
 *   node scripts/sync-dist.mjs --check   # validate boundary only, print paths
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRUNABLE_ASSET_PREFIXES = Object.freeze(['smart-resume-document-', 'index-']);

export class SyncBoundaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SyncBoundaryError';
    this.code = 'SYNC_DIST_BOUNDARY';
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Nearest existing ancestor of `target`, symlinks resolved. */
function realpathOfNearestExisting(target) {
  let current = target;
  for (;;) {
    if (lstatOrNull(current)) return fs.realpathSync(current);
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/**
 * Resolve and validate the synchronisation boundary without writing anything.
 * Returns the absolute paths that a sync would use.
 */
export function resolveSyncPlan({ repoRoot }) {
  const root = path.resolve(repoRoot);
  const realRoot = fs.realpathSync(root);
  const srcDir = path.join(root, 'frontend', 'dist');
  const destDir = path.join(root, 'dist');

  const plan = { repoRoot: root, realRoot, srcDir, destDir, realDestDir: null, sourceReady: false };

  const destStat = lstatOrNull(destDir);
  if (destStat?.isSymbolicLink()) {
    const target = fs.realpathSync(destDir);
    throw new SyncBoundaryError(`Refusing to sync: ${destDir} is a symlink to ${target}. The DocumentRoot must be a real directory inside ${realRoot}.`);
  }
  if (destStat && !destStat.isDirectory()) {
    throw new SyncBoundaryError(`Refusing to sync: ${destDir} exists and is not a directory.`);
  }
  const realDestDir = destStat ? fs.realpathSync(destDir) : path.join(realpathOfNearestExisting(path.dirname(destDir)), path.basename(destDir));
  if (!isInside(realRoot, realDestDir) || realDestDir === realRoot) {
    throw new SyncBoundaryError(`Refusing to sync: destination ${realDestDir} is outside the repository root ${realRoot}.`);
  }
  plan.realDestDir = realDestDir;

  const srcStat = lstatOrNull(srcDir);
  if (srcStat) {
    if (srcStat.isSymbolicLink() || !srcStat.isDirectory()) {
      throw new SyncBoundaryError(`Refusing to sync: ${srcDir} must be a real directory produced by vite build.`);
    }
    const realSrc = fs.realpathSync(srcDir);
    if (isInside(realSrc, realDestDir) || isInside(realDestDir, realSrc)) {
      throw new SyncBoundaryError('Refusing to sync: source and destination overlap.');
    }
    if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
      throw new SyncBoundaryError(`Refusing to sync: ${srcDir} has no index.html (incomplete build).`);
    }
    plan.sourceReady = true;
  }
  return plan;
}

/** Validate the boundary, copy frontend/dist into dist/, prune superseded entry chunks. */
export function syncDist({ repoRoot, log = console.log, warn = console.warn } = {}) {
  const plan = resolveSyncPlan({ repoRoot });
  if (!plan.sourceReady) {
    warn('Warning: frontend/dist does not exist. Run build in frontend first.');
    return { ...plan, copied: 0, pruned: [] };
  }

  let copied = 0;
  fs.cpSync(plan.srcDir, plan.destDir, {
    recursive: true,
    force: true,
    dereference: false,
    errorOnExist: false,
    filter(source, destination) {
      if (/^\.env/i.test(path.basename(source))) return false;
      const existing = lstatOrNull(destination);
      if (existing?.isSymbolicLink()) {
        throw new SyncBoundaryError(`Refusing to write through symlink ${destination}.`);
      }
      const parentReal = realpathOfNearestExisting(path.dirname(destination));
      if (!isInside(plan.realDestDir, parentReal) && parentReal !== path.dirname(plan.realDestDir)) {
        throw new SyncBoundaryError(`Refusing to write ${destination}: parent resolves to ${parentReal}, outside ${plan.realDestDir}.`);
      }
      if (lstatOrNull(source)?.isFile()) copied += 1;
      return true;
    },
  });

  const pruned = [];
  const destAssets = path.join(plan.destDir, 'assets');
  const srcAssets = path.join(plan.srcDir, 'assets');
  if (fs.existsSync(destAssets) && fs.existsSync(srcAssets)) {
    const current = new Set(fs.readdirSync(srcAssets));
    for (const entry of fs.readdirSync(destAssets)) {
      if (current.has(entry)) continue;
      if (!PRUNABLE_ASSET_PREFIXES.some(prefix => entry.startsWith(prefix))) continue;
      const target = path.join(destAssets, entry);
      if (!lstatOrNull(target)?.isFile()) continue;
      fs.unlinkSync(target);
      pruned.push(entry);
    }
  }

  log(`✓ Successfully synchronized frontend/dist -> dist (${copied} files copied, ${pruned.length} superseded entry chunks pruned)`);
  log(`  source:      ${plan.srcDir}`);
  log(`  destination: ${plan.realDestDir}`);
  return { ...plan, copied, pruned };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    if (process.argv.includes('--check')) {
      const plan = resolveSyncPlan({ repoRoot });
      console.log(JSON.stringify(plan, null, 2));
    } else {
      syncDist({ repoRoot });
    }
  } catch (error) {
    console.error(`✗ sync-dist: ${error.message}`);
    process.exit(1);
  }
}
