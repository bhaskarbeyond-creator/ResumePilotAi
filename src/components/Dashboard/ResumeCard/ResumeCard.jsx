// simple class component of React
// import '../ResumeCard.scss';
// and return a card with the resume

import React, { Component } from 'react';
import './ResumeCard.scss';
import { checkIfInFavourites, removeCover } from '../../../firestore/dbOperations';
import fire from '../../../conf/fire';
import { deleteResumeDraft, publishResume } from '../../../services/resumePersistence';
import { normalizeResumeData } from '../../../utils/resumeData';
import { ReactComponent as ResumeIcon } from '../../../assets/resume.svg';
import { ReactComponent as BookmarkIcon } from '../../../assets/bookmark.svg';
import { ReactComponent as CoverIcon } from '../../../assets/CoverIcon.svg';
import { BsFillShareFill } from 'react-icons/bs';
import { MdModeEdit } from 'react-icons/md';
import { AiTwotoneDelete } from 'react-icons/ai';
import { withTranslation } from 'react-i18next';
import { ShareModalClass } from '../ShareModal/ShareModal';

class ResumeCard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            shareModal: false,
        };
        this.handleFavouriteClick = this.handleFavouriteClick.bind(this);
        this.checkIfFavourite = this.checkIfFavourite.bind(this);
        this.handleShareClick = this.handleShareClick.bind(this);
        this.handleCoverRemoveClick = this.handleCoverRemoveClick.bind(this);
        this.handleResumeRemoveClick = this.handleResumeRemoveClick.bind(this);
    }

    // handle favourite click event
    handleFavouriteClick = () => {
        if (this.props.favourites.includes(this.props.document.id) === true) {
            this.props.removeFavorite(this.props.document.id);
            this.props.showToast('success', 'Removed from favourites', 'You have removed this resume from your favourites');
        } else {
            this.props.addFavorite(this.props.document.id);
            this.props.showToast('success', 'Added to favourites', 'You have added this resume to your favourites');
        }

        checkIfInFavourites(fire.auth().currentUser?.uid, this.props.document.id)
            .then((res) => {})
            .catch((err) => {
                console.log(err);
            });
    };
    // a function that checks if the id of the documents is in this.props.favourites if it is then it will return true
    checkIfFavourite(id) {
        if (this.props.favourites.includes(id)) {
            return true;
        } else {
            return false;
        }
    }

    handleShareClick = async () => {
        const userId = fire.auth().currentUser?.uid;
        if (!userId || this.props.type !== 'resume') return;
        try {
            await publishResume(userId, this.props.document.id, normalizeResumeData(this.props.document.item || this.props.document), { expectedRevision: this.props.document.revision ?? this.props.document.item?.revision ?? null });
            this.setState({ shareModal: true });
        } catch (error) {
            this.props.showToast?.('error', 'Sharing failed', 'Resume could not be published.');
        }
    };

    handleShareModalClose = () => {
        this.setState({ shareModal: false });
    };

    setAsCurrentResume(resumeId) {
        localStorage.setItem('currentResumeId', resumeId);
        localStorage.removeItem('currentResumeItem');
        window.location.href = '/build-resume/heading';
    }
    // function that handle remove click of resume
    handleResumeRemoveClick = async (id) => {
        let res = await deleteResumeDraft(fire.auth().currentUser?.uid, id);
        if (res) {
            this.props.getAllDocuments();
            this.props.showToast('error', ' Document removed!', 'You have removed this document from your account ');

        }
    };
    handleCoverRemoveClick = async (id) => {
        const userId = fire.auth().currentUser?.uid;
        if (!userId) return;
        let res = await removeCover(userId, id);
        if (res) {
            this.props.getAllDocuments();
        }
    };

    render() {
        const { t } = this.props;

        if (this.props.type === 'resume') {
            return (
                <div className="dashboard-resume-card">
                    <div className="dashboard-resume-card-head">
                        <div className="dashboard-resume-card-head-left">
                            <div style={{ backgroundColor: this.props.bgColor }} className="dashboard-resume-card-head-left-avatar">
                                <ResumeIcon className="dashboard-resume-card-head-left-avatar-icon" />
                            </div>
                        </div>
                        <div className="dashboard-resume-card-head-center">
                            <div className="dashboard-resume-card-head-center-title">
                                {this.props.document.item?.firstname} {this.props.document.item?.lastname}
                            </div>
                            <div className="dashboard-resume-card-head-center-skills">
                                {
                                    // check if no skills are added or undefined return no skills
                                    this.props.document.skills === undefined || this.props.document.skills.length === 0 ? (
                                        <div className="dashboard-resume-card-head-center-skills-item">{t('dashNew.noSkillsAdded')}</div>
                                    ) : (
                                        <>
                                            {this.props.document.skills.map((skill, index) => {
                                                return (
                                                    <div key={index} className="dashboard-resume-card-head-center-skills-item">
                                                        {skill.name}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )
                                }
                            </div>
                        </div>
                        <div className="dashboard-resume-card-head-right">
                            <div
                                onClick={() => this.handleFavouriteClick()}
                                className={`dashboard-resume-card-head-right-bookmark ${this.checkIfFavourite(this.props.document.id) === true && 'active'} `}>
                                <BookmarkIcon className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                            <div className={`dashboard-resume-card-head-right-bookmark `}>
                                <BsFillShareFill onClick={() => this.handleShareClick()} className="dashboard-resume-card-head-right-bookmark-icon" />
                                <ShareModalClass 
                                    isOpen={this.state.shareModal} 
                                    onClose={this.handleShareModalClose} 
                                    documentId={this.props.document.id}
                                    documentTitle={`${this.props.document.item?.firstname} ${this.props.document.item?.lastname}`}
                                />
                            </div>
                            <div onClick={() => this.setAsCurrentResume(this.props.document.id, this.props.document)} className={`dashboard-resume-card-head-right-bookmark `}>
                                <MdModeEdit className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                            <div onClick={() => this.handleResumeRemoveClick(this.props.document.id)} className={`dashboard-resume-card-head-right-bookmark  remove`}>
                                <AiTwotoneDelete className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                        </div>
                    </div>
                    <div className="dashboard-resume-card-body">
                        <div className="dashboard-resume-card-body-description">
                            <p>{this.props.document.item?.summary === '' ? 'No Summarry added' : this.props.document.item?.summary}</p>
                        </div>
                    </div>
                    <div className="dashboard-resume-card-footer">
                        <div className="dashboard-resume-card-footer-date">
                            {(this.props.document.item?.created_at?.toDate
                                ? this.props.document.item.created_at.toDate()
                                : new Date(this.props.document.item?.created_at || Date.now())
                            ).toLocaleString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                            })}
                        </div>
                    </div>
                </div>
            );
        } else if (this.props.type === 'cover') {
            return (
                <div className="dashboard-resume-card">
                    <div className="dashboard-resume-card-head">
                        <div className="dashboard-resume-card-head-left">
                            <div style={{ backgroundColor: this.props.bgColor }} className="dashboard-resume-card-head-left-avatar">
                                <CoverIcon className="dashboard-resume-card-head-left-avatar-icon" />
                            </div>
                        </div>
                        <div className="dashboard-resume-card-head-center">
                            <div className="dashboard-resume-card-head-center-title">
                                {this.props.document.item?.firstname} {this.props.document.item?.lastname}
                            </div>
                        </div>
                        <div className="dashboard-resume-card-head-right">
                            <div
                                onClick={() => this.handleFavouriteClick()}
                                className={`dashboard-resume-card-head-right-bookmark ${this.checkIfFavourite(this.props.document.id) === true && 'active'} `}>
                                <BookmarkIcon className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                            <div className={`dashboard-resume-card-head-right-bookmark `}>
                                <BsFillShareFill onClick={() => this.handleShareClick()} className="dashboard-resume-card-head-right-bookmark-icon" />
                                <ShareModalClass 
                                    isOpen={this.state.shareModal} 
                                    onClose={this.handleShareModalClose} 
                                    documentId={this.props.document.id}
                                    documentTitle={`${this.props.document.item?.firstname} ${this.props.document.item?.lastname}`}
                                />
                            </div>
                            <div onClick={() => this.setAsCurrentResume(this.props.document.id, this.props.document)} className={`dashboard-resume-card-head-right-bookmark `}>
                                <MdModeEdit className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                            <div onClick={() => this.handleCoverRemoveClick(this.props.document.id)} className={`dashboard-resume-card-head-right-bookmark  remove`}>
                                <AiTwotoneDelete className="dashboard-resume-card-head-right-bookmark-icon" />
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-resume-card-footer">
                        <div className="dashboard-resume-card-footer-date">
                            {(this.props.document.item?.created_at?.toDate
                                ? this.props.document.item.created_at.toDate()
                                : new Date(this.props.document.item?.created_at || Date.now())
                            ).toLocaleString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                            })}
                        </div>
                    </div>
                </div>
            );
        }
    }
}

const MyComponent = withTranslation('common')(ResumeCard);
export default MyComponent;
