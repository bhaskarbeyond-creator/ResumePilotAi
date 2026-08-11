import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Render } from '@measured/puck';
import { getPortfolioBySlug, incrementPortfolioViews } from '../../firestore/dbOperations';
import {
    NavbarCategory,
    HeroCategory,
    AboutCategory,
    SkillsCategory,
    ExperienceCategory,
    EducationCategory,
    ProjectsCategory,
    ServicesCategory,
    TestimonialsCategory,
    ResumeCategory,
    AwardsCategory,
    ContactCategory,
    FooterCategory,
} from '../PortfolioBuilder/PortfolioComponents';

// 🔒 SECURITY: Runtime sanitization for published portfolios
const RuntimeSecurity = {
    sanitizeText: (input) => {
        if (typeof input !== 'string') return '';
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>?/gm, '')
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    },

    // 🔒 ENHANCED SECURITY: Block ALL external links at runtime
    sanitizeUrl: (url) => {
        if (typeof url !== 'string') return '#';

        const cleaned = url.trim();

        // If empty or just whitespace, return safe default
        if (!cleaned) return '#';

        // Block ALL dangerous protocols including external HTTP/HTTPS
        const dangerousProtocols = /^(javascript|data|vbscript|file|ftp|http:|https:)/i;
        if (dangerousProtocols.test(cleaned)) {
            console.warn('🔒 RUNTIME SECURITY: Blocked external/dangerous URL protocol:', cleaned);
            return '#';
        }

        // Only allow safe internal navigation, email, and phone links
        const allowedPatterns = [
            /^#[a-zA-Z0-9\-_]*$/, // Internal anchors (hash links)
            /^\/[a-zA-Z0-9\-_\/]*$/, // Internal relative paths starting with /
            /^[a-zA-Z0-9\-_\/]*$/, // Internal relative paths (no protocol)
            /^mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Email links
            /^tel:\+?[0-9\-\s\(\)]+$/, // Phone links
        ];

        const isAllowed = allowedPatterns.some((pattern) => pattern.test(cleaned));

        if (!isAllowed) {
            console.warn('🔒 RUNTIME SECURITY: Blocked non-internal URL:', cleaned);
            return '#';
        }

        return cleaned.slice(0, 500); // Limit URL length
    },

    sanitizeComponent: (component) => {
        if (!component || !component.props) return component;
        const sanitized = { ...component };
        sanitized.props = { ...component.props };

        // Recursively sanitize all string props
        const sanitizeProps = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map((item) => sanitizeProps(item));
            } else if (obj && typeof obj === 'object') {
                const sanitizedObj = {};
                Object.keys(obj).forEach((key) => {
                    if (typeof obj[key] === 'string') {
                        if (key.includes('url') || key.includes('link') || key.includes('href')) {
                            sanitizedObj[key] = RuntimeSecurity.sanitizeUrl(obj[key]);
                        } else {
                            sanitizedObj[key] = RuntimeSecurity.sanitizeText(obj[key]);
                        }
                    } else {
                        sanitizedObj[key] = sanitizeProps(obj[key]);
                    }
                });
                return sanitizedObj;
            }
            return obj;
        };

        sanitized.props = sanitizeProps(sanitized.props);
        return sanitized;
    },
};

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
        if (slug) {
            loadPortfolio();
        }
    }, [slug]);

    const loadPortfolio = async () => {
        try {
            setLoading(true);
            const portfolioData = await getPortfolioBySlug(slug);

            if (portfolioData) {
                console.log('Loaded portfolio data:', portfolioData);
                console.log('Portfolio content structure:', portfolioData.data);

                // Validate portfolio data structure
                if (!portfolioData.data) {
                    console.error('Portfolio data is missing');
                    setError('Portfolio data is corrupted');
                    return;
                }

                if (!portfolioData.data.content) {
                    console.warn('Portfolio content is missing, initializing empty array');
                    portfolioData.data.content = [];
                }

                if (!portfolioData.data.root) {
                    console.warn('Portfolio root is missing, initializing with default');
                    portfolioData.data.root = {
                        props: {
                            title: portfolioData.title || 'Portfolio',
                        },
                    };
                }

                // Validate each component in the content array
                portfolioData.data.content = portfolioData.data.content.filter((component) => {
                    if (!component.type) {
                        console.warn('Removing component without type:', component);
                        return false;
                    }
                    if (!config.components[component.type]) {
                        console.warn(`Component type ${component.type} not found in config, skipping`);
                        return false;
                    }
                    if (!component.props) {
                        console.warn('Component missing props, adding empty props:', component);
                        component.props = {};
                    }

                    // Debug: Log component props to see what data is available
                    console.log(`${component.type} component props:`, component.props);

                    // Check if props are empty and apply default props if needed
                    const componentConfig = config.components[component.type];
                    if (componentConfig && componentConfig.defaultProps) {
                        const hasContent = Object.keys(component.props).some((key) => component.props[key] && component.props[key] !== '' && key !== 'id');

                        if (!hasContent) {
                            console.warn(`${component.type} component has no content, applying default props`);
                            component.props = { ...componentConfig.defaultProps, ...component.props };
                        }
                    }

                    console.log(`${component.type} final props:`, component.props);
                    return true;
                });

                console.log('Validated portfolio data:', portfolioData.data);

                // 🔒 SECURITY: Apply runtime sanitization to all components
                portfolioData.data.content = portfolioData.data.content.map((component) => RuntimeSecurity.sanitizeComponent(component));

                // 🔒 SECURITY: Sanitize root props as well
                if (portfolioData.data.root && portfolioData.data.root.props) {
                    portfolioData.data.root.props = RuntimeSecurity.sanitizeComponent({ props: portfolioData.data.root.props }).props;
                }

                console.log('🔒 SECURITY: Applied runtime sanitization to portfolio data');

                setPortfolio(portfolioData);
                // Increment view count
                incrementPortfolioViews(portfolioData.id);

                // Set page metadata for SEO
                updatePageMetadata(portfolioData);
            } else {
                setError('Portfolio not found');
            }
        } catch (err) {
            console.error('Error loading portfolio:', err);
            setError('Error loading portfolio: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const updatePageMetadata = (portfolioData) => {
        // Update document title
        document.title = portfolioData.metadata?.seoTitle || portfolioData.title || 'Portfolio';

        // Update meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
            metaDescription.setAttribute('content', portfolioData.metadata?.seoDescription || portfolioData.metadata?.description || '');
        } else {
            const meta = document.createElement('meta');
            meta.name = 'description';
            meta.content = portfolioData.metadata?.seoDescription || portfolioData.metadata?.description || '';
            document.head.appendChild(meta);
        }

        // Update meta keywords if available
        if (portfolioData.metadata?.tags && portfolioData.metadata.tags.length > 0) {
            const metaKeywords = document.querySelector('meta[name="keywords"]');
            if (metaKeywords) {
                metaKeywords.setAttribute('content', portfolioData.metadata.tags.join(', '));
            } else {
                const meta = document.createElement('meta');
                meta.name = 'keywords';
                meta.content = portfolioData.metadata.tags.join(', ');
                document.head.appendChild(meta);
            }
        }
    };

    const getThemeClasses = (theme) => {
        const themes = {
            default: 'bg-white text-gray-900',
            dark: 'bg-gray-900 text-white',
            minimal: 'bg-gray-50 text-gray-800',
            creative: 'bg-gradient-to-br from-purple-50 to-blue-50 text-gray-900',
            professional: 'bg-slate-50 text-slate-900',
        };
        return themes[theme] || themes.default;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading portfolio...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="text-6xl mb-4">😔</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Not Found</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <a href="/" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
            {/* Portfolio Content */}
            <div className="portfolio-content">
                {portfolio.data && portfolio.data.content ? (
                    <Render config={config} data={portfolio.data} />
                ) : (
                    <div className="flex items-center justify-center min-h-screen">
                        <div className="text-center">
                            <div className="text-6xl mb-4">🚧</div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Under Construction</h1>
                            <p className="text-gray-600">This portfolio is being built and will be available soon.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicPortfolio;
