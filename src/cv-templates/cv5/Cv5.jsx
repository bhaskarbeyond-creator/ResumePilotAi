import { sanitizeRichText } from '../../utils/sanitizeHtml';
import React, { Component } from 'react';
import './Cv5.scss';
import Address from '../../assets/cv2-assets/address.png';
import Phone from '../../assets/cv2-assets/phone-call.png';
import Email from '../../assets/cv2-assets/envelope.png';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { getContrastTextColor, formatLocation, formatDateRange, getAvatarUrl } from '../templateUtils';

class Cv5 extends Component {
    constructor(props) {
        super(props);
        this.returnLanguages = this.returnLanguages.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
        i18n.changeLanguage(this.props.language);
    }

    // Color helper methods
    getPrimaryColor() {
        return this.props.values?.colors?.primary || '#059669';
    }

    getSecondaryColor() {
        return this.props.values?.colors?.secondary || '#2d3039';
    }

    returnLanguages() {
        if (!this.props.values?.languages?.length) return null;
        var elements = [];
        for (let index = 0; index < this.props.values.languages.length; index++) {
            elements.push(
                <div key={index} className="cv5-languagesItem">
                    <span>{this.props.values.languages[index].name}</span>
                    <span>{this.props.values.languages[index].level}</span>
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
                <div key={index} className="cv5-jobItem">
                    <div className="cv5-jobTitle">{item.jobTitle}</div>
                    <div className="cv5-jobDate">
                        {item.employer}{dateStr ? ` | ${dateStr}` : ''}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                </div>
            );
        }
        return elements;
    }

    returnSkills() {
        var elements = [];
        for (let index = 0; index < (this.props.values.skills || []).length; index++) {
            elements.push(
                <div key={index} className="cv5-skillItem">
                    <span> {this.props.values.skills[index].name}</span>
                    <div className="cv5-ratingWrapper" style={{ border: `2px solid ${this.getPrimaryColor()}` }}>
                        <div style={{ width: (this.props.values.skills[index].rating || 75) + '%', backgroundColor: this.getPrimaryColor() }} className="cv5-rating"></div>
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
                <div key={index} className="cv5-jobItem">
                    <div className="cv5-jobTitle">{item.degree}</div>
                    <div className="cv5-jobDate">
                        {item.school}{dateStr ? ` | ${dateStr}` : ''}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }} />
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const secondaryBg = this.getSecondaryColor();
        const sidebarTextColor = getContrastTextColor(secondaryBg, '#ffffff');
        const locationText = formatLocation(
            this.props.values.address,
            this.props.values.city,
            this.props.values.country,
            this.props.values.postalcode
        );

        return (
            <div id="resumen" className="cv5-board">
                {/* Content */}
                <div className="cv5-content">
                    <div className="cv5-left" style={{ backgroundColor: secondaryBg, color: sidebarTextColor }}>
                        {/* Photo */}
                        <div className="cv5-photo">
                            {this.props.values.photo ? (
                                <img className="photo" src={this.props.values.photo} alt="profile" />
                            ) : (
                                <div style={{
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    backgroundColor: this.getPrimaryColor(),
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '36px',
                                    fontWeight: 'bold'
                                }}>
                                    {((this.props.values.firstname?.[0] || '') + (this.props.values.lastname?.[0] || '')).toUpperCase() || 'CV'}
                                </div>
                            )}
                        </div>
                        {/* Contact Details */}
                        <div className="cv5-leftSection">
                            <div className="cv5-leftSectionContent">
                                <div className="cv5-leftSectionTitle" style={{ color: sidebarTextColor, borderColor: sidebarTextColor }}>
                                    <span>{t('resume.info')}</span>
                                </div>
                                <div className="cv5-contactItems">
                                    <ul style={{ color: sidebarTextColor }}>
                                        <li>
                                            {this.props.values.phone && (
                                                <div className="cv5-contactItem">
                                                    <img src={Phone} alt="phone" />
                                                    <span style={{ color: sidebarTextColor }}>{this.props.values.phone}</span>
                                                </div>
                                            )}
                                            {this.props.values.email && (
                                                <div className="cv5-contactItem">
                                                    <img src={Email} alt="email" />
                                                    <span style={{ color: sidebarTextColor }}>{this.props.values.email}</span>
                                                </div>
                                            )}
                                            {locationText && (
                                                <div className="cv5-contactItem">
                                                    <img src={Address} alt="address" />
                                                    <span style={{ color: sidebarTextColor }}>{locationText}</span>
                                                </div>
                                            )}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>{' '}
                        {/* Left Section end  */}
                        {/* Languages  */}
                        <div className="cv5-leftSection">
                            <div className="cv5-leftSectionContent">
                                <div className="cv5-leftSectionTitle">
                                    <span>{t('resume.languages')}</span>
                                </div>
                                <div className="cv5-languagesItems">
                                    {/* Languages here */}
                                    {this.returnLanguages()}
                                </div>
                            </div>
                        </div>{' '}
                        {/* Languages end  */}
                        {/* Skills  */}
                        <div className="cv5-leftSection">
                            <div className="cv5-leftSectionContent">
                                <div className="cv5-leftSectionTitle">
                                    <span>{t('resume.skills')}</span>
                                </div>
                                <div className="cv5-skillsItems">
                                    {/* SKills here */}
                                    {this.returnSkills()}
                                </div>
                            </div>
                        </div>{' '}
                        {/* Languages end  */}
                    </div>
                    <div className="cv5-right">
                        <div className="cv5-rightContent">
                            {/* Head Start */}
                            <div className="cv5-rightHead">
                                <h1 className="cv5-name" style={{ color: this.getPrimaryColor() }}>
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </h1>
                                <span className="cv5-occupation">{this.props.values.occupation}</span>
                            </div>{' '}
                            {/* Head End */}
                            {/* Summary */}
                            <div className="cv5-summary">
                                <div className="cv5-rightSectionTitle">
                                    <span style={{ color: this.getPrimaryColor() }}>{t('resume.personalSummary')}</span>
                                </div>
                                <div dangerouslySetInnerHTML={{ __html: sanitizeRichText(this.props.values.summary) }} />
                            </div>
                            {/* End : Summary */}
                            {/* Experience */}
                            <div className="cv5-experience">
                                <div className="cv5-rightSectionTitle">
                                    <span style={{ color: this.getPrimaryColor() }}>{t('resume.employmentHistory')}</span>
                                </div>
                                {/* Employment Item */}
                                {this.returnEmployments()}
                            </div>
                            {/* End:Experience */}
                            {/* Education */}
                            <div className="cv5-experience">
                                <div className="cv5-rightSectionTitle">
                                    <span style={{ color: this.getPrimaryColor() }}>{t('resume.educationHistory')}</span>
                                </div>
                                {/* Education Item */}
                                {this.returnEducations()}
                            </div>
                            {/* End:Experience */}
                        </div>
                    </div>
                </div>{' '}
                {/* End Content */}
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(Cv5);
export default MyComponent;
