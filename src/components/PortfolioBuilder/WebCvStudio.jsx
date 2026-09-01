import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getPortfolioById, getResumes, publishPortfolio, savePortfolioDraft, updateExistingPortfolio } from '../../services/api/platform';
import { normalizeResumeData } from '../../utils/resumeData';
import { PORTFOLIO_TEMPLATES, PORTFOLIO_TEMPLATE_IDS, buildPortfolioDocument, convertResumeToPortfolio, displayNameFromCanonical, emptyCanonicalPortfolio, extractCanonicalFromPuck, normalizePortfolioData, resolvePortfolioTemplate, sanitizeCanonicalPortfolio, switchPortfolioTemplate, themeForTemplate } from '../../utils/portfolioData';
import WebCvRenderer from '../PortfolioTemplates/WebCvRenderer';
import CreateWebCvDialog from './CreateWebCvDialog';
import Toasts from '../Toasts/Toats';

const SECTIONS = [
    { id: 'heading', label: 'Profile' },
    { id: 'summary', label: 'Summary' },
    { id: 'experiences', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
    { id: 'certifications', label: 'Certifications' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'references', label: 'References' },
    { id: 'languages', label: 'Languages' },
    { id: 'hobbies', label: 'Hobbies' },
    { id: 'customSections', label: 'Custom' },
];

function Field({ label, value, onChange, textarea, type = 'text' }) {
    const shared = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900';
    return (
        <label className="block text-xs font-medium text-slate-600">
            {label}
            {textarea ? (
                <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} rows={4} className={shared} />
            ) : (
                <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} className={shared} />
            )}
        </label>
    );
}

function ListEditor({ items, emptyItem, onChange, renderItem, addLabel }) {
    return (
        <div className="space-y-3">
            {items.map((item, index) => (
                <div key={item.id || index} className="rounded-xl border border-slate-200 p-3">
                    {renderItem(item, index, (patch) => onChange(items.map((current, currentIndex) => (currentIndex === index ? { ...current, ...patch } : current))))}
                    <button type="button" className="mt-2 text-xs text-red-600" onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}>Remove</button>
                </div>
            ))}
            <button type="button" className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600" onClick={() => onChange([...items, emptyItem(items.length)])}>{addLabel}</button>
        </div>
    );
}

export default function WebCvStudio({ initialPortfolio = null, _onExitAdvanced }) {
    const user = useContext(AuthContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [canonical, setCanonical] = useState(() => emptyCanonicalPortfolio());
    const [templateKey, setTemplateKey] = useState('modernMinimal');
    const [title, setTitle] = useState('My Web CV');
    const [section, setSection] = useState('heading');
    const [portfolioId, setPortfolioId] = useState(null);
    const [revision, setRevision] = useState(null);
    const [resumes, setResumes] = useState([]);
    const [resumesLoading, setResumesLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [toast, setToast] = useState({ show: false, type: '', message: '' });
    const [previewMode, setPreviewMode] = useState('desktop');
    const [publishedUrl, setPublishedUrl] = useState('');
    const [conflict, setConflict] = useState(false);
    const initialized = useRef(false);
    const saveTimer = useRef(null);
    const latestRef = useRef({ canonical, templateKey, title, portfolioId, revision });

    const showToast = (type, message = '') => {
        setToast({ show: true, type, message });
        setTimeout(() => setToast({ show: false, type: '', message: '' }), 3500);
    };

    const applyCanonical = useCallback((next, nextTemplate = templateKey, nextTitle) => {
        const normalized = normalizePortfolioData(next, { template: nextTemplate });
        setCanonical(normalized);
        setTemplateKey(resolvePortfolioTemplate(nextTemplate));
        if (nextTitle) setTitle(nextTitle);
        setDirty(true);
    }, [templateKey]);

    useEffect(() => {
        latestRef.current = { canonical, templateKey, title, portfolioId, revision };
    }, [canonical, templateKey, title, portfolioId, revision]);

    useEffect(() => {
        if (!user?.uid || initialized.current) return;
        initialized.current = true;
        const boot = async () => {
            const editId = searchParams.get('edit');
            const fromResume = searchParams.get('fromResume');
            const create = searchParams.get('create') === '1' || !editId;
            if (editId) {
                const portfolio = initialPortfolio || await getPortfolioById(editId);
                if (!portfolio || portfolio.userId !== user.uid) {
                    showToast('Error', 'Portfolio not found');
                    setShowCreate(true);
                    return;
                }
                const source = portfolio.draftData || portfolio.data || {};
                const extracted = source.canonical || extractCanonicalFromPuck(source);
                const next = normalizePortfolioData(extracted, { template: source.templateKey || portfolio.theme });
                setCanonical(next);
                setTemplateKey(resolvePortfolioTemplate(source.templateKey || next.template));
                setTitle(portfolio.draftTitle || portfolio.title || displayNameFromCanonical(next));
                setPortfolioId(portfolio.id);
                setRevision(Number(portfolio.revision) || 0);
                setPublishedUrl(portfolio.isPublished && portfolio.slug ? `${window.location.origin}/portfolio/${portfolio.slug}` : '');
                setDirty(false);
                setSearchParams({});
                return;
            }
            setResumesLoading(true);
            try {
                const listed = await getResumes(user.uid, 1, 80);
                const mapped = (listed.resumes || []).map((resume) => {
                    const data = normalizeResumeData(resume.item || resume);
                    return {
                        id: resume.id,
                        data,
                        item: resume.item,
                        updatedAt: resume.item?.updatedAt || resume.item?.created_at || null,
                    };
                });
                setResumes(mapped);
                if (fromResume) {
                    const match = mapped.find((item) => item.id === fromResume);
                    if (match) {
                        const converted = convertResumeToPortfolio(match.data, { resumeId: match.id });
                        applyCanonical(converted, 'modernMinimal', displayNameFromCanonical(converted));
                        setShowCreate(false);
                        setSearchParams({});
                        return;
                    }
                }
                setShowCreate(create);
            } catch (error) {
                showToast('Error', error.message || 'Unable to load resumes');
                setShowCreate(true);
            } finally {
                setResumesLoading(false);
            }
        };
        boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    useEffect(() => {
        const warn = (event) => {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const persistDraft = useCallback(async () => {
        if (!user?.uid) return;
        const snapshot = latestRef.current;
        setSaving(true);
        try {
            const document = buildPortfolioDocument({
                canonical: snapshot.canonical,
                template: snapshot.templateKey,
                title: snapshot.title,
            });
            const result = await savePortfolioDraft(user.uid, document, snapshot.portfolioId, themeForTemplate(snapshot.templateKey), snapshot.revision);
            latestRef.current = { ...snapshot, portfolioId: result.id, revision: result.revision };
            setPortfolioId(result.id);
            setRevision(result.revision);
            setDirty(false);
            setConflict(false);
            return result;
        } catch (error) {
            if (error.code === 'PORTFOLIO_CONFLICT') setConflict(true);
            showToast('Error', error.message || 'Unable to save draft');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (!dirty || !user?.uid) return undefined;
        saveTimer.current = setTimeout(() => {
            persistDraft().catch(() => {});
        }, 2500);
        return () => clearTimeout(saveTimer.current);
    }, [canonical, templateKey, title, dirty, persistDraft, user?.uid]);

    const handleUseResume = (resume) => {
        const converted = convertResumeToPortfolio(resume.data || resume.item || resume, { resumeId: resume.id, template: templateKey });
        applyCanonical(converted, templateKey, displayNameFromCanonical(converted));
        setShowCreate(false);
        setPublishedUrl('');
        setPortfolioId(null);
        setRevision(null);
    };

    const handleStartBlank = () => {
        const blank = emptyCanonicalPortfolio({ template: templateKey });
        applyCanonical(blank, templateKey, 'My Web CV');
        setShowCreate(false);
        setPublishedUrl('');
        setPortfolioId(null);
        setRevision(null);
    };

    const handleSwitchTemplate = (nextTemplate) => {
        applyCanonical(switchPortfolioTemplate(canonical, nextTemplate), nextTemplate, title);
    };

    const handlePublish = async () => {
        if (!user?.uid) return;
        setPublishing(true);
        try {
            await persistDraft();
            const snapshot = latestRef.current;
            const document = buildPortfolioDocument({
                canonical: snapshot.canonical,
                template: snapshot.templateKey,
                title: snapshot.title,
            });
            const result = snapshot.portfolioId
                ? await updateExistingPortfolio(snapshot.portfolioId, user.uid, document, themeForTemplate(snapshot.templateKey), snapshot.revision)
                : await publishPortfolio(user.uid, document, themeForTemplate(snapshot.templateKey));
            setPortfolioId(result.id);
            setRevision(result.revision);
            const url = `${window.location.origin}/portfolio/${result.slug}`;
            setPublishedUrl(url);
            setDirty(false);
            // Publication and its email event commit atomically on the server.
            showToast('Success', 'Published');
        } catch (error) {
            if (error.code === 'PORTFOLIO_CONFLICT') setConflict(true);
            showToast('Error', error.message || 'Unable to publish');
        } finally {
            setPublishing(false);
        }
    };

    const previewWidth = previewMode === 'mobile' ? 390 : previewMode === 'tablet' ? 768 : 1180;
    const heading = canonical.heading;

    const editor = useMemo(() => {
        if (section === 'heading') {
            return (
                <div className="grid gap-3">
                    <Field label="First name" value={heading.firstname} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, firstname: value, fullName: [value, heading.lastname].filter(Boolean).join(' ') } })} />
                    <Field label="Last name" value={heading.lastname} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, lastname: value, fullName: [heading.firstname, value].filter(Boolean).join(' ') } })} />
                    <Field label="Occupation" value={heading.occupation} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, occupation: value } })} />
                    <Field label="Email" value={heading.email} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, email: value } })} />
                    <Field label="Phone" value={heading.phone} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, phone: value } })} />
                    <Field label="City" value={heading.city} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, city: value } })} />
                    <Field label="Country" value={heading.country} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, country: value } })} />
                    <Field label="Address" value={heading.address} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, address: value } })} />
                    <Field label="Postal code" value={heading.postalcode} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, postalcode: value } })} />
                    <Field label="Website" value={heading.website} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, website: value } })} />
                    <Field label="LinkedIn" value={heading.linkedin} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, linkedin: value } })} />
                    <Field label="GitHub" value={heading.github} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, github: value } })} />
                    <Field label="Photo URL" value={heading.photo} onChange={(value) => applyCanonical({ ...canonical, heading: { ...heading, photo: value } })} />
                </div>
            );
        }
        if (section === 'summary') {
            return <Field label="Professional summary" textarea value={canonical.summary} onChange={(value) => applyCanonical({ ...canonical, summary: value })} />;
        }
        if (section === 'experiences') {
            return (
                <ListEditor
                    items={canonical.experiences}
                    addLabel="Add experience"
                    emptyItem={(index) => ({ id: `experience-${Date.now()}`, jobTitle: '', employer: '', begin: '', end: '', description: '', date: index + 1 })}
                    onChange={(items) => applyCanonical({ ...canonical, experiences: items })}
                    renderItem={(item, index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Job title" value={item.jobTitle} onChange={(value) => patch({ jobTitle: value })} />
                            <Field label="Employer" value={item.employer} onChange={(value) => patch({ employer: value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Start" value={item.begin} onChange={(value) => patch({ begin: value })} />
                                <Field label="End" value={item.end} onChange={(value) => patch({ end: value })} />
                            </div>
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'education') {
            return (
                <ListEditor
                    items={canonical.education}
                    addLabel="Add education"
                    emptyItem={(index) => ({ id: `education-${Date.now()}`, school: '', degree: '', started: '', finished: '', description: '', date: index + 1 })}
                    onChange={(items) => applyCanonical({ ...canonical, education: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="School" value={item.school} onChange={(value) => patch({ school: value })} />
                            <Field label="Degree" value={item.degree} onChange={(value) => patch({ degree: value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Started" value={item.started} onChange={(value) => patch({ started: value })} />
                                <Field label="Finished" value={item.finished} onChange={(value) => patch({ finished: value })} />
                            </div>
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'skills') {
            return (
                <ListEditor
                    items={canonical.skills}
                    addLabel="Add skill"
                    emptyItem={() => ({ id: `skill-${Date.now()}`, name: '', skillName: '', rating: 70, category: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, skills: items.map((item) => ({ ...item, skillName: item.name })) })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Skill" value={item.name} onChange={(value) => patch({ name: value, skillName: value })} />
                            <Field label="Rating" type="number" value={item.rating} onChange={(value) => patch({ rating: Number(value) || 0 })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'projects') {
            return (
                <ListEditor
                    items={canonical.projects}
                    addLabel="Add project"
                    emptyItem={() => ({ id: `project-${Date.now()}`, title: '', description: '', link: '', technologies: '', technologyList: [], image: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, projects: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                            <Field label="Link" value={item.link} onChange={(value) => patch({ link: value })} />
                            <Field label="Technologies" value={item.technologies} onChange={(value) => patch({ technologies: value, technologyList: value.split(',').map((part) => part.trim()).filter(Boolean) })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'certifications') {
            return (
                <ListEditor
                    items={canonical.certifications}
                    addLabel="Add certification"
                    emptyItem={() => ({ id: `certification-${Date.now()}`, title: '', issuer: '', date: '', description: '', link: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, certifications: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Issuer" value={item.issuer} onChange={(value) => patch({ issuer: value })} />
                            <Field label="Date" value={item.date} onChange={(value) => patch({ date: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                            <Field label="Link" value={item.link} onChange={(value) => patch({ link: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'achievements') {
            return (
                <ListEditor
                    items={canonical.achievements}
                    addLabel="Add achievement"
                    emptyItem={() => ({ id: `achievement-${Date.now()}`, title: '', description: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, achievements: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Title" value={item.title} onChange={(value) => patch({ title: value })} />
                            <Field label="Description" textarea value={item.description} onChange={(value) => patch({ description: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'references') {
            return (
                <ListEditor
                    items={canonical.references}
                    addLabel="Add reference"
                    emptyItem={() => ({ id: `reference-${Date.now()}`, name: '', reference: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, references: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Name" value={item.name} onChange={(value) => patch({ name: value })} />
                            <Field label="Reference" textarea value={item.reference} onChange={(value) => patch({ reference: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'languages') {
            return (
                <ListEditor
                    items={canonical.languages}
                    addLabel="Add language"
                    emptyItem={() => ({ id: `language-${Date.now()}`, name: '', level: '' })}
                    onChange={(items) => applyCanonical({ ...canonical, languages: items })}
                    renderItem={(item, _index, patch) => (
                        <div className="grid gap-2">
                            <Field label="Language" value={item.name} onChange={(value) => patch({ name: value })} />
                            <Field label="Level" value={item.level} onChange={(value) => patch({ level: value })} />
                        </div>
                    )}
                />
            );
        }
        if (section === 'hobbies') {
            return <Field label="Hobbies (comma separated)" value={canonical.hobbies.join(', ')} onChange={(value) => applyCanonical({ ...canonical, hobbies: value.split(',').map((item) => item.trim()).filter(Boolean) })} />;
        }
        return (
            <ListEditor
                items={canonical.customSections}
                addLabel="Add custom section"
                emptyItem={() => ({ id: `custom-${Date.now()}`, title: '', items: [], content: '' })}
                onChange={(items) => applyCanonical({ ...canonical, customSections: items })}
                renderItem={(item, _index, patch) => (
                    <div className="grid gap-2">
                        <Field label="Section title" value={item.title} onChange={(value) => patch({ title: value })} />
                        <Field
                            label="Items (one per line as Title — Description)"
                            textarea
                            value={(item.items || []).map((entry) => [entry.title, entry.description].filter(Boolean).join(' — ')).join('\n')}
                            onChange={(value) => patch({
                                items: value.split('\n').map((line, lineIndex) => {
                                    const [entryTitle, ...rest] = line.split('—');
                                    return { id: `${item.id}-item-${lineIndex}`, title: (entryTitle || '').trim(), description: rest.join('—').trim() };
                                }).filter((entry) => entry.title || entry.description),
                            })}
                        />
                    </div>
                )}
            />
        );
    }, [applyCanonical, canonical, heading, section]);

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
            <CreateWebCvDialog open={showCreate} resumes={resumes} loading={resumesLoading} onUseResume={handleUseResume} onStartBlank={handleStartBlank} onCancel={() => (portfolioId ? setShowCreate(false) : navigate('/dashboard/portfolios'))} />
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => navigate('/dashboard/portfolios')} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Dashboard</button>
                        <input aria-label="Portfolio title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} className="rounded-md border border-transparent px-2 py-1 text-sm font-semibold hover:border-slate-300 focus:border-slate-900 focus:outline-none" />
                        <span className="text-xs text-slate-500">{saving ? 'Saving…' : dirty ? 'Unsaved draft' : 'Draft saved'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => persistDraft()} disabled={saving} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Save</button>
                        <button type="button" onClick={handlePublish} disabled={publishing} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">{publishing ? 'Publishing…' : 'Publish'}</button>
                        {publishedUrl ? <a href={publishedUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Public URL</a> : null}
                    </div>
                </div>
            </header>

            {conflict ? <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900">This portfolio changed in another tab. Reload before saving to avoid overwriting newer work.</div> : null}

            <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
                <aside className="space-y-4">
                    <section className="rounded-2xl bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-semibold">Design</h2>
                        <div className="mt-3 grid gap-2">
                            {PORTFOLIO_TEMPLATE_IDS.map((id) => {
                                const meta = PORTFOLIO_TEMPLATES[id];
                                return (
                                    <button key={id} type="button" onClick={() => handleSwitchTemplate(id)} className={`rounded-xl border px-3 py-3 text-left ${templateKey === id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                                        <p className="text-sm font-medium">{meta.name}</p>
                                        <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                    <section className="rounded-2xl bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-semibold">Content</h2>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            {SECTIONS.map((item) => (
                                <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`rounded-lg px-2 py-2 text-left text-xs ${section === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{item.label}</button>
                            ))}
                        </div>
                    </section>
                </aside>

                <section className="overflow-hidden rounded-2xl bg-slate-200 p-3">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Live preview</p>
                        <div className="flex gap-1">
                            {['desktop', 'tablet', 'mobile'].map((mode) => (
                                <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={`rounded-md px-2 py-1 text-xs capitalize ${previewMode === mode ? 'bg-white text-slate-900' : 'text-slate-500'}`}>{mode}</button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" tabIndex={0} role="region" aria-label="Portfolio preview (scrollable)">
                        <div className="mx-auto overflow-hidden rounded-xl bg-white shadow-lg" style={{ width: Math.min(previewWidth, 1180) }}>
                            <WebCvRenderer canonical={sanitizeCanonicalPortfolio(canonical, { template: templateKey })} templateKey={templateKey} />
                        </div>
                    </div>
                </section>

                <aside className="rounded-2xl bg-white p-4 shadow-sm">
                    <h2 className="text-sm font-semibold">{SECTIONS.find((item) => item.id === section)?.label}</h2>
                    <p className="mt-1 text-xs text-slate-500">Edits stay on this Web CV. The original resume is never modified.</p>
                    <div className="mt-4 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">{editor}</div>
                </aside>
            </div>
            {toast.show ? <Toasts type={toast.type} message={toast.message} /> : null}
        </div>
    );
}
