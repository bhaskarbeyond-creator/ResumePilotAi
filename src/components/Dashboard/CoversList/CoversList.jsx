import React, { Component } from 'react';
import { getCovers, removeCover } from '../../../services/api/platform';
import { Link } from 'react-router-dom';
// DIR-081: Cover Letters was a legacy-styled, non-responsive surface — it now uses the
// shared page header, Cuba tokens, real breakpoints and a genuine empty state.
// DIR-083: it now mounts the certified DIR-082 viewport-dense primitives — a pinned
// frame, a list/detail split with a LIVE Cover1 preview, a compact HUD and a toolbar.
import CubaPageFrame from '../../cuba/CubaPageFrame';
import CubaSplitView from '../../cuba/CubaSplitView';
import CubaHud from '../../cuba/CubaHud';
import CubaToolbar from '../../cuba/CubaToolbar';
import CubaEmptyState from '../../cuba/CubaEmptyState';
import fire from '../../../conf/fire';
import { withTranslation } from 'react-i18next';
import Cover1 from '../../../cv-templates/cover1/Cover1';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/**
 * DIR-083 — THE CRASH FIX.
 *
 * The API returns FLAT cover rows: `{ id, ...(data JSON), title, template, updated_at }`
 * (MySQLRepository.getCovers). The previous render read a nested `item` sub-object on
 * every row (`item.firstname` / `item.title`), but that sub-object does not exist — so
 * the page threw a TypeError as soon as the account held a single cover letter. The
 * empty account rendered fine, which is why only the empty-state wasteland was visible.
 *
 * These helpers read the REAL stored fields (the editor persists a flat letterData with
 * candidateFirstname / candidateLastname / jobTitle / letterBody) and shape them into
 * the `values` contract that the Cover1 template consumes.
 */
const coverValues = (cover = {}) => {
    const body = String(cover.letterBody || cover.coverLetterContent || '');
    return {
        firstname: cover.candidateFirstname || cover.firstname || '',
        lastname: cover.candidateLastname || cover.lastname || '',
        address: cover.candidateAddress || '',
        city: cover.candidateCity || '',
        postalcode: cover.candidatePostalCode || '',
        phone: cover.candidatePhone || '',
        email: cover.candidateEmail || '',
        occupation: cover.jobTitle || '',
        employerFullName: cover.recipientName || '',
        recipientName: cover.recipientName || '',
        companyName: cover.companyName || '',
        companyAddress: cover.companyAddress || '',
        companyCity: cover.companyCity || '',
        companyPostalCode: cover.companyPostalCode || '',
        letterBody: body,
        coverLetterContent: body,
        components: body.split(/\n\n+/).filter(Boolean).map((para) => ({ type: 'Paragraph', content: para.trim() })),
    };
};

const coverName = (cover = {}) => [cover.candidateFirstname || cover.firstname, cover.candidateLastname || cover.lastname]
    .filter(Boolean).join(' ') || 'Untitled candidate';

/**
 * Real signals for the HUD, computed from the stored letter body. Nothing here is
 * invented: when the body is empty every figure is honestly zero and the HUD renders
 * nothing at all.
 */
const letterSignals = (cover = {}) => {
    const body = String(cover.letterBody || cover.coverLetterContent || '').trim();
    const lower = body.toLowerCase();
    const company = String(cover.companyName || '').trim().toLowerCase();
    const role = String(cover.jobTitle || '').trim().toLowerCase();
    return {
        words: body ? body.split(/\s+/).length : 0,
        paragraphs: body ? body.split(/\n\n+/).filter(Boolean).length : 0,
        mentionsCompany: Boolean(company) && lower.includes(company),
        mentionsRole: Boolean(role) && lower.includes(role),
    };
};

class CoversList extends Component {
    constructor(props) {
        super(props);
        this.state = {
            covers: 'loading',
            // DIR-083: the split view needs a selection and a mobile pane swap.
            selectedId: null,
            mobileDetail: false,
            loadError: '',
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
        return this.state.covers.map((cover, index) => {
            const selected = String(cover.id) === String(this.state.selectedId);
            return (
                <li key={cover.id || index}>
                    <button
                        type="button"
                        onClick={() => this.setState({ selectedId: cover.id, mobileDetail: true })}
                        aria-current={selected ? 'true' : undefined}
                        className={cx(
                            'cuba-focusable w-full rounded-cuba-lg border p-4 text-left transition-colors',
                            selected
                                ? 'border-cuba-primary bg-cuba-primary-soft'
                                : 'border-cuba-line bg-cuba-card hover:bg-cuba-primary-soft/40',
                        )}
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="h-2.5 w-2.5 flex-none rounded-full bg-cuba-success" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                {/* DIR-083: flat fields, never `.item` — that access is what crashed the page. */}
                                <p className="truncate text-sm font-semibold text-cuba-ink">{coverName(cover)}</p>
                                <p className="truncate text-xs text-cuba-ink-muted">{cover.title || cover.jobTitle || 'Cover Letter'}</p>
                            </div>
                        </div>
                    </button>
                </li>
            );
        });
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
            this.signedInUser = user || null;
            if (user) this.loadCovers(user);
        });
    }
    // DIR-083: a single loader so the frame's retry action can re-run the real read, and
    // so a rejected read becomes a visible error state instead of an eternal spinner.
    loadCovers(user) {
        this.setState({ covers: 'loading', loadError: '' });
        getCovers(user.uid)
            .then((value) => {
                const list = Array.isArray(value) ? value : [];
                this.setState({ covers: list, selectedId: list.length ? list[0].id : null, mobileDetail: false });
            })
            .catch((error) => {
                this.setState({
                    covers: [],
                    loadError: error?.message || 'Your cover letters could not be loaded.',
                });
            });
    }
    render() {
        const { t } = this.props;
        const covers = this.state.covers;
        const isReady = Array.isArray(covers) && covers.length > 0;
        const selected = isReady
            ? (covers.find((cover) => String(cover.id) === String(this.state.selectedId)) || covers[0])
            : null;
        const signals = selected ? letterSignals(selected) : null;
        const hudItems = signals ? [
            { label: 'Words', value: signals.words },
            { label: 'Paragraphs', value: signals.paragraphs },
            { label: 'Company named', value: signals.mentionsCompany ? 'Yes' : 'No' },
            { label: 'Role named', value: signals.mentionsRole ? 'Yes' : 'No' },
        ] : [];
        const frameState = this.state.loadError
            ? 'error'
            : (covers === 'loading' ? 'loading' : (isReady ? 'ready' : 'empty'));

        return (
            <CubaPageFrame
                title={t('dashboard.coverLetters', 'Cover Letters')}
                subtitle="Pick a letter to preview it live, then open it to edit."
                dense
                state={frameState}
                error={this.state.loadError}
                onRetry={() => this.signedInUser && this.loadCovers(this.signedInUser)}
                loadingLabel="Loading your cover letters"
                loadingRows={4}
                hud={selected ? <CubaHud items={hudItems} label="Cover letter signals" /> : null}
                toolbar={isReady ? (
                    <CubaToolbar
                        label="Cover letter tools"
                        left={(
                            <p className="text-xs font-semibold text-cuba-ink-muted">
                                {covers.length} cover letter{covers.length === 1 ? '' : 's'}
                            </p>
                        )}
                        right={(
                            <>
                                {selected && (
                                    <Link
                                        onClick={() => this.setAsCurrentCover(selected.id, JSON.stringify(selected))}
                                        to={'/?step=Cover'}
                                        className="cuba-btn-outline inline-flex items-center rounded-cuba-sm px-3.5 py-1.5 text-xs font-bold"
                                    >
                                        Edit selected
                                    </Link>
                                )}
                                <Link onClick={() => this.addNewCover()} to="/?step=Cover" className="cuba-btn-primary inline-flex items-center rounded-cuba-sm px-3.5 py-1.5 text-xs font-bold">
                                    + {t('dashboard.addNew')}
                                </Link>
                            </>
                        )}
                    />
                ) : null}
                emptyState={(
                    <CubaEmptyState
                        title="No cover letters yet"
                        description="Generate a cover letter and it will appear here, ready to preview, edit or remove."
                    />
                )}
            >
                <CubaSplitView
                    listLabel="Your cover letters"
                    detailLabel="Live cover letter preview"
                    hasDetail={Boolean(this.state.mobileDetail && selected)}
                    onBack={() => this.setState({ mobileDetail: false })}
                    list={(
                        <ul className="space-y-3">
                            {this.returnCovers()}
                        </ul>
                    )}
                    detail={selected ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-cuba-ink">
                                    {selected.title || selected.jobTitle || 'Cover Letter'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => this.deleteCover(fire.auth().currentUser?.uid, selected.id, 0)}
                                    className="cuba-focusable inline-flex items-center rounded-cuba-sm px-3 py-1.5 text-xs font-semibold text-white"
                                    style={{ background: 'var(--cuba-danger)' }}
                                >
                                    Remove
                                </button>
                            </div>
                            {/* DIR-083: the LIVE preview. The Cover1 template is frozen and is
                                consumed read-only through its real `values` contract. */}
                            <div className="overflow-hidden rounded-cuba-lg border border-cuba-line bg-cuba-card">
                                <Cover1 values={coverValues(selected)} language={this.props.i18n?.language || 'en'} />
                            </div>
                        </div>
                    ) : null}
                />
            </CubaPageFrame>
        );
    }
}
const MyComponent = withTranslation('common')(CoversList);
export default MyComponent;
