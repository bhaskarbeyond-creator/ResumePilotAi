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

        i18n.changeLanguage(this.props.language);
    }

    /// Function that return components
    renderComponents() {
        let array = [];

        if (this.props.values?.components !== undefined) {
            for (let i = 0; i < this.props.values.components.length; i++) {
                if (this.props.values.components[i].type == 'Paragraph') {
                    array.push(
                        <div className="cover4-paragraph">
                            <p>{this.props.values.components[i].content}</p>
                        </div>
                    );
                } else if (this.props.values.components[i].type == 'List') {
                    let list = this.props.values.components[i].content;

                    array.push(
                        <div className="cover4-skills">
                            <h3>{this.props.values.components[i].name}</h3>
                            <ul>
                                {list.map((item, index) => {
                                    return <li key={index}>{item}</li>;
                                })}
                            </ul>
                        </div>
                    );
                }
            }
        }

        return array;
    }

    render() {
        const { t } = this.props;
        return (
            <div id="resumen" className="cv9-board">
                <div className="cover4-content">
                    {/* Head */}
                    <div className="cover4-head">
                        <h1>{this.props.values.firstname} {this.props.values.lastname}</h1>
                        <p className="cover4-job">{this.props.values.occupation}</p>
                        <div className="cover4-contactInfo">
                            {/* Use react-icons library */}
                            <div className="cover4-contactInfo-item">
                                <AiFillPhone className="cover4-icon" />
                                <p>{this.props.values.phone}</p>
                            </div>
                            {/*  EMAIL */}
                            <div className="cover4-contactInfo-item">
                                <MdOutlineAlternateEmail className="cover4-contactInfo-item" />
                                <p>{this.props.values.email}</p>
                            </div>
                            {/*  ADDRESS */}
                            <div className="cover4-contactInfo-item">
                                <IoLocationOutline className="cover4-contactInfo-item" />
                                <p> {this.props.values.address}, {this.props.values.city},{this.props.values.postalecode}</p>
                            </div>
                        </div>
                    </div>
                    {/* Body */}
                    <div className="cover4-body">{this.renderComponents()}</div>
                </div>
            </div>
        );
    }
}
const Cover4 = withTranslation('common')(Cover4Template);
export default Cover4;
