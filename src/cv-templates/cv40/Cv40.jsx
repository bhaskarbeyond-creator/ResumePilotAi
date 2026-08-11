import React, { Component } from 'react';
import './Cv40.scss';
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
    FaLeaf,
    FaCircle,
    FaRegCircle,
    FaEllipsisH,
    FaUserTie,
} from 'react-icons/fa';

class Cv40 extends Component {
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

        const levelCircleMap = {
            native: 5,
            fluent: 5,
            advanced: 4,
            proficient: 4,
            intermediate: 3,
            elementary: 2,
            basic: 1,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const circles = levelCircleMap[level] || 3;
            const circleElements = [];

            for (let i = 0; i < 5; i++) {
                circleElements.push(
                    <span key={i} className="circle-indicator">
                        {i < circles ? <FaCircle className="filled" /> : <FaRegCircle className="empty" />}
                    </span>
                );
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <div className="circle-container">{circleElements}</div>
                        <span className="level-label">{tempLanguages[index].level}</span>
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
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <div className="skill-gauge">
                            <div className="skill-gauge-fill" style={{ width: `${percentage}%` }}></div>
                            <span className="skill-gauge-text">{percentage}%</span>
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
                <div key={index} className="exp-item">
                    <div className="exp-period">
                        <div className="exp-year-range">
                            <span className="exp-year">{tempEmployments[index].begin}</span>
                            <FaEllipsisH className="exp-separator" />
                            <span className="exp-year">{tempEmployments[index].end}</span>
                        </div>
                        <div className="exp-duration-container">
                            <div className="exp-duration-line"></div>
                        </div>
                    </div>
                    <div className="exp-content">
                        <h3 className="exp-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="exp-company">{tempEmployments[index].employer}</div>
                        <div className="exp-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                <div key={index} className="edu-item">
                    <div className="edu-period">
                        <div className="edu-year-range">
                            <span className="edu-year">{tempEducations[index].started}</span>
                            <FaEllipsisH className="edu-separator" />
                            <span className="edu-year">{tempEducations[index].finished}</span>
                        </div>
                        <div className="edu-duration-container">
                            <div className="edu-duration-line"></div>
                        </div>
                    </div>
                    <div className="edu-content">
                        <h3 className="edu-title">{tempEducations[index].degree}</h3>
                        <div className="edu-institution">{tempEducations[index].school}</div>
                        <div className="edu-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv40-board">
                <header className="cv40-header">
                    <div className="header-top">
                        <div className="profile-photo-wrapper">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                        <div className="name-section">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="job-title">{this.props.values.occupation}</h2>
                        </div>
                    </div>
                    <div className="header-bottom">
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
                </header>

                <main className="cv40-main">
                    <div className="left-column">
                        <section className="profile-section section">
                            <div className="section-header">
                                <FaUserTie className="section-icon" />
                                <h3 className="section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="profile-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                            </div>
                        </section>

                        <section className="experience-section section">
                            <div className="section-header">
                                <FaBriefcase className="section-icon" />
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="experience-timeline">{this.returnEmployments()}</div>
                            </div>
                        </section>

                        <section className="education-section section">
                            <div className="section-header">
                                <FaGraduationCap className="section-icon" />
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="education-timeline">{this.returnEducations()}</div>
                            </div>
                        </section>
                    </div>

                    <div className="right-column">
                        <section className="skills-section section">
                            <div className="section-header">
                                <FaLaptopCode className="section-icon" />
                                <h3 className="section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="skills-grid">{this.returnSkills()}</div>
                            </div>
                        </section>

                        <section className="languages-section section">
                            <div className="section-header">
                                <FaGlobeAmericas className="section-icon" />
                                <h3 className="section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="section-content">
                                <div className="languages-list">{this.returnLanguages()}</div>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv40);
export default MyComponent;
