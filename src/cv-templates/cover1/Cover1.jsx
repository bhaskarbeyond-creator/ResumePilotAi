import React, { Component } from 'react';
import './Cover1.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cover1Template extends Component {
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
                        <div key={`component-${i}`} className="cover1-skills">
                            {comp.name && <h3>{comp.name}</h3>}
                            <ul>
                                {list.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                        </div>
                    );
                }
                const textContent = typeof comp.content === 'string' ? comp.content : String(comp.content || '');
                return (
                    <div key={`component-${i}`} className="cover1-paragraph">
                        <p>{textContent}</p>
                    </div>
                );
            });
        }

        const fallbackContent = this.props.values?.coverLetterContent || this.props.values?.letterBody;
        if (fallbackContent) {
            return fallbackContent.split(/\n\n+/).map((para, i) => (
                <div key={`para-${i}`} className="cover1-paragraph">
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
            <div id="resumen" className="cover1-board">
                <div className="cover1-content">
                    {/* Head */}
                    <div className="cover1-head">
                        <h1 className="cover1-name">{fullName}</h1>
                        {addressLine && <p className="cover1-address">{addressLine}</p>}
                        {(v.phone || v.email) && (
                            <div className="cover1-contact-row">
                                {v.phone && <span>{v.phone}</span>}
                                {v.phone && v.email && <span>•</span>}
                                {v.email && <span>{v.email}</span>}
                            </div>
                        )}
                    </div>

                    {/* Separator Line */}
                    <div className="cover1-separatorLine" />

                    {/* Meta Row: Recipient details and Date */}
                    <div className="cover1-meta-row">
                        <div className="cover1-receipentDetails">
                            {recipientName && <div className="cover1-receipentName">{recipientName}</div>}
                            {v.companyName && <div className="cover1-companyName">{v.companyName}</div>}
                            {companyAddressLine && <div className="cover1-receipentAddress">{companyAddressLine}</div>}
                        </div>
                        <div className="cover1-date">{todayDate}</div>
                    </div>

                    {/* Cover inner Content */}
                    <div className="cover1-innerContent">
                        <p className="cover1-salutation">Dear {recipientName},</p>
                        {this.renderComponents()}

                        <div className="cover1-signoff">
                            <p className="cover1-closing">Sincerely,</p>
                            <p className="cover1-signature-name">{fullName}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const Cover1 = withTranslation('common')(Cover1Template);
export default Cover1;
