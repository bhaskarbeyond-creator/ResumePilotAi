import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Render } from '@puckeditor/core';
import { getPortfolioBySlug, incrementPortfolioViews } from '../../services/api/platform';
import { normalizePublishedPortfolio, sanitizePortfolioImageUrl } from '../PortfolioBuilder/portfolioSanitization';
import WebCvRenderer from '../PortfolioTemplates/WebCvRenderer';
import { displayNameFromCanonical, normalizePortfolioData } from '../../utils/portfolioData';
import { NavbarCategory, HeroCategory, AboutCategory, SkillsCategory, ExperienceCategory, EducationCategory, ProjectsCategory, ServicesCategory, TestimonialsCategory, ResumeCategory, AwardsCategory, ContactCategory, FooterCategory } from '../PortfolioBuilder/PortfolioComponents';

// Component configuration for rendering - MUST match the builder config exactly
const config = {
    components: {
        Navbar: NavbarCategory,
        Hero: HeroCategory,
        About: AboutCategory,
        Skills: SkillsCategory,
        Experience: ExperienceCategory,
        Education: EducationCategory,
        Projects: ProjectsCategory,
        Services: ServicesCategory,
        Testimonials: TestimonialsCategory,
        Resume: ResumeCategory,
        Awards: AwardsCategory,
        Contact: ContactCategory,
        Footer: FooterCategory,
    },
};

/**
 * Writes (or CREATES) a `<meta>`/`<link>` in the document head.
 *
 * WHY THIS EXISTS RATHER THAN `querySelector(...)?.setAttribute(...)`:
 * `index.html` ships a `description` meta but NO `robots` meta and NO canonical
 * link. The previous error-path code used optional chaining on those selectors,
 * so for an unavailable portfolio BOTH the `noindex,nofollow` directive and the
 * canonical silently no-opped — an unavailable portfolio stayed indexable.
 * Optional chaining here was hiding a real SEO defect. Every write now reports
 * whether it had to create the element, so the caller can restore it on unmount.
 */
function writeHeadMeta(selector, attributes, created = []) {
    let element = document.head.querySelector(selector);
    const wasCreated = !element;
    if (!element) {
        element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
        document.head.appendChild(element);
    }
    const previous = {};
    for (const [name, value] of Object.entries(attributes)) {
        previous[name] = element.getAttribute(name);
        element.setAttribute(name, value);
    }
    created.push({ element, wasCreated, previous });
    return element;
}

/**
 * Normalizes a route `:slug` param into either a real address or `null`.
 *
 * WHY THIS EXISTS (DIR-019 DEFECT 2): React Router hands us whatever was in the
 * URL, and the dashboard used to emit `/portfolio/null` because MariaDB stores
 * `slug = NULL` for unpublished drafts and the template string stringified it.
 * A route param is untrusted input, so the SAME string sentinels a NULL column
 * can produce are refused here rather than being forwarded to the backend.
 *
 * Returning `null` (not `'null'`) is what makes the caller's existing
 * `if (!slug) { setError('Portfolio not found'); }` branch fire, which is the
 * clean fail-fast the gatekeeper asked for.
 */
function normalizePortfolioSlug(rawSlug) {
    if (typeof rawSlug !== 'string') return null;
    const trimmed = rawSlug.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    return trimmed;
}

const PublicPortfolio = () => {
    const { slug: rawSlug } = useParams();
    // DIR-019 DEFECT 2 (defense in depth): MariaDB stores `slug = NULL` for an
    // unpublished draft, and DashboardPortfolios used to interpolate that straight
    // into `/portfolio/${portfolio.slug}`, producing the literal address
    // `/portfolio/null`. Even though the dashboard no longer emits such a link, a
    // hand-typed or stale bookmark must fail fast and CLEANLY here — never reach
    // the network as `/api/portfolios/public/null`, and never be echoed into a
    // canonical/og:url meta tag as if it were a real address.
    const slug = normalizePortfolioSlug(rawSlug);
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let active = true;

        const loadPortfolio = async () => {
            setLoading(true);
            setError(null);
            setPortfolio(null);
            if (!slug) {
                setError('Portfolio not found');
                setLoading(false);
                return;
            }

            try {
                const portfolioData = await getPortfolioBySlug(slug);
                if (!active) return;
                const normalized = normalizePublishedPortfolio(portfolioData, config.components);
                if (!normalized) {
                    setError(portfolioData ? 'This portfolio is currently unavailable' : 'Portfolio not found');
                    return;
                }
                setPortfolio(normalized);
                const viewKey = `portfolio_viewed:${normalized.id}`;
                let alreadyCounted = false;
                try { alreadyCounted = sessionStorage.getItem(viewKey) === 'true'; } catch { /* storage is optional */ }
                if (!alreadyCounted) {
                    incrementPortfolioViews(normalized.id).then(success => {
                        if (success) try { sessionStorage.setItem(viewKey, 'true'); } catch { /* storage is optional */ }
                    }).catch(() => {});
                }
            } catch (loadError) {
                if (!active) return;
                console.error('Error loading public portfolio', loadError);
                setError('This portfolio could not be loaded. Please try again later.');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadPortfolio();
        return () => {
            active = false;
        };
    }, [slug]);

    useEffect(() => {
        if (!error || portfolio) return undefined;
        document.title = 'Portfolio unavailable — IME365';
        // These are CREATED if absent (see writeHeadMeta). An unavailable or
        // unpublished portfolio must be explicitly de-indexed, not merely
        // left to inherit the app-wide default.
        const touched = [];
        writeHeadMeta('meta[name="robots"]', { name: 'robots', content: 'noindex,nofollow' }, touched);
        writeHeadMeta('meta[name="description"]', { name: 'description', content: 'The requested Portfolio is unavailable or not published.' }, touched);
        // DIR-019 DEFECT 2: an UNAVAILABLE portfolio must not advertise a
        // canonical address. This branch used to emit
        // `${origin}/portfolio/${slug || ''}` unconditionally, which produced a
        // self-referential canonical for content that does not exist — either
        // `/portfolio/null` (the stringified NULL slug) or, once the route param
        // is normalised to null, a bogus `/portfolio/`. A canonical is a signal
        // to a crawler that THIS is the authoritative URL for the resource, so
        // it must only ever be written for a portfolio that actually rendered.
        if (slug) {
            writeHeadMeta('link[rel="canonical"]', { rel: 'canonical', href: `${window.location.origin}/portfolio/${encodeURIComponent(slug)}` }, touched);
        } else {
            // Belt-and-braces: strip a canonical a previous navigation may have
            // left behind, so an error page can never inherit a real address.
            document.head.querySelectorAll('link[rel="canonical"]').forEach((element) => element.remove());
        }
        return () => {
            for (const { element, wasCreated, previous } of touched) {
                if (wasCreated) element.remove();
                else for (const [name, value] of Object.entries(previous)) {
                    if (value === null) element.removeAttribute(name);
                    else element.setAttribute(name, value);
                }
            }
        };
    }, [error, portfolio, slug]);

    useEffect(() => {
        if (!portfolio) return undefined;
        const previousTitle = document.title;
        const touched = [];
        const setMeta = (selector, attributes) => writeHeadMeta(selector, attributes, touched);

        const person = portfolio.data?.canonical ? normalizePortfolioData(portfolio.data.canonical) : null;
        const title = portfolio.metadata?.seoTitle || person?.extras?.seoTitle || displayNameFromCanonical(person || {}) || portfolio.title || 'Portfolio';
        const description = portfolio.metadata?.seoDescription || person?.extras?.seoDescription || person?.summary || portfolio.metadata?.description || '';
        const canonical = `${window.location.origin}/portfolio/${encodeURIComponent(slug)}`;
        // AC-5: a real preview card needs an image. We prefer the candidate's
        // own photo, then their first project shot, then the platform brand
        // icon. That icon is a real shipped asset (669 KB, 192x192) — well over
        // the 200px minimum LinkedIn/WhatsApp require — so the fallback can
        // never render as a broken card. Every candidate-supplied value passes
        // through the same sanitizer as the rendered DOM (INV-2), so a crafted
        // `javascript:` or credentialed URL cannot reach a meta tag that a
        // crawler would then fetch on the candidate's behalf.
        const socialImage = sanitizePortfolioImageUrl(person?.heading?.photo)
            || sanitizePortfolioImageUrl(person?.projects?.[0]?.image)
            || `${window.location.origin}/favicons/android-icon-192x192.png`;
        document.title = title;
        setMeta('meta[name="description"]', { name: 'description', content: description });
        setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
        setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
        setMeta('meta[property="og:type"]', { property: 'og:type', content: 'profile' });
        setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
        setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'IME365' });
        setMeta('meta[property="og:image"]', { property: 'og:image', content: socialImage });
        setMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: title });
        // summary_large_image (not `summary`) is what earns the large LinkedIn /
        // WhatsApp card AC-5 asks for; `summary` silently degrades to a thumbnail.
        setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
        setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
        setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
        setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: socialImage });
        setMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: title });
        setMeta('meta[name="robots"]', { name: 'robots', content: 'index,follow' });
        setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });
        const structuredData = document.createElement('script');
        structuredData.type = 'application/ld+json';
        structuredData.dataset.portfolioStructuredData = 'true';
        const personNode = person ? {
            '@type': 'Person',
            name: displayNameFromCanonical(person),
            jobTitle: person.heading.occupation || undefined,
            email: person.heading.email || undefined,
            telephone: person.heading.phone || undefined,
            url: person.heading.website || canonical,
            sameAs: [person.heading.linkedin, person.heading.github].filter(Boolean),
        } : undefined;
        structuredData.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfilePage', name: title, description, url: canonical, mainEntity: personNode }).replace(/</g, '\\u003c');
        document.head.appendChild(structuredData);

        return () => {
            document.title = previousTitle;
            structuredData.remove();
            for (const { element, wasCreated, previous } of touched) {
                if (wasCreated) element.remove();
                else for (const [name, value] of Object.entries(previous)) {
                    if (value === null) element.removeAttribute(name);
                    else element.setAttribute(name, value);
                }
            }
        };
    }, [portfolio, slug]);

    const getThemeClasses = (theme) => {
        const themes = {
            default: 'bg-white text-gray-900',
            dark: 'bg-gray-900 text-white',
            minimal: 'bg-[#fbfbfa] text-neutral-900',
            creative: 'bg-[#161310] text-[#f4ead8]',
            professional: 'bg-[#f4efe6] text-[#1c2430]',
        };
        return themes[theme] || themes.default;
    };

    const isWebCv = Boolean(portfolio?.data?.canonical && (portfolio.data.renderer === 'webcv' || portfolio.data.templateKey));

    // LANDMARK NOTE (WCAG 2.1 / DIR-019 AC-5): this route renders INSIDE
    // CubaAppShell, which already provides the page's single
    // `<main id="cuba-main-content">` landmark (and the "Skip to main content"
    // link targets it). These branches therefore use `<div>`/`<section>`, never a
    // second `<main>`: two nested main landmarks are an accessibility defect
    // (ambiguous landmark navigation) and this was proven by DOM crawl.
    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-cuba-canvas" aria-busy="true">
                <div className="text-center" role="status" aria-live="polite">
                    <div aria-hidden="true" className="mx-auto h-16 w-16 animate-spin rounded-full border-b-2 border-cuba-primary" />
                    <p className="mt-4 text-cuba-ink-muted">Loading portfolio...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-cuba-canvas px-4">
                <div className="max-w-md text-center" role="alert">
                    <div className="text-6xl" aria-hidden="true">&#128546;</div>
                    <h1 className="mb-2 text-2xl font-bold text-cuba-ink">Portfolio Unavailable</h1>
                    <p className="mb-4 text-cuba-ink-muted">{error}</p>
                    <a href="/" className="cuba-btn-primary inline-block rounded-lg px-6 py-3 font-medium">
                        Go Home
                    </a>
                </div>
            </div>
        );
    }

    if (!portfolio) {
        return null;
    }

    return (
        <div className={`min-h-screen overflow-x-hidden ${getThemeClasses(portfolio.theme)}`}>
            <div className="portfolio-content">
                {isWebCv ? (
                    <WebCvRenderer canonical={portfolio.data.canonical} templateKey={portfolio.data.templateKey} />
                ) : portfolio.data?.content?.length > 0 ? (
                    <Render config={config} data={portfolio.data} />
                ) : (
                    <div className="flex min-h-screen items-center justify-center px-4">
                        <div className="text-center">
                            <div className="mb-4 text-6xl" aria-hidden="true">&#128679;</div>
                            <h1 className="mb-2 text-2xl font-bold">Portfolio Under Construction</h1>
                            <p className="text-cuba-ink-muted">This portfolio is being built and will be available soon.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicPortfolio;
