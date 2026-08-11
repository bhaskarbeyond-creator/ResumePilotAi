import React, { Component } from 'react';
import './Cv20.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';
import { BsCircleFill } from 'react-icons/bs';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv20 extends Component {
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
                <div className="cv20-experience-item" key={`employment-${index}`}>
                    <div className="cv20-timeline-marker"></div>
                    <div className="cv20-content-wrapper">
                        <h3 className="cv20-job-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="cv20-employer-row">
                            <h4 className="cv20-employer">{tempEmployments[index].employer}</h4>
                            <span className="cv20-date">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <p className="cv20-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv20-education-item" key={`education-${index}`}>
                    <div className="cv20-timeline-marker"></div>
                    <div className="cv20-content-wrapper">
                        <h3 className="cv20-degree">{tempEducations[index].degree}</h3>
                        <div className="cv20-school-row">
                            <h4 className="cv20-school">{tempEducations[index].school}</h4>
                            <span className="cv20-date">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <p className="cv20-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
            const level = parseInt(tempSkills[index].rating, 10);
            const dots = [];

            for (let i = 0; i < 5; i++) {
                const filled = i < Math.round(level / 20);
                dots.push(
                    <div key={`skill-dot-${index}-${i}`} className={`cv20-skill-dot ${filled ? 'filled' : ''}`}>
                        <BsCircleFill />
                    </div>
                );
            }

            elements.push(
                <div className="cv20-skill-item" key={`skill-${index}`}>
                    <span className="cv20-skill-name">{tempSkills[index].name}</span>
                    <div className="cv20-skill-dots">{dots}</div>
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
                <div className="cv20-language-item" key={`language-${index}`}>
                    <span className="cv20-language-name">{tempLanguages[index].name}</span>
                    <span className="cv20-language-level">{tempLanguages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv20-container">
                <div className="cv20-header">
                    <div className="cv20-profile-section">
                        <div className="cv20-photo-container">
                            {this.props.values.photo !== null ? <img alt="profile" src={this.props.values.photo} className="cv20-photo" /> : <div className="cv20-photo-placeholder">Photo</div>}
                        </div>
                        <div className="cv20-name-title">
                            <h1 className="cv20-fullname">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="cv20-occupation">{this.props.values.occupation}</h2>
                        </div>
                    </div>
                </div>

                <div className="cv20-body">
                    <div className="cv20-left-column">
                        <div className="cv20-contact-section">
                            <h3 className="cv20-section-title">{t('resume.contact')}</h3>
                            <div className="cv20-contact-items">
                                <div className="cv20-contact-item">
                                    <FaPhoneAlt className="cv20-contact-icon" />
                                    <span>{this.props.values.phone}</span>
                                </div>
                                <div className="cv20-contact-item">
                                    <FaEnvelope className="cv20-contact-icon" />
                                    <span>{this.props.values.email}</span>
                                </div>
                                <div className="cv20-contact-item">
                                    <FaMapMarkerAlt className="cv20-contact-icon" />
                                    <span>
                                        {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                                    </span>
                                </div>
                                {this.props.values.linkedin && (
                                    <div className="cv20-contact-item">
                                        <FaLinkedin className="cv20-contact-icon" />
                                        <span>{this.props.values.linkedin}</span>
                                    </div>
                                )}
                                {this.props.values.github && (
                                    <div className="cv20-contact-item">
                                        <FaGithub className="cv20-contact-icon" />
                                        <span>{this.props.values.github}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="cv20-skills-section">
                            <h3 className="cv20-section-title">{t('resume.skills')}</h3>
                            <div className="cv20-skills-content">{this.returnSkills()}</div>
                        </div>

                        <div className="cv20-languages-section">
                            <h3 className="cv20-section-title">{t('resume.languages')}</h3>
                            <div className="cv20-languages-content">{this.returnLanguages()}</div>
                        </div>
                    </div>

                    <div className="cv20-right-column">
                        <div className="cv20-summary-section">
                            <h3 className="cv20-section-title">{t('resume.personalSummary')}</h3>
                            <div className="cv20-summary-content">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </div>

                        <div className="cv20-experience-section">
                            <h3 className="cv20-section-title">{t('resume.employmentHistory')}</h3>
                            <div className="cv20-experience-content">{this.returnEmployments()}</div>
                        </div>

                        <div className="cv20-education-section">
                            <h3 className="cv20-section-title">{t('resume.educationHistory')}</h3>
                            <div className="cv20-education-content">{this.returnEducations()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv20);
export default MyComponent;
