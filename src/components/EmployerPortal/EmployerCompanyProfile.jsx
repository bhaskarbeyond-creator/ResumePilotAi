import React from 'react';
import { EmployerPageHeader } from './EmployerStates';
import CompaniesManagement from '../Dashboard/EmployerDashboard/CompaniesManagement';

/**
 * Company Profile — /employer/company
 *
 * Portal surface for the maintained company registry screen. CRUD continues to
 * run through /api/employer/companies and the existing AddCompanyModal, so no
 * recruiter capability is lost by moving it out of the candidate sidebar.
 */
const EmployerCompanyProfile = ({ showToast }) => {
    return (
        <div className="container-fluid p-0 bs-employer-company">
            <EmployerPageHeader
                eyebrow="Brand & Settings"
                title="Company Profile"
                description="The organisation details candidates see when they open one of your job postings."
            />
            <CompaniesManagement showToast={showToast} />
        </div>
    );
};

export default EmployerCompanyProfile;

// bs-component-foundation
