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
        await setStats(stats);
        alert('Stats updated successfully!');
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
                <button type="submit">Save</button>
            </form>
        </div>
    );
};

export default JobsLandingStats;

