import React from 'react';
import { createRoot } from 'react-dom/client';
import WebCvRenderer from '../src/components/PortfolioTemplates/WebCvRenderer.jsx';
import {
    PORTFOLIO_TEMPLATE_IDS,
    convertResumeToPortfolio,
    createRichPortfolioFixture,
    emptyCanonicalPortfolio,
} from '../src/utils/portfolioData.js';
import '../src/tailwind.css';
import '../src/index.css';

const params = new URLSearchParams(window.location.search);
const template = params.get('template') || 'modernMinimal';
const fixtureName = params.get('fixture') || 'rich';

const FIXTURES = {
    rich: createRichPortfolioFixture(),
    empty: emptyCanonicalPortfolio(),
    heading: convertResumeToPortfolio({ firstname: 'Only', lastname: 'Name', email: 'only@example.com' }),
    partial: convertResumeToPortfolio({
        firstname: 'Sam',
        lastname: 'Iyer',
        occupation: 'Engineer',
        summary: 'Builds careful systems.',
        skills: [{ name: 'Go', rating: 80 }],
    }),
};

document.documentElement.setAttribute('data-lab-state', 'rendering');
document.documentElement.setAttribute('data-template', template);
document.documentElement.setAttribute('data-fixture', fixtureName);

const canonical = FIXTURES[fixtureName] || FIXTURES.rich;
const root = createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <WebCvRenderer canonical={canonical} templateKey={PORTFOLIO_TEMPLATE_IDS.includes(template) ? template : 'modernMinimal'} />
    </React.StrictMode>
);

requestAnimationFrame(() => {
    document.documentElement.setAttribute('data-lab-state', 'ready');
});
