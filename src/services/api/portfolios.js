import { apiFetch } from './client.js';

/**
 * Pure, client-side mirror of the backend slug normalizer
 * (`backend/repositories/portfolioSlug.js`).
 *
 * This exists purely so the studio can reject obviously-invalid input
 * INSTANTLY (synchronously, while the candidate is still typing) without a
 * round trip, and so the field can display a truthful preview of the address
 * that will be issued. It is never treated as authoritative: the server probe
 * below is the only source of truth for availability, exactly as INV-3
 * requires. Both sides derive from the same documented chain, so the preview
 * cannot disagree with the server response for any input that passes here.
 */
export function normalizePortfolioSlugBase(input) {
    const supplied = String(input == null ? '' : input).trim().toLowerCase();
    return supplied
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 130);
}

/**
 * Debounced-callable availability probe against the authoritative MariaDB.
 *
 * Never throws for the "taken"/"invalid" cases — those are normal answers,
 * not errors. Transport failures reject so callers can render a neutral
 * "could not verify" state instead of a false "available".
 */
export async function checkPortfolioSlugAvailability(base, portfolioId = null) {
    const normalized = normalizePortfolioSlugBase(base);
    if (normalized.length < 3) {
        return { base: normalized, slug: '', available: false, reason: 'TOO_SHORT' };
    }
    const params = new URLSearchParams({ base: normalized });
    if (portfolioId) params.set('portfolioId', String(portfolioId));
    const data = await apiFetch(`/api/portfolios/slug-availability?${params.toString()}`);
    return {
        base: data.base || normalized,
        slug: data.slug || '',
        available: data.available === true,
        reason: data.available === true ? 'AVAILABLE' : 'TAKEN',
    };
}

export async function getPortfolios() {
    const data = await apiFetch('/api/portfolios');
    return data.portfolios || [];
}

export async function getPortfolio(portfolioId) {
    const data = await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}`);
    return data.portfolio;
}

export async function getPublishedPortfolio(slug) {
    const data = await apiFetch(`/api/portfolios/public/${encodeURIComponent(slug)}`);
    return data.portfolio;
}

export async function savePortfolio(portfolioId, portfolioData, { expectedRevision } = {}) {
    const revision = Number(expectedRevision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw Object.assign(new Error('Portfolio revision is required before saving.'), { code: 'PORTFOLIO_REVISION_REQUIRED' });
    }
    const data = await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}`, {
        method: 'POST',
        body: JSON.stringify({ portfolio: portfolioData, expectedRevision: revision })
    });
    return data.portfolio;
}

export async function deletePortfolio(portfolioId, expectedRevision) {
    const revision = Number(expectedRevision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw Object.assign(new Error('Portfolio revision is required before deletion.'), { code: 'PORTFOLIO_REVISION_REQUIRED' });
    }
    await apiFetch(`/api/portfolios/${encodeURIComponent(portfolioId)}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedRevision: revision })
    });
    return true;
}

export default { checkPortfolioSlugAvailability, normalizePortfolioSlugBase, getPortfolios, getPortfolio, getPublishedPortfolio, savePortfolio, deletePortfolio };
