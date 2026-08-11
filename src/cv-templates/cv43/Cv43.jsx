import React, { Component } from 'react';
import './Cv43.scss';
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
    FaQuoteRight,
    FaUserTie,
    FaTools,
    FaStar,
    FaShareAlt,
    FaCertificate,
    FaIdCard,
} from 'react-icons/fa';

class Cv43 extends Component {
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

        const levelMap = {
            native: 5,
            fluent: 5,
            advanced: 4,
            proficient: 3,
            intermediate: 3,
            elementary: 2,
            basic: 1,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const numStars = levelMap[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name-level">
                        <span className="language-name">{tempLanguages[index].name}</span>
                        <span className="language-level">{tempLanguages[index].level}</span>
                    </div>
                    <div className="language-rating">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`language-star ${i < numStars ? 'active' : 'inactive'}`}>
                                <FaStar />
                            </div>
                        ))}
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
                    <div className="skill-info">
                        <div className="skill-name">{tempSkills[index].name}</div>
                    </div>
                    <div className="skill-bar-container">
                        <div className="skill-bar" style={{ width: `${percentage}%` }}>
                            <span className="skill-percentage">{percentage}%</span>
                        </div>
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
                    <div className="experience-header">
                        <div className="job-title-company">
                            <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="company-name">{tempEmployments[index].employer}</div>
                        </div>
                        <div className="job-period">
                            <FaCalendarAlt className="period-icon" />
                            <span className="period-text">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="experience-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}>
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
                    <div className="education-icon">
                        <FaCertificate className="icon" />
                    </div>
                    <div className="education-content">
                        <div className="education-header">
                            <div className="degree-school">
                                <h3 className="degree">{tempEducations[index].degree}</h3>
                                <div className="school-name">{tempEducations[index].school}</div>
                            </div>
                            <div className="education-period">
                                <FaCalendarAlt className="period-icon" />
                                <span className="period-text">
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                        <div className="education-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}>
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
            <div id="resumen" className="cv43-board">
                <div className="cv43-header">
                    <div className="personal-info">
                        <div className="name-photo">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserAlt className="placeholder-icon" />
                                    </div>
                                )}
                            </div>
                            <div className="name-title">
                                <h1 className="name">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2 className="title">{this.props.values.occupation}</h2>
                            </div>
                        </div>
                        <div className="contact-details">
                            <div className="contact-item">
                                <FaPhone className="contact-icon" />
                                <span className="contact-text">{this.props.values.phone}</span>
                            </div>
                            <div className="contact-item">
                                <FaEnvelope className="contact-icon" />
                                <span className="contact-text">{this.props.values.email}</span>
                            </div>
                            <div className="contact-item">
                                <FaMapMarkerAlt className="contact-icon" />
                                <span className="contact-text">
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </span>
                            </div>
                            {this.props.values.linkedin && (
                                <div className="contact-item">
                                    <FaLinkedin className="contact-icon" />
                                    <span className="contact-text">{this.props.values.linkedin}</span>
                                </div>
                            )}
                            {this.props.values.github && (
                                <div className="contact-item">
                                    <FaGithub className="contact-icon" />
                                    <span className="contact-text">{this.props.values.github}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="cv43-main">
                    <div className="left-column">
                        <section className="profile-section section">
                            <div className="section-header">
                                <FaUserTie className="section-icon" />
                                <h2 className="section-title">{t('resume.personalSummary')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="summary-content">
                                    <FaQuoteLeft className="quote-left" />
                                    <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                                    <FaQuoteRight className="quote-right" />
                                </div>
                            </div>
                        </section>

                        <section className="experience-section section">
                            <div className="section-header">
                                <FaBriefcase className="section-icon" />
                                <h2 className="section-title">{t('resume.employmentHistory')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="experience-list">{this.returnEmployments()}</div>
                            </div>
                        </section>

                        <section className="education-section section">
                            <div className="section-header">
                                <FaGraduationCap className="section-icon" />
                                <h2 className="section-title">{t('resume.educationHistory')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="education-list">{this.returnEducations()}</div>
                            </div>
                        </section>
                    </div>

                    <div className="right-column">
                        <section className="skills-section section">
                            <div className="section-header">
                                <FaTools className="section-icon" />
                                <h2 className="section-title">{t('resume.skills')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="skills-container">{this.returnSkills()}</div>
                            </div>
                        </section>

                        <section className="languages-section section">
                            <div className="section-header">
                                <FaGlobeAmericas className="section-icon" />
                                <h2 className="section-title">{t('resume.languages')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="languages-container">{this.returnLanguages()}</div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv43);
export default MyComponent;
