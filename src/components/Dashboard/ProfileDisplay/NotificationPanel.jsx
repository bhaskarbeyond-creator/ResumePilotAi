import React, { useState, useEffect, useContext } from 'react';
import { FiX, FiBell, FiCheck, FiClock, FiUser, FiBriefcase, FiMail } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { getUnreadNotifications, markNotificationAsRead } from '../../../firestore/dbOperations';
import { AuthContext } from '../../../main';

const NotificationPanel = ({ isOpen, onClose, sidebarCollapsed = false }) => {
    const [notifications, setNotifications] = useState([]);
    const authUser = useContext(AuthContext);

    useEffect(() => {
        if (isOpen && authUser?.uid) {
            getUnreadNotifications(authUser.uid).then(fetchedNotifications => {
                // Sort notifications by createdAt date (newest first)
                const sortedNotifications = fetchedNotifications.sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                    return dateB - dateA;
                });
                setNotifications(sortedNotifications);
            });
        }
    }, [isOpen, authUser?.uid]);

    const markAllAsRead = async () => {
        await Promise.all(notifications.map(n => markNotificationAsRead(authUser?.uid, n.id)));
        setNotifications([]);
        // Trigger a refresh of the parent component's notification count
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('notificationsUpdated'));
        }
    };

    const unreadCount = notifications.length;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/10 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />
                    
                    {/* Panel */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, x: -20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, x: -20 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`fixed top-24 w-[24rem] bg-white/80 backdrop-blur-xl border border-gray-200/50 rounded-xl shadow-xl z-50 overflow-hidden ${
                            sidebarCollapsed ? 'left-24' : 'left-72'
                        }`}
                        style={{ transform: 'translateX(10px)' }}
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-gray-200/80">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-semibold text-gray-800">Notifications</h3>
                                    {unreadCount > 0 && (
                                        <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                                            {unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={markAllAsRead}
                                        className="text-xs text-purple-600 hover:text-purple-800 font-semibold transition-colors disabled:text-gray-400 disabled:cursor-not-allowed"
                                        disabled={unreadCount === 0}
                                    >
                                        Mark all read
                                    </button>
                                    <button 
                                        onClick={onClose}
                                        className="p-1 hover:bg-gray-200/50 transition-colors"
                                    >
                                        <FiX className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="max-h-[22rem] overflow-y-auto divide-y divide-gray-200/50">
                            {notifications.length === 0 ? (
                                <div className="px-4 py-6 text-center">
                                    <FiBell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">No notifications</p>
                                </div>
                            ) : (
                                notifications.map((notification, index) => {
                                    // Map notification type to icon and colors
                                    const getNotificationStyle = (type) => {
                                        switch (type) {
                                            case 'job_application':
                                                return {
                                                    icon: FiCheck,
                                                    iconColor: 'text-green-500',
                                                    iconBg: 'bg-green-100'
                                                };
                                            case 'application_interview':
                                            case 'application_accepted':
                                            case 'application_rejected':
                                            case 'application_status_update':
                                                return {
                                                    icon: FiBriefcase,
                                                    iconColor: 'text-blue-500',
                                                    iconBg: 'bg-blue-100'
                                                };
                                            case 'job_status_update':
                                                return {
                                                    icon: FiBriefcase,
                                                    iconColor: 'text-indigo-500',
                                                    iconBg: 'bg-indigo-100'
                                                };
                                            case 'message':
                                                return {
                                                    icon: FiMail,
                                                    iconColor: 'text-purple-500',
                                                    iconBg: 'bg-purple-100'
                                                };
                                            case 'reminder':
                                                return {
                                                    icon: FiClock,
                                                    iconColor: 'text-orange-500',
                                                    iconBg: 'bg-orange-100'
                                                };
                                            default:
                                                return {
                                                    icon: FiBell,
                                                    iconColor: 'text-blue-500',
                                                    iconBg: 'bg-blue-100'
                                                };
                                        }
                                    };

                                    const style = getNotificationStyle(notification.type);
                                    const IconComponent = style.icon;

                                    // Calculate time ago
                                    const timeAgo = (date) => {
                                        const now = new Date();
                                        const createdAt = date?.toDate ? date.toDate() : new Date(date);
                                        const diffInMs = now - createdAt;
                                        const diffInMins = Math.floor(diffInMs / (1000 * 60));
                                        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
                                        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

                                        if (diffInMins < 1) return 'now';
                                        if (diffInMins < 60) return `${diffInMins}m`;
                                        if (diffInHours < 24) return `${diffInHours}h`;
                                        return `${diffInDays}d`;
                                    };

                                    return (
                                        <motion.div
                                            key={notification.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer bg-blue-50/20"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-7 h-7 ${style.iconBg} rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                                    <IconComponent className={`w-3.5 h-3.5 ${style.iconColor}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <h4 className="text-sm font-medium text-gray-900 truncate">
                                                            {notification.title}
                                                        </h4>
                                                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                                            <span className="text-xs text-gray-500">
                                                                {timeAgo(notification.createdAt)}
                                                            </span>
                                                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" title="Unread"></div>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-gray-600 leading-tight">
                                                        {notification.message}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2 bg-gray-50/70 border-t border-gray-200/80">
                            <button className="w-full text-center text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors">
                                View all notifications
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default NotificationPanel;



