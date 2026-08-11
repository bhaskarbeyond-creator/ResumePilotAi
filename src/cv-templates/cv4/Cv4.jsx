import React, { Component } from 'react';
import './Cv4.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatLocation, formatDateRange } from '../templateUtils';

class Cv4 extends Component {
    constructor(props) {
        super(props);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    // Color helper methods
    getPrimaryColor() {
        return this.props.values?.colors?.primary || '#3d3e42';
    }

    getSecondaryColor() {
        return this.props.values?.colors?.secondary || '#3d3e42';
    }

    returnSkills() {
        var elements = [];
        for (let index = 0; index < (this.props.values.skills || []).length; index++) {
            elements.push(
                <div key={index} className="cv4-skill">
                    <span className="cv4-skillName">{this.props.values.skills[index].name}</span>
                    <div className="cv4-skillBox" style={{ border: `1px solid ${this.getSecondaryColor()}` }}>
                        <div style={{ width: (this.props.values.skills[index].rating || 75) + '%', backgroundColor: this.getSecondaryColor() }} className="cv4-skillRating"></div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnLanguages() {
        if (!this.props.values?.languages?.length) return null;
        var elements = [];
        for (let index = 0; index < this.props.values.languages.length; index++) {
            elements.push(
                <div key={index} className="cv4-languagesItem">
                    <span className="cv4-languageName">{this.props.values.languages[index].name}</span>
                    <span className="cv4-languageLevel">{this.props.values.languages[index].level}</span>
                </div>
            );
        }
        return elements;
    }

    returnEmployments() {
        var elements = [];
        for (let index = 0; index < (this.props.values.employments || []).length; index++) {
            const item = this.props.values.employments[index];
            const dateStr = formatDateRange(item.begin, item.end, item.currentWork);
            elements.push(
                <div key={index} className="cv4-employment">
                    <div className="cv4-employmentsHead">
                        <span className="cv4-jobTitle"> {item.jobTitle}</span>
                        {dateStr && (
                            <div className="cv4-dates">
                                <span>{dateStr}</span>
                            </div>
                        )}
                    </div>
                    <div className="cv4-employmentBody">
                        <div dangerouslySetInnerHTML={{ __html: item.description }} />
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnEducations() {
        var elements = [];
        for (let index = 0; index < (this.props.values.educations || []).length; index++) {
            const item = this.props.values.educations[index];
            const dateStr = formatDateRange(item.started, item.finished);
            elements.push(
                <div key={index} className="cv4-employment">
                    <div className="cv4-employmentsHead">
                        <span className="cv4-jobTitle"> {item.degree}</span>
                        {dateStr && (
                            <div className="cv4-dates">
                                <span>{dateStr}</span>
                            </div>
                        )}
                    </div>
                    <div className="cv4-employmentBody">
                        <div dangerouslySetInnerHTML={{ __html: item.description }} />
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const locationText = formatLocation(
            this.props.values.address,
            this.props.values.city,
            this.props.values.country,
            this.props.values.postalcode
        );

        return (
            <div id="resumen" className="cv4-board">
                <div className="cv4-content">
                    {/* Head */}
                    <div className="cv4-head" style={{ background: this.getPrimaryColor() }}>
                        <div className="cv4-headBox">
                            <h1 className="cv4-name">
                                {this.props.values.firstname} {this.props.values.lastname}{' '}
                            </h1>
                            <hr className="cv4-headBoxHr" />
                            <span className="cv4-headOccupation">{this.props.values.occupation} </span>
                        </div>
                    </div>{' '}
                    {/* End Head */}
                    {/* Cv4 Body */}
                    <div className="cv4-body">
                        <div className="cv4-leftSide">
                            {/* Details */}
                            <div className="cv4-details">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.info')}
                                    </span>
                                </div>
                                <div className="cv4-detailsContent">
                                    {this.props.values.email && <span>{this.props.values.email}</span>}
                                    {this.props.values.phone && <span>{this.props.values.phone}</span>}
                                    {locationText && <span>{locationText}</span>}
                                </div>
                            </div>{' '}
                            {/* End  Details */}
                            {/* Skills */}
                            <div className="cv4-details">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.skills')}
                                    </span>
                                </div>
                                <div className="cv4-skills">
                                    {/* Skill Item */}
                                    {this.returnSkills()}
                                </div>
                            </div>{' '}
                            {/* End  Skills */}
                            {/* Skills */}
                            <div className="cv4-details">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.languages')}
                                    </span>
                                </div>
                                <div className="cv4-languages">
                                    {/* Language Item */}
                                    {this.returnLanguages()}
                                </div>
                            </div>{' '}
                            {/* End  Skills */}
                        </div>
                        <div className="cv4-rightSide" style={{ borderLeft: `3px solid ${this.getSecondaryColor()}` }}>
                            {/* Profile */}
                            <div className="cv4-profile">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.personalSummary')}
                                    </span>
                                </div>
                                <div dangerouslySetInnerHTML={{ __html: this.props.values.summary }} />
                            </div>
                            {/* Employments */}
                            <div className="cv4-profile">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.employmentHistory')}
                                    </span>
                                </div>
                                {/* Employment */}
                                {this.returnEmployments()}
                            </div>
                            {/* End Employments */}
                            {/* Employments */}
                            <div className="cv4-profile">
                                <div className="cv4-SectionTitle">
                                    <span className="cv4-SectionTitleName" style={{ color: this.getPrimaryColor() }}>
                                        {t('resume.educationHistory')}
                                    </span>
                                </div>
                                {/* Employment */}
                                {this.returnEducations()}
                            </div>
                            {/* End Employments */}
                        </div>
                    </div>{' '}
                    {/* END Cv4 Body */}
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Cv4);
export default MyComponent;
