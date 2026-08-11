import React, { Component } from 'react';
import './Cv41.scss';
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
    FaBars,
    FaUser,
    FaStar,
    FaStarHalf,
    FaRegStar,
    FaCheckCircle,
    FaIdCard,
} from 'react-icons/fa';

class Cv41 extends Component {
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
            fluent: 5,
            advanced: 4,
            proficient: 3.5,
            intermediate: 3,
            elementary: 2,
            basic: 1.5,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const stars = levelStarMap[level] || 3;
            const starElements = [];

            // Create 5 stars with appropriate filled/half/empty state
            for (let i = 0; i < 5; i++) {
                if (i < Math.floor(stars)) {
                    // Full star
                    starElements.push(<FaStar key={i} className="star-icon filled" />);
                } else if (i < Math.floor(stars + 0.5)) {
                    // Half star
                    starElements.push(<FaStarHalf key={i} className="star-icon half" />);
                } else {
                    // Empty star
                    starElements.push(<FaRegStar key={i} className="star-icon empty" />);
                }
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-stars">{starElements}</div>
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
            const dashCount = Math.ceil(percentage / 10); // 1 dash per 10% skill

            const dashes = [];
            for (let i = 0; i < 10; i++) {
                dashes.push(<span key={i} className={`skill-dash ${i < dashCount ? 'active' : 'inactive'}`}></span>);
            }

            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-info">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <div className="skill-level">
                            <div className="skill-dashes">{dashes}</div>
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
                    <div className="item-header">
                        <div className="header-main">
                            <h3 className="item-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="item-company">{tempEmployments[index].employer}</div>
                        </div>
                        <div className="header-time">
                            <div className="time-badge">
                                <FaCalendarAlt className="time-icon" />
                                <span>
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="item-content">
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
                <div key={index} className="education-item">
                    <div className="item-header">
                        <div className="header-main">
                            <h3 className="item-title">{tempEducations[index].degree}</h3>
                            <div className="item-company">{tempEducations[index].school}</div>
                        </div>
                        <div className="header-time">
                            <div className="time-badge">
                                <FaCalendarAlt className="time-icon" />
                                <span>
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="item-content">
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
            <div id="resumen" className="cv41-board">
                <header className="cv41-header">
                    <div className="profile-container">
                        <div className="photo-wrapper">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                        <div className="name-block">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="profession">{this.props.values.occupation}</h2>
                        </div>
                    </div>

                    <div className="contact-container">
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

                <div className="cv41-main">
                    <div className="left-panel">
                        <div className="panel-content">
                            <section className="profile-section section">
                                <div className="section-header">
                                    <FaUser className="section-icon" />
                                    <h3 className="section-title">{t('resume.personalSummary')}</h3>
                                </div>
                                <div className="section-body">
                                    <div className="profile-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                                </div>
                            </section>

                            <section className="experience-section section">
                                <div className="section-header">
                                    <FaBriefcase className="section-icon" />
                                    <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                </div>
                                <div className="section-body">
                                    <div className="experience-list">{this.returnEmployments()}</div>
                                </div>
                            </section>

                            <section className="education-section section">
                                <div className="section-header">
                                    <FaGraduationCap className="section-icon" />
                                    <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                </div>
                                <div className="section-body">
                                    <div className="education-list">{this.returnEducations()}</div>
                                </div>
                            </section>
                        </div>
                    </div>

                    <div className="right-panel">
                        <div className="panel-content">
                            <section className="skills-section section">
                                <div className="section-header">
                                    <FaCheckCircle className="section-icon" />
                                    <h3 className="section-title">{t('resume.skills')}</h3>
                                </div>
                                <div className="section-body">
                                    <div className="skills-list">{this.returnSkills()}</div>
                                </div>
                            </section>

                            <section className="languages-section section">
                                <div className="section-header">
                                    <FaGlobeAmericas className="section-icon" />
                                    <h3 className="section-title">{t('resume.languages')}</h3>
                                </div>
                                <div className="section-body">
                                    <div className="languages-grid">{this.returnLanguages()}</div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv41);
export default MyComponent;
