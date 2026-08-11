import React, { Component } from 'react';
import './Cv38.scss';
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
    FaBullseye,
    FaMedal,
    FaHistory,
} from 'react-icons/fa';

class Cv38 extends Component {
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

        for (let index = 0; index < tempLanguages.length; index++) {
            const levelBadgeMap = {
                native: 'Native Speaker',
                fluent: 'Fluent',
                advanced: 'Advanced',
                proficient: 'Proficient',
                intermediate: 'Intermediate',
                elementary: 'Elementary',
                basic: 'Basic',
                beginner: 'Beginner',
            };

            const level = tempLanguages[index].level.toLowerCase();
            const badge = levelBadgeMap[level] || tempLanguages[index].level;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <span className="level-badge">{badge}</span>
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
            const percentage = Math.min(Math.max(tempSkills[index].rating, 0), 100);
            const radius = 12;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (percentage / 100) * circumference;

            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-circle">
                        <svg width="35" height="35" viewBox="0 0 35 35">
                            <circle className="skill-circle-bg" cx="17.5" cy="17.5" r={radius} fill="none" strokeWidth="3" />
                            <circle
                                className="skill-circle-progress"
                                cx="17.5"
                                cy="17.5"
                                r={radius}
                                fill="none"
                                strokeWidth="3"
                                strokeDasharray={circumference}
                                strokeDashoffset={offset}
                                transform="rotate(-90 17.5 17.5)"
                            />
                            <text x="17.5" y="20.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">
                                {percentage}%
                            </text>
                        </svg>
                    </div>
                    <div className="skill-name">{tempSkills[index].name}</div>
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
                <div key={index} className="timeline-item">
                    <div className="timeline-dot"></div>
                    <div className="timeline-date">
                        <FaCalendarAlt className="timeline-icon" />
                        <span>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </span>
                    </div>
                    <div className="timeline-content">
                        <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="timeline-subtitle">{tempEmployments[index].employer}</div>
                        <div className="timeline-description">
                            <p dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
                        </div>
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
                    <div className="timeline-dot"></div>
                    <div className="timeline-date">
                        <FaCalendarAlt className="timeline-icon" />
                        <span>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </span>
                    </div>
                    <div className="timeline-content">
                        <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                        <div className="timeline-subtitle">{tempEducations[index].school}</div>
                        <div className="timeline-description">
                            <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv38-board">
                <div className="cv38-sidebar">
                    <div className="profile-section">
                        <div className="profile-photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="occupation">{this.props.values.occupation}</h2>
                    </div>

                    <div className="contact-section sidebar-section">
                        <h3 className="sidebar-title">Contact</h3>
                        <div className="contact-list">
                            <div className="contact-item">
                                <FaPhone className="contact-icon" />
                                <span>{this.props.values.phone}</span>
                            </div>
                            <div className="contact-item">
                                <FaEnvelope className="contact-icon" />
                                <span>{this.props.values.email}</span>
                            </div>
                            <div className="contact-item">
                                <FaMapMarkerAlt className="contact-icon" />
                                <span>
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </span>
                            </div>
                            {this.props.values.linkedin && (
                                <div className="contact-item">
                                    <FaLinkedin className="contact-icon" />
                                    <span>{this.props.values.linkedin}</span>
                                </div>
                            )}
                            {this.props.values.github && (
                                <div className="contact-item">
                                    <FaGithub className="contact-icon" />
                                    <span>{this.props.values.github}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="skills-section sidebar-section">
                        <h3 className="sidebar-title">{t('resume.skills')}</h3>
                        <div className="skills-list">{this.returnSkills()}</div>
                    </div>

                    <div className="languages-section sidebar-section">
                        <h3 className="sidebar-title">{t('resume.languages')}</h3>
                        <div className="languages-list">{this.returnLanguages()}</div>
                    </div>
                </div>

                <div className="cv38-main">
                    <div className="summary-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaBullseye className="section-icon" />
                            </div>
                            <h3 className="section-title">{t('resume.personalSummary')}</h3>
                        </div>
                        <div className="section-content">
                            <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                        </div>
                    </div>

                    <div className="experience-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaBriefcase className="section-icon" />
                            </div>
                            <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                        </div>
                        <div className="section-content">
                            <div className="timeline">{this.returnEmployments()}</div>
                        </div>
                    </div>

                    <div className="education-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaGraduationCap className="section-icon" />
                            </div>
                            <h3 className="section-title">{t('resume.educationHistory')}</h3>
                        </div>
                        <div className="section-content">
                            <div className="timeline">{this.returnEducations()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv38);
export default MyComponent;
