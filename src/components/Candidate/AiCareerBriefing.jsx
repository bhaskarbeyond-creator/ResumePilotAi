import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowRight, FiRefreshCw } from 'react-icons/fi';
import CubaButton from '../cuba/CubaButton';
import CubaSkeleton from '../cuba/CubaSkeleton';
import CubaBadge from '../cuba/CubaBadge';
import AiSurface from '../cuba/AiSurface';
import { getResumes } from '../../services/api/platform';
import { buildBriefing, EMPTY_BRIEFING_MESSAGE } from './briefingLogic';

/**
 * Candidate AI Career Briefing (Phase 4, §23).
 *
 * All truthfulness rules live in `briefingLogic.js`, which is pure and unit
 * tested. This component is presentation only: it renders what that module
 * returns and never computes a claim of its own.
 *
 * It is READ-ONLY — it never writes to candidate data (§7).
 */

/**
 * Candidate AI Career Briefing (Phase 4, Â§23).
 *
 * EVIDENCE RULE â€” the most important constraint in this file:
 *
 *   Every number rendered here is computed from data the platform actually
 *   returned, or from `calculateAtsScore`, the deterministic local ATS engine
 *   the builder already uses. Nothing is hardcoded, estimated, or filled in for
 *   presentation. When there is not enough data to say something true, this
 *   component says exactly that instead of inventing a headline (Â§46).
 *
 *   It therefore does NOT claim employer names, salary figures, keyword
 *   recommendations, market demand, or "N new openings today" â€” none of those
 *   have a trustworthy source in this repository today.
 *
 * Data sources:
 *   - GET /api/resumes           â†’ a real count of saved resumes
 *   - calculateAtsScore(resume)  â†’ ATS readiness of the candidate's own CV
 *
 * It is deliberately READ-ONLY. It never edits a resume, so it cannot damage
 * candidate data (Â§7).
 */

const AiCareerBriefing = ({ className = '' }) => {
    const [state, setState] = useState({ resumes: null, error: null });
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const resumes = await getResumes();
            if (!mounted.current) return;
            setState({ resumes, error: null });
        } catch (error) {
            if (!mounted.current) return;
            // A failed read is reported as a failure, never as "no resumes".
            setState({ resumes: null, error: error?.message || 'Unable to read resumes.' });
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => { mounted.current = false; };
    }, [load]);

    const briefing = useMemo(() => buildBriefing({
        resumes: state.resumes,
        loading,
        error: state.error,
    }), [state.resumes, state.error, loading]);

    return (
        <AiSurface
            className={`card bs-card-executive ${className}`}
            status={loading ? 'thinking' : briefing.state === 'error' ? 'failed' : 'idle'}
            statusLabel={loading ? 'Reading your career data' : undefined}
            title="AI Career Briefing"
        >
            {loading && (
                <div className="space-y-2" aria-hidden="true">
                    <CubaSkeleton height="1rem" width="70%" text="Reading your career data" />
                    <CubaSkeleton height="0.9rem" width="90%" />
                </div>
            )}

            {!loading && briefing.headline && (
                <div className="space-y-2">
                    <CubaBadge tone={briefing.state === 'error' ? 'danger' : briefing.state === 'scored' ? 'success' : 'info'}>
                        {briefing.state === 'error'
                            ? 'Unavailable'
                            : briefing.state === 'scored' ? 'Live data' : 'Getting started'}
                    </CubaBadge>
                    <p className="text-sm font-medium text-cuba-ink">{briefing.headline}</p>
                    {briefing.detail && <p className="text-sm">{briefing.detail}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                        {briefing.action && (
                            <CubaButton size="sm" variant="secondary" as="a" href={briefing.action.to} iconRight={<FiArrowRight className="h-4 w-4" aria-hidden="true" />}>
                                {briefing.action.label}
                            </CubaButton>
                        )}
                        {briefing.state === 'error' && (
                            <CubaButton size="sm" variant="outline" onClick={load} icon={<FiRefreshCw className="h-4 w-4" aria-hidden="true" />}>
                                Try again
                            </CubaButton>
                        )}
                    </div>
                </div>
            )}

            {!loading && !briefing.headline && (
                <p className="text-sm">
                    {EMPTY_BRIEFING_MESSAGE}</p>
            )}
        </AiSurface>
    );
};

export default AiCareerBriefing;
