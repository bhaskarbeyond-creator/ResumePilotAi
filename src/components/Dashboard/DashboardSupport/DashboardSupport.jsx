import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FiLifeBuoy,
    FiPlus,
    FiSearch,
    FiRefreshCw,
    FiSend,
    FiClock,
    FiCheckCircle,
    FiAlertCircle,
    FiUser,
    FiShield,
    FiX,
    FiArrowLeft,
    FiMessageSquare,
    FiInbox,
    FiHelpCircle,
    FiChevronDown,
    FiChevronUp,
    FiBook,
    FiFileText,
    FiCreditCard,
    FiCpu
} from 'react-icons/fi';
import {
    getUserSupportTickets,
    getUserSupportTicket,
    createUserSupportTicket,
    replyUserSupportTicket
} from '../../../services/api/platform';
import fire from '../../../conf/fire';

const STATUS_FILTERS = ['ALL', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES = [
    { value: 'LOW', label: 'Low — General Question' },
    { value: 'NORMAL', label: 'Normal — Standard Assistance' },
    { value: 'HIGH', label: 'High — Account / Billing Issue' },
    { value: 'URGENT', label: 'Urgent — Technical Blocker / Export Issue' },
];

const KNOWLEDGE_BASE_ITEMS = [
    {
        category: 'Resume Building & Export',
        icon: FiFileText,
        items: [
            {
                q: 'How do I download my resume as a PDF or Word document?',
                a: 'Open the Resume Builder review step, choose an export format that is available, and inspect the preview before downloading. Layouts can vary by template and content. If an export has a problem, include the template name and format in a support ticket.'
            },
            {
                q: 'Can I switch between the 51 resume templates without losing my content?',
                a: 'Use the template chooser in the review step to preview another layout. Before exporting, check that the sections you want are present and readable in the selected template.'
            },
            {
                q: 'How does the ATS Keyword Optimization Engine work?',
                a: 'The resume review uses your content and, when provided, a job description to produce an estimate. Treat the score as editing guidance rather than a guarantee; employers and screening systems can use different criteria.'
            }
        ]
    },
    {
        category: 'AI Tools & Interview Preparation',
        icon: FiCpu,
        items: [
            {
                q: 'How does the AI Mock Interview Coach & CBT Simulator work?',
                a: 'Open AI Interview Coach from your dashboard and follow the setup options shown there. If setup or a session does not work as expected, include the step you reached and any error message in a support ticket.'
            },
            {
                q: 'Is my personal career information used to train AI models?',
                a: 'Review the current Privacy Policy and any provider or feature notices before sending personal information to an AI feature. Data handling can vary by provider and service. If you need specific retention details, ask support before submitting sensitive content.'
            }
        ]
    },
    {
        category: 'Account & Security',
        icon: FiShield,
        items: [
            {
                q: 'How do I set up two-factor authentication (TOTP 2FA)?',
                a: 'Open Settings and choose Security. Follow the instructions shown there, and store any recovery codes in a secure place. Never share your password, one-time code, or recovery codes in a support ticket.'
            },
            {
                q: 'How can I request a copy of my account data?',
                a: 'Check Settings for an account data export option. If you cannot find one, open a support ticket and ask about the available request process. Do not include passwords, verification codes, or full payment details.'
            }
        ]
    },
    {
        category: 'Billing & Subscriptions',
        icon: FiCreditCard,
        items: [
            {
                q: 'Which payment methods are supported on IME365?',
                a: 'The checkout page lists the payment methods currently available for your account. Availability can vary by region and plan. Never include full card or bank details in a support ticket.'
            },
            {
                q: 'Where can I find payment receipts or invoices?',
                a: 'Open Subscription & Plans and choose Billing History & PDF Invoices. If a receipt is missing or incorrect, include the order or invoice reference in a support ticket, not your full payment details.'
            }
        ]
    }
];

export default function DashboardSupport({ showToast }) {
    const [tickets, setTickets] = useState([]);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTicketId, setSelectedTicketId] = useState(null);
    const [ticketDetail, setTicketDetail] = useState(null);
    const [isLoadingList, setIsLoadingList] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [listError, setListError] = useState('');
    const [detailError, setDetailError] = useState('');
    const [replyText, setReplyText] = useState('');
    const [isSubmittingReply, setIsSubmittingReply] = useState(false);

    const [activeSupportTab, setActiveSupportTab] = useState('tickets'); // 'tickets' | 'faq'
    const [faqSearch, setFaqSearch] = useState('');
    const [expandedFaqIndex, setExpandedFaqIndex] = useState(null);

    // Modal state for creating a new support ticket
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newSubject, setNewSubject] = useState('');
    const [newPriority, setNewPriority] = useState('NORMAL');
    const [newBody, setNewBody] = useState('');
    const [isCreatingTicket, setIsCreatingTicket] = useState(false);
    const [createError, setCreateError] = useState('');
    const createTicketButtonRef = useRef(null);
    const createTicketDialogRef = useRef(null);
    const createTicketSubjectRef = useRef(null);
    const isCreatingTicketRef = useRef(isCreatingTicket);
    isCreatingTicketRef.current = isCreatingTicket;

    // Load ticket list for the logged-in candidate
    const loadTickets = useCallback(async () => {
        setIsLoadingList(true);
        setListError('');
        try {
            const user = fire.auth().currentUser;
            if (!user) {
                setTickets([]);
                return;
            }
            const fetched = await getUserSupportTickets();
            setTickets(Array.isArray(fetched) ? fetched : []);
        } catch (err) {
            console.error('[DashboardSupport] load error:', err);
            setListError(err.message || 'Unable to load your support tickets.');
            if (showToast) showToast('error', 'Error', 'Failed to load support tickets');
        } finally {
            setIsLoadingList(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadTickets();
    }, [loadTickets]);

    // Load detailed thread for selected ticket
    const loadDetail = useCallback(async (ticketId) => {
        if (!ticketId) {
            setTicketDetail(null);
            return;
        }
        setIsLoadingDetail(true);
        setDetailError('');
        try {
            const ticket = await getUserSupportTicket(ticketId);
            setTicketDetail(ticket);
        } catch (err) {
            console.error('[DashboardSupport] detail load error:', err);
            setDetailError(err.message || 'Unable to load ticket conversation.');
            if (showToast) showToast('error', 'Error', 'Failed to load ticket details');
        } finally {
            setIsLoadingDetail(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (selectedTicketId) {
            loadDetail(selectedTicketId);
        } else {
            setTicketDetail(null);
        }
    }, [selectedTicketId, loadDetail]);

    // Keep keyboard focus inside the modal and restore it to the opener on close.
    useEffect(() => {
        if (!isCreateModalOpen) return undefined;

        const opener = createTicketButtonRef.current;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusFrame = window.requestAnimationFrame(() => createTicketSubjectRef.current?.focus());
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (isCreatingTicketRef.current) return;
                e.preventDefault();
                setIsCreateModalOpen(false);
                return;
            }

            if (e.key !== 'Tab') return;
            const dialog = createTicketDialogRef.current;
            const focusable = Array.from(dialog?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ) || []).filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');

            if (!focusable.length) {
                e.preventDefault();
                dialog?.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            if (opener?.isConnected) opener.focus();
        };
    }, [isCreateModalOpen]);

    // Create ticket handler
    const handleCreateTicket = async (e) => {
        e.preventDefault();
        const cleanSubject = newSubject.trim();
        const cleanBody = newBody.trim();

        if (cleanSubject.length < 4) {
            setCreateError('Subject must be at least 4 characters long.');
            return;
        }
        if (cleanBody.length < 8) {
            setCreateError('Please provide a descriptive message of at least 8 characters.');
            return;
        }

        setCreateError('');
        setIsCreatingTicket(true);

        try {
            const created = await createUserSupportTicket({
                subject: cleanSubject,
                body: cleanBody,
                priority: newPriority,
            });

            setIsCreateModalOpen(false);
            setNewSubject('');
            setNewBody('');
            setNewPriority('NORMAL');
            if (showToast) showToast('success', 'Ticket Submitted', 'Our support engineering team will assist you shortly.');
            await loadTickets();
            if (created?.id) {
                setSelectedTicketId(created.id);
            }
        } catch (err) {
            console.error('[DashboardSupport] create error:', err);
            setCreateError(err.message || 'Unable to create support ticket. Please try again.');
        } finally {
            setIsCreatingTicket(false);
        }
    };

    // Reply to ticket handler
    const handleSendReply = async (e) => {
        e.preventDefault();
        const cleanReply = replyText.trim();
        if (!selectedTicketId || !cleanReply || isSubmittingReply) return;

        setIsSubmittingReply(true);
        setDetailError('');

        try {
            const updated = await replyUserSupportTicket(selectedTicketId, cleanReply);
            setTicketDetail(updated);
            setReplyText('');
            if (showToast) showToast('success', 'Message Sent', 'Your reply has been added to the ticket.');
            // Refresh list in background to update timestamps/counts
            loadTickets();
        } catch (err) {
            console.error('[DashboardSupport] reply error:', err);
            setDetailError(err.message || 'Unable to post your reply.');
        } finally {
            setIsSubmittingReply(false);
        }
    };

    // Filter tickets by status and search query
    const filteredTickets = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        return tickets.filter((t) => {
            const matchesStatus = statusFilter === 'ALL' || String(t.status).toUpperCase() === statusFilter;
            const matchesSearch = !query ||
                String(t.subject || '').toLowerCase().includes(query) ||
                String(t.id || '').toLowerCase().includes(query);
            return matchesStatus && matchesSearch;
        });
    }, [tickets, statusFilter, searchTerm]);

    const getStatusPill = (status) => {
        const s = String(status || '').toUpperCase();
        switch (s) {
            case 'OPEN':
                return 'bg-[var(--cuba-warning-soft)] text-[var(--cuba-warning)] border-[var(--cuba-warning-soft)]';
            case 'PENDING':
                return 'bg-[var(--cuba-info-soft)] text-[var(--cuba-info)] border-[var(--cuba-info-soft)]';
            case 'RESOLVED':
                return 'bg-[var(--cuba-success-soft)] text-[var(--cuba-success)] border-[var(--cuba-success-soft)]';
            case 'CLOSED':
            default:
                return 'bg-slate-100 text-[var(--cuba-ink-muted)] border-[var(--cuba-line)]';
        }
    };

    const getPriorityPill = (priority) => {
        const p = String(priority || '').toUpperCase();
        switch (p) {
            case 'URGENT':
                return 'bg-[var(--cuba-danger-soft)] text-[var(--cuba-danger)] border-[var(--cuba-danger-line-base)] font-black';
            case 'HIGH':
                return 'bg-[var(--cuba-warning-soft)] text-[var(--cuba-warning)] border-[var(--cuba-warning-soft)] font-bold';
            case 'NORMAL':
                return 'bg-[var(--cuba-primary-soft)] text-[var(--cuba-primary-ink-strong)] border-[var(--cuba-primary-line)]';
            case 'LOW':
            default:
                return 'bg-slate-100 text-[var(--cuba-ink-muted)] border-[var(--cuba-line)]';
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'Recent';
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (_) {
            return String(isoString);
        }
    };

    return (
        <div className="min-h-0 bg-cuba-canvas py-4 px-4 sm:px-6 lg:px-8" data-testid="user-support-desk">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* ── HEADER & ACTIONS ────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-[var(--cuba-line)] shadow-2xs">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--cuba-primary-soft)] border border-[var(--cuba-primary-line)] text-[var(--cuba-primary-ink-strong)] flex items-center justify-center shrink-0 shadow-2xs">
                            <FiLifeBuoy className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-[var(--cuba-ink)] tracking-tight">
                                Help Desk &amp; Support Tickets
                            </h1>
                            <p className="text-xs sm:text-sm text-[var(--cuba-ink-muted)] mt-0.5">
                                Connect directly with our support engineering team for account, billing, or export assistance.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={loadTickets}
                            disabled={isLoadingList}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--cuba-line)] bg-white text-xs font-bold text-[var(--cuba-ink-muted)] hover:bg-slate-50 hover:text-[var(--cuba-ink)] transition shadow-2xs cursor-pointer disabled:opacity-50"
                            aria-label="Refresh tickets"
                            data-testid="refresh-tickets-button"
                        >
                            <FiRefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>

                        <button
                            ref={createTicketButtonRef}
                            type="button"
                            onClick={() => {
                                setCreateError('');
                                setIsCreateModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--cuba-primary-fill)] text-white text-xs font-bold hover:bg-[var(--cuba-primary-strong)] active:bg-[var(--cuba-primary-strong)] transition shadow-sm hover:shadow shadow-indigo-500/20 cursor-pointer"
                            data-testid="create-ticket-button"
                        >
                            <FiPlus className="w-4 h-4" />
                            <span>Raise New Ticket</span>
                        </button>
                    </div>
                </div>

                {/* ── LIST ERROR NOTIFICATION ──────────────────────────────────── */}
                {listError && (
                    <div role="alert" className="p-4 bg-[var(--cuba-danger-soft)] border border-[var(--cuba-danger-line-base)] rounded-2xl text-xs text-[var(--cuba-danger)] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FiAlertCircle className="w-4 h-4 text-[var(--cuba-danger)] shrink-0" />
                            <span>{listError}</span>
                        </div>
                        <button
                            onClick={loadTickets}
                            className="px-3 py-1 bg-[var(--cuba-danger-soft)] hover:bg-[var(--cuba-danger-soft)] text-[var(--cuba-danger)] font-bold rounded-lg transition cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* ── SUB-NAVIGATION TABS ────────────────────────────────────────── */}
                <div className="flex items-center gap-2 border-b border-[var(--cuba-line)] pb-2">
                    <button
                        onClick={() => setActiveSupportTab('tickets')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeSupportTab === 'tickets'
                                ? 'bg-[var(--cuba-primary-fill)] text-white shadow-sm'
                                : 'bg-white text-[var(--cuba-ink-muted)] hover:bg-slate-100 hover:text-[var(--cuba-ink)] border border-[var(--cuba-line)]'
                        }`}
                        data-testid="tab-support-tickets"
                    >
                        <FiInbox className="w-3.5 h-3.5" />
                        <span>My Support Tickets</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            activeSupportTab === 'tickets' ? 'bg-white text-[var(--cuba-primary-ink-strong)]' : 'bg-slate-100 text-[var(--cuba-ink-muted)]'
                        }`}>
                            {tickets.length}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveSupportTab('faq')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeSupportTab === 'faq'
                                ? 'bg-[var(--cuba-primary-fill)] text-white shadow-sm'
                                : 'bg-white text-[var(--cuba-ink-muted)] hover:bg-slate-100 hover:text-[var(--cuba-ink)] border border-[var(--cuba-line)]'
                        }`}
                        data-testid="tab-knowledge-base"
                    >
                        <FiHelpCircle className="w-3.5 h-3.5" />
                        <span>Knowledge Base &amp; FAQs</span>
                    </button>
                </div>

                {/* ── KNOWLEDGE BASE & FAQ VIEW ───────────────────────────────── */}
                {activeSupportTab === 'faq' && (
                    <div className="bg-white p-6 rounded-2xl border border-[var(--cuba-line)] shadow-2xs space-y-6" data-testid="support-knowledge-base">
                        <div className="max-w-2xl mx-auto text-center space-y-2">
                            <h2 className="text-lg sm:text-xl font-bold text-[var(--cuba-ink)]">Frequently Asked Questions &amp; Knowledge Base</h2>
                            <p className="text-xs sm:text-sm text-[var(--cuba-ink-muted)]">Instant answers to common candidate questions about resume building, AI tools, exports, and accounts.</p>
                            <div className="relative mt-4">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cuba-ink-subtle)] w-4 h-4 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search knowledge base articles..."
                                    value={faqSearch}
                                    onChange={(e) => setFaqSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-xs text-[var(--cuba-ink)] placeholder:text-[var(--cuba-ink-subtle)] focus:outline-none focus:bg-white focus:border-[var(--cuba-primary)] transition-all"
                                    aria-label="Search FAQs"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            {KNOWLEDGE_BASE_ITEMS.map((cat, catIdx) => {
                                const CategoryIcon = cat.icon || FiBook;
                                const filteredItems = cat.items.filter(item => {
                                    if (!faqSearch) return true;
                                    const q = faqSearch.toLowerCase();
                                    return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
                                });
                                if (filteredItems.length === 0) return null;

                                return (
                                    <div key={cat.category} className="bg-[var(--cuba-canvas)] rounded-2xl p-5 border border-[var(--cuba-line)] space-y-3">
                                        <div className="flex items-center gap-2 text-[var(--cuba-primary-ink-strong)] font-bold text-sm">
                                            <CategoryIcon className="w-4 h-4 text-[var(--cuba-primary-ink-strong)]" aria-hidden="true" />
                                            <span>{cat.category}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {filteredItems.map((item, itemIdx) => {
                                                const globalIdx = `${catIdx}_${itemIdx}`;
                                                const isExpanded = expandedFaqIndex === globalIdx;
                                                const answerId = `support-faq-answer-${catIdx}-${itemIdx}`;
                                                return (
                                                    <div key={item.q} className="bg-white rounded-xl border border-[var(--cuba-line)] overflow-hidden shadow-2xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedFaqIndex(isExpanded ? null : globalIdx)}
                                                            className="w-full px-4 py-3 text-left text-xs font-bold text-[var(--cuba-ink)] flex items-center justify-between gap-3 hover:text-[var(--cuba-primary-ink-strong)] transition-colors cursor-pointer"
                                                            aria-expanded={isExpanded}
                                                            aria-controls={answerId}
                                                        >
                                                            <span>{item.q}</span>
                                                            {isExpanded ? <FiChevronUp className="w-4 h-4 text-[var(--cuba-ink-subtle)] shrink-0" /> : <FiChevronDown className="w-4 h-4 text-[var(--cuba-ink-subtle)] shrink-0" />}
                                                        </button>
                                                        <div id={answerId} hidden={!isExpanded} className="px-4 pb-3.5 pt-3 text-sm text-[var(--cuba-ink-muted)] border-t border-[var(--cuba-line)] leading-relaxed bg-[var(--cuba-canvas)]">
                                                            {item.a}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── MAIN WORKSPACE GRID ──────────────────────────────────────── */}
                {activeSupportTab === 'tickets' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* LEFT PANEL: Tickets Queue & Search */}
                    <div className={`${selectedTicketId ? 'hidden lg:block' : 'block'} lg:col-span-5 space-y-4`}>
                        {/* Search & Status Filters */}
                        <div className="bg-white p-4 rounded-2xl border border-[var(--cuba-line)] shadow-2xs space-y-3">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--cuba-ink-subtle)]" />
                                <input
                                    type="text"
                                    placeholder="Search by subject or ticket ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-xs text-[var(--cuba-ink)] placeholder:text-[var(--cuba-ink-subtle)] focus:outline-hidden focus:bg-white focus:border-[var(--cuba-primary)] transition"
                                    data-testid="support-search-input"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink-muted)] cursor-pointer"
                                    >
                                        <FiX className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status Filter Tabs */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {STATUS_FILTERS.map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        onClick={() => setStatusFilter(st)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer ${
                                            statusFilter === st
                                                ? 'bg-[var(--cuba-primary-fill)] text-white border-[var(--cuba-primary-fill)] shadow-2xs'
                                                : 'bg-white text-[var(--cuba-ink-muted)] border-[var(--cuba-line)] hover:bg-slate-50'
                                        }`}
                                        data-testid={`filter-status-${st.toLowerCase()}`}
                                    >
                                        {st === 'ALL' ? 'All' : st}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Ticket Queue List */}
                        <div className="bg-white rounded-2xl border border-[var(--cuba-line)] shadow-2xs overflow-hidden">
                            <div className="px-4 py-3 border-b border-[var(--cuba-line)] bg-[var(--cuba-canvas)] flex items-center justify-between">
                                <span className="text-xs font-bold text-[var(--cuba-ink-muted)] uppercase tracking-wider">
                                    Your Tickets ({filteredTickets.length})
                                </span>
                            </div>

                            {isLoadingList ? (
                                <div className="p-8 text-center space-y-3">
                                    <div className="w-8 h-8 border-2 border-[var(--cuba-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    <p className="text-xs text-[var(--cuba-ink-muted)] font-medium">Loading your support tickets...</p>
                                </div>
                            ) : filteredTickets.length === 0 ? (
                                <div className="p-8 text-center space-y-3" data-testid="empty-tickets-state">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[var(--cuba-ink-subtle)] flex items-center justify-center mx-auto">
                                        <FiInbox className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-sm font-bold text-[var(--cuba-ink)]">No support tickets found</h3>
                                    <p className="text-xs text-[var(--cuba-ink-muted)] max-w-xs mx-auto">
                                        {searchTerm || statusFilter !== 'ALL'
                                            ? 'No tickets match your filter criteria.'
                                            : 'Need help? Click "Raise New Ticket" above to reach our support team.'}
                                    </p>
                                    {!searchTerm && statusFilter === 'ALL' && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreateModalOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--cuba-primary-ink-strong)] bg-[var(--cuba-primary-soft)] hover:bg-[var(--cuba-primary-soft-hover)] rounded-lg transition cursor-pointer"
                                        >
                                            <FiPlus className="w-3.5 h-3.5" />
                                            <span>Create Ticket</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-[var(--cuba-line)] max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {filteredTickets.map((t) => {
                                        const isSelected = selectedTicketId === t.id;
                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() => setSelectedTicketId(t.id)}
                                                className={`p-4 transition cursor-pointer hover:bg-slate-50/80 ${
                                                    isSelected ? 'bg-indigo-50/60 border-l-4 border-[var(--cuba-primary)]' : ''
                                                }`}
                                                data-testid={`ticket-item-${t.id}`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <h4 className="text-xs sm:text-sm font-bold text-[var(--cuba-ink)] line-clamp-1">
                                                        {t.subject}
                                                    </h4>
                                                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full border shrink-0 ${getStatusPill(t.status)}`}>
                                                        {t.status}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--cuba-ink-muted)]">
                                                    <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded-md border ${getPriorityPill(t.priority)}`}>
                                                        {t.priority}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <FiClock className="w-3 h-3 text-[var(--cuba-ink-subtle)]" />
                                                        {formatDate(t.updatedAt || t.createdAt)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL: Ticket Detail & Message Conversation */}
                    <div className={`${!selectedTicketId ? 'hidden lg:block' : 'block'} lg:col-span-7`}>
                        {selectedTicketId && ticketDetail ? (
                            <div className="bg-white rounded-2xl border border-[var(--cuba-line)] shadow-2xs overflow-hidden flex flex-col min-h-[600px]" data-testid="ticket-detail-view">
                                {/* Detail Header */}
                                <div className="p-5 border-b border-[var(--cuba-line)] bg-[var(--cuba-canvas)] flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTicketId(null)}
                                            className="lg:hidden inline-flex items-center gap-1 text-xs font-bold text-[var(--cuba-ink-muted)] hover:text-[var(--cuba-ink)] cursor-pointer"
                                        >
                                            <FiArrowLeft className="w-4 h-4" /> Back to list
                                        </button>
                                        <div className="flex items-center gap-2 ml-auto">
                                            <span className={`px-2.5 py-1 text-[11px] font-extrabold rounded-full border ${getStatusPill(ticketDetail.status)}`}>
                                                Status: {ticketDetail.status}
                                            </span>
                                            <span className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md border ${getPriorityPill(ticketDetail.priority)}`}>
                                                Priority: {ticketDetail.priority}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h2 className="text-lg font-bold text-[var(--cuba-ink)]" data-testid="ticket-detail-subject">
                                            {ticketDetail.subject}
                                        </h2>
                                        <p className="text-[11px] text-[var(--cuba-ink-subtle)] mt-0.5">
                                            Ticket ID: <span className="font-mono text-[var(--cuba-ink-muted)]">{ticketDetail.id}</span> • Opened: {formatDate(ticketDetail.createdAt)}
                                        </p>
                                    </div>
                                </div>

                                {/* Detail Error alert */}
                                {detailError && (
                                    <div role="alert" className="m-4 p-3 bg-[var(--cuba-danger-soft)] border border-[var(--cuba-danger-line-base)] rounded-xl text-xs text-[var(--cuba-danger)] flex items-center gap-2">
                                        <FiAlertCircle className="w-4 h-4 text-[var(--cuba-danger)] shrink-0" />
                                        <span>{detailError}</span>
                                    </div>
                                )}

                                {/* Message Stream */}
                                <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px] custom-scrollbar bg-[var(--cuba-canvas)]" data-testid="ticket-messages-stream">
                                    {isLoadingDetail ? (
                                        <div className="p-8 text-center">
                                            <div className="w-6 h-6 border-2 border-[var(--cuba-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                                            <p className="text-xs text-[var(--cuba-ink-subtle)] mt-2">Loading conversation thread...</p>
                                        </div>
                                    ) : (ticketDetail.messages || []).map((msg, idx) => {
                                        const isStaff = msg.authorRole !== 'USER';
                                        return (
                                            <div
                                                key={msg.id || idx}
                                                className={`flex flex-col ${isStaff ? 'items-start' : 'items-end'}`}
                                                data-testid={`ticket-message-${msg.id || idx}`}
                                            >
                                                <div className="flex items-center gap-1.5 text-[10px] text-[var(--cuba-ink-subtle)] mb-1 px-1">
                                                    {isStaff ? (
                                                            <span className="font-bold text-[var(--cuba-primary-ink-strong)] flex items-center gap-1">
                                                            <FiShield className="w-3 h-3" /> Support Specialist
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-[var(--cuba-ink-muted)] flex items-center gap-1">
                                                            <FiUser className="w-3 h-3" /> You
                                                        </span>
                                                    )}
                                                    <span>• {formatDate(msg.createdAt)}</span>
                                                </div>

                                                <div
                                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                                                        isStaff
                                                            ? 'bg-white border border-[var(--cuba-line)] text-[var(--cuba-ink)] shadow-2xs rounded-tl-xs'
                                                            : 'bg-[var(--cuba-primary-fill)] text-white shadow-2xs rounded-tr-xs'
                                                    }`}
                                                >
                                                    <p className="whitespace-pre-wrap">{msg.body}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Reply Section */}
                                <div className="p-4 border-t border-[var(--cuba-line)] bg-white">
                                    {ticketDetail.status === 'CLOSED' ? (
                                        <div className="p-3 bg-slate-100 border border-[var(--cuba-line)] rounded-xl text-center text-xs text-[var(--cuba-ink-muted)]">
                                            <FiCheckCircle className="w-4 h-4 text-[var(--cuba-success)] inline-block mr-1.5" />
                                            This support ticket has been resolved and closed. If you require further assistance, please raise a new ticket.
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSendReply} className="space-y-3" data-testid="ticket-reply-form">
                                            <textarea
                                                rows={3}
                                                placeholder="Write a reply or provide further details..."
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                className="w-full p-3 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-xs text-[var(--cuba-ink)] placeholder:text-[var(--cuba-ink-subtle)] focus:outline-hidden focus:bg-white focus:border-[var(--cuba-primary)] transition resize-none"
                                                data-testid="ticket-reply-input"
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={!replyText.trim() || isSubmittingReply}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--cuba-primary-fill)] text-white text-xs font-bold hover:bg-[var(--cuba-primary-strong)] transition shadow-xs cursor-pointer disabled:opacity-50"
                                                    data-testid="ticket-reply-button"
                                                >
                                                    {isSubmittingReply ? (
                                                        <>
                                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                            <span>Sending...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FiSend className="w-3.5 h-3.5" />
                                                            <span>Send Reply</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-[var(--cuba-line)] shadow-2xs p-12 text-center min-h-[400px] flex flex-col items-center justify-center space-y-3">
                                <div className="w-14 h-14 rounded-2xl bg-[var(--cuba-primary-soft)] text-[var(--cuba-primary-ink-strong)] flex items-center justify-center">
                                    <FiMessageSquare className="w-7 h-7" />
                                </div>
                                <h3 className="text-base font-bold text-[var(--cuba-ink)]">Select a Ticket</h3>
                                <p className="text-xs text-[var(--cuba-ink-muted)] max-w-sm">
                                    Choose a support ticket from the list to view the full message thread or send a reply.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* ── CREATE TICKET MODAL ──────────────────────────────────────── */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" data-testid="create-ticket-modal">
                        <div
                            ref={createTicketDialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="create-ticket-modal-title"
                            aria-describedby="create-ticket-modal-description"
                            tabIndex={-1}
                            className="bg-white rounded-2xl border border-[var(--cuba-line)] shadow-2xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150"
                        >
                            <div className="px-6 py-4 border-b border-[var(--cuba-line)] flex items-center justify-between bg-[var(--cuba-canvas)]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-[var(--cuba-primary-soft)] text-[var(--cuba-primary-ink-strong)] flex items-center justify-center font-bold">
                                        <FiPlus className="w-4 h-4" />
                                    </div>
                                    <h3 id="create-ticket-modal-title" className="text-sm sm:text-base font-bold text-[var(--cuba-ink)]">
                                        Raise Support Ticket
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !isCreatingTicket && setIsCreateModalOpen(false)}
                                    disabled={isCreatingTicket}
                                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--cuba-ink-subtle)] hover:text-[var(--cuba-ink-muted)] rounded-lg hover:bg-slate-100 transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Close modal"
                                >
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateTicket} className="p-5 sm:p-6 space-y-4">
                                <p id="create-ticket-modal-description" className="text-sm text-[var(--cuba-ink-muted)] leading-relaxed">
                                    Tell us what happened and what you expected. Do not include passwords, verification codes, or full payment details.
                                </p>
                                {createError && (
                                    <div role="alert" className="p-3 bg-[var(--cuba-danger-soft)] border border-[var(--cuba-danger-line-base)] rounded-xl text-xs text-[var(--cuba-danger)] flex items-center gap-2">
                                        <FiAlertCircle className="w-4 h-4 text-[var(--cuba-danger)] shrink-0" />
                                        <span>{createError}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label htmlFor="ticket-subject" className="block text-xs font-bold text-[var(--cuba-ink-muted)]">
                                        Subject <span className="text-[var(--cuba-danger)]">*</span>
                                    </label>
                                    <input
                                        id="ticket-subject"
                                        ref={createTicketSubjectRef}
                                        type="text"
                                        placeholder="Brief summary of your question or issue"
                                        value={newSubject}
                                        onChange={(e) => setNewSubject(e.target.value)}
                                        className="w-full px-3.5 py-3 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-base sm:text-sm text-[var(--cuba-ink)] focus:bg-white focus:border-[var(--cuba-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)] transition"
                                        data-testid="ticket-subject-input"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="ticket-priority" className="block text-xs font-bold text-[var(--cuba-ink-muted)]">
                                        Priority / Category
                                    </label>
                                    <select
                                        id="ticket-priority"
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value)}
                                        className="w-full px-3.5 py-3 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-base sm:text-sm text-[var(--cuba-ink)] focus:bg-white focus:border-[var(--cuba-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)] transition cursor-pointer"
                                        data-testid="ticket-priority-select"
                                    >
                                        {PRIORITIES.map((p) => (
                                            <option key={p.value} value={p.value}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="ticket-body" className="block text-xs font-bold text-[var(--cuba-ink-muted)]">
                                        Description / Details <span className="text-[var(--cuba-danger)]">*</span>
                                    </label>
                                    <textarea
                                        id="ticket-body"
                                        rows={4}
                                        placeholder="Please provide complete context, steps taken, or specific error messages so we can assist you quickly..."
                                        value={newBody}
                                        onChange={(e) => setNewBody(e.target.value)}
                                        className="w-full p-3.5 bg-[var(--cuba-canvas)] border border-[var(--cuba-line)] rounded-xl text-base sm:text-sm text-[var(--cuba-ink)] focus:bg-white focus:border-[var(--cuba-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)] transition resize-y"
                                        data-testid="ticket-body-input"
                                        required
                                    />
                                </div>

                                <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 border-t border-[var(--cuba-line)]">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
                                        disabled={isCreatingTicket}
                                        className="w-full sm:w-auto min-h-11 px-4 py-2 rounded-xl border border-[var(--cuba-line)] text-sm font-bold text-[var(--cuba-ink-muted)] hover:bg-slate-50 transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreatingTicket || !newSubject.trim() || !newBody.trim()}
                                        className="inline-flex w-full sm:w-auto min-h-11 items-center justify-center gap-2 px-5 py-2 rounded-xl bg-[var(--cuba-primary-fill)] text-white text-sm font-bold hover:bg-[var(--cuba-primary-strong)] transition shadow-sm cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cuba-primary)] disabled:opacity-50"
                                        data-testid="ticket-submit-button"
                                    >
                                        {isCreatingTicket ? (
                                            <>
                                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                <span>Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <FiSend className="w-3.5 h-3.5" />
                                                <span>Submit Ticket</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
