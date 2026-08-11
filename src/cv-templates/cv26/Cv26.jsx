import React, { Component } from 'react';
import './Cv26.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaUser, FaStar, FaLanguage, FaHistory, FaGraduationCap } from 'react-icons/fa';

class Cv26 extends Component {
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
                <div key={index} className="language-grid-item">
                    <div className="language-name">{tempLanguages[index].name}</div>
                    <div className="language-level">{tempLanguages[index].level}</div>
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
                <div key={index} className="skill-item">
                    <div className="skill-info">
                        <span className="skill-name">{tempSkills[index].name}</span>
                        <span className="skill-rating">{this.renderStars(tempSkills[index].rating)}</span>
                    </div>
                </div>
            );
        }
        return elements;
    }

    renderStars(rating) {
        const starCount = Math.round(rating / 20);
        const stars = [];

        for (let i = 0; i < 5; i++) {
            stars.push(<FaStar key={i} className={i < starCount ? 'star filled' : 'star empty'} />);
        }

        return <div className="stars-container">{stars}</div>;
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = this.props.values.employments.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="experience-item">
                    <div className="experience-period">
                        <span>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </span>
                    </div>
                    <div className="experience-details">
                        <h3 className="experience-title">{tempEmployments[index].jobTitle}</h3>
                        <h4 className="experience-company">{tempEmployments[index].employer}</h4>
                        <p className="experience-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                    <div className="experience-period">
                        <span>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </span>
                    </div>
                    <div className="experience-details">
                        <h3 className="experience-title">{tempEducations[index].degree}</h3>
                        <h4 className="experience-company">{tempEducations[index].school}</h4>
                        <p className="experience-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv26-board">
                <div className="cv26-content">
                    <div className="cv26-accent-band"></div>

                    {/* Header Section */}
                    <header className="cv26-header">
                        <div className="name-section">
                            <h1>
                                {this.props.values.firstname} {this.props.values.lastname}
                            </h1>
                            <h2>{this.props.values.occupation}</h2>
                        </div>

                        <div className="photo-section">
                            <div className="photo-container">
                                {this.props.values.photo !== null ? <img alt="profile" src={this.props.values.photo} className="profile-image" /> : <div className="photo-placeholder">Photo</div>}
                            </div>
                        </div>
                    </header>

                    <div className="cv26-main">
                        {/* Left Column */}
                        <div className="cv26-left-column">
                            {/* Contact Section */}
                            <section className="cv26-section contact-section">
                                <div className="section-header">
                                    <FaUser className="section-icon" />
                                    <h3>{t('resume.contact')}</h3>
                                </div>
                                <div className="contact-details">
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
                                            {this.props.values.address},{this.props.values.city},{this.props.values.country}
                                        </span>
                                    </div>
                                </div>
                            </section>

                            {/* Skills Section */}
                            <section className="cv26-section skills-section">
                                <div className="section-header">
                                    <FaStar className="section-icon" />
                                    <h3>{t('resume.skills')}</h3>
                                </div>
                                <div className="skills-content">{this.returnSkills()}</div>
                            </section>

                            {/* Languages Section */}
                            <section className="cv26-section languages-section">
                                <div className="section-header">
                                    <FaLanguage className="section-icon" />
                                    <h3>{t('resume.languages')}</h3>
                                </div>
                                <div className="language-grid">{this.returnLanguages()}</div>
                            </section>
                        </div>

                        {/* Right Column */}
                        <div className="cv26-right-column">
                            {/* Summary Section */}
                            <section className="cv26-section summary-section">
                                <div className="section-header">
                                    <h3>{t('resume.personalSummary')}</h3>
                                </div>
                                <div className="summary-content">
                                    <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                                </div>
                            </section>

                            {/* Experience Section */}
                            <section className="cv26-section experience-section">
                                <div className="section-header">
                                    <FaHistory className="section-icon" />
                                    <h3>{t('resume.employmentHistory')}</h3>
                                </div>
                                <div className="experience-timeline">{this.returnEmployments()}</div>
                            </section>

                            {/* Education Section */}
                            <section className="cv26-section education-section">
                                <div className="section-header">
                                    <FaGraduationCap className="section-icon" />
                                    <h3>{t('resume.educationHistory')}</h3>
                                </div>
                                <div className="experience-timeline">{this.returnEducations()}</div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv26);
export default MyComponent;
