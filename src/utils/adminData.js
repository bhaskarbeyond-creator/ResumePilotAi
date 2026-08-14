const text = (value, fallback = '') => String(value ?? fallback).replace(/\p{Cc}/gu, ' ').trim();

export function toAdminDate(value) {
    const candidate = value?.toDate?.() || value;
    const date = candidate instanceof Date ? candidate : new Date(candidate || 0);
    return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
}

export function normalizeAdminSubscription(input = {}, index = 0, now = new Date()) {
    const data = input && typeof input === 'object' ? input : {};
    const expiresAt = toAdminDate(data.membershipEnds || data.sbsEnd || data.currentPeriodEnd || data.expiresAt);
    const explicitStatus = text(data.status).toLowerCase();
    const inactiveStatuses = ['cancelled', 'canceled', 'refunded', 'inactive', 'expired'];
    const activeStatuses = ['active', 'trialing', 'paid'];
    const active = explicitStatus ? activeStatuses.includes(explicitStatus) : Boolean(expiresAt && expiresAt > now);
    return {
        key: text(data.id || data.subscriptionId || `${data.userId || 'subscription'}-${index}`),
        userId: text(data.userId || data.uid, 'Unknown'),
        plan: text(data.plan || data.membership || data.type, 'Unknown'),
        expiresAt,
        paymentProvider: text(data.paymentProvider || data.paymentType || data.paimentType || data.provider, 'Unknown'),
        status: explicitStatus || (expiresAt ? (active ? 'active' : 'expired') : 'unknown'),
        active: active && !inactiveStatuses.includes(explicitStatus),
    };
}

export function normalizeAdminMetrics(stats, earnings) {
    const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
    return {
        users: finite(stats?.numberOfUsers),
        resumes: finite(stats?.numberOfResumesCreated),
        downloads: finite(stats?.numberOfResumesDownloaded),
        earnings: finite(earnings?.amount),
        currency: /^[A-Z]{3}$/.test(text(earnings?.currency).toUpperCase()) ? text(earnings.currency).toUpperCase() : 'USD',
        updatedAt: toAdminDate(stats?.updatedAt || earnings?.updatedAt),
    };
}

export function formatAdminMoney(amount, currency = 'USD') {
    if (!Number.isFinite(amount)) return 'Unavailable';
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}
