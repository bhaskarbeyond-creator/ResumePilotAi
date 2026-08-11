import React, { Component } from 'react';
import './Cv51.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import europassLogo from '../../assets/europass.png';
import { FiMapPin, FiPhone, FiMail, FiGlobe, FiMessageCircle } from 'react-icons/fi';
import { FaLocationDot,FaPhone  } from 'react-icons/fa6';
import { IoMail } from "react-icons/io5";

class Cv51 extends Component {
    constructor(props) {
        super(props);
        document.getElementsByTagName('body')[0].style.overflow = 'none';
        i18n.changeLanguage(this.props.language);
        this.returnMotherTongues = this.returnMotherTongues.bind(this);
        this.returnOtherLanguageNames = this.returnOtherLanguageNames.bind(this);
        this.returnOtherLanguagesTable = this.returnOtherLanguagesTable.bind(this);
        this.returnSkills = this.returnSkills.bind(this);
        this.returnEmployments = this.returnEmployments.bind(this);
        this.returnEducations = this.returnEducations.bind(this);
    }

    // Get primary color from props or default to Europass blue
    getPrimaryColor() {
        return this.props.values?.colors?.primary || '#0066CC';
    }

    // Get secondary color from props or default to light gray
    getSecondaryColor() {
        return this.props.values?.colors?.secondary || '#f8f9fa';
    }

    // Map language levels to CEFR levels
    mapToCEFRLevel(level) {
        const levelMap = {
            native: 'C2',
            fluent: 'C2',
            advanced: 'C1',
            proficient: 'B2',
            intermediate: 'B1',
            elementary: 'A2',
            basic: 'A1',
            beginner: 'A1',
        };
        return levelMap[level.toLowerCase()] || 'B1';
    }

    returnMotherTongues() {
        // First check if there's a dedicated mother tongue field
        if (this.props.values.motherTongue && this.props.values.motherTongue.trim() !== '') {
            return this.props.values.motherTongue;
        }

        // Fall back to the original logic if no mother tongue field is set
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        // Filter for native languages
        var motherTongues = tempLanguages.filter((lang) => lang.level.toLowerCase() === 'native');

        if (motherTongues.length === 0) {
            // If no native languages, take the first language as mother tongue
            motherTongues = tempLanguages.slice(0, 1);
        }

        return motherTongues.map((lang) => lang.name).join(', ');
    }

    getOtherLanguages() {
        var tempLanguages = this.props.values.languages.sort(function (a, b) {
            return a.date - b.date;
        });

        // Filter out native languages for the table
        var otherLanguages = tempLanguages.filter((lang) => lang.level.toLowerCase() !== 'native');

        // If all languages are native, show them in the table anyway
        if (otherLanguages.length === 0 && tempLanguages.length > 1) {
            otherLanguages = tempLanguages.slice(1);
        }

        return otherLanguages;
    }

    returnOtherLanguageNames() {
        const otherLanguages = this.getOtherLanguages();

        if (otherLanguages.length === 0) {
            return null;
        }

        return (
            <div className="cv51-language-names">
                {otherLanguages.map((language, index) => (
                    <div key={index} className="cv51-language-name-item">
                        <div className="cv51-language-name">{language.name}</div>
                    </div>
                ))}
            </div>
        );
    }

    returnOtherLanguagesTable() {
        const otherLanguages = this.getOtherLanguages();

        if (otherLanguages.length === 0) {
            return null;
        }

        return (
            <div className="cv51-languages-table">
                <div className="cv51-table-header">
                    <div className="cv51-understanding-col">
                        <div className="cv51-understanding-header">UNDERSTANDING</div>
                        <div className="cv51-understanding-subheaders">
                            <div className="cv51-subheader">Listening</div>
                            <div className="cv51-subheader">Reading</div>
                        </div>
                    </div>
                    <div className="cv51-speaking-col">
                        <div className="cv51-speaking-header">SPEAKING</div>
                        <div className="cv51-speaking-subheaders">
                            <div className="cv51-subheader">Spoken interaction</div>
                            <div className="cv51-subheader">Spoken production</div>
                        </div>
                    </div>
                    <div className="cv51-writing-col">WRITING</div>
                </div>

                {otherLanguages.map((language, index) => {
                    // Use specific CEFR levels if available, otherwise fall back to mapped level
                    const listeningLevel = language.listening || this.mapToCEFRLevel(language.level);
                    const readingLevel = language.reading || this.mapToCEFRLevel(language.level);
                    const spokenInteractionLevel = language.spokenInteraction || this.mapToCEFRLevel(language.level);
                    const spokenProductionLevel = language.spokenProduction || this.mapToCEFRLevel(language.level);
                    const writingLevel = language.writing || this.mapToCEFRLevel(language.level);

                    // Generate certification text
                    const getCertification = (languageName) => {
                        const certifications = {
                            English: 'CAE, Cambridge University',
                            German: 'GCSE German',
                            Italian: 'Foreign Language Center, Faculty od Philosophy, University of Zagreb, degree 6',
                            Spanish: 'Instituto Cervantes, Madrid',
                            French: 'GCSE French',
                        };
                        return certifications[languageName] || 'Language Center, not set certification';
                    };

                    return (
                        <div key={index} className="cv51-language-entry">
                            <div className="cv51-language-row">
                                <div className="cv51-understanding-cells">
                                    <div className="cv51-level-cell">{listeningLevel}</div>
                                    <div className="cv51-level-cell">{readingLevel}</div>
                                </div>
                                <div className="cv51-speaking-cells">
                                    <div className="cv51-level-cell">{spokenInteractionLevel}</div>
                                    <div className="cv51-level-cell">{spokenProductionLevel}</div>
                                </div>
                                <div className="cv51-writing-cell">{writingLevel}</div>
                            </div>
                            <div className="cv51-certification-row">
                                <div className="cv51-certification-text">{getCertification(language.name)}</div>
                            </div>
                        </div>
                    );
                })}

                <div className="cv51-cefr-reference">
                    <span className="cv51-cefr-text">Levels: A1/A2: Basic user - B1/B2: Independent user - C1/C2: Proficient user</span>
                    <br />
                    <span className="cv51-cefr-link">Common European Framework of Reference for Languages</span>
                </div>
            </div>
        );
    }

    returnSkills() {
        var elements = [];
        var tempSkills = this.props.values.skills.sort(function (a, b) {
            return a.date - b.date;
        });

        for (let index = 0; index < tempSkills.length; index++) {
            elements.push(
                <div key={index} className="cv51-skill-item">
                    <span className="cv51-skill-name">{tempSkills[index].name}</span>
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
                <div key={index} className="cv51-experience-section">
                    <div className="cv51-section-left">
                        <div className="cv51-date-range">
                            {tempEmployments[index].begin} – {tempEmployments[index].end}
                        </div>
                    </div>
                    <div className="cv51-section-right">
                        <div className="cv51-experience-content">
                            <div className="cv51-job-title">{tempEmployments[index].jobTitle}</div>
                            {/* <div className="cv51-employer">{tempEmployments[index].employer}</div> */}
                            <div className="cv51-description" dangerouslySetInnerHTML={{ __html: tempEmployments[index].description }} />
                            <div className="cv51-sector">
                                <span className="cv51-sector-label">Business or sector</span> {tempEmployments[index].employer || 'Information and communication'}
                            </div>
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
                <div key={index} className="cv51-education-section">
                    <div className="cv51-section-left">
                        <div className="cv51-date-range">
                            {tempEducations[index].started} – {tempEducations[index].finished}
                        </div>
                    </div>
                    <div className="cv51-section-right">
                        <div className="cv51-education-content">
                            <div className="cv51-degree">{tempEducations[index].degree}</div>
                            <div className="cv51-school">{tempEducations[index].school}</div>
                            <div className="cv51-description" dangerouslySetInnerHTML={{ __html: tempEducations[index].description }} />
                            {/* <div className="cv51-sector">
                                <span className="cv51-sector-label">Business or sector</span> {tempEducations[index].sector || 'Information and communication'}
                            </div> */}
                        </div>
                    </div>
                </div>
            );
        }
        return elements;
    }

    render() {
        const { t } = this.props;
        const primaryColor = this.getPrimaryColor();

        return (
            <div id="resumen" className="cv51-board">
                <div className="cv51-content">
                    {/* Header with Europass logo and name */}
                    <div className="cv51-header">
                        <div className="cv51-logo-section">
                            <img src={europassLogo} alt="Europass" className="cv51-europass-logo" />
                            <span className="cv51-curriculum-vitae">Curriculum Vitae</span>
                        </div>
                    </div>

                    {/* Personal Information Section */}
                    <div className="cv51-section">
                        <div className="cv51-section-left">
                            <h2 className="cv51-section-title">PERSONAL INFORMATION</h2>
                        </div>
                        <div className="cv51-section-right">
                            <div className="cv51-name-display">
                                <span className="cv51-name-large">
                                    {this.props.values.firstname} {this.props.values.lastname}
                                </span>
                            </div>
                            <div className="cv51-contact-info">
                                <div className="cv51-contact-item">
                                    <FaLocationDot  className="cv51-contact-icon" />
                                    <span>
                                        {this.props.values.address}, {this.props.values.postalcode} {this.props.values.city} {this.props.values.country && `(${this.props.values.country})`}
                                    </span>
                                </div>
                                <div className="cv51-contact-item">
                                    <FaPhone className="cv51-contact-icon" />
                                    <span>{this.props.values.phone}</span>
                                </div>
                                <div className="cv51-contact-item">
                                    <IoMail className="cv51-contact-icon" />
                                    <span>{this.props.values.email}</span>
                                </div>
                                {this.props.values.website && (
                                    <div className="cv51-contact-item">
                                        <FiGlobe className="cv51-contact-icon" />
                                        <span>{this.props.values.website}</span>
                                    </div>
                                )}
                                {this.props.values.linkedin && (
                                    <div className="cv51-contact-item">
                                        <FiMessageCircle className="cv51-contact-icon" />
                                        <span>Skype {this.props.values.linkedin}</span>
                                    </div>
                                )}
                            </div>
                            <div className="cv51-personal-details">
                                <span>
                                    <span>Sex</span> {this.props.values.gender || 'Female'} | <span>Date of birth</span> {this.props.values.dateOfBirth || '01/04/1964'} | <span>Nationality</span>{' '}
                                    {this.props.values.nationality || 'Italian'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Work Experience Section */}
                    <div className="cv51-main-section">
                        <div className="cv51-section-header">
                            <div className="cv51-section-left">
                                <h2 className="cv51-section-title">WORK EXPERIENCE</h2>
                            </div>
                            <div className="cv51-section-right">
                                <div className="cv51-blue-line-with-square"></div>
                            </div>
                        </div>
                        <div className="cv51-experience-list">{this.returnEmployments()}</div>
                    </div>

                    {/* Education and Training Section */}
                    <div className="cv51-main-section">
                        <div className="cv51-section-header">
                            <div className="cv51-section-left">
                                <h2 className="cv51-section-title">EDUCATION AND TRAINING</h2>
                            </div>
                            <div className="cv51-section-right">
                                <div className="cv51-blue-line-with-square"></div>
                            </div>
                        </div>
                        <div className="cv51-education-list">{this.returnEducations()}</div>
                    </div>

                    {/* Personal Skills Section */}
                    {(this.props.values.languages.length > 0 || this.props.values.skills.length > 0) && (
                        <div className="cv51-main-section">
                            <div className="cv51-section-header">
                                <div className="cv51-section-left">
                                    <h2 className="cv51-section-title">PERSONAL SKILLS</h2>
                                </div>
                                <div className="cv51-section-right">
                                    <div className="cv51-blue-line-with-square"></div>
                                </div>
                            </div>
                            <div className="cv51-section-content">
                                <div className="cv51-section-left">
                                    {/* Language Names in Left Column */}
                                    {this.props.values.languages.length > 0 && this.returnOtherLanguageNames() && (
                                        <div className="cv51-other-languages-left">
                                            <h3 className="cv51-other-languages-title">Mother Tongue(s)</h3>
                                            <h3 className="cv51-other-languages-subtitle">Other language(s)</h3>
                                            {this.returnOtherLanguageNames()}
                                        </div>
                                    )}
                                </div>
                                <div className="cv51-section-right">
                                    {/* Mother Tongues */}
                                    {this.props.values.languages.length > 0 && (
                                        <div className="cv51-subsection">
                                            <h3 className="cv51-subsection-title" style={{ height: '18px' }}></h3>
                                            <div className="cv51-mother-tongues">{this.returnMotherTongues()}</div>
                                        </div>
                                    )}

                                    {/* Other Languages Table */}
                                    {this.props.values.languages.length > 0 && this.returnOtherLanguagesTable() && <div className="cv51-subsection">{this.returnOtherLanguagesTable()}</div>}

                                    {/* Skills */}
                                    {this.props.values.skills.length > 0 && (
                                        <div className="cv51-subsection">
                                            <h3 className="cv51-subsection-title">Digital competence</h3>
                                            <div className="cv51-skills-list">{this.returnSkills()}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Additional Information Section */}
                    {this.props.values.summary && (
                        <div className="cv51-main-section">
                            <div className="cv51-section-header">
                                <div className="cv51-section-left">
                                    <h2 className="cv51-section-title">ADDITIONAL INFORMATION</h2>
                                </div>
                                <div className="cv51-section-right">
                                    <div className="cv51-blue-line-with-square"></div>
                                </div>
                            </div>
                            <div className="cv51-section-content">
                                <div className="cv51-section-left"></div>
                                <div className="cv51-section-right">
                                    <div className="cv51-additional-info">
                                        <div dangerouslySetInnerHTML={{ __html: this.props.values.summary }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="cv51-footer">
                        <span>© European Union, 2002-205 | http://europass.cedefop.europa.eu</span>
                        {/* <span className="cv51-page-number">Page 1 / 2</span> */}
                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Cv51);
export default MyComponent;
