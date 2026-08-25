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
            deleteModal: { isOpen: false, userId: null, resumeId: null },
        };
        this.setAsCurrentResume = this.setAsCurrentResume.bind(this);
        this.returnResumes = this.returnResumes.bind(this);
        this.deleteResume = this.deleteResume.bind(this);
        this.confirmDeleteResume = this.confirmDeleteResume.bind(this);
    }
    deleteResume(userId, resumeId) {
        if (!userId || !resumeId) return;
        this.setState({ deleteModal: { isOpen: true, userId, resumeId } });
    }
    async confirmDeleteResume() {
        const { deleteModal } = this.state;
        if (!deleteModal.userId || !deleteModal.resumeId) return;
        try {
            await deleteResumeDraft(deleteModal.userId, deleteModal.resumeId);
            if (deleteModal.resumeId === localStorage.getItem('currentResumeId')) localStorage.removeItem('currentResumeId');
            this.setState(current => ({ 
                resumes: current.resumes.filter(item => item.id !== deleteModal.resumeId),
                deleteModal: { isOpen: false, userId: null, resumeId: null }
            }));
            this.props.showDeletedToast();
        } catch (error) {
            console.error('Resume deletion failed:', error);
            this.props.showToast?.('Resume could not be deleted.', 'error');
            this.setState({ deleteModal: { isOpen: false, userId: null, resumeId: null } });
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
            this.props.showToast?.('Resume duplicated.', 'success');
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
                                Edit Resume
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

                {/* In-App Delete Confirmation Modal with ESC key handling */}
                {this.state.deleteModal.isOpen && (
                    <div
                        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
                        role="presentation"
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
                        onKeyDown={(e) => { if (e.key === 'Escape') this.setState({ deleteModal: { isOpen: false, userId: null, resumeId: null } }); }}>
                        <div
                            role="alertdialog"
                            aria-modal="true"
                            style={{ backgroundColor: '#fff', borderRadius: '16px', maxWidth: '420px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 12px 0' }}>
                                {t('ResumesList.deleteModal.title', 'Confirm Resume Deletion')}
                            </h3>
                            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                                {t('ResumesList.deleteConfirm', 'Are you sure you want to delete this resume? This action cannot be undone.')}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={() => this.setState({ deleteModal: { isOpen: false, userId: null, resumeId: null } })}
                                    style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', fontWeight: 'bold', fontSize: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={this.confirmDeleteResume}
                                    style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 'bold', fontSize: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                                    {t('common.delete', 'Delete Resume')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(ResumesList);
export default MyComponent;
