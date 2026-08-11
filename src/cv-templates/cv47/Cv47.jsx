import React, { Component } from 'react';
import './Cv47.scss';
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
    FaLaptopCode,
    FaCalendarAlt,
    FaClock,
    FaBuilding,
    FaUniversity,
    FaQuoteLeft,
} from 'react-icons/fa';

class Cv47 extends Component {
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
                <div key={index} className="language-item">
                    <div className="language-header">
                        <div className="language-name">{tempLanguages[index].name}</div>
                        <div className="language-level">{tempLanguages[index].level}</div>
                    </div>
                    <div className="progress-container">
                        <div className="progress-bar" style={{ width: `${width}%` }}></div>
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

        for (let index = 0; index < tempSkills.length; index++) {
            elements.push(
                <div key={index} className="skill-tag">
                    {tempSkills[index].name}
                </div>
            );
        }
        return elements;
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = this.props.values.employments.sort(function (a, b) {
            return b.date - a.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="experience-item">
                    <div className="timeline-dot"></div>
                    <div className="experience-content">
                        <div className="experience-header">
                            <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="company-name">
                                <FaBuilding className="company-icon" />
                                {tempEmployments[index].employer}
                            </div>
                        </div>
                        <div className="timeframe">
                            <FaClock className="timeframe-icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <div className="job-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                <div key={index} className="education-item">
                    <div className="timeline-dot"></div>
                    <div className="education-content">
                        <div className="education-header">
                            <h3 className="degree">{tempEducations[index].degree}</h3>
                            <div className="school-name">
                                <FaUniversity className="school-icon" />
                                {tempEducations[index].school}
                            </div>
                        </div>
                        <div className="timeframe">
                            <FaClock className="timeframe-icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <div className="education-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv47-board">
                <div className="cv47-header">
                    <div className="left-side">
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="occupation">{this.props.values.occupation}</h2>
                    </div>
                    <div className="right-side">
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
                </div>

                <div className="cv47-main">
                    <div className="left-column">
                        <div className="contact-info">
                            <h3 className="section-title">{t('resume.contactInfo')}</h3>
                            <ul className="contact-list">
                                <li className="contact-item">
                                    <FaPhone className="contact-icon" />
                                    <span>{this.props.values.phone}</span>
                                </li>
                                <li className="contact-item">
                                    <FaEnvelope className="contact-icon" />
                                    <span>{this.props.values.email}</span>
                                </li>
                                <li className="contact-item">
                                    <FaMapMarkerAlt className="contact-icon" />
                                    <span>
                                        {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                    </span>
                                </li>
                                {this.props.values.linkedin && (
                                    <li className="contact-item">
                                        <FaLinkedin className="contact-icon" />
                                        <span>{this.props.values.linkedin}</span>
                                    </li>
                                )}
                                {this.props.values.github && (
                                    <li className="contact-item">
                                        <FaGithub className="contact-icon" />
                                        <span>{this.props.values.github}</span>
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="skills-section">
                            <h3 className="section-title">{t('resume.skills')}</h3>
                            <div className="skills-container">{this.returnSkills()}</div>
                        </div>

                        <div className="languages-section">
                            <h3 className="section-title">{t('resume.languages')}</h3>
                            <div className="languages-container">{this.returnLanguages()}</div>
                        </div>
                    </div>

                    <div className="right-column">
                        <div className="summary-section">
                            <div className="quote-icon">
                                <FaQuoteLeft />
                            </div>
                            <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                        </div>

                        <div className="experience-section">
                            <h3 className="section-title">
                                <FaBriefcase className="section-icon" />
                                {t('resume.employmentHistory')}
                            </h3>
                            <div className="timeline">{this.returnEmployments()}</div>
                        </div>

                        <div className="education-section">
                            <h3 className="section-title">
                                <FaGraduationCap className="section-icon" />
                                {t('resume.educationHistory')}
                            </h3>
                            <div className="timeline">{this.returnEducations()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default withTranslation('common')(Cv47);
