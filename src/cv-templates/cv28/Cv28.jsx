import React, { Component } from 'react';
import './Cv28.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaLinkedin, FaGithub, FaChevronRight } from 'react-icons/fa';

class Cv28 extends Component {
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
                <div key={index} className="pill-item">
                    <span className="pill-name">{tempLanguages[index].name}</span>
                    <span className="pill-level">{tempLanguages[index].level}</span>
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
                <div key={index} className="pill-item">
                    <span className="pill-name">{tempSkills[index].name}</span>
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
                <div key={index} className="experience-item">
                    <div className="experience-header">
                        <div className="bullet-point">
                            <FaChevronRight className="bullet-icon" />
                        </div>
                        <div className="experience-title-container">
                            <h3 className="experience-title">{tempEmployments[index].jobTitle}</h3>
                            <h4 className="experience-subtitle">{tempEmployments[index].employer}</h4>
                        </div>
                        <div className="experience-period">
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="experience-description">
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
                <div key={index} className="experience-item">
                    <div className="experience-header">
                        <div className="bullet-point">
                            <FaChevronRight className="bullet-icon" />
                        </div>
                        <div className="experience-title-container">
                            <h3 className="experience-title">{tempEducations[index].degree}</h3>
                            <h4 className="experience-subtitle">{tempEducations[index].school}</h4>
                        </div>
                        <div className="experience-period">
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="experience-description">
                        <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv28-board">
                <div className="cv28-content">
                    {/* Header */}
                    <header className="cv28-header">
                        {/* Name and Photo Section */}
                        <div className="intro-section">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? <img alt="profile" className="profile-photo" src={this.props.values.photo} /> : <div className="photo-placeholder">Photo</div>}
                            </div>
                            <div className="name-container">
                                <h1 className="name">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2 className="job-title">{this.props.values.occupation}</h2>
                            </div>
                        </div>

                        {/* Contact Section */}
                        <div className="contact-section">
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
                    </header>

                    {/* Summary Section */}
                    <section className="summary-section">
                        <h3 className="section-title">{t('resume.personalSummary')}</h3>
                        <div className="summary-content">
                            <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                        </div>
                    </section>

                    {/* Main Two-Column Content */}
                    <div className="main-content">
                        {/* Left Column */}
                        <div className="left-column">
                            {/* Experience Section */}
                            <section className="experience-section">
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                <div className="experiences-container">{this.returnEmployments()}</div>
                            </section>

                            {/* Education Section */}
                            <section className="education-section">
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                <div className="experiences-container">{this.returnEducations()}</div>
                            </section>
                        </div>

                        {/* Right Column */}
                        <div className="right-column">
                            {/* Skills Section */}
                            <section className="skills-section">
                                <h3 className="section-title">{t('resume.skills')}</h3>
                                <div className="pills-container">{this.returnSkills()}</div>
                            </section>

                            {/* Languages Section */}
                            <section className="languages-section">
                                <h3 className="section-title">{t('resume.languages')}</h3>
                                <div className="pills-container">{this.returnLanguages()}</div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv28);
export default MyComponent;
