import { TEMPLATE_PRESETS } from './TemplatePresets';

// 🔒 SECURITY: Input sanitization utilities
export const SecurityUtils = {
    // Sanitize text input to prevent XSS
    sanitizeText: (input) => {
        if (typeof input !== 'string') return '';

        // Remove any HTML tags and scripts
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>?/gm, '')
            .replace(/javascript:/gi, '')
            .replace(/data:/gi, '')
            .replace(/vbscript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim()
            .slice(0, 10000); // Limit length to prevent DoS
    },

    // 🔒 ENHANCED SECURITY: Validate and sanitize URLs - BLOCK ALL EXTERNAL LINKS
    sanitizeUrl: (url) => {
        if (typeof url !== 'string') return '#';

        const cleaned = url.trim();

        // If empty or just whitespace, return safe default
        if (!cleaned) return '#';

        // Block ALL dangerous protocols including external HTTP/HTTPS
        const dangerousProtocols = /^(javascript|data|vbscript|file|ftp|http:|https:)/i;
        if (dangerousProtocols.test(cleaned)) {
            console.warn('🔒 SECURITY: Blocked external/dangerous URL protocol:', cleaned);
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
            console.warn('🔒 SECURITY: Blocked non-internal URL:', cleaned);
            return '#';
        }

        return cleaned.slice(0, 500); // Limit URL length
    },

    // 🔒 ENHANCED SECURITY: Validate image URLs - Only allow trusted domains or data URLs
    sanitizeImageUrl: (url) => {
        if (typeof url !== 'string') return 'https://placehold.co/400x200';

        const cleaned = url.trim();

        // If empty, return placeholder
        if (!cleaned) return 'https://placehold.co/400x200';

        // Block dangerous protocols for images
        const dangerousProtocols = /^(javascript|vbscript|file):/i;
        if (dangerousProtocols.test(cleaned)) {
            console.warn('🔒 SECURITY: Blocked dangerous image URL:', cleaned);
            return 'https://placehold.co/400x200';
        }

        // Allow only trusted image domains or data URLs for images
        const trustedImageDomains = [
            'placehold.co',
            'via.placeholder.com',
            'picsum.photos',
            'images.unsplash.com',
            'source.unsplash.com',
            'placeholder.com',
            'dummyimage.com',
            // Add your own domain here
            window.location.hostname, // Current domain
        ];

        // Allow data URLs for uploaded images
        if (cleaned.startsWith('data:image/')) {
            // Validate it's a proper data URL for images
            const dataUrlPattern = /^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
            if (dataUrlPattern.test(cleaned)) {
                return cleaned.slice(0, 50000); // Limit data URL size
            } else {
                console.warn('🔒 SECURITY: Invalid data URL format:', cleaned.substring(0, 100));
                return 'https://placehold.co/400x200';
            }
        }

        // Only allow HTTPS URLs from trusted domains
        if (cleaned.match(/^https:\/\//i)) {
            try {
                const urlObj = new URL(cleaned);
                const hostname = urlObj.hostname.toLowerCase();

                const isTrusted = trustedImageDomains.some((domain) => hostname === domain || hostname.endsWith('.' + domain));

                if (isTrusted) {
                    return cleaned.slice(0, 2000);
                } else {
                    console.warn('🔒 SECURITY: Blocked untrusted image domain:', hostname);
                    return 'https://placehold.co/400x200';
                }
            } catch (e) {
                console.warn('🔒 SECURITY: Invalid image URL format:', cleaned);
                return 'https://placehold.co/400x200';
            }
        }

        console.warn('🔒 SECURITY: Blocked non-HTTPS image URL:', cleaned);
        return 'https://placehold.co/400x200';
    },

    // Sanitize CSS class names
    sanitizeClassName: (className) => {
        if (typeof className !== 'string') return '';

        // For CSS classes, we need to be more permissive to allow Tailwind classes
        // Allow alphanumeric, hyphens, underscores, spaces, slashes, brackets, and periods
        const sanitized = className
            .replace(/[^a-zA-Z0-9\s\-_\/\[\]\.\:]/g, '')
            .trim()
            .slice(0, 500); // Increased limit for complex Tailwind classes

        // Validate against known safe patterns for Tailwind CSS
        const allowedPatterns = [
            /^bg-\w+/, // Background colors
            /^text-\w+/, // Text colors
            /^border-\w+/, // Border styles
            /^hover:\w+/, // Hover states
            /^focus:\w+/, // Focus states
            /^transition-\w+/, // Transitions
            /^duration-\w+/, // Durations
            /^transform/, // Transforms
            /^scale-\w+/, // Scaling
            /^shadow-\w+/, // Shadows
            /^rounded-\w+/, // Border radius
            /^p[tblrxy]?-\w+/, // Padding
            /^m[tblrxy]?-\w+/, // Margin
            /^w-\w+/, // Width
            /^h-\w+/, // Height
            /^flex/, // Flex
            /^grid/, // Grid
            /^items-\w+/, // Align items
            /^justify-\w+/, // Justify content
            /^space-[xy]-\w+/, // Space between
            /^font-\w+/, // Font weights
            /^backdrop-\w+/, // Backdrop filters
            /^from-\w+/, // Gradient start
            /^to-\w+/, // Gradient end
            /^via-\w+/, // Gradient middle
            /^bg-gradient-to-[tblr]/, // Gradient directions
        ];

        // Check if the class contains only allowed patterns
        const classes = sanitized.split(/\s+/).filter((cls) => cls.length > 0);
        const validClasses = classes.filter((cls) => {
            // Allow basic utility classes and custom classes that match patterns
            return cls === 'transparent' || allowedPatterns.some((pattern) => pattern.test(cls)) || /^[a-zA-Z][a-zA-Z0-9\-_]*$/.test(cls); // Basic alphanumeric with hyphens/underscores
        });

        return validClasses.join(' ');
    },

    // Deep sanitize component props
    sanitizeComponentProps: (component) => {
        if (!component || !component.props) return component;

        const sanitizedProps = { ...component.props };

        // Common text fields to sanitize
        const textFields = [
            'name',
            'title',
            'description',
            'content',
            'subtitle',
            'email',
            'phone',
            'location',
            'company',
            'position',
            'institution',
            'degree',
            'skill',
            'logoText',
            'menuItems',
            'yearsCount',
            'yearsLabel',
            'projectsCount',
            'projectsLabel',
            'clientsCount',
            'clientsLabel',
            'primaryButtonText',
            'secondaryButtonText',
            'linesOfCode',
            'coffeeConsumed',
            'bugsFixed',
        ];
        textFields.forEach((field) => {
            if (sanitizedProps[field]) {
                sanitizedProps[field] = SecurityUtils.sanitizeText(sanitizedProps[field]);
            }
        });

        // URL fields to sanitize
        const urlFields = ['link', 'githubLink', 'linkedin', 'twitter', 'github', 'url', 'certificateUrl', 'credentialUrl', 'resumeUrl'];
        urlFields.forEach((field) => {
            if (sanitizedProps[field]) {
                sanitizedProps[field] = SecurityUtils.sanitizeUrl(sanitizedProps[field]);
            }
        });

        // Image URL fields to sanitize
        const imageFields = ['image', 'avatar', 'logo', 'companyLogo', 'resumePreview', 'logoImage'];
        imageFields.forEach((field) => {
            if (sanitizedProps[field]) {
                sanitizedProps[field] = SecurityUtils.sanitizeImageUrl(sanitizedProps[field]);
            }
        });

        // CSS class fields to sanitize (navbar styles, etc.)
        const classFields = ['backgroundColor', 'textColor', 'buttonColor', 'borderColor', 'hoverColor'];
        classFields.forEach((field) => {
            if (sanitizedProps[field]) {
                sanitizedProps[field] = SecurityUtils.sanitizeClassName(sanitizedProps[field]);
            }
        });

        // Preserve template field as-is (it's validated separately)
        if (component.props && component.props.template) {
            sanitizedProps.template = component.props.template;
        }

        // Preserve theme selection fields for dark templates
        if (component.props && component.props.accentColor) {
            sanitizedProps.accentColor = component.props.accentColor;
        }
        if (component.props && component.props.terminalTheme) {
            sanitizedProps.terminalTheme = component.props.terminalTheme;
        }

        // Sanitize array fields (projects, skills, etc.)
        const arrayFields = ['projects', 'skills', 'experience', 'education', 'testimonials', 'services', 'awards', 'socialLinks'];
        arrayFields.forEach((field) => {
            if (Array.isArray(sanitizedProps[field])) {
                sanitizedProps[field] = sanitizedProps[field].map((item) => {
                    const sanitizedItem = { ...item };

                    // Recursively sanitize object properties
                    Object.keys(sanitizedItem).forEach((key) => {
                        if (typeof sanitizedItem[key] === 'string') {
                            if (urlFields.includes(key)) {
                                sanitizedItem[key] = SecurityUtils.sanitizeUrl(sanitizedItem[key]);
                            } else if (imageFields.includes(key)) {
                                sanitizedItem[key] = SecurityUtils.sanitizeImageUrl(sanitizedItem[key]);
                            } else {
                                sanitizedItem[key] = SecurityUtils.sanitizeText(sanitizedItem[key]);
                            }
                        }
                    });

                    return sanitizedItem;
                });
            }
        });

        // Validate template selection (only allow predefined templates)
        if (sanitizedProps.template) {
            const allowedTemplates = {
                // Layout Templates
                GridLayout: ['default'],
                GridItem: ['default'],
                FlexLayout: ['default'],
                FlexItem: ['default'],
                Layout: ['twoColumn', 'threeColumn', 'sidebar', 'sidebarRight', 'headerContentFooter', 'hero'],

                // Content Templates
                Hero: ['classic', 'split', 'minimal', 'darkCyber', 'darkTerminal', 'artist', 'darkCyberSec'],
                About: ['traditional', 'progress', 'darkCyber', 'darkTerminal', 'artist', 'darkCyberSec'],
                Skills: ['grid', 'progress', 'darkCyber', 'darkTerminal', 'artist', 'darkCyberSec'],
                Experience: ['timeline', 'cards', 'darkCyber', 'darkTerminal', 'artist', 'darkCyberSec'],
                Education: ['timeline', 'cards'],
                Projects: ['grid', 'showcase', 'darkCyber', 'darkTerminal'],
                Services: ['grid', 'list'],
                Testimonials: ['slider', 'grid'],
                Resume: ['download', 'preview'],
                Awards: ['list', 'grid'],
                Contact: ['simple', 'form', 'artist', 'darkCyberSec'],
                Navbar: ['horizontal', 'centered'],
                Footer: ['minimal', 'comprehensive', 'darkCyber', 'darkTerminal'],
            };

            const componentType = component.type;
            const validTemplates = allowedTemplates[componentType] || [];

            if (!validTemplates.includes(sanitizedProps.template)) {
                console.warn(`🔒 SECURITY: Invalid template "${sanitizedProps.template}" for ${componentType}, using default`);
                sanitizedProps.template = validTemplates[0] || 'default';
            }
        }

        // Preserve any remaining component-specific fields that weren't explicitly sanitized
        Object.keys(component.props || {}).forEach((key) => {
            if (sanitizedProps[key] === undefined && component.props[key] !== undefined) {
                // For unknown fields, apply basic sanitization based on value type
                const value = component.props[key];
                if (typeof value === 'string') {
                    if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link') || key.toLowerCase().includes('image')) {
                        sanitizedProps[key] = SecurityUtils.sanitizeUrl(value);
                    } else if (key.toLowerCase().includes('color') || key.toLowerCase().includes('class') || key.toLowerCase().includes('background')) {
                        sanitizedProps[key] = SecurityUtils.sanitizeClassName(value);
                    } else {
                        sanitizedProps[key] = SecurityUtils.sanitizeText(value);
                    }
                } else if (typeof value === 'boolean' || typeof value === 'number') {
                    sanitizedProps[key] = value; // Preserve boolean and numeric values
                } else if (Array.isArray(value)) {
                    sanitizedProps[key] = value; // Arrays are handled separately above
                }
            }
        });

        return {
            ...component,
            props: sanitizedProps,
        };
    },
};

// Template loading utilities
export const loadTemplate = async (templateKey, initialData, setPortfolioData, setCurrentPortfolioId, setPortfolioSettings, setRenderKey) => {
    try {
        const template = TEMPLATE_PRESETS[templateKey];
        if (!template) {
            throw new Error('Template not found');
        }

        // Create a deep copy and sanitize the template data
        const templateData = JSON.parse(JSON.stringify(template));

        // 🔒 SECURITY: Sanitize all template components
        if (templateData.content) {
            templateData.content = templateData.content.map((component) => {
                console.log(`🔧 Loading template component: ${component.type}`);
                return SecurityUtils.sanitizeComponentProps(component);
            });
        }

        // Create new portfolio data structure
        const newPortfolioData = {
            content: templateData.content || [],
            root: {
                props: {
                    title: template.name,
                    description: template.description,
                },
            },
        };

        console.log('Loading template:', templateKey, newPortfolioData);

        // Clear current portfolio ID since this is a new template
        setCurrentPortfolioId(null);

        // Update portfolio settings
        setPortfolioSettings({
            title: template.name,
            description: template.description,
            tags: [templateKey],
            seoTitle: template.name,
            seoDescription: template.description,
        });

        // Force a re-render by setting empty data first, then the template data
        setPortfolioData(initialData);

        // Use setTimeout to ensure the empty state is rendered before setting new data
        setTimeout(() => {
            setPortfolioData(newPortfolioData);
            setRenderKey((prev) => prev + 1); // Force Puck to completely re-render
            console.log('Template data set:', newPortfolioData);
        }, 50);

        return { success: true, template: template };
    } catch (error) {
        console.error('Error loading template:', error);
        throw error;
    }
};

// Validate if template exists
export const isValidTemplate = (templateKey) => {
    return TEMPLATE_PRESETS.hasOwnProperty(templateKey);
};

// Get template list for selection
export const getTemplateList = () => {
    return Object.entries(TEMPLATE_PRESETS).map(([key, template]) => ({
        key,
        name: template.name,
        description: template.description,
        preview: template.preview,
        componentCount: template.content?.length || 0,
    }));
};

// 🔒 SECURITY: Comprehensive template validation
export const validateTemplatesSecurity = () => {
    const securityIssues = [];

    Object.entries(TEMPLATE_PRESETS).forEach(([templateKey, template]) => {
        const templateIssues = {
            templateKey,
            templateName: template.name,
            issues: [],
        };

        // Check template preview URL
        if (template.preview && !SecurityUtils.sanitizeImageUrl(template.preview).startsWith('https://placehold.co')) {
            if (template.preview !== SecurityUtils.sanitizeImageUrl(template.preview)) {
                templateIssues.issues.push({
                    type: 'BLOCKED_PREVIEW_URL',
                    field: 'preview',
                    original: template.preview,
                    sanitized: SecurityUtils.sanitizeImageUrl(template.preview),
                });
            }
        }

        // Check all components in the template
        if (template.content && Array.isArray(template.content)) {
            template.content.forEach((component, index) => {
                if (component.props) {
                    // Check all properties for potential external links
                    Object.entries(component.props).forEach(([propKey, propValue]) => {
                        if (typeof propValue === 'string') {
                            // Check URLs
                            if (propKey.includes('url') || propKey.includes('link') || propKey.includes('href')) {
                                const sanitizedUrl = SecurityUtils.sanitizeUrl(propValue);
                                if (propValue !== sanitizedUrl) {
                                    templateIssues.issues.push({
                                        type: 'BLOCKED_EXTERNAL_LINK',
                                        component: `${component.type}[${index}]`,
                                        field: propKey,
                                        original: propValue,
                                        sanitized: sanitizedUrl,
                                    });
                                }
                            }
                            // Check images
                            else if (propKey.includes('image') || propKey.includes('avatar') || propKey.includes('logo')) {
                                const sanitizedImage = SecurityUtils.sanitizeImageUrl(propValue);
                                if (propValue !== sanitizedImage && !propValue.startsWith('https://placehold.co')) {
                                    templateIssues.issues.push({
                                        type: 'BLOCKED_EXTERNAL_IMAGE',
                                        component: `${component.type}[${index}]`,
                                        field: propKey,
                                        original: propValue,
                                        sanitized: sanitizedImage,
                                    });
                                }
                            }
                        }
                        // Check nested objects (like projects array)
                        else if (Array.isArray(propValue)) {
                            propValue.forEach((item, itemIndex) => {
                                if (item && typeof item === 'object') {
                                    Object.entries(item).forEach(([itemKey, itemValue]) => {
                                        if (typeof itemValue === 'string') {
                                            if (itemKey.includes('url') || itemKey.includes('link') || itemKey.includes('href')) {
                                                const sanitizedUrl = SecurityUtils.sanitizeUrl(itemValue);
                                                if (itemValue !== sanitizedUrl) {
                                                    templateIssues.issues.push({
                                                        type: 'BLOCKED_EXTERNAL_LINK_IN_ARRAY',
                                                        component: `${component.type}[${index}].${propKey}[${itemIndex}]`,
                                                        field: itemKey,
                                                        original: itemValue,
                                                        sanitized: sanitizedUrl,
                                                    });
                                                }
                                            } else if (itemKey.includes('image') || itemKey.includes('avatar') || itemKey.includes('logo')) {
                                                const sanitizedImage = SecurityUtils.sanitizeImageUrl(itemValue);
                                                if (itemValue !== sanitizedImage && !itemValue.startsWith('https://placehold.co')) {
                                                    templateIssues.issues.push({
                                                        type: 'BLOCKED_EXTERNAL_IMAGE_IN_ARRAY',
                                                        component: `${component.type}[${index}].${propKey}[${itemIndex}]`,
                                                        field: itemKey,
                                                        original: itemValue,
                                                        sanitized: sanitizedImage,
                                                    });
                                                }
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        if (templateIssues.issues.length > 0) {
            securityIssues.push(templateIssues);
        }
    });

    // Log security validation results
    if (securityIssues.length === 0) {
        console.log('🔒 SECURITY: All templates passed security validation ✅');
    } else {
        console.warn('🔒 SECURITY: Found potential security issues in templates:');
        securityIssues.forEach((template) => {
            console.warn(`\n📋 Template: ${template.templateName} (${template.templateKey})`);
            template.issues.forEach((issue) => {
                console.warn(`  ⚠️  ${issue.type}:`);
                console.warn(`      Component: ${issue.component || 'root'}`);
                console.warn(`      Field: ${issue.field}`);
                console.warn(`      Original: ${issue.original}`);
                console.warn(`      Sanitized: ${issue.sanitized}`);
            });
        });
        console.warn('\n🔒 Note: These issues will be automatically sanitized when templates are loaded.');
    }

    return securityIssues;
};

// 🔒 SECURITY: Auto-run security validation in development
if (process.env.NODE_ENV === 'development') {
    // Run validation after a short delay to ensure all templates are loaded
    setTimeout(() => {
        validateTemplatesSecurity();
    }, 1000);
}
