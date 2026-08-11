import React, { Component } from 'react';
import './Action.scss';
import ActionIntroduction from '../action-step-introduction/ActionIntroduction';
import ActionStepSelection from '../action-step-selection/ActionSelection';
import ActionFilling from '../action-step-filling/ActionFilling';
import ActionCoverFilling from '../action-step-cover-filling/ActionCoverFilling';
import Dashboard2 from '../../Dashboard2/dashboard2';

class Action extends Component {
    constructor(props) {
        super(props);
    }
    /// This  class have nextStep passed to it in props so we be able to navigate between steps
    // Note Step state is handled in parent to render the right components
    render() {
        // Checking which step is passed to the action wrapper and render the right component

        switch (this.props.currentStep) {
            case 'Introduction':
                return (
                    // <ActionIntroduction
                    //     values={this.props.values}
                    //     handleLanguageClick={this.props.handleLanguageClick}
                    //     goThirdStep={this.props.goThirdStep}
                    //     isAuthShowed={this.props.values.isAuthShowed}
                    //     authBtnHandler={this.props.authBtnHandler}
                    //     logout={this.props.logout}
                    //     user={this.props.user}
                    //     goCoverStep={this.props.goCoverStep}
                    //     goToCoverSelection={this.props.goToCoverSelection}
                    //     goToResumeSelectionStep={this.props.goToResumeSelectionStep}
                    // />
                    <Dashboard2 
                    
                    values={this.props.values}
                    currentStep={this.props.currentStep}
                    setCurrentStep={this.props.setCurrentStep}
                    nextStep={this.props.nextStep}
                    stepBack={this.props.stepBack}
                    handleInputs={this.props.handleInputs}
                    logout={this.props.logout}
                    user={this.props.user}
                    authBtnHandler={this.props.authBtnHandler}
                    goToResumeSelectionStep={this.props.goToResumeSelectionStep}
                    goToCoverSelection={this.props.goToCoverSelection}
                    />
                );
            case 'Template Selection':
                return (
                    <ActionStepSelection
                        setCurrentStep={this.props.setCurrentStep}
                        isAuthShowed={this.props.isAuthShowed}
                        authBtnHandler={this.props.authBtnHandler}
                        logout={this.props.logout}
                        user={this.props.user}
                        handlePreviewToggle={this.props.handlePreviewToggle}
                        currentStep={this.props.currentStep}
                        nextStep={this.props.nextStep}
                        stepBack={this.props.stepBack}
                        resetNavigation={this.props.resetNavigation}
                        changeResumeName={this.props.changeResumeName}

                    />
                );
            case 'Adding Data':
                return (
                    <ActionFilling
                        stepBack={this.props.stepBack}
                        removeSkill={this.props.removeSkill}
                        removeLanguage={this.props.removeLanguage}
                        removeEducation={this.props.removeEducation}
                        removeEmployment={this.props.removeEmployment}
                        currentResumeName={this.props.currentResumeName}
                        handleLanguageClick={this.props.handleLanguageClick}
                        values={this.props.values}
                        logout={this.props.logout}
                        user={this.props.user}
                        handleDelete={this.props.handleDelete}
                        progress={this.props.progress}
                        handleInputs={this.props.handleInputs}
                        resetNavigation={this.props.resetNavigation}
                        addSummary={this.props.addSummary}
                        goToResumeSelectionStep={this.props.goToResumeSelectionStep}
                    />
                );

            case 'Action Cover Selection':
                return (
                    <ActionStepSelection
                        setCurrentStep={this.props.setCurrentStep}
                        isAuthShowed={this.props.isAuthShowed}
                        authBtnHandler={this.props.authBtnHandler}
                        logout={this.props.logout}
                        user={this.props.user}
                        handlePreviewToggle={this.props.handlePreviewToggle}
                        values={this.props.values}
                        currentStep={this.props.currentStep}
                        nextStep={this.props.nextStep}
                        stepBack={this.props.stepBack}
                        resetNavigation={this.props.resetNavigation}
                        changeResumeName={this.props.changeResumeName}
                    />
                );

            case 'Cover Filling':
                return (
                    <ActionCoverFilling
                        stepBack={this.props.stepBack}
                        removeSkill={this.props.removeSkill}
                        removeLanguage={this.props.removeLanguage}
                        removeEducation={this.props.removeEducation}
                        removeEmployment={this.props.removeEmployment}
                        currentResumeName={this.props.currentResumeName}
                        handleLanguageClick={this.props.handleLanguageClick}
                        values={this.props.values}
                        logout={this.props.logout}
                        user={this.props.user}
                        handleDelete={this.props.handleDelete}
                        progress={this.props.progress}
                        handleInputs={this.props.handleInputs}
                        handleCoverParagraphChange={this.props.handleCoverParagraphChange}
                        handleComponentDelete={this.props.handleComponentDelete}
                        handleParagraphAdd={this.props.handleParagraphAdd}
                        handleListAdd={this.props.handleListAdd}
                        handleListAddItem={this.props.handleListAddItem}
                        handleListItemChange={this.props.handleListItemChange}
                        handleListNameChange={this.props.handleListNameChange}
                        resetNavigation={this.props.resetNavigation}
                    />
                );

            case 'Action Cover Filling':
                return (
                    <ActionCoverFilling
                        stepBack={this.props.stepBack}
                        removeSkill={this.props.removeSkill}
                        removeLanguage={this.props.removeLanguage}
                        removeEducation={this.props.removeEducation}
                        removeEmployment={this.props.removeEmployment}
                        currentResumeName={this.props.currentResumeName}
                        handleLanguageClick={this.props.handleLanguageClick}
                        values={this.props.values}
                        logout={this.props.logout}
                        user={this.props.user}
                        handleDelete={this.props.handleDelete}
                        progress={this.props.progress}
                        handleInputs={this.props.handleInputs}
                        handleCoverParagraphChange={this.props.handleCoverParagraphChange}
                        handleComponentDelete={this.props.handleComponentDelete}
                        handleParagraphAdd={this.props.handleParagraphAdd}
                        handleListAdd={this.props.handleListAdd}
                        handleListAddItem={this.props.handleListAddItem}
                        handleListItemChange={this.props.handleListItemChange}
                        handleListNameChange={this.props.handleListNameChange}
                        resetNavigation={this.props.resetNavigation}
                    />
                );

            default:
                return <Dashboard2 />;
        }
    }
}
export default Action;
