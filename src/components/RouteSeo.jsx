import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'ResumePilot AI';

const PUBLIC_PAGES = {
  '/': [`${SITE_NAME} — ATS Resume Builder & CV Maker`, 'Create ATS-friendly resumes, cover letters, and professional portfolios with AI-assisted tools.'],
  '/login': [`Sign In — ${SITE_NAME}`, 'Sign in or create your free ResumePilot AI account.'],
  '/features': [`${SITE_NAME} Features`, 'Explore resume, cover-letter, Portfolio, job-tracking, and AI-assisted career tools.'],
  '/pricing': [`${SITE_NAME} Plans & Pricing`, 'Compare ResumePilot AI plans and server-verified premium features.'],
  '/billing/plans': [`${SITE_NAME} Plans & Pricing`, 'Compare ResumePilot AI plans and server-verified premium features.'],
  '/jobs': ['Jobs and Career Opportunities', 'Browse job opportunities and career resources powered by ResumePilot AI.'],
  '/jobs/portal': ['Job Portal — Browse Open Positions', 'Find and apply for the latest job openings on ResumePilot AI job portal.'],
  '/jobs/browse': ['Browse Jobs — ResumePilot AI', 'Search and filter job listings matched to your career profile.'],
  '/jobs/categories': ['Job Categories — ResumePilot AI', 'Explore job opportunities organized by industry and category.'],
  '/blog': [`${SITE_NAME} Career Blog`, 'Read public career, resume, interview, and job-search articles.'],
  '/portfolios': ['Professional Portfolio Gallery', 'Browse explicitly published professional portfolios.'],
  '/contact': [`Contact ${SITE_NAME}`, 'Contact ResumePilot AI support and product teams.'],
};

// All route prefixes that are private (authenticated or sensitive) — must not be indexed.
const PRIVATE_PREFIXES = [
  '/dashboard', '/dashboard2', '/build-resume', '/create-resume',
  '/adm', '/blog-editor', '/portfolio/builder', '/portfolio/builder',
  '/export', '/shared', '/coverletter', '/resume', '/front',
];

// Private page titles — shown in browser tab but never indexed.
const PRIVATE_TITLES = {
  '/dashboard': `My Dashboard — ${SITE_NAME}`,
  '/dashboard2': `My Dashboard — ${SITE_NAME}`,
  '/build-resume': `Build Resume — ${SITE_NAME}`,
  '/create-resume': `Create Resume — ${SITE_NAME}`,
  '/coverletter': `Cover Letter Builder — ${SITE_NAME}`,
  '/resume': `Resume Builder — ${SITE_NAME}`,
  '/adm': `Admin Panel — ${SITE_NAME}`,
  '/blog-editor': `Blog Editor — ${SITE_NAME}`,
  '/portfolio/builder': `Portfolio Builder — ${SITE_NAME}`,
  '/export': `Export — ${SITE_NAME}`,
  '/shared': `Shared Resume — ${SITE_NAME}`,
  '/front': `${SITE_NAME}`,
};

export default function RouteSeo() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;

    // Dynamic public articles and portfolios own their richer metadata after data loads.
    if (/^\/blog\/[^/]+$/.test(path) || /^\/portfolio\/[^/]+$/.test(path)) return undefined;

    const isPrivatePrefix = PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
    const isLogin = path === '/login';
    const isJobCategory = /^\/jobs\/category\/[^/]+$/.test(path);
    const isJobDetail = /^\/jobs\/portal\/[^/]+$/.test(path);
    const isCustomPage = path.startsWith('/p/');

    // Determine title and description
    let title, description;
    if (isJobCategory) {
      const cat = decodeURIComponent(path.split('/').pop() || '').replace(/-/g, ' ');
      title = `${cat ? cat.charAt(0).toUpperCase() + cat.slice(1) + ' Jobs' : 'Job Category'} — ${SITE_NAME}`;
      description = `Browse ${cat || 'job'} opportunities on ResumePilot AI.`;
    } else if (isJobDetail) {
      title = `Job Listing — ${SITE_NAME}`;
      description = 'View full job details and apply on ResumePilot AI.';
    } else if (isCustomPage) {
      title = `${SITE_NAME}`;
      description = 'Public information from ResumePilot AI.';
    } else if (PUBLIC_PAGES[path]) {
      [title, description] = PUBLIC_PAGES[path];
    } else if (isPrivatePrefix || isLogin) {
      // Find the best matching private title
      const matchedPrefix = PRIVATE_PREFIXES.find(p => path === p || path.startsWith(p + '/'));
      title = PRIVATE_TITLES[matchedPrefix] || `${SITE_NAME}`;
      description = '';
    } else {
      title = `Page Not Found — ${SITE_NAME}`;
      description = 'The requested page is unavailable.';
    }

    const isIndexable = !isPrivatePrefix && !isLogin && PUBLIC_PAGES[path] !== undefined || isJobCategory || isJobDetail || isCustomPage;
    const canonicalPath = path === '/billing/plans' ? '/pricing' : path;
    const canonical = `${window.location.origin}${canonicalPath}`;

    document.title = title;
    const setMeta = (selector, attributes) => {
      let element = document.head.querySelector(selector);
      if (!element) { element = document.createElement(selector.startsWith('link') ? 'link' : 'meta'); document.head.appendChild(element); }
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    };
    if (description) setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[name="robots"]', { name: 'robots', content: isIndexable ? 'index,follow' : 'noindex,nofollow' });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    if (description) setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    if (isIndexable) setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });
    return undefined;
  }, [location.pathname]);
  return null;
}
