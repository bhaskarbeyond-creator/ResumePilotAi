import React, { Component } from 'react';
import conf from '../../../conf/configuration';
import logo from '../../../assets/logo/logo.png';
import { Analytics } from '../../Analytics';
import { Link } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import { BiArrowBack, BiCheck, BiLoader } from 'react-icons/bi';
import { AiOutlineRobot, AiOutlineEye, AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { BsGrid3X3Gap, BsList, BsFilter } from 'react-icons/bs';
import { FiSearch, FiStar, FiArrowLeft, FiArrowRight, FiDownload, FiHeart, FiX, FiZoomIn } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

// Resume template imports
import Cv1 from '../../../assets/resumesNew/Cv1.JPG';
import Cv2 from '../../../assets/resumesNew/Cv2.JPG';
import Cv3 from '../../../assets/resumesNew/Cv3.JPG';
import Cv4 from '../../../assets/resumesNew/Cv4.JPG';
import Cv5 from '../../../assets/resumesNew/Cv5.JPG';
import Cv6 from '../../../assets/resumesNew/Cv6.JPG';
import Cv7 from '../../../assets/resumesNew/Cv7.JPG';
import Cv8 from '../../../assets/resumesNew/Cv8.JPG';
import Cv9 from '../../../assets/resumesNew/Cv9.JPG';
import Cv10 from '../../../assets/resumesNew/Cv10.JPG';
import Cv11 from '../../../assets/resumesNew/Cv11.JPG';
import Cv12 from '../../../assets/resumesNew/Cv12.JPG';
import Cv13 from '../../../assets/resumesNew/Cv13.JPG';
import Cv14 from '../../../assets/resumesNew/Cv14.JPG';
import Cv15 from '../../../assets/resumesNew/Cv15.JPG';
import Cv16 from '../../../assets/resumesNew/Cv16.JPG';
import Cv17 from '../../../assets/resumesNew/Cv17.JPG';
import Cv18 from '../../../assets/resumesNew/Cv18.JPG';
import Cv19 from '../../../assets/resumesNew/Cv19.JPG';
import Cv20 from '../../../assets/resumesNew/Cv20.JPG';
import Cv21 from '../../../assets/resumesNew/Cv21.JPG';
import Cv22 from '../../../assets/resumesNew/Cv22.JPG';
import Cv23 from '../../../assets/resumesNew/Cv23.JPG';
import Cv24 from '../../../assets/resumesNew/Cv24.JPG';
import Cv25 from '../../../assets/resumesNew/Cv25.JPG';
import Cv26 from '../../../assets/resumesNew/Cv26.JPG';
import Cv27 from '../../../assets/resumesNew/Cv27.JPG';
import Cv28 from '../../../assets/resumesNew/Cv28.JPG';
import Cv29 from '../../../assets/resumesNew/Cv29.JPG';
import Cv30 from '../../../assets/resumesNew/Cv30.JPG';
import Cv31 from '../../../assets/resumesNew/Cv31.JPG';
import Cv32 from '../../../assets/resumesNew/Cv32.JPG';
import Cv33 from '../../../assets/resumesNew/Cv33.JPG';
import Cv34 from '../../../assets/resumesNew/Cv34.JPG';
import Cv35 from '../../../assets/resumesNew/Cv35.JPG';
import Cv36 from '../../../assets/resumesNew/Cv36.JPG';
import Cv37 from '../../../assets/resumesNew/Cv37.JPG';
import Cv38 from '../../../assets/resumesNew/Cv38.JPG';
import Cv39 from '../../../assets/resumesNew/Cv39.JPG';
import Cv40 from '../../../assets/resumesNew/Cv40.JPG';
import Cv41 from '../../../assets/resumesNew/Cv41.JPG';
import Cv42 from '../../../assets/resumesNew/Cv42.JPG';
import Cv43 from '../../../assets/resumesNew/Cv43.JPG';
import Cv44 from '../../../assets/resumesNew/Cv44.JPG';
import Cv45 from '../../../assets/resumesNew/Cv45.JPG';
import Cv46 from '../../../assets/resumesNew/Cv46.JPG';
import Cv47 from '../../../assets/resumesNew/Cv47.JPG';
import Cv48 from '../../../assets/resumesNew/Cv48.JPG';
import Cv49 from '../../../assets/resumesNew/Cv49.JPG';
import Cv50 from '../../../assets/resumesNew/Cv50.JPG';
import Cv51 from '../../../assets/resumesNew/CV51.JPG';

// Cover letter template imports
import Cover1 from '../../../assets/coversNew/Cover1.JPG';
import Cover2 from '../../../assets/coversNew/Cover2.JPG';
import Cover3 from '../../../assets/coversNew/Cover3.JPG';
import Cover4 from '../../../assets/coversNew/Cover4.JPG';

class ActionSelection extends Component {
    constructor(props) {
        super(props);
        this.state = {
            showAIModal: false,
            selectedTemplate: null,
            viewMode: 'grid',
            selectedCategory: 'all',
            searchTerm: '',
            previewTemplate: null,
            currentPage: 1,
            templatesPerPage: 8,
            favoriteTemplates: [],
            isLoading: false,
            showFilters: false,
            sortBy: 'popular', // popular, newest, name
            loadedTemplates: {}, // Track which templates have been loaded
        };

        this.toggleAIModal = this.toggleAIModal.bind(this);
        this.handleTemplateSelect = this.handleTemplateSelect.bind(this);
        this.toggleViewMode = this.toggleViewMode.bind(this);
        this.handleCategoryChange = this.handleCategoryChange.bind(this);
        this.handleResumeClick = this.handleResumeClick.bind(this);
        this.handleSearchChange = this.handleSearchChange.bind(this);
        this.toggleFavorite = this.toggleFavorite.bind(this);
        this.showTemplatePreview = this.showTemplatePreview.bind(this);
        this.closeTemplatePreview = this.closeTemplatePreview.bind(this);
        this.changePage = this.changePage.bind(this);

        var AnalyticsObject = Analytics;
        AnalyticsObject('Template-selection');
    }

    componentDidMount() {
        window.addEventListener('resize', this.handleResize);
        // Simulate initial loading
        this.setState({ isLoading: true });
        setTimeout(() => {
            this.setState({ isLoading: false });
            // Preload the images for the first page
            this.preloadCurrentPageImages();
        }, 1000);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.handleResize);
    }

    handleResize = () => {
        this.forceUpdate();
    };

    toggleAIModal() {
        this.setState({
            showAIModal: !this.state.showAIModal,
        });
    }

    handleTemplateSelect(templateId) {
        this.setState({ selectedTemplate: templateId });
    }

    handleResumeClick(resumeName) {
        this.setState({ selectedTemplate: resumeName, isLoading: true });

        // Simulate processing time
        setTimeout(() => {
            this.setState({ isLoading: false });
            this.props.changeResumeName(resumeName);

            if (this.props.currentStep === 'Template Selection' || this.props.currentStep === 'Action Cover Selection') {
                if (this.props.nextStep) {
                    this.props.nextStep();
                }
            } else {
                if (this.props.setFinalStep) {
                    this.props.setFinalStep();
                }
            }
        }, 1500);
    }

    handleSearchChange(e) {
        this.setState({ searchTerm: e.target.value, currentPage: 1 });
    }

    toggleViewMode() {
        this.setState((prevState) => ({
            viewMode: prevState.viewMode === 'grid' ? 'list' : 'grid',
        }));
    }

    handleCategoryChange(category) {
        this.setState({ selectedCategory: category, currentPage: 1 });
    }

    toggleFavorite(templateId) {
        this.setState((prevState) => {
            const favorites = [...prevState.favoriteTemplates];
            if (favorites.includes(templateId)) {
                return {
                    favoriteTemplates: favorites.filter((id) => id !== templateId),
                };
            } else {
                return { favoriteTemplates: [...favorites, templateId] };
            }
        });
    }

    showTemplatePreview(template) {
        this.setState({ previewTemplate: template });
    }

    closeTemplatePreview() {
        this.setState({ previewTemplate: null });
    }

    changePage(pageNumber) {
        this.setState({ currentPage: pageNumber }, () => {
            // Preload the images for the new page after state update
            this.preloadCurrentPageImages();
        });
        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    preloadCurrentPageImages() {
        const { currentPage, templatesPerPage } = this.state;
        const filteredTemplates = this.getFilteredTemplates();

        // Calculate the indices for the current page
        const indexOfLastTemplate = currentPage * templatesPerPage;
        const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage;

        // Get templates for the current page
        const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate);

        // Mark these templates as loaded in state
        const loadedTemplates = { ...this.state.loadedTemplates };
        currentTemplates.forEach((template) => {
            loadedTemplates[template.id] = true;
        });

        // Update state with newly loaded templates
        this.setState({ loadedTemplates });
    }

    getTemplates() {
        const { currentStep } = this.props;

        if (currentStep === 'Template Selection') {
            return [
                {
                    id: 'Cv1',
                    src: Cv1,
                    category: 'professional',
                    name: 'Professional Classic',
                    description: 'Clean and traditional design perfect for corporate environments',
                    popularity: 95,
                },
                {
                    id: 'Cv51',
                    src: Cv51,
                    category: 'professional',
                    name: 'Europass Executive Classic',
                    description: 'European standardized multi-page executive template',
                    popularity: 95,
                },  
                {
                    id: 'Cv2',
                    src: Cv2,
                    category: 'modern',
                    name: 'Modern Creative',
                    description: 'Contemporary layout with creative elements',
                    popularity: 88,
                },
                {
                    id: 'Cv6',
                    src: Cv6,
                    category: 'simple',
                    name: 'Simple Elegant',
                    description: 'Minimalist design focusing on content clarity',
                    popularity: 92,
                },
                {
                    id: 'Cv3',
                    src: Cv3,
                    category: 'creative',
                    name: 'Creative Bold',
                    description: 'Artistic template for creative professionals',
                    popularity: 85,
                },
                {
                    id: 'Cv4',
                    src: Cv4,
                    category: 'professional',
                    name: 'Executive Pro',
                    description: 'Sophisticated design for senior positions',
                    popularity: 90,
                },
                {
                    id: 'Cv5',
                    src: Cv5,
                    category: 'modern',
                    name: 'Tech Modern',
                    description: 'Modern template perfect for tech industry',
                    popularity: 87,
                },
                {
                    id: 'Cv7',
                    src: Cv7,
                    category: 'creative',
                    name: 'Designer Special',
                    description: 'Unique layout for design professionals',
                    popularity: 83,
                },
                {
                    id: 'Cv8',
                    src: Cv8,
                    category: 'simple',
                    name: 'Clean Simple',
                    description: 'Straightforward and professional',
                    popularity: 89,
                },
                {
                    id: 'Cv9',
                    src: Cv9,
                    category: 'professional',
                    name: 'Corporate Elite',
                    description: 'Premium corporate template',
                    popularity: 91,
                },
                {
                    id: 'Cv10',
                    src: Cv10,
                    category: 'modern',
                    name: 'Startup Ready',
                    description: 'Dynamic template for startup culture',
                    popularity: 86,
                },
                {
                    id: 'Cv11',
                    src: Cv11,
                    category: 'creative',
                    name: 'Creative Pro',
                    description: 'Professional creative template',
                    popularity: 84,
                },
                {
                    id: 'Cv12',
                    src: Cv12,
                    category: 'simple',
                    name: 'Minimal Pro',
                    description: 'Clean minimal professional design',
                    popularity: 88,
                },
                {
                    id: 'Cv13',
                    src: Cv13,
                    category: 'professional',
                    name: 'Business Classic',
                    description: 'Traditional business template',
                    popularity: 93,
                },
                {
                    id: 'Cv14',
                    src: Cv14,
                    category: 'modern',
                    name: 'Modern Edge',
                    description: 'Cutting-edge modern design',
                    popularity: 85,
                },
                {
                    id: 'Cv15',
                    src: Cv15,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv16',
                    src: Cv16,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv17',
                    src: Cv17,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv18',
                    src: Cv18,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv19',
                    src: Cv19,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv20',
                    src: Cv20,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv21',
                    src: Cv21,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv22',
                    src: Cv22,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv23',
                    src: Cv23,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv24',
                    src: Cv24,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv25',
                    src: Cv25,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv26',
                    src: Cv26,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv27',
                    src: Cv27,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv28',
                    src: Cv28,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv29',
                    src: Cv29,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv30',
                    src: Cv30,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv31',
                    src: Cv31,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv32',
                    src: Cv32,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv33',
                    src: Cv33,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv34',
                    src: Cv34,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv35',
                    src: Cv35,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv36',
                    src: Cv36,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv37',
                    src: Cv37,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv38',
                    src: Cv38,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv39',
                    src: Cv39,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv40',
                    src: Cv40,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv41',
                    src: Cv41,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv42',
                    src: Cv42,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv43',
                    src: Cv43,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv44',
                    src: Cv44,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv45',
                    src: Cv45,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv46',
                    src: Cv46,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv47',
                    src: Cv47,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv48',
                    src: Cv48,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv49',
                    src: Cv49,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },

                {
                    id: 'Cv50',
                    src: Cv50,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
                {
                    id: 'Cv51',
                    src: Cv51,
                    category: 'creative',
                    name: 'Artist Portfolio',
                    description: 'Perfect for creative portfolios',
                    popularity: 82,
                },
            ];
        } else if (currentStep === 'Action Cover Selection') {
            return [
                {
                    id: 'Cover1',
                    src: Cover1,
                    category: 'standard',
                    name: 'Standard Professional',
                    description: 'Classic cover letter format',
                    popularity: 94,
                },
                {
                    id: 'Cover2',
                    src: Cover2,
                    category: 'modern',
                    name: 'Modern Appeal',
                    description: 'Contemporary cover letter design',
                    popularity: 87,
                },
                {
                    id: 'Cover3',
                    src: Cover3,
                    category: 'standard',
                    name: 'Business Standard',
                    description: 'Traditional business format',
                    popularity: 91,
                },
                {
                    id: 'Cover4',
                    src: Cover4,
                    category: 'modern',
                    name: 'Creative Modern',
                    description: 'Modern creative cover letter',
                    popularity: 85,
                },
            ];
        }

        return [];
    }

    getCategories() {
        const { currentStep } = this.props;
        const templates = this.getTemplates();

        // Get all unique categories from templates
        const categories = [...new Set(templates.map((template) => template.category))];

        // Calculate counts for each category
        const categoryCounts = categories.reduce((acc, category) => {
            acc[category] = templates.filter((template) => template.category === category).length;
            return acc;
        }, {});

        // Create the category array with counts
        const result = [
            { id: 'all', name: 'All', count: templates.length },
            ...categories.map((category) => ({
                id: category,
                name: category.charAt(0).toUpperCase() + category.slice(1),
                count: categoryCounts[category],
            })),
        ];

        return result;
    }

    getFilteredTemplates() {
        const templates = this.getTemplates();
        const { searchTerm, selectedCategory, sortBy } = this.state;

        let filteredTemplates = templates;

        if (searchTerm) {
            filteredTemplates = filteredTemplates.filter(
                (template) =>
                    template.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    template.description.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (selectedCategory !== 'all') {
            filteredTemplates = filteredTemplates.filter((template) => template.category === selectedCategory);
        }

        // Sort templates
        if (sortBy === 'popular') {
            filteredTemplates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        } else if (sortBy === 'name') {
            filteredTemplates.sort((a, b) => a.name.localeCompare(b.name));
        }

        return filteredTemplates;
    }

    renderSkeletonCards() {
        return Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="bg-white/70 backdrop-blur-sm rounded-xl shadow-md border border-white/20 overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gradient-to-br from-[#694aff]/10 to-[#8e79ff]/10"></div>
                <div className="p-3 space-y-2">
                    <div className="h-3 bg-gradient-to-r from-[#694aff]/20 to-[#8e79ff]/20 rounded w-3/4"></div>
                    <div className="h-2 bg-gradient-to-r from-[#694aff]/15 to-[#8e79ff]/15 rounded w-full"></div>
                </div>
            </div>
        ));
    }

    renderPagination() {
        const filteredTemplates = this.getFilteredTemplates();
        const { currentPage, templatesPerPage } = this.state;
        const totalPages = Math.ceil(filteredTemplates.length / templatesPerPage);

        if (totalPages <= 1) return null;

        return (
            <div className="flex justify-center items-center mt-8 gap-2">
                <button
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white/70 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/90 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    onClick={() => this.changePage(currentPage - 1)}
                    disabled={currentPage === 1}>
                    <FiArrowLeft className="mr-1" size={14} />
                    {this.props.t('ActionSelection.pagination.prev')}
                </button>

                <div className="flex space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                            pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                            pageNumber = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                            pageNumber = totalPages - 4 + i;
                        } else {
                            pageNumber = currentPage - 2 + i;
                        }

                        return (
                            <button
                                key={pageNumber}
                                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                                    currentPage === pageNumber
                                        ? 'bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white shadow-md'
                                        : 'text-gray-700 bg-white/70 backdrop-blur-sm border border-white/20 hover:bg-white/90'
                                }`}
                                onClick={() => this.changePage(pageNumber)}>
                                {pageNumber}
                            </button>
                        );
                    })}
                </div>

                <button
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white/70 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/90 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    onClick={() => this.changePage(currentPage + 1)}
                    disabled={currentPage === totalPages}>
                    {this.props.t('ActionSelection.pagination.next')}
                    <FiArrowRight className="ml-1" size={14} />
                </button>
            </div>
        );
    }

    renderTemplatePreview() {
        const { previewTemplate } = this.state;
        if (!previewTemplate) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000 p-4" onClick={this.closeTemplatePreview}>
                <div className="bg-white/95 backdrop-blur-xl rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl border border-purple-200/30" onClick={(e) => e.stopPropagation()}>
                    {/* Compact Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200/50 bg-gradient-to-r from-purple-50/80 to-indigo-50/80">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 truncate">{previewTemplate.name || previewTemplate.id}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">{previewTemplate.category}</span>
                                <span className="text-xs text-gray-500">
                                    {previewTemplate.popularity}
                                    {this.props.t('ActionSelection.templateCards.popularity')}
                                </span>
                            </div>
                        </div>

                        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/70 rounded-lg transition-all" onClick={this.closeTemplatePreview}>
                            <FiX size={18} />
                        </button>
                    </div>

                    {/* Compact Preview */}
                    <div className="p-4">
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200/50 aspect-[3/4] max-h-[50vh]">
                            <LazyLoadImage
                                src={previewTemplate.src}
                                alt={previewTemplate.id}
                                effect="blur"
                                className="w-full h-full object-cover object-top"
                                threshold={200}
                                placeholderSrc="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
                            />
                        </div>
                    </div>

                    {/* Compact Footer */}
                    <div className="px-4 py-3 border-t border-gray-200/50 bg-gray-50/50">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-600 flex-1">{previewTemplate.description}</p>
                            <div className="flex gap-2 ml-4">
                                <button
                                    className="px-4 py-2 text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium transition-all"
                                    onClick={this.closeTemplatePreview}>
                                    {this.props.t('ActionSelection.preview.cancel')}
                                </button>
                                <button
                                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all"
                                    onClick={() => {
                                        this.handleResumeClick(previewTemplate.id);
                                        this.closeTemplatePreview();
                                    }}>
                                    {this.props.t('ActionSelection.preview.useTemplate')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    renderTemplateCard(template) {
        const { selectedTemplate, favoriteTemplates, viewMode } = this.state;
        const isSelected = selectedTemplate === template.id;
        const isFavorite = favoriteTemplates.includes(template.id);

        if (viewMode === 'list') {
            return (
                <div
                    key={template.id}
                    className={`flex items-center p-4 bg-white/70 backdrop-blur-sm rounded-xl shadow-md border cursor-pointer transition-all duration-300 hover:shadow-lg hover:bg-white/80 ${
                        isSelected ? 'border-[#694aff] bg-gradient-to-r from-[#694aff]/10 to-[#8e79ff]/10 shadow-lg' : 'border-white/20 hover:border-[#694aff]/30'
                    }`}>
                    <div className="flex-shrink-0 w-16 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg overflow-hidden shadow-sm">
                        <LazyLoadImage
                            src={template.src}
                            alt={template.name || template.id}
                            effect="blur"
                            className="w-full h-full object-cover"
                            threshold={100}
                            placeholderSrc="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
                        />
                    </div>

                    <div className="ml-4 flex-grow min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-gray-900 truncate">{template.name || template.id}</h3>
                            <span className="text-xs px-2 py-0.5 bg-[#694aff]/10 text-[#694aff] rounded-full border border-[#694aff]/20">{template.category}</span>
                            {template.popularity >= 90 && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{this.props.t('ActionSelection.templateCards.popular')}</span>}
                        </div>
                        <p className="text-sm text-gray-600 mb-2 line-clamp-1">{template.description}</p>
                        <div className="flex items-center text-xs text-gray-500">
                            <FiStar className="mr-1" size={12} />
                            {template.popularity || 85}%
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                        <button
                            className={`p-2 rounded-lg transition-all ${isFavorite ? 'text-red-500 bg-white/90' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                this.toggleFavorite(template.id);
                            }}>
                            {isFavorite ? <AiFillHeart size={16} /> : <AiOutlineHeart size={16} />}
                        </button>

                        <button
                            className="p-2 text-gray-400 hover:text-[#694aff] hover:bg-[#694aff]/10 rounded-lg transition-all"
                            onClick={(e) => {
                                e.stopPropagation();
                                this.showTemplatePreview(template);
                            }}>
                            <FiZoomIn size={16} />
                        </button>

                        <button
                            className="px-4 py-2 bg-gradient-to-r from-[#694aff] to-[#8e79ff] hover:from-[#5a3fd6] hover:to-[#7d6bff] text-white rounded-lg text-sm font-medium transition-all"
                            onClick={() => this.handleResumeClick(template.id)}>
                            {this.props.t('ActionSelection.templateCards.select')}
                        </button>

                        {isSelected && (
                            <div className="p-2 bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white rounded-lg">
                                <BiCheck size={16} />
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Compact Grid Card
        return (
            <div
                key={template.id}
                className={`group relative z-10 bg-white/70 backdrop-blur-sm rounded-xl shadow-md border border-white/20 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:bg-white/80 ${
                    isSelected ? 'ring-2 ring-[#694aff] ring-offset-2 ring-offset-white/50 shadow-lg' : ''
                }`}>
                {/* Compact Badges */}
                <div className="absolute top-2 left-2 z-10 flex gap-1">
                    {template.popularity >= 90 && <span className="text-xs px-2 py-1 bg-amber-400/90 text-white rounded-lg font-medium">Popular</span>}
                </div>

                {/* Compact Action Buttons */}
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button
                        className={`p-1.5 rounded-lg backdrop-blur-sm transition-all ${isFavorite ? 'text-red-500 bg-white/90' : 'text-gray-600 bg-white/70 hover:bg-white/90 hover:text-red-500'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            this.toggleFavorite(template.id);
                        }}>
                        {isFavorite ? <AiFillHeart size={14} /> : <AiOutlineHeart size={14} />}
                    </button>

                    <button
                        className="p-1.5 rounded-lg backdrop-blur-sm bg-white/70 hover:bg-white/90 text-gray-600 hover:text-[#694aff] transition-all"
                        onClick={(e) => {
                            e.stopPropagation();
                            this.showTemplatePreview(template);
                        }}>
                        <FiZoomIn size={14} />
                    </button>
                </div>

                {/* Template Image */}
                <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden">
                    <LazyLoadImage
                        src={template.src}
                        alt={template.name || template.id}
                        effect="blur"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onClick={() => this.handleResumeClick(template.id)}
                        threshold={200}
                        placeholderSrc="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
                        visibleByDefault={this.state.loadedTemplates[template.id] || false}
                    />
                </div>

                {/* Compact Template Info */}
                <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex flex-col min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{template.name || template.id}</h3>
                            <span className="text-[11px] font-bold text-[#694aff] tracking-wider uppercase mt-0.5">
                                (CV #{template.id.replace(/^Cv/i, '')})
                            </span>
                        </div>
                        {isSelected && (
                            <div className="p-1 bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white rounded-lg ml-2">
                                <BiCheck size={14} />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-1 bg-[#694aff]/10 text-[#694aff] rounded-full">{template.category}</span>
                        <div className="flex items-center text-gray-500">
                            <FiStar className="mr-1" size={10} />
                            {template.popularity || 85}%
                        </div>
                    </div>

                    {/* Compact Select Button */}
                    <button
                        className="w-full mt-3 py-2 bg-gradient-to-r from-[#694aff] to-[#8e79ff] hover:from-[#5a3fd6] hover:to-[#7d6bff] text-white text-xs font-medium rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            this.handleResumeClick(template.id);
                        }}>
                        {this.props.t('ActionSelection.templateCards.selectTemplate')}
                    </button>
                </div>
            </div>
        );
    }

    renderHeading() {
        const { t, currentStep } = this.props;

        if (currentStep === 'Template Selection') {
            return (
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                        {this.props.t('ActionSelection.templateHeading')}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#694aff] to-[#8e79ff] ml-3">{this.props.t('ActionSelection.templateHeadingSpan')}</span>
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">{this.props.t('ActionSelection.templateDescription')}</p>
                </div>
            );
        } else if (currentStep === 'Action Cover Selection') {
            return (
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                        {this.props.t('ActionSelection.coverLetterHeading')}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#694aff] to-[#8e79ff] ml-3">{this.props.t('ActionSelection.coverLetterHeadingSpan')}</span>
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">{this.props.t('ActionSelection.coverLetterDescription')}</p>
                </div>
            );
        }

        return null;
    }

    render() {
        const { t } = this.props;
        const { selectedCategory, viewMode, selectedTemplate, searchTerm, currentPage, templatesPerPage, isLoading, showFilters, sortBy } = this.state;

        const filteredTemplates = this.getFilteredTemplates();
        const categories = this.getCategories();

        // Pagination
        const indexOfLastTemplate = currentPage * templatesPerPage;
        const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage;
        const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate);

        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-[#694aff]/5 relative overflow-hidden">
                {/* Background Elements */}
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#694aff]/8 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#8e79ff]/8 rounded-full blur-3xl" />

                <div className="relative z-[1000]">
                    {/* Header */}
                    <HomepageNavbar authBtnHandler={this.props.authBtnHandler} user={this.props.user} logout={this.props.logout} />
                </div>

                {/* Main Content */}
                <main className="relative z-100 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16">
                    <div>
                        {/* Hero Section */}
                        {this.renderHeading()}

                        {/* Compact Search and Filters */}
                        <div className="bg-white/80 backdrop-blur-xl rounded-xl shadow-lg border border-white/30 p-4 mb-6">
                            <div className="flex flex-col lg:flex-row gap-4">
                                {/* Search */}
                                <div className="flex-1">
                                    <div className="relative">
                                        <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-2.5 border border-white/30 rounded-lg focus:ring-2 focus:ring-[#694aff] focus:border-[#694aff] transition-all bg-white/70 backdrop-blur-sm text-sm"
                                            placeholder={`${this.props.t(
                                                this.props.currentStep === 'Template Selection' ? 'ActionSelection.search.searchTemplates' : 'ActionSelection.search.searchCoverLetters'
                                            )}`}
                                            value={searchTerm}
                                            onChange={this.handleSearchChange}
                                        />
                                    </div>
                                </div>

                                {/* Categories - Compact Pills */}
                                <div className="flex items-center gap-2 overflow-x-auto">
                                    {categories.map((category) => (
                                        <button
                                            key={category.id}
                                            onClick={() => this.handleCategoryChange(category.id)}
                                            className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                selectedCategory === category.id
                                                    ? 'bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white shadow-md'
                                                    : 'bg-white/70 text-gray-700 hover:bg-white/90 border border-white/30'
                                            }`}>
                                            {category.name} ({category.count})
                                        </button>
                                    ))}
                                </div>

                                {/* Compact Controls */}
                                <div className="flex items-center gap-2">
                                    {/* Sort */}
                                    <select
                                        value={sortBy}
                                        onChange={(e) => this.setState({ sortBy: e.target.value })}
                                        className="px-3 py-2 border border-white/30 rounded-lg text-xs focus:ring-2 focus:ring-[#694aff] focus:border-[#694aff] bg-white/70 backdrop-blur-sm">
                                        <option value="popular">{this.props.t('ActionSelection.sortBy.popular')}</option>
                                        <option value="name">{this.props.t('ActionSelection.sortBy.name')}</option>
                                        <option value="newest">{this.props.t('ActionSelection.sortBy.newest')}</option>
                                    </select>

                                    {/* View Mode */}
                                    <div className="flex bg-white/70 backdrop-blur-sm rounded-lg p-0.5 border border-white/30">
                                        <button
                                            onClick={() => this.setState({ viewMode: 'grid' })}
                                            className={`p-2 rounded-md transition-all ${
                                                viewMode === 'grid' ? 'bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                            }`}>
                                            <BsGrid3X3Gap size={14} />
                                        </button>
                                        <button
                                            onClick={() => this.setState({ viewMode: 'list' })}
                                            className={`p-2 rounded-md transition-all ${
                                                viewMode === 'list' ? 'bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                            }`}>
                                            <BsList size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Compact Results Info */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                            <div>
                                <p className="text-sm text-gray-600">
                                    {filteredTemplates.length} {this.props.t('ActionSelection.search.resultsInfo')} {currentTemplates.length} {this.props.t('ActionSelection.search.resultsCount')}
                                </p>
                            </div>

                            {selectedTemplate && (
                                <div className="flex items-center px-3 py-1.5 bg-gradient-to-r from-[#694aff]/10 to-[#8e79ff]/10 border border-[#694aff]/20 rounded-lg backdrop-blur-sm">
                                    <BiCheck className="mr-1.5 text-[#694aff]" size={16} />
                                    <span className="text-xs text-[#694aff] font-medium">
                                        "{selectedTemplate}" {this.props.t('ActionSelection.search.selectedTemplate')}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Templates Grid/List */}
                        {isLoading ? (
                            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>{this.renderSkeletonCards()}</div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-gray-400 mb-3">
                                    <FiSearch size={48} className="mx-auto" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{this.props.t('ActionSelection.search.noTemplatesFound')}</h3>
                                <p className="text-gray-600 max-w-md mx-auto text-sm">{this.props.t('ActionSelection.search.noTemplatesFoundDescription')}</p>
                                <button
                                    onClick={() => this.setState({ searchTerm: '', selectedCategory: 'all' })}
                                    className="mt-3 px-4 py-2 bg-gradient-to-r from-[#694aff] to-[#8e79ff] text-white rounded-lg hover:from-[#5a3fd6] hover:to-[#7d6bff] transition-all text-sm">
                                    {this.props.t('ActionSelection.search.clearFilters')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-3'}>
                                    {currentTemplates.map((template) => this.renderTemplateCard(template))}
                                </div>
                                {this.renderPagination()}
                            </>
                        )}
                    </div>

                    {/* Template Preview Modal */}
                    {this.renderTemplatePreview()}
                </main>

                {/* Loading Overlay - Moved outside main to ensure it's on top of everything */}
                {this.state.isLoading && this.state.selectedTemplate && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100000000]">
                        <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center border border-white/20 shadow-2xl">
                            <BiLoader className="animate-spin text-[#694aff] mb-3" size={40} />
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">{this.props.t('ActionSelection.loading.processingTemplate')}</h3>
                            <p className="text-gray-600 text-center text-sm">{this.props.t('ActionSelection.loading.settingUp')}</p>
                        </div>
                    </div>
                )}

                {/* Styles */}
                <style jsx>{`
                    .line-clamp-1 {
                        display: -webkit-box;
                        -webkit-line-clamp: 1;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    .line-clamp-2 {
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                `}</style>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(ActionSelection);
export default MyComponent;
