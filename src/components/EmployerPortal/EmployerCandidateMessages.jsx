import React from 'react';
import { EmployerPageHeader } from './EmployerStates';
import DashboardMessages from '../Dashboard/DashboardMessages/DashboardMessages';

/**
 * Candidate Messages — /employer/messages
 *
 * The recruiter reads the same conversation surface candidates use, scoped by
 * the authenticated recruiter account on the server. Mounting it inside the
 * employer portal keeps candidate communication out of the candidate nav while
 * preserving the existing thread, unread badge, and send behaviour.
 */
const EmployerCandidateMessages = ({ showToast }) => {
    return (
        <div>
            <EmployerPageHeader
                eyebrow="Requisitions & Applicants"
                title="Candidate Messages"
                description="Conversations with applicants who reached out about your open roles."
            />
            <DashboardMessages showToast={showToast} />
        </div>
    );
};

export default EmployerCandidateMessages;
