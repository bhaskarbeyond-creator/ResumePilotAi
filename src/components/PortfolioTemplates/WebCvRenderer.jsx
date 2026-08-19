import React from 'react';
import { normalizePortfolioData, resolvePortfolioTemplate } from '../../utils/portfolioData.js';
import './webcv.css';
import ModernMinimal from './ModernMinimal.jsx';
import Executive from './Executive.jsx';
import CreativeDark from './CreativeDark.jsx';
import PremiumTech from './PremiumTech.jsx';

const TEMPLATES = {
    modernMinimal: ModernMinimal,
    executive: Executive,
    creativeDark: CreativeDark,
    premiumTech: PremiumTech,
};

export default function WebCvRenderer({ canonical, templateKey, className = '' }) {
    const data = normalizePortfolioData(canonical, { template: templateKey });
    const resolved = resolvePortfolioTemplate(templateKey || data.template);
    const Template = TEMPLATES[resolved] || ModernMinimal;
    return (
        <div className={className} data-webcv-root="true" data-template={resolved}>
            <Template canonical={data} />
        </div>
    );
}

export function getTemplateComponent(templateKey) {
    return TEMPLATES[resolvePortfolioTemplate(templateKey)] || ModernMinimal;
}
