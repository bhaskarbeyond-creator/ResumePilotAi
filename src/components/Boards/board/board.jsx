import React, { Component } from 'react';
import './Board.scss';
import Introduction from '../board-step-introduction/BoardIntroduction';
import BoardSelection from '../board-step-selection/BoardSelection';
import BoardFilling from '../board-step-filling/BoardFilling';
import BoardCoverFilling from '../board-cover-filling/BoardCoverFilling';
class Board extends Component {
    render() {
        // Checking which step is passed to the board wrapper and render the right component
        switch (this.props.currentStep) {
            case 'Introduction':
                return (
                    <Introduction
                        nextStep={this.props.nextStep}
                        goToResumeSelectionStep={this.props.goToResumeSelectionStep}
                        goToCoverSelection={this.props.goToCoverSelection}
                        currentStep={this.props.currentStep}
                    />
                );
            case 'Template Selection':
                return (
                    <BoardSelection
                        changeResumeName={this.props.changeResumeName}
                        nextStep={this.props.nextStep}
                        stepBack={this.props.stepBack}
                        currentStep={this.props.currentStep}
                        goToCoverSelection={this.props.goToCoverSelection}
                    />
                );

            case 'Action Cover Selection':
                return (
                    <BoardSelection
                        changeResumeName={this.props.changeResumeName}
                        nextStep={this.props.nextStep}
                        stepBack={this.props.stepBack}
                        currentStep={this.props.currentStep}
                        setFinalStep={this.props.setFinalStep}
                        goToCoverSelection={this.props.goToCoverSelection}
                    />
                );
            case 'Cover Filling':
                return (
                    <BoardFilling
                        authBtnHandler={this.props.authBtnHandler}
                        currentResumeName={this.props.currentResumeName}
                        stepBack={this.props.stepBack}
                        values={this.props.values}
                        currentStep={this.props.currentStep}
                        goToCoverSelection={this.props.goToCoverSelection}
                        handleTemplateShow={this.props.handleTemplateShow}
                        handleColorChange={this.props.handleColorChange}
                    />
                );

            default:
                return (
                    <BoardFilling
                        authBtnHandler={this.props.authBtnHandler}
                        currentResumeName={this.props.currentResumeName}
                        stepBack={this.props.stepBack}
                        values={this.props.values}
                        currentStep={this.props.currentStep}
                        handleTemplateShow={this.props.handleTemplateShow}
                        handleColorChange={this.props.handleColorChange}
                    />
                );
        }
    }
}
export default Board;
