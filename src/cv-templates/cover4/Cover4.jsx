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
        const recipientName = v.employerFullName || v.recipientName || 'Hiring Manager';
        const addressLine = [v.address, v.city, v.postalcode || v.postalCode, v.country].filter(Boolean).join(', ');
        const companyAddressLine = [v.companyAddress, v.companyCity, v.companyPostalCode].filter(Boolean).join(', ');

        return (
            <div id="resumen" className="cv9-board">
                <div className="cover4-content">
                    {/* Head */}
                    <div className="cover4-head">
                        <h1>{v.firstname} {v.lastname}</h1>
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

                    {/* Recipient Details */}
                    {(recipientName || v.companyName || companyAddressLine) && (
                        <div className="cover4-receipentDetails">
                            {recipientName && <p className="cover4-receipentName">{recipientName}</p>}
                            {v.companyName && <p className="cover4-companyName">{v.companyName}</p>}
                            {companyAddressLine && <p className="cover4-receipentAddress">{companyAddressLine}</p>}
                        </div>
                    )}

                    {/* Body */}
                    <div className="cover4-body">
                        <p>Dear {recipientName},</p>
                        {this.renderComponents()}
                    </div>
                </div>
            </div>
        );
    }
}

const Cover4 = withTranslation('common')(Cover4Template);
export default Cover4;
