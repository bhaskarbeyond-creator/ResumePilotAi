import React from 'react';
import { 
    MdAdd, 
    MdAutoAwesome, 
    MdWork, 
    MdSchool, 
    MdPsychology, 
    MdFolderSpecial, 
    MdVerified, 
    MdTranslate, 
    MdEmojiEvents, 
    MdPeople, 
    MdDashboardCustomize,
    MdFormatQuote,
    MdGpsFixed
} from 'react-icons/md';

/**
 * QuickAddCommandBar — Contextual, High-Affordance Action Surface
 * 
 * Provides a modern, compact command bar at the top of each step for rapid creation of 
 * clean, structured BLANK items or triggering AI draft assistance.
 * 
 * Invariant: Never populates dummy or fabricated candidate data.
 */
export default function QuickAddCommandBar({
    stepPath = 'work-history',
    onAction = () => {},
    isAiLoading = false,
    className = ''
}) {
    // Contextual Action Configurations per Step
    const getActionConfig = () => {
        switch (stepPath) {
            case 'work-history':
                return {
                    icon: MdWork,
                    label: 'Quick Add Experience',
                    actions: [
                        { id: 'add-standard', label: '+ Add Experience', primary: true },
                        { id: 'add-internship', label: '+ Internship', hint: 'Student or clinical rotation' },
                        { id: 'add-freelance', label: '+ Freelance / Consulting', hint: 'Independent client work' },
                        { id: 'add-contract', label: '+ Contract Role', hint: 'Fixed-term engagement' },
                    ],
                    aiActions: [
                        { id: 'ai-suggest-focus', label: '✨ Recommend Role Focus', hint: 'See key competencies for this track' }
                    ]
                };

            case 'education':
                return {
                    icon: MdSchool,
                    label: 'Quick Add Qualification',
                    actions: [
                        { id: 'add-degree', label: '+ Add Degree', primary: true },
                        { id: 'add-diploma', label: '+ Professional Diploma', hint: 'Postgraduate or diploma' },
                        { id: 'add-training', label: '+ Technical Training', hint: 'Vocational or bootcamp' },
                        { id: 'add-continuing-ed', label: '+ Continuing Education', hint: 'Executive or seminar series' }
                    ],
                    aiActions: []
                };

            case 'skills':
                return {
                    icon: MdPsychology,
                    label: 'Quick Add Competencies',
                    actions: [
                        { id: 'focus-input', label: '+ Add Skill', primary: true },
                        { id: 'add-category', label: '+ Add Category', hint: 'Create structured skill group' }
                    ],
                    aiActions: [
                        { id: 'ai-suggest-skills', label: '✨ AI Suggest Skills', hint: 'Generate role-aligned competencies' },
                        { id: 'ai-match-jd', label: '🎯 Match to Job Description', hint: 'Extract skills from target JD' }
                    ]
                };

            case 'projects':
                return {
                    icon: MdFolderSpecial,
                    label: 'Quick Add Project',
                    actions: [
                        { id: 'add-project', label: '+ Add Project', primary: true },
                        { id: 'add-portfolio-piece', label: '+ Case Study', hint: 'Client or portfolio showcase' }
                    ],
                    aiActions: [
                        { id: 'ai-notes-to-project', label: '✨ Turn My Notes Into Project', hint: 'Structure raw notes into bullet points' }
                    ]
                };

            case 'certifications':
                return {
                    icon: MdVerified,
                    label: 'Quick Add Credential',
                    actions: [
                        { id: 'add-cert', label: '+ Add Certification', primary: true },
                        { id: 'add-license', label: '+ Professional License', hint: 'State/national license or registration' }
                    ],
                    aiActions: [
                        { id: 'ai-find-certs', label: '✨ Find Recommended Accreditations', hint: 'Identify standard credentials for this role' }
                    ]
                };

            case 'languages':
                return {
                    icon: MdTranslate,
                    label: 'Quick Add Language & Pursuit',
                    actions: [
                        { id: 'add-lang', label: '+ Add Language', primary: true },
                        { id: 'add-hobby', label: '+ Add Activity / Pursuit', hint: 'Community work, mentorship, athletic pursuits' }
                    ],
                    aiActions: []
                };

            case 'summary':
                return {
                    icon: MdFormatQuote,
                    label: 'Summary Assistant',
                    actions: [],
                    aiActions: [
                        { id: 'ai-draft-summary', label: '✨ AI Draft from My Real Experience', primary: true, hint: 'Grounds draft strictly in your work & education' },
                        { id: 'ai-align-jd', label: '🎯 Target Role Alignment', hint: 'Align language with target job keywords' }
                    ]
                };

            case 'achievements':
                return {
                    icon: MdEmojiEvents,
                    label: 'Quick Add Distinction',
                    actions: [
                        { id: 'add-achievement', label: '+ Add Achievement', primary: true },
                        { id: 'add-award', label: '+ Add Award / Honor', hint: 'Peer or executive recognition' }
                    ],
                    aiActions: [
                        { id: 'ai-polish-achievement', label: '✨ Turn Notes Into Impact Bullet', hint: 'Elevate with action verbs and verified outcomes' }
                    ]
                };

            case 'references':
                return {
                    icon: MdPeople,
                    label: 'Reference Setup',
                    actions: [
                        { id: 'use-privacy-safe', label: '🛡️ Use "Available Upon Request"', primary: true, hint: 'Standard format preferred by 90%+ recruiters' },
                        { id: 'add-referee', label: '+ Add Named Referee', hint: 'Add specific contact details' }
                    ],
                    aiActions: []
                };

            case 'custom':
                return {
                    icon: MdDashboardCustomize,
                    label: 'Quick Add Custom Section',
                    actions: [
                        { id: 'add-publications', label: '+ Publications', hint: 'Papers, articles, or books' },
                        { id: 'add-volunteer', label: '+ Volunteering', hint: 'Non-profit or community service' },
                        { id: 'add-patents', label: '+ Patents & IP', hint: 'Filed or granted patents' },
                        { id: 'add-speaking', label: '+ Speaking Engagements', hint: 'Conferences or panels' },
                        { id: 'add-custom-blank', label: '+ Custom Blank Section', primary: true }
                    ],
                    aiActions: []
                };

            default:
                return {
                    icon: MdAdd,
                    label: 'Quick Add',
                    actions: [{ id: 'add-generic', label: '+ Add Entry', primary: true }],
                    aiActions: []
                };
        }
    };

    const config = getActionConfig();
    const HeaderIcon = config.icon;

    return (
        <div className={`bg-gradient-to-r from-slate-50 via-white to-indigo-50/20 border border-slate-200/90 rounded-xl p-2.5 sm:p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 ${className}`}>
            {/* Section Tag */}
            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs shrink-0">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <HeaderIcon className="w-3.5 h-3.5" />
                </div>
                <span className="text-slate-800">{config.label}:</span>
            </div>

            {/* Action Buttons Group */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {/* Standard / Manual Entry Actions */}
                {config.actions.map((act) => (
                    <button
                        key={act.id}
                        type="button"
                        onClick={() => onAction(act.id)}
                        title={act.hint || act.label}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                            act.primary
                                ? 'bg-slate-900 hover:bg-indigo-600 text-white shadow-xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300'
                        }`}
                    >
                        <span>{act.label}</span>
                    </button>
                ))}

                {/* AI Assistant Actions (Clean, Distinctive Violet/Indigo Theme) */}
                {config.aiActions.map((act) => (
                    <button
                        key={act.id}
                        type="button"
                        onClick={() => onAction(act.id)}
                        disabled={isAiLoading}
                        title={act.hint || act.label}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                        {isAiLoading ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                        ) : (
                            <MdAutoAwesome className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        )}
                        <span>{act.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
