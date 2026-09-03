import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdAdd } from 'react-icons/md';
import StepShell from '../components/StepShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import EntryList from '../components/EntryList.jsx';
import Field from '../components/Field.jsx';
import AiPromptCard from '../components/AiPromptCard.jsx';
import { useAiAssist } from '../ai/useAiAssist.js';
import { canRunAssistOperation } from '../ai/aiContract.js';
import { duplicateResumeItem, moveResumeItem } from '../../../utils/resumeData';
import { getCandidateContext } from '../../../utils/candidateContext';
import { getDynamicPlaceholder } from '../../../utils/dynamicPlaceholders';

const CERT_TYPES = ['Certification', 'License', 'Registration', 'Training', 'Course'];

/**
 * Certifications — entry list with a structural type (Certification /
 * License / Registration / Training / Course — a distinction, not a
 * taxonomy). AI output is explicitly "credentials worth knowing" — the
 * candidate adds only credentials they actually hold.
 */
const CertificationsStep = ({ resumeData, updateResumeData, onNavigate }) => {
    const { t } = useTranslation('common');
    const [certifications, setCertifications] = useState(resumeData.certifications || []);
    const candidateContext = getCandidateContext(resumeData, resumeData.targetJobDescription || '');
    const ai = useAiAssist();

    useEffect(() => {
        if (resumeData.certifications && Array.isArray(resumeData.certifications)) {
            setCertifications(resumeData.certifications);
        }
    }, [resumeData.certifications]);

    const createNewCertification = (initialData = {}) => ({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: initialData.title || '',
        issuer: initialData.issuer || '',
        date: initialData.date || '', // BLANK by default — never fabricate a year
        certType: initialData.certType || (initialData.isLicense ? 'License' : 'Certification'),
        isLicense: Boolean(initialData.isLicense),
    });

    const addCertification = () => {
        const newCertification = createNewCertification();
        setCertifications(prev => [...prev, newCertification]);
    };

    const removeCertification = (id) => setCertifications(prev => prev.filter(cert => cert.id !== id));

    const moveCertification = (id, direction) => setCertifications(current => moveResumeItem(current, id, direction));

    const duplicateCertification = (id) => setCertifications(current => {
        const source = current.find(cert => cert.id === id);
        return duplicateResumeItem(current, id, {
            title: `${source?.title || source?.name || 'Certification'} (Copy)`,
        });
    });

    const updateCertification = (id, field, value) => {
        setCertifications(prev => prev.map(cert => (cert.id === id ? { ...cert, [field]: value } : cert)));
    };

    // Auto-save on change (500ms debounce)
    useEffect(() => {
        const timer = setTimeout(() => {
            const validCertifications = certifications.filter(cert => (cert.title || cert.name || '').trim() !== '');

            const completedSteps = [...(resumeData.completedSteps || [])];
            let updatedCompletedSteps = null;
            if (validCertifications.length > 0 && !completedSteps.includes(6)) {
                updatedCompletedSteps = [...completedSteps, 6];
            } else if (validCertifications.length === 0 && completedSteps.includes(6)) {
                updatedCompletedSteps = completedSteps.filter(step => step !== 6);
            }

            updateResumeData({
                certifications,
                ...(updatedCompletedSteps ? { completedSteps: updatedCompletedSteps } : {}),
            });
        }, 500);
        return () => clearTimeout(timer);
    }, [certifications]); // eslint-disable-line react-hooks/exhaustive-deps

    // ——— AI: exploration suggestions, explicitly not claims ———
    const aiReadiness = canRunAssistOperation('generate-certifications', { resumeData });

    const runCertIdeas = () => {
        ai.run({
            operation: 'generate-certifications',
            resumeData,
            targetJd: resumeData.targetJobDescription || '',
        });
    };

    const isCertAlreadyAdded = (title) => {
        if (!title) return false;
        const normalized = String(title).trim().toLowerCase();
        return certifications.some(c => String(c.title || c.name || '').trim().toLowerCase() === normalized);
    };

    const handleCertAccept = (selected) => {
        const additions = selected
            .map(s => ({ title: s.meta?.title || s.text.split(' — ')[0], issuer: s.meta?.issuer || '' }))
            .filter(c => c.title && !isCertAlreadyAdded(c.title));
        if (additions.length) {
            setCertifications(prev => [
                ...prev,
                ...additions.map(c => createNewCertification({
                    title: c.title,
                    issuer: c.issuer,
                    date: '', // the candidate must enter the real year
                })),
            ]);
        }
        ai.reset();
    };

    const hasCertifications = certifications.some(c => String(c?.title || '').trim() !== '');

    const renderEntryBody = (certification) => {
        const certTitle = certification.title || certification.name || '';
        return (
            <div className="space-y-4">
                <div className="max-w-xs">
                    <label htmlFor={`cert-type-${certification.id}`} className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                        Type
                    </label>
                    <select
                        id={`cert-type-${certification.id}`}
                        value={certification.certType || (certification.isLicense ? 'License' : 'Certification')}
                        onChange={(e) => {
                            const next = e.target.value;
                            updateCertification(certification.id, 'certType', next);
                            updateCertification(certification.id, 'isLicense', next === 'License');
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                    >
                        {CERT_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label={t('CertificationsStep.fields.title.label', 'Credential name')}
                        name={`certification-title-${certification.id}`}
                        placeholder={getDynamicPlaceholder('certifications', 'title', candidateContext) || 'Enter the credential exactly as shown on your certificate'}
                        value={certTitle}
                        onChange={(e) => updateCertification(certification.id, 'title', e.target.value)}
                        required
                    />
                    <Field
                        label={t('CertificationsStep.fields.issuer.label', 'Issuing organization')}
                        name={`certification-issuer-${certification.id}`}
                        placeholder={getDynamicPlaceholder('certifications', 'issuer', candidateContext) || 'Enter the organization that issued it'}
                        value={certification.issuer || ''}
                        onChange={(e) => updateCertification(certification.id, 'issuer', e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field
                        label={t('CertificationsStep.fields.date.label', 'Date earned')}
                        name={`certification-date-${certification.id}`}
                        placeholder="e.g. 2024 or Nov 2023"
                        value={certification.date || ''}
                        onChange={(e) => updateCertification(certification.id, 'date', e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <StepShell
            stepNumber={6}
            stepPath="certifications"
            title={t('CertificationsStep.title', 'Certifications & credentials')}
            subtitle={t('CertificationsStep.subtitle', 'Credentials you hold — listed exactly as shown on the certificate, license, or registration.')}
            isComplete={hasCertifications}
            statusBadge={certifications.length > 0 ? `${certifications.length} ${certifications.length === 1 ? 'credential' : 'credentials'}` : ''}
            resumeData={resumeData}
            targetJd={resumeData.targetJobDescription || ''}
        >
            <div className="space-y-3">
                {certifications.length === 0 ? (
                    <EmptyState
                        title="Add a credential you hold"
                        description="Certifications, licenses, registrations, or completed training — enter them exactly as the issuing organization printed them."
                        primaryAction={{
                            label: 'Add a credential',
                            icon: <MdAdd className="w-4 h-4" />,
                            onClick: addCertification,
                        }}
                    />
                ) : (
                    <EntryList
                        entries={certifications.map(certification => ({
                            ...certification,
                            onMoveUp: () => moveCertification(certification.id, -1),
                            onMoveDown: () => moveCertification(certification.id, 1),
                            onDuplicate: () => duplicateCertification(certification.id),
                            onDelete: () => removeCertification(certification.id),
                        }))}
                        renderEntryTitle={(certification) => ({
                            title: certification.title || certification.name || '',
                            subtitle: certification.issuer || '',
                            meta: certification.date ? `Earned ${certification.date}` : '',
                        })}
                        renderEntry={renderEntryBody}
                    />
                )}

                {certifications.length > 0 && (
                    <button
                        type="button"
                        onClick={addCertification}
                        className="w-full h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-sm font-semibold text-slate-700 hover:text-indigo-700 flex items-center justify-center gap-2 transition-colors"
                    >
                        <MdAdd className="w-4 h-4" />
                        Add another credential
                    </button>
                )}

                <AiPromptCard
                    title="Credentials worth knowing for this role"
                    buttonLabel="Suggest credentials to explore"
                    evidenceHint="Career-exploration ideas based on your profile. Only add a credential to your resume if you actually hold it."
                    status={ai.status}
                    result={ai.result}
                    error={ai.error?.message}
                    disabled={!aiReadiness.ok}
                    disabledReason={aiReadiness.reason}
                    onRun={runCertIdeas}
                    onAccept={handleCertAccept}
                    onDismiss={() => ai.reset()}
                />
            </div>
        </StepShell>
    );
};

export default CertificationsStep;
