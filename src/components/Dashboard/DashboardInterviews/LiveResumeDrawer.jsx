// LiveResumeDrawer.jsx - Slide-over HUD for Live Resume Grounding
// Allows candidates to instantly reference their career facts, metrics, and achievements while answering.
import React, { useState, useMemo } from 'react';
import {
    FaTimes, FaBriefcase, FaGraduationCap, FaCertificate, FaTools,
    FaSearch, FaFileAlt, FaLightbulb, FaCheckCircle,
} from 'react-icons/fa';

export default function LiveResumeDrawer({ isOpen, onClose, resumeFacts = '', configuration = {} }) {
    const [searchTerm, setSearchTerm] = useState('');

    const parsedSections = useMemo(() => {
        if (!resumeFacts) return { lines: [], work: [], skills: [], projects: [], education: [], certs: [], summary: '' };

        const rawLines = resumeFacts.split('\n').map(l => l.trim()).filter(Boolean);
        const sections = {
            summary: '',
            work: [],
            skills: [],
            projects: [],
            education: [],
            certs: [],
            lines: rawLines,
        };

        rawLines.forEach(line => {
            if (line.startsWith('Summary:')) {
                sections.summary = line.replace('Summary:', '').trim();
            } else if (line.startsWith('Work:')) {
                sections.work = line.replace('Work:', '').split(';').map(w => w.trim()).filter(Boolean);
            } else if (line.startsWith('Skills:')) {
                sections.skills = line.replace('Skills:', '').split(',').map(s => s.trim()).filter(Boolean);
            } else if (line.startsWith('Projects:')) {
                sections.projects = line.replace('Projects:', '').split(',').map(p => p.trim()).filter(Boolean);
            } else if (line.startsWith('Certifications:')) {
                sections.certs = line.replace('Certifications:', '').split(',').map(c => c.trim()).filter(Boolean);
            } else if (line.startsWith('Education:')) {
                sections.education = line.replace('Education:', '').split(';').map(e => e.trim()).filter(Boolean);
            }
        });

        return sections;
    }, [resumeFacts]);

    if (!isOpen) return null;

    const matchesSearch = (text) => {
        if (!searchTerm) return true;
        return String(text).toLowerCase().includes(searchTerm.toLowerCase());
    };

    return (
        <div className="fixed inset-0 z-[80] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="resume-drawer-title">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
                <div className="w-screen max-w-md pointer-events-auto bg-white border-l border-slate-200 shadow-2xl flex flex-col">
                    {/* Drawer Header */}
                    <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-300">
                                <FaFileAlt /> Resume Grounding HUD
                            </div>
                            <h2 id="resume-drawer-title" className="text-lg font-black tracking-tight text-white mt-0.5">
                                Career Reference Data
                            </h2>
                            <p className="text-[11px] text-slate-300">
                                Active target: {configuration.role || 'Target Role'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            aria-label="Close resume drawer"
                        >
                            <FaTimes className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Quick Search */}
                    <div className="p-3 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search skills, companies, metrics…"
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-700">
                        {/* Summary */}
                        {parsedSections.summary && matchesSearch(parsedSections.summary) && (
                            <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5 mb-2">
                                    <FaLightbulb /> Professional Summary
                                </h3>
                                <p className="text-xs leading-relaxed text-slate-800">
                                    {parsedSections.summary}
                                </p>
                            </section>
                        )}

                        {/* Work Experience */}
                        {parsedSections.work.length > 0 && (
                            <section className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                                    <FaBriefcase className="text-indigo-600" /> Work Experience
                                </h3>
                                <div className="space-y-2">
                                    {parsedSections.work.filter(matchesSearch).map((job, idx) => (
                                        <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-900 flex items-start gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                                            <span>{job}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Projects */}
                        {parsedSections.projects.length > 0 && (
                            <section className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                                    <FaTools className="text-violet-600" /> Featured Projects
                                </h3>
                                <div className="space-y-1.5">
                                    {parsedSections.projects.filter(matchesSearch).map((proj, idx) => (
                                        <div key={idx} className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 flex items-center gap-2">
                                            <FaCheckCircle className="text-emerald-500 shrink-0 text-[11px]" />
                                            <span>{proj}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Skills */}
                        {parsedSections.skills.length > 0 && (
                            <section className="space-y-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                                    <FaTools className="text-indigo-600" /> Skills & Competencies
                                </h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {parsedSections.skills.filter(matchesSearch).map((skill, idx) => (
                                        <span key={idx} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-800">
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Certifications & Education */}
                        {(parsedSections.certs.length > 0 || parsedSections.education.length > 0) && (
                            <section className="space-y-3 pt-2 border-t border-slate-100">
                                {parsedSections.certs.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-1.5">
                                            <FaCertificate className="text-amber-500" /> Certifications
                                        </h4>
                                        <div className="space-y-1">
                                            {parsedSections.certs.filter(matchesSearch).map((c, idx) => (
                                                <div key={idx} className="text-xs text-slate-700 pl-2 border-l-2 border-amber-400">
                                                    {c}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {parsedSections.education.length > 0 && (
                                    <div className="pt-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-1.5">
                                            <FaGraduationCap className="text-emerald-600" /> Education
                                        </h4>
                                        <div className="space-y-1">
                                            {parsedSections.education.filter(matchesSearch).map((edu, idx) => (
                                                <div key={idx} className="text-xs text-slate-700 pl-2 border-l-2 border-emerald-400">
                                                    {edu}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Empty state when no resume was selected */}
                        {parsedSections.lines.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                                <FaFileAlt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                                <p className="text-xs font-semibold">No resume facts linked to this session.</p>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Next time, select a saved resume in preflight to ground your interview in your actual career achievements!
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Footer Tip */}
                    <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                        <p className="text-[11px] text-slate-500 font-medium">
                            💡 Use the <span className="font-bold text-indigo-700">STAR Method</span>: Situation, Task, Action, Result.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
