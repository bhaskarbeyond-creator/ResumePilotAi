import React, { Component } from 'react';
import './Cv37.scss';
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
    FaQuoteLeft,
    FaRegLightbulb,
    FaCheck,
    FaUser,
    FaStar,
} from 'react-icons/fa';

class Cv37 extends Component {
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
            const levelPercentMap = {
                native: 100,
                fluent: 90,
                advanced: 80,
                proficient: 70,
                intermediate: 60,
                elementary: 40,
                basic: 30,
                beginner: 20,
            };

            const level = tempLanguages[index].level.toLowerCase();
            const percentage = levelPercentMap[level] || 50;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-header">
                        <span className="language-name">{tempLanguages[index].name}</span>
                        <span className="language-level">{tempLanguages[index].level}</span>
                    </div>
                    <div className="language-progress-container">
                        <div className="language-progress-bar">
                            <div className="language-progress" style={{ width: `${percentage}%` }}></div>
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

        for (let index = 0; index < tempSkills.length; index++) {
            const percentage = Math.min(Math.max(tempSkills[index].rating, 0), 100);

            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-label">
                        <FaStar className="skill-icon" />
                        <span className="skill-name">{tempSkills[index].name}</span>
                    </div>
                    <div className="skill-rating">
                        <div className="skill-bar">
                            <div className="skill-progress" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <span className="skill-percentage">{percentage}%</span>
                    </div>
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
                    <div className="experience-icon-container">
                        <div className="timeline-dot"></div>
                    </div>
                    <div className="experience-content">
                        <div className="experience-header">
                            <h3 className="experience-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="experience-date">
                                <FaCalendarAlt className="date-icon" />
                                <span>
                                    {tempEmployments[index].begin} – {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                        <div className="experience-company">{tempEmployments[index].employer}</div>
                        <div className="experience-description">
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
                <div key={index} className="education-item">
                    <div className="education-icon-container">
                        <div className="timeline-dot"></div>
                    </div>
                    <div className="education-content">
                        <div className="education-header">
                            <h3 className="education-title">{tempEducations[index].degree}</h3>
                            <div className="education-date">
                                <FaCalendarAlt className="date-icon" />
                                <span>
                                    {tempEducations[index].started} – {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                        <div className="education-institution">{tempEducations[index].school}</div>
                        <div className="education-description">
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
            <div id="resumen" className="cv37-board">
                <div className="cv37-header">
                    <div className="header-content">
                        <div className="profile-photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                        <div className="header-text">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="occupation">{this.props.values.occupation}</h2>
                        </div>
                    </div>
                    <div className="contact-info">
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

                <div className="cv37-main">
                    <div className="summary-section section">
                        <div className="section-header">
                            <div className="section-icon">
                                <FaUser />
                            </div>
                            <h3 className="section-title">{t('resume.personalSummary')}</h3>
                        </div>
                        <div className="section-content">
                            <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                        </div>
                    </div>

                    <div className="cv37-columns">
                        <div className="left-column">
                            <div className="experience-section section">
                                <div className="section-header">
                                    <div className="section-icon">
                                        <FaBriefcase />
                                    </div>
                                    <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEmployments()}</div>
                                </div>
                            </div>

                            <div className="education-section section">
                                <div className="section-header">
                                    <div className="section-icon">
                                        <FaGraduationCap />
                                    </div>
                                    <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEducations()}</div>
                                </div>
                            </div>
                        </div>

                        <div className="right-column">
                            <div className="skills-section section">
                                <div className="section-header">
                                    <div className="section-icon">
                                        <FaLaptopCode />
                                    </div>
                                    <h3 className="section-title">{t('resume.skills')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="skills-container">{this.returnSkills()}</div>
                                </div>
                            </div>

                            <div className="languages-section section">
                                <div className="section-header">
                                    <div className="section-icon">
                                        <FaGlobeAmericas />
                                    </div>
                                    <h3 className="section-title">{t('resume.languages')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="languages-container">{this.returnLanguages()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv37);
export default MyComponent;
