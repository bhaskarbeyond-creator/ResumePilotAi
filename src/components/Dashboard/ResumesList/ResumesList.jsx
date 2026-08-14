import React, { Component } from 'react';
import addResume, { getResumes, removeResume, setJsonPb } from '../../../firestore/dbOperations';
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
    deleteResume(userId, resumeId, indexInState) {
        if (!window.confirm(this.props.t('ResumesList.deleteConfirm', 'Are you sure you want to delete this resume? This action cannot be undone.'))) {
            return;
        }
        removeResume(userId, resumeId);
        if (resumeId == localStorage.getItem('currentResumeId')) {
            localStorage.removeItem('currentResumeId');
        }
        var array = this.state.resumes;
        console.log('array is this');
        console.log(array);
        // Notifying the state that a resume has been deleted
        this.props.showDeletedToast();
        setTimeout(() => {
            document.location.reload();
        }, 1300);
    }
    // When user click on go to resume we save the resume id he clicked on so we can display the proper inforamtions in our Resume Boardhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
    setAsCurrentResume(resumeId, data) {
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeDara');
        localStorage.setItem('currentResumeId', resumeId);
        localStorage.setItem('currentResumeItem', data);
        console.log('Data of resumes');
        var resumeData = JSON.parse(localStorage.getItem('currentResumeItem'));
        console.log(resumeData.firstname);
    }
    duplicateResume(resumeItem) {
        const newId = Math.floor(Math.random() * 20000).toString() + 'copy';
        const clonedData = JSON.parse(JSON.stringify(resumeItem.item));
        clonedData.title = (clonedData.title || 'Resume') + ' (Copy)';
        setJsonPb(newId, clonedData).then(() => {
            if (this.props.showToast) this.props.showToast('Resume duplicated successfully!', 'success');
            setTimeout(() => document.location.reload(), 400);
        }).catch((err) => console.error('Duplicate error:', err));
    }

    //// List all resumes for that specific user
    returnResumes() {
        var resumes = [];
        for (let index = 0; index < this.state.resumes.length; index++) {
            const currentItem = this.state.resumes[index];
            resumes[index] = (
                <li key={index} className="resumeItem">
                    <div className="resumeItemStatus" style={{ backgroundColor: '#2ecc71' }}></div>
                    <div className="resumeItemContent">
                        <div className="resumeItemContentWrapper">
                            <span className="name">{currentItem.item.firstname + ' ' + currentItem.item.lastname}</span>
                            <span className="occupation">{currentItem.item.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link onClick={() => this.setAsCurrentResume(currentItem.id, JSON.stringify(currentItem))} className="btn-default btn-goResume" to={'/build-resume/heading'}>
                                Go To Resume
                            </Link>
                            <button onClick={() => this.duplicateResume(currentItem)} className="btn-default px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-md border border-slate-300 transition-colors">
                                Duplicate
                            </button>
                            <a onClick={() => this.deleteResume(localStorage.getItem('user'), currentItem.id, index)} className="btn-default btn-removeResume">
                                Remove
                            </a>
                        </div>
                    </div>
                </li>
            );
        }
        return resumes;
    }
    componentWillMount() {
        fire.auth().onAuthStateChanged((user) => {
            if (user) {
                var resumes;
                /// Getting the resumes
                resumes = getResumes(user.uid);
                resumes.then((value) => {
                    resumes = value;
                    this.setState({ resumes: resumes });
                });
            }
        });
    }
    render() {
    

        const { t } = this.props;
        return (
            <div className="dashboardContent">
                <div className="head">
                    <div className="headContent">
                        <h2>{t('dashboard.dashboard')} </h2>
                        {this.state.resumes != null && (
                            <Link onClick={() => { localStorage.removeItem('currentResumeId'); localStorage.removeItem('currentResumeItem'); addResume(localStorage.getItem('user')); }} to="/build-resume/heading" style={{ fontSize: '17px' }} className="btn-default">
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
                                <img className="noResumesImage" src={addResumesImage} />
                                <Link onClick={() => { localStorage.removeItem('currentResumeId'); localStorage.removeItem('currentResumeItem'); addResume(localStorage.getItem('user')); }} style={{ textDecoration: 'none ' }} to="/build-resume/heading">
                                    <a className="btn-default"> {t('dashboard.addResume')} </a>
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
