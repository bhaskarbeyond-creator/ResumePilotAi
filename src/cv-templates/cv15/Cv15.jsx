import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv15.scss';
import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaAngleDoubleRight } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatLocation, formatDateRange } from '../templateUtils';

class Cv15 extends Component {
    constructor(props) {
        super(props);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = [...(this.props.values.employments || [])];

        for (let index = 0; index < tempEmployments.length; index++) {
            const item = tempEmployments[index];
            const dateStr = formatDateRange(item.begin, item.end, item.currentWork);
            elements.push(
                <div key={index} className="cv15-work-history-item">
                    <div className="cv15-work-history-item-right">
                        <h3>{item.jobTitle}</h3>
                        <p>{item.employer}</p>
                        {dateStr && <p>{dateStr}</p>}
                        <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnEducations() {
        var elements = [];
        var tempEducations = [...(this.props.values.educations || [])];

        for (let index = 0; index < tempEducations.length; index++) {
            const item = tempEducations[index];
            const dateStr = formatDateRange(item.started, item.finished);
            elements.push(
                <div key={index} className="cv15-work-history-item">
                    <div className="cv15-work-history-item-right">
                        <h3>{item.degree}</h3>
                        {dateStr && <p>{dateStr}</p>}
                        <p style={{ marginBottom: '5px' }}>{item.school}</p>
                        <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnSkills() {
        var elements = [];
        var tempSkills = [...(this.props.values.skills || [])];
        for (let index = 0; index < tempSkills.length; index++) {
            elements.push(
                <div key={index} className="cv15-skills-item">
                    <p>{tempSkills[index].name}</p>
                    <div className="cv15-skills-item-bar">
                        <div className="cv15-skills-item-bar-inner" style={{ width: (tempSkills[index].rating || 75) + '%' }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnLanguages() {
        if (!this.props.values?.languages?.length) return null;
        var elements = [];
        var tempLanguages = [...this.props.values.languages];
        for (let index = 0; index < tempLanguages.length; index++) {
            elements.push(
                <div key={index} className="cv15-languages-item">
                    <p>{tempLanguages[index].name}</p>
                    <p>{tempLanguages[index].level}</p>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const locationText = formatLocation(
            this.props.values.address,
            this.props.values.city,
            this.props.values.country,
            this.props.values.postalcode
        );

        return (
            <div id="resumen" className="cv15-board">
                <div className="cv15-content">
                    {/*  Left side */}
                    <div className="cv15-left-side">
                        {/* Left side head */}
                        <div className="cv15-left-side-head">
                            <div className="cv15-image">
                                {this.props.values.photo ? (
                                    <img alt="photoOf" className="photo" src={this.props.values.photo} />
                                ) : (
                                    <div style={{
                                        width: '120px',
                                        height: '120px',
                                        borderRadius: '50%',
                                        backgroundColor: '#3B82F6',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '36px',
                                        fontWeight: 'bold'
                                    }}>
                                        {((this.props.values.firstname?.[0] || '') + (this.props.values.lastname?.[0] || '')).toUpperCase() || 'CV'}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Left side body */}

                        <div className="cv15-left-side-body">
                            <div className="cv15-left-title">
                                <span>{t('resume.personalSummary')}</span>
                            </div>
                            <div className="cv15-summary">
                                <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(this.props.values.summary) }}></p>
                            </div>
                            <div className="cv15-left-title">
                                <span>{t('resume.skills')}</span>
                            </div>

                            <div className="cv15-skills">{this.returnSkills()}</div>

                            {this.props.values?.languages?.length > 0 && (
                                <>
                                    <div className="cv15-left-title">
                                        <span>{t('resume.languages')}</span>
                                    </div>
                                    <div className="cv15-languages">{this.returnLanguages()}</div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right side */}
                    <div className="cv15-right-side">
                        {/* Right side head */}
                        <div className="cv15-right-side-head">
                            <div className="cv15-right-side-head-left">
                                <h1>
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <p>{this.props.values.occupation}</p>
                            </div>
                            <div className="cv15-right-side-head-right">
                                {/* Contact info using react-icons */}
                                <div className="cv15-contact-info">
                                    {this.props.values.phone && (
                                        <div className="cv15-contact-info-item">
                                            <FaPhoneAlt className="cv15-contact-icon" />
                                            <p>{this.props.values.phone}</p>
                                        </div>
                                    )}
                                    {this.props.values.email && (
                                        <div className="cv15-contact-info-item">
                                            <FaEnvelope className="cv15-contact-icon" />
                                            <p>{this.props.values.email}</p>
                                        </div>
                                    )}
                                    {locationText && (
                                        <div className="cv15-contact-info-item">
                                            <FaMapMarkerAlt className="cv15-contact-icon" />
                                            <p>{locationText}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Right side body */}
                        <div className="cv15-right-side">
                            <div className="cv15-right-side-body">
                                {/* Right title */}
                                <div className="cv15-right-title">
                                    <FaAngleDoubleRight className="cv15-right-title-icon" />
                                    <span>{t('resume.employmentHistory')}</span>
                                </div>
                                {/* Work history */}
                                <div className="cv15-work-history">{this.returnEmployments()}</div>
                                {/* Right title */}
                                <div className="cv15-right-title">
                                    <FaAngleDoubleRight className="cv15-right-title-icon" />
                                    <span>{t('resume.educationHistory')}</span>
                                </div>
                                {/* Education history */}
                                <div className="cv15-work-history">{this.returnEducations()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv15);
export default MyComponent;
