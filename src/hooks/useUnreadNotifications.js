import { useCallback, useEffect, useRef, useState } from 'react';
import { getUnreadNotifications, subscribeUnreadNotifications } from '../firestore/dbOperations';
import fire from '../conf/fire';

export const useUnreadNotifications = () => {
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const [currentUser, setCurrentUser] = useState(null);
    const generation = useRef(0);

    useEffect(() => fire.auth().onAuthStateChanged(user => {
        generation.current += 1;
        setUnreadNotificationCount(0);
        setCurrentUser(user || null);
    }), []);

    useEffect(() => {
        if (!currentUser) return undefined;
        const userId = currentUser.uid;
        const currentGeneration = generation.current;
        return subscribeUnreadNotifications(userId, notifications => {
            if (generation.current === currentGeneration && fire.auth().currentUser?.uid === userId) setUnreadNotificationCount(notifications.length);
        }, () => {
            if (generation.current === currentGeneration) setUnreadNotificationCount(0);
        });
    }, [currentUser]);

    const refreshCount = useCallback(async () => {
        const userId = fire.auth().currentUser?.uid;
        const currentGeneration = generation.current;
        if (!userId) { setUnreadNotificationCount(0); return; }
        try {
            const notifications = await getUnreadNotifications(userId);
            if (generation.current === currentGeneration && fire.auth().currentUser?.uid === userId) setUnreadNotificationCount(notifications.length);
        } catch {
            if (generation.current === currentGeneration) setUnreadNotificationCount(0);
        }
    }, []);

    return { unreadNotificationCount, refreshCount };
};
