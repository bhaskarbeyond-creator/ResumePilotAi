import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Render } from '@puckeditor/core';
import { getPortfolioBySlug, incrementPortfolioViews } from '../../firestore/dbOperations';
import { normalizePublishedPortfolio } from '../PortfolioBuilder/portfolioSanitization';
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

const PublicPortfolio = () => {
    const { slug } = useParams();
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
        document.title = 'Portfolio unavailable — ResumePilot AI';
        document.head.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex,nofollow');
        document.head.querySelector('meta[name="description"]')?.setAttribute('content', 'The requested Portfolio is unavailable or not published.');
        document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}/portfolio/${encodeURIComponent(slug || '')}`);
        return undefined;
    }, [error, portfolio, slug]);

    useEffect(() => {
        if (!portfolio) return undefined;
        const previousTitle = document.title;
        const touched = [];
        const setMeta = (selector, attributes) => {
            let element = document.head.querySelector(selector);
            const created = !element;
            if (!element) {
                element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
                document.head.appendChild(element);
            }
            const previous = {};
            for (const [name, value] of Object.entries(attributes)) {
                previous[name] = element.getAttribute(name);
                element.setAttribute(name, value);
            }
            touched.push({ element, created, previous });
        };

        const person = portfolio.data?.canonical ? normalizePortfolioData(portfolio.data.canonical) : null;
        const title = portfolio.metadata?.seoTitle || person?.extras?.seoTitle || displayNameFromCanonical(person || {}) || portfolio.title || 'Portfolio';
        const description = portfolio.metadata?.seoDescription || person?.extras?.seoDescription || person?.summary || portfolio.metadata?.description || '';
        const canonical = `${window.location.origin}/portfolio/${encodeURIComponent(slug)}`;
        document.title = title;
        setMeta('meta[name="description"]', { name: 'description', content: description });
        setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
        setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
        setMeta('meta[property="og:type"]', { property: 'og:type', content: 'profile' });
        setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
        setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
        setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
        setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
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
            for (const { element, created, previous } of touched) {
                if (created) element.remove();
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

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center" aria-busy="true">
                <div className="text-center" role="status" aria-live="polite">
                    <div aria-hidden="true" className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading portfolio...</p>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center" role="alert">
                    <div className="text-6xl mb-4" aria-hidden="true">😔</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Unavailable</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <a href="/" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 transition-colors">
                        Go Home
                    </a>
                </div>
            </main>
        );
    }

    if (!portfolio) {
        return null;
    }

    return (
        <main className={`min-h-screen overflow-x-hidden ${getThemeClasses(portfolio.theme)}`}>
            <div className="portfolio-content">
                {isWebCv ? (
                    <WebCvRenderer canonical={portfolio.data.canonical} templateKey={portfolio.data.templateKey} />
                ) : portfolio.data?.content?.length > 0 ? (
                    <Render config={config} data={portfolio.data} />
                ) : (
                    <div className="flex items-center justify-center min-h-screen px-4">
                        <div className="text-center">
                            <div className="text-6xl mb-4" aria-hidden="true">🚧</div>
                            <h1 className="text-2xl font-bold mb-2">Portfolio Under Construction</h1>
                            <p className="text-gray-600">This portfolio is being built and will be available soon.</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default PublicPortfolio;
