import React, { Component } from 'react';
import './Cover3.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';

class Cover3Template extends Component {
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
                        <div key={`component-${i}`} className="cover3-skills">
                            {comp.name && <h3>{comp.name}</h3>}
                            <ul>
                                {list.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                        </div>
                    );
                }
                const textContent = typeof comp.content === 'string' ? comp.content : String(comp.content || '');
                return (
                    <div key={`component-${i}`} className="cover3-paragraph">
                        <p>{textContent}</p>
                    </div>
                );
            });
        }

        const fallbackContent = this.props.values?.coverLetterContent || this.props.values?.letterBody;
        if (fallbackContent) {
            return fallbackContent.split(/\n\n+/).map((para, i) => (
                <div key={`para-${i}`} className="cover3-paragraph">
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
            <div id="resumen" className="cover3-board">
                <div className="cover3-content">
                    {/* Head */}
                    <div className="cover3-head">
                        <div className="cover3-title-area">
                            <h1>{fullName}</h1>
                            {v.occupation && <p className="cover3-subtitle">{v.occupation}</p>}
                        </div>
                        <div className="cover3-date">{todayDate}</div>
                    </div>

                    {/* Body */}
                    <div className="cover3-body">
                        <div className="cover3-body-left">
                            <p className="cover3-salutation">Dear {recipientName},</p>
                            {this.renderComponents()}

                            <div className="cover3-signoff">
                                <p className="cover3-closing">Sincerely,</p>
                                <p className="cover3-signature-name">{fullName}</p>
                            </div>
                        </div>

                        <div className="cover3-body-right">
                            <div className="cover3-card-section">
                                <h2>Recipient</h2>
                                {recipientName && <p><strong>{recipientName}</strong></p>}
                                {v.companyName && <p>{v.companyName}</p>}
                                {companyAddressLine && <p>{companyAddressLine}</p>}
                            </div>

                            <div className="cover3-card-section sender-block">
                                <h2>Sender</h2>
                                <p><strong>{fullName}</strong></p>
                                {addressLine && <p>{addressLine}</p>}
                                {v.phone && <p>{v.phone}</p>}
                                {v.email && <p>{v.email}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const Cover3 = withTranslation('common')(Cover3Template);
export default Cover3;
