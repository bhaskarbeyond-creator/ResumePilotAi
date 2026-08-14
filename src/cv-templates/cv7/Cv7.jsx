import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv7.scss';
import Email from '../../assets/cv7-assets/email.png';
import Address from '../../assets/cv7-assets/pin.png';
import Phone from '../../assets/cv7-assets/phone-call.png';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatLocation, formatDateRange } from '../templateUtils';

class Cv7 extends Component {
    constructor(props) {
        super(props);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    // Get primary color from props or default to black
    getPrimaryColor() {
        return this.props.values?.colors?.primary || '#000000';
    }

    // Get secondary color from props or default to light gray
    getSecondaryColor() {
        return this.props.values?.colors?.secondary || '#f5f5f5';
    }

    returnLanguages() {
        if (!this.props.values?.languages?.length) return null;
        var elements = [];
        for (let index = 0; index < this.props.values.languages.length; index++) {
            elements.push(
                <div key={index} className="cv7-languagesItem">
                    <span>{this.props.values.languages[index].name}</span>
                    <span className="cv7-languageName">{this.props.values.languages[index].level}</span>
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
                <div key={index} className="cv7-employmentItem">
                    <div className="cv7-details">
                        <p className="cv7-jobTitle">{item.jobTitle}</p>
                        <p className="cv7-dates">
                            {item.employer}{dateStr ? `, ${dateStr}` : ''}
                        </p>
                    </div>
                    <div className="cv7-jobDescription">
                        <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    returnSkills() {
        var elements = [];
        for (let index = 0; index < (this.props.values.skills || []).length; index++) {
            elements.push(
                <div key={index} className="cv7-skillItem">
                    <span> {this.props.values.skills[index].name}</span>
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
                <div key={index} className="cv7-employmentItem">
                    <div className="cv7-details">
                        <p className="cv7-jobTitle">{item.degree}</p>
                        <p className="cv7-dates">
                            {item.school}{dateStr ? `, ${dateStr}` : ''}
                        </p>
                    </div>
                    <div className="cv7-jobDescription">
                        <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}></p>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const primaryColor = this.getPrimaryColor();
        const locationText = formatLocation(
            this.props.values.address,
            this.props.values.city,
            this.props.values.country,
            this.props.values.postalcode || this.props.values.postalecode
        );

        return (
            <div id="resumen" className="cv7-board">
                {/* Content */}
                <div className="cv7-content">
                    {/* Head */}
                    <div className="cv7-head" style={{ backgroundColor: primaryColor }}>
                        <h1>
                            {this.props.values.firstname} {this.props.values.lastname}
                        </h1>
                        <h3> {this.props.values.occupation}</h3>
                    </div>
                    {/* End - Head */}
                    <div className="cv7-body">
                        <div className="cv7-bodyLeft">
                            {/* Summary */}
                            <div className="cv7-title">
                                <h3 className="cv7-titleText" style={{ color: primaryColor }}>
                                    {t('resume.personalSummary')}
                                </h3>
                            </div>
                            <div className="cv7-summary">
                                <p dangerouslySetInnerHTML={{ __html: sanitizeRichText(this.props.values.summary) }}></p>
                            </div>
                            {/* End - Summary */}
                            {/* EXPERIENCE */}
                            <div className="cv7-title">
                                <h3 className="cv7-titleText" style={{ color: primaryColor }}>
                                    {t('resume.employmentHistory')}
                                </h3>
                            </div>
                            <div className="cv7-employments">
                                {/* Employment Item */}
                                {this.returnEmployments()}
                            </div>
                            {/* End Experience */}
                            {/* EDUCATION */}
                            <div className="cv7-title">
                                <h3 className="cv7-titleText" style={{ color: primaryColor }}>
                                    {t('resume.educationHistory')}
                                </h3>
                            </div>
                            <div className="cv7-employments">
                                {this.returnEducations()}
                            </div>
                        </div>
                        {/* End Body Left */}
                        {/* Body Right */}
                        <div className="cv7-bodyRight">
                            {/* INFO */}
                            <div className="cv7-title">
                                <h3 className="cv7-titleText" style={{ color: primaryColor }}>
                                    {t('resume.info')}
                                </h3>
                            </div>
                            {/* Details */}
                            <div className="cv7-details">
                                {this.props.values.email && (
                                    <div className="cv7-detailsItem">
                                        <img src={Email} alt="email" />
                                        <span>{this.props.values.email}</span>
                                    </div>
                                )}
                                {this.props.values.phone && (
                                    <div className="cv7-detailsItem">
                                        <img src={Phone} alt="phone" />
                                        <span>{this.props.values.phone}</span>
                                    </div>
                                )}
                                {locationText && (
                                    <div className="cv7-detailsItem">
                                        <img src={Address} alt="address" />
                                        <span>{locationText}</span>
                                    </div>
                                )}
                            </div>
                            {/* End Details */}
                            {/* Skills */}
                            <div className="cv7-skills">
                                <div className="cv7-title">
                                    <h3 className="cv7-titleText" style={{ color: primaryColor }}>
                                        {t('resume.skills')}
                                    </h3>
                                </div>
                                {this.returnSkills()}
                            </div>
                            {/* Skills End */}
                            {/* Languages */}
                            <div className="cv7-languages">
                                <div className="cv7-title">
                                    <h3 class="cv7-titleText" style={{ color: primaryColor }}>
                                        {t('resume.languages')}
                                    </h3>
                                </div>
                                {this.returnLanguages()}
                            </div>
                            {/* End Languages */}
                        </div>
                        {/*End Body Right */}
                    </div>
                </div>{' '}
                {/* End Content */}
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Cv7);
export default MyComponent;
