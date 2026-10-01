import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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

// Descriptions for the authenticated portals. These are never indexed
// (noindex,nofollow) but keep tab titles, history, and internal deep links
// self-describing instead of falling back to an empty meta tag.
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
      description = `Browse ${cat || 'job'} opportunities on IME365.`;
    } else if (isJobDetail) {
      title = `Job Listing — ${SITE_NAME}`;
      description = 'View full job details and apply on IME365.';
    } else if (isCustomPage) {
      title = `${SITE_NAME}`;
      description = 'Public information from IME365.';
    } else if (PUBLIC_PAGES[path]) {
      [title, description] = PUBLIC_PAGES[path];
    } else if (isPrivatePrefix || isLogin) {
      // Find the best matching private title
      const matchedPrefix = PRIVATE_PREFIXES.find(p => path === p || path.startsWith(p + '/'));
      title = PRIVATE_TITLES[matchedPrefix] || `${SITE_NAME}`;
      // Portals stay noindex, but a real description keeps the browser tab,
      // history entry, and any internal deep link self-describing.
      description = PRIVATE_DESCRIPTIONS[matchedPrefix] || '';
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
