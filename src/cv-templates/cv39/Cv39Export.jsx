import React, { Component } from 'react';
import './Cv39.scss';
import {
    FaEnvelope,
    FaPhone,
    FaMapMarkerAlt,
    FaGlobeAmericas,
    FaUserAlt,
    FaLinkedin,
    FaGithub,
    FaBriefcase,
    FaGraduationCap,
    FaLaptopCode,
    FaCalendarAlt,
    FaQuoteLeft,
    FaAward,
    FaChartLine,
} from 'react-icons/fa';

class Cv39Export extends Component {
    constructor(props) {
        super(props);
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

        const levelDotMap = {
            native: 5,
            fluent: 5,
            advanced: 4,
            proficient: 4,
            intermediate: 3,
            elementary: 2,
            basic: 1,
            beginner: 1,
        };

        for (let index = 0; index < tempLanguages.length; index++) {
            const level = tempLanguages[index].level.toLowerCase();
            const dots = levelDotMap[level] || 3;
            const dotElements = [];

            for (let i = 0; i < 5; i++) {
                dotElements.push(<div key={i} className={`language-dot ${i < dots ? 'active' : ''}`}></div>);
            }

            elements.push(
                <div key={index} className="language-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <span className="level-label">{tempLanguages[index].level}</span>
                        <div className="dot-container">{dotElements}</div>
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
            const percentage = Math.min(Math.max(tempSkills[index].rating, 0), 100);

            elements.push(
                <div key={index} className="skill-item">
                    <div className="skill-header">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-percentage">{percentage}%</span>
                    </div>
                    <div className="skill-bar-container">
                        <div className="skill-bar">
                            <div className="skill-progress" style={{ width: `${percentage}%` }}></div>
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
            return b.date - a.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-marker">
                        <div className="timeline-dot"></div>
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEmployments[index].jobTitle}</h3>
                        </div>
                        <div className="timeline-meta">
                            <div className="timeline-company">
                                <span className="company-name">{tempEmployments[index].employer}</span>
                            </div>
                            <div className="timeline-period">
                                <FaCalendarAlt className="period-icon" />
                                <span>
                                    {tempEmployments[index].begin} – {tempEmployments[index].end}
                                </span>
                            </div>
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
            return b.date - a.date;
        });

        for (let index = 0; index < tempEducations.length; index++) {
            elements.push(
                <div key={index} className="timeline-item">
                    <div className="timeline-marker">
                        <div className="timeline-dot"></div>
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <h3 className="timeline-title">{tempEducations[index].degree}</h3>
                        </div>
                        <div className="timeline-meta">
                            <div className="timeline-company">
                                <span className="company-name">{tempEducations[index].school}</span>
                            </div>
                            <div className="timeline-period">
                                <FaCalendarAlt className="period-icon" />
                                <span>
                                    {tempEducations[index].started} – {tempEducations[index].finished}
                                </span>
                            </div>
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
        return (
            <div id="resumen" className="cv39-board">
                <div className="cv39-aside">
                    <div className="profile-container">
                        <div className="profile-photo-container">
                            {this.props.values.photo !== null ? (
                                <img alt="profile" src={this.props.values.photo} className="profile-photo" />
                            ) : (
                                <div className="photo-placeholder">
                                    <FaUserAlt className="placeholder-icon" />
                                </div>
                            )}
                        </div>
                        <h1 className="profile-name">
                            {this.props.values.firstname}
                            <br />
                            {this.props.values.lastname}
                        </h1>
                        <h2 className="profile-title">{this.props.values.occupation}</h2>
                    </div>

                    <div className="contact-section aside-section">
                        <h3 className="section-title">
                            <span className="title-text">Contact</span>
                            <span className="title-line"></span>
                        </h3>
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
                                <span>
                                    {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                </span>
                            </div>
                            {this.props.values.linkedin && (
                                <div className="contact-item">
                                    <FaLinkedin className="contact-icon" />
                                    <span>{this.props.values.linkedin}</span>
                                </div>
                            )}
                            {this.props.values.github && (
                                <div className="contact-item">
                                    <FaGithub className="contact-icon" />
                                    <span>{this.props.values.github}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="languages-section aside-section">
                        <h3 className="section-title">
                            <span className="title-text">Languages</span>
                            <span className="title-line"></span>
                        </h3>
                        <div className="languages-container">{this.returnLanguages()}</div>
                    </div>

                    <div className="skills-section aside-section">
                        <h3 className="section-title">
                            <span className="title-text">Skills</span>
                            <span className="title-line"></span>
                        </h3>
                        <div className="skills-container">{this.returnSkills()}</div>
                    </div>
                </div>

                <div className="cv39-main">
                    <div className="header-accent"></div>

                    <div className="summary-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaQuoteLeft className="section-icon" />
                            </div>
                            <h3 className="section-title">Professional Summary</h3>
                        </div>
                        <div className="section-content">
                            <p className="summary-text">{this.props.values.summary}</p>
                        </div>
                    </div>

                    <div className="experience-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaBriefcase className="section-icon" />
                            </div>
                            <h3 className="section-title">Employment History</h3>
                        </div>
                        <div className="section-content">
                            <div className="timeline">{this.returnEmployments()}</div>
                        </div>
                    </div>

                    <div className="education-section main-section">
                        <div className="section-header">
                            <div className="section-icon-container">
                                <FaGraduationCap className="section-icon" />
                            </div>
                            <h3 className="section-title">Education</h3>
                        </div>
                        <div className="section-content">
                            <div className="timeline">{this.returnEducations()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default Cv39Export;
