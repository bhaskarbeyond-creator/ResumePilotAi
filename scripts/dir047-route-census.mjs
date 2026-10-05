// @ts-check
/**
 * DIR-047 -- machine-readable route census.
 *
 *   node scripts/dir047-route-census.mjs
 *
 * WHY A GENERATOR AND NOT A HARD-CODED LIST
 * The directive asserts a "68 route" crawl, while the earlier recon recorded
 * "60 Route elements across only 54 unique path strings". Those two numbers were
 * never reconciled, and a hand-written crawl list would simply re-assert one of
 * them. This script derives the census from `src/main.jsx` -- the actual router
 * source -- and publishes the arithmetic that explains the discrepancy instead of
 * guessing which number is right.
 *
 * THE FOUR COUNTS, AND WHY THEY DIFFER
 *   declaredElements   Every `<Route ...>` written in the file, INCLUDING the two
 *                      that sit inside `.map()` loops.
 *   staticElements     Declared elements minus the loop-generated ones.
 *   uniquePathStrings  Distinct `path` strings after the loops are expanded. This
 *                      is the number a naive grep reports.
 *   crawlTargets       The paths a browser can actually visit. Wildcard routes
 *                      (`/dashboard/*`, `/admin/*`, ...) match a prefix rather than
 *                      a single URL, so each is expanded against the REAL child
 *                      routes discovered in the shell sources. 68 is reachable
 *                      ONLY through this expansion.
 *
 * `tests/e2e/universal-swot-uat.spec.js` reads this same report rather than
 * restating a literal, so the crawl and the census cannot drift apart.
 *
 * NOTE ON THE FILENAME: DIR-047's `verification.playwrightSuite` names
 * `universal-swot-deep-uiux.spec.js`, while this directive's approved plan step 3 and
 * the delivered artifact both name `universal-swot-uat.spec.js`. The delivered name is
 * referenced here because it is the file that actually exists, and because line 94 of
 * this same script already cites it -- leaving the two comments naming different files
 * was a self-contradiction. Whichever name the Lead ratifies, the census report path
 * below is the contract both sides read, so reconciling the spec filename never
 * invalidates the census.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const ROUTER = path.join(ROOT, 'src', 'main.jsx');
const REPORT = path.join(ROOT, '.bridge', 'evidence', 'dir047-route-census.json');

/**
 * SHELL BINDINGS -- which component each top-level wildcard route actually mounts.
 *
 * The previous revision of this script carried a hand-written `WILDCARD_EXPANSION`
 * table and then "grounded" it by substring-searching a handful of shell files. That
 * was theatre, and it failed in the most expensive possible direction: it published a
 * census containing SEVENTEEN ROUTES THAT DO NOT EXIST, and the browser suite then
 * dutifully crawled all of them.
 *
 *   asserted   reality
 *   ---------  --------------------------------------------------------------
 *   /dashboard/resumes      NOT MOUNTED. The candidate "Resumes" nav item points at
 *                            /build-resume. There is no `resumes` child route.
 *   /dashboard/applications NOT MOUNTED. The real child is `applied-jobs`.
 *   /employer/candidates    NOT MOUNTED. The real child is `applicants`.
 *   /employer/analytics     NOT MOUNTED. There is no analytics child at all.
 *   /org/northwind/team     NOT MOUNTED. Enterprise modules are `teams`, not `team`.
 *   /org/northwind/quotas   NOT MOUNTED. The module is `usage`.
 *   /admin/ai-settings      NOT MOUNTED. Admin has `audit-logs`, not `ai-settings`.
 *
 * The crawl "passed" anyway, because every one of those phantom URLs falls through to
 * the shell's own `<Route path="*">` catch-all, which renders a perfectly healthy
 * redirect to the portal index. The suite measured a clean page at a URL the
 * application does not have and reported it as coverage.
 *
 * The fix is structural: each wildcard binds to the ONE component it mounts, and the
 * child routes are PARSED OUT OF THAT COMPONENT'S OWN SOURCE. A URL cannot reach the
 * census unless a real declaration in the mounted component produced it.
 */
const SHELL_BINDINGS = {
    '/dashboard': 'src/components/Dashboard/DashboardMain/DashboardMain.jsx',
    '/employer': 'src/components/EmployerPortal/EmployerPortalCuba.jsx',
    '/admin': 'src/components/admin/Admin.jsx',
    '/org': 'src/enterprise/EnterpriseConsole.jsx',
    '/build-resume': 'src/components/BuildResume/BuildResume.jsx',
    '/create-resume': 'src/components/BuildResume/BuildResume.jsx',
};

/**
 * Wildcards that mount no nested <Routes> at all. They resolve to a client-side
 * redirect component, so the bare prefix IS the only visitable URL and any child
 * path is an alias hop rather than a page.
 */
const REDIRECT_ONLY_WILDCARDS = new Set([
    '/coverletter',
    '/cover-letter',
    '/enterprise',
    '/adm',
    '/platform',
    '/dashboard2',
]);

/**
 * The tenant slug the crawl resolves `/org/:slug/*` against.
 *
 * This is not an invented identifier: the AC-5 cross-portal journey in
 * tests/e2e/universal-swot-uat.spec.js already drives `/org/northwind` and asserts it
 * normalizes onto `/org/northwind/overview`, and the seeded fixture serves that tenant.
 * Using the same slug keeps the census and the journey on one tenant identity rather
 * than splitting the crawl across two.
 */
const CRAWL_TENANT_SLUG = 'northwind';

const routerSource = fs.readFileSync(ROUTER, 'utf8');

/**
 * Expands the two `.map()` route generators.
 *
 * `/export/Cv{n}/:resumeId/:language` is generated `length: 51` times and
 * `/export/Cover{n}/...` 4 times. These are real, distinct, reachable routes --
 * the 51 CV templates ARE the directive's own "51 resume templates" strength
 * claim -- so they are counted as patterns rather than silently dropped.
 */
function collectLoopGenerated(length, pattern, param) {
    // The pattern is a real template literal lifted out of src/main.jsx, so it contains
    // `${num}` -- NOT the `{n}` the first draft of this script assumed. Substituting on
    // `{n}` silently returned 55 identical un-substituted strings, which is why the
    // ledger reported `loopGeneratedRouteElements: 0` against a router that really does
    // declare 55 of them. The token is rebuilt from the CAPTURED parameter name so a
    // rename of `num` to `idx` upstream cannot silently break the expansion again.
    const token = new RegExp(`\\$\\{\\s*${param}\\s*\\}`, 'g');
    return Array.from({ length }, (_, i) => pattern.replace(token, String(i + 1)));
}
const loopMatches = [...routerSource.matchAll(
    /Array\.from\(\{\s*length:\s*(\d+)\s*\},\s*\(_,\s*i\)\s*=>\s*i\s*\+\s*1\s*\)\.map\(\s*\(\s*(\w+)\s*\)\s*=>\s*[\s\S]*?path=\{`([^`]+)`\}/g,
)];

/** `<Route path="...">` literals only; the two template-literal loop routes are handled above. */
const staticPathStrings = [...routerSource.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((m) => m[1]);

const loopRoutes = loopMatches.flatMap(([, length, param, pattern]) => (
    collectLoopGenerated(Number(length), pattern, param)
));

// The expansion is self-checking rather than trusted: a generator that produced fewer
// distinct routes than its own `length` argument would otherwise inflate the census with
// duplicates. A distinct-count mismatch means the substitution above broke, and it is
// far cheaper to fail here than to publish a wrong route count to the Gatekeeper.
const loopExpansionSound = loopMatches.every(([, length, param, pattern]) => {
    const expanded = collectLoopGenerated(Number(length), pattern, param);
    return expanded.length === Number(length) && new Set(expanded).size === Number(length);
});

const allPaths = [...staticPathStrings, ...loopRoutes];
const uniquePathStrings = [...new Set(allPaths)];
/**
 * Enterprise modules are NOT declared as <Route> elements. The console is driven by
 * real paths (`/org/:slug/:tabId`) and its module list is a NAVIGATION array of ids.
 * `resolveOrgRoute` normalizes any id absent from that list back to the first visible
 * module, so an id that is not in NAVIGATION is not a module -- it silently renders
 * Overview. Deriving org children from that array is the only way to avoid certifying
 * `/org/x/analytics`-style phantoms.
 */
function readOrgModuleIds() {
    const source = fs.readFileSync(path.join(ROOT, SHELL_BINDINGS['/org']), 'utf8');
    const block = source.match(/const NAVIGATION = \[([\s\S]*?)\n\];/);
    if (!block) throw new Error('DIR-047 census: NAVIGATION array not found in EnterpriseConsole.jsx');
    return [...block[1].matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
}

/**
 * BuildResume drives its wizard from a `steps` array of `path` values rather than
 * from <Route> elements, so a <Route>-only parse would silently return zero children
 * and quietly drop twelve real URLs from the census.
 */
function readBuildResumeStepPaths() {
    const source = fs.readFileSync(path.join(ROOT, SHELL_BINDINGS['/build-resume']), 'utf8');
    const block = source.match(/const steps = \[([\s\S]*?)\n    \];/);
    if (!block) throw new Error('DIR-047 census: steps array not found in BuildResume.jsx');
    return [...block[1].matchAll(/\bpath:\s*'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Reads the crawlable children of one shell, parsed from the shell's own source.
 *
 * Children carrying a `:` parameter are skipped: they are real routes but cannot be
 * visited without inventing an id, and inventing one is exactly the fabrication this
 * script exists to prevent. The `*` catch-all is skipped for the same reason -- it is
 * a redirect, not a page.
 *
 * A child whose element is a <Navigate> is reported as a `redirect-alias` rather than
 * a `rendered-page`, so the browser suite can hold it to the correct standard: an
 * alias must land somewhere, a page must render content.
 */
function readShellChildren(bindingKey, shellRel, base = '') {
    const source = fs.readFileSync(path.join(ROOT, shellRel), 'utf8');
    const base2 = path.basename(shellRel);

    if (bindingKey === '/org') {
        return readOrgModuleIds().map((id) => ({
            rel: id,
            kind: 'rendered-page',
            why: `${base} NAVIGATION id '${id}'`,
        }));
    }

    if (bindingKey === '/build-resume' || bindingKey === '/create-resume') {
        return readBuildResumeStepPaths().map((step) => ({
            rel: step,
            kind: 'rendered-page',
            why: `${base} steps[] path '${step}'`,
        }));
    }

    const children = [];
    // Split on every `<Route` so BOTH forms are handled: a self-closing
    // `<Route path="jobs" element={...} />` carries its element in the tag itself,
    // while `<Route path="billing" element={...}><Navigate/></Route>` carries it in a
    // body. A single opening-tag regex silently drops every self-closing route, which
    // is most of the employer portal.
    const chunks = source.split(/<Route\b/).slice(1);
    for (const chunk of chunks) {
        // Only the opening tag may contain the `path`; stop at its closing `>`.
        const tag = chunk.slice(0, chunk.indexOf('>') + 1);
        const p = tag.match(/\bpath="([^"]+)"/);
        if (!p) continue;
        const rel = p[1];
        if (rel === '*' || rel === '/' || rel.includes(':')) continue;
        children.push({
            rel,
            kind: /<Navigate\b/.test(chunk) ? 'redirect-alias' : 'rendered-page',
            why: `${base} <Route path="${rel}">`,
        });
    }
    return children;
}

/** Resolves each wildcard into the URLs a browser can actually visit. */
function expandWildcards() {
    const expanded = [];
    const unexpanded = [];
    for (const routePath of uniquePathStrings) {
        if (!routePath.includes('*')) continue;
        // `/org/:slug/*` and `/org/*` both mount the console; key on the static prefix.
        const prefix = routePath.replace(/\/?:\w+\*$/, '').replace(/\/?\*$/, '') || '/';
        const bindingKey = prefix.startsWith('/org') ? '/org' : prefix;
        const shellRel = SHELL_BINDINGS[bindingKey];

        if (!shellRel) {
            if (REDIRECT_ONLY_WILDCARDS.has(prefix)) {
                expanded.push({
                    wildcard: routePath,
                    prefix,
                    shell: null,
                    kind: 'redirect-only',
                    targets: [{ url: prefix, kind: 'redirect-alias', derivedFrom: routePath }],
                });
            } else {
                unexpanded.push({ wildcard: routePath, prefix, reason: 'no shell binding declared' });
            }
            continue;
        }

        const targets = [{ url: prefix, kind: 'portal-index', derivedFrom: routePath }];
        for (const child of readShellChildren(bindingKey, shellRel, childBase(routePath, prefix))) {
            targets.push({ url: `${childBase(routePath, prefix)}/${child.rel}`, kind: child.kind, derivedFrom: child.why });
        }
        expanded.push({ wildcard: routePath, prefix, shell: shellRel, kind: 'nested-routes', targets });
    }
    return { expanded, unexpanded };
}

/**
 * The concrete base the children hang off.
 *
 * `/org/:slug/*` binds a tenant slug, and the console's canonical address-bar form is
 * `/org/<slug>/<tabId>` -- the existing AC-5 journey already asserts that a bare
 * `/org/northwind` lands on `/org/northwind/overview`. Emitting the slug-less
 * `/org/<tabId>` alias instead would test a shape no navigation link produces.
 */
function childBase(routePath, prefix) {
    if (prefix.startsWith('/org') && routePath.includes('/:slug')) {
        return `${prefix}/${CRAWL_TENANT_SLUG}`;
    }
    return prefix;
}

const { expanded, unexpanded } = expandWildcards();

/**
 * Every crawl target, with the classification the browser suite needs.
 *
 * A flat list of strings is what the previous revision published, and it is exactly
 * why the phantom routes went unnoticed: `/dashboard/resumes` and
 * `/dashboard/settings` were both just strings, so nothing in the evidence
 * distinguished a page the app owns from a URL the app redirects away from.
 */
const resolvedTargets = new Map();
for (const entry of expanded) {
    for (const t of entry.targets) {
        if (!resolvedTargets.has(t.url)) {
            resolvedTargets.set(t.url, { url: t.url, kind: t.kind, derivedFrom: t.derivedFrom });
        }
    }
}
for (const p of uniquePathStrings) {
    if (p.includes('*') || p.includes(':') || p === '*') continue;
    if (!resolvedTargets.has(p)) {
        resolvedTargets.set(p, { url: p, kind: 'top-level-page', derivedFrom: 'src/main.jsx <Route>' });
    }
}
const crawlTargetRecords = [...resolvedTargets.values()].sort((a, b) => a.url.localeCompare(b.url));
const crawlTargets = crawlTargetRecords.map((t) => t.url);

const dynamicParamRoutes = uniquePathStrings.filter((p) => p.includes(':'));
const catchAll = uniquePathStrings.filter((p) => p === '*');

/**
 * Every crawl target must be traceable to a real declaration. `derivedFrom` is
 * non-empty for all of them by construction, but an empty or null value would mean a
 * target slipped in from somewhere else, so it is asserted rather than trusted.
 */
const ungrounded = crawlTargetRecords.filter((t) => !t.derivedFrom);

const report = {
    directive: 'DIR-047',
    generatedAt: new Date().toISOString(),
    routerSource: path.relative(ROOT, ROUTER).replace(/\\/g, '/'),
    reconciliation: {
        note: 'The directive asserts 68 routes. A literal grep of src/main.jsx reports far fewer unique path strings because (a) two routes are generated by .map() loops and (b) seven routes end in /* and therefore match a prefix rather than a single URL. uniquePathStrings plus wildcard expansion is the only count that can reach the asserted figure.',
        declaredRouteElements: allPaths.length,
        staticRouteElements: staticPathStrings.length,
        loopGeneratedRouteElements: loopRoutes.length,
        loopExpansionSound,
        // 55 loop-generated export routes are REAL, reachable URLs, but they all carry
        // :resumeId and :language params, so a crawl cannot visit them without inventing
        // a resume id. They are reported separately rather than silently inflating
        // crawlableTargets, which would otherwise overstate what the browser actually saw.
        crawlableExcludedForRequiredParams: uniquePathStrings.filter(
            (p) => p.includes(':') && !expanded.some((e) => e.targets.some((t) => t.url === p)),
        ).length,
        uniquePathStrings: uniquePathStrings.length,
        dynamicParamRoutes: dynamicParamRoutes.length,
        catchAllRoutes: catchAll.length,
        wildcardRoutes: uniquePathStrings.filter((p) => p.includes('*')).length,
        wildcardExpansionTables: expanded.length,
        wildcardsWithNoTable: unexpanded.map((u) => u.wildcard),
        crawlableTargets: crawlTargets.length,
        assertedByDirective: 68,
    },
    crawlTargets,
    crawlTargetRecords,
    dynamicParamRoutes,
    wildcardExpansion: expanded,
    /**
     * Grounding is now a property of how the census is BUILT rather than a check
     * bolted on afterwards: every target is produced by parsing a mounted shell's own
     * source, so `ungrounded` is empty by construction and is published as a tripwire.
     */
    wildcardGrounding: {
        method: 'source-derived: each wildcard target is parsed from the bound shell component',
        allGrounded: ungrounded.length === 0,
        ungrounded,
    },
    /**
     * A standing record of the routes the previous revision of this script asserted
     * and the application does not have. It is kept in the report so the correction is
     * auditable and so a later regression back to hand-authored lists is visible.
     */
    retiredPhantomRoutes: [
        { url: '/dashboard/resumes', realChild: 'none -- Resumes is served at /build-resume' },
        { url: '/dashboard/applications', realChild: '/dashboard/applied-jobs' },
        { url: '/employer/candidates', realChild: '/employer/applicants' },
        { url: '/employer/applications', realChild: '/employer/applicants' },
        { url: '/employer/analytics', realChild: 'none declared' },
        { url: '/org/northwind/team', realChild: '/org/northwind/teams' },
        { url: '/org/northwind/quotas', realChild: '/org/northwind/usage' },
        { url: '/admin/ai-settings', realChild: 'none -- admin module list has no ai-settings' },
    ],
};

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const r = report.reconciliation;
console.log('DIR-047 route census');
console.log(`  declared <Route> elements : ${r.declaredRouteElements}`);
console.log(`    static literal          : ${r.staticRouteElements}`);
console.log(`    .map() generated        : ${r.loopGeneratedRouteElements}`);
console.log(`  unique path strings       : ${r.uniquePathStrings}`);
console.log(`  wildcard routes expanded  : ${r.wildcardRoutes} -> ${r.wildcardExpansionTables} tables`);
console.log(`  crawlable targets         : ${r.crawlableTargets}  (directive asserts ${r.assertedByDirective})`);
console.log(`  wildcard targets grounded in shell source: ${report.wildcardGrounding.allGrounded}`);
console.log(`written -> ${path.relative(ROOT, REPORT).replace(/\\/g, '/')}`);