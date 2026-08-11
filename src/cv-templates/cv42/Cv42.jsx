import React, { Component } from 'react';
import './Cv42.scss';
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
    FaUserTie,
    FaInfoCircle,
    FaCircle,
    FaRegCircle,
} from 'react-icons/fa';

class Cv42 extends Component {
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
            native: 100,
            fluent: 90,
            advanced: 80,
            proficient: 70,
            intermediate: 60,
            elementary: 40,
            basic: 30,
            beginner: 20,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const percentage = levelMap[level] || 50;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-progress-container">
                        <div className="language-progress" style={{ width: `${percentage}%` }}>
                            <span className="language-level">{tempLanguages[index].level}</span>
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
                    <div className="skill-info">
                        <div className="skill-name">{tempSkills[index].name}</div>
                        <div className="skill-percentage">{percentage}%</div>
                    </div>
                    <div className="skill-circle-container">
                        {[...Array(5)].map((_, i) => {
                            return (
                                <div key={i} className={`skill-circle ${percentage >= (i + 1) * 20 ? 'filled' : 'empty'}`}>
                                    {percentage >= (i + 1) * 20 ? <FaCircle /> : <FaRegCircle />}
                                </div>
                            );
                        })}
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
                    <div className="timeline-marker"></div>
                    <div className="item-content">
                        <div className="item-header">
                            <h3 className="item-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="item-company">{tempEmployments[index].employer}</div>
                            <div className="item-date">
                                <FaCalendarAlt className="date-icon" />
                                <span>
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                        <div className="item-description">
                            <div dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                    <div className="timeline-marker"></div>
                    <div className="item-content">
                        <div className="item-header">
                            <h3 className="item-title">{tempEducations[index].degree}</h3>
                            <div className="item-company">{tempEducations[index].school}</div>
                            <div className="item-date">
                                <FaCalendarAlt className="date-icon" />
                                <span>
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                        <div className="item-description">
                            <div dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
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
            <div id="resumen" className="cv42-board">
                <div className="diagonal-header">
                    <div className="profile-box">
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
                            <div className="title">{this.props.values.occupation}</div>
                        </div>
                    </div>

                    <div className="contact-info">
                        <div className="contact-row">
                            <div className="contact-item">
                                <FaPhone className="contact-icon" />
                                <span>{this.props.values.phone}</span>
                            </div>
                            <div className="contact-item">
                                <FaEnvelope className="contact-icon" />
                                <span>{this.props.values.email}</span>
                            </div>
                        </div>
                        <div className="contact-row">
                            <div className="contact-item">
                                <FaMapMarkerAlt className="contact-icon" />
                                <span>
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </span>
                            </div>
                        </div>
                        <div className="contact-row">
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

                <div className="cv42-main">
                    <div className="main-grid">
                        <div className="left-column">
                            <section className="profile-section">
                                <div className="section-header">
                                    <FaUserTie className="section-icon" />
                                    <h2 className="section-title">{t('resume.personalSummary')}</h2>
                                </div>
                                <div className="section-content">
                                    <div className="summary-quote">
                                        <FaQuoteLeft className="quote-icon" />
                                        <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                                    </div>
                                </div>
                            </section>

                            <section className="experience-section">
                                <div className="section-header">
                                    <FaBriefcase className="section-icon" />
                                    <h2 className="section-title">{t('resume.employmentHistory')}</h2>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEmployments()}</div>
                                </div>
                            </section>

                            <section className="education-section">
                                <div className="section-header">
                                    <FaGraduationCap className="section-icon" />
                                    <h2 className="section-title">{t('resume.educationHistory')}</h2>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEducations()}</div>
                                </div>
                            </section>
                        </div>

                        <div className="right-column">
                            <section className="skills-section">
                                <div className="section-header">
                                    <FaLaptopCode className="section-icon" />
                                    <h2 className="section-title">{t('resume.skills')}</h2>
                                </div>
                                <div className="section-content">
                                    <div className="skills-container">{this.returnSkills()}</div>
                                </div>
                            </section>

                            <section className="languages-section">
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
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv42);
export default MyComponent;
