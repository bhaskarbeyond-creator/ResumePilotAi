import React, { Component } from 'react';
import './Cv48.scss';
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
    FaBuilding,
    FaUniversity,
    FaCode,
    FaStar,
    FaTrophy,
} from 'react-icons/fa';

class Cv48 extends Component {
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

        const levelStars = {
            native: 5,
            fluent: 5,
            advanced: 4,
            proficient: 4,
            intermediate: 3,
            elementary: 2,
            basic: 2,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const stars = levelStars[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-header">
                        <span className="language-name">{tempLanguages[index].name}</span>
                    </div>
                    <div className="star-rating">
                        {[...Array(5)].map((_, i) => (
                            <FaStar key={i} className={i < stars ? 'star active' : 'star inactive'} />
                        ))}
                    </div>
                    <div className="language-level">{tempLanguages[index].level}</div>
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
            const rating = Math.min(Math.max(tempSkills[index].rating, 0), 100);
            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-name-container">
                        <FaCode className="skill-icon" />
                        <div className="skill-name">{tempSkills[index].name}</div>
                    </div>
                    <div className="skill-meter">
                        <div className="skill-level" style={{ width: `${rating}%` }}></div>
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
                    <div className="position-timeline">
                        <div className="timeline-marker">
                            <div className="marker-circle"></div>
                        </div>
                        <div className="position-details">
                            <div className="timeperiod">
                                <FaCalendarAlt className="calendar-icon" />
                                <span>
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="position-content">
                        <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="company">
                            <FaBuilding className="company-icon" />
                            <span className="company-name">{tempEmployments[index].employer}</span>
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
                    <div className="position-timeline">
                        <div className="timeline-marker">
                            <div className="marker-circle"></div>
                        </div>
                        <div className="position-details">
                            <div className="timeperiod">
                                <FaCalendarAlt className="calendar-icon" />
                                <span>
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="position-content">
                        <h3 className="degree">{tempEducations[index].degree}</h3>
                        <div className="institute">
                            <FaUniversity className="institute-icon" />
                            <span className="school-name">{tempEducations[index].school}</span>
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
            <div id="resumen" className="cv48-board">
                <div className="cv48-header">
                    <div className="profile-banner">
                        <div className="profile-photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt />
                                </div>
                            )}
                        </div>
                        <div className="name-position">
                            <h1 className="full-name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="position-title">{this.props.values.occupation}</h2>
                        </div>
                    </div>
                </div>

                <div className="cv48-body">
                    <div className="left-column">
                        <section className="contact-section">
                            <h3 className="section-title">{t('resume.contactInfo')}</h3>
                            <div className="contact-list">
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
                        </section>

                        <section className="skills-section">
                            <h3 className="section-title">
                                <FaTrophy className="section-icon" />
                                {t('resume.skills')}
                            </h3>
                            <div className="skills-container">{this.returnSkills()}</div>
                        </section>

                        <section className="languages-section">
                            <h3 className="section-title">
                                <FaGlobeAmericas className="section-icon" />
                                {t('resume.languages')}
                            </h3>
                            <div className="languages-container">{this.returnLanguages()}</div>
                        </section>
                    </div>

                    <div className="right-column">
                        <section className="summary-section">
                            <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                        </section>

                        <section className="experience-section">
                            <h3 className="section-title">
                                <FaBriefcase className="section-icon" />
                                {t('resume.employmentHistory')}
                            </h3>
                            <div className="experience-timeline">{this.returnEmployments()}</div>
                        </section>

                        <section className="education-section">
                            <h3 className="section-title">
                                <FaGraduationCap className="section-icon" />
                                {t('resume.educationHistory')}
                            </h3>
                            <div className="education-timeline">{this.returnEducations()}</div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

export default withTranslation('common')(Cv48);
