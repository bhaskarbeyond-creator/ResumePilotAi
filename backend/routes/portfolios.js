const express = require('express');
const { getRepository } = require('../repositories');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/portfolios - List user portfolios
router.get('/', async (req, res) => {
    try {
        const portfolios = await req.repository.getPortfolios(req.user.uid);
        return res.json({ success: true, portfolios });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch portfolios' });
    }
});

// GET /api/portfolios/:id - Get single portfolio
router.get('/:id', async (req, res) => {
    try {
        const portfolio = await req.repository.getPortfolio(req.user.uid, req.params.id);
        if (!portfolio) return res.status(404).json({ success: false, error: 'Portfolio not found' });
        return res.json({ success: true, portfolio });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch portfolio' });
    }
});

// POST /api/portfolios/:id - Save portfolio
router.post('/:id', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const saved = await req.repository.savePortfolio(req.user.uid, req.params.id, req.body);
        return res.json({ success: true, portfolio: saved });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to save portfolio' });
    }
});

// DELETE /api/portfolios/:id - Delete portfolio
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deletePortfolio(req.user.uid, req.params.id);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to delete portfolio' });
    }
});

module.exports = { portfoliosRouter: router };
