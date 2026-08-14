import React, { useEffect, useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { FiSearch, FiStar, FiArrowLeft, FiArrowRight, FiX, FiHeart, FiZoomIn } from 'react-icons/fi';
import { AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { BiCheck } from 'react-icons/bi';
import { BsGrid3X3Gap, BsList } from 'react-icons/bs';
import { useTranslation } from 'react-i18next';

// Import all CV template images
import Cv1 from '../../assets/resumesNew/Cv1.JPG';
import Cv2 from '../../assets/resumesNew/Cv2.JPG';
import Cv3 from '../../assets/resumesNew/Cv3.JPG';
import Cv4 from '../../assets/resumesNew/Cv4.JPG';
import Cv5 from '../../assets/resumesNew/Cv5.JPG';
import Cv6 from '../../assets/resumesNew/Cv6.JPG';
import Cv7 from '../../assets/resumesNew/Cv7.JPG';
import Cv8 from '../../assets/resumesNew/Cv8.JPG';
import Cv9 from '../../assets/resumesNew/Cv9.JPG';
import Cv10 from '../../assets/resumesNew/Cv10.JPG';
import Cv11 from '../../assets/resumesNew/Cv11.JPG';
import Cv12 from '../../assets/resumesNew/Cv12.JPG';
import Cv13 from '../../assets/resumesNew/Cv13.JPG';
import Cv14 from '../../assets/resumesNew/Cv14.JPG';
import Cv15 from '../../assets/resumesNew/Cv15.JPG';
import Cv16 from '../../assets/resumesNew/Cv16.JPG';
import Cv17 from '../../assets/resumesNew/Cv17.JPG';
import Cv18 from '../../assets/resumesNew/Cv18.JPG';
import Cv19 from '../../assets/resumesNew/Cv19.JPG';
import Cv20 from '../../assets/resumesNew/Cv20.JPG';
import Cv21 from '../../assets/resumesNew/Cv21.JPG';
import Cv22 from '../../assets/resumesNew/Cv22.JPG';
import Cv23 from '../../assets/resumesNew/Cv23.JPG';
import Cv24 from '../../assets/resumesNew/Cv24.JPG';
import Cv25 from '../../assets/resumesNew/Cv25.JPG';
import Cv26 from '../../assets/resumesNew/Cv26.JPG';
import Cv27 from '../../assets/resumesNew/Cv27.JPG';
import Cv28 from '../../assets/resumesNew/Cv28.JPG';
import Cv29 from '../../assets/resumesNew/Cv29.JPG';
import Cv30 from '../../assets/resumesNew/Cv30.JPG';
import Cv31 from '../../assets/resumesNew/Cv31.JPG';
import Cv32 from '../../assets/resumesNew/Cv32.JPG';
import Cv33 from '../../assets/resumesNew/Cv33.JPG';
import Cv34 from '../../assets/resumesNew/Cv34.JPG';
import Cv35 from '../../assets/resumesNew/Cv35.JPG';
import Cv36 from '../../assets/resumesNew/Cv36.JPG';
import Cv37 from '../../assets/resumesNew/Cv37.JPG';
import Cv38 from '../../assets/resumesNew/Cv38.JPG';
import Cv39 from '../../assets/resumesNew/Cv39.JPG';
import Cv40 from '../../assets/resumesNew/Cv40.JPG';
import Cv41 from '../../assets/resumesNew/Cv41.JPG';
import Cv42 from '../../assets/resumesNew/Cv42.JPG';
import Cv43 from '../../assets/resumesNew/Cv43.JPG';
import Cv44 from '../../assets/resumesNew/Cv44.JPG';
import Cv45 from '../../assets/resumesNew/Cv45.JPG';
import Cv46 from '../../assets/resumesNew/Cv46.JPG';
import Cv47 from '../../assets/resumesNew/Cv47.JPG';
import Cv48 from '../../assets/resumesNew/Cv48.JPG';
import Cv49 from '../../assets/resumesNew/Cv49.JPG';
import Cv50 from '../../assets/resumesNew/Cv50.JPG';
import Cv51 from '../../assets/resumesNew/CV51.JPG';

const TemplateSelectionModal = ({ showModal, setShowModal, currentTemplate = 'Cv1', onTemplateSelect, resumeData }) => {
    const { t } = useTranslation('common');
    const [isVisible, setIsVisible] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(currentTemplate);
    const [viewMode, setViewMode] = useState('grid');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [favoriteTemplates, setFavoriteTemplates] = useState([]);
    const [previewTemplate, setPreviewTemplate] = useState(null);
    const [loadedTemplates, setLoadedTemplates] = useState({});
    const [sortBy, setSortBy] = useState('popular');

    const templatesPerPage = 8;

    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
            setTimeout(() => setIsVisible(true), 10);
            // Preload first page images
            preloadCurrentPageImages();
        } else {
            document.body.style.overflow = 'unset';
            setIsVisible(false);
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showModal]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => setShowModal(false), 300);
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    const handleEscapeKey = (e) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    useEffect(() => {
        if (showModal) {
            document.addEventListener('keydown', handleEscapeKey);
            return () => document.removeEventListener('keydown', handleEscapeKey);
        }
    }, [showModal]);

    // Template data
    const getTemplates = () => {
        return [
            {
                id: 'Cv1',
                src: Cv1,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professionalClassic'),
                description: t('TemplateSelectionModal.templateDescriptions.professionalClassic'),
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
                name: t('TemplateSelectionModal.templateNames.modernCreative'),
                description: t('TemplateSelectionModal.templateDescriptions.modernCreative'),
                popularity: 88,
            },
            {
                id: 'Cv3',
                src: Cv3,
                category: 'creative',
                name: t('TemplateSelectionModal.templateNames.creativeBold'),
                description: t('TemplateSelectionModal.templateDescriptions.creativeBold'),
                popularity: 85,
            },
            {
                id: 'Cv4',
                src: Cv4,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.executivePro'),
                description: t('TemplateSelectionModal.templateDescriptions.executivePro'),
                popularity: 90,
            },
            {
                id: 'Cv5',
                src: Cv5,
                category: 'modern',
                name: t('TemplateSelectionModal.templateNames.techModern'),
                description: t('TemplateSelectionModal.templateDescriptions.techModern'),
                popularity: 87,
            },
            {
                id: 'Cv6',
                src: Cv6,
                category: 'simple',
                name: t('TemplateSelectionModal.templateNames.simpleElegant'),
                description: t('TemplateSelectionModal.templateDescriptions.simpleElegant'),
                popularity: 92,
            },
            {
                id: 'Cv7',
                src: Cv7,
                category: 'creative',
                name: t('TemplateSelectionModal.templateNames.designerSpecial'),
                description: t('TemplateSelectionModal.templateDescriptions.designerSpecial'),
                popularity: 83,
            },
            {
                id: 'Cv8',
                src: Cv8,
                category: 'simple',
                name: t('TemplateSelectionModal.templateNames.cleanSimple'),
                description: t('TemplateSelectionModal.templateDescriptions.cleanSimple'),
                popularity: 89,
            },
            {
                id: 'Cv9',
                src: Cv9,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.corporateElite'),
                description: t('TemplateSelectionModal.templateDescriptions.corporateElite'),
                popularity: 91,
            },
            {
                id: 'Cv10',
                src: Cv10,
                category: 'modern',
                name: t('TemplateSelectionModal.templateNames.startupReady'),
                description: t('TemplateSelectionModal.templateDescriptions.startupReady'),
                popularity: 86,
            },
            {
                id: 'Cv11',
                src: Cv11,
                category: 'creative',
                name: t('TemplateSelectionModal.templateNames.creativePro'),
                description: t('TemplateSelectionModal.templateDescriptions.creativePro'),
                popularity: 84,
            },
            {
                id: 'Cv12',
                src: Cv12,
                category: 'simple',
                name: t('TemplateSelectionModal.templateNames.minimalPro'),
                description: t('TemplateSelectionModal.templateDescriptions.minimalPro'),
                popularity: 88,
            },
            {
                id: 'Cv13',
                src: Cv13,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.businessClassic'),
                description: t('TemplateSelectionModal.templateDescriptions.businessClassic'),
                popularity: 93,
            },
            {
                id: 'Cv14',
                src: Cv14,
                category: 'modern',
                name: t('TemplateSelectionModal.templateNames.modernEdge'),
                description: t('TemplateSelectionModal.templateDescriptions.modernEdge'),
                popularity: 85,
            },
            {
                id: 'Cv15',
                src: Cv15,
                category: 'creative',
                name: t('TemplateSelectionModal.templateNames.artistPortfolio'),
                description: t('TemplateSelectionModal.templateDescriptions.artistPortfolio'),
                popularity: 82,
            },
            {
                id: 'Cv16',
                src: Cv16,
                category: 'modern',
                name: t('TemplateSelectionModal.templateNames.techInnovation'),
                description: t('TemplateSelectionModal.templateDescriptions.techInnovation'),
                popularity: 87,
            },
            {
                id: 'Cv17',
                src: Cv17,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.executiveSuite'),
                description: t('TemplateSelectionModal.templateDescriptions.executiveSuite'),
                popularity: 94,
            },
            {
                id: 'Cv18',
                src: Cv18,
                category: 'creative',
                name: t('TemplateSelectionModal.templateNames.creativeShowcase'),
                description: t('TemplateSelectionModal.templateDescriptions.creativeShowcase'),
                popularity: 81,
            },
            {
                id: 'Cv19',
                src: Cv19,
                category: 'simple',
                name: t('TemplateSelectionModal.templateNames.cleanProfessional'),
                description: t('TemplateSelectionModal.templateDescriptions.cleanProfessional'),
                popularity: 90,
            },
            {
                id: 'Cv20',
                src: Cv20,
                category: 'modern',
                name: t('TemplateSelectionModal.templateNames.futureForward'),
                description: t('TemplateSelectionModal.templateDescriptions.futureForward'),
                popularity: 86,
            },
            {
                id: 'Cv21',
                src: Cv21,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional21'),
                description: t('TemplateSelectionModal.templateDescriptions.professional21'),
                popularity: 80,
            },
            {
                id: 'Cv22',
                src: Cv22,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional22'),
                description: t('TemplateSelectionModal.templateDescriptions.professional22'),
                popularity: 80,
            },
            {
                id: 'Cv23',
                src: Cv23,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional23'),
                description: t('TemplateSelectionModal.templateDescriptions.professional23'),
                popularity: 80,
            },
            {
                id: 'Cv24',
                src: Cv24,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional24'),
                description: t('TemplateSelectionModal.templateDescriptions.professional24'),
                popularity: 80,
            },
            {
                id: 'Cv25',
                src: Cv25,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional25'),
                description: t('TemplateSelectionModal.templateDescriptions.professional25'),
                popularity: 80,
            },
            {
                id: 'Cv26',
                src: Cv26,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional26'),
                description: t('TemplateSelectionModal.templateDescriptions.professional26'),
                popularity: 80,
            },
            {
                id: 'Cv27',
                src: Cv27,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional27'),
                description: t('TemplateSelectionModal.templateDescriptions.professional27'),
                popularity: 80,
            },
            {
                id: 'Cv28',
                src: Cv28,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional28'),
                description: t('TemplateSelectionModal.templateDescriptions.professional28'),
                popularity: 80,
            },
            {
                id: 'Cv29',
                src: Cv29,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional29'),
                description: t('TemplateSelectionModal.templateDescriptions.professional29'),
                popularity: 80,
            },
            {
                id: 'Cv30',
                src: Cv30,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional30'),
                description: t('TemplateSelectionModal.templateDescriptions.professional30'),
                popularity: 80,
            },
            {
                id: 'Cv31',
                src: Cv31,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional31'),
                description: t('TemplateSelectionModal.templateDescriptions.professional31'),
                popularity: 80,
            },
            {
                id: 'Cv32',
                src: Cv32,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional32'),
                description: t('TemplateSelectionModal.templateDescriptions.professional32'),
                popularity: 80,
            },
            {
                id: 'Cv33',
                src: Cv33,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional33'),
                description: t('TemplateSelectionModal.templateDescriptions.professional33'),
                popularity: 80,
            },
            {
                id: 'Cv34',
                src: Cv34,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional34'),
                description: t('TemplateSelectionModal.templateDescriptions.professional34'),
                popularity: 80,
            },
            {
                id: 'Cv35',
                src: Cv35,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional35'),
                description: t('TemplateSelectionModal.templateDescriptions.professional35'),
                popularity: 80,
            },
            {
                id: 'Cv36',
                src: Cv36,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional36'),
                description: t('TemplateSelectionModal.templateDescriptions.professional36'),
                popularity: 80,
            },
            {
                id: 'Cv37',
                src: Cv37,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional37'),
                description: t('TemplateSelectionModal.templateDescriptions.professional37'),
                popularity: 80,
            },
            {
                id: 'Cv38',
                src: Cv38,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional38'),
                description: t('TemplateSelectionModal.templateDescriptions.professional38'),
                popularity: 80,
            },
            {
                id: 'Cv39',
                src: Cv39,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional39'),
                description: t('TemplateSelectionModal.templateDescriptions.professional39'),
                popularity: 80,
            },
            {
                id: 'Cv40',
                src: Cv40,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional40'),
                description: t('TemplateSelectionModal.templateDescriptions.professional40'),
                popularity: 80,
            },
            {
                id: 'Cv41',
                src: Cv41,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional41'),
                description: t('TemplateSelectionModal.templateDescriptions.professional41'),
                popularity: 80,
            },
            {
                id: 'Cv42',
                src: Cv42,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional42'),
                description: t('TemplateSelectionModal.templateDescriptions.professional42'),
                popularity: 80,
            },
            {
                id: 'Cv43',
                src: Cv43,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional43'),
                description: t('TemplateSelectionModal.templateDescriptions.professional43'),
                popularity: 80,
            },
            {
                id: 'Cv44',
                src: Cv44,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional44'),
                description: t('TemplateSelectionModal.templateDescriptions.professional44'),
                popularity: 80,
            },
            {
                id: 'Cv45',
                src: Cv45,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional45'),
                description: t('TemplateSelectionModal.templateDescriptions.professional45'),
                popularity: 80,
            },
            {
                id: 'Cv46',
                src: Cv46,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional46'),
                description: t('TemplateSelectionModal.templateDescriptions.professional46'),
                popularity: 80,
            },
            {
                id: 'Cv47',
                src: Cv47,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional47'),
                description: t('TemplateSelectionModal.templateDescriptions.professional47'),
                popularity: 80,
            },
            {
                id: 'Cv48',
                src: Cv48,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional48'),
                description: t('TemplateSelectionModal.templateDescriptions.professional48'),
                popularity: 80,
            },
            {
                id: 'Cv49',
                src: Cv49,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional49'),
                description: t('TemplateSelectionModal.templateDescriptions.professional49'),
                popularity: 80,
            },
            {
                id: 'Cv50',
                src: Cv50,
                category: 'professional',
                name: t('TemplateSelectionModal.templateNames.professional50'),
                description: t('TemplateSelectionModal.templateDescriptions.professional50'),
                popularity: 80,
            },
        ];
    };

    const getCategories = () => {
        const templates = getTemplates();
        const categories = [...new Set(templates.map((template) => template.category))];

        const categoryCounts = categories.reduce((acc, category) => {
            acc[category] = templates.filter((template) => template.category === category).length;
            return acc;
        }, {});

        return [
            { id: 'all', name: t('TemplateSelectionModal.categories.all'), count: templates.length },
            ...categories.map((category) => ({
                id: category,
                name: t(`TemplateSelectionModal.categories.${category}`),
                count: categoryCounts[category],
            })),
        ];
    };

    const getFilteredTemplates = () => {
        const templates = getTemplates();
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
    };

    const preloadCurrentPageImages = () => {
        const filteredTemplates = getFilteredTemplates();
        const indexOfLastTemplate = currentPage * templatesPerPage;
        const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage;
        const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate);

        const loaded = { ...loadedTemplates };
        currentTemplates.forEach((template) => {
            loaded[template.id] = true;
        });
        setLoadedTemplates(loaded);
    };

    const changePage = (pageNumber) => {
        setCurrentPage(pageNumber);
        setTimeout(() => {
            preloadCurrentPageImages();
        }, 100);
        // Smooth scroll to top of modal content
        const modalContent = document.querySelector('.template-modal-content');
        if (modalContent) {
            modalContent.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const toggleFavorite = (templateId) => {
        setFavoriteTemplates((prev) => {
            if (prev.includes(templateId)) {
                return prev.filter((id) => id !== templateId);
            } else {
                return [...prev, templateId];
            }
        });
    };

    const handleTemplateSelect = (templateId) => {
        setSelectedTemplate(templateId);
        if (onTemplateSelect) {
            onTemplateSelect(templateId);
        }
        handleClose();
    };

    const showTemplatePreview = (template) => {
        setPreviewTemplate(template);
    };

    const closeTemplatePreview = () => {
        setPreviewTemplate(null);
    };

    const renderSkeletonCards = () => {
        return Array.from({ length: templatesPerPage }, (_, index) => (
            <div key={index} className="bg-white/70 backdrop-blur-sm rounded-xl shadow-md border border-white/20 overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-gradient-to-br from-blue-500/10 to-purple-500/10"></div>
                <div className="p-3 space-y-2">
                    <div className="h-3 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded w-3/4"></div>
                    <div className="h-2 bg-gradient-to-r from-blue-500/15 to-purple-500/15 rounded w-full"></div>
                </div>
            </div>
        ));
    };

    const renderPagination = () => {
        const filteredTemplates = getFilteredTemplates();
        const totalPages = Math.ceil(filteredTemplates.length / templatesPerPage);

        if (totalPages <= 1) return null;

        return (
            <div className="flex justify-center items-center mt-6 gap-2">
                <button
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white/70 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/90 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}>
                    <FiArrowLeft className="mr-1" size={14} />
                    {t('TemplateSelectionModal.pagination.previous')}
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
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                                        : 'text-gray-700 bg-white/70 backdrop-blur-sm border border-white/20 hover:bg-white/90'
                                }`}
                                onClick={() => changePage(pageNumber)}>
                                {pageNumber}
                            </button>
                        );
                    })}
                </div>

                <button
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white/70 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/90 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    onClick={() => changePage(currentPage + 1)}
                    disabled={currentPage === totalPages}>
                    {t('TemplateSelectionModal.pagination.next')}
                    <FiArrowRight className="ml-1" size={14} />
                </button>
            </div>
        );
    };

    const renderTemplateCard = (template) => {
        const isSelected = selectedTemplate === template.id;
        const isFavorite = favoriteTemplates.includes(template.id);
        const isCurrentTemplate = currentTemplate === template.id;

        return (
            <div
                key={template.id}
                className={`group relative bg-white/70 backdrop-blur-sm rounded-xl shadow-md border overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:bg-white/80 ${
                    isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white/50 shadow-lg' : 'border-white/20'
                } ${isCurrentTemplate ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-white/50' : ''}`}>
                {/* Template Badges */}
                <div className="absolute top-2 left-2 z-10 flex gap-1">
                    {template.popularity >= 90 && (
                        <span className="text-xs px-2 py-1 bg-amber-400/90 text-white rounded-lg font-medium">{t('TemplateSelectionModal.templateCard.badges.popular')}</span>
                    )}
                    {isCurrentTemplate && <span className="text-xs px-2 py-1 bg-green-500/90 text-white rounded-lg font-medium">{t('TemplateSelectionModal.templateCard.badges.current')}</span>}
                </div>

                {/* Action Buttons */}
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button
                        className={`p-1.5 rounded-lg backdrop-blur-sm transition-all ${isFavorite ? 'text-red-500 bg-white/90' : 'text-gray-600 bg-white/70 hover:bg-white/90 hover:text-red-500'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(template.id);
                        }}>
                        {isFavorite ? <AiFillHeart size={14} /> : <AiOutlineHeart size={14} />}
                    </button>

                    <button
                        className="p-1.5 rounded-lg backdrop-blur-sm bg-white/70 hover:bg-white/90 text-gray-600 hover:text-blue-600 transition-all"
                        onClick={(e) => {
                            e.stopPropagation();
                            showTemplatePreview(template);
                        }}>
                        <FiZoomIn size={14} />
                    </button>
                </div>

                {/* Template Image */}
                <div className="aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden">
                    <LazyLoadImage
                        src={template.src}
                        alt={template.name}
                        effect="blur"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onClick={() => handleTemplateSelect(template.id)}
                        threshold={200}
                        placeholderSrc="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
                        visibleByDefault={loadedTemplates[template.id] || false}
                    />
                </div>

                {/* Template Info */}
                <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex flex-col min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{template.name}</h3>
                            <span className="text-[11px] font-bold text-blue-600 tracking-wider uppercase mt-0.5">
                                (CV #{template.id.replace(/^Cv/i, '')})
                            </span>
                        </div>
                        {isSelected && (
                            <div className="p-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg ml-2">
                                <BiCheck size={14} />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="px-2 py-1 bg-blue-500/10 text-blue-600 rounded-full">{template.category}</span>
                        <div className="flex items-center text-gray-500">
                            <FiStar className="mr-1" size={10} />
                            {template.popularity}%
                        </div>
                    </div>

                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">{template.description}</p>

                    {/* Select Button */}
                    <button
                        className="w-full py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-xs font-medium rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleTemplateSelect(template.id);
                        }}>
                        {isCurrentTemplate ? t('TemplateSelectionModal.templateCard.actions.currentTemplate') : t('TemplateSelectionModal.templateCard.actions.select')}
                    </button>
                </div>
            </div>
        );
    };

    const renderTemplatePreview = () => {
        if (!previewTemplate) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4" onClick={closeTemplatePreview}>
                <div className="bg-white/95 backdrop-blur-xl rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl border border-purple-200/30" onClick={(e) => e.stopPropagation()}>
                    {/* Preview Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200/50 bg-gradient-to-r from-purple-50/80 to-indigo-50/80">
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 truncate">{previewTemplate.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">{previewTemplate.category}</span>
                                <span className="text-xs text-gray-500">{t('TemplateSelectionModal.preview.popularity', { percentage: previewTemplate.popularity })}</span>
                            </div>
                        </div>

                        <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/70 rounded-lg transition-all" onClick={closeTemplatePreview}>
                            <FiX size={18} />
                        </button>
                    </div>

                    {/* Preview Image */}
                    <div className="p-4">
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200/50 aspect-[3/4] max-h-[50vh]">
                            <LazyLoadImage
                                src={previewTemplate.src}
                                alt={previewTemplate.name}
                                effect="blur"
                                className="w-full h-full object-cover object-top"
                                threshold={200}
                                placeholderSrc="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
                            />
                        </div>
                    </div>

                    {/* Preview Footer */}
                    <div className="px-4 py-3 border-t border-gray-200/50 bg-gray-50/50">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-600 flex-1">{previewTemplate.description}</p>
                            <div className="flex gap-2 ml-4">
                                <button
                                    className="px-4 py-2 text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium transition-all"
                                    onClick={closeTemplatePreview}>
                                    {t('TemplateSelectionModal.preview.actions.cancel')}
                                </button>
                                <button
                                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold transition-all"
                                    onClick={() => {
                                        handleTemplateSelect(previewTemplate.id);
                                        closeTemplatePreview();
                                    }}>
                                    {t('TemplateSelectionModal.preview.actions.useTemplate')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!showModal) return null;

    const filteredTemplates = getFilteredTemplates();
    const categories = getCategories();

    // Pagination
    const indexOfLastTemplate = currentPage * templatesPerPage;
    const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage;
    const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Enhanced Backdrop */}
            <div
                className={`absolute inset-0 transition-all duration-500 ease-out ${isVisible ? 'bg-slate-900/20 backdrop-blur-md' : 'bg-transparent backdrop-blur-none'}`}
                onClick={handleBackdropClick}
                style={{
                    background: isVisible ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.1) 0%, rgba(30, 41, 59, 0.2) 100%)' : 'transparent',
                }}
            />

            {/* Modal Container */}
            <div
                className={`relative w-full max-w-7xl h-[95vh] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 transform transition-all duration-500 ease-out flex flex-col ${
                    isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'
                }`}
                style={{
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                }}>
                {/* Header */}
                <div className="relative bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-slate-200/50 px-8 py-6 rounded-t-2xl flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('TemplateSelectionModal.header.title')}</h2>
                                <p className="text-slate-600 mt-1 font-medium">{t('TemplateSelectionModal.header.subtitle')}</p>
                            </div>
                        </div>

                        <button
                            onClick={handleClose}
                            className="p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-200 group"
                            aria-label={t('TemplateSelectionModal.header.closeLabel')}>
                            <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 p-4 flex-shrink-0">
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Search */}
                        <div className="flex-1">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 border border-white/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white/70 backdrop-blur-sm text-sm"
                                    placeholder={t('TemplateSelectionModal.search.placeholder')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Categories */}
                        <div className="flex items-center gap-2 overflow-x-auto">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                        selectedCategory === category.id
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                                            : 'bg-white/70 text-gray-700 hover:bg-white/90 border border-white/30'
                                    }`}>
                                    {category.name} ({category.count})
                                </button>
                            ))}
                        </div>

                        {/* Sort & View Mode */}
                        <div className="flex items-center gap-2">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="px-3 py-2 border border-white/30 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 backdrop-blur-sm">
                                <option value="popular">{t('TemplateSelectionModal.sorting.popular')}</option>
                                <option value="name">{t('TemplateSelectionModal.sorting.name')}</option>
                            </select>

                            <div className="flex bg-white/70 backdrop-blur-sm rounded-lg p-0.5 border border-white/30">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-md transition-all ${
                                        viewMode === 'grid' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}>
                                    <BsGrid3X3Gap size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="relative flex-1 overflow-hidden rounded-b-2xl template-modal-content">
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/30 to-blue-50/50 pointer-events-none"></div>

                    {/* Scroll indicator - Top fade */}
                    <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white/80 to-transparent pointer-events-none z-10"></div>

                    {/* Scroll indicator - Bottom fade */}
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/80 to-transparent pointer-events-none z-10"></div>

                    <div className="relative h-full overflow-y-auto overflow-x-hidden p-6 pr-4 custom-scrollbar" style={{ scrollbarGutter: 'stable' }}>
                        {/* Results Info */}
                        <div className="flex justify-between items-center mb-4">
                            <p className="text-sm text-gray-600">{t('TemplateSelectionModal.search.resultsFound', { count: filteredTemplates.length })}</p>
                            {selectedTemplate && (
                                <div className="flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg backdrop-blur-sm">
                                    <BiCheck className="mr-1.5 text-blue-600" size={16} />
                                    <span className="text-xs text-blue-600 font-medium">{t('TemplateSelectionModal.selectedTemplate', { templateId: selectedTemplate })}</span>
                                </div>
                            )}
                        </div>

                        {/* Templates Grid */}
                        {filteredTemplates.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-gray-400 mb-3">
                                    <FiSearch size={48} className="mx-auto" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('TemplateSelectionModal.search.noResults.title')}</h3>
                                <p className="text-gray-600 max-w-md mx-auto text-sm">{t('TemplateSelectionModal.search.noResults.message')}</p>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setSelectedCategory('all');
                                    }}
                                    className="mt-3 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all text-sm">
                                    {t('TemplateSelectionModal.search.noResults.clearFilters')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {currentTemplates.length > 0 ? currentTemplates.map((template) => renderTemplateCard(template)) : renderSkeletonCards()}
                                </div>
                                {renderPagination()}
                            </>
                        )}
                    </div>
                </div>

                {/* Keyboard shortcut hint */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-slate-800/90 backdrop-blur-sm text-white px-3 py-2 rounded-full text-xs font-medium flex items-center space-x-2 shadow-lg">
                        <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">ESC</kbd>
                        <span>{t('TemplateSelectionModal.keyboard.escToClose')}</span>
                    </div>
                </div>
            </div>

            {/* Template Preview Modal */}
            {renderTemplatePreview()}

            {/* Custom scrollbar styles */}
            <style jsx>{`
                .custom-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(59, 130, 246, 0.8) rgba(241, 245, 249, 0.4);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 14px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(241, 245, 249, 0.4);
                    border-radius: 8px;
                    margin: 6px;
                    border: 1px solid rgba(226, 232, 240, 0.5);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, rgba(59, 130, 246, 0.9) 0%, rgba(147, 51, 234, 0.9) 100%);
                    border-radius: 8px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                    min-height: 40px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, rgba(59, 130, 246, 1) 0%, rgba(147, 51, 234, 1) 100%);
                    border: 2px solid rgba(255, 255, 255, 0.4);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    transform: scale(1.05);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:active {
                    background: linear-gradient(180deg, rgba(37, 99, 235, 1) 0%, rgba(124, 58, 237, 1) 100%);
                    border: 2px solid rgba(255, 255, 255, 0.5);
                }
                .custom-scrollbar::-webkit-scrollbar-corner {
                    background: rgba(241, 245, 249, 0.4);
                }
                .template-modal-content {
                    /* Ensure the modal takes up the right space for scrolling */
                    max-height: calc(95vh - 180px); /* Account for header and filters */
                }
                .custom-scrollbar {
                    /* Smooth scrolling behavior */
                    scroll-behavior: smooth;
                }
                /* Scroll indicator when content overflows */
                .template-modal-content:hover::after {
                    content: '';
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 4px;
                    height: 40px;
                    background: linear-gradient(180deg, rgba(59, 130, 246, 0.4) 0%, rgba(147, 51, 234, 0.4) 100%);
                    border-radius: 2px;
                    pointer-events: none;
                    z-index: 5;
                    opacity: 0;
                    animation: fadeInOut 2s ease-in-out;
                }
                @keyframes fadeInOut {
                    0%,
                    100% {
                        opacity: 0;
                    }
                    50% {
                        opacity: 1;
                    }
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
};

export default TemplateSelectionModal;
