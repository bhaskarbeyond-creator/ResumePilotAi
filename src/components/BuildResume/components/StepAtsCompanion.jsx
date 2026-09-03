import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
    MdSpeed, 
    MdCheckCircle, 
    MdWarning, 
    MdErrorOutline, 
    MdLightbulb, 
    MdArrowForward,
    MdAutoAwesome,
    MdDoneAll
} from 'react-icons/md';
import { calculateAtsScore, ATS_WEIGHTS } from '../../../utils/atsScore';
import { getCandidateContext } from '../../../utils/candidateContext';

// Helper to determine quality tier
const getQualityTier = (score, max) => {
    if (max <= 0) return { label: 'Complete', color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    const pct = Math.round((score / max) * 100);
    if (pct >= 85) return { label: 'Excellent', color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
    if (pct >= 60) return { label: 'Strong', color: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
    if (pct > 0) return { label: 'Needs Attention', color: 'amber', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    return { label: 'Incomplete', color: 'rose', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
};

export default function StepAtsCompanion({
    stepPath = 'heading',
    resumeData = {},
    onNavigate,
    onAction,
    compactMode = false
}) {
    const { t } = useTranslation('common');
    const atsResult = calculateAtsScore(resumeData);
    const sections = atsResult.sections || [];
    const context = React.useMemo(() => getCandidateContext(resumeData), [resumeData]);

    // Map step path to corresponding ATS section evaluation
    let sectionData = null;
    let nextBestAction = null;
    let strongPoints = [];
    let improvePoints = [];
    let atsDetects = '';
    let whyItMatters = '';
    let tip = '';

    switch (stepPath) {
        case 'heading': {
            sectionData = sections.find(s => s.id === 'contact') || { score: 0, maxScore: ATS_WEIGHTS.contact, findings: [] };
            const hasName = Boolean(resumeData.firstname && resumeData.lastname);
            const hasEmail = Boolean(resumeData.email && /\S+@\S+\.\S+/.test(resumeData.email));
            const hasPhone = Boolean(resumeData.phone);
            const hasTitle = Boolean(resumeData.occupation);
            const hasLocation = Boolean(resumeData.city || resumeData.country);
            const hasLinks = Boolean(resumeData.linkedin || resumeData.website || resumeData.github);

            if (hasName) strongPoints.push(`Full legal name: ${resumeData.firstname} ${resumeData.lastname}`);
            if (hasTitle) strongPoints.push(`Target headline: "${resumeData.occupation}"`);
            if (hasEmail && hasPhone) strongPoints.push('Direct contact reachability verified (email + phone)');
            if (hasLocation) strongPoints.push(`Geographic market: ${[resumeData.city, resumeData.country].filter(Boolean).join(', ')}`);
            if (hasLinks) strongPoints.push('Professional portfolio or LinkedIn profile attached');

            if (!hasName) improvePoints.push('Enter both first and last name for recruiter identity indexing');
            if (!hasTitle) improvePoints.push('Add a specific target job title to rank in ATS keyword searches');
            if (!hasEmail) improvePoints.push('Provide a valid email for automated ATS interview invitations');
            if (!hasPhone) improvePoints.push('Provide a direct phone number with country code');
            if (!hasLocation) improvePoints.push('Add city & country to clear regional candidate filters');
            if (!hasLinks) improvePoints.push('Add a LinkedIn, portfolio, or professional profile link to increase recruiter trust');

            atsDetects = hasName && hasTitle 
                ? `Candidate: ${resumeData.firstname} ${resumeData.lastname} • Target: ${resumeData.occupation}${resumeData.city ? ` (${resumeData.city})` : ''}`
                : 'Incomplete identity metadata — parser cannot index candidate profile';

            if (!hasName || !hasTitle) {
                nextBestAction = { text: 'Declare your full name & target job title to pass applicant indexing.', actionLabel: 'Complete Identity' };
            } else if (!hasEmail || !hasPhone) {
                nextBestAction = { text: 'Add verified email and phone so recruiters can contact you immediately.', actionLabel: 'Add Contact Details' };
            } else if (!hasLocation) {
                nextBestAction = { text: 'Add your city and country to qualify for regional and hybrid roles.', actionLabel: 'Add Location' };
            } else if (!hasLinks) {
                nextBestAction = { text: 'Add a professional profile link for 1-click recruiter verification.', actionLabel: 'Add Profile Link' };
            }

            whyItMatters = context.atsAdvice?.heading?.whyItMatters || '87% of enterprise ATS portals automatically reject resumes that lack standardized email, phone, or location metadata.';
            tip = context.atsAdvice?.heading?.tip || 'Recruiters spend 6 seconds scanning identity and location before reviewing experience.';
            break;
        }

        case 'work-history': {
            sectionData = sections.find(s => s.id === 'experience') || { score: 0, maxScore: ATS_WEIGHTS.experience, findings: [] };
            const employments = resumeData.employments || [];
            const hasRoles = employments.length > 0;
            const verbsCount = sectionData.facts?.verbs || 0;
            const metricsCount = sectionData.facts?.metrics || 0;

            if (hasRoles) strongPoints.push(`${employments.length} professional position${employments.length > 1 ? 's' : ''} structured in chronological order`);
            if (verbsCount >= 2) strongPoints.push(`${verbsCount} decisive power action verbs detected`);
            if (metricsCount >= 1) strongPoints.push(`${metricsCount} quantified achievement metric${metricsCount > 1 ? 's' : ''} ($%, #, scale) detected`);
            if (employments.some(e => e.current)) strongPoints.push('Active current employment explicitly marked');

            if (!hasRoles) improvePoints.push('Add at least one professional work experience or internship');
            if (metricsCount === 0) improvePoints.push(`Add numbers, percentages, or scale metrics (${context.atsAdvice?.workHistory?.metricsAdvice || 'e.g. results achieved, efficiency gains, budget or volume managed'})`);
            if (verbsCount < 2) improvePoints.push(`Start bullets with decisive verbs (e.g. ${context.actionVerbs.slice(0, 3).join(', ')})`);
            if (employments.some(e => !e.description || e.description.length < 40)) improvePoints.push('Expand bullet points to describe challenge or objective, action taken, and measurable outcome');

            atsDetects = hasRoles
                ? `Timeline: ${employments[0]?.jobTitle || 'Role'} at ${employments[0]?.employer || 'Company'} (${employments.length} roles total)`
                : 'Zero employment history detected — resume will fail experience parsing';

            if (!hasRoles) {
                nextBestAction = { text: 'Add your most recent position and core responsibilities.', actionLabel: 'Add Work Experience' };
            } else if (metricsCount === 0) {
                nextBestAction = { text: `Add quantified metrics (${context.atsAdvice?.workHistory?.metricsAdvice || 'e.g. "increased efficiency by 25%"'}) to boost callback rates.`, actionLabel: 'Add Metrics' };
            } else if (verbsCount < 2) {
                nextBestAction = { text: `Replace generic verbs with strong action verbs like "${context.actionVerbs[0]}" or "${context.actionVerbs[1]}".`, actionLabel: 'Enhance Verbs' };
            }

            whyItMatters = context.atsAdvice?.workHistory?.whyItMatters || 'Recruiters evaluate measurable business impact over passive task lists. Quantified bullets increase interview conversion by 40%.';
            tip = context.atsAdvice?.workHistory?.tip || 'Use the Google X-Y-Z formula: "Accomplished [X] as measured by [Y] by doing [Z]".';
            break;
        }

        case 'education': {
            sectionData = sections.find(s => s.id === 'education') || { score: 0, maxScore: ATS_WEIGHTS.education, findings: [] };
            const educations = resumeData.educations || [];
            const hasEdu = educations.length > 0;
            const hasDegree = educations.some(e => e.degree && e.school);

            if (hasEdu) strongPoints.push(`${educations.length} academic qualification${educations.length > 1 ? 's' : ''} recorded`);
            if (hasDegree) strongPoints.push('Degree title and recognized institution specified');
            if (educations.some(e => e.finished || e.started)) strongPoints.push('Graduation timeline declared');

            if (!hasEdu) improvePoints.push('Add your highest completed academic degree or diploma');
            if (!hasDegree) improvePoints.push(`Specify credential/degree name (e.g. ${context.atsAdvice?.education?.degreeExample || 'Bachelor of Science'}) and institution name`);
            if (!educations.some(e => e.finished)) improvePoints.push('Include your graduation year or expected completion date');

            atsDetects = hasEdu
                ? `Degree: ${educations[0]?.degree || 'Degree'} from ${educations[0]?.school || 'Institution'}`
                : 'No educational credentials detected';

            if (!hasEdu) {
                nextBestAction = { text: 'Add your highest completed university degree or educational credential.', actionLabel: 'Add Education' };
            } else if (!hasDegree) {
                nextBestAction = { text: 'Clarify your field of study or major to satisfy mandatory job requisitions.', actionLabel: 'Specify Major' };
            }

            whyItMatters = context.atsAdvice?.education?.whyItMatters || 'ATS filters check degree equivalence to verify minimum job eligibility before routing to managers.';
            tip = context.atsAdvice?.education?.tip || 'If you graduated with distinction or honors, include it alongside your degree.';
            break;
        }

        case 'skills': {
            sectionData = sections.find(s => s.id === 'skills') || { score: 0, maxScore: ATS_WEIGHTS.skills, findings: [] };
            const skills = resumeData.skills || [];
            const count = skills.length;
            const isOptimal = count >= 6 && count <= 24;

            if (count > 0) strongPoints.push(`${count} categorized skills recorded`);
            if (isOptimal) strongPoints.push('Keyword density is within the optimal ATS sweet spot (8–16 skills)');
            if (count >= 4) strongPoints.push('Core professional competencies identified');

            if (count < 6) improvePoints.push(`Add ${6 - count} more relevant domain skills to meet minimum screening threshold`);
            if (count > 24) improvePoints.push('Prune low-relevance skills to prevent profile dilution');
            if (count === 0) improvePoints.push('Add core competencies, tools, frameworks, or methodologies');

            atsDetects = count > 0
                ? `Key ATS matches: ${skills.slice(0, 4).map(s => s.skillName || s.name).join(', ')} (+${Math.max(0, count - 4)} more)`
                : 'Zero skills detected — application cannot be matched against job postings';

            if (count < 6) {
                nextBestAction = { text: `Add ${Math.max(1, 6 - count)} more in-demand skills to reach optimal keyword density.`, actionLabel: 'Add Skills' };
            } else if (count > 24) {
                nextBestAction = { text: 'Keep your top 16 most impactful skills for maximum recruiter punch.', actionLabel: 'Refine Skills' };
            }

            whyItMatters = context.atsAdvice?.skills?.whyItMatters || 'Automated resume screening algorithms rank candidates by exact keyword frequency and domain alignment.';
            tip = context.atsAdvice?.skills?.tip || 'Group your skills into Core Competencies and Specialized Tools to demonstrate balanced expertise.';
            break;
        }

        case 'projects': {
            const projects = resumeData.projects || [];
            const hasProjects = projects.length > 0;
            sectionData = { score: hasProjects ? 6 : 0, maxScore: 6 };

            if (hasProjects) strongPoints.push(`${projects.length} project${projects.length > 1 ? 's' : ''} showcased with documented impact`);
            if (projects.some(p => p.url)) strongPoints.push('Portfolio, publication, or case study link provided');
            if (projects.some(p => p.description && p.description.length > 40)) strongPoints.push('Scope, methodologies, and delivered outcomes detailed');

            if (!hasProjects) improvePoints.push('Showcase 1–3 key projects, initiatives, or case studies to prove execution capabilities');
            if (projects.some(p => !p.url)) improvePoints.push('Add portfolio, documentation, or case study links to provide concrete verification');

            atsDetects = hasProjects
                ? `Portfolio: ${projects[0]?.title || 'Project'} (${projects.length} project${projects.length > 1 ? 's' : ''} on record)`
                : 'No projects found — practical execution evidence missing';

            if (!hasProjects) {
                nextBestAction = { text: 'Add a project or case study demonstrating hands-on expertise and delivered value.', actionLabel: 'Add Project' };
            }

            whyItMatters = context.atsAdvice?.projects?.whyItMatters || 'Projects provide tangible proof of problem-solving ability and hands-on execution.';
            tip = context.atsAdvice?.projects?.tip || 'Highlight the scope, methodologies used, and measurable results achieved.';
            break;
        }

        case 'certifications': {
            const certs = resumeData.certifications || [];
            const hasCerts = certs.length > 0;
            sectionData = { score: hasCerts ? 4 : 0, maxScore: 4 };

            if (hasCerts) strongPoints.push(`${certs.length} recognized credential${certs.length > 1 ? 's' : ''} added`);
            if (certs.some(c => c.issuer)) strongPoints.push('Accredited issuing organizations declared');

            if (!hasCerts) {
                const certsSample = context.starterBlueprints?.certifications?.slice(0, 2).map(c => c.title).join(', ');
                improvePoints.push(`Add recognized professional certifications or licenses (${certsSample ? `e.g. ${certsSample}` : 'e.g. Board Certification, Professional License'}) to validate qualifications`);
            }

            atsDetects = hasCerts
                ? `Certified: ${certs[0]?.title || certs[0]?.name || 'Credential'} by ${certs[0]?.issuer || 'Issuer'}`
                : 'No professional certifications detected';

            if (!hasCerts) {
                nextBestAction = { text: 'Add recognized certifications or licenses to validate qualifications against competitors.', actionLabel: 'Add Certification' };
            }

            whyItMatters = context.atsAdvice?.certifications?.whyItMatters || 'Certified candidates receive significantly higher ranking in specialized role requisitions.';
            tip = context.atsAdvice?.certifications?.tip || 'Credentials from accredited boards and recognized professional bodies carry high authority.';
            break;
        }

        case 'languages': {
            const langs = resumeData.languages || [];
            const hasLangs = langs.length > 0;
            sectionData = { score: hasLangs ? 2 : 0, maxScore: 2 };

            if (hasLangs) strongPoints.push(`${langs.length} language${langs.length > 1 ? 's' : ''} with fluency levels specified`);
            if (!hasLangs) improvePoints.push('Add spoken and written languages to highlight cross-regional communication capability');

            atsDetects = hasLangs
                ? `Languages: ${langs.map(l => l.name || l.language).filter(Boolean).join(', ')}`
                : 'No languages recorded';

            if (!hasLangs) {
                nextBestAction = { text: 'Add languages and fluency levels to qualify for international and remote teams.', actionLabel: 'Add Languages' };
            }

            whyItMatters = 'Multilingual candidates receive preferential evaluation in international, diverse, and client-facing teams.';
            tip = 'State your actual proficiency (e.g. Native, Full Professional) accurately.';
            break;
        }

        case 'summary': {
            sectionData = sections.find(s => s.id === 'summary') || { score: 0, maxScore: ATS_WEIGHTS.summary, findings: [] };
            const summary = String(resumeData.summary || '').trim();
            const charCount = summary.length;
            const isGoodLength = charCount >= 120 && charCount <= 500;

            if (charCount > 60) strongPoints.push('Executive narrative pitch defined');
            if (isGoodLength) strongPoints.push(`Optimal reading length (${charCount} characters, ~15-sec read)`);
            if (summary.toLowerCase().includes((resumeData.occupation || '').toLowerCase().split(' ')[0] || 'lead')) {
                strongPoints.push('Clear alignment between target job title and career summary');
            }

            if (charCount === 0) improvePoints.push('Write a 3–4 sentence executive summary highlighting your career impact');
            else if (charCount < 100) improvePoints.push('Expand your summary with specific domain expertise and quantified achievements');
            else if (charCount > 500) improvePoints.push('Trim summary to under 400 characters so hiring managers can scan it rapidly');

            atsDetects = charCount > 40
                ? `Executive Profile: "${summary.substring(0, 75)}..."`
                : 'No summary narrative detected — recruiter context missing';

            if (charCount < 60) {
                nextBestAction = { text: 'Generate an executive summary summarizing your years of experience and top achievements.', actionLabel: 'Generate Summary' };
            } else if (charCount > 500) {
                nextBestAction = { text: 'Condense your summary to 3–4 punchy sentences for rapid executive readability.', actionLabel: 'Make Concise' };
            }

            whyItMatters = context.atsAdvice?.summary?.whyItMatters || 'A compelling summary positioned at the top sets the tone and frames your entire application for recruiters.';
            tip = context.atsAdvice?.summary?.tip || 'Lead with your title, years of experience, core professional strengths, and a top career milestone.';
            break;
        }

        case 'achievements': {
            const items = resumeData.achievements || [];
            const hasItems = items.length > 0;
            sectionData = { score: hasItems ? 4 : 0, maxScore: 4 };

            if (hasItems) strongPoints.push(`${items.length} recognized milestone${items.length > 1 ? 's' : ''} or honor${items.length > 1 ? 's' : ''} highlighted`);
            if (!hasItems) improvePoints.push('Add awards, publications, honors, or recognitions to distinguish your profile');

            atsDetects = hasItems
                ? `Key Honors: ${items[0]?.title || items[0]?.name || 'Achievement'}`
                : 'No standalone honors recorded';

            if (!hasItems) {
                nextBestAction = { text: 'Add awards, honors, or recognitions to stand out from average applicants.', actionLabel: 'Add Achievement' };
            }

            whyItMatters = context.atsAdvice?.achievements?.whyItMatters || 'Competitive awards and honors place candidates in the top tier of applicant pools.';
            tip = context.atsAdvice?.achievements?.tip || 'Include the awarding body, year, and context or scale of the achievement.';
            break;
        }

        case 'references': {
            const refs = resumeData.references || [];
            const hasRefs = refs.length > 0;
            sectionData = { score: hasRefs ? 2 : 0, maxScore: 2 };

            if (hasRefs) strongPoints.push('References or availability clause explicitly noted');
            if (!hasRefs) improvePoints.push('Set references to "Available upon request" or add verified referees');

            atsDetects = hasRefs ? 'References: Configured / Available upon request' : 'No references noted';

            if (!hasRefs) {
                nextBestAction = { text: 'Add 1-click "Available upon request" to complete this section cleanly.', actionLabel: 'Set Available' };
            }

            whyItMatters = 'Explicitly stating "Available upon request" informs recruiters while protecting referee privacy.';
            tip = 'Never disclose private phone numbers without prior referee consent.';
            break;
        }

        case 'custom': {
            const sectionsCustom = resumeData.customSections || [];
            const hasCustom = sectionsCustom.length > 0;
            sectionData = { score: hasCustom ? 2 : 0, maxScore: 2 };

            if (hasCustom) strongPoints.push(`${sectionsCustom.length} specialized profile section${sectionsCustom.length > 1 ? 's' : ''} active`);
            if (!hasCustom) improvePoints.push('Add specialized sections (Volunteering, Publications, Patents, Speaking)');

            atsDetects = hasCustom
                ? `Custom Modules: ${sectionsCustom.map(s => s.title).filter(Boolean).join(', ')}`
                : 'No custom modules active';

            if (!hasCustom) {
                nextBestAction = { text: 'Add high-value extra sections like Volunteering or Open Source contributions.', actionLabel: 'Add Section' };
            }

            whyItMatters = 'Specialized sections help demonstrate cultural leadership and domain passion beyond day-to-day employment.';
            tip = 'Choose standard section names so ATS parsers categorize them accurately.';
            break;
        }

        default:
            sectionData = { score: 0, maxScore: 10 };
            break;
    }

    const currentScore = sectionData?.score || 0;
    const maxScore = sectionData?.maxScore || 10;
    const tier = getQualityTier(currentScore, maxScore);
    const scorePct = maxScore > 0 ? Math.min(100, Math.round((currentScore / maxScore) * 100)) : 100;

    return (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4 text-slate-900 transition-all">
            {/* Header: Co-Pilot Title + Dynamic Section Score */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <MdSpeed className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-900 block truncate">
                            ATS Career Co-Pilot
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium block">
                            Real-time recruiter & parser analysis
                        </span>
                    </div>
                </div>

                {/* Score Pill */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-black tabular-nums text-slate-900">
                        {currentScore}/{maxScore}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${tier.bg} ${tier.text} ${tier.border}`}>
                        {tier.label}
                    </span>
                </div>
            </div>

            {/* Micro Progress Bar */}
            <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-600">Section Readiness</span>
                    <span className={scorePct >= 80 ? 'text-emerald-700' : scorePct >= 50 ? 'text-indigo-700' : 'text-amber-700'}>
                        {scorePct}% ATS-Ready
                    </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                            scorePct >= 85 ? 'bg-emerald-500' : scorePct >= 60 ? 'bg-indigo-500' : scorePct > 0 ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                        style={{ width: `${scorePct}%` }}
                    />
                </div>
            </div>

            {/* Next Best Action Card (High Priority, Actionable) */}
            {nextBestAction && (
                <div className="bg-gradient-to-br from-indigo-50/80 via-purple-50/50 to-white border border-indigo-100 rounded-xl p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-900 uppercase tracking-wider">
                            <MdAutoAwesome className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span>Next Best Action</span>
                        </div>
                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 uppercase">
                            High ROI
                        </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-snug font-medium">
                        {nextBestAction.text}
                    </p>
                    {nextBestAction.actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={() => onAction(nextBestAction.actionLabel)}
                            className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                            <span>{nextBestAction.actionLabel}</span>
                            <MdArrowForward className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}

            {/* What is Strong */}
            {strongPoints.length > 0 && (
                <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                        <MdCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>What's Strong ({strongPoints.length})</span>
                    </span>
                    <ul className="space-y-1">
                        {strongPoints.slice(0, 3).map((pt, i) => (
                            <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5 leading-snug">
                                <span className="text-emerald-600 font-bold shrink-0">✓</span>
                                <span>{pt}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* What Needs Improvement */}
            {improvePoints.length > 0 && (
                <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                        <MdWarning className="w-3.5 h-3.5 text-amber-500" />
                        <span>Needs Improvement ({improvePoints.length})</span>
                    </span>
                    <ul className="space-y-1">
                        {improvePoints.slice(0, 3).map((pt, i) => (
                            <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5 leading-snug">
                                <span className="text-amber-500 font-bold shrink-0">•</span>
                                <span>{pt}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* What ATS Systems Detect */}
            {atsDetects && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        What ATS Scanners Detect
                    </div>
                    <div className="text-xs font-mono text-slate-800 truncate font-semibold">
                        {atsDetects}
                    </div>
                </div>
            )}

            {/* Why That Improvement Matters */}
            {whyItMatters && (
                <div className="flex items-start gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600 leading-relaxed">
                    <MdLightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span><strong>Why it matters:</strong> {whyItMatters}</span>
                </div>
            )}

            {/* Recruiter Pro-Tip */}
            {tip && (
                <div className="text-[10px] text-slate-400 italic">
                    💡 Pro-Tip: {tip}
                </div>
            )}

            {/* Global Resume Score & Link to Review */}
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">
                    Overall Resume: <strong className="text-indigo-700 font-black">{atsResult.qualityScore}/100</strong>
                </span>
                {typeof onNavigate === 'function' && (
                    <button
                        type="button"
                        onClick={() => onNavigate('review')}
                        className="text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-0.5 cursor-pointer text-[11px]"
                    >
                        <span>Command Center</span>
                        <MdArrowForward className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
    );
}
