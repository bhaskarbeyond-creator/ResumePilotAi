import React from 'react';

/**
 * Client-side administrative bootstrap was retired. The first SUPER_ADMIN claim must be
 * provisioned out-of-band with audited Firebase/IAM tooling; browsers cannot self-elevate.
 */
export default function InitialisationSetup() {
    return (
        <div className="p-6 text-sm text-slate-700">
            Administrative bootstrap is managed securely by the deployment operator.
        </div>
    );
}
