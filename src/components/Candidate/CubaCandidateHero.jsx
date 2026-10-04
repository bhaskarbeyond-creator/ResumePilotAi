import React, { useEffect, useState, useMemo } from 'react';
import { FiPlus, FiBriefcase, FiAward, FiFileText, FiZap } from 'react-icons/fi';
import CubaStatCard from '../cuba/CubaStatCard';
import { getResumes } from '../../services/api/platform';
import { summariseResumes } from './briefingLogic';

const CubaCandidateHero = ({ displayName = 'Candidate' }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [resumes, setResumes] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let active = true;
        setLoading(true);
        getResumes()
            .then((data) => {
                if (active) {
                    const list = Array.isArray(data)
                        ? data
                        : (data?.allResumes || data?.resumes || []);
                    setResumes(list);
                }
            })
            .catch(() => {
                if (active) setResumes([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    const summary = useMemo(() => summariseResumes(resumes || []), [resumes]);

    const formattedTime = useMemo(() => {
        return currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [currentTime]);

    const formattedDate = useMemo(() => {
        return currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }, [currentTime]);

    const greeting = useMemo(() => {
        const hour = currentTime.getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }, [currentTime]);

    const { hourDegrees, minuteDegrees, secondDegrees } = useMemo(() => {
        const seconds = currentTime.getSeconds();
        const minutes = currentTime.getMinutes();
        const hours = currentTime.getHours();
        return {
            secondDegrees: (seconds / 60) * 360,
            minuteDegrees: ((minutes + seconds / 60) / 60) * 360,
            hourDegrees: (((hours % 12) + minutes / 60) / 12) * 360,
        };
    }, [currentTime]);

    const count = summary.count;
    const bestScore = summary.bestScore;

    return (
        <div className="space-y-6">
            {/* Authentic Cuba Executive Profile Box Welcome Banner.
              * `data-testid` is the single-authoritative-hero hook the DIR-009 E2E
              * suite counts. DashboardHomepage's legacy welcome header and its four
              * KPI cards are already suppressed behind `!isCuba`, so exactly one
              * element carrying this id may exist in the Candidate Dashboard. */}
            <div
                data-testid="cuba-candidate-hero"
                className="relative overflow-hidden rounded-[18px] p-6 sm:p-8 text-white shadow-[0_12px_32px_-6px_rgba(115,102,255,0.42)] transition-all"
                style={{
                    background: 'linear-gradient(103.75deg, #33b1ee -13.9%, #7366ff 79.68%)',
                }}
            >
                {/* Decorative ambient glowing circles */}
                <div className="pointer-events-none absolute -right-8 -top-8 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-10 right-28 h-44 w-44 rounded-full bg-sky-300/15 blur-xl" aria-hidden="true" />
                <div className="pointer-events-none absolute left-1/3 top-0 h-32 w-32 rounded-full bg-indigo-300/10 blur-lg" aria-hidden="true" />

                {/* Cuba Vector Character Animation */}
                <div className="pointer-events-none absolute right-4 lg:right-48 xl:right-56 -bottom-3 hidden md:block w-40 lg:w-48 xl:w-56 select-none z-10">
                    <img
                        src="/images/dashboard/cartoon.svg"
                        alt="Cuba Executive Candidate"
                        className="w-full h-auto drop-shadow-md cuba-animate-bounce"
                    />
                </div>

                <div className="relative z-20 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs border border-white/25">
                            <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true" />
                            <span>Executive Career Intelligence</span>
                        </div>
                        <h1 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white font-rubik">
                            {greeting}, {displayName}!
                        </h1>
                        <p className="mt-2 text-sm sm:text-base text-white/90 leading-relaxed font-normal max-w-xl">
                            {count > 0
                                ? `You have ${count} active resume${count > 1 ? 's' : ''} in your workspace. ${bestScore ? `Top ATS Readiness: ${bestScore}/100.` : ''} Ready to optimize your next role application?`
                                : 'Build your first recruiter-ready resume with context-aware AI, Google XYZ formula, and 51 certified ATS templates.'}
                        </p>

                        <div className="mt-6 flex flex-wrap items-center gap-3">
                            <a
                                href="/build-resume/heading?new=1"
                                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-[#5949d6] shadow-[0_4px_14px_rgba(0,0,0,0.15)] transition-all hover:bg-slate-100 hover:shadow-lg cursor-pointer"
                            >
                                <FiPlus className="h-4 w-4" aria-hidden="true" />
                                <span>Create New Resume</span>
                            </a>
                            <a
                                href="/dashboard/jobs"
                                className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xs border border-white/25 transition-all hover:bg-white/25 cursor-pointer"
                            >
                                <FiBriefcase className="h-4 w-4" aria-hidden="true" />
                                <span>Explore Jobs</span>
                            </a>
                            <a
                                href="/dashboard/interview"
                                className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xs border border-white/25 transition-all hover:bg-white/25 cursor-pointer"
                            >
                                <FiZap className="h-4 w-4" aria-hidden="true" />
                                <span>Mock Interview</span>
                            </a>
                        </div>
                    </div>

                    {/* Clock & Status Box (Authentic Cuba Profile-box Clock) */}
                    <div className="hidden lg:flex flex-col items-center justify-center rounded-2xl bg-black/20 p-4 border border-white/20 backdrop-blur-md min-w-[150px] text-center z-20">
                        <div className="clockbox relative flex items-center justify-center">
                            <svg id="cuba-analog-clock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" className="w-12 h-12">
                                <circle cx="300" cy="300" r="253.9" fill="#ffffff" stroke="rgba(255,255,255,0.4)" strokeWidth="25" />
                                <path
                                    d="M300.5 94V61M506 300.5h32M300.5 506v33M94 300.5H60M411.3 107.8l7.9-13.8M493 190.2l13-7.4M492.1 411.4l16.5 9.5M411 492.3l8.9 15.3M189 492.3l-9.2 15.9M107.7 411L93 419.5M107.5 189.3l-17.1-9.9M188.1 108.2l-9-15.6"
                                    fill="none"
                                    stroke="#626a7d"
                                    strokeWidth="14"
                                    strokeMiterlimit="10"
                                />
                                <circle cx="300" cy="300" r="16.2" fill="#10121a" />
                                <g transform={`rotate(${hourDegrees} 300 300)`}>
                                    <path d="M300.5 298V142" fill="none" stroke="#ff7e00" strokeWidth="22" strokeLinecap="round" />
                                </g>
                                <g transform={`rotate(${minuteDegrees} 300 300)`}>
                                    <path d="M300.5 298V67" fill="none" stroke="#ff7e00" strokeWidth="15" strokeLinecap="round" />
                                </g>
                                <g transform={`rotate(${secondDegrees} 300 300)`}>
                                    <path d="M300.5 350V55" fill="none" stroke="#f3d04f" strokeWidth="9" strokeLinecap="round" />
                                </g>
                            </svg>
                        </div>
                        <div className="mt-2 text-xs font-black tracking-tight text-white font-mono">
                            {formattedTime}
                        </div>
                        <div className="text-[10px] font-semibold text-white/80">
                            {formattedDate}
                        </div>
                    </div>
                </div>
            </div>

            {/* Row of 4 Cuba KPI Stat Cards with Authentic widget-1 styling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                <CubaStatCard
                    label="Active Resumes"
                    value={loading ? '...' : String(count)}
                    hint="51 certified ATS templates"
                    icon={<FiFileText className="h-5 w-5" />}
                    accent="primary"
                    loading={loading}
                    trend={count > 0 ? { label: `${count} in workspace`, tone: 'up' } : null}
                />
                <CubaStatCard
                    label="Average ATS Score"
                    value={loading ? '...' : bestScore !== null ? `${bestScore}%` : 'Not Scored'}
                    hint={bestScore && bestScore >= 75 ? 'Recruiter pass benchmark' : 'Target: 80%+ benchmark'}
                    icon={<FiAward className="h-5 w-5" />}
                    accent={bestScore && bestScore >= 75 ? 'success' : 'warning'}
                    loading={loading}
                    trend={bestScore ? { label: bestScore >= 75 ? 'Market Ready' : 'Needs Optimization', tone: bestScore >= 75 ? 'up' : 'down' } : null}
                />
                <CubaStatCard
                    label="Job Applications"
                    value="0"
                    hint="Tracked roles in pipeline"
                    icon={<FiBriefcase className="h-5 w-5" />}
                    accent="info"
                    loading={false}
                    trend={{ label: 'Pipeline active', tone: 'up' }}
                />
                <CubaStatCard
                    label="AI Interview Coach"
                    value="Ready"
                    hint="CBT behavioral simulation"
                    icon={<FiZap className="h-5 w-5" />}
                    accent="warning"
                    loading={false}
                    trend={{ label: 'Drills available', tone: 'up' }}
                />
            </div>
        </div>
    );
};

export default CubaCandidateHero;
