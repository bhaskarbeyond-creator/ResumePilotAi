import React, { Component } from 'react';
import { getCovers, removeCover } from '../../../services/api/platform';
import { Link } from 'react-router-dom';
// DIR-081: Cover Letters was a legacy-styled, non-responsive surface — it now uses the
// shared page header, Cuba tokens, real breakpoints and a genuine empty state.
import CubaPageHeader from '../../cuba/CubaPageHeader';
import CubaEmptyState from '../../cuba/CubaEmptyState';
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
    deleteCover(userId, coverId, _indexInState) {
        removeCover(userId, coverId);
        if (coverId == localStorage.getItem('currentCoverId')) {
            localStorage.removeItem('currentCoverId');
            localStorage.removeItem('currentCoverItem');
        }
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
        localStorage.setItem('currentCoverItem', typeof data === 'string' ? data : JSON.stringify(data));
    }
    //// List all covers for that specific user
    returnCovers() {
        var covers = [];
        for (let index = 0; index < this.state.covers.length; index++) {
            covers[index] = (
                <li key={index} className="flex flex-col gap-3 rounded-cuba-lg border border-cuba-line bg-cuba-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="h-2.5 w-2.5 flex-none rounded-full bg-cuba-success" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-cuba-ink">{this.state.covers[index].item.firstname + ' ' + this.state.covers[index].item.lastname}</p>
                            <p className="truncate text-xs text-cuba-ink-muted">{this.state.covers[index].item.title || 'Cover Letter'}</p>
                        </div>
                    </div>
                    <div className="flex flex-none flex-wrap items-center gap-2">
                        <Link
                            onClick={() => this.setAsCurrentCover(this.state.covers[index].id, JSON.stringify(this.state.covers[index]))}
                            className="cuba-btn-primary inline-flex items-center rounded-cuba-sm px-3.5 py-1.5 text-xs font-bold"
                            to={'/?step=Cover'}>
                            Edit Cover Letter
                        </Link>
                        <button
                            type="button"
                            onClick={() => this.deleteCover(fire.auth().currentUser?.uid, this.state.covers[index].id, index)}
                            className="inline-flex items-center rounded-cuba-sm px-3 py-1.5 text-xs font-semibold text-white"
                            style={{ background: 'var(--cuba-danger)' }}>
                            Remove
                        </button>
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
            <div className="min-w-0">
                <CubaPageHeader
                    title={t('dashboard.coverLetters', 'Cover Letters')}
                    subtitle="Every cover letter you have generated, ready to edit or remove."
                    actions={this.state.covers != null && (
                        <Link onClick={() => this.addNewCover()} to="/?step=Cover" className="cuba-btn-primary inline-flex items-center rounded-cuba-sm px-4 py-2.5 text-sm font-bold">
                            + {t('dashboard.addNew')}
                        </Link>
                    )}
                />
                <div className="mt-5">
                    {this.state.covers == 'loading' ? (
                        <>{View}</>
                    ) : this.state.covers == null ? (
                        /* DIR-081: a real empty state. This used to be a bare image with an
                           empty alt and no message, so a signed-out or empty account saw an
                           unexplained picture. */
                        <CubaEmptyState
                            title="No cover letters yet"
                            description="Generate a cover letter and it will appear here, ready to edit or remove."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {this.returnCovers()}
                        </ul>
                    )}
                </div>
            </div>
        );
    }
}
const MyComponent = withTranslation('common')(CoversList);
export default MyComponent;
