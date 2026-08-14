import React, { lazy } from 'react';
import Cv1Base from '../cv-templates/cv1/Cv1';
import { getTemplateDirection, normalizeTemplateData } from '../cv-templates/templateUtils';

export const CV_TEMPLATE_IDS = Object.freeze(Array.from({ length: 51 }, (_, index) => `Cv${index + 1}`));
export const COVER_TEMPLATE_IDS = Object.freeze(Array.from({ length: 4 }, (_, index) => `Cover${index + 1}`));
export const ALL_TEMPLATE_IDS = Object.freeze([...CV_TEMPLATE_IDS, ...COVER_TEMPLATE_IDS]);

/** Applies the shared immutable view-model contract at every registry render boundary. */
export const withNormalizedTemplateData = (TemplateComponent) => {
    const NormalizedTemplate = (props) => {
        const language = props.language || 'en';
        return React.createElement(
            'div',
            { dir: getTemplateDirection(language), 'data-template-direction': getTemplateDirection(language) },
            React.createElement(TemplateComponent, { ...props, language, values: normalizeTemplateData(props.values) })
        );
    };
    NormalizedTemplate.displayName = `Normalized${TemplateComponent.displayName || TemplateComponent.name || 'Template'}`;
    return NormalizedTemplate;
};

const normalizedLazy = (loader) => lazy(async () => {
    const module = await loader();
    return { default: withNormalizedTemplateData(module.default) };
});

const Cv1 = withNormalizedTemplateData(Cv1Base);
const cvModules = import.meta.glob('../cv-templates/cv*/Cv*.jsx');
const coverModules = import.meta.glob('../cv-templates/cover*/Cover*.jsx');

const cvLoader = (number) => cvModules[`../cv-templates/cv${number}/Cv${number}.jsx`];
const coverLoader = (number) => coverModules[`../cv-templates/cover${number}/Cover${number}.jsx`];

// Static default plus route-level chunks for the other templates.
export const templateMap = {
    Cv1,
    ...Object.fromEntries(CV_TEMPLATE_IDS.slice(1).map((id) => {
        const number = id.slice(2);
        return [id, normalizedLazy(cvLoader(number))];
    })),
    ...Object.fromEntries(COVER_TEMPLATE_IDS.map((id) => {
        const number = id.slice(5);
        return [id, normalizedLazy(coverLoader(number))];
    })),
};

export const getTemplateComponent = (templateId) => templateMap[templateId] || Cv1;
export const isKnownTemplate = (templateId) => ALL_TEMPLATE_IDS.includes(templateId);
