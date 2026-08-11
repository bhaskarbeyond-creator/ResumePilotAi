import React, { useState, useContext, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Puck } from '@measured/puck';
import '@measured/puck/dist/index.css';
import { AuthContext } from '../../main';
import { publishPortfolio, updateExistingPortfolio, savePortfolioDraft, getUserPortfolios, updatePortfolioVisibility, deletePortfolio, getPortfolioById } from '../../firestore/dbOperations';
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
    GridLayoutCategory,
    GridItemCategory,
    FlexLayoutCategory,
    FlexItemCategory,
    LayoutCategory,
} from './PortfolioComponents';
import HomepageFooter from '../Dashboard2/elements/HomepageFooter';
import TemplateSelector from './TemplateSelector';
import { SecurityUtils, loadTemplate } from './templateUtils';
import Toasts from '../Toasts/Toats';

// Define the component categories with enhanced template selection and descriptions
const config = {
    categories: {
        // layout: {
        //     title: '🏗️ Layout & Structure',
        //     description: 'Organize your content with flexible layouts',
        //     components: ['Layout', 'GridLayout', 'GridItem', 'FlexLayout', 'FlexItem'],
        //     expanded: true, // Show this category expanded by default
        // },
        content: {
            title: '📝 Content Sections',
            description: 'Essential sections for your portfolio',
            components: ['Hero', 'About', 'Skills', 'Experience', 'Education', 'Projects', 'Services', 'Testimonials', 'Resume', 'Awards'],
        },
        navigation: {
            title: '🧭 Navigation & Contact',
            description: 'Navigation and communication elements',
            components: ['Navbar', 'Footer', 'Contact'],
        },
    },

    components: {
        // Layout Components - COMMENTED OUT
        // Layout: {
        //     ...LayoutCategory,
        //     label: 'Section Layout',
        //     description: 'Create structured sections with different layouts',
        // },
        // GridLayout: {
        //     ...GridLayoutCategory,
        //     label: 'Grid Container',
        //     description: 'Responsive grid system for organizing content',
        // },
        // GridItem: {
        //     ...GridItemCategory,
        //     label: 'Grid Item',
        //     description: 'Individual items within a grid layout',
        // },
        // FlexLayout: {
        //     ...FlexLayoutCategory,
        //     label: 'Flex Container',
        //     description: 'Flexible layout container for dynamic arrangements',
        // },
        // FlexItem: {
        //     ...FlexItemCategory,
        //     label: 'Flex Item',
        //     description: 'Individual items within a flex layout',
        // },

        // Content Components with enhanced descriptions
        Navbar: {
            ...NavbarCategory,
            label: 'Navigation Bar',
            description: 'Site navigation with customizable styles',
        },
        Hero: {
            ...HeroCategory,
            label: 'Hero Section',
            description: 'Eye-catching introduction with your name and tagline',
        },
        About: {
            ...AboutCategory,
            label: 'About Me',
            description: 'Personal introduction and professional summary',
        },
        Skills: {
            ...SkillsCategory,
            label: 'Skills & Expertise',
            description: 'Showcase your technical and professional skills',
        },
        Experience: {
            ...ExperienceCategory,
            label: 'Work Experience',
            description: 'Professional work history and achievements',
        },
        Education: {
            ...EducationCategory,
            label: 'Education',
            description: 'Academic background and certifications',
        },
        Projects: {
            ...ProjectsCategory,
            label: 'Projects Portfolio',
            description: 'Showcase your best work and projects',
        },
        Testimonials: {
            ...TestimonialsCategory,
            label: 'Client Testimonials',
            description: 'Reviews and feedback from clients',
        },
        Resume: {
            ...ResumeCategory,
            label: 'Resume Download',
            description: 'Downloadable resume with preview',
        },
        Awards: {
            ...AwardsCategory,
            label: 'Awards & Recognition',
            description: 'Honors and achievements received',
        },
        Contact: {
            ...ContactCategory,
            label: 'Contact Information',
            description: 'Ways for visitors to get in touch',
        },
        Footer: {
            ...FooterCategory,
            label: 'Footer Section',
            description: 'Page footer with links and information',
        },
    },

    root: {
        fields: {
            title: {
                type: 'text',
                label: 'Portfolio Title',
                description: 'The main title of your portfolio',
            },
            description: {
                type: 'textarea',
                label: 'Portfolio Description',
                description: 'Brief description of your portfolio (used for SEO)',
            },
        },
        render: ({ children }) => (
            <div className="portfolio-container">
                {children?.length === 0 && (
                    <div className="empty-state p-12 text-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                        <div className="max-w-md mx-auto">
                            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1}
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                            </svg>
                            <h3 className="mt-2 text-lg font-medium text-gray-900">Start Building Your Portfolio</h3>
                            <p className="mt-1 text-sm text-gray-500">Choose a professional template or drag components from the left panel to begin</p>
                            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={() => setShowTemplateSelector(true)}
                                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-sm">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                        />
                                    </svg>
                                    Choose Template
                                </button>
                                <span className="text-sm text-gray-400 self-center">or</span>
                                <span className="text-sm text-gray-500 self-center">Drag components manually</span>
                            </div>
                            <div className="mt-6">
                                <div className="text-xs text-gray-400 space-y-1">
                                    <p>
                                        🎨 <strong>Templates:</strong> Dark Cyber, Terminal, Artist, and Cybersecurity themes
                                    </p>
                                    <p>
                                        🏗️ <strong>Manual:</strong> Start with Layout components to structure your page
                                    </p>
                                    <p>📝 Then add content sections like Hero, About, and Projects</p>
                                    <p>🧭 Finish with navigation components like Navbar and Footer</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {children}
            </div>
        ),
    },
};

// Initial data for the portfolio - Start with empty canvas
const initialData = {
    content: [], // Empty content array for clean start
    root: {
        props: {
            title: 'My Portfolio',
            description: 'Welcome to my professional portfolio',
        },
    },
};

const PortfolioBuilder = () => {
    const user = useContext(AuthContext);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [portfolioData, setPortfolioData] = useState(initialData);
    const [currentPortfolioId, setCurrentPortfolioId] = useState(null);
    const [userPortfolios, setUserPortfolios] = useState([]);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);
    const [loadingPortfolios, setLoadingPortfolios] = useState(false);
    const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
    const [showTemplateSelector, setShowTemplateSelector] = useState(false);
    const [renderKey, setRenderKey] = useState(0);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [templateNotification, setTemplateNotification] = useState(null);
    const [isLoadingFromURL, setIsLoadingFromURL] = useState(false);
    const [portfolioSettings, setPortfolioSettings] = useState({
        title: 'My Portfolio',
        description: 'Welcome to my professional portfolio',
        tags: [],
        seoTitle: '',
        seoDescription: '',
    });

    // Toast notification state
    const [toast, setToast] = useState({ show: false, type: '', message: '' });

    // Confirmation modal state
    const [confirmModal, setConfirmModal] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
    });

    // Publish success modal state
    const [publishSuccessModal, setPublishSuccessModal] = useState({
        show: false,
        isNewlyPublished: false,
        portfolioUrl: '',
        portfolioTitle: '',
    });

    // Redirect to home if not logged in
    useEffect(() => {
        if (user === null) {
            // User is not logged in, redirect to home page
            navigate('/', {
                replace: true,
                state: {
                    message: 'Please log in to access the Portfolio Builder',
                    showAuth: true,
                },
            });
        }
    }, [user, navigate]);

    // Show loading while checking auth state
    if (user === null) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 font-medium">Checking authentication...</p>
                </div>
            </div>
        );
    }

    // Show toast notification
    const showToast = (type, customMessage = '') => {
        setToast({ show: true, type, message: customMessage });
        setTimeout(() => {
            setToast({ show: false, type: '', message: '' });
        }, 4000);
    };

    // Show confirmation modal
    const showConfirmModal = (title, message, onConfirm, confirmText = 'Confirm', cancelText = 'Cancel') => {
        setConfirmModal({
            show: true,
            title,
            message,
            onConfirm,
            confirmText,
            cancelText,
        });
    };

    // Hide confirmation modal
    const hideConfirmModal = () => {
        setConfirmModal({
            show: false,
            title: '',
            message: '',
            onConfirm: null,
            confirmText: 'Confirm',
            cancelText: 'Cancel',
        });
    };

    // Hide publish success modal
    const hidePublishSuccessModal = () => {
        setPublishSuccessModal({
            show: false,
            isNewlyPublished: false,
            portfolioUrl: '',
            portfolioTitle: '',
        });
    };

    useEffect(() => {
        if (user) {
            // Check for edit parameter in URL first
            const editPortfolioId = searchParams.get('edit');

            if (editPortfolioId) {
                // If there's an edit parameter, load that specific portfolio
                checkForEditParameter();
            } else {
                // If no edit parameter, show template selector directly
                // This avoids potential database indexing errors when user has no portfolios
                setShowTemplateSelector(true);
            }
        }
    }, [user]);

    // Check for edit parameter in URL and automatically load portfolio
    const checkForEditParameter = async () => {
        const editPortfolioId = searchParams.get('edit');
        if (editPortfolioId && user) {
            setIsLoadingFromURL(true);
            try {
                await handleLoadPortfolio(editPortfolioId);
                setSearchParams({});
            } catch (error) {
                showToast('Error', 'Error loading the specified portfolio: ' + error.message);
                setSearchParams({});
            } finally {
                setIsLoadingFromURL(false);
            }
        }
    };

    // Cleanup debounce timeout on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, []);

    const checkShowWelcomeGuide = async () => {
        try {
            // Don't show welcome guide if we're loading a portfolio from URL
            const editPortfolioId = searchParams.get('edit');
            if (editPortfolioId) {
                return;
            }

            const portfolios = await getUserPortfolios(user.uid);
            if (portfolios.length === 0 && !localStorage.getItem('portfolioBuilderWelcomeSeen')) {
                setShowWelcomeGuide(true);
            }
        } catch (error) {
            // Silent error handling for welcome guide check
        }
    };

    const handleWelcomeGuideDismiss = () => {
        setShowWelcomeGuide(false);
        localStorage.setItem('portfolioBuilderWelcomeSeen', 'true');
    };

    const loadUserPortfolios = async () => {
        try {
            setLoadingPortfolios(true);
            const portfolios = await getUserPortfolios(user.uid);
            setUserPortfolios(portfolios);
        } catch (error) {
            if (error.message.includes('requires an index')) {
                setUserPortfolios([]);
            } else {
                showToast('Error', 'Error loading your portfolios: ' + error.message);
            }
        } finally {
            setLoadingPortfolios(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!user) {
            showToast('Error', 'Please log in to save your portfolio');
            return;
        }

        setIsSaving(true);
        try {
            // Create a deep copy of portfolioData to avoid mutations
            const portfolioDataToSave = JSON.parse(JSON.stringify(portfolioData));

            // Sanitize all component data before saving
            if (portfolioDataToSave.content) {
                portfolioDataToSave.content = portfolioDataToSave.content.map((component) => {
                    // Apply comprehensive security sanitization
                    const sanitizedComponent = SecurityUtils.sanitizeComponentProps(component);

                    // Ensure each component has an id and props
                    if (!sanitizedComponent.props) {
                        sanitizedComponent.props = {};
                    }
                    if (!sanitizedComponent.props.id) {
                        sanitizedComponent.props.id = `${sanitizedComponent.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    }
                    return sanitizedComponent;
                });
            }

            // Extract title and description from root props
            const rootTitle = portfolioDataToSave.root?.props?.title || 'My Portfolio';
            const rootDescription = portfolioDataToSave.root?.props?.description || '';

            // 🔒 SECURITY: Sanitize portfolio settings
            const sanitizedSettings = {
                title: SecurityUtils.sanitizeText(rootTitle),
                description: SecurityUtils.sanitizeText(rootDescription),
                tags: Array.isArray(portfolioSettings.tags) ? portfolioSettings.tags.map((tag) => SecurityUtils.sanitizeText(tag)).filter((tag) => tag.length > 0) : [],
                seoTitle: SecurityUtils.sanitizeText(portfolioSettings.seoTitle),
                seoDescription: SecurityUtils.sanitizeText(portfolioSettings.seoDescription),
            };

            // Merge portfolio settings properly without overwriting component data
            const dataToSave = {
                ...portfolioDataToSave,
                ...sanitizedSettings,
            };

            const result = await savePortfolioDraft(user.uid, dataToSave, currentPortfolioId, 'default');

            if (!currentPortfolioId) {
                setCurrentPortfolioId(result.id);
            }

            await loadUserPortfolios();
            showToast('Success');
        } catch (error) {
            showToast('Error', 'Error saving portfolio draft: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!user) {
            showToast('Error', 'Please log in to publish your portfolio');
            return;
        }

        // Extract title from root props
        const rootTitle = portfolioData.root?.props?.title || 'My Portfolio';
        const sanitizedTitle = SecurityUtils.sanitizeText(rootTitle);
        if (!sanitizedTitle.trim()) {
            showToast('Error', 'Please enter a valid title for your portfolio');
            return;
        }

        setIsPublishing(true);
        try {
            // Create a deep copy of portfolioData to avoid mutations
            const portfolioDataToPublish = JSON.parse(JSON.stringify(portfolioData));

            // 🔒 SECURITY: Sanitize all component data before publishing
            if (portfolioDataToPublish.content) {
                portfolioDataToPublish.content = portfolioDataToPublish.content.map((component) => {
                    // Apply comprehensive security sanitization
                    let sanitizedComponent = SecurityUtils.sanitizeComponentProps(component);

                    // Ensure each component has proper structure
                    if (!sanitizedComponent.props) {
                        sanitizedComponent.props = {};
                    }
                    if (!sanitizedComponent.props.id) {
                        sanitizedComponent.props.id = `${sanitizedComponent.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    }

                    // Ensure template is preserved for category components
                    if (!sanitizedComponent.props.template && sanitizedComponent.type) {
                        const defaultTemplates = {
                            Hero: 'classic',
                            About: 'traditional',
                            Skills: 'grid',
                            Experience: 'timeline',
                            Education: 'timeline',
                            Projects: 'grid',
                            Services: 'grid',
                            Testimonials: 'slider',
                            Resume: 'download',
                            Awards: 'list',
                            Contact: 'simple',
                            Navbar: 'horizontal',
                        };
                        if (defaultTemplates[sanitizedComponent.type]) {
                            sanitizedComponent.props.template = defaultTemplates[sanitizedComponent.type];
                        }
                    }

                    return sanitizedComponent;
                });
            }

            // Extract description from root props
            const rootDescription = portfolioDataToPublish.root?.props?.description || '';

            // 🔒 SECURITY: Sanitize portfolio settings
            const sanitizedSettings = {
                title: sanitizedTitle,
                description: SecurityUtils.sanitizeText(rootDescription),
                tags: Array.isArray(portfolioSettings.tags) ? portfolioSettings.tags.map((tag) => SecurityUtils.sanitizeText(tag)).filter((tag) => tag.length > 0) : [],
                seoTitle: SecurityUtils.sanitizeText(portfolioSettings.seoTitle),
                seoDescription: SecurityUtils.sanitizeText(portfolioSettings.seoDescription),
            };

            // Ensure root props are preserved and sanitized
            if (!portfolioDataToPublish.root) {
                portfolioDataToPublish.root = {
                    props: {
                        title: sanitizedSettings.title,
                    },
                };
            } else if (!portfolioDataToPublish.root.props) {
                portfolioDataToPublish.root.props = {
                    title: sanitizedSettings.title,
                };
            } else {
                portfolioDataToPublish.root.props.title = sanitizedSettings.title;
            }

            // Merge portfolio settings properly without overwriting component data
            const dataToPublish = {
                ...portfolioDataToPublish,
                ...sanitizedSettings,
            };

            let result;

            // Check if we have a current portfolio to update
            if (currentPortfolioId) {
                result = await updateExistingPortfolio(currentPortfolioId, user.uid, dataToPublish, 'default');
                const portfolioUrl = `${window.location.origin}/portfolio/${result.slug}`;

                // Show success modal instead of toast
                setPublishSuccessModal({
                    show: true,
                    isNewlyPublished: result.isNewlyPublished,
                    portfolioUrl,
                    portfolioTitle: sanitizedSettings.title,
                });
            } else {
                result = await publishPortfolio(user.uid, dataToPublish, 'default');
                const portfolioUrl = `${window.location.origin}/portfolio/${result.slug}`;

                // Show success modal instead of toast
                setPublishSuccessModal({
                    show: true,
                    isNewlyPublished: true,
                    portfolioUrl,
                    portfolioTitle: sanitizedSettings.title,
                });

                // Set the current portfolio ID for future updates
                setCurrentPortfolioId(result.id);
            }

            await loadUserPortfolios();
        } catch (error) {
            showToast('Error', error.message || 'Error publishing portfolio');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleLoadPortfolio = async (portfolioId) => {
        try {
            const portfolio = await getPortfolioById(portfolioId);

            if (portfolio) {
                // Ensure the portfolio data has the correct structure for Puck
                let newPortfolioData = portfolio.data || initialData;

                // Deep clone to avoid reference issues
                newPortfolioData = JSON.parse(JSON.stringify(newPortfolioData));

                // Validate and fix the data structure if needed
                if (!newPortfolioData.content) {
                    newPortfolioData = JSON.parse(JSON.stringify(initialData));
                } else {
                    // Ensure each component has proper structure
                    newPortfolioData.content = newPortfolioData.content.map((component) => {
                        if (!component.props) {
                            component.props = {};
                        }
                        if (!component.props.id) {
                            component.props.id = `${component.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        }
                        return component;
                    });
                }

                if (!newPortfolioData.root) {
                    newPortfolioData.root = {
                        props: {
                            title: portfolio.title || 'My Portfolio',
                        },
                    };
                } else if (!newPortfolioData.root.props) {
                    newPortfolioData.root.props = {
                        title: portfolio.title || 'My Portfolio',
                    };
                }

                // Ensure root props are updated with portfolio title and description
                if (newPortfolioData.root && newPortfolioData.root.props) {
                    newPortfolioData.root.props.title = portfolio.title || 'My Portfolio';
                    newPortfolioData.root.props.description = portfolio.metadata?.description || portfolio.description || '';
                }

                setPortfolioData(newPortfolioData);
                setCurrentPortfolioId(portfolioId);
                setPortfolioSettings({
                    title: portfolio.title || 'My Portfolio',
                    description: portfolio.metadata?.description || portfolio.description || '',
                    tags: portfolio.metadata?.tags || portfolio.tags || [],
                    seoTitle: portfolio.metadata?.seoTitle || portfolio.seoTitle || '',
                    seoDescription: portfolio.metadata?.seoDescription || portfolio.seoDescription || '',
                });

                // Only close modal if it's open (when called from manage modal)
                if (showManageModal) {
                    setShowManageModal(false);
                }
            } else {
                showToast('Error', 'Portfolio not found');
            }
        } catch (error) {
            showToast('Error', 'Error loading portfolio: ' + error.message);
        }
    };

    const handleDeletePortfolio = async (portfolioId) => {
        showConfirmModal(
            'Delete Portfolio',
            'Are you sure you want to delete this portfolio? This action cannot be undone.',
            async () => {
                try {
                    await deletePortfolio(user.uid, portfolioId);
                    await loadUserPortfolios();
                    if (currentPortfolioId === portfolioId) {
                        setCurrentPortfolioId(null);
                        setPortfolioData(initialData);
                        setPortfolioSettings({
                            title: 'My Portfolio',
                            description: '',
                            tags: [],
                            seoTitle: '',
                            seoDescription: '',
                        });
                    }
                    showToast('Delete');
                    hideConfirmModal();
                } catch (error) {
                    showToast('Error', 'Error deleting portfolio');
                    hideConfirmModal();
                }
            },
            'Delete',
            'Cancel'
        );
    };

    const handleToggleVisibility = async (portfolioId, currentVisibility) => {
        try {
            await updatePortfolioVisibility(portfolioId, !currentVisibility);
            await loadUserPortfolios();
            showToast('Success');
        } catch (error) {
            showToast('Error', 'Error updating portfolio visibility');
        }
    };

    const handleNewPortfolio = () => {
        if (portfolioData.content.length > 0) {
            showConfirmModal(
                'Create New Portfolio',
                'Are you sure you want to start a new portfolio? Any unsaved changes will be lost.',
                () => {
                    const newPortfolioData = JSON.parse(JSON.stringify(initialData));
                    setCurrentPortfolioId(null);
                    setPortfolioData(newPortfolioData);
                    setRenderKey((prev) => prev + 1); // Force Puck to re-render
                    setPortfolioSettings({
                        title: 'My Portfolio',
                        description: 'Welcome to my professional portfolio',
                        tags: [],
                        seoTitle: '',
                        seoDescription: '',
                    });

                    showToast('Success');
                    hideConfirmModal();
                },
                'Create New',
                'Cancel'
            );
        } else {
            const newPortfolioData = JSON.parse(JSON.stringify(initialData));
            setCurrentPortfolioId(null);
            setPortfolioData(newPortfolioData);
            setRenderKey((prev) => prev + 1);
            setPortfolioSettings({
                title: 'My Portfolio',
                description: 'Welcome to my professional portfolio',
                tags: [],
                seoTitle: '',
                seoDescription: '',
            });

            showToast('Success');
        }
    };

    // Memoized values to prevent expensive recalculations
    const headerActionProps = useMemo(() => {
        return {
            hasContent: portfolioData.content && portfolioData.content.length > 0,
            currentTitle: portfolioData.root?.props?.title || 'My Portfolio',
            componentCount: portfolioData.content ? portfolioData.content.length : 0,
        };
    }, [portfolioData.content?.length, portfolioData.root?.props?.title]);

    // Enhanced custom header actions component with better UX
    const CustomHeaderActions = useCallback(
        ({ children }) => {
            const { hasContent, currentTitle, componentCount } = headerActionProps;

            return (
                <>
                    {user && (
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => navigate('/')}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                title="Back to Homepage">
                                <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                    />
                                </svg>
                                Home
                            </button>
                            <div className="hidden sm:flex items-center space-x-2 mr-2">
                                <span className="text-sm text-gray-600">{currentPortfolioId ? `Editing: ${currentTitle}` : hasContent ? 'New Portfolio' : 'Empty Canvas'}</span>
                                {hasContent && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {componentCount} component{componentCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowTemplateSelector(true)}
                                className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-sm"
                                title="Choose a portfolio template">
                                <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                </svg>
                                Templates
                            </button>
                            <button
                                onClick={handleNewPortfolio}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                title="Start a new portfolio">
                                <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                New
                            </button>
                            <button
                                onClick={() => {
                                    setShowManageModal(true);
                                    loadUserPortfolios(); // Load portfolios only when manage modal is opened
                                }}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                                title="Manage your portfolios">
                                <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                </svg>
                                Manage
                            </button>
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSaving || !hasContent}
                                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title={!hasContent ? 'Add components to save' : 'Save as draft'}>
                                {isSaving ? (
                                    <>
                                        <svg className="w-4 h-4 mr-1 inline animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                                            />
                                        </svg>
                                        Save Draft
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                    {children}
                </>
            );
        },
        [headerActionProps, currentPortfolioId, isSaving]
    );

    // Template Selection Functions
    const handleLoadTemplate = async (templateKey) => {
        try {
            setIsLoadingTemplate(true);

            // Close the template selector first
            setShowTemplateSelector(false);

            // Use the utility function to load the template
            const result = await loadTemplate(templateKey, initialData, setPortfolioData, setCurrentPortfolioId, setPortfolioSettings, setRenderKey);

            // Show success notification
            setTemplateNotification({
                type: 'success',
                message: `${result.template.name} template loaded successfully!`,
                description: 'You can now customize it and save as your portfolio.',
            });

            // Auto-hide notification after 4 seconds
            setTimeout(() => {
                setTemplateNotification(null);
            }, 4000);
        } catch (error) {
            setTemplateNotification({
                type: 'error',
                message: 'Error loading template',
                description: error.message,
            });

            // Auto-hide error notification after 5 seconds
            setTimeout(() => {
                setTemplateNotification(null);
            }, 5000);

            // If template loading fails, show template selector again
            setShowTemplateSelector(true);
        } finally {
            setIsLoadingTemplate(false);
        }
    };

    // Template selection now uses the imported TemplateSelector component

    // Create optimized onChange handler with smart debouncing
    const debounceTimeoutRef = useRef(null);
    const lastLogTimeRef = useRef(0);
    const lastDataRef = useRef(portfolioData);
    const isTypingRef = useRef(false);

    const handlePuckChange = useCallback((data) => {
        // Simple heuristic to detect typing vs structural changes
        const currentContentLength = data?.content?.length || 0;
        const lastContentLength = lastDataRef.current?.content?.length || 0;
        const isStructuralChange = currentContentLength !== lastContentLength;

        if (isStructuralChange) {
            // Structural changes (drag/drop, add/remove components) - update immediately
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            setPortfolioData(data);
            lastDataRef.current = data;
        } else {
            // Likely text editing - use debouncing to improve performance
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }

            debounceTimeoutRef.current = setTimeout(() => {
                setPortfolioData(data);
                lastDataRef.current = data;
            }, 100); // Short debounce for better responsiveness
        }
    }, []);

    return (
        <>
            <div className="min-h-screen bg-gray-50">
                {/* Portfolio Builder */}
                <Puck
                    key={`portfolio-${currentPortfolioId || 'new'}-${renderKey}`}
                    config={config}
                    data={portfolioData}
                    headerTitle="Portfolio Builder"
                    overrides={{
                        headerActions: CustomHeaderActions,
                    }}
                    onPublish={async (data) => {
                        if (data && data.content) {
                            setPortfolioData(data);
                            await handlePublish();
                        }
                    }}
                    onChange={handlePuckChange}
                />

                {/* Manage Portfolios Modal - Rendered as Portal */}
                {showManageModal &&
                    createPortal(
                        <div
                            className="fixed inset-0 overflow-y-auto"
                            style={{
                                zIndex: 99999,
                                backgroundColor: 'rgba(0,0,0,0.75)',
                            }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div
                                    className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                                    style={{
                                        zIndex: 100000,
                                        position: 'relative',
                                    }}>
                                    {/* Header */}
                                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center">
                                                <svg className="w-6 h-6 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                                    />
                                                </svg>
                                                <h3 className="text-xl font-semibold text-white">My Portfolios</h3>
                                            </div>
                                            <div className="flex items-center space-x-3">
                                                <button
                                                    onClick={loadUserPortfolios}
                                                    disabled={loadingPortfolios}
                                                    className="flex items-center px-3 py-1.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                                        />
                                                    </svg>
                                                    {loadingPortfolios ? 'Loading...' : 'Refresh'}
                                                </button>
                                                <button onClick={() => setShowManageModal(false)} className=" cursor-pointer text-white/80 hover:text-white transition-colors p-1">
                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto p-6">
                                        {loadingPortfolios ? (
                                            <div className="flex justify-center items-center py-16">
                                                <div className="text-center">
                                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                                    <p className="text-gray-600 font-medium">Loading portfolios...</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {userPortfolios.length > 0 ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        {userPortfolios.map((portfolio) => (
                                                            <div
                                                                key={portfolio.id}
                                                                className="group bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg hover:border-gray-300 transition-all duration-200">
                                                                {/* Portfolio Header */}
                                                                <div className="flex items-start justify-between mb-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <h4 className="font-semibold text-gray-900 text-lg truncate">{portfolio.title}</h4>
                                                                        <p className="text-sm text-gray-500 mt-1">Theme: {portfolio.theme || 'Default'}</p>
                                                                    </div>
                                                                    <div className="flex-shrink-0 ml-3">
                                                                        {portfolio.isPublished ? (
                                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                                                    <path
                                                                                        fillRule="evenodd"
                                                                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                                                        clipRule="evenodd"
                                                                                    />
                                                                                </svg>
                                                                                Published
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                                                    <path
                                                                                        fillRule="evenodd"
                                                                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                                                                        clipRule="evenodd"
                                                                                    />
                                                                                </svg>
                                                                                Draft
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Portfolio URL */}
                                                                {portfolio.isPublished && portfolio.slug && (
                                                                    <div className="mb-4 p-2 bg-blue-50 rounded-md">
                                                                        <p className="text-xs text-blue-600 font-mono break-all">/portfolio/{portfolio.slug}</p>
                                                                    </div>
                                                                )}

                                                                {/* Action Buttons */}
                                                                <div className="flex space-x-2">
                                                                    <button
                                                                        onClick={() => handleLoadPortfolio(portfolio.id)}
                                                                        className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors">
                                                                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                                strokeWidth={2}
                                                                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                                            />
                                                                        </svg>
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleToggleVisibility(portfolio.id, portfolio.isPublished)}
                                                                        className={`flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium border rounded-md transition-colors ${
                                                                            portfolio.isPublished
                                                                                ? 'text-yellow-700 bg-yellow-50 border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300'
                                                                                : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300'
                                                                        }`}>
                                                                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            {portfolio.isPublished ? (
                                                                                <path
                                                                                    strokeLinecap="round"
                                                                                    strokeLinejoin="round"
                                                                                    strokeWidth={2}
                                                                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                                                                                />
                                                                            ) : (
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            )}
                                                                        </svg>
                                                                        {portfolio.isPublished ? 'Hide' : 'Publish'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeletePortfolio(portfolio.id)}
                                                                        className="px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 hover:border-red-300 transition-colors">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                                strokeWidth={2}
                                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                            />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-16">
                                                        <div className="max-w-sm mx-auto">
                                                            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={1}
                                                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                                                />
                                                            </svg>
                                                            <h3 className="text-lg font-medium text-gray-900 mb-2">No portfolios yet</h3>
                                                            <p className="text-gray-500 mb-6">Create your first portfolio to get started!</p>
                                                            <button
                                                                onClick={() => {
                                                                    setShowManageModal(false);
                                                                    setShowTemplateSelector(true);
                                                                }}
                                                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-sm">
                                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                                </svg>
                                                                Create Portfolio
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Welcome Guide Modal */}
                {showWelcomeGuide &&
                    createPortal(
                        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl" style={{ zIndex: 100000 }}>
                                    <div className="px-6 py-4 border-b border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <div className="bg-blue-100 p-2 rounded-full mr-3">
                                                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-900">Welcome to Portfolio Builder! 🎉</h3>
                                            </div>
                                            <button onClick={handleWelcomeGuideDismiss} className="text-gray-400 hover:text-gray-600">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="px-6 py-6">
                                        <div className="mb-6">
                                            <p className="text-gray-600 mb-4">Create a stunning professional portfolio in minutes with our drag-and-drop builder!</p>
                                        </div>

                                        <div className="space-y-4 mb-6">
                                            <div className="flex items-start">
                                                <div className="bg-purple-50 p-2 rounded-full mr-4 mt-1">
                                                    <span className="text-purple-600 font-bold text-sm">1</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-1">🎨 Choose a Template</h4>
                                                    <p className="text-sm text-gray-600">
                                                        Start with a pre-designed template that matches your style - Dark Cyber, Terminal, Artist, or Cybersecurity themes.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-start">
                                                <div className="bg-blue-50 p-2 rounded-full mr-4 mt-1">
                                                    <span className="text-blue-600 font-bold text-sm">2</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-1">✏️ Customize Content</h4>
                                                    <p className="text-sm text-gray-600">Personalize the template with your information, projects, and experience using the right panel.</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start">
                                                <div className="bg-green-50 p-2 rounded-full mr-4 mt-1">
                                                    <span className="text-green-600 font-bold text-sm">3</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-1">🔧 Add More Components</h4>
                                                    <p className="text-sm text-gray-600">Drag additional components from the left panel to enhance your portfolio.</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start">
                                                <div className="bg-orange-50 p-2 rounded-full mr-4 mt-1">
                                                    <span className="text-orange-600 font-bold text-sm">4</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-gray-900 mb-1">🚀 Publish & Share</h4>
                                                    <p className="text-sm text-gray-600">Save drafts as you work, then publish to get a live URL to share with employers and clients.</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                                            <div className="flex items-center mb-2">
                                                <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                <h4 className="font-medium text-gray-900">Pro Tips</h4>
                                            </div>
                                            <ul className="text-sm text-gray-600 space-y-1">
                                                <li>• Click "Templates" to see professionally designed portfolio themes</li>
                                                <li>• Each template comes with matching components and content examples</li>
                                                <li>• All templates are fully customizable - change colors, text, and layout</li>
                                                <li>• You can switch between templates anytime (your content will be replaced)</li>
                                                <li>• Save frequently to avoid losing your work</li>
                                            </ul>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <button
                                                onClick={handleWelcomeGuideDismiss}
                                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                                                Skip Tutorial
                                            </button>
                                            <div className="flex space-x-3">
                                                <button
                                                    onClick={() => {
                                                        handleWelcomeGuideDismiss();
                                                        setShowTemplateSelector(true);
                                                    }}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 transition-colors">
                                                    Browse Templates 🎨
                                                </button>
                                                <button
                                                    onClick={handleWelcomeGuideDismiss}
                                                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 transition-colors">
                                                    Start Building 🚀
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Template Loading Overlay */}
                {isLoadingTemplate &&
                    createPortal(
                        <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div className="bg-white rounded-lg shadow-2xl p-8 text-center" style={{ zIndex: 100000 }}>
                                    <div className="flex flex-col items-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Template</h3>
                                        <p className="text-sm text-gray-600">Setting up your portfolio template...</p>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Portfolio Loading from URL Overlay */}
                {isLoadingFromURL &&
                    createPortal(
                        <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div className="bg-white rounded-lg shadow-2xl p-8 text-center" style={{ zIndex: 100000 }}>
                                    <div className="flex flex-col items-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Portfolio</h3>
                                        <p className="text-sm text-gray-600">Opening your portfolio for editing...</p>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Template Notification */}
                {templateNotification &&
                    createPortal(
                        <div className="fixed top-4 right-4" style={{ zIndex: 99999 }}>
                            <div
                                className={`max-w-sm w-full rounded-lg shadow-lg p-4 ${
                                    templateNotification.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                                }`}>
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        {templateNotification.type === 'success' ? (
                                            <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        ) : (
                                            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="ml-3 flex-1">
                                        <p className={`text-sm font-medium ${templateNotification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{templateNotification.message}</p>
                                        {templateNotification.description && (
                                            <p className={`text-sm mt-1 ${templateNotification.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{templateNotification.description}</p>
                                        )}
                                    </div>
                                    <div className="ml-4 flex-shrink-0">
                                        <button
                                            onClick={() => setTemplateNotification(null)}
                                            className={`rounded-md text-sm ${
                                                templateNotification.type === 'success' ? 'text-green-400 hover:text-green-600' : 'text-red-400 hover:text-red-600'
                                            } focus:outline-none`}>
                                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Template Selector Modal */}
                <TemplateSelector isVisible={showTemplateSelector} onClose={() => setShowTemplateSelector(false)} onSelectTemplate={handleLoadTemplate} isLoading={isLoadingTemplate} />

                {/* Toast Notifications */}
                {toast.show && (
                    <div className="fixed top-4 right-4 z-50">
                        <Toasts type={toast.type} message={toast.message} />
                    </div>
                )}

                {/* Publish Success Modal */}
                {publishSuccessModal.show &&
                    createPortal(
                        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" style={{ zIndex: 100000 }}>
                                    <div className="p-6">
                                        {/* Header with Success Icon */}
                                        <div className="flex items-center mb-6">
                                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-semibold text-gray-900">{publishSuccessModal.isNewlyPublished ? 'Portfolio Published!' : 'Portfolio Updated!'}</h3>
                                                <p className="text-sm text-gray-600 mt-1">Your portfolio is now live</p>
                                            </div>
                                        </div>

                                        {/* Portfolio Details */}
                                        <div className="mb-6">
                                            <div className="bg-gray-50 rounded-lg p-4">
                                                <h4 className="font-medium text-gray-900 mb-2">{publishSuccessModal.portfolioTitle}</h4>
                                                <p className="text-sm text-gray-600 mb-3">
                                                    {publishSuccessModal.isNewlyPublished
                                                        ? 'Your portfolio has been successfully published and is now accessible to everyone.'
                                                        : 'Your portfolio changes have been published and are now live.'}
                                                </p>
                                                <div className="flex items-center text-sm text-blue-600 bg-blue-50 rounded p-2">
                                                    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                                        />
                                                    </svg>
                                                    <span className="font-mono text-xs break-all">{publishSuccessModal.portfolioUrl}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex space-x-3">
                                            <button
                                                onClick={hidePublishSuccessModal}
                                                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                                                Continue Editing
                                            </button>
                                            <button
                                                onClick={() => window.open(publishSuccessModal.portfolioUrl, '_blank')}
                                                className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-blue-600 border border-transparent rounded-md hover:from-green-700 hover:to-blue-700 transition-all duration-200 shadow-sm">
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                    />
                                                </svg>
                                                View Live
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                {/* Confirmation Modal */}
                {confirmModal.show &&
                    createPortal(
                        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
                            <div className="flex items-center justify-center min-h-screen p-4">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" style={{ zIndex: 100000 }}>
                                    <div className="p-6">
                                        <div className="flex items-center mb-4">
                                            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
                                                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                                                    />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-900">{confirmModal.title}</h3>
                                        </div>
                                        <p className="text-gray-600 mb-6">{confirmModal.message}</p>
                                        <div className="flex space-x-3 justify-end">
                                            <button
                                                onClick={hideConfirmModal}
                                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                                                {confirmModal.cancelText}
                                            </button>
                                            <button
                                                onClick={confirmModal.onConfirm}
                                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 transition-colors">
                                                {confirmModal.confirmText}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
            </div>
        </>
    );
};

export default PortfolioBuilder;
