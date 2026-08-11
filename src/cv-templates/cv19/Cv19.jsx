import React, { Component } from 'react';
import './Cv19.scss';

import { FaPhone, FaEnvelope, FaMapMarkerAlt, FaLinkedin } from 'react-icons/fa';
import { MdKeyboardArrowRight } from 'react-icons/md';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv19 extends Component {
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
                <div className="cv19-work-item" key={`employment-${index}`}>
                    <div className="cv19-work-title-wrapper">
                        <h3 className="cv19-work-position">{tempEmployments[index].jobTitle}</h3>
                        <div className="cv19-work-duration">
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="cv19-work-company">{tempEmployments[index].employer}</div>
                    <p className="cv19-work-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv19-education-item" key={`education-${index}`}>
                    <div className="cv19-education-title-wrapper">
                        <h3 className="cv19-education-degree">{tempEducations[index].degree}</h3>
                        <div className="cv19-education-duration">
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="cv19-education-school">{tempEducations[index].school}</div>
                    <p className="cv19-education-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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

        // Create two columns for skills
        const leftColumn = [];
        const rightColumn = [];

        for (let index = 0; index < tempSkills.length; index++) {
            const skillItem = (
                <div className="cv19-skill-item" key={`skill-${index}`}>
                    <div className="cv19-skill-name">{tempSkills[index].name}</div>
                    <div className="cv19-skill-bar-container">
                        <div className="cv19-skill-bar" style={{ width: `${tempSkills[index].rating}%` }}></div>
                    </div>
                </div>
            );

            // Distribute skills evenly between two columns
            if (index % 2 === 0) {
                leftColumn.push(skillItem);
            } else {
                rightColumn.push(skillItem);
            }
        }

        return (
            <div className="cv19-skills-columns">
                <div className="cv19-skills-column">{leftColumn}</div>
                <div className="cv19-skills-column">{rightColumn}</div>
            </div>
        );
    }

    returnLanguages() {
        var elements = [];
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempLanguages.length; index++) {
            elements.push(
                <div className="cv19-language-item" key={`language-${index}`}>
                    <div className="cv19-language-name">{tempLanguages[index].name}</div>
                    <div className="cv19-language-level">{tempLanguages[index].level}</div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv19-container">
                <div className="cv19-header">
                    <div className="cv19-personal-info">
                        <h1 className="cv19-name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="cv19-position">{this.props.values.occupation}</h2>
                    </div>
                    <div className="cv19-photo-container">
                        {this.props.values.photo !== null ? <img className="cv19-photo" src={this.props.values.photo} alt="Profile" /> : <div className="cv19-photo-placeholder"></div>}
                    </div>
                </div>

                <div className="cv19-body">
                    <div className="cv19-main-column">
                        <section className="cv19-section">
                            <div className="cv19-section-header">
                                <div className="cv19-section-icon-container">
                                    <MdKeyboardArrowRight className="cv19-section-icon" />
                                </div>
                                <h3 className="cv19-section-title">{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="cv19-section-content">
                                <p className="cv19-summary" dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </section>

                        <section className="cv19-section">
                            <div className="cv19-section-header">
                                <div className="cv19-section-icon-container">
                                    <MdKeyboardArrowRight className="cv19-section-icon" />
                                </div>
                                <h3 className="cv19-section-title">{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="cv19-section-content cv19-work-list">{this.returnEmployments()}</div>
                        </section>

                        <section className="cv19-section">
                            <div className="cv19-section-header">
                                <div className="cv19-section-icon-container">
                                    <MdKeyboardArrowRight className="cv19-section-icon" />
                                </div>
                                <h3 className="cv19-section-title">{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="cv19-section-content cv19-education-list">{this.returnEducations()}</div>
                        </section>
                    </div>

                    <div className="cv19-sidebar">
                        <div className="cv19-sidebar-section cv19-contact-section">
                            <h3 className="cv19-sidebar-title">{t('resume.contactInfo')}</h3>
                            <div className="cv19-contact-list">
                                <div className="cv19-contact-item">
                                    <div className="cv19-contact-icon">
                                        <FaPhone />
                                    </div>
                                    <div className="cv19-contact-content">{this.props.values.phone}</div>
                                </div>
                                <div className="cv19-contact-item">
                                    <div className="cv19-contact-icon">
                                        <FaEnvelope />
                                    </div>
                                    <div className="cv19-contact-content">{this.props.values.email}</div>
                                </div>
                                <div className="cv19-contact-item">
                                    <div className="cv19-contact-icon">
                                        <FaMapMarkerAlt />
                                    </div>
                                    <div className="cv19-contact-content">
                                        {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="cv19-sidebar-section">
                            <h3 className="cv19-sidebar-title">{t('resume.skills')}</h3>
                            <div className="cv19-skills-list">{this.returnSkills()}</div>
                        </div>

                        <div className="cv19-sidebar-section">
                            <h3 className="cv19-sidebar-title">{t('resume.languages')}</h3>
                            <div className="cv19-languages-list">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv19);
export default MyComponent;
