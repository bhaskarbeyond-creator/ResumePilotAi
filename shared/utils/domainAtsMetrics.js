export function getDomainAtsMetrics(role = '', context = null, projectName = '', tech = '') {
    const combined = `${role} ${projectName} ${tech} ${context?.target?.role || ''} ${context?.profession || ''}`.toLowerCase();
    if (/\b(?:doctor|physician|surgeon|cardiologist|pediatrician|resident|medical|clinician|nurse|nursing|rn|clinical|hospital|patient|triage|health|pharma)\b/.test(combined)) {
        return [
            { label: 'Patient volume', prompt: 'How many patients did you typically handle (per shift or day)?' },
            { label: 'Wait/turnaround', prompt: 'Did wait or turnaround times change? From what to what?' },
            { label: 'Quality/audit', prompt: 'Any audit, quality or satisfaction result you can cite?' },
            { label: 'Team size', prompt: 'How many people were on the care team you worked with?' },
        ];
    }
    if (/\b(?:lawyer|attorney|counsel|legal|paralegal|compliance|solicitor|advocate|contract|litigation)\b/.test(combined)) {
        return [
            { label: 'Matters/contracts', prompt: 'How many matters or contracts did you handle?' },
            { label: 'Cycle time', prompt: 'Did review or cycle time change? From what to what?' },
            { label: 'Outcome', prompt: 'What outcome can you state (filings, rulings, cost avoided)?' },
        ];
    }
    if (/\b(?:finance|financial|accountant|accounting|auditor|audit|tax|controller|treasurer|banker|banking|cpa)\b/.test(combined)) {
        return [
            { label: 'Amount', prompt: 'What budget, portfolio or amount were you responsible for?' },
            { label: 'Close/cycle time', prompt: 'Did close or reporting time change? From what to what?' },
        ];
    }
    return [
        { label: 'Scope/volume', prompt: 'What volume, frequency or team size did you handle?' },
        { label: 'Improvement', prompt: 'Did speed, quality or cost improve? From what to what?' },
    ];
}
