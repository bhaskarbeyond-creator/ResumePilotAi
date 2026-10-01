import React from 'react';
import { EmployerPageHeader } from './EmployerStates';
import EmployerDashboard from '../Dashboard/EmployerDashboard/EmployerDashboard';

/**
 * Job Postings — /employer/jobs
 *
 * Thin portal surface over the maintained recruiter job-management component.
 * The component owns its own loading, empty, error, and modal states and drives
 * the same /api/employer/jobs endpoints, so no behaviour is duplicated here.
 */
const EmployerJobPostings = ({ showToast }) => {
    return (
        <div>
            <EmployerPageHeader
                eyebrow="Requisitions & Applicants"
                title="Job Postings"
                description="Create, edit, publish, and close the requisitions for your organisation."
            />
            <EmployerDashboard showToast={showToast} />
        </div>
    );
};

export default EmployerJobPostings;
