import { apiFetch } from './client';

export async function getPortfolios() {
    const data = await apiFetch('/api/portfolios');
    return data.portfolios || [];
}

export async function getPortfolio(portfolioId) {
    const data = await apiFetch(`/api/portfolios/${portfolioId}`);
    return data.portfolio;
}

export async function savePortfolio(portfolioId, portfolioData) {
    const data = await apiFetch(`/api/portfolios/${portfolioId}`, {
        method: 'POST',
        body: JSON.stringify(portfolioData)
    });
    return data.portfolio;
}

export async function deletePortfolio(portfolioId) {
    await apiFetch(`/api/portfolios/${portfolioId}`, { method: 'DELETE' });
    return true;
}
