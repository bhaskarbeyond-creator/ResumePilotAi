import React, { Component } from 'react';
import { getCovers, removeCover } from '../../../firestore/dbOperations';
import { Link } from 'react-router-dom';
import addResumesImage from '../../../assets/undraw_add_document_0hek.svg';
import fire from '../../../conf/fire';
import { withTranslation } from 'react-i18next';
import LoadingAnimation from '../../../assets/animations/lottie.loading.json';
import Cover1 from '../../../cv-templates/cover1/Cover1';
import { useLottie } from 'lottie-react';

const View = () => {
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

class CoversList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            covers: 'loading',
        };
        this.setAsCurrentCover = this.setAsCurrentCover.bind(this);
        this.returnCovers = this.returnCovers.bind(this);
        this.deleteCover = this.deleteCover.bind(this);
    }
    deleteCover(userId, coverId, indexInState) {
        removeCover(userId, coverId);
        if (coverId == localStorage.getItem('currentCoverId')) {
            localStorage.removeItem('currentCoverId');
            localStorage.removeItem('currentCoverItem');
        }
        var array = this.state.covers;
        console.log('array is this');
        console.log(array);
        // Notifying the state that a cover has been deleted
        this.props.showDeletedToast();
        setTimeout(() => {
            document.location.reload();
        }, 1300);
    }
    // When user click on go to cover we save the cover id so we can display the proper information
    setAsCurrentCover(coverId, data) {
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
        localStorage.removeItem('currentCoverId');
        localStorage.removeItem('currentCoverItem');

        localStorage.setItem('currentCoverId', coverId);
        localStorage.setItem('currentCoverItem', data);
        console.log('Data of cover:', data);
        var coverData = JSON.parse(localStorage.getItem('currentCoverItem'));
        console.log('Cover data loaded:', coverData);
    }
    //// List all covers for that specific user
    returnCovers() {
        var covers = [];
        for (let index = 0; index < this.state.covers.length; index++) {
            covers[index] = (
                <li key={index} className="resumeItem">
                    <div className="resumeItemStatus" style={{ backgroundColor: '#2ecc71' }}></div>
                    <div className="resumeItemContent">
                        <div className="resumeItemContentWrapper">
                            <span className="name">{this.state.covers[index].item.firstname + ' ' + this.state.covers[index].item.lastname}</span>
                            <span className="occupation">{this.state.covers[index].item.title || 'Cover Letter'}</span>
                        </div>
                        <div>
                            <Link
                                onClick={() => this.setAsCurrentCover(this.state.covers[index].id, JSON.stringify(this.state.covers[index]))}
                                className="btn-default btn-goResume"
                                to={'/?step=Cover'}>
                                {' '}
                                Go To Cover Letter
                            </Link>
                            <a onClick={() => this.deleteCover(localStorage.getItem('user'), this.state.covers[index].id, index)} className="btn-default btn-removeResume">
                                Remove
                            </a>
                        </div>
                    </div>
                </li>
            );
        }
        return covers;
    }
    addNewCover() {
        // Clear any existing cover data and navigate to create new cover
        localStorage.removeItem('currentCoverId');
        localStorage.removeItem('currentCoverItem');
        localStorage.removeItem('currentResumeId');
        localStorage.removeItem('currentResumeItem');
        console.log('Starting new cover letter creation');
    }
    componentWillMount() {
        fire.auth().onAuthStateChanged((user) => {
            if (user) {
                var covers;
                /// Getting the covers
                covers = getCovers(user.uid);
                covers.then((value) => {
                    covers = value;
                    this.setState({ covers: covers });
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
                        <h2>Cover Letters </h2>
                        {this.state.covers != null && (
                            <Link onClick={() => this.addNewCover()} to="/?step=Cover" style={{ fontSize: '17px' }} className="btn-default">
                                {' '}
                                + {t('dashboard.addNew')}{' '}
                            </Link>
                        )}
                    </div>
                    <hr />
                    {/* Covers List */}
                    <div className="resumesList">
                        {this.state.covers == 'loading' ? (
                            // <Lottie height="50" width="50" options={loadingSettings} />
                            <>{View}</>
                        ) : this.state.covers == null ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}>
                                <img className="noResumesImage" src={addResumesImage} />
                            </div>
                        ) : (
                            <ul>
                                {/*  Return Covers */}
                                {this.returnCovers()}
                            </ul>
                        )}
                    </div>
                    ddddddddddddddddddddddddd
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(CoversList);
export default MyComponent;
