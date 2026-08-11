import React, { Component } from 'react';
import './Cv23.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';
import { MdWork, MdSchool, MdPerson } from 'react-icons/md';
import { AiOutlineCodeSandbox } from 'react-icons/ai';
import { IoLanguageSharp } from 'react-icons/io5';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv23 extends Component {
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
                <div className="cv23-employment-item" key={`employment-${index}`}>
                    <div className="cv23-card">
                        <div className="cv23-card-header">
                            <div className="cv23-time-period">
                                <span>
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                            <div className="cv23-role-company">
                                <h3 className="cv23-role">{tempEmployments[index].jobTitle}</h3>
                                <h4 className="cv23-company">{tempEmployments[index].employer}</h4>
                            </div>
                        </div>
                        <div className="cv23-card-content">
                            <p dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
                        </div>
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
                <div className="cv23-education-item" key={`education-${index}`}>
                    <div className="cv23-card">
                        <div className="cv23-card-header">
                            <div className="cv23-time-period">
                                <span>
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                            <div className="cv23-degree-school">
                                <h3 className="cv23-degree">{tempEducations[index].degree}</h3>
                                <h4 className="cv23-school">{tempEducations[index].school}</h4>
                            </div>
                        </div>
                        <div className="cv23-card-content">
                            <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
            const level = parseInt(tempSkills[index].rating, 10);

            elements.push(
                <div className="cv23-skill-item" key={`skill-${index}`}>
                    <span className="cv23-skill-name" data-value={`${level}%`}>
                        {tempSkills[index].name}
                    </span>
                    <div className="cv23-skill-bar-container">
                        <div className="cv23-skill-bar" style={{ width: `${level}%` }}>
                            <span className="cv23-skill-percent">{level}%</span>
                        </div>
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
                <div className="cv23-language-tag" key={`language-${index}`}>
                    <span className="cv23-language-name">{tempLanguages[index].name}</span>
                    <span className="cv23-language-level">{tempLanguages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv23-container">
                <div className="cv23-header">
                    <div className="cv23-header-left">
                        <h1 className="cv23-name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="cv23-occupation">{this.props.values.occupation}</h2>
                    </div>
                    <div className="cv23-header-right">
                        {this.props.values.photo && (
                            <div className="cv23-photo-wrapper">
                                <img src={this.props.values.photo} alt="Profile" className="cv23-photo" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="cv23-grid">
                    <div className="cv23-contact-section">
                        <div className="cv23-section-header">
                            <MdPerson className="cv23-section-icon" />
                            <h3 className="cv23-section-title">{t('resume.contact')}</h3>
                        </div>
                        <div className="cv23-contact-grid">
                            <div className="cv23-contact-item">
                                <FaPhoneAlt className="cv23-contact-icon" />
                                <span>{this.props.values.phone}</span>
                            </div>
                            <div className="cv23-contact-item">
                                <FaEnvelope className="cv23-contact-icon" />
                                <span>{this.props.values.email}</span>
                            </div>
                            <div className="cv23-contact-item">
                                <FaMapMarkerAlt className="cv23-contact-icon" />
                                <span>
                                    {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                                </span>
                            </div>
                            {this.props.values.linkedin && (
                                <div className="cv23-contact-item">
                                    <FaLinkedin className="cv23-contact-icon" />
                                    <span>{this.props.values.linkedin}</span>
                                </div>
                            )}
                            {this.props.values.github && (
                                <div className="cv23-contact-item">
                                    <FaGithub className="cv23-contact-icon" />
                                    <span>{this.props.values.github}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="cv23-summary-section">
                        <div className="cv23-section-header">
                            <MdPerson className="cv23-section-icon" />
                            <h3 className="cv23-section-title">{t('resume.personalSummary')}</h3>
                        </div>
                        <div className="cv23-summary-content">
                            <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                        </div>
                    </div>

                    <div className="cv23-main-content">
                        <div className="cv23-experience-section">
                            <div className="cv23-section-header">
                                <MdWork className="cv23-section-icon" />
                                <h3 className="cv23-section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="cv23-employment-grid">{this.returnEmployments()}</div>
                        </div>

                        <div className="cv23-education-section">
                            <div className="cv23-section-header">
                                <MdSchool className="cv23-section-icon" />
                                <h3 className="cv23-section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="cv23-education-grid">{this.returnEducations()}</div>
                        </div>
                    </div>

                    <div className="cv23-additional-content">
                        <div className="cv23-skills-section">
                            <div className="cv23-section-header">
                                <AiOutlineCodeSandbox className="cv23-section-icon" />
                                <h3 className="cv23-section-title">{t('resume.skills')}</h3>
                            </div>
                            <div className="cv23-skills-content">{this.returnSkills()}</div>
                        </div>

                        <div className="cv23-languages-section">
                            <div className="cv23-section-header">
                                <IoLanguageSharp className="cv23-section-icon" />
                                <h3 className="cv23-section-title">{t('resume.languages')}</h3>
                            </div>
                            <div className="cv23-languages-container">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv23);
export default MyComponent;
