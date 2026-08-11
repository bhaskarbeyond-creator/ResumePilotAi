import React, { Component } from 'react';
import './Cv46.scss';
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
    FaUserTie,
    FaCheck,
    FaCircle,
} from 'react-icons/fa';

class Cv46 extends Component {
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

        const levelBars = {
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
            const bars = levelBars[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">{tempLanguages[index].level}</div>
                    <div className="language-bars">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`bar ${i < bars ? 'filled' : 'empty'}`} />
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
            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-check">
                        <FaCheck />
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
                <div key={index} className="experience-item">
                    <div className="experience-header">
                        <div className="job-title">{tempEmployments[index].jobTitle}</div>
                        <div className="timeframe">
                            <FaCalendarAlt className="calendar-icon" />
                            <span className="date-range">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="company-name">{tempEmployments[index].employer}</div>
                    <div className="job-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                    <div className="education-header">
                        <div className="degree">{tempEducations[index].degree}</div>
                        <div className="timeframe">
                            <FaCalendarAlt className="calendar-icon" />
                            <span className="date-range">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="school-name">{tempEducations[index].school}</div>
                    <div className="education-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv46-board">
                <header className="cv46-header">
                    <div className="personal-info">
                        <div className="name-photo">
                            <div className="name-title">
                                <h1 className="name">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2 className="title">{this.props.values.occupation}</h2>
                            </div>
                            <div className="photo-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserAlt className="placeholder-icon" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="summary" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                    </div>
                    <div className="contact-info">
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
                </header>

                <div className="cv46-main">
                    <div className="main-column">
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

                    <div className="side-column">
                        <section className="skills-section section">
                            <div className="section-header">
                                <FaLaptopCode className="section-icon" />
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

export default withTranslation('common')(Cv46);
