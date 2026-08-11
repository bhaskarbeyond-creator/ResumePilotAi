import React, { Component } from 'react';
import './Cv44.scss';
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
    FaFileAlt,
    FaCode,
    FaChevronRight,
    FaCircle,
    FaRegCircle,
    FaMedal,
    FaBuilding,
} from 'react-icons/fa';

class Cv44 extends Component {
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
            const numSegments = levelMap[level] || 3;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-header">
                        <span className="language-name">{tempLanguages[index].name}</span>
                        <span className="language-level">{tempLanguages[index].level}</span>
                    </div>
                    <div className="language-segments">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`segment ${i < numSegments ? 'filled' : ''}`}></div>
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
                    <div className="skill-header">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-percentage">{percentage}%</span>
                    </div>
                    <div className="skill-hexagons">
                        {[...Array(6)].map((_, i) => {
                            const threshold = i * 16.67; // 100% divided by 6 hexagons
                            return <div key={i} className={`hexagon ${percentage >= threshold ? 'filled' : ''}`}></div>;
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
                    <div className="experience-marker">
                        <div className="marker-line"></div>
                        <div className="marker-circle">
                            <FaBuilding className="marker-icon" />
                        </div>
                    </div>
                    <div className="experience-content">
                        <div className="experience-header">
                            <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="company-timeframe">
                                <span className="company-name">{tempEmployments[index].employer}</span>
                                <div className="timeframe">
                                    <FaCalendarAlt className="calendar-icon" />
                                    <span className="dates">
                                        {tempEmployments[index].begin} - {tempEmployments[index].end}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="experience-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></div>
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
                    <div className="education-marker">
                        <div className="marker-line"></div>
                        <div className="marker-circle">
                            <FaMedal className="marker-icon" />
                        </div>
                    </div>
                    <div className="education-content">
                        <div className="education-header">
                            <h3 className="degree">{tempEducations[index].degree}</h3>
                            <div className="school-timeframe">
                                <span className="school-name">{tempEducations[index].school}</span>
                                <div className="timeframe">
                                    <FaCalendarAlt className="calendar-icon" />
                                    <span className="dates">
                                        {tempEducations[index].started} - {tempEducations[index].finished}
                                    </span>
                                </div>
                            </div>
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
            <div id="resumen" className="cv44-board">
                <div className="cv44-sidebar">
                    <div className="photo-container">
                        {this.props.values.photo !== null ? (
                            <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                        ) : (
                            <div className="photo-placeholder">
                                <FaUserAlt className="placeholder-icon" />
                            </div>
                        )}
                    </div>

                    <div className="contact-section section">
                        <h2 className="section-title">{t('resume.contact')}</h2>
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
                    </div>

                    <div className="skills-section section">
                        <h2 className="section-title">{t('resume.skills')}</h2>
                        <div className="skills-list">{this.returnSkills()}</div>
                    </div>

                    <div className="languages-section section">
                        <h2 className="section-title">{t('resume.languages')}</h2>
                        <div className="languages-list">{this.returnLanguages()}</div>
                    </div>
                </div>

                <div className="cv44-main">
                    <div className="header">
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="title">{this.props.values.occupation}</h2>
                    </div>

                    <div className="summary-section section">
                        <div className="section-header">
                            <FaFileAlt className="section-icon" />
                            <h2 className="section-title">{t('resume.personalSummary')}</h2>
                        </div>
                        <div className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></div>
                    </div>

                    <div className="experience-section section">
                        <div className="section-header">
                            <FaBriefcase className="section-icon" />
                            <h2 className="section-title">{t('resume.employmentHistory')}</h2>
                        </div>
                        <div className="timeline">{this.returnEmployments()}</div>
                    </div>

                    <div className="education-section section">
                        <div className="section-header">
                            <FaGraduationCap className="section-icon" />
                            <h2 className="section-title">{t('resume.educationHistory')}</h2>
                        </div>
                        <div className="timeline">{this.returnEducations()}</div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv44);
export default MyComponent;
