import React, { Component } from 'react';
import './Cv50.scss';
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
    FaTools,
    FaCalendarAlt,
    FaUser,
    FaQuoteRight,
    FaCode,
    FaLanguage,
    FaLink,
    FaBullseye,
    FaAngleRight,
    FaBuilding,
    FaUniversity,
} from 'react-icons/fa';

class Cv50 extends Component {
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
            const level = tempLanguages[index].level.toLowerCase();
            let dots = [];
            let totalDots = 5;
            let filledDots = 0;

            // Determine filled dots based on language level
            switch (level) {
                case 'native':
                    filledDots = 5;
                    break;
                case 'fluent':
                    filledDots = 5;
                    break;
                case 'advanced':
                    filledDots = 4;
                    break;
                case 'proficient':
                    filledDots = 4;
                    break;
                case 'intermediate':
                    filledDots = 3;
                    break;
                case 'elementary':
                    filledDots = 2;
                    break;
                case 'basic':
                    filledDots = 1;
                    break;
                case 'beginner':
                    filledDots = 1;
                    break;
                default:
                    filledDots = 3;
            }

            // Create the dots indicators
            for (let i = 0; i < totalDots; i++) {
                dots.push(<div key={i} className={`language-dot ${i < filledDots ? 'filled' : ''}`} />);
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-header">
                        <h4 className="language-name">{tempLanguages[index].name}</h4>
                        <span className="language-level">{tempLanguages[index].level}</span>
                    </div>
                    <div className="language-proficiency">{dots}</div>
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

        // Group skills by category (or use "Other" if no category)
        const skillsByCategory = {};
        tempSkills.forEach((skill) => {
            const category = skill.category || 'Other';
            if (!skillsByCategory[category]) {
                skillsByCategory[category] = [];
            }
            skillsByCategory[category].push(skill);
        });

        // Create UI elements by category
        Object.keys(skillsByCategory).forEach((category) => {
            elements.push(
                <div key={category} className="skill-category">
                    {category !== 'Other' && <h4 className="category-title">{category}</h4>}
                    <div className="skill-grid">
                        {skillsByCategory[category].map((skill, idx) => {
                            const level = skill.level || 'intermediate';
                            let levelValue = 50;

                            switch (level.toLowerCase()) {
                                case 'expert':
                                    levelValue = 100;
                                    break;
                                case 'advanced':
                                    levelValue = 85;
                                    break;
                                case 'intermediate':
                                    levelValue = 60;
                                    break;
                                case 'basic':
                                    levelValue = 40;
                                    break;
                                case 'beginner':
                                    levelValue = 25;
                                    break;
                                default:
                                    levelValue = 50;
                            }

                            return (
                                <div key={idx} className="skill-item">
                                    <div className="skill-info">
                                        <span className="skill-name">{skill.name}</span>
                                        <span className="skill-level-text">{level}</span>
                                    </div>
                                    <div className="skill-bar-container">
                                        <div className="skill-bar" style={{ width: `${levelValue}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        });

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
                    <div className="timeline-marker">
                        <FaBriefcase className="marker-icon" />
                    </div>

                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="timeline-period">
                                <FaCalendarAlt className="period-icon" />
                                <span className="period-text">
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>

                        <div className="timeline-employer">
                            <FaBuilding className="employer-icon" />
                            <span className="employer-name">{tempEmployments[index].employer}</span>
                        </div>

                        <div className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                    <div className="timeline-marker">
                        <FaGraduationCap className="marker-icon" />
                    </div>

                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                            <div className="timeline-period">
                                <FaCalendarAlt className="period-icon" />
                                <span className="period-text">
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>

                        <div className="timeline-employer">
                            <FaUniversity className="employer-icon" />
                            <span className="employer-name">{tempEducations[index].school}</span>
                        </div>

                        <div className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv50-board">
                <div className="cv50-header">
                    <div className="header-content">
                        <div className="profile-section">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserAlt />
                                    </div>
                                )}
                            </div>
                            <div className="name-title">
                                <h1 className="name">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2 className="profession">{this.props.values.occupation}</h2>
                            </div>
                        </div>

                        <div className="contact-grid">
                            {this.props.values.phone && (
                                <div className="contact-item">
                                    <FaPhone className="contact-icon" />
                                    <span className="contact-text">{this.props.values.phone}</span>
                                </div>
                            )}

                            {this.props.values.email && (
                                <div className="contact-item">
                                    <FaEnvelope className="contact-icon" />
                                    <span className="contact-text">{this.props.values.email}</span>
                                </div>
                            )}

                            {this.props.values.address && (
                                <div className="contact-item">
                                    <FaMapMarkerAlt className="contact-icon" />
                                    <span className="contact-text">
                                        {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                    </span>
                                </div>
                            )}

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

                <div className="cv50-main">
                    <div className="main-content">
                        <div className="left-column">
                            <div className="section summary-section">
                                <div className="section-header">
                                    <div className="section-icon-container">
                                        <FaUser className="section-icon" />
                                    </div>
                                    <h3 className="section-title">{t('resume.personalSummary')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="summary-container">
                                        <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                                    </div>
                                </div>
                            </div>

                            <div className="section experience-section">
                                <div className="section-header">
                                    <div className="section-icon-container">
                                        <FaBriefcase className="section-icon" />
                                    </div>
                                    <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEmployments()}</div>
                                </div>
                            </div>

                            <div className="section education-section">
                                <div className="section-header">
                                    <div className="section-icon-container">
                                        <FaGraduationCap className="section-icon" />
                                    </div>
                                    <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="timeline-container">{this.returnEducations()}</div>
                                </div>
                            </div>
                        </div>

                        <div className="right-column">
                            <div className="section skills-section">
                                <div className="section-header">
                                    <div className="section-icon-container">
                                        <FaCode className="section-icon" />
                                    </div>
                                    <h3 className="section-title">{t('resume.skills')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="skills-container">{this.returnSkills()}</div>
                                </div>
                            </div>

                            <div className="section languages-section">
                                <div className="section-header">
                                    <div className="section-icon-container">
                                        <FaLanguage className="section-icon" />
                                    </div>
                                    <h3 className="section-title">{t('resume.languages')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="languages-container">{this.returnLanguages()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default withTranslation('common')(Cv50);
