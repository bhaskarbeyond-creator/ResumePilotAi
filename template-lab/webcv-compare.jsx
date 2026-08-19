import React from 'react';
import { createRoot } from 'react-dom/client';
import WebCvRenderer from '../src/components/PortfolioTemplates/WebCvRenderer.jsx';
import { PORTFOLIO_TEMPLATE_IDS, PORTFOLIO_TEMPLATES, createRichPortfolioFixture } from '../src/utils/portfolioData.js';
import '../src/tailwind.css';

const fixture = createRichPortfolioFixture();

createRoot(document.getElementById('root')).render(
    <div className="bg-slate-200 p-4">
        <h1 className="mb-4 text-2xl font-semibold">Web CV template comparison — same master data</h1>
        <div className="grid gap-6 xl:grid-cols-2">
            {PORTFOLIO_TEMPLATE_IDS.map((id) => (
                <section key={id} className="overflow-hidden rounded-2xl bg-white shadow">
                    <header className="border-b border-slate-200 px-4 py-3">
                        <h2 className="text-lg font-semibold">{PORTFOLIO_TEMPLATES[id].name}</h2>
                        <p className="text-sm text-slate-500">{PORTFOLIO_TEMPLATES[id].description}</p>
                    </header>
                    <div className="max-h-[80vh] overflow-auto">
                        <WebCvRenderer canonical={fixture} templateKey={id} />
                    </div>
                </section>
            ))}
        </div>
    </div>
);
