import React, { useState, useEffect } from "react";
import { getStats, setStats } from '../../firestore/dbOperations';

const JobsLandingStats = () => {
    const [stats, setStatsState] = useState({
        activeJobs: '',
        rating: '',
        partnerCompanies: '',
        successfulHires: '',
        topCompanies: '',
        successRate: '',
        featuredJobs: ''
    });
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            const fetchedStats = await getStats();
            setStatsState(fetchedStats);
        };
        fetchStats();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setStatsState((prevStats) => ({
            ...prevStats,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        setFeedback(null);
        try {
            await setStats(stats);
            setFeedback({ tone: 'success', message: 'Stats updated successfully.' });
        } catch (error) {
            // Previously the save was unguarded and always announced success,
            // so a failed write still told the operator it had worked.
            setFeedback({ tone: 'error', message: error?.message || 'Stats could not be saved. Please retry.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="jobs-landing-stats">
            <h2>Edit Jobs Landing Stats</h2>
            <form onSubmit={handleSubmit}>
                {Object.keys(stats).map((key) => (
                    <div key={key}>
                        <label>{key}</label>
                        <input
                            type="text"
                            name={key}
                            value={stats[key] || ''}
                            onChange={handleChange}
                        />
                    </div>
                ))}
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                {feedback && (
                    <p
                        role={feedback.tone === 'error' ? 'alert' : 'status'}
                        data-testid="jobs-landing-stats-feedback"
                        className={feedback.tone === 'error' ? 'form-feedback form-feedback--error' : 'form-feedback form-feedback--success'}
                    >
                        {feedback.message}
                    </p>
                )}
            </form>
        </div>
    );
};

export default JobsLandingStats;

