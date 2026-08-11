import React, { Component } from 'react';
import './Cv33.scss';
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
    FaStar,
    FaRegStar,
    FaQuoteLeft,
    FaQuoteRight,
} from 'react-icons/fa';

class Cv33 extends Component {
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
            const levelMap = {
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
            const stars = levelMap[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <div className="rating">{[...Array(5)].map((_, i) => (i < stars ? <FaStar key={i} className="star active" /> : <FaRegStar key={i} className="star" />))}</div>
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
            elements.push(
                <div key={index} className="skill-item">
                    <span className="skill-name">{tempSkills[index].name}</span>
                    <div className="skill-bar">
                        <div className="skill-progress" style={{ width: `${tempSkills[index].rating}%` }}></div>
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
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="timeline-period">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </div>
                        </div>
                        <div className="timeline-employer">{tempEmployments[index].employer}</div>
                        <p className="timeline-description">{tempEmployments[index].description}</p>
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
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                            <div className="timeline-period">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </div>
                        </div>
                        <div className="timeline-employer">{tempEducations[index].school}</div>
                        <p className="timeline-description">{tempEducations[index].description}</p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv33-board">
                <div className="cv33-header">
                    <div className="profile-info">
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="profession">{this.props.values.occupation}</h2>
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

                <div className="cv33-content">
                    <div className="content-main">
                        <section className="summary-section">
                            <div className="quote-marks">
                                <FaQuoteLeft className="quote-icon left" />
                                <FaQuoteRight className="quote-icon right" />
                            </div>
                            <p className="summary-text">{this.props.values.summary}</p>
                        </section>

                        <section className="experience-section">
                            <h2 className="section-title">
                                <FaBriefcase className="section-icon" />
                                <span>{t('resume.employmentHistory')}</span>
                            </h2>
                            <div className="timeline">{this.returnEmployments()}</div>
                        </section>

                        <section className="education-section">
                            <h2 className="section-title">
                                <FaGraduationCap className="section-icon" />
                                <span>{t('resume.educationHistory')}</span>
                            </h2>
                            <div className="timeline">{this.returnEducations()}</div>
                        </section>
                    </div>

                    <div className="content-sidebar">
                        <section className="contact-section">
                            <h2 className="sidebar-title">{t('resume.contact')}</h2>
                            <div className="contact-items">
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
                        </section>

                        <section className="skills-section">
                            <h2 className="sidebar-title">
                                <FaLaptopCode className="title-icon" />
                                <span>{t('resume.skills')}</span>
                            </h2>
                            <div className="skills-list">{this.returnSkills()}</div>
                        </section>

                        <section className="languages-section">
                            <h2 className="sidebar-title">
                                <FaGlobeAmericas className="title-icon" />
                                <span>{t('resume.languages')}</span>
                            </h2>
                            <div className="languages-list">{this.returnLanguages()}</div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv33);
export default MyComponent;
