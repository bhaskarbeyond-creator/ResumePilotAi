import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdWarning, MdAutoAwesome, MdSpeed, MdExpandMore, MdExpandLess, MdInfoOutline, MdWorkOutline, MdSchool, MdPsychology, MdPersonOutline, MdSubject } from 'react-icons/md';

const ACTION_VERBS = [
    'spearheaded', 'architected', 'engineered', 'optimized', 'pioneered',
    'orchestrated', 'delivered', 'implemented', 'designed', 'increased',
    'reduced', 'developed', 'launched', 'managed', 'led', 'created',
    'expanded', 'automated', 'transformed', 'negotiated'
];

export const calculateAtsScore = (data = {}) => {
    let score = 0;

    // 1. Personal Contact Info (15 pts)
    const hasName = Boolean(data.firstname && data.lastname);
    const hasEmail = Boolean(data.email);
    const hasPhone = Boolean(data.phone);
    const hasLocation = Boolean(data.city || data.country);

    let contactPts = 0;
    if (hasName) contactPts += 5;
    if (hasEmail) contactPts += 4;
    if (hasPhone) contactPts += 3;
    if (hasLocation) contactPts += 3;
    score += contactPts;

    // 2. Work Experience & Quantifiable Impact (35 pts)
    const employments = data.employments || [];
    let workPts = 0;
    let totalBullets = 0;
    let actionVerbCount = 0;
    let metricCount = 0;

    if (employments.length > 0) {
        workPts += 10;
        employments.forEach((emp) => {
            const desc = (emp.description || '').toLowerCase();
            if (desc.length > 10) totalBullets++;

            ACTION_VERBS.forEach((verb) => {
                if (desc.includes(verb)) actionVerbCount++;
            });

            if (/(\d+%|\$\d+|\d+\+|\d+k|\d+m)/i.test(desc)) {
                metricCount++;
            }
        });

        if (totalBullets >= 2) workPts += 10;
        if (actionVerbCount >= 2) workPts += 8;
        if (metricCount >= 1) workPts += 7;
    }
    score += workPts;

    // 3. Education Highlights (15 pts)
    const educations = data.educations || [];
    let eduPts = 0;
    if (educations.length > 0) {
        eduPts += 10;
        if (educations.some((e) => e.degree && e.school)) eduPts += 5;
    }
    score += eduPts;

    // 4. ATS Skills Density (20 pts)
    const skills = data.skills || [];
    let skillPts = 0;
    if (skills.length >= 3) skillPts += 10;
    if (skills.length >= 6) skillPts += 10;
    score += skillPts;

    // 5. Professional Summary (15 pts)
    const summary = (data.summary || '').trim();
    let summaryPts = 0;
    if (summary.length >= 40) summaryPts += 8;
    if (summary.length >= 100) summaryPts += 7;
    score += summaryPts;

    const sections = [
        {
            id: 'contact',
            name: 'Contact & Location',
            icon: MdPersonOutline,
            score: contactPts,
            maxScore: 15,
            tip: contactPts >= 12 ? 'Complete contact details provided.' : 'Include email, phone, & location.',
        },
        {
            id: 'work',
            name: 'Work History & Metrics',
            icon: MdWorkOutline,
            score: workPts,
            maxScore: 35,
            tip: workPts >= 25 ? 'Strong action verbs & quantified impact.' : 'Add metrics (%, $, numbers) & action verbs.',
        },
        {
            id: 'education',
            name: 'Education & Degree',
            icon: MdSchool,
            score: eduPts,
            maxScore: 15,
            tip: eduPts >= 10 ? 'Degree & school listed.' : 'Specify degree title & school.',
        },
        {
            id: 'skills',
            name: 'ATS Skill Keywords',
            icon: MdPsychology,
            score: skillPts,
            maxScore: 20,
            tip: skillPts >= 15 ? `${skills.length} ATS skills added.` : 'List 6-8 relevant hard skills.',
        },
        {
            id: 'summary',
            name: 'Executive Summary',
            icon: MdSubject,
            score: summaryPts,
            maxScore: 15,
            tip: summaryPts >= 12 ? 'Compelling 3-sentence summary.' : 'Add a 3-sentence summary.',
        },
    ];

    return {
        totalScore: Math.min(100, score),
        sections,
    };
};

const AtsScoreMeter = ({ resumeData }) => {
    const { t } = useTranslation('common');
    const [isExpanded, setIsExpanded] = useState(false);
    const { totalScore, sections } = useMemo(() => calculateAtsScore(resumeData), [resumeData]);

    const getScoreTheme = (score) => {
        if (score >= 85) return { label: '🔥 Fortune 500 Ready', text: 'text-emerald-700', bg: 'bg-emerald-500', stroke: '#10b981', ring: 'ring-emerald-400/30' };
        if (score >= 70) return { label: '⚡ Strong Candidate', text: 'text-indigo-700', bg: 'bg-indigo-500', stroke: '#6366f1', ring: 'ring-indigo-400/30' };
        if (score >= 50) return { label: '⚠️ Needs Impact Metrics', text: 'text-amber-700', bg: 'bg-amber-500', stroke: '#f59e0b', ring: 'ring-amber-400/30' };
        return { label: '🚀 Getting Started', text: 'text-rose-700', bg: 'bg-rose-500', stroke: '#f43f5e', ring: 'ring-rose-400/30' };
    };

    const theme = getScoreTheme(totalScore);

    // SVG Circular Progress Math
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (totalScore / 100) * circumference;

    return (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 space-y-3">
            {/* Header Gauge & Title */}
            <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                    {/* SVG Radial Gauge */}
                    <div className="relative flex items-center justify-center flex-shrink-0">
                        <svg className="w-14 h-14 transform -rotate-90">
                            <circle
                                cx="28"
                                cy="28"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="4.5"
                                fill="transparent"
                                className="text-slate-100"
                            />
                            <circle
                                cx="28"
                                cy="28"
                                r={radius}
                                stroke={theme.stroke}
                                strokeWidth="4.5"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                fill="transparent"
                                className="transition-all duration-700 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xs font-black text-slate-900 leading-none">{totalScore}</span>
                            <span className="text-[8px] font-bold text-slate-400">/100</span>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center space-x-1 mb-0.5">
                            <MdSpeed className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider truncate">ATS Score</span>
                        </div>
                        <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md ${theme.bg}/10 ${theme.text} border border-${theme.bg}/20 truncate max-w-full`}>
                            {theme.label}
                        </span>
                    </div>
                </div>

                {/* Inline Toggle Button */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0"
                    title="Toggle Detailed Breakdown">
                    {isExpanded ? <MdExpandLess className="w-5 h-5" /> : <MdExpandMore className="w-5 h-5" />}
                </button>
            </div>

            {/* Inline Section Breakdown Panel inside Sidebar */}
            {isExpanded && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Section Audit</span>
                        <span>Score</span>
                    </div>

                    {sections.map((sec) => {
                        const Icon = sec.icon;
                        const pct = Math.round((sec.score / sec.maxScore) * 100);
                        const isPassed = pct >= 70;

                        return (
                            <div key={sec.id} className="space-y-1 bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center space-x-1.5 min-w-0">
                                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isPassed ? 'text-indigo-600' : 'text-amber-500'}`} />
                                        <span className="text-[11px] font-bold text-slate-700 truncate">{sec.name}</span>
                                    </div>
                                    <span className="text-[10px] font-extrabold text-slate-600 ml-1">
                                        {sec.score}/{sec.maxScore}
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                    <div
                                        className={`h-1 rounded-full transition-all duration-500 ${isPassed ? 'bg-indigo-600' : 'bg-amber-500'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>

                                <p className="text-[10px] text-slate-500 leading-tight pt-0.5">
                                    {sec.tip}
                                </p>
                            </div>
                        );
                    })}

                    {/* Target Job Description Matcher */}
                    <JdMatcherSection resumeData={data} />
                </div>
            )}
        </div>
    );
};

// Target Job Description Matcher Component
const JdMatcherSection = ({ resumeData }) => {
    const [jdText, setJdText] = useState('');
    const [showMatcher, setShowMatcher] = useState(false);
    const [matched, setMatched] = useState([]);
    const [missing, setMissing] = useState([]);
    const [score, setScore] = useState(null);

    const handleScan = () => {
        if (!jdText.trim()) return;
        const words = jdText.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'will', 'are', 'this', 'that', 'have', 'from', 'your', 'about', 'team', 'work']);
        const uniqueJdKeywords = Array.from(new Set(words.filter(w => !stopWords.has(w)))).slice(0, 15);

        const resumeFullText = JSON.stringify(resumeData).toLowerCase();
        const found = [];
        const notFound = [];

        uniqueJdKeywords.forEach(k => {
            if (resumeFullText.includes(k)) {
                found.push(k);
            } else {
                notFound.push(k);
            }
        });

        setMatched(found);
        setMissing(notFound);
        setScore(uniqueJdKeywords.length ? Math.round((found.length / uniqueJdKeywords.length) * 100) : 0);
    };

    return (
        <div className="mt-3 pt-2 border-t border-slate-200">
            <button
                onClick={() => setShowMatcher(!showMatcher)}
                className="w-full flex items-center justify-between text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg border border-indigo-200/70 transition-colors">
                <span className="flex items-center gap-1.5">
                    <MdAutoAwesome className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Target JD Matcher</span>
                </span>
                <span className="text-[10px] bg-indigo-200/60 px-1.5 py-0.5 rounded text-indigo-900">
                    {score !== null ? `${score}% Match` : 'Scan JD'}
                </span>
            </button>

            {showMatcher && (
                <div className="mt-2 space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <textarea
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        placeholder="Paste Job Description here to scan missing ATS keywords..."
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none h-16 resize-none bg-white"
                    />
                    <button
                        onClick={handleScan}
                        className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg transition-colors">
                        Scan & Match Keywords
                    </button>
                    {score !== null && (
                        <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-[11px] font-bold">
                                <span className="text-emerald-700">Matched ({matched.length})</span>
                                <span className="text-amber-700">Missing ({missing.length})</span>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {matched.map((k) => (
                                    <span key={k} className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">✓ {k}</span>
                                ))}
                                {missing.map((k) => (
                                    <span key={k} className="text-[9px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.5 rounded">+ {k}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AtsScoreMeter;
