import React, { Component } from 'react';
import './Cv35.scss';
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
    FaQuoteLeft,
    FaStar,
    FaBuilding,
    FaUniversity,
} from 'react-icons/fa';

class Cv35 extends Component {
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
            const levelStarsMap = {
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
            const stars = levelStarsMap[level] || 3;
            const starElements = [];

            for (let i = 0; i < 5; i++) {
                starElements.push(<FaStar key={i} className={i < stars ? 'star-filled' : 'star-empty'} />);
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <div className="stars">{starElements}</div>
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
                    <div className="skill-header">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-percentage">{percentage}%</span>
                    </div>
                    <div className="skill-bar">
                        <div className="skill-progress" style={{ width: `${percentage}%` }}></div>
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
                        <div className="experience-title-box">
                            <h3 className="experience-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="experience-company">
                                <FaBuilding className="company-icon" />
                                <span>{tempEmployments[index].employer}</span>
                            </div>
                        </div>
                        <div className="experience-period">
                            <FaCalendarAlt className="calendar-icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="experience-description">
                        <p dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                    <div className="education-header">
                        <div className="education-title-box">
                            <h3 className="education-title">{tempEducations[index].degree}</h3>
                            <div className="education-school">
                                <FaUniversity className="school-icon" />
                                <span>{tempEducations[index].school}</span>
                            </div>
                        </div>
                        <div className="education-period">
                            <FaCalendarAlt className="calendar-icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="education-description">
                        <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv35-board">
                <header className="cv35-header">
                    <div className="header-top">
                        <div className="name-section">
                            <h1 className="fullname">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="job-title">{this.props.values.occupation}</h2>
                        </div>
                        <div className="photo-container">
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
                </header>

                <div className="cv35-main">
                    <div className="left-column">
                        <section className="summary-section">
                            <div className="section-header">
                                <FaQuoteLeft className="section-icon" />
                                <h3 className="section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="section-content">
                                <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </section>

                        <section className="experience-section">
                            <div className="section-header">
                                <FaBriefcase className="section-icon" />
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="section-content">{this.returnEmployments()}</div>
                        </section>

                        <section className="education-section">
                            <div className="section-header">
                                <FaGraduationCap className="section-icon" />
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="section-content">{this.returnEducations()}</div>
                        </section>
                    </div>

                    <div className="right-column">
                        <section className="skills-section">
                            <div className="section-header">
                                <FaLaptopCode className="section-icon" />
                                <h3 className="section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="section-content skills-content">{this.returnSkills()}</div>
                        </section>

                        <section className="languages-section">
                            <div className="section-header">
                                <FaGlobeAmericas className="section-icon" />
                                <h3 className="section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="section-content languages-content">{this.returnLanguages()}</div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv35);
export default MyComponent;
