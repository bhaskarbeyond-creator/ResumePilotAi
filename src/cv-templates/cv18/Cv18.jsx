import React, { Component } from 'react';
import './cv18.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaUserAlt, FaBriefcase, FaGraduationCap, FaLanguage, FaCogs } from 'react-icons/fa';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv18 extends Component {
    constructor(props) {
        super(props);

        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = this.props.values.employments.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div className="cv18-experience-item" key={`employment-${index}`}>
                    <div className="cv18-experience-header">
                        <div className="cv18-time-period">
                            <span>{tempEmployments[index].begin}</span>
                            <span className="cv18-separator">–</span>
                            <span>{tempEmployments[index].end}</span>
                        </div>
                        <div className="cv18-experience-title">
                            <h3>{tempEmployments[index].jobTitle}</h3>
                            <h4>{tempEmployments[index].employer}</h4>
                        </div>
                    </div>
                    <div className="cv18-experience-content">
                        <p dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv18-education-item" key={`education-${index}`}>
                    <div className="cv18-education-header">
                        <div className="cv18-time-period">
                            <span>{tempEducations[index].started}</span>
                            <span className="cv18-separator">–</span>
                            <span>{tempEducations[index].finished}</span>
                        </div>
                        <div className="cv18-education-title">
                            <h3>{tempEducations[index].degree}</h3>
                            <h4>{tempEducations[index].school}</h4>
                        </div>
                    </div>
                    <div className="cv18-education-content">
                        <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
                <div className="cv18-skill-item" key={`skill-${index}`}>
                    <div className="cv18-skill-info">
                        <span className="cv18-skill-name">{tempSkills[index].name}</span>
                        <span className="cv18-skill-level">{tempSkills[index].rating}%</span>
                    </div>
                    <div className="cv18-skill-bar">
                        <div className="cv18-skill-progress" style={{ width: `${tempSkills[index].rating}%` }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnLanguages() {
        var elements = [];
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempLanguages.length; index++) {
            elements.push(
                <div className="cv18-language-item" key={`language-${index}`}>
                    <div className="cv18-language-name">{tempLanguages[index].name}</div>
                    <div className="cv18-language-level-badge">{tempLanguages[index].level}</div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv18-container">
                <div className="cv18-accent-bar"></div>

                <div className="cv18-header">
                    <div className="cv18-header-left">
                        <h1 className="cv18-name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="cv18-occupation">{this.props.values.occupation}</h2>
                    </div>
                    <div className="cv18-header-right">
                        {this.props.values.photo !== null ? (
                            <img className="cv18-photo" src={this.props.values.photo} alt="Profile" />
                        ) : (
                            <div className="cv18-photo-placeholder">
                                <FaUserAlt />
                            </div>
                        )}
                    </div>
                </div>

                <div className="cv18-two-column">
                    <div className="cv18-main-column">
                        <div className="cv18-section">
                            <div className="cv18-section-header">
                                <FaUserAlt className="cv18-section-icon" />
                                <h3 className="cv18-section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="cv18-summary">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </div>

                        <div className="cv18-section">
                            <div className="cv18-section-header">
                                <FaBriefcase className="cv18-section-icon" />
                                <h3 className="cv18-section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="cv18-experience">{this.returnEmployments()}</div>
                        </div>

                        <div className="cv18-section">
                            <div className="cv18-section-header">
                                <FaGraduationCap className="cv18-section-icon" />
                                <h3 className="cv18-section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="cv18-education">{this.returnEducations()}</div>
                        </div>
                    </div>

                    <div className="cv18-side-column">
                        <div className="cv18-contact-info">
                            <div className="cv18-contact-item">
                                <div className="cv18-contact-icon">
                                    <FaPhoneAlt />
                                </div>
                                <div className="cv18-contact-text">{this.props.values.phone}</div>
                            </div>
                            <div className="cv18-contact-item">
                                <div className="cv18-contact-icon">
                                    <FaEnvelope />
                                </div>
                                <div className="cv18-contact-text">{this.props.values.email}</div>
                            </div>
                            <div className="cv18-contact-item">
                                <div className="cv18-contact-icon">
                                    <FaMapMarkerAlt />
                                </div>
                                <div className="cv18-contact-text">
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </div>
                            </div>
                        </div>

                        <div className="cv18-side-section">
                            <div className="cv18-section-header">
                                <FaCogs className="cv18-section-icon" />
                                <h3 className="cv18-section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="cv18-skills">{this.returnSkills()}</div>
                        </div>

                        <div className="cv18-side-section">
                            <div className="cv18-section-header">
                                <FaLanguage className="cv18-section-icon" />
                                <h3 className="cv18-section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="cv18-languages">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv18);
export default MyComponent;
