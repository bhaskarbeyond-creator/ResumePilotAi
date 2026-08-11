import { useState, useEffect } from 'react';
import { getUnreadNotifications } from '../firestore/dbOperations';
import fire from '../conf/fire';

export const useUnreadNotifications = () => {
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsubscribeAuth = fire.auth().onAuthStateChanged((user) => {
            setCurrentUser(user);
        });

        return unsubscribeAuth;
    }, []);

    // Fetch unread notifications count
    const fetchUnreadCount = async () => {
        if (!currentUser) {
            setUnreadNotificationCount(0);
            return;
        }

        try {
            const notifications = await getUnreadNotifications(currentUser.uid);
            setUnreadNotificationCount(notifications.length);
        } catch (error) {
            console.error('Error fetching unread notifications:', error);
            setUnreadNotificationCount(0);
        }
    };

    useEffect(() => {
        fetchUnreadCount();

        // Set up a periodic refresh to keep the count updated
        const interval = setInterval(fetchUnreadCount, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [currentUser]);

    // Function to manually refresh the count
    const refreshCount = () => {
        fetchUnreadCount();
    };

    return { unreadNotificationCount, refreshCount };
};
