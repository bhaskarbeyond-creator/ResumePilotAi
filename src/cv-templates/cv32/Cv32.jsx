import React, { Component } from 'react';
import './Cv32.scss';
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
    FaBuilding,
    FaUniversity,
} from 'react-icons/fa';

class Cv32 extends Component {
    constructor(props) {
        super(props);
        i18n.changeLanguage(this.props.language);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
    }

    getLevelPercentage(level) {
        switch (level.toLowerCase()) {
            case 'native':
            case 'fluent':
                return 100;
            case 'advanced':
            case 'proficient':
                return 85;
            case 'intermediate':
                return 65;
            case 'elementary':
            case 'basic':
                return 40;
            case 'beginner':
                return 25;
            default:
                return 50;
        }
    }

    returnLanguages() {
        var elements = [];
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempLanguages.length; index++) {
            const percentage = this.getLevelPercentage(tempLanguages[index].level);
            // We'll use 5 dots to represent skill level
            const activeDots = Math.round((percentage / 100) * 5);

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-info">
                        <div className="language-name">{tempLanguages[index].name}</div>
                        <div className="language-level">{tempLanguages[index].level}</div>
                    </div>
                    <div className="language-dots">
                        {[...Array(5)].map((_, i) => (
                            <span key={i} className={`dot ${i < activeDots ? 'active' : ''}`}></span>
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
            const percentage = tempSkills[index].rating;
            // Fixed number of dots (5) for consistency
            const activeDots = Math.round((percentage / 100) * 5);

            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-name">{tempSkills[index].name}</div>
                    <div className="skill-meter">
                        <div className="skill-percentage">{percentage}%</div>
                        <div className="skill-dots">
                            {[...Array(5)].map((_, i) => (
                                <span key={i} className={`dot ${i < activeDots ? 'active' : ''}`}></span>
                            ))}
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
                    <div className="experience-header">
                        <div className="job-title">{tempEmployments[index].jobTitle}</div>
                        <div className="company">
                            <FaBuilding className="icon" />
                            <span>{tempEmployments[index].employer}</span>
                        </div>
                        <div className="period">
                            <FaCalendarAlt className="icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="experience-content">
                        <p className="description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                        <div className="degree">{tempEducations[index].degree}</div>
                        <div className="school">
                            <FaUniversity className="icon" />
                            <span>{tempEducations[index].school}</span>
                        </div>
                        <div className="period">
                            <FaCalendarAlt className="icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="education-content">
                        <p className="description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv32-board">
                <div className="cv32-header">
                    <div className="header-left">
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
                    <div className="header-right">
                        <h1 className="name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="profession">{this.props.values.occupation}</h2>
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

                <div className="cv32-content">
                    <div className="content-left">
                        <div className="summary-section">
                            <h3 className="section-title">{t('resume.personalSummary')}</h3>
                            <div className="summary-content">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </div>

                        <div className="experience-section">
                            <h3 className="section-title">
                                <FaBriefcase className="title-icon" />
                                <span>{t('resume.employmentHistory')}</span>
                            </h3>
                            <div className="experience-list">{this.returnEmployments()}</div>
                        </div>

                        <div className="education-section">
                            <h3 className="section-title">
                                <FaGraduationCap className="title-icon" />
                                <span>{t('resume.educationHistory')}</span>
                            </h3>
                            <div className="education-list">{this.returnEducations()}</div>
                        </div>
                    </div>

                    <div className="content-right">
                        <div className="skills-section">
                            <h3 className="section-title">
                                <FaLaptopCode className="title-icon" />
                                <span>{t('resume.skills')}</span>
                            </h3>
                            <div className="skills-grid">{this.returnSkills()}</div>
                        </div>

                        <div className="languages-section">
                            <h3 className="section-title">
                                <FaGlobeAmericas className="title-icon" />
                                <span>{t('resume.languages')}</span>
                            </h3>
                            <div className="languages-list">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv32);
export default MyComponent;
