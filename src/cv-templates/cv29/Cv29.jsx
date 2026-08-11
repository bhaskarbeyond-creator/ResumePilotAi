import React, { Component } from 'react';
import './Cv29.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaGlobeAmericas, FaTools, FaUserTie, FaRegCalendarAlt } from 'react-icons/fa';

class Cv29 extends Component {
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
            elements.push(
                <div key={index} className="language-item">
                    <div className="language-info">
                        <span className="language-name">{tempLanguages[index].name}</span>
                    </div>
                    <div className="language-level-wrapper">
                        <div className="language-level">
                            <div className="language-bar" data-level={tempLanguages[index].level}>
                                <div className="language-progress" style={{ width: this.getLevelPercentage(tempLanguages[index].level) }}></div>
                            </div>
                            <span className="level-text">{tempLanguages[index].level}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
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

    returnSkills() {
        var elements = [];
        var tempSkills = this.props.values.skills.sort(function (a, b) {
            return a.date - b.date;
        });
        for (let index = 0; index < tempSkills.length; index++) {
            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-name">{tempSkills[index].name}</div>
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
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                        <div className="timeline-date">
                            <FaRegCalendarAlt className="date-icon" />
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                        <h4 className="timeline-company">{tempEmployments[index].employer}</h4>
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
            return a.date - b.date;
        });

        for (let index = 0; index < tempEducations.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                        <div className="timeline-date">
                            <FaRegCalendarAlt className="date-icon" />
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                        <h4 className="timeline-company">{tempEducations[index].school}</h4>
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
            <div id="resumen" className="cv29-board">
                <div className="cv29-content">
                    <header className="cv29-header">
                        <div className="accent-bg"></div>
                        <div className="name-title-container">
                            <h1 className="name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="occupation">{this.props.values.occupation}</h2>
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
                    </header>

                    <div className="cv29-body">
                        <div className="main-column">
                            <section className="summary-section">
                                <h3 className="section-title">{t('resume.personalSummary')}</h3>
                                <p className="summary-text" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </section>

                            <section className="experience-section">
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                <div className="timeline">{this.returnEmployments()}</div>
                            </section>

                            <section className="education-section">
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                <div className="timeline">{this.returnEducations()}</div>
                            </section>
                        </div>

                        <div className="side-column">
                            <section className="contact-section">
                                <h3 className="side-section-title">{t('resume.contact')}</h3>
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
                                </div>
                            </section>

                            <section className="skills-section">
                                <h3 className="side-section-title">
                                    <FaTools className="section-icon" />
                                    <span>{t('resume.skills')}</span>
                                </h3>
                                <div className="skills-list">{this.returnSkills()}</div>
                            </section>

                            <section className="languages-section">
                                <h3 className="side-section-title">
                                    <FaGlobeAmericas className="section-icon" />
                                    <span>{t('resume.languages')}</span>
                                </h3>
                                <div className="languages-list">{this.returnLanguages()}</div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv29);
export default MyComponent;
