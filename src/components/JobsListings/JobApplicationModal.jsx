import React, { useState, useRef, useEffect, useMemo, useContext, useCallback } from 'react';
import { withTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaTimes,
    FaUser,
    FaEnvelope,
    FaPhone,
    FaLinkedin,
    FaGithub,
    FaFileUpload,
    FaBuilding,
    FaPaperPlane,
    FaCheckCircle,
    FaExclamationTriangle,
    FaBriefcase,
    FaFile,
    FaEye,
    FaArrowLeft,
    FaExpand,
    FaChevronRight,
} from 'react-icons/fa';
import { FiBold, FiItalic, FiUnderline, FiList, FiHash } from 'react-icons/fi';
import { AuthContext } from '../../main';
import { getResumes, submitJobApplication } from '../../firestore/dbOperations';

// Lexical imports
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { FORMAT_TEXT_COMMAND } from 'lexical';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';

// Lexical theme for cover letter editor
const coverLetterTheme = {
    ltr: 'ltr',
    rtl: 'rtl',
    placeholder: 'text-slate-400 text-sm',
    paragraph: 'mb-2',
    text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
    },
    list: {
        nested: {
            listitem: 'ml-4',
        },
        ol: 'list-decimal ml-6',
        ul: 'list-disc ml-6',
        listitem: 'mb-1',
    },
};

// Plugin to handle onChange events for cover letter
function CoverLetterOnChangePlugin({ onChange }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const htmlString = $generateHtmlFromNodes(editor, null);
                onChange(htmlString);
            });
        });
    }, [editor, onChange]);

    return null;
}

// Simple toolbar for cover letter
function CoverLetterToolbar() {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
        }
    }, []);

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                updateToolbar();
            });
        });
    }, [editor, updateToolbar]);

    return (
        <div className="flex items-center space-x-1 mb-2 p-2 bg-gray-50 rounded-t border-b border-gray-200">
            <button
                type="button"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isBold ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}>
                <FiBold className="w-3 h-3" />
            </button>
            <button
                type="button"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isItalic ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}>
                <FiItalic className="w-3 h-3" />
            </button>
            <button
                type="button"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${isUnderline ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}>
                <FiUnderline className="w-3 h-3" />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1"></div>
            <button type="button" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600">
                <FiList className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600">
                <FiHash className="w-3 h-3" />
            </button>
        </div>
    );
}

const JobApplicationModal = ({ isOpen, onClose, job, t }) => {
    const user = useContext(AuthContext);
    const [applicationData, setApplicationData] = useState({
        fullName: '',
        email: '',
        phone: '',
        linkedinUrl: '',
        githubUrl: '',
        coverLetter: '',
        selectedResume: null,
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [errors, setErrors] = useState({});
    const [showResumeSelector, setShowResumeSelector] = useState(false);
    const [userResumes, setUserResumes] = useState([]);
    const [loadingResumes, setLoadingResumes] = useState(false);
    const [loadedTemplates, setLoadedTemplates] = useState({});
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewResume, setPreviewResume] = useState(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [isPaginating, setIsPaginating] = useState(false);
    const [pagination, setPagination] = useState({
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    const perPage = 6; // Show 6 resumes per page (2 rows of 3)

    // Compact animation variants
    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
    };

    const modalVariants = {
        hidden: { opacity: 0, scale: 0.95, y: 20 },
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { duration: 0.25, ease: 'easeOut' },
        },
        exit: { opacity: 0, scale: 0.95, y: -20, transition: { duration: 0.15 } },
    };

    const successVariants = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: { duration: 0.3, ease: 'easeOut' },
        },
    };

    // Form validation
    const validateForm = useMemo(() => {
        const newErrors = {};

        if (!applicationData.fullName.trim()) newErrors.fullName = 'Required';
        if (!applicationData.email.trim()) {
            newErrors.email = 'Required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicationData.email)) {
            newErrors.email = 'Invalid email';
        }
        if (!applicationData.phone.trim()) newErrors.phone = 'Required';

        // Validate cover letter (strip HTML tags for character count)
        const coverLetterText = applicationData.coverLetter.replace(/<[^>]*>/g, '').trim();
        if (!coverLetterText) {
            newErrors.coverLetter = 'Required';
        } else if (coverLetterText.length < 50) {
            newErrors.coverLetter = 'Minimum 50 characters';
        } else if (coverLetterText.length > 1000) {
            newErrors.coverLetter = 'Maximum 1000 characters';
        }

        return newErrors;
    }, [applicationData]);

    const isFormValid = Object.keys(validateForm).length === 0;

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setApplicationData({
                fullName: '',
                email: '',
                phone: '',
                linkedinUrl: '',
                githubUrl: '',
                coverLetter: '',
                selectedResume: null,
            });
            setIsSubmitted(false);
            setIsSubmitting(false);
            setErrors({});
            setShowResumeSelector(false);
            setUserResumes([]);
            setShowPreviewModal(false);
            setPreviewResume(null);
            // Reset pagination
            setCurrentPage(1);
            setIsPaginating(false);
            setPagination({
                totalItems: 0,
                totalPages: 0,
                currentPage: 1,
                hasNextPage: false,
                hasPreviousPage: false,
            });
        }
    }, [isOpen]);

    // Prevent background scrolling
    useEffect(() => {
        if (isOpen) {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
        } else {
            document.documentElement.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        return () => {
            document.documentElement.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && !isSubmitting) onClose();
        };
        if (isOpen) document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose, isSubmitting]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setApplicationData((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    };

    // Handle cover letter change from Lexical editor
    const handleCoverLetterChange = useCallback(
        (htmlContent) => {
            setApplicationData((prev) => ({ ...prev, coverLetter: htmlContent }));
            if (errors.coverLetter) setErrors((prev) => ({ ...prev, coverLetter: '' }));
        },
        [errors.coverLetter]
    );

    // Fetch user resumes with pagination
    const fetchUserResumes = async (isPaginationRequest = false, pageNumber = 1) => {
        if (!user) return;

        // Set appropriate loading state
        if (isPaginationRequest) {
            setIsPaginating(true);
        } else {
            setLoadingResumes(true);
            setUserResumes([]); // Clear existing resumes for fresh load
        }

        try {
            const pageToFetch = isPaginationRequest ? pageNumber : 1;
            const response = await getResumes(user.uid, pageToFetch, perPage);

            if (response && response.resumes) {
                setUserResumes(response.resumes);

                // Update pagination state
                if (response.pagination) {
                    setPagination(response.pagination);
                } else {
                    // Fallback pagination if not provided by API
                    setPagination({
                        totalItems: response.resumes.length,
                        totalPages: 1,
                        currentPage: pageToFetch,
                        hasNextPage: false,
                        hasPreviousPage: false,
                    });
                }
            } else {
                // No resumes found
                setUserResumes([]);
                setPagination({
                    totalItems: 0,
                    totalPages: 0,
                    currentPage: pageToFetch,
                    hasNextPage: false,
                    hasPreviousPage: false,
                });
            }
        } catch (error) {
            console.error('Error fetching resumes:', error);
            setErrors((prev) => ({ ...prev, resume: 'Failed to load resumes' }));
        } finally {
            setLoadingResumes(false);
            setIsPaginating(false);
        }
    };

    // Handle resume selection
    const handleResumeSelect = (resume) => {
        // Generate shareable link (you can modify this based on your sharing logic)
        const shareableLink = `${window.location.origin}/shared/${resume.id}`;

        setApplicationData((prev) => ({
            ...prev,
            selectedResume: {
                id: resume.id,
                name: resume.item?.firstname && resume.item?.lastname ? `${resume.item.firstname} ${resume.item.lastname}` : 'Resume',
                shareableLink: shareableLink,
                data: resume, // Full resume data for future use
            },
        }));
        setShowResumeSelector(false);
        setErrors((prev) => ({ ...prev, resume: '' }));
    };

    // Page navigation function
    const setPageNumber = (pageNumber) => {
        if (pageNumber < 1 || (pagination.totalPages > 0 && pageNumber > pagination.totalPages)) {
            console.error('Invalid page number:', pageNumber);
            return;
        }

        // Update pagination state first
        setPagination((prev) => ({ ...prev, currentPage: pageNumber }));
        setCurrentPage(pageNumber);

        // Fetch resumes for the new page with the specific page number
        fetchUserResumes(true, pageNumber); // Pass true for pagination request and the page number
    };

    // Show resume selector
    const handleShowResumeSelector = () => {
        setShowResumeSelector(true);
        if (userResumes.length === 0) {
            fetchUserResumes();
        }
    };

    // Dynamic template loader (similar to DashboardHomepage)
    const loadTemplate = async (templateName) => {
        if (!templateName || loadedTemplates[templateName]) {
            return loadedTemplates[templateName];
        }

        try {
            // Dynamic import based on template name
            let templateModule;
            if (templateName.startsWith('Cover')) {
                templateModule = await import(`../../cv-templates/${templateName.toLowerCase()}/${templateName}.jsx`);
            } else {
                templateModule = await import(`../../cv-templates/${templateName.toLowerCase()}/${templateName}.jsx`);
            }

            const TemplateComponent = templateModule.default;

            setLoadedTemplates((prev) => ({
                ...prev,
                [templateName]: TemplateComponent,
            }));

            return TemplateComponent;
        } catch (error) {
            console.warn(`Failed to load template ${templateName}:`, error);
            // Fallback to Cv1 if template fails to load
            if (templateName !== 'Cv1') {
                return loadTemplate('Cv1');
            }
            return null;
        }
    };

    // Get template-specific colors
    const getTemplateColors = (templateName) => {
        const templateColors = {
            Cv1: { primary: '#000000', secondary: '#333333' },
            Cv2: { primary: '#f0c30e', secondary: '#f5f5f5' },
            Cv3: { primary: '#be8a95', secondary: '#000000' },
            Cv4: { primary: '#3d3e42', secondary: '#3d3e42' },
            Cv5: { primary: '#059669', secondary: '#2d3039' },
            Cv6: { primary: '#7c3aed', secondary: '#09043c' },
            Cv7: { primary: '#000000', secondary: '#f5f5f5' },
        };

        return (
            templateColors[templateName] || {
                primary: '#000000',
                secondary: '#333333',
            }
        );
    };

    // Generate CV data using actual document data with fallbacks (matching DashboardHomepage)
    const generateSampleCvData = (document) => {
        return {
            // Basic personal information from document.item
            firstname: document?.item?.firstname || 'John',
            lastname: document?.item?.lastname || 'Doe',
            occupation: document?.item?.occupation || 'Software Developer',
            email: document?.item?.email || 'john.doe@example.com',
            phone: document?.item?.phone || '+1 (555) 123-4567',
            address: document?.item?.address || '123 Main St',
            city: document?.item?.city || 'New York',
            country: document?.item?.country || 'USA',
            postalcode: document?.item?.postalcode || '10001',
            photo: document?.item?.photo || null,
            summary: document?.item?.summary || 'Experienced software developer with expertise in web technologies.',

            // Use actual array data from document root (not document.item)
            // Transform skills to ensure correct field names and structure
            skills:
                document.skills && document.skills.length > 0
                    ? document.skills
                          .filter((skill) => skill && (skill.skillName || skill.name || skill.skill)) // Filter out null/undefined
                          .map((skill, index) => ({
                              name: skill.skillName || skill.name || skill.skill || 'Unknown Skill',
                              rating: skill.rating || 50,
                              date: skill.date || index + 1,
                          }))
                    : [
                          { name: 'JavaScript', rating: 90, date: 1 },
                          { name: 'React', rating: 85, date: 2 },
                          { name: 'Node.js', rating: 80, date: 3 },
                      ],

            // Transform languages to ensure correct field names
            languages:
                document.languages && document.languages.length > 0
                    ? document.languages
                          .filter((lang) => lang && (lang.name || lang.language)) // Filter out null/undefined elements
                          .map((lang, index) => ({
                              name: lang.name || lang.language || 'Unknown Language',
                              level: lang.level || lang.proficiency || 'Intermediate',
                              date: lang.date || index + 1,
                          }))
                    : [
                          { name: 'English', level: 'Native', date: 1 },
                          { name: 'Spanish', level: 'Intermediate', date: 2 },
                      ],

            // Transform employments to ensure correct field names
            employments:
                document.employments && document.employments.length > 0
                    ? document.employments
                          .filter((emp) => emp && (emp.jobTitle || emp.job_title)) // Filter out null/undefined
                          .map((emp, index) => ({
                              jobTitle: emp.jobTitle || emp.job_title || 'Position',
                              employer: emp.employer || emp.company || 'Company',
                              begin: emp.begin || emp.start_date || 'Start Date',
                              end: emp.end || emp.end_date || 'End Date',
                              description: emp.description || 'Job description',
                              date: emp.date || index + 1,
                          }))
                    : [
                          {
                              jobTitle: 'Senior Developer',
                              employer: 'Tech Corp',
                              begin: 'Jan 2020',
                              end: 'Present',
                              description: 'Led development of web applications',
                              date: 1,
                          },
                      ],

            // Transform educations to ensure correct field names
            educations:
                document.educations && document.educations.length > 0
                    ? document.educations
                          .filter((edu) => edu && (edu.degree || edu.qualification)) // Filter out null/undefined
                          .map((edu, index) => ({
                              degree: edu.degree || edu.qualification || 'Degree',
                              school: edu.school || edu.institution || 'Institution',
                              started: edu.started || edu.start_year || 'Start Year',
                              finished: edu.finished || edu.end_year || 'End Year',
                              description: edu.description || 'Education description',
                              date: edu.date || index + 1,
                          }))
                    : [
                          {
                              degree: 'Computer Science',
                              school: 'University',
                              started: '2016',
                              finished: '2020',
                              description: "Bachelor's degree in Computer Science",
                              date: 1,
                          },
                      ],

            colors: getTemplateColors(document?.template || document?.item?.template || 'Cv1'),
        };
    };

    // Render template component with error boundary
    const renderTemplatePreview = (document) => {
        const templateName = document?.template || document?.item?.template || 'Cv1';
        const TemplateComponent = loadedTemplates[templateName];
        const cvData = generateSampleCvData(document);

        if (!TemplateComponent) {
            // Load template if not already loaded
            loadTemplate(templateName);
            // Show loading placeholder while template loads
            return (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <div className="animate-pulse text-gray-400 text-sm">Loading...</div>
                </div>
            );
        }

        try {
            return <TemplateComponent values={cvData} language="en" t={(key, fallback) => fallback || key} />;
        } catch (error) {
            console.warn(`Error rendering template ${templateName}:`, error);
            return (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <div className="text-gray-400 text-xs">Preview Error</div>
                </div>
            );
        }
    };

    // Handle preview modal
    const handleShowPreview = (resume) => {
        setPreviewResume(resume);
        setShowPreviewModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate user is logged in
        if (!user?.uid) {
            setErrors({ submit: 'You must be logged in to apply for jobs.' });
            return;
        }

        // Validate job exists
        if (!job?.id) {
            setErrors({ submit: 'Invalid job. Please try again.' });
            return;
        }

        const formErrors = validateForm;
        if (Object.keys(formErrors).length > 0) {
            setErrors(formErrors);
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            console.log('🔍 Submitting application for job:', job.id);
            console.log('🔍 User ID:', user.uid);
            console.log('🔍 Raw application data:', applicationData);

            // Sanitize application data to remove undefined values
            const sanitizedApplicationData = {
                fullName: applicationData.fullName || '',
                email: applicationData.email || '',
                phone: applicationData.phone || '',
                linkedinUrl: applicationData.linkedinUrl || '',
                githubUrl: applicationData.githubUrl || '',
                coverLetter: applicationData.coverLetter || '',
                selectedResume: applicationData.selectedResume ? {
                    id: applicationData.selectedResume.id || '',
                    name: applicationData.selectedResume.name || '',
                    shareableLink: applicationData.selectedResume.shareableLink || '',
                    data: applicationData.selectedResume.data || null
                } : null,
            };

            console.log('🔍 Sanitized application data:', sanitizedApplicationData);

            // Submit the application to the database
            const result = await submitJobApplication(user.uid, job.id, sanitizedApplicationData);

            if (result.success) {
                console.log('✅ Application submitted successfully:', result.applicationId);
                setIsSubmitted(true);
                setTimeout(() => onClose(), 2500);
            } else {
                console.error('❌ Application submission failed:', result.error);
                setErrors({ submit: result.error || 'Failed to submit application. Please try again.' });
            }
        } catch (error) {
            console.error('❌ Error submitting application:', error);
            setErrors({ submit: 'An unexpected error occurred. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[10001] flex items-center justify-center p-3"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                    <motion.div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[98vh] overflow-hidden" variants={modalVariants} onClick={(e) => e.stopPropagation()}>
                        <AnimatePresence mode="wait">
                            {isSubmitted ? (
                                <motion.div key="success" className="p-6 text-center" variants={successVariants} initial="hidden" animate="visible">
                                    <motion.div
                                        className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.1, type: 'spring' }}>
                                        <FaCheckCircle className="w-6 h-6 text-green-600" />
                                    </motion.div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-2">{t('JobsUpdate.JobApplicationModal.success.title', 'Application Submitted!')}</h3>
                                    <p className="text-slate-600 text-sm">
                                        {t('JobsUpdate.JobApplicationModal.success.message', "Your application has been successfully submitted. We'll be in touch soon.")}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div key="form" className="h-full flex flex-col">
                                    {/* Compact Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-purple-600 rounded-md flex items-center justify-center">
                                                <FaBriefcase className="w-3 h-3 text-white" />
                                            </div>
                                            <div>
                                                <h2 className="text-base font-bold text-slate-900">{t('JobsUpdate.JobApplicationModal.title', 'Apply for {{jobTitle}}', { jobTitle: '' })}</h2>
                                                <p className="text-xs text-slate-600 truncate max-w-48">{job?.title}</p>
                                            </div>
                                        </div>
                                        <button onClick={onClose} className="p-1.5 hover:bg-white/50 rounded-md transition-colors" disabled={isSubmitting}>
                                            <FaTimes className="w-3.5 h-3.5 text-slate-500" />
                                        </button>
                                    </div>

                                    {/* Compact Form */}
                                    <div className="flex-1 overflow-y-auto">
                                        <form onSubmit={handleSubmit} className="p-4 space-y-3">
                                            {/* Essential Info Only */}
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <input
                                                            type="text"
                                                            name="fullName"
                                                            value={applicationData.fullName}
                                                            onChange={handleInputChange}
                                                            className={`w-full px-2.5 py-2 text-sm border rounded-md focus:outline-none ${
                                                                errors.fullName ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                            }`}
                                                             placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.fullName', 'Full Name') + ' *'}
                                                        />
                                                        {errors.fullName && <p className="text-xs text-red-600 mt-0.5">{errors.fullName}</p>}
                                                    </div>
                                                    <div>
                                                        <input
                                                            type="email"
                                                            name="email"
                                                            value={applicationData.email}
                                                            onChange={handleInputChange}
                                                            className={`w-full px-2.5 py-2 text-sm border rounded-md focus:outline-none ${
                                                                errors.email ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                            }`}
                                                             placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.email', 'Email Address') + ' *'}
                                                        />
                                                        {errors.email && <p className="text-xs text-red-600 mt-0.5">{errors.email}</p>}
                                                    </div>
                                                </div>
                                                <input
                                                    type="tel"
                                                    name="phone"
                                                    value={applicationData.phone}
                                                    onChange={handleInputChange}
                                                    className={`w-full px-2.5 py-2 text-sm border rounded-md focus:outline-none ${
                                                        errors.phone ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                    }`}
                                                     placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.phone', 'Phone Number') + ' *'}
                                                />
                                                {errors.phone && <p className="text-xs text-red-600 mt-0.5">{errors.phone}</p>}
                                            </div>

                                            {/* Professional Links - Compact */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="url"
                                                    name="linkedinUrl"
                                                    value={applicationData.linkedinUrl}
                                                    onChange={handleInputChange}
                                                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
                                                     placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.linkedin', 'LinkedIn Profile URL') + ' (' + t('common:optional', 'optional') + ')'}
                                                />
                                                <input
                                                    type="url"
                                                    name="githubUrl"
                                                    value={applicationData.githubUrl}
                                                    onChange={handleInputChange}
                                                    className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
                                                     placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.github', 'GitHub/Portfolio URL') + ' (' + t('common:optional', 'optional') + ')'}
                                                />
                                            </div>

                                            {/* Resume Selection */}
                                            <div className={`border-2 border-dashed rounded-md p-3 text-center transition-colors ${errors.resume ? 'border-red-300' : 'border-slate-300'}`}>
                                                {applicationData.selectedResume ? (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <FaFile className="w-3 h-3 text-green-600 flex-shrink-0" />
                                                            <span className="text-xs font-medium text-green-600 truncate">{applicationData.selectedResume.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setApplicationData((prev) => ({ ...prev, selectedResume: null }))}
                                                                className="text-red-500 hover:text-red-700 flex-shrink-0">
                                                                <FaTimes className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center justify-center space-x-2">
                                                            <button type="button" onClick={handleShowResumeSelector} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                                                                {t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}
                                                            </button>
                                                            <span className="text-xs text-slate-400">•</span>
                                                            <a
                                                                href={applicationData.selectedResume.shareableLink}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1">
                                                                <FaEye className="w-2 h-2" />
                                                                <span>{t('JobsUpdate.JobApplicationModal.resume.preview', 'Preview Resume')}</span>
                                                            </a>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <FaFile className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                                                        <p className="text-xs text-slate-600">
                                                            <button type="button" onClick={handleShowResumeSelector} className="text-blue-600 hover:text-blue-700 font-medium">
                                                                {t('JobsUpdate.JobApplicationModal.resume.selectResume', 'Select Resume')}
                                                            </button>{' '}
                                                            {t('common:fromYourProfile', 'from your profile')}
                                                        </p>
                                                        <p className="text-xs text-slate-500 mt-0.5">{t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}</p>
                                                    </div>
                                                )}
                                            </div>
                                            {errors.resume && <p className="text-xs text-red-600 -mt-1">{errors.resume}</p>}

                                            {/* Rich Text Cover Letter */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Cover Letter *</label>
                                                <div className={`border rounded-md ${errors.coverLetter ? 'border-red-300' : 'border-slate-300'}`}>
                                                    <LexicalComposer
                                                        initialConfig={{
                                                            namespace: 'CoverLetterEditor',
                                                            theme: coverLetterTheme,
                                                            onError: (error) => console.error('Lexical error:', error),
                                                            nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, AutoLinkNode, LinkNode],
                                                        }}>
                                                        <CoverLetterToolbar />
                                                        <div className="relative">
                                                            <RichTextPlugin
                                                                contentEditable={<ContentEditable className="min-h-[80px] max-h-[200px] overflow-y-auto px-3 py-2 text-sm focus:outline-none" />}
                                                                placeholder={
                                                                    <div className="absolute top-2 left-3 text-slate-400 text-sm pointer-events-none">
                                                                        {t('JobsUpdate.JobApplicationModal.coverLetter.placeholder', "Write a brief cover letter explaining why you're a good fit for this role...")}
                                                                    </div>
                                                                }
                                                                ErrorBoundary={LexicalErrorBoundary}
                                                            />
                                                            <HistoryPlugin />
                                                            <ListPlugin />
                                                            <LinkPlugin />
                                                            <CoverLetterOnChangePlugin onChange={handleCoverLetterChange} />
                                                        </div>
                                                    </LexicalComposer>
                                                </div>
                                                <div className="flex justify-between items-center mt-1">
                                                    {errors.coverLetter && <p className="text-xs text-red-600">{errors.coverLetter}</p>}
                                                    <span className="text-xs text-slate-500 ml-auto">{applicationData.coverLetter.replace(/<[^>]*>/g, '').length}/1000 {t('common:characters', 'characters')}</span>
                                                </div>
                                            </div>

                                            {errors.submit && (
                                                <div className="flex items-center space-x-2 p-2 bg-red-50 border border-red-200 rounded-md">
                                                    <FaExclamationTriangle className="w-3 h-3 text-red-600 flex-shrink-0" />
                                                    <p className="text-xs text-red-600">{errors.submit}</p>
                                                </div>
                                            )}
                                        </form>
                                    </div>

                                    {/* Compact Footer */}
                                    <div className="flex items-center justify-end space-x-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-3 py-1.5 text-sm border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                                            disabled={isSubmitting}>
                                            {t('JobsUpdate.JobApplicationModal.buttons.cancel', 'Cancel')}
                                        </button>
                                        <button
                                            onClick={handleSubmit}
                                            disabled={!isFormValid || isSubmitting}
                                            className="px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-1.5">
                                            {isSubmitting ? (
                                                <>
                                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    <span>{t('JobsUpdate.JobApplicationModal.buttons.submitting', 'Submitting...')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FaPaperPlane className="w-3 h-3" />
                                                    <span>{t('JobsUpdate.JobApplicationModal.buttons.submit', 'Submit Application')}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Resume Selector Modal */}
                        {showResumeSelector && (
                            <motion.div
                                className="absolute inset-0 bg-white rounded-xl z-10 flex flex-col"
                                initial={{ opacity: 0, x: 300 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 300 }}
                                transition={{ duration: 0.3 }}>
                                {/* Resume Selector Header */}
                                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                                    <div className="flex items-center space-x-3">
                                        <button onClick={() => setShowResumeSelector(false)} className="p-2 hover:bg-white/50 rounded-md transition-colors">
                                            <FaArrowLeft className="w-4 h-4 text-slate-500" />
                                        </button>
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900">{t('JobsUpdate.JobApplicationModal.resume.selectResume', 'Select Resume')}</h2>
                                            <p className="text-sm text-slate-600">{t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Resume List */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                                    <div className="p-6 pb-8">
                                        {loadingResumes || isPaginating ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {[...Array(perPage)].map((_, index) => (
                                                    <div key={index} className="animate-pulse">
                                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                                            <div className="h-72 bg-slate-200"></div>
                                                            <div className="p-4">
                                                                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
                                                                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : userResumes.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {userResumes.map((resume) => {
                                                    const isSelected = applicationData.selectedResume?.id === resume.id;
                                                    return (
                                                        <div
                                                            key={resume.id}
                                                            className={`border-2 rounded-lg transition-all duration-200 group bg-white cursor-pointer ${
                                                                isSelected ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                                                            }`}
                                                            onClick={() => handleResumeSelect(resume)}>
                                                            {/* Selected indicator */}
                                                            {isSelected && (
                                                                <div className="absolute top-3 right-3 z-10 bg-blue-500 text-white rounded-full p-1">
                                                                    <FaCheckCircle className="w-4 h-4" />
                                                                </div>
                                                            )}

                                                            {/* Resume Preview Thumbnail */}
                                                            <div className="relative h-72 bg-gradient-to-br from-gray-50 to-gray-100 rounded-t-lg overflow-hidden">
                                                                <div className="absolute inset-0 flex items-center justify-center p-2">
                                                                    <div
                                                                        className="bg-white shadow-sm border border-gray-200 rounded-sm"
                                                                        style={{
                                                                            width: '200px',
                                                                            height: '283px',
                                                                            overflow: 'hidden',
                                                                        }}>
                                                                        <div
                                                                            className="w-[794px] h-[1123px] origin-top-left"
                                                                            style={{
                                                                                transform: 'scale(0.252)',
                                                                                transformOrigin: 'top left',
                                                                            }}>
                                                                            {renderTemplatePreview(resume)}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Preview overlay */}
                                                                <div className="absolute inset-0 bg-transparent group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleShowPreview(resume);
                                                                        }}
                                                                        className="opacity-0 group-hover:opacity-100 bg-white/90 hover:bg-white text-slate-700 p-3 rounded-full shadow-lg transition-all duration-200">
                                                                        <FaExpand className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Resume Info */}
                                                            <div className="p-4">
                                                                <div className="flex items-start justify-between mb-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <h3
                                                                            className={`text-base font-semibold truncate transition-colors ${
                                                                                isSelected ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-600'
                                                                            }`}>
                                                                            {resume.item?.firstname && resume.item?.lastname
                                                                                ? `${resume.item.firstname} ${resume.item.lastname}`
                                                                                : resume.item?.firstname || resume.item?.lastname || 'Untitled Resume'}
                                                                        </h3>
                                                                        <p className="text-sm text-slate-500 mt-1">
                                                                            Created {new Date(resume.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                                                                        </p>
                                                                        {resume.item?.title && <p className="text-sm text-slate-600 mt-1 truncate">{resume.item.title}</p>}
                                                                    </div>

                                                                    {/* Selection indicator */}
                                                                    <div className="flex-shrink-0 ml-3">
                                                                        <div
                                                                            className={`w-6 h-6 border-2 rounded-full transition-all duration-200 flex items-center justify-center ${
                                                                                isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-300 group-hover:border-blue-400'
                                                                            }`}>
                                                                            {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Action buttons */}
                                                                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleShowPreview(resume);
                                                                        }}
                                                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1">
                                                                        <FaEye className="w-3 h-3" />
                                                                        <span>Preview</span>
                                                                    </button>
                                                                    <span className={`text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>
                                                                        {isSelected ? 'Selected' : 'Click to select'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-16">
                                                <FaFile className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                                <h3 className="text-lg font-medium text-slate-900 mb-2">No resumes found</h3>
                                                <p className="text-sm text-slate-500">Create a resume first to apply for jobs</p>
                                            </div>
                                        )}

                                        {/* Pagination */}
                                        {userResumes.length > 0 && pagination.totalPages > 1 && (
                                            <div className="flex justify-center mt-8 mb-4 px-6">
                                                <div className="flex items-center space-x-3">
                                                    <button
                                                        onClick={() => setPageNumber(pagination.currentPage - 1)}
                                                        disabled={!pagination.hasPreviousPage || isPaginating}
                                                        className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                                                            pagination.hasPreviousPage && !isPaginating
                                                                ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        }`}>
                                                        <FaChevronRight className="transform rotate-180 w-4 h-4" />
                                                    </button>

                                                    <span className="text-gray-600 px-4 text-sm">
                                                        Page {pagination.currentPage} of {pagination.totalPages}
                                                    </span>

                                                    <button
                                                        onClick={() => setPageNumber(pagination.currentPage + 1)}
                                                        disabled={!pagination.hasNextPage || isPaginating}
                                                        className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                                                            pagination.hasNextPage && !isPaginating
                                                                ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                        }`}>
                                                        <FaChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Preview Modal */}
                        {showPreviewModal && previewResume && (
                            <motion.div
                                className="absolute inset-0 bg-white rounded-xl z-20 flex flex-col"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3 }}>
                                {/* Preview Header - Fixed */}
                                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                                    <div className="flex items-center space-x-3">
                                        <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-white/50 rounded-md transition-colors">
                                            <FaArrowLeft className="w-4 h-4 text-slate-500" />
                                        </button>
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900">Resume Preview</h2>
                                            <p className="text-sm text-slate-600">
                                                {previewResume.item?.firstname && previewResume.item?.lastname ? `${previewResume.item.firstname} ${previewResume.item.lastname}` : 'Resume Preview'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <button
                                            onClick={() => setShowPreviewModal(false)}
                                            className="px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors">
                                            Close
                                        </button>
                                        <button
                                            onClick={() => {
                                                handleResumeSelect(previewResume);
                                                setShowPreviewModal(false);
                                            }}
                                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                                            {t('JobsUpdate.JobApplicationModal.resume.selectThis', 'Select This Resume')}
                                        </button>
                                    </div>
                                </div>

                                {/* Preview Content - Scrollable */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50" style={{ maxHeight: 'calc(98vh - 160px)' }}>
                                    <div className="p-6">
                                        <div className="flex justify-center">
                                            <div className="bg-white shadow-lg rounded-lg p-6">
                                                {/* Resume container with proper scaling */}
                                                <div className="flex justify-center">
                                                    <div
                                                        className="bg-white shadow-md border border-gray-300 rounded-sm"
                                                        style={{
                                                            width: '595px',
                                                            height: '842px',
                                                            overflow: 'hidden',
                                                        }}>
                                                        <div
                                                            className="w-[794px] h-[1123px]"
                                                            style={{
                                                                transform: 'scale(0.75)',
                                                                transformOrigin: 'top left',
                                                            }}>
                                                            {renderTemplatePreview(previewResume)}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Resume info below preview */}
                                                <div className="mt-6 text-center">
                                                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                                        {previewResume.item?.firstname && previewResume.item?.lastname
                                                            ? `${previewResume.item.firstname} ${previewResume.item.lastname}`
                                                            : 'Resume Preview'}
                                                    </h3>
                                                    <p className="text-sm text-slate-600">{t('JobsUpdate.JobApplicationModal.resume.createdAt', 'Created {{date}}', { date: new Date(previewResume.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString() })}</p>
                                                    {previewResume.item?.title && <p className="text-sm text-slate-700 mt-1">{previewResume.item.title}</p>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const TranslatedJobApplicationModal = withTranslation('common')(JobApplicationModal);
export default TranslatedJobApplicationModal;
