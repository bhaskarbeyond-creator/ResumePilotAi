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
    const [status, setStatus] = useState(null);

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
        const result = await setStats(stats);
        setStatus(result?.success ? { type: 'success', text: 'Stats updated successfully.' } : { type: 'error', text: result?.message || 'Stats could not be updated.' });
    };

    return (
        <div className="jobs-landing-stats">
            <h2>Edit Jobs Landing Stats</h2>
            {status && <p role={status.type === 'success' ? 'status' : 'alert'} className={status.type === 'success' ? 'text-emerald-700' : 'text-red-700'}>{status.text}</p>}
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
                <button type="submit">Save</button>
            </form>
        </div>
    );
};

export default JobsLandingStats;

