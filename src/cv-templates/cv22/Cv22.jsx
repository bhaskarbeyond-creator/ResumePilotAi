import React, { Component } from 'react';
import './Cv22.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';
import { RiProfileLine, RiBriefcase4Line } from 'react-icons/ri';
import { IoLanguage } from 'react-icons/io5';
import { BiChip } from 'react-icons/bi';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv22 extends Component {
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
                <div className="cv22-experience-item" key={`employment-${index}`}>
                    <div className="cv22-timeframe">
                        <span>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </span>
                    </div>
                    <div className="cv22-content">
                        <h3 className="cv22-title">{tempEmployments[index].jobTitle}</h3>
                        <div className="cv22-subtitle">{tempEmployments[index].employer}</div>
                        <p className="cv22-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv22-education-item" key={`education-${index}`}>
                    <div className="cv22-timeframe">
                        <span>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </span>
                    </div>
                    <div className="cv22-content">
                        <h3 className="cv22-title">{tempEducations[index].degree}</h3>
                        <div className="cv22-subtitle">{tempEducations[index].school}</div>
                        <p className="cv22-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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

            // Create circular skill indicators
            const circles = [];
            for (let i = 0; i < 5; i++) {
                circles.push(<div key={`skill-circle-${index}-${i}`} className={`cv22-skill-circle ${i < Math.round(level / 20) ? 'filled' : ''}`}></div>);
            }

            elements.push(
                <div className="cv22-skill-item" key={`skill-${index}`}>
                    <span className="cv22-skill-name">{tempSkills[index].name}</span>
                    <div className="cv22-skill-level">{circles}</div>
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
                <div className="cv22-language-item" key={`language-${index}`}>
                    <span className="cv22-language-name">{tempLanguages[index].name}</span>
                    <span className="cv22-language-level">{tempLanguages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv22-container">
                <div className="cv22-sidebar">
                    <div className="cv22-photo-section">
                        {this.props.values.photo && (
                            <div className="cv22-photo-container">
                                <img src={this.props.values.photo} alt="Profile" className="cv22-photo" />
                            </div>
                        )}
                        <div className="cv22-name-title">
                            <h1 className="cv22-name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="cv22-occupation">{this.props.values.occupation}</h2>
                        </div>
                    </div>

                    <div className="cv22-sidebar-section">
                        <div className="cv22-section-header">
                            <RiProfileLine className="cv22-section-icon" />
                            <h3 className="cv22-section-title">{t('resume.contact')}</h3>
                        </div>
                        <div className="cv22-contact-content">
                            <div className="cv22-contact-item">
                                <FaPhoneAlt className="cv22-contact-icon" />
                                <span>{this.props.values.phone}</span>
                            </div>
                            <div className="cv22-contact-item">
                                <FaEnvelope className="cv22-contact-icon" />
                                <span>{this.props.values.email}</span>
                            </div>
                            <div className="cv22-contact-item">
                                <FaMapMarkerAlt className="cv22-contact-icon" />
                                <span>
                                    {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                                </span>
                            </div>
                            {this.props.values.linkedin && (
                                <div className="cv22-contact-item">
                                    <FaLinkedin className="cv22-contact-icon" />
                                    <span>{this.props.values.linkedin}</span>
                                </div>
                            )}
                            {this.props.values.github && (
                                <div className="cv22-contact-item">
                                    <FaGithub className="cv22-contact-icon" />
                                    <span>{this.props.values.github}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="cv22-sidebar-section">
                        <div className="cv22-section-header">
                            <BiChip className="cv22-section-icon" />
                            <h3 className="cv22-section-title">{t('resume.skills')}</h3>
                        </div>
                        <div className="cv22-skills-content">{this.returnSkills()}</div>
                    </div>

                    <div className="cv22-sidebar-section">
                        <div className="cv22-section-header">
                            <IoLanguage className="cv22-section-icon" />
                            <h3 className="cv22-section-title">{t('resume.languages')}</h3>
                        </div>
                        <div className="cv22-languages-content">{this.returnLanguages()}</div>
                    </div>
                </div>

                <div className="cv22-main">
                    <div className="cv22-main-section">
                        <div className="cv22-section-header">
                            <RiProfileLine className="cv22-section-icon" />
                            <h3 className="cv22-section-title">{t('resume.personalSummary')}</h3>
                        </div>
                        <div className="cv22-summary-content">
                            <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                        </div>
                    </div>

                    <div className="cv22-main-section">
                        <div className="cv22-section-header">
                            <RiBriefcase4Line className="cv22-section-icon" />
                            <h3 className="cv22-section-title">{t('resume.employmentHistory')}</h3>
                        </div>
                        <div className="cv22-experience-content">{this.returnEmployments()}</div>
                    </div>

                    <div className="cv22-main-section">
                        <div className="cv22-section-header">
                            <h3 className="cv22-section-title">{t('resume.educationHistory')}</h3>
                        </div>
                        <div className="cv22-education-content">{this.returnEducations()}</div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv22);
export default MyComponent;
