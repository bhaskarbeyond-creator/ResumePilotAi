import React, { Component } from 'react';
import './Cv34.scss';
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
    FaBullseye,
    FaCheck,
    FaBuilding,
    FaUniversity,
} from 'react-icons/fa';

class Cv34 extends Component {
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
            const levelPercentMap = {
                native: 100,
                fluent: 90,
                advanced: 80,
                proficient: 75,
                intermediate: 60,
                elementary: 40,
                basic: 30,
                beginner: 20,
            };

            const level = tempLanguages[index].level.toLowerCase();
            const percentage = levelPercentMap[level] || 50;

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-header">
                        <div className="language-name">{tempLanguages[index].name}</div>
                        <div className="language-level">{tempLanguages[index].level}</div>
                    </div>
                    <div className="language-bar">
                        <div className="language-progress" style={{ width: `${percentage}%` }}></div>
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
                    <div className="skill-bullet">
                        <FaCheck className="check-icon" />
                    </div>
                    <div className="skill-content">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <div className="skill-rating">
                            <div className="skill-meter">
                                <div className="skill-progress" style={{ width: `${tempSkills[index].rating}%` }}></div>
                            </div>
                            <span className="skill-percentage">{tempSkills[index].rating}%</span>
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
                <div key={index} className="timeline-item">
                    <div className="timeline-icon">
                        <FaBuilding className="icon" />
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="timeline-company">{tempEmployments[index].employer}</div>
                        </div>
                        <div className="timeline-date">
                            <FaCalendarAlt className="date-icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <p className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                    <div className="timeline-icon">
                        <FaUniversity className="icon" />
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                            <div className="timeline-company">{tempEducations[index].school}</div>
                        </div>
                        <div className="timeline-date">
                            <FaCalendarAlt className="date-icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <p className="timeline-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv34-board">
                <div className="cv34-header">
                    <div className="header-main">
                        <div className="name-container">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <div className="occupation">{this.props.values.occupation}</div>
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
                    <div className="contact-container">
                        <div className="contact-item">
                            <div className="contact-icon">
                                <FaPhone />
                            </div>
                            <div className="contact-text">{this.props.values.phone}</div>
                        </div>
                        <div className="contact-item">
                            <div className="contact-icon">
                                <FaEnvelope />
                            </div>
                            <div className="contact-text">{this.props.values.email}</div>
                        </div>
                        <div className="contact-item">
                            <div className="contact-icon">
                                <FaMapMarkerAlt />
                            </div>
                            <div className="contact-text">
                                {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                            </div>
                        </div>
                        {this.props.values.linkedin && (
                            <div className="contact-item">
                                <div className="contact-icon">
                                    <FaLinkedin />
                                </div>
                                <div className="contact-text">{this.props.values.linkedin}</div>
                            </div>
                        )}
                        {this.props.values.github && (
                            <div className="contact-item">
                                <div className="contact-icon">
                                    <FaGithub />
                                </div>
                                <div className="contact-text">{this.props.values.github}</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="cv34-content">
                    <div className="main-column">
                        <section className="profile-section">
                            <div className="section-header">
                                <div className="section-icon">
                                    <FaBullseye />
                                </div>
                                <h2 className="section-title">{t('resume.personalSummary')}</h2>
                            </div>
                            <div className="section-content">
                                <p className="profile-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </section>

                        <section className="experience-section">
                            <div className="section-header">
                                <div className="section-icon">
                                    <FaBriefcase />
                                </div>
                                <h2 className="section-title">{t('resume.employmentHistory')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="timeline">{this.returnEmployments()}</div>
                            </div>
                        </section>

                        <section className="education-section">
                            <div className="section-header">
                                <div className="section-icon">
                                    <FaGraduationCap />
                                </div>
                                <h2 className="section-title">{t('resume.educationHistory')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="timeline">{this.returnEducations()}</div>
                            </div>
                        </section>
                    </div>

                    <div className="side-column">
                        <section className="skills-section">
                            <div className="section-header">
                                <div className="section-icon">
                                    <FaLaptopCode />
                                </div>
                                <h2 className="section-title">{t('resume.skills')}</h2>
                            </div>
                            <div className="section-content">
                                <div className="skills-list">{this.returnSkills()}</div>
                            </div>
                        </section>

                        <section className="languages-section">
                            <div className="section-header">
                                <div className="section-icon">
                                    <FaGlobeAmericas />
                                </div>
                                <h2 className="section-title">{t('resume.languages')}</h2>
                            </div>
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

const MyComponent = withTranslation('common')(Cv34);
export default MyComponent;
