import React from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizeRichText, sanitizeUrl } from '../../utils/sanitizeHtml';

const text = (value) => (value == null ? '' : String(value).trim());
const array = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

/**
 * Content Engine — shared, design-neutral rendering for resume sections that
 * predate the template set: Projects, Certifications, Achievements, References.
 *
 * Injected at the end of the A4 board by TemplateRenderer (Resume Builder
 * templates only; the frozen cover-letter module is never touched). Styling is
 * global so every template inherits the same professional finish without
 * per-template code, and each template keeps its own typography identity.
 */
export default function ResumeExtras({ values = {} }) {
    const { t } = useTranslation('common');
    const accent = values?.colors?.primary || '#2563eb';

    const projects = array(values.projects).map((item) => ({
        title: text(item.title || item.name),
        description: text(item.description || item.summary),
        url: text(item.url || item.link),
    })).filter((item) => item.title || item.description);

    const certifications = array(values.certifications).map((item) => ({
        title: text(item.title || item.name),
        issuer: text(item.issuer || item.organization),
        date: text(item.date),
    })).filter((item) => item.title || item.issuer);

    const achievements = array(values.achievements || values.awards).map((item) => ({
        title: text(item.title || item.name),
        description: text(item.description || item.summary),
    })).filter((item) => item.title || item.description);

    const references = array(values.references).map((item) => ({
        name: text(item.name),
        detail: text(item.reference || item.description),
    })).filter((item) => item.name || item.detail);

    if (!projects.length && !certifications.length && !achievements.length && !references.length) return null;

    const renderItem = (key, head, sub, date, description, url) => {
        const safeUrl = url ? sanitizeUrl(url) : null;
        return (
            <div className="resume-extras-item" key={key}>
                <div className="resume-extras-item-head">
                    <span className="resume-extras-item-title">
                        {head}
                        {sub && <span className="resume-extras-item-sub"> — {sub}</span>}
                    </span>
                    {date && <span className="resume-extras-item-date">{date}</span>}
                </div>
                {safeUrl && (
                    <a className="resume-extras-item-link" href={safeUrl} target="_blank" rel="noopener noreferrer">{safeUrl}</a>
                )}
                {description && (
                    <div className="resume-extras-item-description" dangerouslySetInnerHTML={{ __html: sanitizeRichText(description) }} />
                )}
            </div>
        );
    };

    return (
        <div className="resume-extras" data-resume-extras="true">
            {projects.length > 0 && (
                <section className="resume-extras-section">
                    <h3 className="resume-extras-title" style={{ borderColor: accent }}>{t('resume.projects', 'Projects')}</h3>
                    {projects.map((item, index) => renderItem(`project-${index}`, item.title, null, null, item.description, item.url))}
                </section>
            )}
            {certifications.length > 0 && (
                <section className="resume-extras-section">
                    <h3 className="resume-extras-title" style={{ borderColor: accent }}>{t('resume.certifications', 'Certifications')}</h3>
                    {certifications.map((item, index) => renderItem(`certification-${index}`, item.title, item.issuer, item.date, null, null))}
                </section>
            )}
            {achievements.length > 0 && (
                <section className="resume-extras-section">
                    <h3 className="resume-extras-title" style={{ borderColor: accent }}>{t('resume.achievements', 'Achievements')}</h3>
                    {achievements.map((item, index) => renderItem(`achievement-${index}`, item.title, null, null, item.description, null))}
                </section>
            )}
            {references.length > 0 && (
                <section className="resume-extras-section">
                    <h3 className="resume-extras-title" style={{ borderColor: accent }}>{t('resume.references', 'References')}</h3>
                    {references.map((item, index) => renderItem(`reference-${index}`, item.name, null, null, item.detail, null))}
                </section>
            )}
        </div>
    );
}
