import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv3.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatLocation, formatDateRange, getTemplateColors } from '../templateUtils';

class Cv3 extends Component {
    constructor(props) {
        super(props);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnLanguages = this.returnLanguages.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    getColors() {
        const rawPrimary = this.props.values?.colors?.primary;
        // Replace pink/magenta/rose tones with Deep Executive Navy for 10/10 presentation
        const isPinkOrRose = rawPrimary && (
            rawPrimary.toLowerCase().includes('b86877') ||
            rawPrimary.toLowerCase().includes('d946ef') ||
            rawPrimary.toLowerCase().includes('ec4899') ||
            rawPrimary.toLowerCase().includes('f43f5e') ||
            rawPrimary.toLowerCase().includes('e11d48') ||
            rawPrimary.toLowerCase().includes('9d174d')
        );
        const effectivePrimary = (isPinkOrRose || !rawPrimary || rawPrimary === '#000000') ? '#1e3a8a' : rawPrimary;
        return getTemplateColors({ primary: effectivePrimary, secondary: this.props.values?.colors?.secondary }, 0, '#1e3a8a', '#3b82f6');
    }

    getInitials(firstName, lastName) {
        const f = firstName ? firstName.charAt(0).toUpperCase() : '';
        const l = lastName ? lastName.charAt(0).toUpperCase() : '';
        return `${f}${l}` || 'CV';
    }

    returnEmployments() {
        const elements = [];
        const tempEmployments = [...(this.props.values.employments || [])];
        for (let index = 0; index < tempEmployments.length; index++) {
            const item = tempEmployments[index];
            const dateStr = formatDateRange(item.begin, item.end, item.currentWork);
            elements.push(
                <div key={index} className="cv3-jobItem">
                    <div className="cv3-jobHeader">
                        <div className="cv3-jobTitleGroup">
                            <span className="cv3-jobTitle">{item.jobTitle}</span>
                            {item.employer && <span className="cv3-employer"> — {item.employer}</span>}
                        </div>
                        {dateStr && (
                            <div className="cv3-jobDates">
                                <span>{dateStr}</span>
                            </div>
                        )}
                    </div>
                    {item.description && (
                        <div className="cv3-jobDescription" dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                    )}
                </div>
            );
        }
        return elements;
    }

    returnEducations() {
        const elements = [];
        const tempEducations = [...(this.props.values.educations || [])];
        for (let index = 0; index < tempEducations.length; index++) {
            const item = tempEducations[index];
            const dateStr = formatDateRange(item.started, item.finished);
            elements.push(
                <div key={index} className="cv3-jobItem">
                    <div className="cv3-jobHeader">
                        <div className="cv3-jobTitleGroup">
                            <span className="cv3-jobTitle">{item.degree}</span>
                            {item.school && <span className="cv3-employer"> — {item.school}</span>}
                        </div>
                        {dateStr && (
                            <div className="cv3-jobDates">
                                <span>{dateStr}</span>
                            </div>
                        )}
                    </div>
                    {item.description && (
                        <div className="cv3-jobDescription" dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                    )}
                </div>
            );
        }
        return elements;
    }

    returnSkills() {
        const elements = [];
        const tempSkills = [...(this.props.values.skills || [])];
        const colors = this.getColors();
        for (let index = 0; index < tempSkills.length; index++) {
            const skill = tempSkills[index];
            const rating = skill.rating || 90;
            const filledDots = Math.round((rating / 100) * 5);
            elements.push(
                <div key={index} className="cv3-skillCard">
                    <span className="cv3-skillName">{skill.name}</span>
                    <div className="cv3-skillDots">
                        {[1, 2, 3, 4, 5].map((dot) => (
                            <span
                                key={dot}
                                className={`cv3-dot ${dot <= filledDots ? 'filled' : ''}`}
                                style={{ backgroundColor: dot <= filledDots ? colors.primary : '#e2e8f0' }}
                            />
                        ))}
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnLanguages() {
        if (!this.props.values?.languages?.length) return null;
        const elements = [];
        const tempLanguages = [...this.props.values.languages];
        const colors = this.getColors();
        for (let index = 0; index < tempLanguages.length; index++) {
            const lang = tempLanguages[index];
            elements.push(
                <div key={index} className="cv3-languageItem">
                    <span className="cv3-langName">{lang.name}</span>
                    {lang.level && (
                        <span
                            className="cv3-langBadge"
                            style={{
                                backgroundColor: `${colors.primary}12`,
                                color: colors.primary,
                                borderColor: `${colors.primary}30`
                            }}
                        >
                            {lang.level}
                        </span>
                    )}
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const colors = this.getColors();
        const locationText = formatLocation(
            this.props.values.address,
            this.props.values.city,
            this.props.values.country,
            this.props.values.postalcode || this.props.values.postalCode
        );

        const initials = this.getInitials(this.props.values.firstname, this.props.values.lastname);
        const currentDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

        return (
            <div id="resumen" className="cv3-board">
                <div className="cv3-content">
                    {/* Header Block */}
                    <div className="cv3-head">
                        <div className="cv3-headMain">
                            {this.props.values.photo ? (
                                <div className="cv3-avatarPhoto">
                                    <img src={this.props.values.photo} alt="profile" className="cv3-photoImg" />
                                </div>
                            ) : (
                                <div className="cv3-avatar" style={{ backgroundColor: colors.primary }}>
                                    {initials}
                                </div>
                            )}
                            <div className="cv3-titleMeta">
                                <h1 className="cv3-name" style={{ color: colors.primary }}>
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                {this.props.values.occupation && (
                                    <div className="cv3-occupation">{this.props.values.occupation}</div>
                                )}
                            </div>
                        </div>

                        {/* Contact Info Bar */}
                        <div className="cv3-contactBar">
                            {locationText && (
                                <div className="cv3-contactItem">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                                    <span>{locationText}</span>
                                </div>
                            )}
                            {this.props.values.phone && (
                                <div className="cv3-contactItem">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                    <span>{this.props.values.phone}</span>
                                </div>
                            )}
                            {this.props.values.email && (
                                <div className="cv3-contactItem">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    <span>{this.props.values.email}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cv Body */}
                    <div className="cv-body cv3-body">
                        {/* Personal Summary */}
                        {this.props.values.summary && (
                            <div className="cv-bodySection cv3-bodySection" style={{ borderTop: `2px solid ${colors.primary}` }}>
                                <div className="cv3-sectionLeft" style={{ color: colors.primary }}>
                                    <span>{t('resume.personalSummary') || 'PERSONAL SUMMARY'}</span>
                                </div>
                                <div className="cv3-sectionRight">
                                    <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(this.props.values.summary) }} />
                                </div>
                            </div>
                        )}

                        {/* Experience */}
                        <div className="cv-bodySection cv3-bodySection" style={{ borderTop: `2px solid ${colors.primary}` }}>
                            <div className="cv3-sectionLeft" style={{ color: colors.primary }}>
                                <span>{t('resume.employmentHistory') || 'EXPERIENCE'}</span>
                            </div>
                            <div className="cv3-sectionRight">
                                {this.returnEmployments()}
                            </div>
                        </div>

                        {/* Education */}
                        <div className="cv-bodySection cv3-bodySection" style={{ borderTop: `2px solid ${colors.primary}` }}>
                            <div className="cv3-sectionLeft" style={{ color: colors.primary }}>
                                <span>{t('resume.educationHistory') || 'EDUCATION'}</span>
                            </div>
                            <div className="cv3-sectionRight">
                                {this.returnEducations()}
                            </div>
                        </div>

                        {/* Skills */}
                        <div className="cv-bodySection cv3-bodySection" style={{ borderTop: `2px solid ${colors.primary}` }}>
                            <div className="cv3-sectionLeft" style={{ color: colors.primary }}>
                                <span>{t('resume.skills') || 'SKILLS'}</span>
                            </div>
                            <div className="cv3-sectionRight">
                                <div className="cv3-skillsGrid">
                                    {this.returnSkills()}
                                </div>
                            </div>
                        </div>

                        {/* Languages */}
                        {this.props.values?.languages?.length > 0 && (
                            <div className="cv-bodySection cv3-bodySection" style={{ borderTop: `2px solid ${colors.primary}` }}>
                                <div className="cv3-sectionLeft" style={{ color: colors.primary }}>
                                    <span>{t('resume.languages') || 'LANGUAGES'}</span>
                                </div>
                                <div className="cv3-sectionRight">
                                    <div className="cv3-languagesGrid">
                                        {this.returnLanguages()}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Signature Footer */}
                        <div className="cv3-footer">
                            <div className="footer-signature">
                                <div><span className="label">Name:</span> {this.props.values.firstname} {this.props.values.lastname}</div>
                                <div><span className="label">Date:</span> {currentDate}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Cv3);
export default MyComponent;
