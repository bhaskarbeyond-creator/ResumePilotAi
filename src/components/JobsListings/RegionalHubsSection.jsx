import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicRegions } from '../../services/api/geo';

export default function RegionalHubsSection() {
    const [regions, setRegions] = useState(null);
    const [unavailable, setUnavailable] = useState(false);

    useEffect(() => {
        let active = true;
        getPublicRegions()
            .then(result => {
                if (!active) return;
                setRegions({ cities: result.cities || [], states: result.states || [] });
            })
            .catch(error => {
                if (!active) return;
                // A disabled directory is unpublished, not an outage.
                if (Number(error?.status) >= 500) setUnavailable(true);
            });
        return () => { active = false; };
    }, []);

    if (unavailable) {
        return <p role="status" className="mb-5 rounded-cuba-lg border border-cuba-line bg-cuba-card px-4 py-3 text-sm text-cuba-ink-muted">Regional job hubs are temporarily unavailable.</p>;
    }
    if (!regions || (!regions.cities.length && !regions.states.length)) return null;

    return (
        <section aria-labelledby="regional-hubs-heading" className="mb-8 rounded-cuba-xl border border-cuba-line bg-cuba-card p-5 shadow-cuba-sm sm:p-6">
            <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cuba-primary">India</p>
                <h2 id="regional-hubs-heading" className="mt-1 text-xl font-bold text-cuba-ink">Browse regional job hubs</h2>
                <p className="mt-1 text-sm text-cuba-ink-muted">Each hub reflects active job listings currently published in the database.</p>
            </div>
            <div className="space-y-4">
                {regions.cities.length > 0 && (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-cuba-ink">Cities</h3>
                        <ul className="flex flex-wrap gap-2" aria-label="Indian city job hubs">
                            {regions.cities.map(city => (
                                <li key={city.slug}>
                                    <Link className="cuba-btn-outline inline-flex rounded-full px-3 py-1.5 text-sm font-medium" to={`/jobs/city/${encodeURIComponent(city.slug)}`}>
                                        {city.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {regions.states.length > 0 && (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-cuba-ink">States and regions</h3>
                        <ul className="flex flex-wrap gap-2" aria-label="Indian state job hubs">
                            {regions.states.map(state => (
                                <li key={state.slug}>
                                    <Link className="cuba-btn-outline inline-flex rounded-full px-3 py-1.5 text-sm font-medium" to={`/jobs/in/${encodeURIComponent(state.slug)}`}>
                                        {state.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}
