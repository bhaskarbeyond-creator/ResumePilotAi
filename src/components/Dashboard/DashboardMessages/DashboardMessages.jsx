import React, { useState, useRef, useEffect, useCallback } from 'react';
import { withTranslation } from 'react-i18next';
import { FiSearch, FiPaperclip, FiSend, FiMoreVertical, FiEdit, FiChevronUp, FiMessageCircle, FiUser, FiUsers } from 'react-icons/fi';
import { getConversations, getMessages, getMessagesPaginated, sendMessage, getUserData } from '../../../firestore/dbOperations';
import fire from '../../../conf/fire';
import userPlaceholder from '../../../assets/user.png';

const DashboardMessages = ({ t }) => {
    const [conversations, setConversations] = useState([]);
    const [messages, setMessages] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [message, setMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [messagesError, setMessagesError] = useState(null);

    const [unsubscribeConversations, setUnsubscribeConversations] = useState(null);
    const [unsubscribeMessages, setUnsubscribeMessages] = useState(null);
    const chatContainerRef = useRef(null);

    // Initialize Firebase auth listener and load conversations
    useEffect(() => {
        const unsubscribeAuth = fire.auth().onAuthStateChanged(async (user) => {
            if (user) {
                setCurrentUser(user);
                // Load user's conversations
                const unsubConv = getConversations(user.uid, async (conversations) => {
                    try {
                        // Enhance conversations with user data
                        const enhancedConversations = await Promise.all(
                            conversations.map(async (conv, index) => {
                                const participantIds = Object.keys(conv.participants).filter((id) => id !== user.uid);
                                const otherUserId = participantIds[0];

                                if (otherUserId) {
                                    const userData = await getUserData(otherUserId);
                                    return {
                                        id: conv.id,
                                        name: userData?.profile?.name || t('JobsUpdate.DashboardMessages.user.unknown', 'Unknown User'),
                                        avatar: userData?.profile?.image || userPlaceholder,
                                        time: conv.lastMessage ? formatTime(conv.lastMessage.timestamp) : t('JobsUpdate.DashboardMessages.time.now', 'Now'),
                                        lastMessage: conv.lastMessage?.text || t('JobsUpdate.DashboardMessages.conversation.noMessages', 'No messages yet'),
                                        unread: 0,
                                        participants: conv.participants,
                                    };
                                }
                                return null;
                            })
                        );

                        const filteredConversations = enhancedConversations.filter(Boolean);
                        setConversations(filteredConversations);
                    } catch (error) {
                        // Handle error silently
                    }
                });

                setUnsubscribeConversations(() => unsubConv);
            } else {
                setCurrentUser(null);
                setConversations([]);
                setMessages([]);
                setSelectedConversation(null);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeConversations) unsubscribeConversations();
            if (unsubscribeMessages) unsubscribeMessages();
        };
    }, []);

    // Load initial messages when conversation is selected
    const loadInitialMessages = useCallback(
        async (conversationId) => {
            if (!conversationId || !currentUser) return;

            try {
                setIsLoadingMessages(true);
                setMessagesError(null);
                setMessages([]);
                setHasMoreMessages(true);

                const result = await getMessagesPaginated(conversationId, 10);

                const formattedMessages = result.messages.map((msg) => ({
                    id: msg.id,
                    text: msg.text,
                    time: formatTime(msg.timestamp),
                    timestamp: msg.timestamp,
                    sender: msg.senderId === currentUser.uid ? 'me' : 'other',
                }));

                setMessages(formattedMessages);
                setHasMoreMessages(result.hasMore);

            } catch (error) {
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
                setIsLoadingMessages(false);
            }
        },
        [currentUser]
    );

    // Load more messages (pagination)
    const loadMoreMessages = useCallback(async () => {
        if (!selectedConversation || !hasMoreMessages || isLoadingMessages || !currentUser) return;

        try {
            setIsLoadingMessages(true);

            // Get the timestamp of the oldest message for pagination
            const oldestMessage = messages[0];
            const startAfter = oldestMessage?.timestamp;

            const result = await getMessagesPaginated(selectedConversation.id, 20, startAfter);

            const formattedNewMessages = result.messages.map((msg) => ({
                id: msg.id,
                text: msg.text,
                time: formatTime(msg.timestamp),
                timestamp: msg.timestamp,
                sender: msg.senderId === currentUser.uid ? 'me' : 'other',
            }));

            // Prepend new messages to the beginning of the array (older messages)
            setMessages((prevMessages) => [...formattedNewMessages, ...prevMessages]);
            setHasMoreMessages(result.hasMore);

        } catch (error) {
            // Don't replace all messages on error, just show a toast or similar
        } finally {
            setIsLoadingMessages(false);
        }
    }, [selectedConversation, hasMoreMessages, isLoadingMessages, currentUser, messages]);

    // Set up real-time listener for new messages (separate from initial loading)
    const setupRealTimeListener = useCallback(
        (conversationId) => {
            if (!conversationId || !currentUser) return;

            const unsubMsg = getMessages(
                conversationId,
                (liveMessages) => {
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
                                time: formatTime(msg.timestamp),
                                timestamp: msg.timestamp,
                                sender: msg.senderId === currentUser.uid ? 'me' : 'other',
                            }));

                        if (newMessages.length > 0) {
                            // Sort new messages by timestamp to maintain order
                            newMessages.sort((a, b) => a.timestamp - b.timestamp);
                            return [...prevMessages, ...newMessages];
                        }
                        return prevMessages;
                    });
                },
                (error) => {
                    console.error('Error with real-time messages:', error);
                }
            );

            return unsubMsg;
        },
        [currentUser]
    );

    // Load messages when conversation is selected
    useEffect(() => {
        if (selectedConversation && currentUser) {
            // Clean up previous message subscription
            if (unsubscribeMessages) unsubscribeMessages();

            // Reset message state
            setMessages([]);
            setHasMoreMessages(true);
            setMessagesError(null);

            // Load initial messages using pagination
            loadInitialMessages(selectedConversation.id).then(() => {
                // Set up real-time listener after initial messages are loaded
                const unsubMsg = setupRealTimeListener(selectedConversation.id);
                setUnsubscribeMessages(() => unsubMsg);
            });
        }
    }, [selectedConversation, currentUser, loadInitialMessages, setupRealTimeListener]);

    // Auto-scroll logic
    useEffect(() => {
        if (chatContainerRef.current) {
            // If we are loading more messages, we want to maintain the scroll position
            if (isLoadingMessages && hasMoreMessages) {
                const previousScrollHeight = chatContainerRef.current.scrollHeight;
                const previousScrollTop = chatContainerRef.current.scrollTop;

                // After messages are prepended, restore the scroll position
                // Use a timeout to allow the DOM to update
                setTimeout(() => {
                    const newScrollHeight = chatContainerRef.current.scrollHeight;
                    chatContainerRef.current.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
                }, 0);
            } else {
                // Otherwise, scroll to the bottom for new messages
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
        }
    }, [messages, isLoadingMessages, hasMoreMessages]);

    // Helper function to format timestamp
    const formatTime = (timestamp) => {
        if (!timestamp) return t('JobsUpdate.DashboardMessages.time.now', 'Now');
        const date = new Date(timestamp);
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));

        if (diffInMinutes < 1) return t('JobsUpdate.DashboardMessages.time.now', 'Now');
        if (diffInMinutes < 60) return t('JobsUpdate.DashboardMessages.time.minutes', '{{count}}min ago', { count: diffInMinutes });
        if (diffInMinutes < 1440) return t('JobsUpdate.DashboardMessages.time.hours', '{{count}}hr ago', { count: Math.floor(diffInMinutes / 60) });
        return date.toLocaleDateString();
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (message.trim() && selectedConversation && currentUser) {
            try {
                await sendMessage(selectedConversation.id, currentUser.uid, message.trim());
                setMessage('');

                // The real-time listener will automatically pick up the new message
                // No need to manually reload messages
                console.log('✅ Message sent successfully');
            } catch (error) {
                console.error('Failed to send message:', error);
                alert(t('JobsUpdate.DashboardMessages.errors.sendFailed', 'Failed to send message. Please try again.'));
            }
        }
    };

    return (
        <div className="flex h-screen bg-white font-sans text-gray-900">
            {/* Left Sidebar - Conversations List */}
            <div className="w-[280px] flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
                {/* Search Bar */}
                <div className="px-3 py-3 border-b border-gray-100">
                    <div className="relative">
                        <FiSearch className="absolute w-4 h-4 text-gray-400 top-1/2 left-3 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder={t('JobsUpdate.DashboardMessages.search.placeholder', 'Search')}
                            className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                {/* Content Container */}
                <div className="flex-1 overflow-y-auto">
                    {/* Messages Header */}
                    <div className="px-3 py-2 mt-2">
                        <div className="flex justify-between items-center">
                            <h2 className="!text-sm font-bold text-gray-400 uppercase tracking-wider">{t('JobsUpdate.DashboardMessages.header.title', 'Messages')}</h2>
                            <button className="p-1 text-gray-400 rounded-md hover:bg-gray-100 transition-colors">
                                <FiEdit className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Placeholder for No Conversations */}
                    {conversations.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                <FiMessageCircle className="w-8 h-8 text-blue-400" />
                            </div>
                            <h3 className="text-xs font-medium text-gray-700 mb-1">{t('JobsUpdate.DashboardMessages.noMessages.title', 'No messages yet')}</h3>
                            <p className="text-xs text-gray-500">{t('JobsUpdate.DashboardMessages.noMessages.message', 'Employers will reach out to you here when interested in your profile')}</p>
                        </div>
                    )}

                    {/* Conversation List */}
                    <div className="p-2 space-y-1">
                        {conversations.map((convo) => (
                            <div
                                key={convo.id}
                                className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${selectedConversation?.id === convo.id ? 'bg-gray-100' : 'hover:bg-gray-100/50'}`}
                                onClick={() => setSelectedConversation(convo)}>
                                <div className="relative flex-shrink-0 mr-2">
                                    <img src={convo.avatar} alt={convo.name} className="w-8 h-8 rounded-full" />
                                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{convo.name}</p>
                                        <p className="text-[11px] text-gray-500 flex-shrink-0">{convo.time}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{convo.lastMessage}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - Chat Area */}
            <div className="flex-1 flex flex-col bg-gray-100 h-full">
                {selectedConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100 flex-shrink-0 shadow-sm">
                            <div className="flex items-center space-x-3">
                                <div className="relative flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-gray-100 hover:ring-blue-200 transition-all duration-200">
                                        <img src={selectedConversation.avatar} alt={selectedConversation.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white shadow-sm"></div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-xs font-semibold text-gray-900 truncate leading-tight">{selectedConversation.name}</h3>
                                    <div className="flex items-center space-x-1 mt-0.5">
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                                        <p className="text-xs text-gray-500 font-medium">{t('JobsUpdate.DashboardMessages.status.active', 'Active now')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200 group">
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                        />
                                    </svg>
                                </button>
                                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200 group">
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                    </svg>
                                </button>
                                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200 group">
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
                                        className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center mx-auto bg-white px-2.5 py-1 rounded-full shadow-sm border border-gray-200">
                                        {isLoadingMessages ? (
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                                    <p className="text-xs text-gray-500">{t('JobsUpdate.DashboardMessages.loading.noMore', 'No more messages')}</p>
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
                                                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                                    : msg.sender === 'system' && msg.isError
                                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                                    : 'bg-white text-gray-800 shadow-md'
                                            }`}>
                                            <p className="text-sm leading-relaxed break-words">{msg.text}</p>
                                            {msg.isError && (
                                                <p className="text-xs mt-2 text-red-600">
                                                    {t('JobsUpdate.DashboardMessages.errors.connection', 'Check your Firebase security rules and network connection.')}
                                                </p>
                                            )}
                                        </div>
                                        {msg.sender !== 'system' && <span className="text-[10px] text-gray-400 flex-shrink-0 px-1 self-end">{msg.time}</span>}
                                    </div>
                                ))
                            ) : isLoadingMessages ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                                    <p className="text-sm font-medium">{t('JobsUpdate.DashboardMessages.loading.messages', 'Loading messages...')}</p>
                                </div>
                            ) : messagesError ? (
                                <div className="flex flex-col items-center justify-center h-full text-red-500">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                        <FiMessageCircle className="w-8 h-8 text-red-400" />
                                    </div>
                                    <p className="text-sm font-medium mb-2">{t('JobsUpdate.DashboardMessages.errors.loadFailed', 'Failed to load messages')}</p>
                                    <p className="text-xs text-gray-500 text-center max-w-sm">{messagesError}</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                                        <FiMessageCircle className="w-10 h-10 text-blue-400" />
                                    </div>
                                    <h3 className="text-base font-semibold text-gray-800 mb-2">{t('JobsUpdate.DashboardMessages.emptyState.title', 'No messages in this conversation')}</h3>
                                    <p className="text-sm text-gray-500 text-center max-w-sm mb-4">
                                        {t('JobsUpdate.DashboardMessages.emptyState.description', 'This is the beginning of your conversation with {{name}}.', { name: selectedConversation?.name })}
                                    </p>
                                    <div className="flex items-center text-xs text-gray-400">
                                        <FiUser className="w-4 h-4 mr-1" />
                                        <span>{t('JobsUpdate.DashboardMessages.emptyState.hint', 'Messages will appear here')}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Message Input */}
                        <div className="px-5 py-3 bg-white border-t border-gray-200/80 flex-shrink-0">
                            <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                                <input
                                    type="text"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder={t('JobsUpdate.DashboardMessages.input.placeholder', 'Type a message...')}
                                    className="flex-1 px-4 py-2 text-sm bg-gray-100 border-transparent rounded-lg focus:ring-1 focus:ring-blue-500 focus:bg-white transition"
                                    autoComplete="off"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                                    disabled={!message.trim()}>
                                    {t('JobsUpdate.DashboardMessages.input.sendButton', 'Send')}
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 px-8">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                            <FiUsers className="w-12 h-12 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">{t('JobsUpdate.DashboardMessages.welcome.title', 'Welcome to Messages')}</h3>
                        <p className="text-center text-gray-500 max-w-md mb-6">
                            {t('JobsUpdate.DashboardMessages.welcome.description', 'Select a conversation from the sidebar to start chatting with your contacts.')}
                        </p>
                        <div className="flex items-center text-sm text-gray-400">
                            <FiMessageCircle className="w-4 h-4 mr-2" />
                            <span>{t('JobsUpdate.DashboardMessages.welcome.hint', 'Choose a conversation to begin messaging')}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default withTranslation('common')(DashboardMessages);
