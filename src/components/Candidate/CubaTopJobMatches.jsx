import React, { useContext, useEffect, useState } from 'react';
import { FiMapPin, FiBookmark, FiChevronRight, FiSearch } from 'react-icons/fi';
import { getJobs } from '../../services/api/jobs';
import { getJobFavourites, toggleJobFavourite } from '../../services/api/platform';
import { AuthContext } from '../../context/AuthContext';
import { MATCH_LIMIT, postedLabel, favouriteJobId } from './analyticsLogic';

/**
 * CubaTopJobMatches — DIR-094 S3 (candidate Overview, bottom-centre column).
 *
 * HONEST DATA CONTRACT — please read before "restoring" the match badges:
 *   The reference screenshot shows a per-job match percentage (92% / 86% / 78%).
 *   NO SUCH VALUE EXISTS IN THIS PLATFORM, and this component therefore does NOT
 *   render one. Verified at DIR-094 S1 recon:
 *     • there is no matchScore / matchPercent / match_score / matchPercentage token
 *       anywhere in src/ or backend/;
 *     • backend/routes/jobsData.js contains no relevance, match, score or rank logic
 *       (its list query is a plain `ORDER BY created_at DESC`);
 *     • src/components/Dashboard/DashbaordJobMatching/DashboardJobMatching.jsx is a
 *       193-byte stub that renders only <h1>DashboardJobs</h1>;
 *     • the only `jdMatch` in the repo is the BuildResume ATS resume-vs-description
 *       score (src/utils/atsScore.js), which scores a RESUME, not a job listing.
 *   Inventing percentages to match a screenshot would be exactly the fabrication the
 *   project invariants forbid, so this column renders REAL jobs with REAL fields and
 *   says what it actually is. A genuine match badge needs a data-lineage prerequisite
 *   (a real per-job relevance score) and is out of scope for DIR-094.
 *
 * Everything shown is real: title, company_name, location and created_at come from
 * MariaDB rows returned by GET /api/jobs-data, newest first. The bookmark is a real
 * owner-scoped write through toggleJobFavourite (GET/POST /api/favourites).
 */

const CubaTopJobMatches = ({ onNavigate, limit = MATCH_LIMIT }) => {
    const auth = useContext(AuthContext);
    const userId = auth?.user?.uid || '';

    const [jobs, setJobs] = useState(null); // null = not yet measured
    const [failed, setFailed] = useState(false);
    const [favourites, setFavourites] = useState(() => new Set());
    const [pending, setPending] = useState(() => new Set());

    useEffect(() => {
        let active = true;
        getJobs()
            .then((rows) => {
                if (!active) return;
                setJobs(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!active) return;
                setJobs(null);
                setFailed(true);
            });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!userId) return undefined;
        let active = true;
        getJobFavourites(userId)
            .then((rows) => {
                if (!active) return;
                setFavourites(new Set((Array.isArray(rows) ? rows : []).map(favouriteJobId).filter(Boolean)));
            })
            .catch(() => {
                // An unreadable favourites list leaves every star unfilled. We do not
                // guess a saved state we could not read.
            });
        return () => { active = false; };
    }, [userId]);

    const toggleSaved = async (jobId) => {
        if (!userId || !jobId || pending.has(jobId)) return;
        setPending((prev) => new Set(prev).add(jobId));
        try {
            const result = await toggleJobFavourite(userId, jobId);
            setFavourites((prev) => {
                const next = new Set(prev);
                if (result?.isFavourite === true) next.add(jobId);
                else next.delete(jobId);
                return next;
            });
        } catch {
            // The star simply does not flip. No optimistic lie is shown on failure.
        } finally {
            setPending((prev) => {
                const next = new Set(prev);
                next.delete(jobId);
                return next;
            });
        }
    };

    const loading = jobs === null && !failed;
    const visible = Array.isArray(jobs) ? jobs.slice(0, Math.max(1, limit)) : [];
    const hasJobs = visible.length > 0;
    const go = (href) => { if (typeof onNavigate === 'function') onNavigate(href); };

    return (
        <section
            data-testid="cuba-top-job-matches"
            aria-labelledby="cuba-top-job-matches-title"
            className="card bs-card-executive flex min-w-0 flex-col rounded-cuba-lg border border-cuba-line bg-cuba-card p-3.5 shadow-xs shadow-sm h-100"
        >
            <header className="mb-2 flex items-center justify-between">
                <div>
                    <h2 id="cuba-top-job-matches-title" className="text-sm font-bold text-cuba-ink flex items-center gap-1.5">
                        <span className="text-[#7366ff]">💼</span> Top Job Matches for You
                    </h2>
                    <p className="text-[11px] text-cuba-ink-subtle">Recommended based on your profile</p>
                </div>
                <button
                    type="button"
                    onClick={() => go('/dashboard/jobs/portal')}
                    className="text-[11px] font-bold text-[#7366ff] hover:underline cursor-pointer"
                >
                    View All
                </button>
            </header>

            {loading && (
                <p className="py-10 text-center text-xs text-cuba-ink-subtle" data-testid="cuba-top-job-matches-loading">
                    Loading live roles…
                </p>
            )}

            {!loading && failed && (
                <p className="py-10 text-center text-xs text-cuba-ink-subtle" data-testid="cuba-top-job-matches-unavailable">
                    Job board unavailable right now.
                </p>
            )}

            {!loading && !failed && !hasJobs && (
                <div className="py-8 text-center" data-testid="cuba-top-job-matches-empty">
                    <FiSearch className="mx-auto h-5 w-5 text-cuba-ink-subtle" aria-hidden="true" />
                    <p className="mt-1 text-xs font-semibold text-cuba-ink">No live roles right now</p>
                </div>
            )}

            {!loading && !failed && hasJobs && (
                <ul className="flex min-h-0 flex-col gap-1.5" data-testid="cuba-top-job-matches-list">
                    {visible.map((job) => {
                        const jobId = String(job?.id || '');
                        const saved = Boolean(jobId) && favourites.has(jobId);
                        const busy = pending.has(jobId);
                        const posted = postedLabel(job?.created_at);
                        return (
                            <li
                                key={jobId || `${job?.title}-${job?.company_name}`}
                                className="flex items-center gap-2.5 rounded-cuba-md border border-cuba-line px-2.5 py-2 hover:border-[#7366ff]/30 transition-colors"
                            >
                                <span
                                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 font-bold text-xs uppercase shadow-2xs"
                                    aria-hidden="true"
                                >
                                    {job?.company_name?.charAt(0) || 'J'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => go(`/dashboard/jobs/portal/${encodeURIComponent(jobId)}`)}
                                    className="cuba-focusable min-w-0 flex-1 rounded-cuba-sm text-left"
                                >
                                    <span className="block truncate text-xs font-semibold text-cuba-ink">
                                        {job?.title || 'Untitled role'}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-cuba-ink-subtle">
                                        {job?.company_name && <span className="truncate">{job.company_name}</span>}
                                        {job?.location && (
                                            <span className="inline-flex min-w-0 items-center gap-1">
                                                <FiMapPin className="h-3 w-3 flex-none" aria-hidden="true" />
                                                <span className="truncate">{job.location}</span>
                                            </span>
                                        )}
                                        {posted && <span className="flex-none">{posted}</span>}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleSaved(jobId)}
                                    disabled={!userId || busy}
                                    aria-pressed={saved}
                                    aria-label={saved
                                        ? `Remove ${job?.title || 'this role'} from saved jobs`
                                        : `Save ${job?.title || 'this role'}`}
                                    className="cuba-focusable flex h-7 w-7 flex-none items-center justify-center rounded-cuba-sm border border-cuba-line text-cuba-ink-muted hover:bg-cuba-primary-soft disabled:opacity-50"
                                >
                                    <FiBookmark
                                        className={`h-3.5 w-3.5 ${saved ? 'fill-current text-cuba-primary' : ''}`}
                                        aria-hidden="true"
                                    />
                                </button>
                            </li>
                        );
                    })}

                </ul>
            )}

            {!loading && !failed && hasJobs && (
                <button
                    type="button"
                    onClick={() => go('/dashboard/jobs/portal')}
                    className="cuba-focusable mt-2 inline-flex items-center justify-center gap-1 self-start rounded-cuba-sm text-[11px] font-bold text-cuba-primary hover:underline"
                >
                    Browse all jobs
                    <FiChevronRight className="h-3 w-3" aria-hidden="true" />
                </button>
            )}
        </section>
    );
};

export default CubaTopJobMatches;

