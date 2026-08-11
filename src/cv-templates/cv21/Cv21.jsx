import React, { Component } from 'react';
import './Cv21.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';
import { IoMdSchool, IoMdBriefcase } from 'react-icons/io';
import { BsDot } from 'react-icons/bs';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv21 extends Component {
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
                <div className="cv21-experience-item" key={`employment-${index}`}>
                    <div className="cv21-experience-header">
                        <div className="cv21-title-company">
                            <h3 className="cv21-title">{tempEmployments[index].jobTitle}</h3>
                            <h4 className="cv21-company">{tempEmployments[index].employer}</h4>
                        </div>
                        <div className="cv21-date">
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <p className="cv21-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv21-education-item" key={`education-${index}`}>
                    <div className="cv21-education-header">
                        <div className="cv21-degree-school">
                            <h3 className="cv21-degree">{tempEducations[index].degree}</h3>
                            <h4 className="cv21-school">{tempEducations[index].school}</h4>
                        </div>
                        <div className="cv21-date">
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <p className="cv21-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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

            elements.push(
                <div className="cv21-skill-item" key={`skill-${index}`}>
                    <div className="cv21-skill-name">{tempSkills[index].name}</div>
                    <div className="cv21-skill-bar-container">
                        <div className="cv21-skill-bar" style={{ width: `${level}%` }}></div>
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
                <div className="cv21-language-item" key={`language-${index}`}>
                    <div className="cv21-language-name">{tempLanguages[index].name}</div>
                    <div className="cv21-language-level">{tempLanguages[index].level}</div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv21-container">
                <div className="cv21-header">
                    <div className="cv21-name-occupation">
                        <h1 className="cv21-name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="cv21-occupation">{this.props.values.occupation}</h2>
                    </div>

                    {this.props.values.photo && (
                        <div className="cv21-photo-container">
                            <img src={this.props.values.photo} alt="Profile" className="cv21-photo" />
                        </div>
                    )}
                </div>

                <div className="cv21-body">
                    <div className="cv21-main-column">
                        <div className="cv21-summary-section">
                            <div className="cv21-section-header">
                                <h3 className="cv21-section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="cv21-summary-content">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </div>

                        <div className="cv21-experience-section">
                            <div className="cv21-section-header">
                                <IoMdBriefcase className="cv21-section-icon" />
                                <h3 className="cv21-section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="cv21-experience-content">{this.returnEmployments()}</div>
                        </div>

                        <div className="cv21-education-section">
                            <div className="cv21-section-header">
                                <IoMdSchool className="cv21-section-icon" />
                                <h3 className="cv21-section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="cv21-education-content">{this.returnEducations()}</div>
                        </div>
                    </div>

                    <div className="cv21-sidebar">
                        <div className="cv21-contact-section">
                            <div className="cv21-section-header">
                                <h3 className="cv21-section-title">{t('resume.contact')}</h3>
                            </div>
                            <div className="cv21-contact-content">
                                <div className="cv21-contact-item">
                                    <FaPhoneAlt className="cv21-contact-icon" />
                                    <span>{this.props.values.phone}</span>
                                </div>
                                <div className="cv21-contact-item">
                                    <FaEnvelope className="cv21-contact-icon" />
                                    <span>{this.props.values.email}</span>
                                </div>
                                <div className="cv21-contact-item">
                                    <FaMapMarkerAlt className="cv21-contact-icon" />
                                    <span>
                                        {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                                    </span>
                                </div>
                                {this.props.values.linkedin && (
                                    <div className="cv21-contact-item">
                                        <FaLinkedin className="cv21-contact-icon" />
                                        <span>{this.props.values.linkedin}</span>
                                    </div>
                                )}
                                {this.props.values.github && (
                                    <div className="cv21-contact-item">
                                        <FaGithub className="cv21-contact-icon" />
                                        <span>{this.props.values.github}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="cv21-skills-section">
                            <div className="cv21-section-header">
                                <h3 className="cv21-section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="cv21-skills-content">{this.returnSkills()}</div>
                        </div>

                        <div className="cv21-languages-section">
                            <div className="cv21-section-header">
                                <h3 className="cv21-section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="cv21-languages-content">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv21);
export default MyComponent;
