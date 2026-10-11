import React, { useState, useRef, useEffect, useCallback } from 'react';
import { withTranslation } from 'react-i18next';
import { FiSearch, FiPaperclip, FiSend, FiMoreVertical, FiEdit, FiChevronUp, FiMessageCircle, FiUser, FiUsers, FiArrowLeft } from 'react-icons/fi';
import { getConversationParticipantProfile, getConversations, subscribeConversationMessages, getMessagesPaginated, sendMessage, markConversationRead } from '../../../services/api/platform';
import fire from '../../../conf/fire';
import userPlaceholder from '../../../assets/user.png';
import { useSearchParams } from 'react-router-dom';

// DIR-026 / INV-4: the chat surface is restyled onto the Cuba design tokens.
//
// WHY THIS MATTERS: the bubbles, list rows and input previously used a hardcoded
// Tailwind ramp (blue-500/600, gray-100/400/500/800, white). Those colours were
// chosen against a white canvas only, so in dark mode the "other" bubble stayed
// white-on-white-adjacent and the timestamp grey (`gray-400`) measured ~2.9:1
// against white — below the 4.5:1 AA floor in INV-4.
//
// Every colour below now resolves to a token whose light AND dark values are
// audited in `styles/cuba-tokens.css`, so the same class list is AA-compliant in
// both themes and no new random colour was introduced anywhere.
const CHAT_SURFACE = 'bg-[var(--cuba-card)] text-[var(--cuba-ink)]';
const CHAT_INK = 'text-[var(--cuba-ink)]';
const CHAT_LINE = 'border-[var(--cuba-line)]';
const CHAT_INK_MUTED = 'text-[var(--cuba-ink-muted)]';
const CHAT_INK_SUBTLE = 'text-[var(--cuba-ink-subtle)]';
const CHAT_PRIMARY = 'bg-[var(--cuba-primary-fill)] text-[var(--cuba-header-badge-ink)]';

function formatMessageTime(timestamp, t) {
    if (!timestamp) return t('JobsUpdate.DashboardMessages.time.now', 'Now');
    const date = new Date(timestamp);
    const diffInMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (diffInMinutes < 1) return t('JobsUpdate.DashboardMessages.time.now', 'Now');
    if (diffInMinutes < 60) return t('JobsUpdate.DashboardMessages.time.minutes', '{{count}}min ago', { count: diffInMinutes });
    if (diffInMinutes < 1440) return t('JobsUpdate.DashboardMessages.time.hours', '{{count}}hr ago', { count: Math.floor(diffInMinutes / 60) });
    return date.toLocaleDateString();
}

// eslint-disable-next-line react-refresh/only-export-components
const DashboardMessages = ({ t }) => {
    const [conversations, setConversations] = useState([]);
    const [messages, setMessages] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [message, setMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [messagesError, setMessagesError] = useState(null);
    // DIR-026: distinct from `messagesError`. That one means "the thread could not
    // be read"; this one means "the thread read fine but the read receipt could
    // not be saved", so the unread badge may be stale. They must not share one
    // slot, or the user would be told their messages failed to load.
    const [readSyncError, setReadSyncError] = useState(null);

    const unsubscribeConversationsRef = useRef(null);
    const unsubscribeMessagesRef = useRef(null);
    const activeAccountUidRef = useRef(null);
    const selectedConversationIdRef = useRef(null);
    const chatContainerRef = useRef(null);

    // DIR-072: a conversation notification deep-links to
    // /dashboard/messages?conversationId=<id>. Read that param so the matching
    // thread can be auto-selected once the list loads.
    const [searchParams] = useSearchParams();
    const deepLinkConversationId = searchParams.get('conversationId');

    // Initialize Firebase auth listener and keep listener ownership account-scoped.
    useEffect(() => {
        let mounted = true;
        let conversationLoadGeneration = 0;
        const stopRealtimeListeners = () => {
            unsubscribeConversationsRef.current?.();
            unsubscribeMessagesRef.current?.();
            unsubscribeConversationsRef.current = null;
            unsubscribeMessagesRef.current = null;
        };
        const unsubscribeAuth = fire.auth().onAuthStateChanged(user => {
            stopRealtimeListeners();
            const userId = user?.uid || null;
            activeAccountUidRef.current = userId;
            setCurrentUser(user || null);
            setConversations([]);
            setMessages([]);
            setSelectedConversation(null);
            selectedConversationIdRef.current = null;
            setMessagesError(null);
            if (!userId) return;

            unsubscribeConversationsRef.current = getConversations(userId, async conversationList => {
                const loadGeneration = ++conversationLoadGeneration;
                if (!mounted || activeAccountUidRef.current !== userId || fire.auth().currentUser?.uid !== userId) return;
                try {
                    const enhancedConversations = await Promise.all(conversationList.map(async conversation => {
                        const hasOtherParticipant = Object.keys(conversation.participants || {}).some(id => id !== userId);
                        if (!hasOtherParticipant) return null;
                        const participantProfile = await getConversationParticipantProfile(conversation.id);
                        return {
                            id: conversation.id,
                            name: participantProfile.name || t('JobsUpdate.DashboardMessages.user.unknown', 'Unknown User'),
                            avatar: participantProfile.avatar || userPlaceholder,
                            time: conversation.lastMessage ? formatMessageTime(conversation.lastMessage.timestamp, t) : t('JobsUpdate.DashboardMessages.time.now', 'Now'),
                            lastMessage: conversation.lastMessage?.text || t('JobsUpdate.DashboardMessages.conversation.noMessages', 'No messages yet'),
                            // DIR-026 / AC-2: the REAL server-side unread count for
                            // THIS participant. Previously this was hardcoded to 0,
                            // which is why the list could never show a single
                            // unread thread and the nav badge had nothing to show.
                            unread: Number(conversation.unreadCount) || 0,
                            participants: conversation.participants,
                        };
                    }));
                    if (mounted && loadGeneration === conversationLoadGeneration && activeAccountUidRef.current === userId && fire.auth().currentUser?.uid === userId) {
                        setConversations(enhancedConversations.filter(Boolean));
                    }
                } catch {
                    if (mounted && loadGeneration === conversationLoadGeneration && activeAccountUidRef.current === userId) setConversations([]);
                }
            });
        });

        return () => {
            mounted = false;
            activeAccountUidRef.current = null;
            unsubscribeAuth();
            stopRealtimeListeners();
        };
    }, [t]);

    // DIR-072: auto-select the deep-linked conversation. Account-scoped by
    // construction — only a conversation that is actually present in THIS user's
    // loaded list is selected, so a forged id in the URL can never open a thread
    // the user is not a participant of.
    useEffect(() => {
        if (!deepLinkConversationId) return;
        setSelectedConversation((prev) => {
            if (prev?.id === deepLinkConversationId) return prev;
            const match = conversations.find((conversation) => conversation.id === deepLinkConversationId);
            return match || prev;
        });
    }, [deepLinkConversationId, conversations]);

    // Load initial messages when conversation is selected
    const loadInitialMessages = useCallback(
        async (conversationId) => {
            if (!conversationId || !currentUser) return;
            const userId = currentUser.uid;

            try {
                setIsLoadingMessages(true);
                setMessagesError(null);
                setMessages([]);
                setHasMoreMessages(true);

                const result = await getMessagesPaginated(conversationId, 10);
                if (activeAccountUidRef.current !== userId || fire.auth().currentUser?.uid !== userId) return;

                const formattedMessages = result.messages.map((msg) => ({
                    id: msg.id,
                    text: msg.text,
                    time: formatMessageTime(msg.timestamp, t),
                    timestamp: msg.timestamp,
                    sender: msg.senderId === userId ? 'me' : 'other',
                }));

                setMessages(formattedMessages);
                setHasMoreMessages(result.hasMore);

            } catch (error) {
                if (activeAccountUidRef.current !== userId) return;
                setMessagesError(error.message);
                setMessages([
                    {
                        id: 'error',
                        text: t('JobsUpdate.DashboardMessages.errors.sendFailed', 'Failed to load messages. Please try again.'),
                        time: 'Now',
                        sender: 'system',
                        isError: true,
                    },
                ]);
            } finally {
                if (activeAccountUidRef.current === userId) setIsLoadingMessages(false);
            }
        },
        [currentUser, t]
    );

    // Load more messages (pagination)
    const loadMoreMessages = useCallback(async () => {
        if (!selectedConversation || !hasMoreMessages || isLoadingMessages || !currentUser) return;
        const userId = currentUser.uid;

        try {
            setIsLoadingMessages(true);

            // Get the timestamp of the oldest message for pagination
            const oldestMessage = messages[0];
            const startAfter = oldestMessage?.timestamp;

            const result = await getMessagesPaginated(selectedConversation.id, 20, startAfter);
            if (activeAccountUidRef.current !== userId || fire.auth().currentUser?.uid !== userId) return;

            const formattedNewMessages = result.messages.map((msg) => ({
                id: msg.id,
                text: msg.text,
                time: formatMessageTime(msg.timestamp, t),
                timestamp: msg.timestamp,
                sender: msg.senderId === userId ? 'me' : 'other',
            }));

            // Prepend new messages to the beginning of the array (older messages)
            setMessages((prevMessages) => [...formattedNewMessages, ...prevMessages]);
            setHasMoreMessages(result.hasMore);

        } catch (error) {
            if (activeAccountUidRef.current === userId) setMessagesError(error.message || 'Older messages could not be loaded.');
        } finally {
            if (activeAccountUidRef.current === userId) setIsLoadingMessages(false);
        }
    }, [selectedConversation, hasMoreMessages, isLoadingMessages, currentUser, messages, t]);

    // Set up real-time listener for new messages (separate from initial loading)
    const setupRealTimeListener = useCallback(
        (conversationId) => {
            if (!conversationId || !currentUser) return () => {};
            const userId = currentUser.uid;

            const unsubMsg = subscribeConversationMessages(
                conversationId,
                (liveMessages) => {
                    if (activeAccountUidRef.current !== userId || fire.auth().currentUser?.uid !== userId) return;
                    // Only add messages that we don't already have and are newer than our newest message
                    setMessages((prevMessages) => {
                        if (prevMessages.length === 0) return prevMessages; // Don't add if no initial messages loaded

                        const existingIds = new Set(prevMessages.map((msg) => msg.id));
                        const newestMessageTimestamp = Math.max(...prevMessages.map((msg) => msg.timestamp || 0));

                        const newMessages = liveMessages
                            .filter((msg) => {
                                return !existingIds.has(msg.id) && msg.timestamp > newestMessageTimestamp;
                            })
                            .map((msg) => ({
                                id: msg.id,
                                text: msg.text,
                                time: formatMessageTime(msg.timestamp, t),
                                timestamp: msg.timestamp,
                                sender: msg.senderId === userId ? 'me' : 'other',
                            }));

                        if (newMessages.length > 0) {
                            // Sort new messages by timestamp to maintain order
                            newMessages.sort((a, b) => a.timestamp - b.timestamp);
                            return [...prevMessages, ...newMessages];
                        }
                        return prevMessages;
                    });
                },
                error => {
                    if (activeAccountUidRef.current === userId) setMessagesError(error.message || 'Live messages are unavailable.');
                }
            );

            return unsubMsg;
        },
        [currentUser, t]
    );

    // Load messages when conversation is selected.
    useEffect(() => {
        unsubscribeMessagesRef.current?.();
        unsubscribeMessagesRef.current = null;
        selectedConversationIdRef.current = selectedConversation?.id || null;
        if (!selectedConversation || !currentUser) return undefined;
        let cancelled = false;
        const conversationId = selectedConversation.id;
        const userId = currentUser.uid;
        setMessages([]);
        setHasMoreMessages(true);
        setMessagesError(null);
        setReadSyncError(null);

        loadInitialMessages(conversationId).then(() => {
            if (cancelled || activeAccountUidRef.current !== userId || fire.auth().currentUser?.uid !== userId) return;
            unsubscribeMessagesRef.current = setupRealTimeListener(conversationId);
        });
        return () => {
            cancelled = true;
            unsubscribeMessagesRef.current?.();
            unsubscribeMessagesRef.current = null;
        };
    }, [selectedConversation, currentUser, loadInitialMessages, setupRealTimeListener]);

    // DIR-026 / AC-2: opening a thread IS reading it, so the server read cursor is
    // advanced to the newest message actually loaded. Recording it here (rather
    // than on every poll) is what makes the badge honest: the count drops only
    // once the user has genuinely seen the message.
    //
    // A failure is surfaced rather than swallowed. Silently ignoring it would
    // leave a badge claiming unread mail the user plainly just read, which is
    // worse than an explicit, correct-looking stale badge.
    useEffect(() => {
        if (!selectedConversation?.id || !currentUser?.uid) return;
        const conversationId = selectedConversation.id;
        const userId = currentUser.uid;
        // The newest message in the loaded window is the read boundary. An
        // empty thread sends no id at all — the backend then leaves the cursor
        // untouched rather than inventing one.
        const readable = messages.filter((msg) => msg.sender !== 'system' && msg.timestamp);
        const newest = readable.reduce((latest, msg) => Math.max(latest, msg.timestamp), 0);
        const lastReadMessageId = [...readable]
            .sort((a, b) => a.timestamp - b.timestamp)
            .at(-1)?.id || '';
        // Nothing has been loaded yet: there is no honest cursor to record, and
        // advancing to "now" would mark unseen mail as read.
        if (!readable.length) return;

        let cancelled = false;
        markConversationRead(conversationId, { lastReadMessageId, lastReadAt: newest })
            .catch((error) => {
                // Honest, specific feedback: the read could not be recorded, so
                // the unread badge may still count messages the user has seen.
                // Swallowing this would be the exact "silent zero" failure the
                // unread hook exists to prevent.
                if (cancelled) return;
                if (activeAccountUidRef.current === userId) {
                    setReadSyncError(error?.message || t('JobsUpdate.DashboardMessages.errors.readSync', 'Read status could not be saved.'));
                }
            });
        return () => { cancelled = true; };
        // The read boundary is derived from the newest loaded message, so the
        // cursor is re-evaluated exactly when a NEW message arrives — which is
        // the only moment the boundary can move. Depending on `messages.length`
        // instead would miss an append that keeps the count stable.
    }, [selectedConversation?.id, currentUser?.uid, messages, t]);

    // Auto-scroll logic
    useEffect(() => {
        if (chatContainerRef.current) {
            // If we are loading more messages, we want to maintain the scroll position
            if (isLoadingMessages && hasMoreMessages) {
                const container = chatContainerRef.current;
                const previousScrollHeight = container.scrollHeight;
                const previousScrollTop = container.scrollTop;

                // After messages are prepended, restore the scroll position.
                setTimeout(() => {
                    if (chatContainerRef.current !== container) return;
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
                }, 0);
            } else {
                // Otherwise, scroll to the bottom for new messages
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
        }
    }, [messages, isLoadingMessages, hasMoreMessages]);

    const handleSendMessage = async event => {
        event.preventDefault();
        const text = message.trim();
        if (!text || !selectedConversation || !currentUser) return;
        const userId = currentUser.uid;
        const conversationId = selectedConversation.id;
        try {
            const result = await sendMessage(conversationId, userId, text);
            if (!result.success) throw new Error(result.error || t('JobsUpdate.DashboardMessages.errors.sendFailed', 'Failed to send message. Please try again.'));
            if (activeAccountUidRef.current === userId && fire.auth().currentUser?.uid === userId && selectedConversationIdRef.current === conversationId) {
                setMessage('');
                setMessagesError(null);
            }
        } catch (error) {
            if (activeAccountUidRef.current === userId) setMessagesError(error.message || t('JobsUpdate.DashboardMessages.errors.sendFailed', 'Failed to send message. Please try again.'));
        }
    };

    return (
        <div className={`flex h-full min-h-[70vh] font-sans lg:h-[calc(100vh-9rem)] ${CHAT_SURFACE}`}>
            {/* Left Sidebar - Conversations List.
                DIR-081: the list and the thread coexist only from `lg` up. Below that the
                fixed 280px column starved the thread on phones, so the list is shown
                alone until a conversation is picked and the thread then takes over with a
                back-to-list control. */}
            <div className={`${selectedConversation ? 'hidden lg:flex' : 'flex'} w-full flex-shrink-0 flex-col border-r lg:w-[320px] ${CHAT_SURFACE} ${CHAT_LINE}`}>
                {/* Search Bar */}
                <div className={`px-3 py-3 border-b ${CHAT_LINE}`}>
                    <div className="relative">
                        <FiSearch className={`absolute w-4 h-4 top-1/2 left-3 -translate-y-1/2 ${CHAT_INK_SUBTLE}`} />
                        <input
                            type="text"
                            placeholder={t('JobsUpdate.DashboardMessages.search.placeholder', 'Search')}
                            className="w-full pl-9 pr-4 py-1.5 text-sm bg-[var(--cuba-primary-soft)] border border-[var(--cuba-line)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--cuba-primary-fill)] focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                {/* Content Container */}
                <div className="flex-1 overflow-y-auto">
                    {/* Messages Header */}
                    <div className="px-3 py-2 mt-2">
                        <div className="flex justify-between items-center">
                            <h2 className={`!text-sm font-bold uppercase tracking-wider ${CHAT_INK_SUBTLE}`}>{t('JobsUpdate.DashboardMessages.header.title', 'Messages')}</h2>
                            <button type="button" className={`p-1 rounded-md transition-colors ${CHAT_INK_SUBTLE} hover:bg-[var(--cuba-primary-soft)]`}>
                                <FiEdit className="w-3.5 h-3.5" aria-hidden="true" />
                                <span className="cuba-sr-only">{t('JobsUpdate.DashboardMessages.search.placeholder', 'Search')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Placeholder for No Conversations */}
                    {conversations.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                            <div className="w-16 h-16 bg-[var(--cuba-primary-soft)] rounded-full flex items-center justify-center mb-4">
                                <FiMessageCircle className="w-8 h-8 text-[var(--cuba-primary-ink-strong)]" />
                            </div>
                            <h3 className={`text-xs font-medium mb-1 ${CHAT_INK}`}>{t('JobsUpdate.DashboardMessages.noMessages.title', 'No messages yet')}</h3>
                            <p className={`text-xs ${CHAT_INK_MUTED}`}>{t('JobsUpdate.DashboardMessages.noMessages.message', 'Employers will reach out to you here when interested in your profile')}</p>
                        </div>
                    )}

                    {/* Conversation List */}
                    <div className="p-2 space-y-1">
                        {conversations.map((convo) => (
                            <button
                                type="button"
                                key={convo.id}
                                aria-current={selectedConversation?.id === convo.id ? 'true' : undefined}
                                className={`w-full text-left flex items-center p-2 rounded-lg cursor-pointer transition-colors ${selectedConversation?.id === convo.id ? 'bg-[var(--cuba-primary-soft)]' : 'hover:bg-[var(--cuba-primary-soft)]'}`}
                                onClick={() => setSelectedConversation(convo)}>
                                <div className="relative flex-shrink-0 mr-2">
                                    <img src={convo.avatar} alt="" className="w-8 h-8 rounded-full" />
                                    {/* DIR-026 / AC-2: the live per-thread unread count.
                                        Decorative presence dot replaced by the REAL
                                        MariaDB count so the list agrees with the
                                        header badge. */}
                                    {convo.unread > 0 && (
                                        <span
                                            data-testid="messages-thread-unread"
                                            className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                                            style={{
                                                backgroundColor: 'var(--cuba-header-badge-fill)',
                                                color: 'var(--cuba-header-badge-ink)',
                                            }}
                                        >
                                            {convo.unread > 99 ? '99+' : convo.unread}
                                            <span className="cuba-sr-only"> unread messages</span>
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <p className={`text-xs font-semibold truncate ${CHAT_INK}`}>{convo.name}</p>
                                        <p className={`text-[11px] flex-shrink-0 ${CHAT_INK_MUTED}`}>{convo.time}</p>
                                    </div>
                                    <p className={`text-xs truncate mt-0.5 ${CHAT_INK_MUTED}`}>{convo.lastMessage}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - Chat Area */}
            <div className={`${selectedConversation ? 'flex' : 'hidden lg:flex'} flex-1 flex-col h-full bg-[var(--cuba-primary-soft)]`}>
                {selectedConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 shadow-sm ${CHAT_SURFACE} ${CHAT_LINE}`}>
                            <div className="flex items-center space-x-3">
                                {/* DIR-081: mobile back-to-list. Below `lg` the conversation
                                    list is hidden once a thread is open, so the user needs an
                                    explicit way back to it. */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedConversation(null)}
                                    className={`cuba-focusable lg:hidden inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border transition-colors ${CHAT_INK_SUBTLE} hover:bg-[var(--cuba-primary-soft)]`}
                                    aria-label={t('JobsUpdate.DashboardMessages.backToList', 'Back to conversations')}
                                >
                                    <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <div className="relative flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full overflow-hidden ring-2 hover:ring-[var(--cuba-primary-soft)] transition-all duration-200" style={{ '--tw-ring-color': 'var(--cuba-line)' }}>
                                        <img src={selectedConversation.avatar} alt="" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className={`text-xs font-semibold truncate leading-tight ${CHAT_INK}`}>{selectedConversation.name}</h3>
                                    {/* DIR-026: the pulsing "Active now" indicator and the
                                        green presence dot were FABRICATED — nothing in
                                        `conversation_participants` or
                                        `conversation_messages` records presence, so
                                        that dot asserted a real-time fact the platform
                                        cannot know. Replaced with the one honest,
                                        server-derived fact available: the real unread
                                        count for this thread. */}
                                    <p className={`text-xs font-medium ${CHAT_INK_MUTED}`}>
                                        {selectedConversation.unread > 0
                                            ? t('JobsUpdate.DashboardMessages.status.unread', '{{count}} unread', { count: selectedConversation.unread })
                                            : t('JobsUpdate.DashboardMessages.noMessages.title', 'No messages yet')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button type="button" className={`p-2 rounded-lg transition-all duration-200 group ${CHAT_INK_SUBTLE} hover:text-[var(--cuba-ink)] hover:bg-[var(--cuba-primary-soft)]`}>
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                        />
                                    </svg>
                                    <span className="cuba-sr-only">{t('JobsUpdate.DashboardMessages.status.active', 'Call')}</span>
                                </button>
                                <button type="button" className={`p-2 rounded-lg transition-all duration-200 group ${CHAT_INK_SUBTLE} hover:text-[var(--cuba-ink)] hover:bg-[var(--cuba-primary-soft)]`}>
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                    </svg>
                                </button>
                                <button className={`p-2 rounded-lg transition-all duration-200 group ${CHAT_INK_SUBTLE} hover:text-[var(--cuba-ink)] hover:bg-[var(--cuba-primary-soft)]`}>
                                    <FiMoreVertical className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div ref={chatContainerRef} className="flex-1 px-5 py-6 overflow-y-auto">
                            {/* Load More Button */}
                            <div className="text-center mb-4">
                                {hasMoreMessages ? (
                                    <button
                                        onClick={loadMoreMessages}
                                        disabled={isLoadingMessages}
                                        className={`text-xs text-[var(--cuba-primary-ink-strong)] hover:text-[var(--cuba-primary-fill)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center mx-auto px-2.5 py-1 rounded-full shadow-sm border ${CHAT_LINE} ${CHAT_SURFACE}`}>
                                        {isLoadingMessages ? (
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[var(--cuba-primary-fill)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <FiChevronUp className="w-4 h-4 mr-1" />
                                        )}
                                        {isLoadingMessages
                                            ? t('JobsUpdate.DashboardMessages.loading.inProgress', 'Loading...')
                                            : t('JobsUpdate.DashboardMessages.loading.loadMore', 'Load Older Messages')}
                                    </button>
                                ) : (
                                    <p className={`text-xs ${CHAT_INK_MUTED}`}>{t('JobsUpdate.DashboardMessages.loading.noMore', 'No more messages')}</p>
                                )}
                            </div>

                            {messages.length > 0 ? (
                                messages.map((msg) => (
                                    <div key={msg.id} className={`flex items-end mb-6 gap-3 ${msg.sender === 'me' ? 'flex-row-reverse' : msg.sender === 'system' ? 'justify-center' : ''}`}>
                                        {msg.sender !== 'system' && msg.sender !== 'me' && (
                                            <div className="flex-shrink-0 self-start">
                                                <img src={selectedConversation.avatar} alt={selectedConversation.name} className="w-8 h-8 rounded-full shadow-sm" />
                                            </div>
                                        )}
                                        <div
                                            className={`max-w-xs sm:max-w-md rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 ${
                                                msg.sender === 'me'
                                                    ? CHAT_PRIMARY
                                                    : msg.sender === 'system' && msg.isError
                                                    ? 'bg-cuba-danger-soft text-cuba-danger border border-cuba-danger/30'
                                                    : `border ${CHAT_SURFACE} shadow-md`
                                            }`}>
                                            <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                                            {msg.isError && (
                                                <p className="text-xs mt-2 text-cuba-danger">
                                                    {t('JobsUpdate.DashboardMessages.errors.connection', 'Check your connection and try again.')}
                                                </p>
                                            )}
                                        </div>
                                        {/* DIR-026 / INV-4: this timestamp used a legacy
                                            grey utility (~2.9:1 on white — below the AA floor).
                                            It now uses the audited `--cuba-ink-subtle` token,
                                            which clears 4.5:1 in BOTH light and dark themes. */}
                                        {msg.sender !== 'system' && <span className={`text-[10px] flex-shrink-0 px-1 self-end ${CHAT_INK_SUBTLE}`}>{msg.time}</span>}
                                    </div>
                                ))
                            ) : isLoadingMessages ? (
                                <div className={`flex flex-col items-center justify-center h-full ${CHAT_INK_MUTED}`}>
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mb-4" style={{ borderColor: 'var(--cuba-primary-fill)' }}></div>
                                    <p className="text-sm font-medium">{t('JobsUpdate.DashboardMessages.loading.messages', 'Loading messages...')}</p>
                                </div>
                            ) : messagesError ? (
                                <div className="flex flex-col items-center justify-center h-full text-cuba-danger">
                                    <div className="w-16 h-16 bg-cuba-danger-soft rounded-full flex items-center justify-center mb-4">
                                        <FiMessageCircle className="w-8 h-8 text-cuba-danger" />
                                    </div>
                                    <p className="text-sm font-medium mb-2">{t('JobsUpdate.DashboardMessages.errors.loadFailed', 'Failed to load messages')}</p>
                                    <p className={`text-xs text-center max-w-sm ${CHAT_INK_MUTED}`}>{messagesError}</p>
                                </div>
                            ) : (
                                <div className={`flex flex-col items-center justify-center h-full ${CHAT_INK_MUTED}`}>
                                    <div className="w-20 h-20 bg-[var(--cuba-primary-soft)] rounded-full flex items-center justify-center mb-6">
                                        <FiMessageCircle className="w-10 h-10 text-[var(--cuba-primary-ink-strong)]" />
                                    </div>
                                    <h3 className={`text-base font-semibold mb-2 ${CHAT_INK}`}>{t('JobsUpdate.DashboardMessages.emptyState.title', 'No messages in this conversation')}</h3>
                                    <p className={`text-sm text-center max-w-sm mb-4 ${CHAT_INK_MUTED}`}>
                                        {t('JobsUpdate.DashboardMessages.emptyState.description', 'This is the beginning of your conversation with {{name}}.', { name: selectedConversation?.name })}
                                    </p>
                                    <div className={`flex items-center text-xs ${CHAT_INK_SUBTLE}`}>
                                        <FiUser className="w-4 h-4 mr-1" aria-hidden="true" />
                                        <span>{t('JobsUpdate.DashboardMessages.emptyState.hint', 'Messages will appear here')}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* DIR-026: the read receipt could not be saved, so the unread badge may be
                            stale. Announced politely because it is advisory, not a
                            failure to load or send anything. */}
                            {readSyncError && (
                                <p role="status" data-testid="messages-read-sync-error" className={`px-5 pt-2 text-xs ${CHAT_INK_MUTED}`}>
                                    {readSyncError}
                                </p>
                            )}
                            {/* Message Input */}
                        <div className={`px-5 py-3 border-t flex-shrink-0 ${CHAT_SURFACE} ${CHAT_LINE}`}>
                            <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                                <input
                                    type="text"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder={t('JobsUpdate.DashboardMessages.input.placeholder', 'Type a message...')}
                                    aria-label={t('JobsUpdate.DashboardMessages.input.placeholder', 'Type a message...')}
                                    className="flex-1 px-4 py-2 text-sm bg-[var(--cuba-primary-soft)] border border-transparent rounded-lg focus:ring-1 focus:bg-[var(--cuba-card)] transition"
                                    style={{ '--tw-ring-color': 'var(--cuba-primary-fill)' }}
                                    autoComplete="off"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{
                                        backgroundColor: 'var(--cuba-primary-fill)',
                                        color: 'var(--cuba-header-badge-ink)',
                                    }}
                                    disabled={!message.trim()}>
                                    {t('JobsUpdate.DashboardMessages.input.sendButton', 'Send')}
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className={`flex-1 flex flex-col items-center justify-center px-8 ${CHAT_INK_MUTED}`}>
                        <div className="w-24 h-24 bg-[var(--cuba-primary-soft)] rounded-full flex items-center justify-center mb-6">
                            <FiUsers className="w-12 h-12 text-[var(--cuba-primary-ink-strong)]" />
                        </div>
                        <h3 className={`text-lg font-semibold mb-3 ${CHAT_INK}`}>{t('JobsUpdate.DashboardMessages.welcome.title', 'Welcome to Messages')}</h3>
                        <p className={`text-center max-w-md mb-6 ${CHAT_INK_MUTED}`}>
                            {t('JobsUpdate.DashboardMessages.welcome.description', 'Select a conversation from the sidebar to start chatting with your contacts.')}
                        </p>
                        <div className={`flex items-center text-sm ${CHAT_INK_SUBTLE}`}>
                            <FiMessageCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                            <span>{t('JobsUpdate.DashboardMessages.welcome.hint', 'Choose a conversation to begin messaging')}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export default withTranslation('common')(DashboardMessages);
