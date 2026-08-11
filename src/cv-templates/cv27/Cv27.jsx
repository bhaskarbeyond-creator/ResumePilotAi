import React, { Component } from 'react';
import './Cv27.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaBriefcase, FaGraduationCap, FaCogs, FaGlobeAmericas, FaUserTie } from 'react-icons/fa';

class Cv27 extends Component {
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
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-progress-container">
                        <div className="language-level-text">{tempLanguages[index].level}</div>
                        <div className="language-progress">
                            <div className="language-progress-bar" style={{ width: this.getLanguageLevelWidth(tempLanguages[index].level) }}></div>
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    getLanguageLevelWidth(level) {
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
                    <div className="skill-info">
                        <span className="skill-name">{tempSkills[index].name}</span>
                    </div>
                    <div className="skill-progress-container">
                        <div className="skill-progress">
                            <div className="skill-progress-bar" style={{ width: tempSkills[index].rating + '%' }}></div>
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
                        <div className="timeline-heading">
                            <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                            <div className="timeline-subtitle">
                                <span className="company">{tempEmployments[index].employer}</span>
                                <span className="timeline-period">
                                    {tempEmployments[index].begin} - {tempEmployments[index].end}
                                </span>
                            </div>
                        </div>
                        <div className="timeline-body">
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
                <div key={index} className="timeline-item">
                    <div className="timeline-marker"></div>
                    <div className="timeline-content">
                        <div className="timeline-heading">
                            <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                            <div className="timeline-subtitle">
                                <span className="company">{tempEducations[index].school}</span>
                                <span className="timeline-period">
                                    {tempEducations[index].started} - {tempEducations[index].finished}
                                </span>
                            </div>
                        </div>
                        <div className="timeline-body">
                            <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv27-board">
                <div className="cv27-content">
                    <div className="cv27-header">
                        <div className="header-content">
                            <h1 className="person-name">
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2 className="person-title">{this.props.values.occupation}</h2>
                        </div>
                        <div className="header-photo">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? (
                                    <img alt="profile" src={this.props.values.photo} className="photo" />
                                ) : (
                                    <div className="photo-placeholder">
                                        <FaUserTie className="placeholder-icon" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="cv27-body">
                        <div className="cv27-sidebar">
                            <div className="contact-section section">
                                <h3 className="section-title">{t('resume.contact')}</h3>
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
                                        <span className="address-item">
                                            {this.props.values.address}
                                            <br />
                                            {this.props.values.city}, {this.props.values.country}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="section skills-section">
                                <h3 className="section-title with-icon">
                                    <FaCogs className="section-icon" />
                                    {t('resume.skills')}
                                </h3>
                                <div className="skills-list">{this.returnSkills()}</div>
                            </div>

                            <div className="section languages-section">
                                <h3 className="section-title with-icon">
                                    <FaGlobeAmericas className="section-icon" />
                                    {t('resume.languages')}
                                </h3>
                                <div className="languages-list">{this.returnLanguages()}</div>
                            </div>
                        </div>

                        <div className="cv27-main">
                            <div className="section summary-section">
                                <div className="summary-content">
                                    <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                                </div>
                            </div>

                            <div className="section work-section">
                                <h3 className="section-title with-icon">
                                    <FaBriefcase className="section-icon" />
                                    {t('resume.employmentHistory')}
                                </h3>
                                <div className="timeline">{this.returnEmployments()}</div>
                            </div>

                            <div className="section education-section">
                                <h3 className="section-title with-icon">
                                    <FaGraduationCap className="section-icon" />
                                    {t('resume.educationHistory')}
                                </h3>
                                <div className="timeline">{this.returnEducations()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv27);
export default MyComponent;
