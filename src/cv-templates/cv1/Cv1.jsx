import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv1.scss';
import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatLocation, formatDateRange, getTemplateColors, formatLanguages } from '../templateUtils';

class Cv1 extends Component {
    constructor(props) {
        super(props);
        if (typeof document !== 'undefined' && document.body) {
            document.body.style.overflow = 'auto';
        }
        i18n.changeLanguage(this.props.language);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
    }

    // Curated primary/secondary color engine
    getColors() {
        return getTemplateColors(this.props.values?.colors, 0, '#1E40AF', '#334155');
    }

    returnLanguages() {
        const tempLanguages = formatLanguages(this.props.values?.languages);
        if (!tempLanguages.length) return null;

        return (
            <div className="sectionLanguages">
                {tempLanguages.map((item, index) => (
                    <div key={index} className="sectionLanguage">
                        <span className="language-name">{item.name}</span>
                        {item.level && <span className="language-level">{item.level}</span>}
                    </div>
                ))}
            </div>
        );
    }

    returnSkills() {
        if (!this.props.values?.skills?.length) return null;
        var tempSkills = (this.props.values.skills || []).filter(item => {
            if (!item) return false;
            if (typeof item === 'string') return item.trim().length > 0;
            return (item.name && item.name.trim().length > 0) || (item.skill && item.skill.trim().length > 0);
        });
        if (!tempSkills.length) return null;
        const colors = this.getColors();

        return (
            <div className="skillsPillContainer">
                {tempSkills.map((item, index) => {
                    const skillName = typeof item === 'string' ? item : (item.name || item.skill || '');
                    return (
                        <div
                            key={index}
                            className="skillPillTag"
                            style={{
                                backgroundColor: `${colors.primary}0D`,
                                color: colors.primary,
                                borderColor: `${colors.primary}25`,
                            }}
                        >
                            <span className="skillPillDot" style={{ backgroundColor: colors.primary }} />
                            <span className="skillPillName">{skillName}</span>
                        </div>
                    );
                })}
            </div>
        );
    }

    returnEmployments() {
        if (!this.props.values?.employments?.length) return null;
        var tempEmployments = (this.props.values.employments || []).filter(item => item && (item.jobTitle || item.employer || item.description));
        if (!tempEmployments.length) return null;
        const colors = this.getColors();

        return (
            <div className="employmentsTimeline">
                {tempEmployments.map((item, index) => {
                    const dateStr = formatDateRange(item.begin, item.end, item.currentWork);
                    return (
                        <div key={index} className="employmentWrapper">
                            <div className="timeline-node" style={{ borderColor: colors.primary }} />
                            <div className="employment__head">
                                <div className="employment__titleBlock">
                                    <span className="employment__jobTitle">{item.jobTitle}</span>
                                    {item.employer && <span className="employment__employer"> — {item.employer}</span>}
                                </div>
                                {dateStr && <span className="employment__dateBadge">{dateStr}</span>}
                            </div>
                            {item.description && (
                                <div className="employment__body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    returnEducations() {
        if (!this.props.values?.educations?.length) return null;
        var tempEducations = (this.props.values.educations || []).filter(item => item && (item.degree || item.school || item.description));
        if (!tempEducations.length) return null;
        const colors = this.getColors();

        return (
            <div className="employmentsTimeline">
                {tempEducations.map((item, index) => {
                    const dateStr = formatDateRange(item.started, item.finished);
                    return (
                        <div key={index} className="employmentWrapper">
                            <div className="timeline-node" style={{ borderColor: colors.primary }} />
                            <div className="employment__head">
                                <div className="employment__titleBlock">
                                    <span className="employment__jobTitle">{item.degree}</span>
                                    {item.school && <span className="employment__employer"> — {item.school}</span>}
                                </div>
                                {dateStr && <span className="employment__dateBadge">{dateStr}</span>}
                            </div>
                            {item.description && (
                                <div className="employment__body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                            )}
                        </div>
                    );
                })}
            </div>
        );
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

        const hasSkills = (this.props.values?.skills || []).some(item => item && (item.name || item.skill || (typeof item === 'string' && item.trim())));
        const formattedLangs = formatLanguages(this.props.values?.languages);
        const hasLanguages = formattedLangs.length > 0;

        const fullName = `${this.props.values.firstname || ''} ${this.props.values.lastname || ''}`.trim();
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const formattedDate = this.props.values.declarationDate || this.props.values.date || `${dd}-${mm}-${yyyy}`;

        return (
            <div id="resumen" className="cv1-board">
                <div className="cv-content">
                    {/* Header Banner */}
                    <div className="cv-head" style={{ backgroundColor: `${colors.primary}05`, borderColor: `${colors.primary}20` }}>
                        <div className="cv__imageWrapper">
                            <div className="cv__image" style={{ borderColor: colors.primary }}>
                                {this.props.values.photo ? (
                                    <img alt="profile" className="photo" src={this.props.values.photo} />
                                ) : (
                                    <div className="avatar-initials" style={{ backgroundColor: colors.primary }}>
                                        {((this.props.values.firstname?.[0] || '') + (this.props.values.lastname?.[0] || '')).toUpperCase() || 'CV'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="cv__head-details">
                            <h1 style={{ color: colors.primary }}>
                                <span className="firstname">{this.props.values.firstname}</span>{' '}
                                <span className="lastname">{this.props.values.lastname}</span>
                            </h1>
                            {this.props.values.occupation && (
                                <h3 className="occupation-title">{this.props.values.occupation}</h3>
                            )}
                        </div>
                    </div>

                    {/* Main Layout Grid */}
                    <div className="cv__body">
                        {/* Left Sidebar */}
                        <div className="cv__bodyLeft">
                            {/* Contact Details with Icons */}
                            {(locationText || this.props.values.phone || this.props.values.email) && (
                                <div className="cv__leftSecton">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.info')}</h2>
                                    </div>
                                    <div className="infoList">
                                        {locationText && (
                                            <div className="subItemIcon">
                                                <div className="iconCircle" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}>
                                                    <FaMapMarkerAlt size={10} />
                                                </div>
                                                <div className="subItemDetails">
                                                    <span className="subItemLabel">{t('resume.address')}</span>
                                                    <span className="subItemValue">{locationText}</span>
                                                </div>
                                            </div>
                                        )}
                                        {this.props.values.phone && (
                                            <div className="subItemIcon">
                                                <div className="iconCircle" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}>
                                                    <FaPhoneAlt size={10} />
                                                </div>
                                                <div className="subItemDetails">
                                                    <span className="subItemLabel">{t('resume.phone')}</span>
                                                    <span className="subItemValue">{this.props.values.phone}</span>
                                                </div>
                                            </div>
                                        )}
                                        {this.props.values.email && (
                                            <div className="subItemIcon">
                                                <div className="iconCircle" style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}>
                                                    <FaEnvelope size={10} />
                                                </div>
                                                <div className="subItemDetails">
                                                    <span className="subItemLabel">{t('resume.email')}</span>
                                                    <span className="subItemValue emailValue">{this.props.values.email}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Skills Section */}
                            {hasSkills && (
                                <div className="cv__leftSecton">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.skills')}</h2>
                                    </div>
                                    {this.returnSkills()}
                                </div>
                            )}

                            {/* Languages Section */}
                            {hasLanguages && (
                                <div className="cv__leftSecton">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.languages')}</h2>
                                    </div>
                                    {this.returnLanguages()}
                                </div>
                            )}
                        </div>

                        {/* Right Main Content */}
                        <div className="bodyRight">
                            {/* Summary */}
                            {this.props.values.summary && (
                                <div className="rightSection">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.personalSummary')}</h2>
                                    </div>
                                    <div className="summaryContent" dangerouslySetInnerHTML={{ __html: sanitizeRichText(this.props.values.summary) }} />
                                </div>
                            )}

                            {/* Employment History */}
                            {this.props.values?.employments?.length > 0 && (
                                <div className="rightSection">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.employmentHistory')}</h2>
                                    </div>
                                    {this.returnEmployments()}
                                </div>
                            )}

                            {/* Education History */}
                            {this.props.values?.educations?.length > 0 && (
                                <div className="rightSection">
                                    <div className="sectionTitle">
                                        <h2 style={{ color: colors.primary, borderColor: colors.primary }}>{t('resume.educationHistory')}</h2>
                                    </div>
                                    {this.returnEducations()}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Page Footer at Extreme Bottom Right */}
                    {fullName && (
                        <div className="cv-footer">
                            <div className="declaration-right-box" style={{ borderColor: `${colors.primary}30` }}>
                                <div className="declaration-line">
                                    <span className="declaration-label">Name:</span>{' '}
                                    <span className="declaration-val">{fullName}</span>
                                </div>
                                <div className="declaration-line">
                                    <span className="declaration-label">Date:</span>{' '}
                                    <span className="declaration-val">{formattedDate}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv1);
export default MyComponent;
