/**
 * DIR-071 — the single server-verified recruiter employer claim.
 *
 * A recruiter viewing an application may export the candidate's ACTUAL applied
 * resume even while it is still a draft, but ONLY when every identifier agrees
 * server-side:
 *   • the caller is authenticated (`user.uid`),
 *   • the job exists AND its employerId is exactly the caller's uid,
 *   • the application exists, belongs to that job, and references exactly this
 *     resumeId,
 *   • the applicant id is present and the resume actually resolves for it.
 *
 * No client-supplied value is ever trusted as authority, so a foreign employer
 * cannot reach another tenant's applicant — zero IDOR. Returns null when the claim
 * does not hold, in which case the caller MUST fall back to the strict
 * published-only rule. Both the PDF and the DOCX route call THIS function so the
 * two authorization paths can never drift apart.
 *
 * It lives in its own module (rather than inline in the router) so the IDOR rules
 * are directly unit-testable with a fake repository.
 */
async function resolveEmployerClaim({ repo, user, jobId, applicationId, resumeId }) {
    const claimJobId = String(jobId || '');
    const claimApplicationId = String(applicationId || '');
    if (!user?.uid
        || !/^[A-Za-z0-9_-]{1,128}$/.test(claimJobId)
        || !/^[A-Za-z0-9:_-]{1,300}$/.test(claimApplicationId)
        || !repo
        || typeof repo.getJob !== 'function'
        || typeof repo.getApplication !== 'function'
        || typeof repo.getResume !== 'function') {
        return null;
    }
    const job = await repo.getJob(claimJobId).catch(() => null);
    if (!job || String(job.employerId || job.employer_id || '') !== user.uid) return null;
    const application = await repo.getApplication(claimApplicationId).catch(() => null);
    if (!application) return null;
    if (String(application.jobId || application.job_id || '') !== claimJobId) return null;
    const applicantId = String(application.applicantId || application.applicant_id || application.userId || '');
    const applicationResumeId = String(application.resumeId || application.resume_id || '');
    if (!applicantId || applicationResumeId !== String(resumeId)) return null;
    const stored = await repo.getResume(applicantId, String(resumeId)).catch(() => null);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    return { stored, ownerUid: applicantId };
}

module.exports = { resolveEmployerClaim };
