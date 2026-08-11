import React, { Component } from 'react';
import './Cv25.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaBriefcase, FaGraduationCap, FaLanguage, FaTools } from 'react-icons/fa';

class Cv25 extends Component {
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
                <div key={index} className="cv25-language-item">
                    <div className="language-title">{tempLanguages[index].name}</div>
                    <div className="language-level">
                        <span className="level-indicator">{tempLanguages[index].level}</span>
                        <div className="level-dots">{this.renderDots(tempLanguages[index].level)}</div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    renderDots(level) {
        let dots = [];
        let filledDots = 0;

        switch (level.toLowerCase()) {
            case 'native':
            case 'fluent':
                filledDots = 5;
                break;
            case 'advanced':
            case 'proficient':
                filledDots = 4;
                break;
            case 'intermediate':
                filledDots = 3;
                break;
            case 'elementary':
            case 'basic':
                filledDots = 2;
                break;
            case 'beginner':
                filledDots = 1;
                break;
            default:
                filledDots = 3;
        }

        for (let i = 0; i < 5; i++) {
            dots.push(<div key={i} className={`dot ${i < filledDots ? 'filled' : ''}`}></div>);
        }

        return dots;
    }

    returnSkills() {
        var elements = [];
        var tempSkills = this.props.values.skills.sort(function (a, b) {
            return a.date - b.date;
        });
        for (let index = 0; index < tempSkills.length; index++) {
            elements.push(
                <div key={index} className="cv25-skill-item">
                    <span>{tempSkills[index].name}</span>
                    <div className="skill-level">
                        <div className="skill-box-container">{this.renderSkillBoxes(tempSkills[index].rating)}</div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    renderSkillBoxes(rating) {
        let boxes = [];
        let filledBoxes = Math.floor(rating / 20);

        for (let i = 0; i < 5; i++) {
            boxes.push(<div key={i} className={`skill-box ${i < filledBoxes ? 'filled' : ''}`}></div>);
        }

        return boxes;
    }

    returnEmployments() {
        var elements = [];
        var tempEmployments = this.props.values.employments.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempEmployments.length; index++) {
            elements.push(
                <div key={index} className="cv25-experience-item">
                    <div className="experience-header">
                        <div className="experience-title-wrap">
                            <h3>{tempEmployments[index].jobTitle}</h3>
                            <h4>{tempEmployments[index].employer}</h4>
                        </div>
                        <div className="experience-date">
                            <span>
                                {tempEmployments[index].begin} - {tempEmployments[index].end}
                            </span>
                        </div>
                    </div>
                    <div className="experience-content">
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
                <div key={index} className="cv25-experience-item">
                    <div className="experience-header">
                        <div className="experience-title-wrap">
                            <h3>{tempEducations[index].degree}</h3>
                            <h4>{tempEducations[index].school}</h4>
                        </div>
                        <div className="experience-date">
                            <span>
                                {tempEducations[index].started} - {tempEducations[index].finished}
                            </span>
                        </div>
                    </div>
                    <div className="experience-content">
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
            <div id="resumen" className="cv25-board">
                <div className="cv25-content">
                    <div className="cv25-header">
                        <div className="cv25-header-top">
                            <div className="cv25-name-title">
                                <h1>
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <h2>{this.props.values.occupation}</h2>
                            </div>
                            <div className="cv25-photo">{this.props.values.photo !== null ? <img alt="profile" src={this.props.values.photo} /> : <div className="photo-placeholder">Photo</div>}</div>
                        </div>

                        <div className="cv25-contact-info">
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

                    <div className="cv25-body">
                        <div className="cv25-main">
                            <div className="cv25-section">
                                <div className="section-header">
                                    <FaBriefcase className="section-icon" />
                                    <h3>{t('resume.employmentHistory')}</h3>
                                </div>
                                <div className="section-content">{this.returnEmployments()}</div>
                            </div>

                            <div className="cv25-section">
                                <div className="section-header">
                                    <FaGraduationCap className="section-icon" />
                                    <h3>{t('resume.educationHistory')}</h3>
                                </div>
                                <div className="section-content">{this.returnEducations()}</div>
                            </div>
                        </div>

                        <div className="cv25-sidebar">
                            <div className="cv25-section summary-section">
                                <h3>{t('resume.personalSummary')}</h3>
                                <div className="section-content">
                                    <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                                </div>
                            </div>

                            <div className="cv25-section">
                                <div className="section-header">
                                    <FaTools className="section-icon" />
                                    <h3>{t('resume.skills')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="cv25-skills">{this.returnSkills()}</div>
                                </div>
                            </div>

                            <div className="cv25-section">
                                <div className="section-header">
                                    <FaLanguage className="section-icon" />
                                    <h3>{t('resume.languages')}</h3>
                                </div>
                                <div className="section-content">
                                    <div className="cv25-languages">{this.returnLanguages()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv25);
export default MyComponent;
