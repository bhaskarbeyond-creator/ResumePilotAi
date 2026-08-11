import React, { Component } from 'react';
import './Cv36.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
    FaEnvelope,
    FaPhone,
    FaMapMarkerAlt,
    FaGlobeAmericas,
    FaUserTie,
    FaLinkedin,
    FaGithub,
    FaBriefcase,
    FaGraduationCap,
    FaLaptopCode,
    FaCalendarAlt,
    FaCircle,
    FaRegCircle,
    FaQuoteRight,
    FaChevronRight,
} from 'react-icons/fa';

class Cv36 extends Component {
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
            const levelDotsMap = {
                native: 5,
                fluent: 5,
                advanced: 4,
                proficient: 4,
                intermediate: 3,
                elementary: 2,
                basic: 2,
                beginner: 1,
            };

            const level = tempLanguages[index].level.toLowerCase();
            const dots = levelDotsMap[level] || 3;
            const dotElements = [];

            for (let i = 0; i < 5; i++) {
                dotElements.push(i < dots ? <FaCircle key={i} className="dot-filled" /> : <FaRegCircle key={i} className="dot-empty" />);
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <div className="dots">{dotElements}</div>
                        <span className="level-text">{tempLanguages[index].level}</span>
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
                    <span className="skill-name">{tempSkills[index].name}</span>
                    <div className="skill-bar-container">
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
                <div key={index} className="timeline-item">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                        <div className="timeline-period">
                            <FaCalendarAlt className="period-icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
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
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                        <div className="timeline-period">
                            <FaCalendarAlt className="period-icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
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
            <div id="resumen" className="cv36-board">
                <div className="cv36-header">
                    <div className="header-top">
                        <div className="name-title">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="title">{this.props.values.occupation}</h2>
                        </div>
                        <div className="profile-photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserTie className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="contact-info">
                        <div className="contact-group">
                            <div className="contact-item">
                                <FaPhone className="contact-icon" />
                                <span>{this.props.values.phone}</span>
                            </div>
                            <div className="contact-item">
                                <FaEnvelope className="contact-icon" />
                                <span>{this.props.values.email}</span>
                            </div>
                        </div>
                        <div className="contact-group">
                            <div className="contact-item">
                                <FaMapMarkerAlt className="contact-icon" />
                                <span>
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </span>
                            </div>
                        </div>
                        <div className="contact-group">
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
                </div>

                <div className="cv36-content">
                    <div className="content-main">
                        <div className="profile-section">
                            <div className="section-header">
                                <h3 className="section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="profile-summary">
                                    <div className="quote-icon">
                                        <FaQuoteRight />
                                    </div>
                                    <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                                </div>
                            </div>
                        </div>

                        <div className="experience-section">
                            <div className="section-header">
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="timeline timeline-employment">{this.returnEmployments()}</div>
                            </div>
                        </div>

                        <div className="education-section">
                            <div className="section-header">
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="timeline timeline-education">{this.returnEducations()}</div>
                            </div>
                        </div>
                    </div>

                    <div className="content-sidebar">
                        <div className="skills-section">
                            <div className="section-header">
                                <h3 className="section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="skills-list">{this.returnSkills()}</div>
                            </div>
                        </div>

                        <div className="languages-section">
                            <div className="section-header">
                                <h3 className="section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="languages-list">{this.returnLanguages()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv36);
export default MyComponent;
