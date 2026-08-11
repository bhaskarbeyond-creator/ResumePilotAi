import React, { Component } from 'react';
import './Cv30.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaGlobeAmericas, FaUserTie, FaLinkedin, FaGithub, FaBriefcase, FaGraduationCap, FaRegCalendarAlt } from 'react-icons/fa';

class Cv30 extends Component {
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
            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <div className="level-bar">
                            <div className="level-fill" style={{ width: this.getLevelPercentage(tempLanguages[index].level) }} data-level={tempLanguages[index].level}></div>
                        </div>
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
                    <div className="skill-header">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-rating">{tempSkills[index].rating}%</span>
                    </div>
                    <div className="skill-bar">
                        <div className="skill-progress" style={{ width: tempSkills[index].rating + '%' }}></div>
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
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="job-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="timeline-period">
                                <FaRegCalendarAlt className="period-icon" />
                                <span>
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                        <div className="employer">{tempEmployments[index].employer}</div>
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
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="degree">{tempEducations[index].degree}</h3>
                            <div className="timeline-period">
                                <FaRegCalendarAlt className="period-icon" />
                                <span>
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                        <div className="school">{tempEducations[index].school}</div>
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
            <div id="resumen" className="cv30-board">
                <div className="cv30-content">
                    <header className="cv30-header">
                        <div className="header-main">
                            <div className="profile-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserTie className="placeholder-icon" />
                                    </div>
                                )}
                            </div>
                            <div className="name-title">
                                <h1 className="name">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2 className="title">{this.props.values.occupation}</h2>
                            </div>
                        </div>
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
                    </header>

                    <main className="cv30-body">
                        <div className="main-column">
                            <section className="profile-section">
                                <h2 className="section-title">{t('resume.personalSummary')}</h2>
                                <div className="section-content">
                                    <p className="profile-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                                </div>
                            </section>

                            <section className="experience-section">
                                <h2 className="section-title">
                                    <FaBriefcase className="title-icon" />
                                    <span>{t('resume.employmentHistory')}</span>
                                </h2>
                                <div className="section-content">
                                    <div className="timeline">{this.returnEmployments()}</div>
                                </div>
                            </section>

                            <section className="education-section">
                                <h2 className="section-title">
                                    <FaGraduationCap className="title-icon" />
                                    <span>{t('resume.educationHistory')}</span>
                                </h2>
                                <div className="section-content">
                                    <div className="timeline">{this.returnEducations()}</div>
                                </div>
                            </section>
                        </div>

                        <div className="side-column">
                            <section className="skills-section">
                                <h2 className="section-title">{t('resume.skills')}</h2>
                                <div className="section-content">
                                    <div className="skills-container">{this.returnSkills()}</div>
                                </div>
                            </section>

                            <section className="languages-section">
                                <h2 className="section-title">
                                    <FaGlobeAmericas className="title-icon" />
                                    <span>{t('resume.languages')}</span>
                                </h2>
                                <div className="section-content">
                                    <div className="languages-container">{this.returnLanguages()}</div>
                                </div>
                            </section>
                        </div>
                    </main>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv30);
export default MyComponent;
