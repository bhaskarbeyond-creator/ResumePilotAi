import { sanitizeUrl } from '../../utils/sanitizeHtml';
import React, { useState, useRef, useEffect, useMemo, useContext, useCallback } from 'react';
import { withTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaUser, FaEnvelope, FaPhone, FaLinkedin, FaGithub, FaFileUpload, FaBuilding, FaPaperPlane, FaCheckCircle, FaExclamationTriangle, FaBriefcase, FaFile, FaEye, FaArrowLeft, FaExpand, FaChevronRight, FaGraduationCap, FaCheck, FaSearch, FaThLarge, FaList, FaSpinner } from 'react-icons/fa';
import { FiBold, FiItalic, FiUnderline, FiList, FiHash } from 'react-icons/fi';
import { AuthContext } from '../../context/AuthContext';
import { getResumes, submitJobApplication } from '../../services/api/platform';
import { calculateAtsScore } from '../../utils/atsScore';
import { generateUserAiContent } from '../../services/aiService';
import TemplateRenderer from '../TemplateRenderer';
import { normalizeResumeData } from '../../utils/resumeData';

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
import { $getSelection, $isRangeSelection, $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { FORMAT_TEXT_COMMAND } from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';

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

// Simple toolbar for cover letter with 1-click quick pitch powered by AI
function CoverLetterToolbar({ job, applicantName, selectedResume }) {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [pitchSuccess, setPitchSuccess] = useState(false);

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

    const handleQuickPitch = async () => {
        if (isAiGenerating) return;
        setIsAiGenerating(true);
        setPitchSuccess(false);

        const company = job?.company || 'your team';
        const role = job?.title || 'this role';
        const candidate = applicantName || 'Candidate';

        // Extract candidate skill context from selected resume if available
        const resumeDoc = selectedResume?.data || selectedResume || {};
        const rawSkills = Array.isArray(resumeDoc.skills)
            ? resumeDoc.skills.map((s) => (typeof s === 'object' ? s.name || s.skillName || s.skill || '' : String(s))).filter(Boolean).slice(0, 10).join(', ')
            : '';
        const userSkills = rawSkills || 'modern full-stack architecture, high-performance web systems, and technical execution';

        const employments = Array.isArray(resumeDoc.employments) ? resumeDoc.employments : [];
        const yearsExp = employments.length > 0 ? `${Math.min(20, Math.max(1, employments.length * 2))}+` : '3+';
        const jobDesc = job?.description || (Array.isArray(job?.requirements) ? job.requirements.join(', ') : job?.requirements) || '';

        let pitchText = '';
        try {
            const aiResponse = await generateUserAiContent('generate-ai-cover-letter', {
                jobTitle: role,
                companyName: company,
                recipientName: 'Hiring Team',
                userSkills,
                candidateName: candidate,
                yearsExperience: yearsExp,
                jobDescription: jobDesc.slice(0, 3000),
                tone: 'impact',
            }, { timeoutMs: 25000 });

            if (aiResponse?.success && aiResponse.coverLetter) {
                pitchText = String(aiResponse.coverLetter).trim();
            }
        } catch (err) {
            console.warn('[QuickPitch AI] Fallback to synthesized ATS template:', err?.message);
        }

        // Robust offline/fallback synthesized ATS pitch if AI is unavailable or unauthenticated
        if (!pitchText) {
            pitchText = `Dear Hiring Team at ${company},\n\nI am excited to submit my application for the ${role} position. With ${yearsExp} years of specialized experience in ${userSkills}, I have consistently delivered measurable outcomes and driven scalable, resilient solutions.\n\nHaving followed ${company}'s industry presence, I am eager to bring my technical rigor, execution speed, and collaborative mindset to your team. Thank you for your time and consideration, and I look forward to speaking with you.\n\nSincerely,\n${candidate}`;
        }

        editor.update(() => {
            const root = $getRoot();
            root.clear();
            const paragraphs = pitchText.split(/\n\n+/).filter(Boolean);
            paragraphs.forEach((pText) => {
                const trimmed = pText.trim();
                if (trimmed) {
                    const p = $createParagraphNode();
                    p.append($createTextNode(trimmed));
                    root.append(p);
                }
            });
        });

        setIsAiGenerating(false);
        setPitchSuccess(true);
        setTimeout(() => setPitchSuccess(false), 4000);
    };

    return (
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2 p-2 bg-slate-50/90 rounded-t-lg border-b border-slate-200">
            <div className="flex items-center space-x-1">
                <button
                    type="button"
                    onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                    title="Bold"
                    className={`p-1.5 rounded hover:bg-slate-200/80 transition-colors ${isBold ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}>
                    <FiBold className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                    title="Italic"
                    className={`p-1.5 rounded hover:bg-slate-200/80 transition-colors ${isItalic ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}>
                    <FiItalic className="w-3.5 h-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                    title="Underline"
                    className={`p-1.5 rounded hover:bg-slate-200/80 transition-colors ${isUnderline ? 'bg-blue-100 text-blue-600' : 'text-slate-600'}`}>
                    <FiUnderline className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-slate-300 mx-1"></div>
                <button type="button" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} title="Bullet List" className="p-1.5 rounded hover:bg-slate-200/80 transition-colors text-slate-600">
                    <FiList className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} title="Numbered List" className="p-1.5 rounded hover:bg-slate-200/80 transition-colors text-slate-600">
                    <FiHash className="w-3.5 h-3.5" />
                </button>
            </div>

            <button
                type="button"
                onClick={handleQuickPitch}
                disabled={isAiGenerating}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-2xs cursor-pointer ${
                    isAiGenerating
                        ? 'bg-blue-100 text-blue-500 cursor-wait'
                        : pitchSuccess
                        ? 'bg-emerald-600 text-white shadow-emerald-200'
                        : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 active:scale-95'
                }`}>
                {isAiGenerating ? (
                    <>
                        <FaSpinner className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Generating ATS Pitch with AI...</span>
                    </>
                ) : pitchSuccess ? (
                    <>
                        <FaCheck className="w-3.5 h-3.5" />
                        <span>✓ Tailored Pitch Generated!</span>
                    </>
                ) : (
                    <span>⚡ 1-Click Quick Pitch</span>
                )}
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
    const submissionGeneration = useRef(0);
    const closeTimer = useRef(null);
    const [resumeSearchQuery, setResumeSearchQuery] = useState('');
    const [resumeViewMode, setResumeViewMode] = useState('grid');

    const filteredResumes = useMemo(() => {
        if (!resumeSearchQuery.trim()) return userResumes;
        const q = resumeSearchQuery.toLowerCase().trim();
        return userResumes.filter((r) => {
            const title = (r.item?.title || r.title || '').toLowerCase();
            const occupation = (r.item?.occupation || '').toLowerCase();
            const template = (r.template || r.item?.template || '').toLowerCase();
            const employments = (r.employments || r.item?.employments || []);
            const empNames = employments.map(e => `${e.employer || ''} ${e.jobTitle || ''}`).join(' ').toLowerCase();
            return title.includes(q) || occupation.includes(q) || template.includes(q) || empNames.includes(q);
        });
    }, [userResumes, resumeSearchQuery]);

    // Pagination state
    const [_currentPage, setCurrentPage] = useState(1);
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
        if (!applicationData.phone.trim()) {
            newErrors.phone = 'Required';
        } else if (!/^\+?[0-9 ()-]{7,30}$/.test(applicationData.phone.trim())) {
            newErrors.phone = 'Valid phone required (min 7 digits)';
        }

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

    // Reset form and auto-prefill when modal opens
    useEffect(() => {
        submissionGeneration.current += 1;
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = null;
        if (isOpen) {
            setApplicationData({
                fullName: user?.displayName || '',
                email: user?.email || '',
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

            // Automatically pre-load candidate resumes and select primary/latest
            if (user?.uid) {
                getResumes(user.uid, 1, perPage)
                    .then((response) => {
                        if (response && response.resumes && response.resumes.length > 0) {
                            setUserResumes(response.resumes);
                            if (response.pagination) setPagination(response.pagination);
                            const firstResume = response.resumes[0];
                            const displayTitle = resolveResumeDisplayTitle(firstResume, response.resumes);
                            setApplicationData((prev) => ({
                                ...prev,
                                selectedResume: prev.selectedResume || {
                                    id: firstResume.id,
                                    name: displayTitle,
                                    shareableLink: `${window.location.origin}/shared/${firstResume.id}`,
                                    data: firstResume,
                                },
                            }));
                        }
                    })
                    .catch(() => {});
            }
        }
        return () => {
            submissionGeneration.current += 1;
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, [isOpen, job?.id, user?.uid, user?.displayName, user?.email]);

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
            if (e.key === 'Escape' && !isSubmitting) {
                if (showPreviewModal) {
                    setShowPreviewModal(false);
                } else if (showResumeSelector) {
                    setShowResumeSelector(false);
                } else {
                    onClose();
                }
            }
        };
        if (isOpen) document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose, isSubmitting, showPreviewModal, showResumeSelector]);

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

    // Helper to resolve clean, distinctive title for a resume
    const resolveResumeDisplayTitle = (resume, allResumes = []) => {
        const rawTitle = (resume?.item?.title || resume?.title || '').trim();
        const hasCustomTitle = Boolean(rawTitle && rawTitle.toLowerCase() !== 'untitled resume');
        let baseTitle = '';
        if (hasCustomTitle) {
            baseTitle = rawTitle;
        } else {
            const occupation = (resume?.item?.occupation || '').trim();
            if (occupation) {
                baseTitle = `${occupation} Resume`;
            } else {
                const candidateName = [resume?.item?.firstname, resume?.item?.lastname].filter(Boolean).join(' ').trim();
                const templateName = resume?.template || resume?.item?.template;

                if (candidateName && templateName) baseTitle = `${candidateName} (${templateName})`;
                else if (candidateName) baseTitle = `${candidateName}'s Resume`;
                else if (templateName) baseTitle = `${templateName} Resume`;
                else baseTitle = 'Resume';
            }
        }

        if (Array.isArray(allResumes) && allResumes.length > 1) {
            const matches = allResumes.filter((r) => {
                const rRaw = (r?.item?.title || r?.title || '').trim();
                const rCustom = Boolean(rRaw && rRaw.toLowerCase() !== 'untitled resume');
                const rTitle = rCustom ? rRaw : (r?.item?.occupation ? `${r.item.occupation} Resume` : '');
                return rTitle === baseTitle;
            });
            if (matches.length > 1) {
                const idx = matches.findIndex((r) => r.id === resume?.id);
                if (idx >= 0) {
                    baseTitle = `${baseTitle} (v${idx + 1})`;
                }
            }
        }

        return baseTitle;
    };

    // Handle resume selection
    const handleResumeSelect = (resume) => {
        if (!resume) return;
        const resumeId = resume.id || resume.data?.id || '';
        const rawDoc = resume.data || resume;
        const shareableLink = `${window.location.origin}/shared/${resumeId}`;
        const displayTitle = resolveResumeDisplayTitle(rawDoc, userResumes);

        setApplicationData((prev) => ({
            ...prev,
            selectedResume: {
                id: resumeId,
                name: displayTitle,
                shareableLink: shareableLink,
                data: rawDoc,
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
        fetchUserResumes(true, pageNumber);
    };

    // Show resume selector
    const handleShowResumeSelector = () => {
        setShowResumeSelector(true);
        if (userResumes.length === 0) {
            fetchUserResumes();
        }
    };

    // Helper to resolve canonical template name
    const getCanonicalTemplateId = (doc) => {
        const raw = doc?.template || doc?.item?.template || doc?.data?.template || 'Cv1';
        const matchCv = String(raw).match(/^cv\s*(\d+)$/i);
        if (matchCv) return `Cv${matchCv[1]}`;
        const matchCover = String(raw).match(/^cover\s*(\d+)$/i);
        if (matchCover) return `Cover${matchCover[1]}`;
        return raw || 'Cv1';
    };

    // Render template component with TemplateRenderer and normalizeResumeData
    const renderTemplatePreview = (document) => {
        if (!document) return null;
        const rawData = document.item || document.data || document;
        const templateId = getCanonicalTemplateId(document);
        const cvData = normalizeResumeData(rawData, { template: templateId });

        return (
            <TemplateRenderer
                templateId={templateId}
                values={cvData}
                language="en"
                loadingFallback={
                    <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                        <div className="animate-pulse text-slate-400 text-sm font-medium">Loading preview...</div>
                    </div>
                }
                errorFallback={
                    <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                        <div className="text-slate-400 text-xs">Preview unavailable</div>
                    </div>
                }
            />
        );
    };

    // Handle preview modal
    const handleShowPreview = (resume) => {
        if (!resume) return;
        const resolved = resume.data || resume;
        setPreviewResume(resolved);
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

        const generation = ++submissionGeneration.current;
        const accountUid = user.uid;
        const targetJobId = job.id;
        setIsSubmitting(true);
        setErrors({});

        try {
            // Build the bounded application payload; identity and resume data are resolved by the backend.
            const sanitizedApplicationData = {
                fullName: applicationData.fullName || '',
                email: applicationData.email || '',
                phone: applicationData.phone || '',
                linkedinUrl: applicationData.linkedinUrl || '',
                githubUrl: applicationData.githubUrl || '',
                coverLetter: applicationData.coverLetter || '',
                resumeId: applicationData.selectedResume?.id || '',
                selectedResume: applicationData.selectedResume ? { id: applicationData.selectedResume.id || '', name: applicationData.selectedResume.name || '' } : null,
            };

            const result = await submitJobApplication(accountUid, targetJobId, sanitizedApplicationData);
            if (generation !== submissionGeneration.current || user.uid !== accountUid || job.id !== targetJobId) return;
            if (result.success) {
                setIsSubmitted(true);
                closeTimer.current = setTimeout(() => onClose(), 2500);
            } else {
                setErrors({ submit: result.error || 'Failed to submit application. Please try again.' });
            }
        } catch (error) {
            if (generation === submissionGeneration.current) setErrors({ submit: error.message || 'An unexpected error occurred. Please try again.' });
        } finally {
            if (generation === submissionGeneration.current) setIsSubmitting(false);
        }
    };

    // Helper to compute display info for preview modal
    const previewCandidateName = [
        previewResume?.item?.firstname || previewResume?.firstname,
        previewResume?.item?.lastname || previewResume?.lastname,
    ].filter(Boolean).join(' ');
    const previewDisplayName = previewCandidateName || previewResume?.name || previewResume?.title || previewResume?.item?.title || 'Resume Preview';
    const previewTitle = previewResume?.item?.title || previewResume?.title || previewResume?.occupation || previewResume?.item?.occupation || '';
    const previewDateFormatted = (() => {
        const raw = previewResume?.createdAt || previewResume?.updatedAt;
        if (!raw) return new Date().toLocaleDateString();
        if (typeof raw === 'object' && typeof raw.seconds === 'number') {
            return new Date(raw.seconds * 1000).toLocaleDateString();
        }
        const parsed = new Date(raw);
        return isNaN(parsed.getTime()) ? new Date().toLocaleDateString() : parsed.toLocaleDateString();
    })();

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[10001] flex items-center justify-center p-3"
                    variants={backdropVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    role="presentation"
                    onKeyDown={event => { if (event.key === 'Escape' && !isSubmitting) onClose(); }}
                    onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <motion.div role="dialog" aria-modal="true" aria-labelledby={isSubmitted ? 'job-application-success-title' : 'job-application-title'} className={`relative bg-white rounded-2xl shadow-2xl w-full ${showResumeSelector ? 'max-w-4xl lg:max-w-5xl' : 'max-w-2xl'} max-h-[94vh] overflow-hidden flex flex-col border border-slate-100 transition-all duration-300`} variants={modalVariants} onClick={(e) => e.stopPropagation()}>
                        <AnimatePresence mode="wait">
                            {isSubmitted ? (
                                <motion.div key="success" className="p-8 text-center my-auto" variants={successVariants} initial="hidden" animate="visible">
                                    <motion.div
                                        className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: 0.1, type: 'spring' }}>
                                        <FaCheckCircle className="w-7 h-7 text-emerald-600" />
                                    </motion.div>
                                    <h3 id="job-application-success-title" className="text-xl font-bold text-slate-900 mb-2">{t('JobsUpdate.JobApplicationModal.success.title', 'Application Submitted!')}</h3>
                                    <p className="text-slate-600 text-sm max-w-md mx-auto leading-relaxed">
                                        {t('JobsUpdate.JobApplicationModal.success.message', "Your application has been successfully submitted. We'll be in touch soon.")}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div key="form" className="h-full flex flex-col">
                                    {/* Executive Modal Header */}
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/90 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white">
                                        <div className="flex items-center space-x-3 min-w-0">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0">
                                                {job?.company ? job.company.charAt(0).toUpperCase() : <FaBriefcase className="w-4 h-4 text-white" />}
                                            </div>
                                            <div className="min-w-0">
                                                <h2 id="job-application-title" className="text-base sm:text-lg font-bold text-slate-900 truncate">
                                                    {t('JobsUpdate.JobApplicationModal.title', 'Apply for {{jobTitle}}', { jobTitle: job?.title || 'Role' })}
                                                </h2>
                                                <div className="flex items-center gap-2 text-xs text-slate-600 font-medium truncate mt-0.5">
                                                    <span className="font-semibold text-slate-800">{job?.company}</span>
                                                    {job?.location && <span>• {job.location}</span>}
                                                    {job?.type && (
                                                        <span className="capitalize px-1.5 py-0.5 rounded bg-blue-100/60 text-blue-700 font-semibold text-[10px]">
                                                            {job.type}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            aria-label="Close job application"
                                            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0 cursor-pointer"
                                            disabled={isSubmitting}>
                                            <FaTimes className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Modal Form */}
                                    <div className="flex-1 overflow-y-auto">
                                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                                            {/* Candidate Contact Info */}
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                                                        <input
                                                            type="text"
                                                            name="fullName"
                                                            value={applicationData.fullName}
                                                            onChange={handleInputChange}
                                                            className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none transition-all ${
                                                                errors.fullName ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                            }`}
                                                            placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.fullName', 'Full Name') + ' *'}
                                                        />
                                                        {errors.fullName && <p className="text-xs text-red-600 mt-1 font-medium">{errors.fullName}</p>}
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                                                        <input
                                                            type="email"
                                                            name="email"
                                                            value={applicationData.email}
                                                            onChange={handleInputChange}
                                                            readOnly={Boolean(user?.email)}
                                                            title={user?.email ? "Applications use your verified account email" : "Enter your email address"}
                                                            className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none transition-all ${
                                                                errors.email ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                            } ${user?.email ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : 'bg-white text-slate-900'}`}
                                                            placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.email', 'Email Address') + ' *'}
                                                        />
                                                        {errors.email && <p className="text-xs text-red-600 mt-1 font-medium">{errors.email}</p>}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                                                    <input
                                                        type="tel"
                                                        name="phone"
                                                        value={applicationData.phone}
                                                        onChange={handleInputChange}
                                                        className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none transition-all ${
                                                            errors.phone ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-blue-500'
                                                        }`}
                                                        placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.phone', 'Phone Number') + ' *'}
                                                    />
                                                    {errors.phone && <p className="text-xs text-red-600 mt-1 font-medium">{errors.phone}</p>}
                                                </div>
                                            </div>

                                            {/* Professional Profiles */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">LinkedIn Profile</label>
                                                    <input
                                                        type="url"
                                                        name="linkedinUrl"
                                                        value={applicationData.linkedinUrl}
                                                        onChange={handleInputChange}
                                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                                                        placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.linkedin', 'LinkedIn Profile URL') + ' (' + t('common:optional', 'optional') + ')'}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">GitHub / Portfolio</label>
                                                    <input
                                                        type="url"
                                                        name="githubUrl"
                                                        value={applicationData.githubUrl}
                                                        onChange={handleInputChange}
                                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                                                        placeholder={t('JobsUpdate.JobApplicationModal.personalInfo.github', 'GitHub/Portfolio URL') + ' (' + t('common:optional', 'optional') + ')'}
                                                    />
                                                </div>
                                            </div>

                                            {/* Resume Selection Card */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">Resume Document</label>
                                                <div className={`rounded-xl p-3.5 transition-all ${
                                                    applicationData.selectedResume
                                                        ? 'border border-emerald-300 bg-emerald-50/40 shadow-2xs'
                                                        : errors.resume
                                                        ? 'border-2 border-dashed border-red-300 bg-red-50/20'
                                                        : 'border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50'
                                                }`}>
                                                    {applicationData.selectedResume ? (
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center space-x-3 min-w-0">
                                                                <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                                                                    <FaFile className="w-4 h-4" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-bold text-slate-900 truncate">
                                                                            {applicationData.selectedResume.name}
                                                                        </span>
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                                                            <FaCheck className="w-2 h-2" /> Selected
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center space-x-2 mt-0.5 text-xs">
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleShowResumeSelector}
                                                                            className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer">
                                                                            {t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}
                                                                        </button>
                                                                        <span className="text-slate-300">•</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const resumeToPreview = applicationData.selectedResume?.data || applicationData.selectedResume;
                                                                                handleShowPreview(resumeToPreview);
                                                                            }}
                                                                            className="text-slate-600 hover:text-blue-600 font-medium flex items-center space-x-1 cursor-pointer">
                                                                            <FaEye className="w-3 h-3 text-slate-400" />
                                                                            <span>{t('JobsUpdate.JobApplicationModal.resume.preview', 'Preview Resume')}</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setApplicationData((prev) => ({ ...prev, selectedResume: null }))}
                                                                title="Remove selection"
                                                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer flex-shrink-0">
                                                                <FaTimes className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-2">
                                                            <FaFileUpload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                                                            <p className="text-xs sm:text-sm text-slate-700 font-medium">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleShowResumeSelector}
                                                                    className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer">
                                                                    {t('JobsUpdate.JobApplicationModal.resume.selectResume', 'Select Resume')}
                                                                </button>{' '}
                                                                {t('common:fromYourProfile', 'from your profile')}
                                                            </p>
                                                            <p className="text-xs text-slate-500 mt-0.5">
                                                                {t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                {errors.resume && <p className="text-xs text-red-600 mt-1 font-medium">{errors.resume}</p>}
                                            </div>

                                            {/* Rich Text Cover Letter with 1-Click Pitch */}
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-xs font-bold text-slate-700">Cover Letter *</label>
                                                    <span className="text-[11px] text-slate-500 font-medium">50–1,000 characters</span>
                                                </div>
                                                <div className={`border rounded-xl ${errors.coverLetter ? 'border-red-300' : 'border-slate-300'} overflow-hidden transition-all focus-within:border-blue-500`}>
                                                    <LexicalComposer
                                                        initialConfig={{
                                                            namespace: 'CoverLetterEditor',
                                                            theme: coverLetterTheme,
                                                            onError: (error) => console.error('Lexical error:', error),
                                                            nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, AutoLinkNode, LinkNode],
                                                        }}>
                                                        <CoverLetterToolbar job={job} applicantName={applicationData.fullName} selectedResume={applicationData.selectedResume} />
                                                        <div className="relative">
                                                            <RichTextPlugin
                                                                contentEditable={<ContentEditable className="min-h-[85px] max-h-[180px] overflow-y-auto px-3.5 py-2.5 text-sm focus:outline-none leading-relaxed" />}
                                                                placeholder={
                                                                    <div className="absolute top-2.5 left-3.5 text-slate-400 text-sm pointer-events-none">
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
                                                <div className="flex justify-between items-center mt-1 text-xs">
                                                    {errors.coverLetter ? (
                                                        <p className="text-red-600 font-medium">{errors.coverLetter}</p>
                                                    ) : (
                                                        <p className="text-slate-500 text-[11px]">Click "⚡ 1-Click Quick Pitch" to generate a tailored note with AI.</p>
                                                    )}
                                                    <span className={`ml-auto font-medium ${
                                                        applicationData.coverLetter.replace(/<[^>]*>/g, '').trim().length >= 50
                                                            ? 'text-emerald-600 font-bold'
                                                            : 'text-slate-500'
                                                    }`}>
                                                        {applicationData.coverLetter.replace(/<[^>]*>/g, '').length}/1000 {t('common:characters', 'characters')}
                                                        {applicationData.coverLetter.replace(/<[^>]*>/g, '').trim().length >= 50 && ' ✓'}
                                                    </span>
                                                </div>
                                            </div>

                                            {errors.submit && (
                                                <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                                    <FaExclamationTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                                    <p className="text-xs text-red-600 font-medium">{errors.submit}</p>
                                                </div>
                                            )}
                                        </form>
                                    </div>

                                    {/* Executive Footer */}
                                    <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 bg-slate-50">
                                        <div className="text-xs text-slate-500 font-medium hidden sm:block">
                                            {isFormValid ? (
                                                <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                                                    <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                                    Application details complete
                                                </span>
                                            ) : (
                                                <span className="text-amber-700 flex items-center gap-1">
                                                    <FaExclamationTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                    Required: name, valid phone, 50+ char note
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center space-x-2.5 ml-auto">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-700 rounded-xl hover:bg-white hover:border-slate-400 transition-all cursor-pointer"
                                                disabled={isSubmitting}>
                                                {t('JobsUpdate.JobApplicationModal.buttons.cancel', 'Cancel')}
                                            </button>
                                            <button
                                                onClick={handleSubmit}
                                                disabled={!isFormValid || isSubmitting}
                                                className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-indigo-800 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:shadow-blue-500/25 transition-all duration-200 flex items-center space-x-2 active:scale-95 cursor-pointer">
                                                {isSubmitting ? (
                                                    <>
                                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        <span>{t('JobsUpdate.JobApplicationModal.buttons.submitting', 'Submitting...')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <FaPaperPlane className="w-3.5 h-3.5" />
                                                        <span>{t('JobsUpdate.JobApplicationModal.buttons.submit', 'Submit Application')}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
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
                                <div className="flex-shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-slate-50">
                                    <div className="flex items-center space-x-3 min-w-0">
                                        <button
                                            onClick={() => setShowResumeSelector(false)}
                                            className="p-2 hover:bg-white/80 rounded-xl transition-all duration-200 text-slate-600 hover:text-slate-900 border border-transparent hover:border-slate-200 cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                                            title="Back to application">
                                            <FaArrowLeft className="w-4 h-4" />
                                        </button>
                                        <div className="min-w-0">
                                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                                                {t('JobsUpdate.JobApplicationModal.resume.selectResume', 'Select Resume')}
                                            </h2>
                                            <p className="text-xs sm:text-sm text-slate-600 truncate font-medium">
                                                {userResumes.length > 0
                                                    ? `${filteredResumes.length}${filteredResumes.length !== userResumes.length ? ` of ${userResumes.length}` : ''} ${userResumes.length === 1 ? 'saved resume' : 'saved resumes'} • Choose the best match for this role`
                                                    : t('JobsUpdate.JobApplicationModal.resume.browseResumes', 'Browse Resumes')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2.5">
                                        {userResumes.length > 1 && (
                                             <div className="relative w-36 sm:w-56">
                                                <FaSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={resumeSearchQuery}
                                                    onChange={(e) => setResumeSearchQuery(e.target.value)}
                                                    placeholder="Filter resumes..."
                                                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs transition-all"
                                                />
                                                {resumeSearchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setResumeSearchQuery('')}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer">
                                                        <FaTimes className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* View Mode Toggle: Grid vs List */}
                                        <div className="hidden sm:flex items-center bg-slate-200/80 p-0.5 rounded-xl border border-slate-300/60">
                                            <button
                                                type="button"
                                                onClick={() => setResumeViewMode('grid')}
                                                title="Grid View"
                                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                    resumeViewMode === 'grid'
                                                        ? 'bg-white text-blue-600 shadow-xs font-bold'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                }`}>
                                                <FaThLarge className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setResumeViewMode('list')}
                                                title="List View"
                                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                    resumeViewMode === 'list'
                                                        ? 'bg-white text-blue-600 shadow-xs font-bold'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                }`}>
                                                <FaList className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Resume List */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-slate-50/50">
                                    <div className="p-4 sm:p-6 pb-8">
                                        {loadingResumes || isPaginating ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                                {[...Array(perPage)].map((_, index) => (
                                                    <div key={index} className="animate-pulse bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                                                        <div className="h-48 bg-slate-200"></div>
                                                        <div className="p-4 space-y-2">
                                                            <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                                                            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : filteredResumes.length > 0 ? (
                                            <div className={resumeViewMode === 'list' ? 'flex flex-col space-y-3.5' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'}>
                                                {filteredResumes.map((resume) => {
                                                    const isSelected = applicationData.selectedResume?.id === resume.id;
                                                    const templateName = resume.template || resume.item?.template;
                                                    const displayTitle = resolveResumeDisplayTitle(resume, userResumes);

                                                    // Differentiator data
                                                    const employments = Array.isArray(resume.employments) ? resume.employments : (Array.isArray(resume.item?.employments) ? resume.item.employments : []);
                                                    const educations = Array.isArray(resume.educations) ? resume.educations : (Array.isArray(resume.item?.educations) ? resume.item.educations : []);
                                                    const skills = Array.isArray(resume.skills) ? resume.skills : (Array.isArray(resume.item?.skills) ? resume.item.skills : []);

                                                    const topEmployer = employments[0]?.employer || employments[0]?.company || '';
                                                    const topRole = employments[0]?.jobTitle || employments[0]?.position || '';
                                                    const topEducation = educations[0]?.school || educations[0]?.institution || educations[0]?.degree || '';

                                                    // ATS score
                                                    let atsScore = 0;
                                                    try {
                                                        atsScore = calculateAtsScore(resume.item || resume)?.qualityScore || 0;
                                                    } catch (_err) {
                                                        atsScore = 0;
                                                    }

                                                    // Created / updated date
                                                    const dateVal = resume.item?.updated_at || resume.updatedAt || resume.item?.created_at || resume.createdAt;
                                                    const dateObj = dateVal?.seconds ? new Date(dateVal.seconds * 1000) : dateVal ? new Date(dateVal) : new Date();
                                                    const formattedDate = dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

                                                    if (resumeViewMode === 'list') {
                                                        return (
                                                            <div
                                                                key={resume.id}
                                                                className={`group bg-white border-2 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col sm:flex-row items-stretch overflow-hidden hover:shadow-lg ${
                                                                    isSelected
                                                                        ? 'border-blue-600 shadow-md ring-2 ring-blue-500/20 bg-blue-50/15'
                                                                        : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50/60'
                                                                }`}
                                                                onClick={() => handleResumeSelect(resume)}>
                                                                {/* List Mode Mini Thumbnail */}
                                                                <div className="w-full sm:w-36 h-36 sm:h-auto bg-gradient-to-br from-slate-100 to-slate-200/80 border-b sm:border-b-0 sm:border-r border-slate-200 flex-shrink-0 flex items-center justify-center relative overflow-hidden p-2">
                                                                    <div
                                                                        className="bg-white shadow-xs border border-slate-200 rounded-sm overflow-hidden"
                                                                        style={{ width: '100px', height: '141px' }}>
                                                                        <div
                                                                            className="w-[794px] h-[1123px] origin-top-left"
                                                                            style={{ transform: 'scale(0.126)', transformOrigin: 'top left' }}>
                                                                            {renderTemplatePreview(resume)}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleShowPreview(resume);
                                                                        }}
                                                                        className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all cursor-pointer"
                                                                        title="Expand preview">
                                                                        <div className="opacity-0 group-hover:opacity-100 bg-white/95 text-slate-800 p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110">
                                                                            <FaExpand className="w-3.5 h-3.5" />
                                                                        </div>
                                                                    </button>
                                                                </div>

                                                                {/* List Mode Info */}
                                                                <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between space-y-3">
                                                                    <div>
                                                                        <div className="flex items-start justify-between gap-3">
                                                                            <div className="min-w-0 flex-1">
                                                                                <h3 className={`text-base font-bold truncate leading-snug transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-600'}`} title={displayTitle}>
                                                                                    {displayTitle}
                                                                                </h3>
                                                                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                                                                                    {topEmployer ? (
                                                                                        <span className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                                                                                            <FaBriefcase className="w-3 h-3 text-blue-500 shrink-0" />
                                                                                            <span className="truncate">{topRole ? `${topRole} at ${topEmployer}` : topEmployer}</span>
                                                                                        </span>
                                                                                    ) : topEducation ? (
                                                                                        <span className="text-slate-700 flex items-center gap-1.5 truncate">
                                                                                            <FaGraduationCap className="w-3 h-3 text-blue-500 shrink-0" />
                                                                                            <span className="truncate">{topEducation}</span>
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 italic">No experience listed</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${atsScore >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : atsScore >= 50 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                                                    ATS: {atsScore}%
                                                                                </span>
                                                                                {templateName && (
                                                                                    <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                                                        {templateName}
                                                                                    </span>
                                                                                )}
                                                                                <span className="text-slate-400 text-xs font-medium pl-1">{formattedDate}</span>
                                                                            </div>
                                                                        </div>

                                                                        {/* Skills Pill Preview */}
                                                                        {skills.length > 0 && (
                                                                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                                                                {skills.slice(0, 5).map((sk, skIdx) => (
                                                                                    <span key={skIdx} className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                                                                                        {sk.skillName || sk.name || sk.skill}
                                                                                    </span>
                                                                                ))}
                                                                                {skills.length > 5 && (
                                                                                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                                                                        +{skills.length - 5}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* List Footer Actions */}
                                                                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 gap-2">
                                                                        <div className="text-xs text-slate-500 font-medium">
                                                                            <span>{employments.length} {employments.length === 1 ? 'role' : 'roles'}</span>
                                                                            <span className="mx-1.5">•</span>
                                                                            <span>{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</span>
                                                                            {educations.length > 0 && (
                                                                                <>
                                                                                    <span className="mx-1.5">•</span>
                                                                                    <span>{educations.length} {educations.length === 1 ? 'education' : 'educations'}</span>
                                                                                </>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex items-center space-x-2">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleShowPreview(resume);
                                                                                }}
                                                                                type="button"
                                                                                className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center space-x-1.5 py-1.5 px-3 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                                                                                <FaEye className="w-3.5 h-3.5 text-slate-400" />
                                                                                <span>Preview</span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleResumeSelect(resume)}
                                                                                className={`text-xs font-bold px-4 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                                                                                    isSelected
                                                                                        ? 'bg-blue-600 text-white shadow-xs'
                                                                                        : 'border border-slate-300 hover:border-blue-400 text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50/50'
                                                                                }`}>
                                                                                {isSelected ? (
                                                                                    <>
                                                                                        <FaCheck className="w-3 h-3" />
                                                                                        <span>Selected</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <span>Select Resume</span>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            key={resume.id}
                                                            className={`group relative bg-white border-2 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden hover:shadow-lg ${
                                                                isSelected
                                                                    ? 'border-blue-600 shadow-md ring-2 ring-blue-500/20 bg-blue-50/15'
                                                                    : 'border-slate-200 hover:border-blue-300/80 hover:-translate-y-0.5'
                                                            }`}
                                                            onClick={() => handleResumeSelect(resume)}>
                                                            {/* Selection badge */}
                                                            <div className="absolute top-3 right-3 z-10">
                                                                {isSelected ? (
                                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-blue-600 px-2.5 py-1 rounded-full shadow-md">
                                                                        <FaCheck className="w-3 h-3" /> Selected
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center text-xs font-semibold text-slate-600 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full border border-slate-200/90 shadow-2xs group-hover:border-blue-400 group-hover:text-blue-600 transition-colors">
                                                                        Click to select
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Resume Preview Thumbnail */}
                                                            <div className="relative h-48 sm:h-52 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/70 overflow-hidden border-b border-slate-100 flex items-center justify-center p-2">
                                                                <div
                                                                    className="bg-white shadow-xs border border-slate-200 rounded-sm overflow-hidden"
                                                                    style={{
                                                                        width: '180px',
                                                                        height: '254px',
                                                                    }}>
                                                                    <div
                                                                        className="w-[794px] h-[1123px] origin-top-left"
                                                                        style={{
                                                                            transform: 'scale(0.226)',
                                                                            transformOrigin: 'top left',
                                                                        }}>
                                                                        {renderTemplatePreview(resume)}
                                                                    </div>
                                                                </div>

                                                                {/* Preview overlay */}
                                                                <div className="absolute inset-0 bg-transparent group-hover:bg-black/15 transition-all duration-300 flex items-center justify-center">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleShowPreview(resume);
                                                                        }}
                                                                        className="opacity-0 group-hover:opacity-100 bg-white/95 hover:bg-white text-slate-800 p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer"
                                                                        title="Expand preview">
                                                                        <FaExpand className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Resume Info */}
                                                            <div className="p-4 sm:p-4.5 flex-1 flex flex-col justify-between space-y-3">
                                                                <div>
                                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                                        <h3
                                                                            className={`text-sm sm:text-base font-bold line-clamp-1 leading-snug transition-colors flex-1 ${
                                                                                isSelected ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-600'
                                                                            }`}
                                                                            title={displayTitle}>
                                                                            {displayTitle}
                                                                        </h3>
                                                                    </div>

                                                                    {/* Metadata Badges Row */}
                                                                    <div className="flex items-center gap-1.5 flex-wrap text-xs mb-2.5">
                                                                        <span
                                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                                                                atsScore >= 75
                                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                                    : atsScore >= 50
                                                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                            }`}
                                                                            title="ATS Readiness Score">
                                                                            ATS: {atsScore}%
                                                                        </span>

                                                                        {templateName && (
                                                                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                                                {templateName}
                                                                            </span>
                                                                        )}

                                                                        <span className="text-slate-400 text-[11px] ml-auto font-medium">
                                                                            {formattedDate}
                                                                        </span>
                                                                    </div>

                                                                    {/* Differentiator Snapshot Box */}
                                                                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                                                                        {topEmployer ? (
                                                                            <div className="flex items-center gap-1.5 text-slate-800 font-semibold truncate">
                                                                                <FaBriefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                                <span className="truncate">{topRole ? `${topRole} • ${topEmployer}` : topEmployer}</span>
                                                                            </div>
                                                                        ) : topEducation ? (
                                                                            <div className="flex items-center gap-1.5 text-slate-800 font-semibold truncate">
                                                                                <FaGraduationCap className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                                                <span className="truncate">{topEducation}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-slate-400 italic text-[11px]">
                                                                                Ready for application
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                                            <span>{employments.length} {employments.length === 1 ? 'role' : 'roles'}</span>
                                                                            <span>•</span>
                                                                            <span>{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</span>
                                                                            {educations.length > 0 && (
                                                                                <>
                                                                                    <span>•</span>
                                                                                    <span>{educations.length} {educations.length === 1 ? 'edu' : 'edus'}</span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Action buttons */}
                                                                <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleShowPreview(resume);
                                                                        }}
                                                                        type="button"
                                                                        className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center space-x-1.5 py-1.5 px-2.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                                                                        <FaEye className="w-3.5 h-3.5 text-slate-400" />
                                                                        <span>Preview</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleResumeSelect(resume)}
                                                                        className={`text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center space-x-1 cursor-pointer ${
                                                                            isSelected
                                                                                ? 'bg-blue-600 text-white shadow-xs'
                                                                                : 'border border-slate-300 hover:border-blue-400 text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50/50'
                                                                        }`}>
                                                                        {isSelected ? (
                                                                            <>
                                                                                <FaCheck className="w-3 h-3" />
                                                                                <span>Selected</span>
                                                                            </>
                                                                        ) : (
                                                                            <span>Select Resume</span>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                        ) : userResumes.length > 0 ? (
                                            <div className="text-center py-16">
                                                <FaSearch className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                                <h3 className="text-base font-semibold text-slate-800 mb-1">No resumes match "{resumeSearchQuery}"</h3>
                                                <button
                                                    type="button"
                                                    onClick={() => setResumeSearchQuery('')}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 underline mt-2">
                                                    Clear filter
                                                </button>
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
                                className="absolute inset-0 bg-white rounded-2xl z-30 flex flex-col overflow-hidden"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.25 }}>
                                {/* Preview Header - Fixed */}
                                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/50">
                                    <div className="flex items-center space-x-3 min-w-0">
                                        <button
                                            type="button"
                                            onClick={() => setShowPreviewModal(false)}
                                            className="p-2 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer text-slate-600"
                                            title="Back">
                                            <FaArrowLeft className="w-4 h-4" />
                                        </button>
                                        <div className="min-w-0">
                                            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">Resume Preview</h2>
                                            <p className="text-xs text-slate-500 truncate">
                                                {previewDisplayName}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 sm:space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowPreviewModal(false)}
                                            className="px-3.5 py-2 text-xs sm:text-sm font-semibold border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                                            Close
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleResumeSelect(previewResume);
                                                setShowPreviewModal(false);
                                            }}
                                            className="px-4 py-2 text-xs sm:text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-all cursor-pointer flex items-center gap-1.5">
                                            <FaCheck className="w-3 h-3" />
                                            <span>{t('JobsUpdate.JobApplicationModal.resume.selectThis', 'Select This Resume')}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Preview Content - Scrollable */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-100/80 p-4 sm:p-6" style={{ maxHeight: 'calc(94vh - 120px)' }}>
                                    <div className="flex justify-center">
                                        <div className="bg-white shadow-xl rounded-xl p-4 sm:p-6 max-w-full">
                                            {/* Resume container with proper scaling */}
                                            <div className="flex justify-center overflow-auto">
                                                <div
                                                    className="bg-white shadow-md border border-gray-200 rounded-sm"
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
                                            <div className="mt-5 text-center">
                                                <h3 className="text-base font-bold text-slate-900">
                                                    {previewDisplayName}
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {t('JobsUpdate.JobApplicationModal.resume.createdAt', 'Created {{date}}', {
                                                        date: previewDateFormatted,
                                                    })}
                                                </p>
                                                {previewTitle && (
                                                    <p className="text-xs font-medium text-slate-700 mt-1">
                                                        {previewTitle}
                                                    </p>
                                                )}
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
