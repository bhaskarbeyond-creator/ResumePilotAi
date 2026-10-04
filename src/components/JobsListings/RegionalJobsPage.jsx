import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaArrowLeft, FaBriefcase, FaBuilding, FaMapMarkerAlt } from 'react-icons/fa';
import { getRegionalHub } from '../../services/api/geo';

function formatMoney(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(String(currency || ''))) return '';
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return '';
    }
}

function formatSalaryRange(range) {
    if (range?.currency === 'INR' && (range.minLpa !== null || range.maxLpa !== null)) {
        const min = range.minLpa === null ? '' : `${range.minLpa} LPA`;
        const max = range.maxLpa === null ? '' : `${range.maxLpa} LPA`;
        return min && max ? `${min}–${max}` : min || max;
    }
    const min = formatMoney(range?.minAnnual, range?.currency);
    const max = formatMoney(range?.maxAnnual, range?.currency);
    return min && max ? `${min}–${max} annually` : min ? `${min}+ annually` : max ? `Up to ${max} annually` : '';
}

function formatVacancySalary(vacancy) {
    const minimum = formatMoney(vacancy.salaryMin, vacancy.salaryCurrency);
    const maximum = formatMoney(vacancy.salaryMax, vacancy.salaryCurrency);
    if (minimum && maximum) return `${minimum}–${maximum}`;
    if (minimum) return `${minimum}+`;
    if (maximum) return `Up to ${maximum}`;
    return '';
}

export default function RegionalJobsPage({ kind }) {
    const { slug = '' } = useParams();
    const [state, setState] = useState({ loading: true, region: null, error: null });

    useEffect(() => {
        let active = true;
        setState({ loading: true, region: null, error: null });
        getRegionalHub(kind, slug)
            .then(region => { if (active) setState({ loading: false, region, error: null }); })
            .catch(error => { if (active) setState({ loading: false, region: null, error }); });
        return () => { active = false; };
    }, [kind, slug]);

    const region = state.region;
    const canonicalHref = useMemo(() => kind === 'state' ? `/jobs/in/${slug}` : `/jobs/city/${slug}`, [kind, slug]);

    // LANDMARK CONTRACT: the document-level <main id="main-content"> is owned by
    // src/main.jsx and wraps every route. This page therefore renders a plain
    // <div> wrapper. Emitting a second <main> here produced a duplicate main
    // landmark (axe landmark-no-duplicate-main) and left the real main
    // transparent, so the first-paint sample read rgba(0, 0, 0, 0).
    if (state.loading) {
        return (
            <div className="min-h-screen bg-cuba-canvas px-4 pb-16 pt-28 text-cuba-ink sm:px-6" style={{ backgroundColor: 'var(--cuba-canvas)' }} aria-busy="true">
                <div className="mx-auto max-w-6xl">
                    <div className="h-5 w-36 animate-pulse rounded bg-cuba-line" />
                    <div className="mt-6 h-12 max-w-2xl animate-pulse rounded bg-cuba-line" />
                    <div className="mt-4 h-5 max-w-xl animate-pulse rounded bg-cuba-line" />
                    <div className="mt-10 grid gap-4 md:grid-cols-2">
                        <div className="h-36 animate-pulse rounded-cuba-xl bg-cuba-card" />
                        <div className="h-36 animate-pulse rounded-cuba-xl bg-cuba-card" />
                    </div>
                </div>
            </div>
        );
    }

    if (!region || state.error) {
        const notFound = Number(state.error?.status) === 404;
        return (
            <div className="min-h-screen bg-cuba-canvas px-4 pb-16 pt-28 text-cuba-ink sm:px-6" style={{ backgroundColor: 'var(--cuba-canvas)' }}>
                <div className="mx-auto max-w-3xl rounded-cuba-xl border border-cuba-line bg-cuba-card p-8 shadow-cuba-sm" role={notFound ? 'status' : 'alert'}>
                    <h1 className="text-2xl font-bold">{notFound ? 'Regional job hub unavailable' : 'Regional job data is temporarily unavailable'}</h1>
                    <p className="mt-3 text-cuba-ink-muted">{notFound
                        ? 'This regional hub is not currently published.'
                        : 'Current regional listings could not be loaded. Please try again shortly.'}</p>
                    <Link to="/jobs" className="cuba-btn-primary mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
                        <FaArrowLeft aria-hidden="true" /> Browse jobs
                    </Link>
                </div>
            </div>
        );
    }

    const vacancies = Array.isArray(region.vacancies) ? region.vacancies : [];
    const salaryRanges = Array.isArray(region.salaryRanges) ? region.salaryRanges : [];
    const pathNoun = kind === 'state' ? 'region' : 'city';
    const area = kind === 'city' && region.stateName ? `${region.name}, ${region.stateName}` : region.name;

    return (
        <div className="min-h-screen bg-cuba-canvas px-4 pb-16 pt-28 text-cuba-ink sm:px-6" style={{ backgroundColor: 'var(--cuba-canvas)' }} data-canonical-path={canonicalHref}>
            <div className="mx-auto max-w-6xl">
                <nav aria-label="Breadcrumb" className="mb-6 text-sm text-cuba-ink-muted">
                    <ol className="flex flex-wrap items-center gap-2">
                        <li><Link to="/" className="hover:text-cuba-primary">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li><Link to="/jobs" className="hover:text-cuba-primary">Jobs</Link></li>
                        <li aria-hidden="true">/</li>
                        <li aria-current="page" className="text-cuba-ink">{region.name}</li>
                    </ol>
                </nav>

                <header className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-6 shadow-cuba-sm sm:p-9">
                    <p className="text-sm font-semibold uppercase tracking-[0.15em] text-cuba-primary-ink-strong">India · Regional careers</p>
                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Technology jobs in {region.name}</h1>
                    <p className="mt-3 max-w-3xl text-base leading-relaxed text-cuba-ink-muted">
                        Browse active job listings currently published for {area}. Counts, employer names and salary information below are derived from live listings; no example vacancies are inserted.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3" aria-label={`${region.name} job listing summary`}>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-cuba-line bg-cuba-canvas px-4 py-3">
                            <FaBriefcase aria-hidden="true" className="text-cuba-primary" />
                            <span className="font-semibold">{region.vacancyCount} active {region.vacancyCount === 1 ? 'listing' : 'listings'}</span>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-xl border border-cuba-line bg-cuba-canvas px-4 py-3">
                            <FaBuilding aria-hidden="true" className="text-cuba-primary" />
                            <span className="font-semibold">{region.companyCount} {region.companyCount === 1 ? 'employer' : 'employers'}</span>
                        </div>
                    </div>
                </header>

                {region.hasVacancies ? (
                    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                        <section aria-labelledby="current-jobs-heading">
                            <div className="mb-4 flex items-end justify-between gap-3">
                                <div>
                                    <h2 id="current-jobs-heading" className="text-2xl font-bold">Current openings</h2>
                                    <p className="mt-1 text-sm text-cuba-ink-muted">Showing the latest {vacancies.length} matching listings.</p>
                                </div>
                            </div>
                            {vacancies.length ? (
                                <ul className="space-y-3">
                                    {vacancies.map(vacancy => (
                                        <li key={vacancy.id}>
                                            <article className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-5 shadow-cuba-sm transition-shadow hover:shadow-cuba-md">
                                                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                                                    <div className="min-w-0">
                                                        <h3 className="text-lg font-semibold">
                                                            <Link to={`/jobs/portal/${encodeURIComponent(vacancy.id)}`} className="underline-offset-4 hover:text-cuba-primary hover:underline">{vacancy.title || 'Untitled listing'}</Link>
                                                        </h3>
                                                        <p className="mt-1 text-sm text-cuba-ink-muted">{vacancy.company || 'Employer name not provided'}</p>
                                                        <p className="mt-3 flex items-center gap-2 text-sm text-cuba-ink-muted">
                                                            <FaMapMarkerAlt aria-hidden="true" className="shrink-0" />
                                                            <span>{vacancy.location || area}</span>
                                                        </p>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {vacancy.jobType && <span className="rounded-full border border-cuba-line px-3 py-1 text-xs text-cuba-ink-muted">{vacancy.jobType}</span>}
                                                            {vacancy.workplaceType && <span className="rounded-full border border-cuba-line px-3 py-1 text-xs text-cuba-ink-muted">{vacancy.workplaceType}</span>}
                                                        </div>
                                                    </div>
                                                    {formatVacancySalary(vacancy) && <p className="shrink-0 font-semibold text-cuba-ink">{formatVacancySalary(vacancy)}</p>}
                                                </div>
                                            </article>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-6 text-cuba-ink-muted" role="status">Openings are present, but the listing preview could not be loaded.</p>
                            )}
                        </section>

                        <aside className="space-y-5">
                            <section aria-labelledby="salary-data-heading" className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-5 shadow-cuba-sm">
                                <h2 id="salary-data-heading" className="text-lg font-bold">Salary information</h2>
                                <p className="mt-1 text-sm text-cuba-ink-muted">Based on salary fields employers supplied in current active listings.</p>
                                {salaryRanges.length ? (
                                    <ul className="mt-4 space-y-3">
                                        {salaryRanges.map(range => (
                                            <li key={range.currency} className="flex items-start justify-between gap-3 border-t border-cuba-line pt-3">
                                                <span className="text-sm font-medium">{range.currency}</span>
                                                <span className="text-right text-sm text-cuba-ink-muted">{formatSalaryRange(range) || 'Salary data unavailable'}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="mt-4 rounded-lg bg-cuba-canvas p-3 text-sm text-cuba-ink-muted">No salary figures have been supplied for the current listings in this {pathNoun}.</p>
                                )}
                            </section>
                            {Array.isArray(region.topCompanies) && region.topCompanies.length > 0 && (
                                <section aria-labelledby="employers-heading" className="rounded-cuba-xl border border-cuba-line bg-cuba-card p-5 shadow-cuba-sm">
                                    <h2 id="employers-heading" className="text-lg font-bold">Employers with current listings</h2>
                                    <ul className="mt-3 space-y-2">
                                        {region.topCompanies.map(company => (
                                            <li key={company.name} className="flex items-center justify-between gap-3 text-sm">
                                                <span>{company.name}</span>
                                                <span className="text-cuba-ink-muted">{company.openings} {company.openings === 1 ? 'listing' : 'listings'}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                        </aside>
                    </div>
                ) : (
                    <section aria-labelledby="regional-empty-heading" role="status" className="mt-7 rounded-cuba-xl border border-cuba-line bg-cuba-card p-7 shadow-cuba-sm">
                        <h2 id="regional-empty-heading" className="text-xl font-bold">No active listings in {region.name} right now</h2>
                        <p className="mt-2 max-w-2xl text-cuba-ink-muted">The live job database currently has no published active vacancies matched to this {pathNoun}. This page will reflect actual listings as they are published.</p>
                        <Link to="/jobs/portal" className="cuba-btn-primary mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold">Browse all jobs</Link>
                    </section>
                )}

                <p className="mt-8 text-sm text-cuba-ink-subtle">Regional pages use only active, unexpired public job records. Salary ranges are grouped by the currency recorded with each posting; no currency conversion or market-wide estimate is implied.</p>
            </div>
        </div>
    );
}
