import React, { Component } from 'react';
import './Cv31.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaGlobeAmericas, FaUserTie, FaLinkedin, FaGithub, FaBriefcase, FaGraduationCap, FaLaptopCode, FaCircle } from 'react-icons/fa';

class Cv31 extends Component {
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
                return '100%';
            case 'advanced':
            case 'proficient':
                return '85%';
            case 'intermediate':
                return '65%';
            case 'elementary':
            case 'basic':
                return '40%';
            case 'beginner':
                return '25%';
            default:
                return '50%';
        }
    }

    returnLanguages() {
        var elements = [];
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempLanguages.length; index++) {
            const levelIndex = ['beginner', 'basic', 'elementary', 'intermediate', 'advanced', 'proficient', 'fluent', 'native'].indexOf(tempLanguages[index].level.toLowerCase());
            const levelCount = Math.max(1, Math.min(5, Math.ceil(((levelIndex + 1) * 5) / 8)));

            elements.push(
                <div key={index} className="language-card">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level-container">
                        <div className="language-level">{tempLanguages[index].level}</div>
                        <div className="level-dots">
                            {[...Array(5)].map((_, i) => (
                                <span key={i} className={`dot ${i < levelCount ? 'active' : ''}`}></span>
                            ))}
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
            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-info">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-percentage">{tempSkills[index].rating}%</span>
                    </div>
                    <div className="skill-bar-container">
                        <div className="skill-bar">
                            <div className="skill-progress" style={{ width: tempSkills[index].rating + '%' }}></div>
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
            return a.date - b.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-dot">
                        <FaCircle className="dot-icon" />
                    </div>
                    <div className="timeline-date">
                        <span>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </span>
                    </div>
                    <div className="timeline-content">
                        <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="company-name">{tempEmployments[index].employer}</div>
                        <p className="job-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnEducations() {
        var elements = [];
        var tempEducations = this.props.values.educations.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempEducations.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-dot">
                        <FaCircle className="dot-icon" />
                    </div>
                    <div className="timeline-date">
                        <span>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </span>
                    </div>
                    <div className="timeline-content">
                        <h3 className="degree">{tempEducations[index].degree}</h3>
                        <div className="school-name">{tempEducations[index].school}</div>
                        <p className="education-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv31-board">
                <div className="cv31-content">
                    <div className="cv31-sidebar">
                        <div className="profile-section">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserTie className="placeholder-icon" />
                                    </div>
                                )}
                            </div>
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="title">{this.props.values.occupation}</h2>
                        </div>

                        <div className="contact-section">
                            <h3 className="sidebar-title">{t('resume.contact')}</h3>
                            <div className="contact-list">
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

                        <div className="skills-section">
                            <h3 className="sidebar-title">
                                <FaLaptopCode className="section-icon" />
                                <span>{t('resume.skills')}</span>
                            </h3>
                            <div className="skills-container">{this.returnSkills()}</div>
                        </div>

                        <div className="languages-section">
                            <h3 className="sidebar-title">
                                <FaGlobeAmericas className="section-icon" />
                                <span>{t('resume.languages')}</span>
                            </h3>
                            <div className="languages-container">{this.returnLanguages()}</div>
                        </div>
                    </div>

                    <div className="cv31-main">
                        <section className="summary-section">
                            <h2 className="main-title">{t('resume.personalSummary')}</h2>
                            <div className="section-content">
                                <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </section>

                        <section className="experience-section">
                            <h2 className="main-title">
                                <FaBriefcase className="title-icon" />
                                <span>{t('resume.employmentHistory')}</span>
                            </h2>
                            <div className="timeline">{this.returnEmployments()}</div>
                        </section>

                        <section className="education-section">
                            <h2 className="main-title">
                                <FaGraduationCap className="title-icon" />
                                <span>{t('resume.educationHistory')}</span>
                            </h2>
                            <div className="timeline">{this.returnEducations()}</div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv31);
export default MyComponent;
