import React, { Component } from 'react';
import './Cv49.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
    FaEnvelope,
    FaPhone,
    FaMapMarkerAlt,
    FaGlobeAmericas,
    FaUserAlt,
    FaLinkedin,
    FaGithub,
    FaBriefcase,
    FaGraduationCap,
    FaTools,
    FaCalendarAlt,
    FaUser,
    FaQuoteRight,
    FaAngleRight,
    FaBuilding,
    FaUniversity,
} from 'react-icons/fa';

class Cv49 extends Component {
    constructor(props) {
        super(props);
        i18n.changeLanguage(this.props.language);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
    }

    returnLanguages() {
        var elements = [];
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        const levelWidths = {
            native: 100,
            fluent: 90,
            advanced: 80,
            proficient: 70,
            intermediate: 55,
            elementary: 40,
            basic: 30,
            beginner: 20,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const width = levelWidths[level] || 50;

            elements.push(
                <div key={index} className="language-card">
                    <div className="language-info">
                        <h4 className="language-name">{tempLanguages[index].name}</h4>
                        <span className="language-level">{tempLanguages[index].level}</span>
                    </div>
                    <div className="language-progress">
                        <div className="progress-outer">
                            <div className="progress-inner" style={{ width: `${width}%` }} data-percent={`${width}%`}></div>
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnSkills() {
        var elements = [];
        var tempSkills = this.props.values.skills.sort(function (a, b) {
            return a.date - b.date;
        });

        // Group skills by category (or use "Other" if no category)
        const skillsByCategory = {};
        tempSkills.forEach((skill) => {
            const category = skill.category || 'Other';
            if (!skillsByCategory[category]) {
                skillsByCategory[category] = [];
            }
            skillsByCategory[category].push(skill);
        });

        // Create UI elements by category
        Object.keys(skillsByCategory).forEach((category) => {
            elements.push(
                <div key={category} className="skill-category">
                    {category !== 'Other' && <h4 className="category-title">{category}</h4>}
                    <div className="skill-pills">
                        {skillsByCategory[category].map((skill, idx) => (
                            <div key={idx} className="skill-pill" data-level={skill.level || 'intermediate'}>
                                <span className="skill-name">{skill.name}</span>
                                {skill.level && <div className="skill-level-indicator"></div>}
                            </div>
                        ))}
                    </div>
                </div>
            );
        });

        return elements;
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = this.props.values.employments.sort(function (a, b) {
            return b.date - a.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-marker"></div>

                    <div className="timeline-content">
                        <div className="timeline-date">
                            <FaCalendarAlt className="date-icon" />
                            <span className="date-text">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>

                        <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>

                        <div className="timeline-subtitle">
                            <FaBuilding className="subtitle-icon" />
                            <span className="subtitle-text">{tempEmployments[index].employer}</span>
                        </div>

                        <div className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnEducations() {
        var elements = [];
        var tempEducations = this.props.values.educations.sort(function (a, b) {
            return b.date - a.date;
        });

        for (let index = 0; index < tempEducations.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-marker"></div>

                    <div className="timeline-content">
                        <div className="timeline-date">
                            <FaCalendarAlt className="date-icon" />
                            <span className="date-text">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>

                        <h3 className="timeline-title">{tempEducations[index].degree}</h3>

                        <div className="timeline-subtitle">
                            <FaUniversity className="subtitle-icon" />
                            <span className="subtitle-text">{tempEducations[index].school}</span>
                        </div>

                        <div className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv49-board">
                <div className="cv49-sidebar">
                    <div className="sidebar-top">
                        <div className="photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sidebar-content">
                        <div className="contact-section">
                            <h3 className="sidebar-heading">{t('resume.contactInfo')}</h3>

                            <div className="contact-item">
                                <FaPhone className="contact-icon" />
                                <div className="contact-details">
                                    <h4>{t('resume.phone')}</h4>
                                    <p>{this.props.values.phone}</p>
                                </div>
                            </div>

                            <div className="contact-item">
                                <FaEnvelope className="contact-icon" />
                                <div className="contact-details">
                                    <h4>{t('resume.email')}</h4>
                                    <p>{this.props.values.email}</p>
                                </div>
                            </div>

                            <div className="contact-item">
                                <FaMapMarkerAlt className="contact-icon" />
                                <div className="contact-details">
                                    <h4>{t('resume.address')}</h4>
                                    <p>
                                        {this.props.values.address}, {this.props.values.city},{this.props.values.country}
                                    </p>
                                </div>
                            </div>

                            {this.props.values.linkedin && (
                                <div className="contact-item">
                                    <FaLinkedin className="contact-icon" />
                                    <div className="contact-details">
                                        <h4>LinkedIn</h4>
                                        <p>{this.props.values.linkedin}</p>
                                    </div>
                                </div>
                            )}

                            {this.props.values.github && (
                                <div className="contact-item">
                                    <FaGithub className="contact-icon" />
                                    <div className="contact-details">
                                        <h4>GitHub</h4>
                                        <p>{this.props.values.github}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="skills-section">
                            <h3 className="sidebar-heading">{t('resume.skills')}</h3>
                            <div className="skills-content">{this.returnSkills()}</div>
                        </div>

                        <div className="languages-section">
                            <h3 className="sidebar-heading">{t('resume.languages')}</h3>
                            <div className="languages-content">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>

                <div className="cv49-main">
                    <header className="main-header">
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="profession">{this.props.values.occupation}</h2>
                    </header>

                    <div className="summary-section">
                        <div className="section-header">
                            <div className="header-line"></div>
                            <h3 className="section-title">
                                <FaUser className="section-icon" />
                                <span>{t('resume.personalSummary')}</span>
                            </h3>
                            <div className="header-line"></div>
                        </div>

                        <div className="summary-content">
                            <div className="summary-quote">
                                <div dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                                <FaQuoteRight className="quote-icon" />
                            </div>
                        </div>
                    </div>

                    <div className="experience-section">
                        <div className="section-header">
                            <div className="header-line"></div>
                            <h3 className="section-title">
                                <FaBriefcase className="section-icon" />
                                <span>{t('resume.employmentHistory')}</span>
                            </h3>
                            <div className="header-line"></div>
                        </div>

                        <div className="timeline-container">{this.returnEmployments()}</div>
                    </div>

                    <div className="education-section">
                        <div className="section-header">
                            <div className="header-line"></div>
                            <h3 className="section-title">
                                <FaGraduationCap className="section-icon" />
                                <span>{t('resume.educationHistory')}</span>
                            </h3>
                            <div className="header-line"></div>
                        </div>

                        <div className="timeline-container">{this.returnEducations()}</div>
                    </div>
                </div>
            </div>
        );
    }
}

export default withTranslation('common')(Cv49);
