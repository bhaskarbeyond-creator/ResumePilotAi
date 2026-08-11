import React, { Component } from 'react';
import './Cv17.scss';

import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaGlobe } from 'react-icons/fa';
import { BsCircleFill } from 'react-icons/bs';

import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv17 extends Component {
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
                <div className="cv17-timeline-item" key={`employment-${index}`}>
                    <div className="cv17-timeline-marker"></div>
                    <div className="cv17-timeline-content">
                        <span className="cv17-date">{`${tempEmployments[index].begin} - ${tempEmployments[index].end}`}</span>
                        <h3 className="cv17-title">{tempEmployments[index].jobTitle}</h3>
                        <h4 className="cv17-subtitle">{tempEmployments[index].employer}</h4>
                        <p className="cv17-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }}></p>
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
                <div className="cv17-timeline-item" key={`education-${index}`}>
                    <div className="cv17-timeline-marker"></div>
                    <div className="cv17-timeline-content">
                        <span className="cv17-date">{`${tempEducations[index].started} - ${tempEducations[index].finished}`}</span>
                        <h3 className="cv17-title">{tempEducations[index].degree}</h3>
                        <h4 className="cv17-subtitle">{tempEducations[index].school}</h4>
                        <p className="cv17-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
            const rating = tempSkills[index].rating;
            const dots = [];

            // Create 5 rating dots
            for (let i = 0; i < 5; i++) {
                const dotClass = i < Math.round(rating / 20) ? 'cv17-dot-filled' : 'cv17-dot-empty';
                dots.push(
                    <div className={`cv17-dot ${dotClass}`} key={`dot-${i}`}>
                        <BsCircleFill />
                    </div>
                );
            }

            elements.push(
                <div className="cv17-skill-item" key={`skill-${index}`}>
                    <span className="cv17-skill-name">{tempSkills[index].name}</span>
                    <div className="cv17-skill-rating">{dots}</div>
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
                <div className="cv17-language-item" key={`language-${index}`}>
                    <span className="cv17-language-name">{tempLanguages[index].name}</span>
                    <span className="cv17-language-level">{tempLanguages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv17-container">
                <header className="cv17-header">
                    <div className="cv17-name-title">
                        <h1 className="cv17-name">
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h2 className="cv17-occupation">{this.props.values.occupation}</h2>
                    </div>
                    <div className="cv17-photo-container">
                        {this.props.values.photo !== null ? <img className="cv17-photo" src={this.props.values.photo} alt="Profile" /> : <div className="cv17-photo-placeholder">Photo</div>}
                    </div>
                </header>

                <div className="cv17-grid-container">
                    <aside className="cv17-sidebar">
                        <section className="cv17-sidebar-section">
                            <div className="cv17-contact-info">
                                <div className="cv17-contact-item">
                                    <div className="cv17-contact-icon">
                                        <FaPhoneAlt />
                                    </div>
                                    <div className="cv17-contact-text">{this.props.values.phone}</div>
                                </div>
                                <div className="cv17-contact-item">
                                    <div className="cv17-contact-icon">
                                        <FaEnvelope />
                                    </div>
                                    <div className="cv17-contact-text">{this.props.values.email}</div>
                                </div>
                                <div className="cv17-contact-item">
                                    <div className="cv17-contact-icon">
                                        <FaMapMarkerAlt />
                                    </div>
                                    <div className="cv17-contact-text">
                                        {this.props.values.address}, {this.props.values.city}, {this.props.values.country}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="cv17-sidebar-section">
                            <h3 className="cv17-section-title">{t('resume.skills')}</h3>
                            <div className="cv17-skills">{this.returnSkills()}</div>
                        </section>

                        <section className="cv17-sidebar-section">
                            <h3 className="cv17-section-title">{t('resume.languages')}</h3>
                            <div className="cv17-languages">{this.returnLanguages()}</div>
                        </section>
                    </aside>

                    <main className="cv17-main-content">
                        <section className="cv17-main-section">
                            <h3 className="cv17-section-title">{t('resume.personalSummary')}</h3>
                            <div className="cv17-summary">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                        </section>

                        <section className="cv17-main-section">
                            <h3 className="cv17-section-title">{t('resume.employmentHistory')}</h3>
                            <div className="cv17-timeline">{this.returnEmployments()}</div>
                        </section>

                        <section className="cv17-main-section">
                            <h3 className="cv17-section-title">{t('resume.educationHistory')}</h3>
                            <div className="cv17-timeline">{this.returnEducations()}</div>
                        </section>
                    </main>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv17);
export default MyComponent;
