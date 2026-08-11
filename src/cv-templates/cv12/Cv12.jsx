import React, { Component } from 'react';
import './Cv12.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cv12 extends Component {
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
                <div key={index} className="cv12-employment-item">
                    {/* Left */}
                    <div className="cv12-employment-item-left">
                        <p>
                            {tempEmployments[index].begin} - {tempEmployments[index].end}
                        </p>
                    </div>
                    {/* Right */}
                    <div className="cv12-employment-item-right">
                        <h3>{tempEmployments[index].jobTitle}</h3>
                        <p> {tempEmployments[index].employer}</p>
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
                <div className="cv12-employment-item">
                    {/* Left */}
                    <div className="cv12-employment-item-left">
                        <p>
                            {tempEducations[index].started} - {tempEducations[index].finished}
                        </p>
                    </div>
                    {/* Right */}
                    <div className="cv12-employment-item-right">
                        <h3>{tempEducations[index].degree}</h3>
                        <p>{tempEducations[index].school}</p>
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
            elements.push(<p>{this.props.values.skills[index].name}</p>);
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
                <div className="cv12-languages-item">
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
            <div id="resumen" className="cv12-board">
                <div className="cv12-content">
                    <div className="cv12-header">
                        <h1>
                            {this.props.values?.firstname} {this.props.values?.lastname}
                        </h1>
                        <p>{this.props.values?.occupation} </p>
                    </div>
                    <div className="cv12-content-body">
                        {/* Left */}
                        <div className="cv12-left">
                            {/* Suummary */}
                            <div className="cv12-summary" style={{ marginTop: '10px', marginBottom: '10px' }}>
                                <p dangerouslySetInnerHTML={{ __html: this.props.values?.summary }}></p>
                            </div>
                            {/* Section title */}
                            <div className="cv12-section-title">
                                <h2>{t('resume.employmentHistory')}</h2>
                            </div>
                            {/* Employments items */}
                            <div className="cv12-employments">{this.returnEmployments()}</div>
                            {/* Section title */}
                            <div className="cv12-section-title">
                                <h2>{t('resume.educationHistory')}</h2>
                            </div>

                            <div className="cv12-employments">{this.returnEducations()}</div>
                        </div>

                        {/* Right */}
                        <div className="cv12-right">
                            {/* Section title */}
                            <div className="cv12-section-title">
                                <h2>{t('resume.info')}</h2>
                            </div>

                            {/* Info */}
                            <div className="cv12-info">
                                <p className="cv12-info-title">{t('resume.address')}</p>
                                <p className="cv12-info-content">{this.props.values.address}</p>
                                <p className="cv12-info-content">
                                    {this.props.values.city},{this.props.values.country},{this.props.values.postalcode}
                                </p>
                            </div>

                            {/* Info */}
                            <div className="cv12-info">
                                <p className="cv12-info-title">{t('resume.phone')}</p>
                                <p className="cv12-info-content">{this.props.values.phone}</p>
                            </div>

                            {/* Info */}

                            <div className="cv12-info">
                                <p className="cv12-info-title"> {t('resume.email')} </p>

                                <p className="cv12-info-content">{this.props.values.email}</p>
                            </div>
                            {/* Section title */}
                            <div className="cv12-section-title">
                                <h2>{t('resume.skills')}</h2>
                            </div>
                            {/* Skills */}
                            <div className="cv12-skills">
                                <div className="cv12-skill-item">{this.returnSkills()}</div>
                            </div>
                            {/* Section title */}
                            <div className="cv12-section-title">
                                <h2>{t('resume.languages')}</h2>
                            </div>
                            {/* Skills */}
                            <div className="cv12-languages">{this.returnLanguages()}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv12);
export default MyComponent;
