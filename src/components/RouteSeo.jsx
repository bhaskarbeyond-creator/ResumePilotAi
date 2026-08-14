import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PUBLIC_PAGES = {
  '/': ['ResumePilot AI — ATS Resume Builder & CV Maker', 'Create ATS-friendly resumes, cover letters, and professional portfolios with AI-assisted tools.'],
  '/features': ['ResumePilot AI Features', 'Explore resume, cover-letter, Portfolio, job-tracking, and AI-assisted career tools.'],
  '/pricing': ['ResumePilot AI Pricing', 'Compare ResumePilot AI plans and server-verified premium features.'],
  '/billing/plans': ['ResumePilot AI Plans', 'Compare ResumePilot AI plans and server-verified premium features.'],
  '/jobs': ['Jobs and Career Opportunities', 'Browse job opportunities and career resources.'],
  '/blog': ['ResumePilot AI Career Blog', 'Read public career, resume, interview, and job-search articles.'],
  '/portfolios': ['Professional Portfolio Gallery', 'Browse explicitly published professional portfolios.'],
  '/contact': ['Contact ResumePilot AI', 'Contact ResumePilot AI support and product teams.'],
};
const PRIVATE_PREFIXES = ['/dashboard', '/dashboard2', '/build-resume', '/create-resume', '/adm', '/blog-editor', '/portfolio/builder', '/export', '/shared', '/coverletter'];

export default function RouteSeo() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    // Dynamic public articles and portfolios own their richer metadata after data loads.
    if (/^\/blog\/[^/]+$/.test(path) || /^\/portfolio\/[^/]+$/.test(path)) return undefined;
    const genericJobs = path.startsWith('/jobs/');
    const genericPage = path.startsWith('/p/');
    const definition = PUBLIC_PAGES[path] || (genericJobs ? ['Job Search', 'Browse public job opportunities.'] : genericPage ? ['ResumePilot AI', 'Public information from ResumePilot AI.'] : null);
    const privatePage = PRIVATE_PREFIXES.some(prefix => path.startsWith(prefix)) || path === '/login' || !definition;
    const title = definition?.[0] || 'Page not found — ResumePilot AI';
    const description = definition?.[1] || 'The requested page is unavailable.';
    const canonicalPath = path === '/billing/plans' ? '/pricing' : path;
    const canonical = `${window.location.origin}${canonicalPath}`;
    document.title = title;
    const setMeta = (selector, attributes) => {
      let element = document.head.querySelector(selector);
      if (!element) { element = document.createElement(selector.startsWith('link') ? 'link' : 'meta'); document.head.appendChild(element); }
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    };
    setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[name="robots"]', { name: 'robots', content: privatePage ? 'noindex,nofollow' : 'index,follow' });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });
    return undefined;
  }, [location.pathname]);
  return null;
}
