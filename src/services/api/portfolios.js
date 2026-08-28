import { apiFetch } from './client.js';

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

export default { getPortfolios, getPortfolio, getPublishedPortfolio, savePortfolio, deletePortfolio };
