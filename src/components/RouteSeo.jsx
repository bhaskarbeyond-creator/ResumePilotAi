import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchPublicConfig } from '../services/api/platform';
import { getJob } from '../services/api/jobs';
import { getRegionalHub } from '../services/api/geo';
import { HOMEPAGE_FAQS } from './Marketing/elements/faqData';
import {
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildJobPostingSchema,
  buildOrganizationSchema,
  safeJsonLd,
  safeSchemaUrl,
  schemaText,
} from '../services/seo/structuredData';

const SITE_NAME = 'IME365';

const PUBLIC_PAGES = {
  '/': [`${SITE_NAME} — ATS Resume Builder & CV Maker`, 'Create ATS-friendly resumes, cover letters, and professional portfolios with AI-assisted tools.'],
  '/login': [`Sign In — ${SITE_NAME}`, 'Sign in or create your free IME365 account.'],
  '/features': [`${SITE_NAME} Features`, 'Explore resume, cover-letter, Portfolio, job-tracking, and AI-assisted career tools.'],
  '/pricing': [`${SITE_NAME} Plans & Pricing`, 'Compare IME365 plans and server-verified premium features.'],
  '/billing/plans': [`${SITE_NAME} Plans & Pricing`, 'Compare IME365 plans and server-verified premium features.'],
  '/jobs': ['Jobs and Career Opportunities', 'Browse job opportunities and career resources powered by IME365.'],
  '/jobs/portal': ['Job Portal — Browse Open Positions', 'Find and apply for the latest job openings on IME365 job portal.'],
  '/jobs/browse': ['Browse Jobs — IME365', 'Search and filter job listings matched to your career profile.'],
  '/jobs/categories': ['Job Categories — IME365', 'Explore job opportunities organized by industry and category.'],
  '/blog': [`${SITE_NAME} Career Blog`, 'Read public career, resume, interview, and job-search articles.'],
  '/portfolios': ['Professional Portfolio Gallery', 'Browse explicitly published professional portfolios.'],
  '/contact': [`Contact ${SITE_NAME}`, 'Contact IME365 support and product teams.'],
};

// All route prefixes that are private (authenticated or sensitive) — must not be indexed.
const PRIVATE_PREFIXES = [
  '/dashboard', '/build-resume', '/create-resume',
  '/admin', '/adm', '/platform', '/blog-editor', '/portfolio/builder',
  '/export', '/shared', '/coverletter', '/resume', '/front',
  '/org', '/enterprise', '/employer',
];

// Private page titles — shown in browser tab but never indexed.
const PRIVATE_TITLES = {
  '/dashboard': `My Dashboard — ${SITE_NAME}`,
  '/employer': `Recruiter & Hiring Portal — ${SITE_NAME}`,
  '/org': `Organization Workspace — ${SITE_NAME}`,
  '/enterprise': `Organization Workspace — ${SITE_NAME}`,
  '/build-resume': `Build Resume — ${SITE_NAME}`,
  '/create-resume': `Create Resume — ${SITE_NAME}`,
  '/coverletter': `Cover Letter Builder — ${SITE_NAME}`,
  '/resume': `Resume Builder — ${SITE_NAME}`,
  // /adm and /platform are one-way compatibility aliases; they share the
  // canonical console title and resolve to /admin/* immediately.
  '/admin': `Admin Console — ${SITE_NAME}`,
  '/adm': `Admin Console — ${SITE_NAME}`,
  '/platform': `Admin Console — ${SITE_NAME}`,
  '/blog-editor': `Blog Editor — ${SITE_NAME}`,
  '/portfolio/builder': `Portfolio Builder — ${SITE_NAME}`,
  '/export': `Export — ${SITE_NAME}`,
  '/shared': `Shared Resume — ${SITE_NAME}`,
  '/front': `${SITE_NAME}`,
};

// Descriptions for authenticated portals. These are never indexed.
const PRIVATE_DESCRIPTIONS = {
  '/dashboard': 'Your IME365 career workspace: resumes, Master CV, cover letters, portfolios, job tracking, and AI interview practice.',
  '/employer': 'Post requisitions, review your applicant pipeline, message candidates, and manage your company profile on IME365.',
  '/org': 'Organization workspace for teams, seats, shared talent, and AI quota governance on IME365.',
  '/enterprise': 'Organization workspace for teams, seats, shared talent, and AI quota governance on IME365.',
  '/admin': 'Internal IME365 operations console: command center, platform health, queues, audit, security, and system settings.',
  '/adm': 'Internal IME365 operations console: command center, platform health, queues, audit, security, and system settings.',
  '/platform': 'Internal IME365 operations console: command center, platform health, queues, audit, security, and system settings.',
  '/build-resume': 'Build an ATS-friendly resume with live scoring and professional templates.',
  '/create-resume': 'Create a new ATS-friendly resume with live scoring and professional templates.',
  '/coverletter': 'Create a targeted cover letter that matches your resume to the role.',
  '/resume': 'Create and export an ATS-friendly resume.',
  '/blog-editor': 'Author and publish IME365 career blog articles.',
  '/portfolio/builder': 'Build and publish your professional portfolio and WebCV.',
  '/export': 'Export your IME365 document.',
  '/shared': 'View a resume shared with you on IME365.',
};

function setMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  element.setAttribute('data-route-seo-owner', 'route');
  return element;
}

function removeMeta(selector) {
  document.head.querySelector(selector)?.remove();
}

function canonicalBaseFor(geoSeo, origin) {
  const configured = String(geoSeo?.canonicalUrl || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (!url.pathname || url.pathname === '/')) {
        return url.origin;
      }
    } catch { /* use the current origin when the operator value is invalid */ }
  }
  return origin;
}

function absoluteUrl(base, pathname) {
  return safeSchemaUrl(pathname, `${base.replace(/\/$/, '')}/`);
}

function setCanonical(href) {
  if (href) setMeta('link[rel="canonical"]', { rel: 'canonical', href });
  else removeMeta('link[rel="canonical"]');
}

function setRouteSchemas(schemas) {
  const valid = (Array.isArray(schemas) ? schemas : [schemas]).filter(Boolean);
  let script = document.getElementById('route-seo-structured-data');
  if (!valid.length) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = 'route-seo-structured-data';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = safeJsonLd(valid.length === 1 ? valid[0] : valid);
}

function prettySlug(slug = '') {
  return decodeURIComponent(slug).split('-').filter(Boolean).map(part =>
    part.toLowerCase() === 'ncr' ? 'NCR' : part.charAt(0).toUpperCase() + part.slice(1)
  ).join(' ');
}

function publicJob(job) {
  if (!job || String(job.status || '').trim().toLowerCase() !== 'active') return false;
  if (job.deleted_at || job.deletedAt || job.tombstoned || job.is_deleted || job.isDeleted) return false;
  const expires = job.expires_at || job.expiresAt;
  if (!expires) return true;
  const expiresAt = new Date(expires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function addGeoMeta(geoSeo, regionName = '') {
  if (geoSeo?.enableGeoSeo !== true) {
    removeMeta('meta[name="keywords"]');
    removeMeta('meta[name="geo.region"]');
    removeMeta('meta[name="geo.placename"]');
    return;
  }
  if (geoSeo.metaKeywords) setMeta('meta[name="keywords"]', { name: 'keywords', content: geoSeo.metaKeywords });
  if (geoSeo.targetRegion) setMeta('meta[name="geo.region"]', { name: 'geo.region', content: geoSeo.targetRegion });
  const place = regionName || geoSeo.targetCity;
  if (place) setMeta('meta[name="geo.placename"]', { name: 'geo.placename', content: place });
}

export default function RouteSeo() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    // Public articles and published portfolios own their richer metadata.
    // Return before the generic route cleanup so that it cannot race with the
    // page-level canonical, social-preview, or structured-data effects.
    if (/^\/blog\/[^/]+$/.test(path) || /^\/portfolio\/[^/]+$/.test(path)) {
      document.head.querySelectorAll('[data-route-seo-owner="route"]').forEach(element => element.remove());
      document.getElementById('route-seo-structured-data')?.remove();
      return undefined;
    }

    document.getElementById('route-seo-structured-data')?.remove();
    removeMeta('meta[property="og:image"]');
    removeMeta('meta[property="og:image:alt"]');
    removeMeta('meta[property="og:image:type"]');
    removeMeta('meta[property="og:image:width"]');
    removeMeta('meta[property="og:image:height"]');
    removeMeta('meta[name="twitter:image"]');
    removeMeta('meta[name="twitter:card"]');

    const isPrivatePrefix = PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
    const isLogin = path === '/login';
    const isJobCategory = /^\/jobs\/category\/[^/]+$/.test(path);
    const isJobDetail = /^\/jobs\/portal\/[^/]+$/.test(path);
    const regionalMatch = path.match(/^\/jobs\/(city|in)\/([^/]+)$/);
    const isRegionalHub = Boolean(regionalMatch);
    const isCustomPage = path.startsWith('/p/');

    let title;
    let description;
    if (isRegionalHub) {
      const place = prettySlug(regionalMatch[2]);
      title = `Technology Jobs in ${place} — ${SITE_NAME}`;
      description = `Browse current active job listings in ${place}. Listing counts and compensation details are based on published employer postings.`;
    } else if (isJobCategory) {
      const cat = decodeURIComponent(path.split('/').pop() || '').replace(/-/g, ' ');
      title = `${cat ? cat.charAt(0).toUpperCase() + cat.slice(1) + ' Jobs' : 'Job Category'} — ${SITE_NAME}`;
      description = `Browse ${cat || 'job'} opportunities on IME365.`;
    } else if (isJobDetail) {
      title = `Job Listing — ${SITE_NAME}`;
      description = 'View the published job details and application information.';
    } else if (isCustomPage) {
      title = `${SITE_NAME}`;
      description = 'Public information from IME365.';
    } else if (PUBLIC_PAGES[path]) {
      [title, description] = PUBLIC_PAGES[path];
    } else if (isPrivatePrefix || isLogin) {
      const matchedPrefix = PRIVATE_PREFIXES.find(prefix => path === prefix || path.startsWith(prefix + '/'));
      title = PRIVATE_TITLES[matchedPrefix] || `${SITE_NAME}`;
      description = PRIVATE_DESCRIPTIONS[matchedPrefix] || '';
    } else {
      title = `Page Not Found — ${SITE_NAME}`;
      description = 'The requested page is unavailable.';
    }

    const isIndexable = (!isPrivatePrefix && !isLogin && PUBLIC_PAGES[path] !== undefined)
      || isJobCategory || isJobDetail || isRegionalHub || isCustomPage;
    const canonicalPath = path === '/billing/plans' ? '/pricing' : path;
    const origin = window.location.origin;
    const fallbackCanonical = absoluteUrl(origin, canonicalPath);

    document.title = title;
    setMeta('meta[name="description"]', { name: 'description', content: description || '' });
    setMeta('meta[name="robots"]', {
      name: 'robots',
      content: isRegionalHub || isJobDetail ? 'noindex,nofollow' : isIndexable ? 'index,follow' : 'noindex,nofollow',
    });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description || '' });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: fallbackCanonical || `${origin}${canonicalPath}` });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: isJobDetail ? 'article' : 'website' });
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description || '' });
    if (isIndexable && !isRegionalHub && !isJobDetail) setCanonical(fallbackCanonical);
    else setCanonical(null);

    let active = true;
    const run = async () => {
      let config = null;
      try {
        const candidate = await fetchPublicConfig();
        if (candidate?._settingsSource === 'mariadb') config = candidate;
      } catch { /* no metadata is synthesized when MariaDB is unavailable */ }
      if (!active) return;

      const geoSeo = config?.geoSeo && typeof config.geoSeo === 'object' ? config.geoSeo : {};
      const canonicalBase = canonicalBaseFor(geoSeo, origin);
      const canonical = absoluteUrl(canonicalBase, canonicalPath);
      if (isIndexable && !isRegionalHub && !isJobDetail) setCanonical(canonical);
      if (canonical) setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
      addGeoMeta(geoSeo);

      const schemas = [];
      if (path === '/' && geoSeo.enableGeoSeo === true) {
        if (geoSeo.enableOrganizationSchema === true) {
          schemas.push(buildOrganizationSchema(config, canonicalBase));
        }
        schemas.push(buildFaqPageSchema(HOMEPAGE_FAQS));
      }
      if (isJobCategory && geoSeo.enableGeoSeo === true) {
        const cat = prettySlug(path.split('/').pop() || 'Jobs');
        const crumbs = buildBreadcrumbSchema([
          { name: 'Home', url: absoluteUrl(canonicalBase, '/') },
          { name: 'Jobs', url: absoluteUrl(canonicalBase, '/jobs') },
          { name: `${cat} jobs`, url: canonical },
        ], canonicalBase);
        if (crumbs) schemas.push(crumbs);
      }

      if (isRegionalHub) {
        if (config?._settingsSource !== 'mariadb' || geoSeo.enableGeoSeo !== true) {
          setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
          setCanonical(null);
          setRouteSchemas([]);
          return;
        }
        const kind = regionalMatch[1] === 'in' ? 'state' : 'city';
        try {
          const region = await getRegionalHub(kind, decodeURIComponent(regionalMatch[2]));
          if (!active) return;
          const place = region.name;
          const area = kind === 'city' && region.stateName ? `${region.name}, ${region.stateName}` : region.name;
          title = `Technology Jobs in ${place} — ${SITE_NAME}`;
          description = region.hasVacancies
            ? `${region.vacancyCount} active job ${region.vacancyCount === 1 ? 'listing' : 'listings'} currently published in ${area}. View current openings and salary information supplied by employers.`
            : `There are no active job listings currently published in ${area}. Check the live listings again later.`;
          document.title = title;
          setMeta('meta[name="description"]', { name: 'description', content: description });
          setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
          setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
          addGeoMeta(geoSeo, place);
          const regionCanonical = absoluteUrl(canonicalBase, path);
          if (region.hasVacancies && regionCanonical) {
            setMeta('meta[name="robots"]', { name: 'robots', content: 'index,follow' });
            setCanonical(regionCanonical);
            setMeta('meta[property="og:url"]', { property: 'og:url', content: regionCanonical });
            const breadcrumb = buildBreadcrumbSchema([
              { name: 'Home', url: absoluteUrl(canonicalBase, '/') },
              { name: 'Jobs', url: absoluteUrl(canonicalBase, '/jobs') },
              { name: place, url: regionCanonical },
            ], canonicalBase);
            if (breadcrumb) schemas.push(breadcrumb);
          } else {
            setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,follow' });
            setCanonical(null);
          }
        } catch (error) {
          if (!active) return;
          setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
          setCanonical(null);
          setRouteSchemas([]);
          return;
        }
      }

      if (isJobDetail) {
        const rawId = path.split('/').pop() || '';
        let job;
        try {
          job = await getJob(decodeURIComponent(rawId));
        } catch {
          if (!active) return;
          setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
          setCanonical(null);
          setRouteSchemas([]);
          return;
        }
        if (!active) return;
        if (!publicJob(job)) {
          setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' });
          setCanonical(null);
          setRouteSchemas([]);
          return;
        }
        const jobTitle = schemaText(job.title, 255) || 'Job listing';
        const company = schemaText(job.company_name || job.companyName || job.company, 180);
        title = `${jobTitle}${company ? ` at ${company}` : ''} — ${SITE_NAME}`;
        description = schemaText(job.description, 165) || 'View the published job details and application information.';
        document.title = title;
        setMeta('meta[name="description"]', { name: 'description', content: description });
        setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
        setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
        setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
        setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
        const jobCanonical = absoluteUrl(canonicalBase, `/jobs/portal/${encodeURIComponent(job.id)}`);
        if (jobCanonical) {
          setMeta('meta[name="robots"]', { name: 'robots', content: 'index,follow' });
          setCanonical(jobCanonical);
          setMeta('meta[property="og:url"]', { property: 'og:url', content: jobCanonical });
          const preview = absoluteUrl(canonicalBase, `/api/public/jobs/${encodeURIComponent(job.id)}/og.png`);
          if (preview) {
            setMeta('meta[property="og:image"]', { property: 'og:image', content: preview });
            setMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: `${jobTitle}${company ? ` at ${company}` : ''}` });
            setMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: 'image/png' });
            setMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '1200' });
            setMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '630' });
            setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
            setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: preview });
          }
        }
        addGeoMeta(geoSeo);
        if (geoSeo.enableJobPostingSchema === true) {
          schemas.push(buildJobPostingSchema(job, { canonicalUrl: jobCanonical }));
          const breadcrumb = buildBreadcrumbSchema([
            { name: 'Home', url: absoluteUrl(canonicalBase, '/') },
            { name: 'Jobs', url: absoluteUrl(canonicalBase, '/jobs') },
            { name: jobTitle, url: jobCanonical },
          ], canonicalBase);
          if (breadcrumb) schemas.push(breadcrumb);
        }
      }

      if (config?._settingsSource === 'mariadb' && config?.llmGeo?.enableLlmGeo === true) {
        setMeta('link[rel="alternate"][data-route-seo="llms"]', {
          rel: 'alternate', type: 'text/plain', title: 'Concise LLM discovery document', href: '/llms.txt', 'data-route-seo': 'llms',
        });
        if (String(config.llmGeo.llmsFullTxtContent || '').trim()) {
          setMeta('link[rel="alternate"][data-route-seo="llms-full"]', {
            rel: 'alternate', type: 'text/plain', title: 'Detailed LLM discovery document', href: '/llms-full.txt', 'data-route-seo': 'llms-full',
          });
        } else {
          removeMeta('link[rel="alternate"][data-route-seo="llms-full"]');
        }
      } else {
        removeMeta('link[rel="alternate"][data-route-seo="llms"]');
        removeMeta('link[rel="alternate"][data-route-seo="llms-full"]');
      }
      setRouteSchemas(schemas);
    };

    run();
    return () => {
      active = false;
      document.getElementById('route-seo-structured-data')?.remove();
    };
  }, [location.pathname]);
  return null;
}
