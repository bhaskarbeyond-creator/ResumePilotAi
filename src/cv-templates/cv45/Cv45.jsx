import React, { Component } from 'react';
import './Cv45.scss';
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
    FaUser,
    FaStar,
    FaRegStar,
    FaAward,
} from 'react-icons/fa';

class Cv45 extends Component {
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

        const levelStarMap = {
            native: 5,
            fluent: 4.5,
            advanced: 4,
            proficient: 3.5,
            intermediate: 3,
            elementary: 2,
            basic: 1.5,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const numStars = levelStarMap[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <span className="language-name">{tempLanguages[index].name}</span>
                    <div className="star-rating">
                        {[...Array(5)].map((_, i) => (
                            <FaStar key={i} className={`star ${i < numStars ? 'filled' : 'empty'}`} />
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
                    <FaAward className="skill-icon" />
                    <span className="skill-name">{tempSkills[index].name}</span>
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
                            <h3 className="item-title">{tempEmployments[index].jobTitle}</h3>
                            <span className="item-company">{tempEmployments[index].employer}</span>
                            <span className="item-date">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <div className="item-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                            <h3 className="item-title">{tempEducations[index].degree}</h3>
                            <span className="item-school">{tempEducations[index].school}</span>
                            <span className="item-date">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <div className="item-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv45-board">
                <div className="cv45-header">
                    <div className="header-top">
                        <div className="name-container">
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
                </div>

                <div className="cv45-main">
                    <div className="left-column">
                        <section className="profile-section section">
                            <h2 className="section-title">
                                <FaUser className="section-icon" />
                                {t('resume.personalSummary')}
                            </h2>
                            <div className="section-content">
                                <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                            </div>
                        </section>

                        <section className="experience-section section">
                            <h2 className="section-title">
                                <FaBriefcase className="section-icon" />
                                {t('resume.employmentHistory')}
                            </h2>
                            <div className="section-content">
                                <div className="timeline">{this.returnEmployments()}</div>
                            </div>
                        </section>

                        <section className="education-section section">
                            <h2 className="section-title">
                                <FaGraduationCap className="section-icon" />
                                {t('resume.educationHistory')}
                            </h2>
                            <div className="section-content">
                                <div className="timeline">{this.returnEducations()}</div>
                            </div>
                        </section>
                    </div>

                    <div className="right-column">
                        <section className="skills-section section">
                            <h2 className="section-title">
                                <FaLaptopCode className="section-icon" />
                                {t('resume.skills')}
                            </h2>
                            <div className="section-content">
                                <div className="skills-list">{this.returnSkills()}</div>
                            </div>
                        </section>

                        <section className="languages-section section">
                            <h2 className="section-title">
                                <FaGlobeAmericas className="section-icon" />
                                {t('resume.languages')}
                            </h2>
                            <div className="section-content">
                                <div className="languages-list">{this.returnLanguages()}</div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv45);
export default MyComponent;
