import React, { Component } from 'react';
import SimpleInput from '../../Form/simple-input/SimpleInput';
import SimpleTextarea from '../../Form/simple-textarea/SimpleTextarea';

import './ActionCoverFilling.scss';
import { AnimatePresence, motion } from 'framer-motion';
import { BiPlus, BiTrash } from 'react-icons/bi';
import { FiX, FiType, FiList, FiGrid } from 'react-icons/fi';

class ActionCoverFilling extends Component {
    constructor(props) {
        super(props);
        this.state = {
            addFieldsShowed: false,
        };
        this.handleAddFieldsClick = this.handleAddFieldsClick.bind(this);
        this.adjustTextarea = this.adjustTextarea.bind(this);
        this.addItemToList = this.addItemToList.bind(this);
        this.handleListItemChange = this.handleListItemChange.bind(this);
        this.handleListNameChange = this.handleListNameChange.bind(this);
    }

    handleAddFieldsClick = (event) => {
        event.preventDefault();
        this.setState({
            addFieldsShowed: !this.state.addFieldsShowed,
        });
    };

    adjustTextarea(event) {
        var windowHeight = window.innerHeight;
        var elementHeight = event.target.getBoundingClientRect().top;
        console.log(windowHeight);
        console.log(elementHeight + 100);
    }

    addItemToList = (value, listName) => {
        this.props.handleListAddItem(value, listName);
    };

    handleListItemChange(listName, componentIndex, componentValue) {
        this.props.handleListItemChange(listName, componentIndex, componentValue);
    }
    handleListNameChange(ListName, value) {
        this.props.handleListNameChange(ListName, value);
    }

    render() {
        return (
            <div id="introd" className="action-introWrapper filling">
                {/* Head  */}
                {/* {JSON.stringify(this.props.values.components)} */}
                <div className="formHead">
                    <div className="cvTitle">
                        <span spellCheck="false" onBlur={this.handleTitleChange} suppressContentEditableWarning={true} contentEditable={true}>
                            {' '}
                            {this.props.values.title}
                        </span>
                    </div>
                    {/* {t("form.untitled")} */}
                    <div className="actionFilling__headAction">
                        <a onClick={() => this.props.resetNavigation()} className="authenticationButton">
                            return
                        </a>
                    </div>
                </div>
                {/* Head ends */}

                {/* Form */}

                <form>
                    <div className="sectionHeading">
                        <span className="sectionTitle">Personal Details</span>
                    </div>
                </form>
                <div className="grid-2-col">
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.firstname} title={'First Name'} name="First Name" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.lastname} title={'Last Name'} name="Last Name" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.email} title={'Email'} name="Email" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.phone} title={'Phone'} name="Phone" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.address} title={'Address'} name="Address" />

                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.city} title={'City'} name="City" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.postalcode} title={'Postal Code'} name="Postal Code" />
                </div>

                {/* Employer details */}

                <div className="sectionHeading">
                    <span className="sectionTitle">Employer Details</span>
                </div>

                <div className="grid-2-col">
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.employerFullName} title={'Employer Full Name'} name="Employer Full Name" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.companyName} title={'Company Name'} name="Company Name" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.companyAddress} title={'Company Address'} name="Company Address" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.companyCity} title={'Company City'} name="Company City" />
                    <SimpleInput handleInputs={this.props.handleInputs} value={this.props.values.companyCity} title={'Company Postal Code'} name="Company Postal Code" />
                </div>
                {/* Custom Fields going to be here */}

                {/* Components prompt image and text */}

                {this.props.values.components.length === 0 && (
                    <div className="cover-components">
                        <FiGrid className="cover-components-image" />
                        <h4 className="text-gray-800 text-lg font-semibold mb-2">Select a component</h4>
                        <p className="text-gray-600 text-sm">To fill your cover letter you need to select a component.</p>
                    </div>
                )}

                {/* <SimpleTextarea name="Paragraph" value={this.props.values.summary} handleInputs={this.props.handleInputs} title={'Paragraph'} /> */}

                {this.props.values.components.map((component, index) => {
                    if (component.type === 'Paragraph') {
                        return (
                            <div key={index} className="component-wrapper">
                                <div className="component-header">
                                    <span className="component-title">{component.name}</span>
                                    <button onClick={() => this.props.handleComponentDelete(component.name)} className="component-delete-btn" title="Remove component">
                                        <FiX className="w-4 h-4" />
                                    </button>
                                </div>
                                <SimpleTextarea name={component.name} value={component.content} handleInputs={this.props.handleCoverParagraphChange} title="" />
                            </div>
                        );
                    } else if (component.type === 'List') {
                        return (
                            <div key={index} className="component-wrapper list-component">
                                <div className="component-header">
                                    <span className="component-title">{component.name}</span>
                                    <button onClick={() => this.props.handleComponentDelete(component.name)} className="component-delete-btn" title="Remove component">
                                        <FiX className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="list-name-input">
                                    <label className="list-label">List Name</label>
                                    <input
                                        type="text"
                                        value={component.name}
                                        onChange={(event) => {
                                            this.handleListNameChange(component.name, event.target.value);
                                        }}
                                        className="list-name-field"
                                        placeholder="Enter list name"
                                    />
                                </div>

                                {/* List Items */}
                                <div className="list-items">
                                    <label className="list-label">List Items</label>
                                    {component.content.map((item, itemIndex) => (
                                        <div key={itemIndex} className="list-item">
                                            <div className="list-item-number">{itemIndex + 1}</div>
                                            <input
                                                type="text"
                                                value={item}
                                                onChange={(event) => {
                                                    this.handleListItemChange(component.name, itemIndex, event.target.value);
                                                }}
                                                className="list-item-field"
                                                placeholder="Enter list item"
                                            />
                                        </div>
                                    ))}

                                    <button onClick={() => this.addItemToList('', component.name)} className="add-item-btn" type="button">
                                        <BiPlus className="w-4 h-4" />
                                        <span>Add item</span>
                                    </button>
                                </div>
                            </div>
                        );
                    }
                })}

                {/* Add field separator */}
                <div className="cover-separator">
                    <div className="cover-separator-line"></div>
                </div>

                <div className="addFields">
                    <div className="addFields-wrapper">
                        <button onClick={(event) => this.handleAddFieldsClick(event)} className="add-component-btn" type="button">
                            <BiPlus className="w-5 h-5" />
                            <span>Add Component</span>
                        </button>

                        <AnimatePresence>
                            {this.state.addFieldsShowed && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    transition={{ duration: 0.15 }}
                                    className="addFieldsDrop">
                                    <div className="addFieldsDrop-head">
                                        <span>Available Components</span>
                                        <button onClick={() => this.setState({ addFieldsShowed: false })} className="close-dropdown-btn">
                                            <FiX className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="addFieldsDrop-items">
                                        <div
                                            className="component-option"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                this.props.handleParagraphAdd();
                                                this.setState({ addFieldsShowed: false });
                                            }}>
                                            <div className="component-option-icon">
                                                <FiType className="w-5 h-5" />
                                            </div>
                                            <div className="component-option-content">
                                                <span className="component-option-title">Paragraph</span>
                                                <span className="component-option-desc">Add a text paragraph to your cover letter</span>
                                            </div>
                                        </div>

                                        <div
                                            className="component-option"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                this.props.handleListAdd();
                                                this.setState({ addFieldsShowed: false });
                                            }}>
                                            <div className="component-option-icon">
                                                <FiList className="w-5 h-5" />
                                            </div>
                                            <div className="component-option-content">
                                                <span className="component-option-title">List</span>
                                                <span className="component-option-desc">Add a bulleted list to your cover letter</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        );
    }
}

export default ActionCoverFilling;
