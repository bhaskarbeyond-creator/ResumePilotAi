import React, { Component } from 'react';
import './Cover4.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { AiFillPhone } from 'react-icons/ai';
import { MdOutlineAlternateEmail } from 'react-icons/md';
import { IoLocationOutline } from 'react-icons/io5';

class Cover4Template extends Component {
    constructor(props) {
        super(props);
        this.renderComponents = this.renderComponents.bind(this);
        if (this.props.language) {
            i18n.changeLanguage(this.props.language);
        }
    }

    renderComponents() {
        const components = this.props.values?.components;
        if (Array.isArray(components) && components.length > 0) {
            return components.map((comp, i) => {
                if (comp.type === 'List') {
                    const list = Array.isArray(comp.content) ? comp.content : String(comp.content || '').split('\n').filter(Boolean);
                    return (
                        <div key={`component-${i}`} className="cover4-skills">
                            {comp.name && <h3>{comp.name}</h3>}
                            <ul>
                                {list.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                        </div>
                    );
                }
                const textContent = typeof comp.content === 'string' ? comp.content : String(comp.content || '');
                return (
                    <div key={`component-${i}`} className="cover4-paragraph">
                        <p>{textContent}</p>
                    </div>
                );
            });
        }

        const fallbackContent = this.props.values?.coverLetterContent || this.props.values?.letterBody;
        if (fallbackContent) {
            return fallbackContent.split(/\n\n+/).map((para, i) => (
                <div key={`para-${i}`} className="cover4-paragraph">
                    <p>{para.trim()}</p>
                </div>
            ));
        }

        return null;
    }

    render() {
        const v = this.props.values || {};
        const fullName = `${v.firstname || ''} ${v.lastname || ''}`.trim() || 'Candidate Name';
        const recipientName = v.employerFullName || v.recipientName || 'Hiring Manager';
        const addressLine = [v.address, v.city, v.postalcode || v.postalCode, v.country].filter(Boolean).join(', ');
        const companyAddressLine = [v.companyAddress, v.companyCity, v.companyPostalCode].filter(Boolean).join(', ');
        const todayDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        return (
            <div id="resumen" className="cover4-board">
                <div className="cover4-content">
                    {/* Head */}
                    <div className="cover4-head">
                        <h1>{fullName}</h1>
                        {v.occupation && <p className="cover4-job">{v.occupation}</p>}
                        <div className="cover4-contactInfo">
                            {v.phone && (
                                <div className="cover4-contactInfo-item">
                                    <AiFillPhone className="cover4-icon" />
                                    <span>{v.phone}</span>
                                </div>
                            )}
                            {v.email && (
                                <div className="cover4-contactInfo-item">
                                    <MdOutlineAlternateEmail className="cover4-icon" />
                                    <span>{v.email}</span>
                                </div>
                            )}
                            {addressLine && (
                                <div className="cover4-contactInfo-item">
                                    <IoLocationOutline className="cover4-icon" />
                                    <span>{addressLine}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Meta Row */}
                    <div className="cover4-meta-row">
                        <div className="cover4-receipentDetails">
                            {recipientName && <div className="cover4-receipentName">{recipientName}</div>}
                            {v.companyName && <div className="cover4-companyName">{v.companyName}</div>}
                            {companyAddressLine && <div className="cover4-receipentAddress">{companyAddressLine}</div>}
                        </div>
                        <div className="cover4-date">{todayDate}</div>
                    </div>

                    {/* Body */}
                    <div className="cover4-body">
                        <p className="cover4-salutation">Dear {recipientName},</p>
                        {this.renderComponents()}

                        <div className="cover4-signoff">
                            <p className="cover4-closing">Sincerely,</p>
                            <p className="cover4-signature-name">{fullName}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const Cover4 = withTranslation('common')(Cover4Template);
export default Cover4;
