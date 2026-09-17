import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProfileOfUser } from '../../services/api/platform';
import { saveProfile } from '../../services/profilePersistence';
import { normalizeProfileData } from '../../utils/profileData';
import { normalizeResumeData } from '../../utils/resumeData';

/**
 * SyncProfileModal — Bidirectional synchronization between Master Profile and Resume.
 *
 * Ensures 100% data parity and non-destructive sync:
 * - Push: Selectively push new skills, roles, degrees, certs, projects, and achievements from Resume to Master Profile.
 * - Pull: Pull updated Master Profile info into the current resume draft.
 */
export default function SyncProfileModal({
    isOpen,
    onClose,
    userId,
    resumeData,
    onApplyProfileToResume,
    onShowToast,
}) {
    const [mode, setMode] = useState('push'); // 'push' | 'pull'
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState(null);
    const [selectedPushItems, setSelectedPushItems] = useState({});
    const [selectedPullSections, setSelectedPullSections] = useState({
        contact: false,
        summary: false,
        skills: true,
        certifications: true,
        projects: false,
        hobbies: true,
        languages: false,
    });
    const [statusMessage, setStatusMessage] = useState(null);

    // Fetch authoritative Master Profile on open
    useEffect(() => {
        if (!isOpen || !userId) return;
        let active = true;
        setLoading(true);
        setStatusMessage(null);

        getProfileOfUser(userId)
            .then(data => {
                if (!active) return;
                const normalized = normalizeProfileData(data || {});
                setProfile(normalized);
                setLoading(false);
            })
            .catch(err => {
                if (!active) return;
                console.error('[SyncProfileModal] Failed to load user profile:', err);
                setStatusMessage({ type: 'error', text: 'Could not load Master Profile data.' });
                setLoading(false);
            });

        return () => { active = false; };
    }, [isOpen, userId]);

    // Calculate diffs from Resume -> Master Profile (Items present in Resume but NOT in Profile)
    const pushDiffs = useMemo(() => {
        if (!profile || !resumeData) return { totalNew: 0, items: {} };

        const normStr = s => String(s || '').trim().toLowerCase();

        // 1. Skills
        const existingSkillNames = new Set((profile.skills || []).map(s => normStr(typeof s === 'string' ? s : s?.name || s?.skillName)));
        const newSkills = (resumeData.skills || [])
            .map(s => (typeof s === 'string' ? { name: s } : s))
            .filter(s => {
                const name = normStr(s?.skillName || s?.name);
                return name && !existingSkillNames.has(name);
            })
            .map((s, idx) => ({ id: `new_skill_${idx}`, label: s.skillName || s.name, level: s.rating ? (s.rating >= 75 ? 'Advanced' : 'Intermediate') : 'Intermediate', raw: s }));

        // 2. Certifications
        const existingCertTitles = new Set((profile.certifications || []).map(c => normStr(c?.title || c?.name)));
        const newCerts = (resumeData.certifications || [])
            .filter(c => {
                const title = normStr(c?.title || c?.name);
                return title && !existingCertTitles.has(title);
            })
            .map((c, idx) => ({ id: `new_cert_${idx}`, label: c.title || c.name, sub: c.issuer || c.organization || '', raw: c }));

        // 3. Work Experiences
        const existingJobs = new Set((profile.workExperiences || []).map(w => `${normStr(w?.jobTitle)}|${normStr(w?.company)}`));
        const newJobs = (resumeData.employments || [])
            .filter(j => {
                const key = `${normStr(j?.jobTitle)}|${normStr(j?.employer || j?.company)}`;
                return j?.jobTitle && !existingJobs.has(key);
            })
            .map((j, idx) => ({ id: `new_job_${idx}`, label: j.jobTitle, sub: j.employer || j.company || '', raw: j }));

        // 4. Projects
        const existingProjectTitles = new Set((profile.projects || []).map(p => normStr(p?.title || p?.name)));
        const newProjects = (resumeData.projects || [])
            .filter(p => {
                const title = normStr(p?.title || p?.name);
                return title && !existingProjectTitles.has(title);
            })
            .map((p, idx) => ({ id: `new_proj_${idx}`, label: p.title || p.name, sub: p.link || '', raw: p }));

        // 5. Achievements
        const existingAchievements = new Set((profile.achievements || []).map(a => normStr(a?.title || a?.name)));
        const newAchievements = (resumeData.achievements || [])
            .filter(a => {
                const title = normStr(a?.title || a?.name);
                return title && !existingAchievements.has(title);
            })
            .map((a, idx) => ({ id: `new_ach_${idx}`, label: a.title || a.name, sub: a.issuer || '', raw: a }));

        // 6. Education
        const existingEdu = new Set((profile.education || []).map(e => `${normStr(e?.degree)}|${normStr(e?.school)}`));
        const newEdu = (resumeData.educations || [])
            .filter(e => {
                const key = `${normStr(e?.degree)}|${normStr(e?.school)}`;
                return e?.degree && !existingEdu.has(key);
            })
            .map((e, idx) => ({ id: `new_edu_${idx}`, label: e.degree, sub: e.school || '', raw: e }));

        const items = {
            skills: newSkills,
            certifications: newCerts,
            workExperiences: newJobs,
            projects: newProjects,
            achievements: newAchievements,
            education: newEdu,
        };

        const totalNew = Object.values(items).reduce((sum, list) => sum + list.length, 0);
        return { totalNew, items };
    }, [profile, resumeData]);

    // Pre-select all push diffs by default
    useEffect(() => {
        if (pushDiffs.items) {
            const initial = {};
            Object.entries(pushDiffs.items).forEach(([category, list]) => {
                list.forEach(item => {
                    initial[`${category}:${item.id}`] = true;
                });
            });
            setSelectedPushItems(initial);
        }
    }, [pushDiffs]);

    const togglePushItem = (category, id) => {
        const key = `${category}:${id}`;
        setSelectedPushItems(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Push Handler: append selected items to Master Profile
    const handlePushToProfile = async () => {
        if (!profile || !userId) return;
        setSaving(true);
        setStatusMessage(null);

        try {
            const updated = { ...profile };

            // Append selected skills
            const skillsToAppend = (pushDiffs.items.skills || [])
                .filter(i => selectedPushItems[`skills:${i.id}`])
                .map(i => ({ name: i.label, level: i.level || 'Advanced' }));
            if (skillsToAppend.length) {
                updated.skills = [...(updated.skills || []), ...skillsToAppend];
            }

            // Append selected certs
            const certsToAppend = (pushDiffs.items.certifications || [])
                .filter(i => selectedPushItems[`certifications:${i.id}`])
                .map(i => ({
                    id: `cert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    title: i.raw.title || i.raw.name,
                    issuer: i.raw.issuer || i.raw.organization || '',
                    date: i.raw.date || '',
                    url: i.raw.url || i.raw.link || '',
                }));
            if (certsToAppend.length) {
                updated.certifications = [...(updated.certifications || []), ...certsToAppend];
            }

            // Append selected jobs
            const jobsToAppend = (pushDiffs.items.workExperiences || [])
                .filter(i => selectedPushItems[`workExperiences:${i.id}`])
                .map(i => ({
                    id: `work_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    jobTitle: i.raw.jobTitle || '',
                    company: i.raw.employer || i.raw.company || '',
                    city: i.raw.city || '',
                    startDate: i.raw.begin || i.raw.startDate || '',
                    endDate: i.raw.end || i.raw.endDate || '',
                    description: i.raw.description || '',
                }));
            if (jobsToAppend.length) {
                updated.workExperiences = [...(updated.workExperiences || []), ...jobsToAppend];
            }

            // Append selected projects
            const projsToAppend = (pushDiffs.items.projects || [])
                .filter(i => selectedPushItems[`projects:${i.id}`])
                .map(i => ({
                    id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    title: i.raw.title || i.raw.name || '',
                    link: i.raw.link || i.raw.url || '',
                    description: i.raw.description || '',
                }));
            if (projsToAppend.length) {
                updated.projects = [...(updated.projects || []), ...projsToAppend];
            }

            // Append selected achievements
            const achToAppend = (pushDiffs.items.achievements || [])
                .filter(i => selectedPushItems[`achievements:${i.id}`])
                .map(i => ({
                    id: `ach_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    title: i.raw.title || i.raw.name || '',
                    issuer: i.raw.issuer || '',
                    date: i.raw.date || '',
                    description: i.raw.description || '',
                }));
            if (achToAppend.length) {
                updated.achievements = [...(updated.achievements || []), ...achToAppend];
            }

            // Append selected education
            const eduToAppend = (pushDiffs.items.education || [])
                .filter(i => selectedPushItems[`education:${i.id}`])
                .map(i => ({
                    id: `edu_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    degree: i.raw.degree || '',
                    school: i.raw.school || '',
                    city: i.raw.city || '',
                    startDate: i.raw.started || i.raw.startDate || '',
                    endDate: i.raw.finished || i.raw.endDate || '',
                    description: i.raw.description || '',
                }));
            if (eduToAppend.length) {
                updated.education = [...(updated.education || []), ...eduToAppend];
            }

            const totalAdded = skillsToAppend.length + certsToAppend.length + jobsToAppend.length + projsToAppend.length + achToAppend.length + eduToAppend.length;
            if (totalAdded === 0) {
                setStatusMessage({ type: 'info', text: 'No new items selected to sync.' });
                setSaving(false);
                return;
            }

            const saved = await saveProfile(userId, updated, profile.revision || 0);
            setProfile(prev => ({ ...prev, revision: saved.revision || prev.revision + 1 }));
            setStatusMessage({ type: 'success', text: `✓ Successfully saved ${totalAdded} new items to Master Profile!` });
            if (onShowToast) onShowToast('Success');
            setTimeout(() => {
                onClose();
            }, 1200);
        } catch (err) {
            console.error('[SyncProfileModal] Push failed:', err);
            setStatusMessage({ type: 'error', text: err.message || 'Failed to update Master Profile.' });
        } finally {
            setSaving(false);
        }
    };

    // Pull Handler: selectively pull data from Master Profile into this resume
    const handlePullFromProfile = () => {
        if (!profile || !onApplyProfileToResume) return;

        const updates = {};
        if (selectedPullSections.contact) {
            updates.firstname = profile.firstname;
            updates.lastname = profile.lastname;
            updates.email = profile.email;
            updates.phone = profile.phone;
            updates.city = profile.city;
            updates.country = profile.country;
            updates.address = profile.address;
            updates.postalcode = profile.postalCode;
            updates.occupation = profile.occupation;
            updates.linkedin = profile.linkedinUrl;
            updates.github = profile.githubUrl;
            updates.website = profile.websiteUrl;
            if (profile.selectedImage) updates.photo = profile.selectedImage;
        }

        if (selectedPullSections.summary && profile.summary) {
            updates.summary = profile.summary;
        }

        if (selectedPullSections.skills && profile.skills?.length) {
            // Merge skills without duplicates
            const currentSkillNames = new Set((resumeData.skills || []).map(s => String(s?.skillName || s?.name || '').trim().toLowerCase()));
            const incoming = profile.skills
                .filter(s => {
                    const name = String(typeof s === 'string' ? s : s?.name || '').trim().toLowerCase();
                    return name && !currentSkillNames.has(name);
                })
                .map((s, idx) => ({
                    id: `pulled_skill_${Date.now()}_${idx}`,
                    skillName: typeof s === 'string' ? s : s?.name || '',
                    rating: 75,
                }));
            if (incoming.length) updates.skills = [...(resumeData.skills || []), ...incoming];
        }

        if (selectedPullSections.certifications && profile.certifications?.length) {
            const currentCerts = new Set((resumeData.certifications || []).map(c => String(c?.title || '').trim().toLowerCase()));
            const incoming = profile.certifications
                .filter(c => {
                    const title = String(c?.title || '').trim().toLowerCase();
                    return title && !currentCerts.has(title);
                })
                .map((c, idx) => ({
                    id: `pulled_cert_${Date.now()}_${idx}`,
                    title: c.title || '',
                    issuer: c.issuer || '',
                    date: c.date || '',
                    url: c.url || c.link || '',
                }));
            if (incoming.length) updates.certifications = [...(resumeData.certifications || []), ...incoming];
        }

        if (selectedPullSections.hobbies && profile.hobbies?.length) {
            updates.hobbies = [...new Set([...(resumeData.hobbies || []), ...(profile.hobbies || [])])];
        }

        onApplyProfileToResume(updates);
        setStatusMessage({ type: 'success', text: '✓ Master Profile sections applied to this resume!' });
        if (onShowToast) onShowToast('Success');
        setTimeout(() => {
            onClose();
        }, 1200);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Master Profile Sync Hub</h2>
                            <p className="text-[11px] text-slate-500">Harmonize data between this Resume and your Master Profile</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Tab Switcher */}
                <div className="px-6 pt-3 pb-2 border-b border-slate-100 flex gap-2">
                    <button
                        onClick={() => setMode('push')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            mode === 'push'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <span>Push New Items to Master Profile</span>
                        {pushDiffs.totalNew > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${mode === 'push' ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'}`}>
                                {pushDiffs.totalNew} new
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setMode('pull')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            mode === 'pull'
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <span>Import from Master Profile</span>
                    </button>
                </div>

                {/* Status Message */}
                {statusMessage && (
                    <div className={`mx-6 mt-3 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                        statusMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                        statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                        <span>{statusMessage.text}</span>
                    </div>
                )}

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center space-y-3">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs text-slate-500 font-semibold">Comparing Resume with Master Profile...</p>
                        </div>
                    ) : mode === 'push' ? (
                        /* PUSH VIEW: Resume -> Master Profile */
                        <div>
                            {pushDiffs.totalNew === 0 ? (
                                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
                                    <span className="text-2xl">✓</span>
                                    <p className="text-xs font-bold text-slate-800">Everything is already in sync!</p>
                                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                                        All work experiences, education, skills, certifications, and achievements in this resume are already safely recorded in your Master Profile.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        The following <strong>{pushDiffs.totalNew} item(s)</strong> were added or tailored in this resume and are missing from your permanent Master Profile. Select the ones you want to save to your lifelong archive:
                                    </p>

                                    {Object.entries(pushDiffs.items).map(([category, list]) => {
                                        if (!list || list.length === 0) return null;
                                        const titles = {
                                            skills: 'Skills',
                                            certifications: 'Certifications',
                                            workExperiences: 'Work Experience',
                                            projects: 'Projects',
                                            achievements: 'Achievements & Awards',
                                            education: 'Education Degrees',
                                        };
                                        return (
                                            <div key={category} className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                                        {titles[category] || category} ({list.length})
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {list.map(item => {
                                                        const isChecked = Boolean(selectedPushItems[`${category}:${item.id}`]);
                                                        return (
                                                            <label
                                                                key={item.id}
                                                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                                    isChecked
                                                                        ? 'bg-white border-indigo-300 text-slate-900 shadow-2xs'
                                                                        : 'bg-slate-100/60 border-slate-200 text-slate-500 hover:bg-white'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => togglePushItem(category, item.id)}
                                                                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold truncate">{item.label}</p>
                                                                    {item.sub ? <p className="text-[10px] text-slate-400 truncate">{item.sub}</p> : null}
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* PULL VIEW: Master Profile -> Resume */
                        <div className="space-y-4">
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Select which sections of your authoritative <strong>Master Profile</strong> you wish to import or refresh inside this resume draft:
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {[
                                    { key: 'contact', title: 'Contact & Identity', desc: `${profile?.firstname || ''} ${profile?.lastname || ''} (${profile?.email || ''})` },
                                    { key: 'summary', title: 'Executive Bio / Summary', desc: profile?.summary ? `${profile.summary.slice(0, 60)}...` : 'No summary recorded' },
                                    { key: 'skills', title: 'Skills Bank', desc: `${(profile?.skills || []).length} skill(s) saved in profile` },
                                    { key: 'certifications', title: 'Certifications', desc: `${(profile?.certifications || []).length} credential(s) in profile` },
                                    { key: 'hobbies', title: 'Hobbies & Interests', desc: `${(profile?.hobbies || []).length} interest(s) in profile` },
                                ].map(({ key, title, desc }) => (
                                    <label
                                        key={key}
                                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                                            selectedPullSections[key]
                                                ? 'bg-indigo-50/50 border-indigo-300 text-slate-900 shadow-2xs'
                                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={Boolean(selectedPullSections[key])}
                                            onChange={(e) => setSelectedPullSections(prev => ({ ...prev, [key]: e.target.checked }))}
                                            className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold">{title}</p>
                                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{desc}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    {mode === 'push' ? (
                        <button
                            type="button"
                            onClick={handlePushToProfile}
                            disabled={saving || loading || pushDiffs.totalNew === 0}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            {saving ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Syncing...</span>
                                </>
                            ) : (
                                <>
                                    <span>Save Selected to Master Profile ✓</span>
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handlePullFromProfile}
                            disabled={loading}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                        >
                            Apply Selected to Resume
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
