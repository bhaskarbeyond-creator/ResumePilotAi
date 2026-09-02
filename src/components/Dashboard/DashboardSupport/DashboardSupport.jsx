import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
        icon: 'FiFileText',
        items: [
            {
                q: 'How do I download my resume in high-fidelity PDF or Word DOCX format?',
                a: 'On your dashboard or in the Resume Builder finalize step, click the "Download PDF" or "Download Word" button. The system runs our certified high-fidelity render engine to generate pixel-perfect documents with 0 layout drift across all 51 templates.'
            },
            {
                q: 'Can I switch between the 51 resume templates without losing my content?',
                a: 'Yes! All 51 templates share a unified master resume data schema. You can switch templates at any time and all your work experiences, skills, education, and summaries are automatically adapted to the chosen layout archetype.'
            },
            {
                q: 'How does the ATS Keyword Optimization Engine work?',
                a: 'Our ATS score analyzer evaluates your resume against industry-standard categories (contact info, action verbs, measurable metrics, technical skills, and section completeness). Paste a target job description to get instant keyword match percentage.'
            }
        ]
    },
    {
        category: 'AI Tools & Interview Preparation',
        icon: 'FiCpu',
        items: [
            {
                q: 'How does the AI Mock Interview Coach & CBT Simulator work?',
                a: 'Navigate to "AI Interview Coach" from the sidebar. Choose your target role, difficulty, and question count. The simulator generates authentic multiple-choice CBT questions with timed duration, flag for review, and comprehensive diagnostic reports upon completion.'
            },
            {
                q: 'Is my personal career information used to train AI models?',
                a: 'No. ResumePilot AI strictly enforces a zero-retention pledge. All data processed by enterprise AI generation services is ephemeral and never used to train public foundation models.'
            }
        ]
    },
    {
        category: 'Account & Security',
        icon: 'FiShield',
        items: [
            {
                q: 'How do I set up two-factor authentication (TOTP 2FA)?',
                a: 'Go to Settings > "Security & 2FA Hub". Click "Enable 2FA", scan the QR code with Google Authenticator, Authy, or 1Password, and enter the 6-digit code to activate. Make sure to securely save your emergency backup codes.'
            },
            {
                q: 'How can I export a complete copy of my account data (GDPR)?',
                a: 'Under Settings > "Security & 2FA Hub", scroll to Card 5 "GDPR Data Portability & Export" and click "Download JSON Export" to receive all your profile, resumes, cover letters, and transaction data in a single file.'
            }
        ]
    },
    {
        category: 'Billing & Subscriptions',
        icon: 'FiCreditCard',
        items: [
            {
                q: 'Which payment methods are supported on ResumePilot AI?',
                a: 'We support Stripe (Credit/Debit cards), PayPal, Razorpay (UPI, Netbanking, Cards), PhonePe, and Paytm. All transactions are securely processed with 256-bit SSL encryption.'
            },
            {
                q: 'Where can I download my payment tax invoices and credit notes?',
                a: 'Navigate to "Subscription & Plans" from the sidebar. Click the "Invoices & Receipts" tab to view and download official GST/tax-compliant PDF receipts for all your billing orders.'
            }
        ]
    }
];

export default function DashboardSupport({ showToast, sidebarCollapsed }) {
    const { t } = useTranslation('common');
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

    // Global escape key listener for modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (isCreateModalOpen && !isCreatingTicket) {
                    setIsCreateModalOpen(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCreateModalOpen, isCreatingTicket]);

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
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'PENDING':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'RESOLVED':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'CLOSED':
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getPriorityPill = (priority) => {
        const p = String(priority || '').toUpperCase();
        switch (p) {
            case 'URGENT':
                return 'bg-rose-50 text-rose-700 border-rose-200 font-black';
            case 'HIGH':
                return 'bg-orange-50 text-orange-700 border-orange-200 font-bold';
            case 'NORMAL':
                return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'LOW':
            default:
                return 'bg-slate-100 text-slate-600 border-slate-200';
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
        <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8" data-testid="user-support-desk">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* ── HEADER & ACTIONS ────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                            <FiLifeBuoy className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                                Help Desk &amp; Support Tickets
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                                Connect directly with our support engineering team for account, billing, or export assistance.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={loadTickets}
                            disabled={isLoadingList}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs cursor-pointer disabled:opacity-50"
                            aria-label="Refresh tickets"
                            data-testid="refresh-tickets-button"
                        >
                            <FiRefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setCreateError('');
                                setIsCreateModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm hover:shadow shadow-indigo-500/20 cursor-pointer"
                            data-testid="create-ticket-button"
                        >
                            <FiPlus className="w-4 h-4" />
                            <span>Raise New Ticket</span>
                        </button>
                    </div>
                </div>

                {/* ── LIST ERROR NOTIFICATION ──────────────────────────────────── */}
                {listError && (
                    <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FiAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>{listError}</span>
                        </div>
                        <button
                            onClick={loadTickets}
                            className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold rounded-lg transition cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* ── SUB-NAVIGATION TABS ────────────────────────────────────────── */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <button
                        onClick={() => setActiveSupportTab('tickets')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeSupportTab === 'tickets'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                        }`}
                        data-testid="tab-support-tickets"
                    >
                        <FiInbox className="w-3.5 h-3.5" />
                        <span>My Support Tickets</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            activeSupportTab === 'tickets' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-100 text-slate-600'
                        }`}>
                            {tickets.length}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveSupportTab('faq')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeSupportTab === 'faq'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/80'
                        }`}
                        data-testid="tab-knowledge-base"
                    >
                        <FiHelpCircle className="w-3.5 h-3.5" />
                        <span>Knowledge Base &amp; FAQs</span>
                    </button>
                </div>

                {/* ── KNOWLEDGE BASE & FAQ VIEW ───────────────────────────────── */}
                {activeSupportTab === 'faq' && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6" data-testid="support-knowledge-base">
                        <div className="max-w-2xl mx-auto text-center space-y-2">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Frequently Asked Questions &amp; Knowledge Base</h2>
                            <p className="text-xs sm:text-sm text-slate-500">Instant answers to common candidate questions about resume building, AI tools, exports, and accounts.</p>
                            <div className="relative mt-4">
                                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search knowledge base articles..."
                                    value={faqSearch}
                                    onChange={(e) => setFaqSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                    aria-label="Search FAQs"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            {KNOWLEDGE_BASE_ITEMS.map((cat, catIdx) => {
                                const filteredItems = cat.items.filter(item => {
                                    if (!faqSearch) return true;
                                    const q = faqSearch.toLowerCase();
                                    return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
                                });
                                if (filteredItems.length === 0) return null;

                                return (
                                    <div key={cat.category} className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 space-y-3">
                                        <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                                            <FiBook className="w-4 h-4 text-indigo-600" />
                                            <span>{cat.category}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {filteredItems.map((item, itemIdx) => {
                                                const globalIdx = `${catIdx}_${itemIdx}`;
                                                const isExpanded = expandedFaqIndex === globalIdx;
                                                return (
                                                    <div key={item.q} className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                                                        <button
                                                            onClick={() => setExpandedFaqIndex(isExpanded ? null : globalIdx)}
                                                            className="w-full px-4 py-3 text-left text-xs font-bold text-slate-800 flex items-center justify-between gap-3 hover:text-indigo-600 transition-colors cursor-pointer"
                                                        >
                                                            <span>{item.q}</span>
                                                            {isExpanded ? <FiChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <FiChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                                                        </button>
                                                        {isExpanded && (
                                                            <div className="px-4 pb-3.5 pt-1 text-xs text-slate-600 border-t border-slate-100 leading-relaxed bg-slate-50/50">
                                                                {item.a}
                                                            </div>
                                                        )}
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
                        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search by subject or ticket ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition"
                                    data-testid="support-search-input"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
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
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                        data-testid={`filter-status-${st.toLowerCase()}`}
                                    >
                                        {st === 'ALL' ? 'All' : st}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Ticket Queue List */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                    Your Tickets ({filteredTickets.length})
                                </span>
                            </div>

                            {isLoadingList ? (
                                <div className="p-8 text-center space-y-3">
                                    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                    <p className="text-xs text-slate-500 font-medium">Loading your support tickets...</p>
                                </div>
                            ) : filteredTickets.length === 0 ? (
                                <div className="p-8 text-center space-y-3" data-testid="empty-tickets-state">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                        <FiInbox className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800">No support tickets found</h3>
                                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                                        {searchTerm || statusFilter !== 'ALL'
                                            ? 'No tickets match your filter criteria.'
                                            : 'Need help? Click "Raise New Ticket" above to reach our support team.'}
                                    </p>
                                    {!searchTerm && statusFilter === 'ALL' && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreateModalOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
                                        >
                                            <FiPlus className="w-3.5 h-3.5" />
                                            <span>Create Ticket</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {filteredTickets.map((t) => {
                                        const isSelected = selectedTicketId === t.id;
                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() => setSelectedTicketId(t.id)}
                                                className={`p-4 transition cursor-pointer hover:bg-slate-50/80 ${
                                                    isSelected ? 'bg-indigo-50/60 border-l-4 border-indigo-600' : ''
                                                }`}
                                                data-testid={`ticket-item-${t.id}`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                                                        {t.subject}
                                                    </h4>
                                                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full border shrink-0 ${getStatusPill(t.status)}`}>
                                                        {t.status}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                                    <span className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded-md border ${getPriorityPill(t.priority)}`}>
                                                        {t.priority}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <FiClock className="w-3 h-3 text-slate-400" />
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
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col min-h-[600px]" data-testid="ticket-detail-view">
                                {/* Detail Header */}
                                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTicketId(null)}
                                            className="lg:hidden inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
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
                                        <h2 className="text-lg font-bold text-slate-900" data-testid="ticket-detail-subject">
                                            {ticketDetail.subject}
                                        </h2>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            Ticket ID: <span className="font-mono text-slate-600">{ticketDetail.id}</span> • Opened: {formatDate(ticketDetail.createdAt)}
                                        </p>
                                    </div>
                                </div>

                                {/* Detail Error alert */}
                                {detailError && (
                                    <div role="alert" className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                                        <FiAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                        <span>{detailError}</span>
                                    </div>
                                )}

                                {/* Message Stream */}
                                <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[440px] custom-scrollbar bg-slate-50/30" data-testid="ticket-messages-stream">
                                    {isLoadingDetail ? (
                                        <div className="p-8 text-center">
                                            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                            <p className="text-xs text-slate-400 mt-2">Loading conversation thread...</p>
                                        </div>
                                    ) : (ticketDetail.messages || []).map((msg, idx) => {
                                        const isStaff = msg.authorRole !== 'USER';
                                        return (
                                            <div
                                                key={msg.id || idx}
                                                className={`flex flex-col ${isStaff ? 'items-start' : 'items-end'}`}
                                                data-testid={`ticket-message-${msg.id || idx}`}
                                            >
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                                                    {isStaff ? (
                                                        <span className="font-bold text-indigo-600 flex items-center gap-1">
                                                            <FiShield className="w-3 h-3" /> Support Specialist
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-slate-700 flex items-center gap-1">
                                                            <FiUser className="w-3 h-3" /> You
                                                        </span>
                                                    )}
                                                    <span>• {formatDate(msg.createdAt)}</span>
                                                </div>

                                                <div
                                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                                                        isStaff
                                                            ? 'bg-white border border-slate-200 text-slate-800 shadow-2xs rounded-tl-xs'
                                                            : 'bg-indigo-600 text-white shadow-2xs rounded-tr-xs'
                                                    }`}
                                                >
                                                    <p className="whitespace-pre-wrap">{msg.body}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Reply Section */}
                                <div className="p-4 border-t border-slate-200 bg-white">
                                    {ticketDetail.status === 'CLOSED' ? (
                                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center text-xs text-slate-600">
                                            <FiCheckCircle className="w-4 h-4 text-emerald-600 inline-block mr-1.5" />
                                            This support ticket has been resolved and closed. If you require further assistance, please raise a new ticket.
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSendReply} className="space-y-3" data-testid="ticket-reply-form">
                                            <textarea
                                                rows={3}
                                                placeholder="Write a reply or provide further details..."
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition resize-none"
                                                data-testid="ticket-reply-input"
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={!replyText.trim() || isSubmittingReply}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-xs cursor-pointer disabled:opacity-50"
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
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-12 text-center min-h-[400px] flex flex-col items-center justify-center space-y-3">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <FiMessageSquare className="w-7 h-7" />
                                </div>
                                <h3 className="text-base font-bold text-slate-800">Select a Ticket</h3>
                                <p className="text-xs text-slate-500 max-w-sm">
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
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                        <FiPlus className="w-4 h-4" />
                                    </div>
                                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                                        Raise Support Ticket
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !isCreatingTicket && setIsCreateModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                                    aria-label="Close modal"
                                >
                                    <FiX className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                                {createError && (
                                    <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                                        <FiAlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                        <span>{createError}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label htmlFor="ticket-subject" className="block text-xs font-bold text-slate-700">
                                        Subject <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        id="ticket-subject"
                                        type="text"
                                        placeholder="Brief summary of your question or issue"
                                        value={newSubject}
                                        onChange={(e) => setNewSubject(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition"
                                        data-testid="ticket-subject-input"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="ticket-priority" className="block text-xs font-bold text-slate-700">
                                        Priority / Category
                                    </label>
                                    <select
                                        id="ticket-priority"
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition cursor-pointer"
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
                                    <label htmlFor="ticket-body" className="block text-xs font-bold text-slate-700">
                                        Description / Details <span className="text-rose-500">*</span>
                                    </label>
                                    <textarea
                                        id="ticket-body"
                                        rows={4}
                                        placeholder="Please provide complete context, steps taken, or specific error messages so we can assist you quickly..."
                                        value={newBody}
                                        onChange={(e) => setNewBody(e.target.value)}
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition resize-none"
                                        data-testid="ticket-body-input"
                                        required
                                    />
                                </div>

                                <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
                                        disabled={isCreatingTicket}
                                        className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreatingTicket || !newSubject.trim() || !newBody.trim()}
                                        className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-sm cursor-pointer disabled:opacity-50"
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
