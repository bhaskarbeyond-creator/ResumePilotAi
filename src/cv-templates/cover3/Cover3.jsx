import React, { Component } from 'react';
import './Cover3.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
class Cover3Template extends Component {
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
                        <div className="cover3-paragraph">
                            <p>{this.props.values.components[i].content}</p>
                        </div>
                    );
                } else if (this.props.values.components[i].type == 'List') {
                    let list = this.props.values.components[i].content;

                    array.push(
                        <div className="cover3-skills">
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
                <div className="cover3-content">
                    {/* Head */}
                    <div className="cover3-head">
                        <h1> {this.props.values?.firstname}  {this.props.values?.lastname}</h1>
                        <p></p>
                    </div>
                    {/* Body */}
                    <div className="cover3-body">
                        <div className="cover3-body-left">
                            {this.renderComponents()}
                            </div>
                        <div className="cover3-body-right">
                            {/* Title */}
                            <div className="cover3-title">
                                <h2>To</h2>
                                <p> {this.props.values?.companyName}</p>
                                <p>{this.props.values?.employerFullName}</p>
                                <p> {this.props.values?.companyAddress}, {this.props.values?.companyCity}</p>
                                <p> {this.props.values?.companyPostalCode}</p>
                                <h2>From</h2>
                                <p>{this.props.values?.firstname} {this.props.values?.lastname}</p>
                                <p>{this.props.values?.address}, {this.props.values?.city}, {this.props.values?.postalcode}</p>
                                <p>{this.props.values?.phone}</p>
                                <p>{this.props.values?.email}</p>
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
