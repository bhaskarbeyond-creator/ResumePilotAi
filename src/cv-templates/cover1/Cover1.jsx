import React, { Component } from 'react';
import './Cover1.scss';
import { withTranslation } from 'react-i18next';
import i18n from '../../i18n';
class Cover1Template extends Component {
   constructor(props) {
      super(props);

      this.renderComponents = this.renderComponents.bind(this);

      i18n.changeLanguage(this.props.language);
   }

   /// Function that return components
   renderComponents() {
      let array = [];

      if(this.props.values?.components !== undefined){
      for (let i = 0; i < this.props.values.components.length; i++) {
         if (this.props.values.components[i].type == 'Paragraph') {
            array.push(
               <div className="cover1-paragraph">
                  <p>{this.props.values.components[i].content}</p>
               </div>
            );
         } else if (this.props.values.components[i].type == 'List') {
            let list = this.props.values.components[i].content;

            array.push(
               <div className="cover1-skills">
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
            <div className="cover1-content">
               {/* Head */}
               <div className="cover1-head">
                  <h1 className="cover1-name">
                     {this.props.values?.firstname} {this.props.values?.lastname}
                  </h1>
                  <p className="cover1-address">
                     {this.props.values?.address}, {this.props.values?.city},{' '}
                     {this.props.values?.postalcode}
                  </p>
                  <p className="cover1-phone">{this.props.values?.phone}</p>
                  <p className="cover1-email">{this.props.values?.email}</p>
               </div>
               {/* Separator Line */}
               <div className="cover1-separatorLine"></div>
               {/* Receipent Details */}
               <div className="cover1-receipentDetails">
                  <p className="cover1-receipentName">{this.props.values?.employerFullName}</p>
                  <p className="cover1-companyName">{this.props.values?.companyName}</p>
                  <p className="cover1-receipentAddress">
                     {this.props.values?.companyAddress},
                     <br /> {this.props.values?.companyCity}, {this.props.values?.companyPostalCode}
                  </p>
               </div>
               {/* Cover inner Content */}

               <div className="cover1-innerContent">
                  <p>Dear {this.props.values?.employerFullName}</p>

                  {this.renderComponents()}
               </div>
            </div>
         </div>
      );
   }
}
const Cover1 = withTranslation('common')(Cover1Template);
export default Cover1;
