import React, { Component } from 'react';
import './Cv16.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';
import { BsArrowRightCircleFill } from 'react-icons/bs';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv16 extends Component {
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
                <div className="cv16-experience-item" key={`employment-${index}`}>
                    <div className="cv16-experience-header">
                        <h3>{tempEmployments[index].jobTitle}</h3>
                        <div className="cv16-experience-timeline">
                            <span>{`${tempEmployments[index].begin} - ${tempEmployments[index].end}`}</span>
                        </div>
                    </div>
                    <h4>{tempEmployments[index].employer}</h4>
                    <p dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv16-education-item" key={`education-${index}`}>
                    <div className="cv16-education-header">
                        <h3>{tempEducations[index].degree}</h3>
                        <div className="cv16-education-timeline">
                            <span>{`${tempEducations[index].started} - ${tempEducations[index].finished}`}</span>
                        </div>
                    </div>
                    <h4>{tempEducations[index].school}</h4>
                    <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
                <div className="cv16-skill-item" key={`skill-${index}`}>
                    <div className="cv16-skill-name">{tempSkills[index].name}</div>
                    <div className="cv16-skill-bar">
                        <div className="cv16-skill-progress" style={{ width: tempSkills[index].rating + '%' }}></div>
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
                <div className="cv16-language-item" key={`language-${index}`}>
                    <span className="cv16-language-name">{tempLanguages[index].name}</span>
                    <span className="cv16-language-level">{tempLanguages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv16-container">
                <div className="cv16-header">
                    <div className="cv16-profile">
                        <div className="cv16-profile-photo">
                            {this.props.values.photo !== null ? <img alt="profile" src={this.props.values.photo} /> : <div className="cv16-placeholder">Photo</div>}
                        </div>
                        <div className="cv16-profile-info">
                            <h1>
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2>{this.props.values.occupation}</h2>
                        </div>
                    </div>
                    <div className="cv16-contact">
                        <div className="cv16-contact-item">
                            <FaPhoneAlt className="cv16-icon" />
                            <span>{this.props.values.phone}</span>
                        </div>
                        <div className="cv16-contact-item">
                            <FaEnvelope className="cv16-icon" />
                            <span>{this.props.values.email}</span>
                        </div>
                        <div className="cv16-contact-item">
                            <FaMapMarkerAlt className="cv16-icon" />
                            <span>
                                {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="cv16-main">
                    <div className="cv16-column cv16-left-column">
                        <div className="cv16-section">
                            <div className="cv16-section-title">
                                <BsArrowRightCircleFill className="cv16-section-icon" />
                                <h3>{t('resume.personalSummary')}</h3>
                            </div>
                            <div className="cv16-summary">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </div>

                        <div className="cv16-section">
                            <div className="cv16-section-title">
                                <BsArrowRightCircleFill className="cv16-section-icon" />
                                <h3>{t('resume.employmentHistory')}</h3>
                            </div>
                            <div className="cv16-experience">{this.returnEmployments()}</div>
                        </div>

                        <div className="cv16-section">
                            <div className="cv16-section-title">
                                <BsArrowRightCircleFill className="cv16-section-icon" />
                                <h3>{t('resume.educationHistory')}</h3>
                            </div>
                            <div className="cv16-education">{this.returnEducations()}</div>
                        </div>
                    </div>

                    <div className="cv16-column cv16-right-column">
                        <div className="cv16-section">
                            <div className="cv16-section-title">
                                <BsArrowRightCircleFill className="cv16-section-icon" />
                                <h3>{t('resume.skills')}</h3>
                            </div>
                            <div className="cv16-skills">{this.returnSkills()}</div>
                        </div>

                        <div className="cv16-section">
                            <div className="cv16-section-title">
                                <BsArrowRightCircleFill className="cv16-section-icon" />
                                <h3>{t('resume.languages')}</h3>
                            </div>
                            <div className="cv16-languages">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv16);
export default MyComponent;
