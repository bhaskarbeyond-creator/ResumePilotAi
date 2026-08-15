import React, { Component } from 'react';
import { getResumes } from '../../../firestore/dbOperations';
import { createResumeDraft, deleteResumeDraft } from '../../../services/resumePersistence';
import { Link } from 'react-router-dom';
import addResumesImage from '../../../assets/undraw_add_document_0hek.svg';
import fire from '../../../conf/fire';
import { withTranslation } from 'react-i18next';
import { useLottie } from "lottie-react";



import LoadingAnimation from '../../../assets/animations/lottie.loading.json';

const LoadinggView = () => {
    const loadingSettings = {
        loop: true,
        autoplay: true,
        animationData: LoadingAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
    };
    const { View } = useLottie(loadingSettings);
    return View;
  };

class ResumesList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            resumes: 'loading',
        };
        this.setAsCurrentResume = this.setAsCurrentResume.bind(this);
        this.returnResumes = this.returnResumes.bind(this);
        this.deleteResume = this.deleteResume.bind(this);
    }
    async deleteResume(userId, resumeId) {
        if (!userId || !window.confirm(this.props.t('ResumesList.deleteConfirm', 'Are you sure you want to delete this resume? This action cannot be undone.'))) return;
        try {
            await deleteResumeDraft(userId, resumeId);
            if (resumeId === localStorage.getItem('currentResumeId')) localStorage.removeItem('currentResumeId');
            this.setState(current => ({ resumes: current.resumes.filter(item => item.id !== resumeId) }));
            this.props.showDeletedToast();
        } catch (error) {
            console.error('Resume deletion failed:', error);
            this.props.showToast?.('Resume could not be deleted.', 'error');
        }
    }
    setAsCurrentResume(resumeId) {
        localStorage.setItem('currentResumeId', resumeId);
        localStorage.removeItem('currentResumeItem');
    }
    async duplicateResume(resumeItem) {
        const user = fire.auth().currentUser;
        if (!user) return;
        try {
            const clonedData = JSON.parse(JSON.stringify(resumeItem.item));
            clonedData.title = `${clonedData.title || 'Resume'} (Copy)`;
            const created = await createResumeDraft(user.uid, clonedData);
            this.setState(current => ({ resumes: [...current.resumes, { id: created.id, item: created.data, ...created.data }] }));
            this.props.showToast?.('Resume duplicated successfully!', 'success');
        } catch (error) {
            console.error('Duplicate error:', error);
            this.props.showToast?.('Resume could not be duplicated.', 'error');
        }
    }

    //// List all resumes for that specific user
    returnResumes() {
        var resumes = [];
        for (let index = 0; index < this.state.resumes.length; index++) {
            const currentItem = this.state.resumes[index];
            resumes[index] = (
                <li key={currentItem.id} className="resumeItem">
                    <div className="resumeItemStatus" style={{ backgroundColor: '#2ecc71' }}></div>
                    <div className="resumeItemContent">
                        <div className="resumeItemContentWrapper">
                            <span className="name">{currentItem.item.firstname + ' ' + currentItem.item.lastname}</span>
                            <span className="occupation">{currentItem.item.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link onClick={() => this.setAsCurrentResume(currentItem.id)} className="btn-default btn-goResume" to={'/build-resume/heading'}>
                                Go To Resume
                            </Link>
                            <button onClick={() => this.duplicateResume(currentItem)} className="btn-default px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md border border-slate-300 transition-colors">
                                Duplicate
                            </button>
                            <button type="button" onClick={() => this.deleteResume(fire.auth().currentUser?.uid, currentItem.id)} className="btn-default btn-removeResume">
                                Remove
                            </button>
                        </div>
                    </div>
                </li>
            );
        }
        return resumes;
    }
    componentDidMount() {
        this.unsubscribeAuth = fire.auth().onAuthStateChanged(async user => {
            if (!user) return this.setState({ resumes: [] });
            try {
                const result = await getResumes(user.uid);
                this.setState({ resumes: result?.resumes || result || [] });
            } catch (error) {
                console.error('Unable to load resumes:', error);
                this.setState({ resumes: [] });
            }
        });
    }
    componentWillUnmount() {
        this.unsubscribeAuth?.();
    }
    render() {
    

        const { t } = this.props;
        return (
            <div className="dashboardContent">
                <div className="head">
                    <div className="headContent">
                        <h2>{t('dashboard.dashboard')} </h2>
                        {this.state.resumes != null && (
                            <Link onClick={() => { localStorage.removeItem('currentResumeId'); localStorage.removeItem('currentResumeItem'); }} to="/build-resume/heading" style={{ fontSize: '17px' }} className="btn-default">
                                {' '}
                                + {t('dashboard.addNew')}{' '}
                            </Link>
                        )}
                    </div>
                    <hr />
                    {/* Resumes List */}
                    <div className="resumesList">
                        {this.state.resumes == 'loading' ? (
                            // <Lottie height="50" width="50" options={loadingSettings} />
                          <div style={{width:'40px' , height:'40px'}}> <LoadinggView /> </div>  
                        ) : this.state.resumes == null ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}>
                                <img className="noResumesImage" src={addResumesImage} alt="" />
                                <Link onClick={() => { localStorage.removeItem('currentResumeId'); localStorage.removeItem('currentResumeItem'); }} style={{ textDecoration: 'none ' }} to="/build-resume/heading">
                                    <span className="btn-default"> {t('dashboard.addResume')} </span>
                                </Link>
                            </div>
                        ) : (
                            <ul>
                                {/*  Return Resumes */}
                                {this.returnResumes()}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(ResumesList);
export default MyComponent;
