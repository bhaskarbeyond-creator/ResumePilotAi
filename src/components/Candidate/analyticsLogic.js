/**
 * analyticsLogic — the pure helpers behind the DIR-094 candidate Overview analytics band.
 *
 * WHY THIS IS A SEPARATE MODULE (and not just inline exports):
 *   All three band components need the same date and bucketing arithmetic. Keeping those
 *   pure functions in their own module means the .jsx files export ONLY components, which
 *   keeps React Fast Refresh correct and keeps the lint gate at zero warnings — the same
 *   reason `briefingLogic.js` already sits beside `AiCareerBriefing.jsx`. It also lets the
 *   DIR-094 suite exercise the REAL arithmetic directly instead of pattern-matching JSX.
 *
 * Nothing in this file fetches, mutates or invents data. Every function either derives a
 * value from what the caller measured or returns an explicit "unknown" (null / '').
 */

const MONTH_LABELS = Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

/** How many real calendar months the Application Progress chart covers. */
export const WINDOW_MONTHS = 6;

/** How many real job listings the Top Job Matches column shows. */
export const MATCH_LIMIT = 5;

/**
 * The three stages that represent real application PROGRESS (wishlist/archived are not).
 *
 * DIR-090 GAP-2: the colour assignment follows the reference legend, where Interviewing is the
 * GREEN stage and Offers is the AMBER one. The pre-DIR-090 mapping was inverted (interview ->
 * --cuba-warning, offer -> --cuba-success), which painted the same bars the opposite way round
 * from the approved screenshot. The reference legend also lists a fourth "Shortlisted" series;
 * that one is deliberately ABSENT because `status` in backend/routes/jobsData.js is constrained
 * to wishlist/applied/interview/offer/rejected, so no "shortlisted" row can ever exist.
 */
export const PROGRESS_SERIES = Object.freeze([
    Object.freeze({ id: 'applied', label: 'Applied', color: 'var(--cuba-primary)' }),
    Object.freeze({ id: 'interview', label: 'Interviewing', color: 'var(--cuba-success)' }),
    Object.freeze({ id: 'offer', label: 'Offers', color: 'var(--cuba-warning)' }),
]);

/**
 * Coerces a real date field to a Date, or returns null. Never invents a date: an absent
 * or unparseable value stays null so the caller can exclude the row instead of guessing.
 */
export const toRealDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/**
 * The last `count` real calendar months, oldest first, ending with the month that contains
 * `now`. Each month carries a zeroed counts object for the three progress series.
 */
export const monthWindow = (now, count = WINDOW_MONTHS) => {
    const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const months = [];
    for (let back = count - 1; back >= 0; back -= 1) {
        const first = new Date(base.getFullYear(), base.getMonth() - back, 1);
        months.push({
            key: monthKey(first),
            label: MONTH_LABELS[first.getMonth()],
            year: first.getFullYear(),
            counts: { applied: 0, interview: 0, offer: 0 },
        });
    }
    return months;
};

/**
 * Buckets REAL tracked jobs into the window by their own date (`dateApplied`, else
 * `createdAt`). Returns the months, the number of rows carrying no usable date, and the
 * total that landed inside the window.
 *
 * A row with no date is counted as `undated` and EXCLUDED — it is never folded into the
 * current month. A row outside the window is dropped, never clamped into the edge month.
 */
export const bucketTrackedJobs = (jobs, now) => {
    const months = monthWindow(now);
    const byKey = new Map(months.map((month) => [month.key, month]));
    let undated = 0;

    (Array.isArray(jobs) ? jobs : []).forEach((job) => {
        const date = toRealDate(job?.dateApplied) || toRealDate(job?.createdAt);
        if (!date) {
            undated += 1;
            return;
        }
        const bucket = byKey.get(monthKey(date));
        if (!bucket) return;
        const series = PROGRESS_SERIES.find((entry) => entry.id === job?.status);
        if (!series) return;
        bucket.counts[series.id] += 1;
    });

    const total = months.reduce(
        (sum, month) => sum + month.counts.applied + month.counts.interview + month.counts.offer,
        0,
    );
    return { months, undated, total };
};

/**
 * A truthful recency label. Returns '' when the row carries no usable timestamp, so the
 * caller omits the line entirely rather than claiming "Just posted".
 */
export const postedLabel = (value, now = new Date()) => {
    const date = toRealDate(value);
    if (!date) return '';
    const elapsed = now.getTime() - date.getTime();
    if (elapsed < 0) return ''; // a future stamp is not something to describe as "ago"
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 60) return minutes <= 1 ? 'Just posted' : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    // DIR-090 GAP-5: day-and-week granularity is spelled out ("2 days ago"), matching the
    // reference wording. Still derived from the real timestamp — never a fabricated recency.
    if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * Real favourite rows key the job as `itemId` (see MySQLRepository.getFavourites). Every
 * shape we actually store is read defensively so a rename cannot silently break the star.
 */
export const favouriteJobId = (favourite) => String(
    favourite?.itemId ?? favourite?.item_id ?? favourite?.jobId ?? favourite?.job_id ?? favourite?.id ?? '',
);

/**
 * The real completed/total COUNT of the measured onboarding steps, as a percentage.
 * Returns 0 for an empty list — an unmeasured workspace reads as 0%, never as complete.
 */
export const completionPercent = (steps) => {
    const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
    if (list.length === 0) return 0;
    return Math.round((list.filter((step) => step.completed === true).length / list.length) * 100);
};
