import React, { Component } from 'react';
import './Cv24.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaLinkedin, FaGithub } from 'react-icons/fa';

class Cv24 extends Component {
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
                    <div className="language-level">{tempLanguages[index].level}</div>
                    <div className="language-bar">
                        <div
                            className="language-progress"
                            style={{
                                width: this.getLevelPercentage(tempLanguages[index].level) + '%',
                            }}></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    getLevelPercentage(level) {
        // Convert language level to percentage
        switch (level.toLowerCase()) {
            case 'native':
            case 'fluent':
                return 100;
            case 'advanced':
            case 'proficient':
                return 85;
            case 'intermediate':
                return 65;
            case 'elementary':
            case 'basic':
                return 40;
            case 'beginner':
                return 25;
            default:
                return 50;
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
                    <div className="skill-bar">
                        <div className="skill-progress" style={{ width: tempSkills[index].rating + '%' }}></div>
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
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3>{tempEmployments[index].jobTitle}</h3>
                            <span className="timeline-company">{tempEmployments[index].employer}</span>
                            <span className="timeline-period">
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                        <div className="timeline-description">
                            <p>{tempEmployments[index].description}</p>
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
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3>{tempEducations[index].degree}</h3>
                            <span className="timeline-company">{tempEducations[index].school}</span>
                            <span className="timeline-period">
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                        <div className="timeline-description">
                            <p>{tempEducations[index].description}</p>
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
            <div id="resumen" className="cv24-board">
                <div className="cv24-content">
                    {/* Header Section */}
                    <header className="cv24-header">
                        <div className="photo-wrapper">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? <img alt="profile" className="photo" src={this.props.values.photo} /> : <div className="photo-placeholder">photo</div>}
                            </div>
                        </div>
                        <div className="header-content">
                            <h1>
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2>{this.props.values.occupation}</h2>

                            <div className="contact-info">
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
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="cv24-main">
                        <div className="cv24-sidebar">
                            {/* Summary Section */}
                            <section className="sidebar-section">
                                <h3 className="section-title">{t('resume.personalSummary')}</h3>
                                <div className="summary-content">
                                    <p>{this.props.values.summary}</p>
                                </div>
                            </section>

                            {/* Skills Section */}
                            <section className="sidebar-section">
                                <h3 className="section-title">{t('resume.skills')}</h3>
                                <div className="skills-content">{this.returnSkills()}</div>
                            </section>

                            {/* Languages Section */}
                            <section className="sidebar-section">
                                <h3 className="section-title">{t('resume.languages')}</h3>
                                <div className="languages-content">{this.returnLanguages()}</div>
                            </section>
                        </div>

                        <div className="cv24-main-content">
                            {/* Experience Section */}
                            <section className="main-section">
                                <h3 className="section-title">{t('resume.employmentHistory')}</h3>
                                <div className="timeline">{this.returnEmployments()}</div>
                            </section>

                            {/* Education Section */}
                            <section className="main-section">
                                <h3 className="section-title">{t('resume.educationHistory')}</h3>
                                <div className="timeline">{this.returnEducations()}</div>
                            </section>
                        </div>
                    </main>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv24);
export default MyComponent;
