import { apiFetch } from './client.js';

export async function getNotifications() {
    const data = await apiFetch('/api/notifications-data');
    return data.notifications || [];
}

export async function saveNotification(notifId, notifData) {
    const data = await apiFetch(`/api/notifications-data/${notifId}`, {
        method: 'POST',
        body: JSON.stringify(notifData)
    });
    return data.notification;
}

export async function getContactMessages() {
    const data = await apiFetch('/api/notifications-data/contact/list');
    return data.messages || [];
}

export async function saveContactMessage(msgId, messageData) {
    const data = await apiFetch(`/api/notifications-data/contact/${msgId}`, {
        method: 'POST',
        body: JSON.stringify(messageData)
    });
    return data.message;
}
