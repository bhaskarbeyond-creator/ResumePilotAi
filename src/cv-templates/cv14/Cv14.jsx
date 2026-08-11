import React, { Component } from 'react';
import './Cv14.scss';
import { FaPhoneAlt, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { FaAngleDoubleRight } from 'react-icons/fa';

class Cv14 extends Component {
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
                <div className="cv14-work-history-item">
                    <div className="cv14-work-history-item-left">
                        <p>{tempEmployments[index].employer}</p>
                        <p>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </p>
                    </div>
                    <div className="cv14-work-history-item-right">
                        <h3>{tempEmployments[index].jobTitle}</h3>
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
                <div className="cv14-work-history-item">
                    <div className="cv14-work-history-item-left">
                        <p>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </p>
                    </div>
                    <div className="cv14-work-history-item-right">
                        <h3>{tempEducations[index].degree}</h3>
                        <p style={{ marginBottom: '5px' }}>{tempEducations[index].school}</p>
                        <p dangerouslySetInnerHTML={{ __html: tempEducations[index].description }}></p>
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
            elements.push(
                <div className="cv14-skills-item">
                    <p>{this.props.values.skills[index].name}</p>
                    <div className="cv14-skills-item-bar">
                        <div className="cv14-skills-item-bar-inner" style={{ width: this.props.values.skills[index].rating + '%' }}></div>
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
                <div className="cv14-languages-item">
                    <p>{tempLanguages[index].name}</p>
                    <p>{tempLanguages[index].level}</p>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;

        return (
            <div id="resumen" className="cv14-board">
                <div className="cv14-content">
                    {/*  Left side */}
                    <div className="cv14-left-side">
                        {/* Left side head */}
                        <div className="cv14-left-side-head">
                            <div className="cv14-image">
                            {this.props.values.photo !== null ? <img alt='photoOf' className="photo" src={this.props.values.photo} /> : "photo"}

                            </div>
                        </div>
                        {/* Left side body */}

                        <div className="cv14-left-side-body">
                            <div className="cv14-left-title">
                                <span>{t('resume.personalSummary')}</span>
                            </div>
                            <div className="cv14-summary">
                                <p dangerouslySetInnerHTML={{ __html: this.props.values.summary }}></p>
                            </div>
                            <div className="cv14-left-title">
                                <span>{t('resume.skills')}</span>
                            </div>

                            <div className="cv14-skills">{this.returnSkills()}</div>

                            <div className="cv14-left-title">
                                <span>{t('resume.languages')}</span>
                            </div>
                            <div className="cv14-languages">{this.returnLanguages()}</div>
                        </div>
                    </div>

                    {/* Right side */}
                    <div className="cv14-right-side">
                        {/* Right side head */}
                        <div className="cv14-right-side-head">
                            <div className="cv14-right-side-head-left">
                                <h1>
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <p>{this.props.values.occupation}</p>
                            </div>
                            <div className="cv14-right-side-head-right">
                                {/* Contact info usin react-icons */}
                                <div className="cv14-contact-info">
                                    <div className="cv14-contact-info-item">
                                        <FaPhoneAlt className="cv14-contact-icon" />
                                        <p>{this.props.values.phone}</p>
                                    </div>
                                    <div className="cv14-contact-info-item">
                                        <FaEnvelope className="cv14-contact-icon" />
                                        <p>{this.props.values.email}</p>
                                    </div>
                                    <div className="cv14-contact-info-item">
                                        <FaMapMarkerAlt className="cv14-contact-icon" />
                                        <p>
                                            {this.props.values.address}, {this.props.values.city} {this.props.values.country}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Right side body */}
                        <div className="cv14-right-side">
                            <div className="cv14-right-side-body">
                                {/* Right title */}
                                <div className="cv14-right-title">
                                    <FaAngleDoubleRight className="cv14-right-title-icon" />
                                    <span>{t('resume.employmentHistory')}</span>
                                </div>
                                {/* Work history */}
                                <div className="cv14-work-history">{this.returnEmployments()}</div>
                                {/* Right title */}
                                <div className="cv14-right-title">
                                    <FaAngleDoubleRight className="cv14-right-title-icon" />
                                    <span>{t('resume.educationHistory')}</span>
                                </div>
                                {/* Education history */}
                                <div className="cv14-work-history">
                                   {
                                 this.returnEducations()
                                   }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv14);
export default MyComponent;
