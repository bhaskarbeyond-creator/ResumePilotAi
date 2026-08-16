import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv2.scss';
import Address from '../../assets/cv2-assets/address.png';
import Phone from '../../assets/cv2-assets/phone-call.png';
import Email from '../../assets/cv2-assets/envelope.png';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { getTemplateColors, getContrastTextColor } from '../templateUtils';

class Cv2 extends Component {
    constructor(props) {
        super(props);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnLanguages = this.returnLanguages.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    getPrimaryColor() {
        const templateColors = getTemplateColors(this.props.values?.colors, 1, '#1E40AF', '#F8FAFC');
        return templateColors.primary;
    }

    // Text set in the primary color must remain WCAG-AA readable on light
    // backgrounds; the bright gold accents stay gold for decorations only.
    getTextPrimaryColor() {
        const primary = String(this.getPrimaryColor() || '').toLowerCase();
        return ['#f0c30e', '#f59e0b', '#eab308'].includes(primary) ? '#854d0e' : this.getPrimaryColor();
    }

    getSecondaryColor() {
        const templateColors = getTemplateColors(this.props.values?.colors, 1, '#1E40AF', '#F8FAFC');
        return templateColors.secondary;
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const str = String(dateStr).trim();
        if (str.toLowerCase() === 'present' || str.toLowerCase() === 'current') return 'Present';
        return str;
    }

    getSkillName(skill) {
        if (!skill) return '';
        if (typeof skill === 'string') return skill;
        return skill.name || skill.skillName || skill.title || '';
    }

    getLanguageName(lang) {
        if (!lang) return '';
        if (typeof lang === 'string') return lang;
        return lang.name || lang.language || lang.title || lang.lang || '';
    }

    getLanguageLevel(lang) {
        if (!lang) return '';
        if (typeof lang === 'string') return lang;
        const level = lang.level || lang.proficiency || lang.rating || lang.languageLevel || '';
        if (typeof level === 'number') {
            if (level >= 90) return 'Native / Bilingual';
            if (level >= 75) return 'Full Professional';
            if (level >= 60) return 'Professional Working';
            if (level >= 40) return 'Limited Working';
            return 'Elementary';
        }
        return level;
    }

    returnSkills() {
        const skills = this.props.values?.skills || [];
        if (!skills || skills.length === 0) return null;

        const primaryColor = this.getPrimaryColor();

        return (
            <div className="skills-grid">
                {skills.map((skillItem, index) => {
                    const name = this.getSkillName(skillItem);
                    if (!name) return null;
                    const rating = typeof skillItem === 'object' ? (skillItem.rating || skillItem.level || 80) : 80;
                    const bulletCount = rating > 70 ? 5 : rating > 40 ? 4 : rating > 20 ? 3 : 2;

                    return (
                        <div key={index} className="skill-card-item">
                            <span className="skill-name">{name}</span>
                            <div className="rating-bullets">
                                {Array.from({ length: 5 }).map((_, bIdx) => (
                                    <div
                                        key={bIdx}
                                        className="bullet"
                                        style={{
                                            backgroundColor: bIdx < bulletCount ? primaryColor : '#E2E8F0',
                                            opacity: bIdx < bulletCount ? 1 : 0.4
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    returnLanguages() {
        const languages = this.props.values?.languages || [];
        if (!languages || languages.length === 0) return null;
        const primaryColor = this.getPrimaryColor();

        // Calculate badge text color for high contrast
        const badgeTextColor = (primaryColor.toLowerCase() === '#f0c30e' || primaryColor.toLowerCase() === '#f59e0b' || primaryColor.toLowerCase() === '#eab308')
            ? '#854d0e'
            : primaryColor;

        return (
            <div className="languages-grid">
                {languages.map((langItem, index) => {
                    const name = this.getLanguageName(langItem);
                    const level = this.getLanguageLevel(langItem);
                    if (!name) return null;

                    return (
                        <div key={index} className="language-card-item">
                            <span className="lang-name">{name}</span>
                            {level && (
                                <span
                                    className="lang-level-badge"
                                    style={{
                                        backgroundColor: primaryColor.toLowerCase() === '#f0c30e' ? '#fefce8' : `${primaryColor}1a`,
                                        color: badgeTextColor,
                                        borderColor: primaryColor.toLowerCase() === '#f0c30e' ? '#fef08a' : `${primaryColor}40`
                                    }}
                                >
                                    {level}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    returnEmployments() {
        const employments = this.props.values?.employments || [];
        if (!employments || employments.length === 0) return null;

        return employments.map((emp, index) => {
            const begin = this.formatDate(emp.begin);
            const end = this.formatDate(emp.end);
            const dateRange = [begin, end].filter(Boolean).join(' – ');

            return (
                <div key={index} className="cv-sectionRightExperience">
                    <div className="cv-jobDetailsLeft">
                        <span className="employer">{emp.employer}</span>
                        {dateRange && <span className="date">{dateRange}</span>}
                    </div>
                    <div className="cv-jobDetailsRight">
                        <span className="cv-jobTitle">{emp.jobTitle}</span>
                        {emp.description && (
                            <div
                                className="cv-jobDescription justified-text"
                                dangerouslySetInnerHTML={{ __html: sanitizeRichText(emp.description) }}
                            />
                        )}
                    </div>
                </div>
            );
        });
    }

    returnEducations() {
        const educations = this.props.values?.educations || [];
        if (!educations || educations.length === 0) return null;

        return educations.map((edu, index) => {
            const started = this.formatDate(edu.started);
            const finished = this.formatDate(edu.finished);
            const dateRange = [started, finished].filter(Boolean).join(' – ');

            return (
                <div key={index} className="cv-sectionRightExperience">
                    <div className="cv-jobDetailsLeft">
                        <span className="employer">{edu.school}</span>
                        {dateRange && <span className="date">{dateRange}</span>}
                    </div>
                    <div className="cv-jobDetailsRight">
                        <span className="cv-jobTitle">{edu.degree}</span>
                        {edu.description && (
                            <div
                                className="cv-jobDescription justified-text"
                                dangerouslySetInnerHTML={{ __html: sanitizeRichText(edu.description) }}
                            />
                        )}
                    </div>
                </div>
            );
        });
    }

    render() {
        const { t } = this.props;
        const primaryColor = this.getPrimaryColor();
        const values = this.props.values || {};

        const firstname = values.firstname || '';
        const lastname = values.lastname || '';
        const fullName = `${firstname} ${lastname}`.trim();
        const occupation = values.occupation || '';

        const fullAddress = values.fullAddress || [values.address, values.city, values.postalcode || values.postalCode || values.postalecode, values.country].map(i => (i || '').trim()).filter(Boolean).join(', ');

        // Placeholder names must never leak into a real document.
        const footerName = values.signName || fullName;
        const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        const footerDate = values.signDate || todayStr;

        const hasEmployments = values.employments && values.employments.length > 0;
        const hasEducations = values.educations && values.educations.length > 0;
        const hasSkills = values.skills && values.skills.length > 0;
        const hasLanguages = values.languages && values.languages.length > 0;

        return (
            <div id="resumen" className="cv2-board">
                <div className="cv2-content">
                    {/* CV Header */}
                    <div className="cv2-head">
                        <div className="cv-headCircle" style={{ backgroundColor: primaryColor, borderColor: primaryColor }}>
                            {values.photo ? (
                                <img src={values.photo} alt="profile" />
                            ) : (
                                <div className="avatar-initials" style={{ color: getContrastTextColor(primaryColor) }}>
                                    {((firstname[0] || '') + (lastname[0] || '')).toUpperCase() || 'CV'}
                                </div>
                            )}
                        </div>
                        <div className="head-details">
                            <h1>{fullName || 'Your Name'}</h1>
                            {occupation && <p style={{ color: this.getTextPrimaryColor() }}>{occupation}</p>}
                        </div>
                    </div>

                    {/* Contact Bar */}
                    <div className="cv-contactDetails">
                        {values.phone && (
                            <div className="cv-contactItem">
                                <div className="cv-contactItemImage">
                                    <img alt="phone" src={Phone} />
                                </div>
                                <div className="cv-contactItemDetails">
                                    <div className="cv-contactItemHead">{t('resume.phone') || 'Phone'}</div>
                                    <div className="cv-contactItemValue">{values.phone}</div>
                                </div>
                            </div>
                        )}

                        {values.email && (
                            <div className="cv-contactItem">
                                <div className="cv-contactItemImage">
                                    <img alt="email" src={Email} />
                                </div>
                                <div className="cv-contactItemDetails">
                                    <div className="cv-contactItemHead">{t('resume.email') || 'Email'}</div>
                                    <div className="cv-contactItemValue">{values.email}</div>
                                </div>
                            </div>
                        )}

                        {fullAddress && (
                            <div className="cv-contactItem">
                                <div className="cv-contactItemImage">
                                    <img alt="address" src={Address} />
                                </div>
                                <div className="cv-contactItemDetails">
                                    <div className="cv-contactItemHead">{t('resume.address') || 'Address'}</div>
                                    <div className="cv-contactItemValue">{fullAddress}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main Sections */}
                    <div className="cv2-body">
                        {/* Personal Summary */}
                        {values.summary && (
                            <div className="cv-bodySection">
                                <div className="cv-sectionLeft" style={{ color: this.getTextPrimaryColor() }}>
                                    {t('resume.personalSummary') || 'Personal Summary'}
                                </div>
                                <div className="cv-sectionRight">
                                    <div
                                        className="summary justified-text"
                                        dangerouslySetInnerHTML={{ __html: sanitizeRichText(values.summary) }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Employment History */}
                        {hasEmployments && (
                            <div className="cv-bodySection">
                                <div className="cv-sectionLeft" style={{ color: this.getTextPrimaryColor() }}>
                                    {t('resume.employmentHistory') || 'Experience'}
                                </div>
                                <div className="cv-sectionRight">
                                    {this.returnEmployments()}
                                </div>
                            </div>
                        )}

                        {/* Education History */}
                        {hasEducations && (
                            <div className="cv-bodySection">
                                <div className="cv-sectionLeft" style={{ color: this.getTextPrimaryColor() }}>
                                    {t('resume.educationHistory') || 'Education'}
                                </div>
                                <div className="cv-sectionRight">
                                    {this.returnEducations()}
                                </div>
                            </div>
                        )}

                        {/* Skills */}
                        {hasSkills && (
                            <div className="cv-bodySection">
                                <div className="cv-sectionLeft" style={{ color: this.getTextPrimaryColor() }}>
                                    {t('resume.skills') || 'Skills'}
                                </div>
                                <div className="cv-sectionRight">
                                    {this.returnSkills()}
                                </div>
                            </div>
                        )}

                        {/* Languages */}
                        {hasLanguages && (
                            <div className="cv-bodySection">
                                <div className="cv-sectionLeft" style={{ color: this.getTextPrimaryColor() }}>
                                    {t('resume.languages') || 'Languages'}
                                </div>
                                <div className="cv-sectionRight">
                                    {this.returnLanguages()}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Extreme Bottom-Right Page Footer */}
                    {footerName && (
                        <div className="cv2-footer">
                            <div className="footer-signature">
                                <div><span className="label">Name:</span> {footerName}</div>
                                <div><span className="label">Date:</span> {footerDate}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv2);
export default MyComponent;
