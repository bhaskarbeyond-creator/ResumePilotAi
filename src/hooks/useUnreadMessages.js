import { useState, useEffect } from 'react';
import { getConversations } from '../firestore/dbOperations';
import fire from '../conf/fire';

export const useUnreadMessages = () => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsubscribeAuth = fire.auth().onAuthStateChanged((user) => {
            setCurrentUser(user);
        });

        return unsubscribeAuth;
    }, []);

    useEffect(() => {
        if (!currentUser) {
            setUnreadCount(0);
            return;
        }

        const unsubscribeConversations = getConversations(
            currentUser.uid,
            (conversations) => {
                // Count conversations with unread messages
                // This is a simplified implementation - you might need to adjust based on your data structure
                let totalUnread = 0;
                
                conversations.forEach(conversation => {
                    // Check if there are unread messages for this user
                    // You might need to adjust this logic based on how you track unread status
                    if (conversation.unreadCount && conversation.unreadCount[currentUser.uid]) {
                        totalUnread += conversation.unreadCount[currentUser.uid];
                    } else if (conversation.lastMessage && 
                               conversation.lastMessage.senderId !== currentUser.uid && 
                               !conversation.lastMessage.readBy?.[currentUser.uid]) {
                        // Simple fallback: if last message is not from current user and not read by them
                        totalUnread += 1;
                    }
                });

                setUnreadCount(totalUnread);
            }
        );

        return unsubscribeConversations;
    }, [currentUser]);

    return unreadCount;
};
