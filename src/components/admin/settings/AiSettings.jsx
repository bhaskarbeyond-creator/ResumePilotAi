import React, { useState, useEffect, useRef } from 'react';
import { reauthenticateUser } from '../../../firestore/dbOperations';
import { loadAdminAiSettings, saveAdminAiSettings, testAdminAiProvider, fetchAdminAiModels, loadQuotaStats, saveQuotaLimits, resetQuota } from '../../../services/adminAiSettings';
import fire from '../../../conf/fire';
import {
    FaRobot, FaCheck, FaTimes, FaSpinner, FaKey, FaSlidersH,
    FaEye, FaEyeSlash, FaServer, FaBolt, FaGlobe, FaBrain,
    FaDesktop, FaDownload, FaChartBar, FaTrashAlt, FaSyncAlt, FaUserShield
} from 'react-icons/fa';
import { SiNvidia } from 'react-icons/si';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import { useAdminSession } from '../AdminContext';

const SUPPORTED_AI_PROVIDERS = ['gemini', 'nvidia', 'openai', 'groq', 'openrouter', 'deepseek'];
const PROVIDER_KEY_FIELDS = { gemini: 'geminiApiKey', nvidia: 'nvidiaApiKey', openai: 'openaiApiKey', groq: 'groqApiKey', openrouter: 'openrouterApiKey', deepseek: 'deepseekApiKey' };
const RECOMMENDED_NVIDIA_MODELS = [
    { id: 'meta/llama-3.2-11b-vision-instruct', name: '⚡ Meta Llama 3.2 11B Vision Instruct (~220-460ms - Default & Recommended)', badge: 'FAST' },
    { id: 'nvidia/nemotron-mini-4b-instruct', name: '⚡ NVIDIA Nemotron Mini 4B Instruct (Ultra-Reliable ~206ms)', badge: 'FAST' },
    { id: 'openai/gpt-oss-20b', name: '⚡ OpenAI GPT OSS 20B (Fast ~620ms)', badge: 'FAST' },
    { id: 'openai/gpt-oss-120b', name: '🧠 OpenAI GPT OSS 120B (Heavy 120B Reasoning - Slow 8-15s)', badge: '120B' },
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: '🧠 NVIDIA Nemotron 70B Instruct (70B Model)', badge: '70B' },
    { id: 'mistralai/mistral-large-2-instruct', name: '🧠 Mistral Large 2 Instruct (123B Model)', badge: '123B' },
];

const AiSettings = () => {
    const { isSuperAdmin } = useAdminSession();
    const { confirm, confirmationDialog } = useConfirmDialog();
    const [aiConfig, setAiConfig] = useState({
        provider: 'gemini',
        enableGemini: true,
        geminiApiKey: '',
        model: 'gemini-2.0-flash',
        enableNvidia: false,
        nvidiaApiKey: '',
        nvidiaModel: 'meta/llama-3.2-11b-vision-instruct',
        nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
        enableOpenai: false,
        openaiApiKey: '',
        openaiModel: 'gpt-4o-mini',
        openaiBaseUrl: '',
        enableGroq: false,
        groqApiKey: '',
        groqModel: 'llama-3.3-70b-versatile',
        enableOpenrouter: false,
        openrouterApiKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        enableDeepseek: false,
        deepseekApiKey: '',
        deepseekModel: 'deepseek-chat',
        enableOllama: false,
        ollamaBaseUrl: 'http://localhost:11434/v1',
        ollamaModel: 'llama3',
        temperature: 0.7,
        maxTokens: 2048,
        enableFallback: true,
        enableImportModule: false,
    });

    const [showKeys, setShowKeys] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testingProvider, setTestingProvider] = useState(null);
    const [fetchingNvidiaModels, setFetchingNvidiaModels] = useState(false);
    const [nvidiaModels, setNvidiaModels] = useState(RECOMMENDED_NVIDIA_MODELS);
    const [configuredProviders, setConfiguredProviders] = useState({});
    const [credentialSources, setCredentialSources] = useState({});
    const [clearSecrets, setClearSecrets] = useState({});
    const [settingsRevision, setSettingsRevision] = useState(0);
    const [pendingOperation, setPendingOperation] = useState(null);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthenticating, setReauthenticating] = useState(false);
    const usesPasswordProvider = fire.auth().currentUser?.providerData?.some(item => item.providerId === 'password') === true;

    // Per-provider inline message state
    const [providerMessages, setProviderMessages] = useState({});
    const [globalMessage, setGlobalMessage] = useState(null);

    // Quota management state
    const [quotaLimits, setQuotaLimits] = useState({ basic: 10, premium: 100, admin: 10000 });
    const [quotaRecords, setQuotaRecords] = useState([]);
    const [quotaToday, setQuotaToday] = useState('');
    const [quotaTotalHistorical, setQuotaTotalHistorical] = useState(0);
    const [quotaLoading, setQuotaLoading] = useState(false);
    const [quotaSaving, setQuotaSaving] = useState(false);
    const [quotaResetting, setQuotaResetting] = useState(null);
    const [quotaMessage, setQuotaMessage] = useState(null);
    const [resetTargetUid, setResetTargetUid] = useState('');

    // Refs for clearing timeouts
    const messageTimeouts = useRef({});

    useEffect(() => () => {
        Object.values(messageTimeouts.current).forEach(clearTimeout);
        messageTimeouts.current = {};
    }, []);

    useEffect(() => {
        let active = true;
        const loadSettings = async () => {
            try {
                const serverResult = await loadAdminAiSettings();
                if (!active) return;
            setLoadFailed(false);
            const ai = serverResult.settings || {};
            const configured = serverResult.configuredProviders || {};
            const masked = serverResult.maskedKeys || {};
            setConfiguredProviders(configured);
            setCredentialSources(serverResult.credentialSources || {});
            setSettingsRevision(Number(serverResult.revision) || 0);
            const hasGeminiKey = Boolean(configured.gemini);
            const hasNvidiaKey = Boolean(configured.nvidia);
            const hasOpenaiKey = Boolean(configured.openai);
            const hasGroqKey = Boolean(configured.groq);
            const hasOpenrouterKey = Boolean(configured.openrouter);
            const hasDeepseekKey = Boolean(configured.deepseek);

            setAiConfig({
                provider: SUPPORTED_AI_PROVIDERS.includes(ai.provider) ? ai.provider : 'gemini',
                enableGemini: ai.enableGemini !== undefined ? ai.enableGemini : hasGeminiKey,
                geminiApiKey: ai.geminiApiKey || masked.gemini || '',
                model: ai.model || 'gemini-2.0-flash',
                enableNvidia: ai.enableNvidia !== undefined ? ai.enableNvidia : hasNvidiaKey,
                nvidiaApiKey: ai.nvidiaApiKey || masked.nvidia || '',
                nvidiaModel: ai.nvidiaModel || 'meta/llama-3.2-11b-vision-instruct',
                nvidiaBaseUrl: ai.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1',
                enableOpenai: ai.enableOpenai !== undefined ? ai.enableOpenai : hasOpenaiKey,
                openaiApiKey: ai.openaiApiKey || masked.openai || '',
                openaiModel: ai.openaiModel || 'gpt-4o-mini',
                openaiBaseUrl: ai.openaiBaseUrl || '',
                enableGroq: ai.enableGroq !== undefined ? ai.enableGroq : hasGroqKey,
                groqApiKey: ai.groqApiKey || masked.groq || '',
                groqModel: ai.groqModel || 'llama-3.3-70b-versatile',
                enableOpenrouter: ai.enableOpenrouter !== undefined ? ai.enableOpenrouter : hasOpenrouterKey,
                openrouterApiKey: ai.openrouterApiKey || masked.openrouter || '',
                openrouterModel: ai.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
                enableDeepseek: ai.enableDeepseek !== undefined ? ai.enableDeepseek : hasDeepseekKey,
                deepseekApiKey: ai.deepseekApiKey || masked.deepseek || '',
                deepseekModel: ai.deepseekModel || 'deepseek-chat',
                enableOllama: ai.enableOllama !== undefined ? ai.enableOllama : false,
                ollamaBaseUrl: ai.ollamaBaseUrl || 'http://localhost:11434/v1',
                ollamaModel: ai.ollamaModel || 'llama3',
                temperature: ai.temperature !== undefined ? ai.temperature : 0.7,
                maxTokens: ai.maxTokens || 2048,
                enableFallback: ai.enableFallback !== undefined ? ai.enableFallback : true,
                enableImportModule: ai.enableImportModule !== undefined ? ai.enableImportModule : false,
            });
            } catch (error) {
                if (active) { setLoadFailed(true); const loadMsg = error.message.startsWith('Unable to load') ? error.message : `Unable to load AI settings: ${error.message}`; setGlobalMessage({ type: 'error', text: `${loadMsg}${error.requestId ? ` (Request ${error.requestId})` : ''}` }); }
            } finally {
                if (active) setLoading(false);
            }
        };
        loadSettings();
        return () => { active = false; };
    }, []);

    // Load quota stats on mount
    useEffect(() => {
        let active = true;
        const loadQuota = async () => {
            setQuotaLoading(true);
            try {
                const result = await loadQuotaStats();
                if (!active) return;
                if (result.limits) setQuotaLimits(result.limits);
                if (result.todayRecords) setQuotaRecords(result.todayRecords);
                if (result.today) setQuotaToday(result.today);
                if (result.totalHistoricalRecords !== undefined) setQuotaTotalHistorical(result.totalHistoricalRecords);
            } catch (_) { /* Quota stats optional - don't block page */ }
            finally { if (active) setQuotaLoading(false); }
        };
        loadQuota();
        return () => { active = false; };
    }, []);

    const handleSaveQuotaLimits = async () => {
        setQuotaSaving(true);
        setQuotaMessage(null);
        try {
            const result = await saveQuotaLimits({
                basicDailyLimit: Number(quotaLimits.basic) || 10,
                premiumDailyLimit: Number(quotaLimits.premium) || 100,
                adminDailyLimit: Number(quotaLimits.admin) || 10000,
            });
            setQuotaMessage({ type: 'success', text: result.message || 'Quota limits saved.' });
        } catch (error) {
            setQuotaMessage({ type: 'error', text: error.message || 'Failed to save quota limits.' });
        } finally {
            setQuotaSaving(false);
            setTimeout(() => setQuotaMessage(null), 6000);
        }
    };

    const handleResetQuota = async (targetUid) => {
        const label = targetUid ? `user ${targetUid.slice(0, 12)}...` : 'ALL users';
        const accepted = await confirm({
            title: 'Reset AI quota',
            message: `Reset the AI quota for ${label}? Their daily usage count returns to 0 immediately.`,
            confirmLabel: 'Reset quota',
            variant: 'warning',
        });
        if (!accepted) return;
        setQuotaResetting(targetUid || '__all__');
        setQuotaMessage(null);
        try {
            const result = await resetQuota(targetUid ? { uid: targetUid } : { all: true });
            setQuotaMessage({ type: 'success', text: result.message || 'Quota reset successful.' });
            // Refresh stats
            const updated = await loadQuotaStats();
            if (updated.todayRecords) setQuotaRecords(updated.todayRecords);
            if (updated.totalHistoricalRecords !== undefined) setQuotaTotalHistorical(updated.totalHistoricalRecords);
        } catch (error) {
            setQuotaMessage({ type: 'error', text: error.message || 'Failed to reset quota.' });
        } finally {
            setQuotaResetting(null);
            setResetTargetUid('');
            setTimeout(() => setQuotaMessage(null), 6000);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const providerForField = Object.entries(PROVIDER_KEY_FIELDS).find(([, field]) => field === name)?.[0];
        if (providerForField) setClearSecrets(current => ({ ...current, [providerForField]: false }));
        setAiConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };

            // Smart auto‑enable when a key is pasted
            if (name === 'nvidiaApiKey' && value.trim() !== '') {
                next.enableNvidia = true;
                next.provider = 'nvidia';
            } else if (name === 'geminiApiKey' && value.trim() !== '') {
                next.enableGemini = true;
            } else if (name === 'openaiApiKey' && value.trim() !== '') {
                next.enableOpenai = true;
            } else if (name === 'groqApiKey' && value.trim() !== '') {
                next.enableGroq = true;
            } else if (name === 'openrouterApiKey' && value.trim() !== '') {
                next.enableOpenrouter = true;
            } else if (name === 'deepseekApiKey' && value.trim() !== '') {
                next.enableDeepseek = true;
            }
            return next;
        });
    };

    const toggleProviderState = (providerKey) => {
        const fieldName = `enable${providerKey.charAt(0).toUpperCase() + providerKey.slice(1)}`;
        setAiConfig((prev) => {
            const newStatus = !prev[fieldName];
            const next = { ...prev, [fieldName]: newStatus };
            // If turning off the active provider, fallback to the first enabled one
            if (!newStatus && prev.provider === providerKey) {
                if (next.enableGemini && providerKey !== 'gemini') next.provider = 'gemini';
                else if (next.enableNvidia && providerKey !== 'nvidia') next.provider = 'nvidia';
                else if (next.enableOpenai && providerKey !== 'openai') next.provider = 'openai';
                else if (next.enableGroq && providerKey !== 'groq') next.provider = 'groq';
                else if (next.enableOpenrouter && providerKey !== 'openrouter') next.provider = 'openrouter';
                else if (next.enableDeepseek && providerKey !== 'deepseek') next.provider = 'deepseek';
                else if (next.enableOllama && providerKey !== 'ollama') next.provider = 'ollama';
            }
            return next;
        });
    };

    const toggleKeyVisibility = (keyName) => {
        setShowKeys((prev) => ({ ...prev, [keyName]: !prev[keyName] }));
    };

    const clearProviderSecret = (provider) => {
        const field = PROVIDER_KEY_FIELDS[provider];
        if (!field) return;
        setAiConfig(current => ({ ...current, [field]: '' }));
        setClearSecrets(current => ({ ...current, [provider]: true }));
        setGlobalMessage({ type: 'info', text: `${provider} credential will be cleared when you click Save AI settings.` });
    };

    const setCardMessage = (providerKey, type, text) => {
        // Clear any existing timeout for this provider
        if (messageTimeouts.current[providerKey]) {
            clearTimeout(messageTimeouts.current[providerKey]);
            delete messageTimeouts.current[providerKey];
        }
        if (type === null) {
            setProviderMessages((prev) => ({ ...prev, [providerKey]: null }));
            return;
        }
        setProviderMessages((prev) => ({ ...prev, [providerKey]: { type, text } }));
        messageTimeouts.current[providerKey] = setTimeout(() => {
            setProviderMessages((prev) => ({ ...prev, [providerKey]: null }));
            delete messageTimeouts.current[providerKey];
        }, 10000);
    };

    const handleFetchNvidiaModels = async () => {
        if (!isSuperAdmin) {
            setCardMessage('nvidia', 'error', 'Only Super Admin can fetch provider models.');
            return;
        }
        setFetchingNvidiaModels(true);
        try {
            const res = await fetchAdminAiModels({ provider: 'nvidia', apiKey: aiConfig.nvidiaApiKey });
            if (res.models && res.models.length > 0) {
                const fetched = res.models.map(m => {
                    const isFast = m.id.includes('8b') || m.id.includes('4b') || m.id.includes('20b') || m.id.includes('mini');
                    const isHeavy = m.id.includes('120b') || m.id.includes('70b') || m.id.includes('340b') || m.id.includes('405b');
                    const speedTag = isFast ? ' (⚡ Fast)' : isHeavy ? ' (🧠 Heavy)' : '';
                    return {
                        id: m.id,
                        name: `${m.id}${speedTag}`,
                        badge: m.owned_by ? m.owned_by.toUpperCase() : 'NVIDIA'
                    };
                });
                const recIds = new Set(RECOMMENDED_NVIDIA_MODELS.map(r => r.id));
                const rest = fetched.filter(f => !recIds.has(f.id));
                setNvidiaModels([...RECOMMENDED_NVIDIA_MODELS, ...rest]);
                setCardMessage('nvidia', 'success', `Successfully fetched ${res.models.length} live models from NVIDIA NIM.`);
            } else {
                setNvidiaModels(RECOMMENDED_NVIDIA_MODELS);
                setCardMessage('nvidia', 'success', `Loaded ${RECOMMENDED_NVIDIA_MODELS.length} curated NVIDIA models.`);
            }
        } catch (err) {
            setNvidiaModels(RECOMMENDED_NVIDIA_MODELS);
            setCardMessage('nvidia', 'error', `Could not fetch live models: ${err.message}. Showing ${RECOMMENDED_NVIDIA_MODELS.length} curated models.`);
        } finally {
            setFetchingNvidiaModels(false);
        }
    };

    const saveSettings = async () => {
        if (!isSuperAdmin) {
            setGlobalMessage({ type: 'error', text: 'Only Super Admin can change AI provider settings. Admin can review the server-side status without editing credentials.' });
            return false;
        }
        if (loadFailed) { setGlobalMessage({ type: 'error', text: 'Reload AI settings successfully before saving to avoid overwriting unknown state.' }); return false; }
        setSaving(true);
        try {
            const requestedClearSecrets = { ...clearSecrets };
            const result = await saveAdminAiSettings({ ...aiConfig, clearSecrets: requestedClearSecrets }, settingsRevision);
            setSettingsRevision(Number(result.revision) || settingsRevision);
            setConfiguredProviders(result.configuredProviders || {});
            setCredentialSources(result.credentialSources || {});
            setClearSecrets({});
            const masked = result.maskedKeys || {};
            setAiConfig(current => ({
                ...current, ...(result.settings || {}),
                geminiApiKey: requestedClearSecrets.gemini ? '' : (result.settings?.geminiApiKey || masked.gemini || current.geminiApiKey),
                nvidiaApiKey: requestedClearSecrets.nvidia ? '' : (result.settings?.nvidiaApiKey || masked.nvidia || current.nvidiaApiKey),
                openaiApiKey: requestedClearSecrets.openai ? '' : (result.settings?.openaiApiKey || masked.openai || current.openaiApiKey),
                groqApiKey: requestedClearSecrets.groq ? '' : (result.settings?.groqApiKey || masked.groq || current.groqApiKey),
                openrouterApiKey: requestedClearSecrets.openrouter ? '' : (result.settings?.openrouterApiKey || masked.openrouter || current.openrouterApiKey),
                deepseekApiKey: requestedClearSecrets.deepseek ? '' : (result.settings?.deepseekApiKey || masked.deepseek || current.deepseekApiKey),
            }));
            setPendingOperation(null);
            setReauthPassword('');
            setGlobalMessage({ type: 'success', text: 'AI settings saved to the server-only provider store.' });
            return true;
        } catch (error) {
            if (error.code === 'RECENT_AUTH_REQUIRED') setPendingOperation({ type: 'save' });
            if (error.code === 'AI_SETTINGS_CONFLICT') {
                setGlobalMessage({ type: 'error', text: `${error.message} Your unsaved values remain in this panel.` });
            } else {
                setGlobalMessage({ type: 'error', text: `Failed to save settings: ${error.message}${error.requestId ? ` (Request ${error.requestId})` : ''}` });
            }
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async (event) => {
        event.preventDefault();
        await saveSettings();
    };

    const testSpecificProvider = async (targetProvider) => {
        if (!isSuperAdmin) {
            setCardMessage(targetProvider, 'error', 'Only Super Admin can run provider connectivity tests.');
            return;
        }
        setTestingProvider(targetProvider);
        setCardMessage(targetProvider, null, null);
        const keyFields = PROVIDER_KEY_FIELDS;
        const modelFields = {
            gemini: 'model', nvidia: 'nvidiaModel', openai: 'openaiModel', groq: 'groqModel',
            openrouter: 'openrouterModel', deepseek: 'deepseekModel', ollama: 'ollamaModel'
        };
        try {
            const key = keyFields[targetProvider] ? String(aiConfig[keyFields[targetProvider]] || '').trim() : '';
            if (targetProvider !== 'ollama' && !key && !configuredProviders[targetProvider]) {
                throw new Error(`Enter and save the ${targetProvider} API key first.`);
            }
            const startTime = Date.now();
            const result = await testAdminAiProvider({
                provider: targetProvider,
                apiKey: key,
                model: aiConfig[modelFields[targetProvider]] || '',
            });
            const latency = Date.now() - startTime;
            setPendingOperation(null);
            const verifiedModel = result.model || aiConfig[modelFields[targetProvider]] || 'default';
            const speedRating = latency < 800 ? '⚡ Ultra Fast' : latency < 3000 ? '✓ Fast' : latency < 7000 ? '⏳ Moderate' : '🐢 High Latency';
            setCardMessage(targetProvider, 'success', `✓ ${targetProvider.toUpperCase()} connection verified in ${latency}ms (${speedRating})! Model "${verifiedModel}" is live and ready.`);
        } catch (error) {
            if (error.code === 'RECENT_AUTH_REQUIRED') setPendingOperation({ type: 'test', provider: targetProvider });
            const errorMsg = error.message.startsWith('Test Failed') ? error.message : `Test Failed: ${error.message}`;
            setCardMessage(targetProvider, 'error', `${errorMsg}${error.requestId ? ` (Request ${error.requestId})` : ''}`);
        } finally {
            setTestingProvider(null);
        }
    };

    const handleReauthenticateAndRetry = async () => {
        if (!pendingOperation) return;
        setReauthenticating(true);
        try {
            await reauthenticateUser(usesPasswordProvider ? reauthPassword : '');
            await fire.auth().currentUser?.getIdToken(true);
            const operation = pendingOperation;
            setPendingOperation(null);
            setReauthPassword('');
            if (operation.type === 'save') await saveSettings();
            else if (operation.type === 'test') await testSpecificProvider(operation.provider);
        } catch (error) {
            setGlobalMessage({ type: 'error', text: `Reauthentication failed: ${error.message || 'Try signing in again.'}` });
        } finally {
            setReauthenticating(false);
        }
    };

    // Determine which model field to use for the top input
    const getActiveModelField = () => {
        const provider = aiConfig.provider;
        if (provider === 'gemini') return { name: 'model', value: aiConfig.model };
        if (provider === 'nvidia') return { name: 'nvidiaModel', value: aiConfig.nvidiaModel };
        if (provider === 'openai') return { name: 'openaiModel', value: aiConfig.openaiModel };
        if (provider === 'groq') return { name: 'groqModel', value: aiConfig.groqModel };
        if (provider === 'openrouter') return { name: 'openrouterModel', value: aiConfig.openrouterModel };
        if (provider === 'deepseek') return { name: 'deepseekModel', value: aiConfig.deepseekModel };
        if (provider === 'ollama') return { name: 'ollamaModel', value: aiConfig.ollamaModel };
        return { name: 'model', value: '' };
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading AI settings...</span>
            </div>
        );
    }

    const activeModel = getActiveModelField();

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {globalMessage && (
                <div role={globalMessage.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`p-4 rounded-lg flex items-center justify-between text-sm ${globalMessage.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                    <div className="flex items-center space-x-2">
                        {globalMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{globalMessage.text}</span>
                    </div>
                    {loadFailed && <button type="button" onClick={() => window.location.reload()} className="ml-3 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold">Reload settings</button>}
                </div>
            )}

            {pendingOperation && (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-semibold">Reauthentication is required for this sensitive AI settings operation.</p>
                    <p className="mt-1 text-xs">Your unsaved settings remain in this panel. Reauthenticate to retry the exact operation.</p>
                    {usesPasswordProvider && <label htmlFor="ai-reauth-password" className="mt-3 block text-xs font-semibold">Current password<input id="ai-reauth-password" type="password" autoComplete="current-password" value={reauthPassword} onChange={event => setReauthPassword(event.target.value)} className="mt-1 block w-full max-w-sm rounded border border-amber-300 bg-white px-3 py-2 font-normal" /></label>}
                    <button type="button" onClick={handleReauthenticateAndRetry} disabled={reauthenticating || (usesPasswordProvider && !reauthPassword)} className="mt-3 rounded bg-amber-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{reauthenticating ? 'Reauthenticating…' : 'Reauthenticate and retry'}</button>
                </div>
            )}

            {/* Active AI Provider Switcher */}
            <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-indigo-950 p-5 rounded-xl border border-emerald-900/60 shadow-md text-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-emerald-600/30 rounded-lg border border-emerald-400/30 text-emerald-300">
                            <FaBrain className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-white">Active AI Engine & Multi-Provider Switcher</h3>
                            <p className="text-xs text-emerald-200/80">Select primary AI generation provider for resume building & bullet optimization</p>
                        </div>
                    </div>
                </div>

                <div className="mb-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-emerald-100">
                    Primary credential source: <strong>{credentialSources[aiConfig.provider] || 'none'}</strong>.
                    {credentialSources[aiConfig.provider] === 'environment' && ' This deployment-managed credential takes precedence; saving UI keys will not replace the environment secret.'}
                    {!configuredProviders[aiConfig.provider] && !String(aiConfig[PROVIDER_KEY_FIELDS[aiConfig.provider]] || '').trim() && ' No credential is configured; generation will use the first configured enabled fallback provider.'}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    <div>
                        <label className="block text-xs font-semibold text-emerald-200 uppercase tracking-wider mb-1.5">
                            Primary Target Provider
                        </label>
                        <select
                            name="provider"
                            value={aiConfig.provider}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm bg-slate-800 border border-emerald-500/40 text-white rounded-lg focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                        >
                            <option value="gemini">Google Gemini (Default)</option>
                            <option value="nvidia">NVIDIA NIM (OpenAI Compatible - Free High-Perm API)</option>
                            <option value="openai">OpenAI / OpenAI Compatible</option>
                            <option value="groq">Groq Cloud (Free Tier & Fast)</option>
                            <option value="openrouter">OpenRouter (Free Open-Source Models)</option>
                            <option value="deepseek">DeepSeek AI</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-emerald-200 uppercase tracking-wider mb-1.5">
                            Active Model Target
                        </label>
                        <input
                            type="text"
                            name={activeModel.name}
                            value={activeModel.value}
                            onChange={handleChange}
                            placeholder="e.g. meta/llama-3.3-70b-instruct, gemini-2.0-flash"
                            className="w-full px-3 py-2 text-sm bg-slate-800 border border-emerald-500/40 text-white rounded-lg focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-emerald-200 uppercase tracking-wider mb-1.5">
                            Creativity Temperature ({aiConfig.temperature})
                        </label>
                        <input
                            type="range"
                            name="temperature"
                            min="0"
                            max="1"
                            step="0.1"
                            value={aiConfig.temperature}
                            onChange={handleChange}
                            className="w-full accent-emerald-400 mt-2"
                        />
                    </div>
                </div>
            </div>

            {/* AI Resume Import Module Toggle (Default OFF) */}
            <div className={`p-5 rounded-xl border transition-all ${aiConfig.enableImportModule
                    ? 'bg-purple-50/70 border-purple-400 ring-2 ring-purple-500/10 shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-90'
                }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className={`p-2.5 rounded-lg border ${aiConfig.enableImportModule
                                ? 'bg-purple-600/10 border-purple-300 text-purple-700'
                                : 'bg-slate-200/60 border-slate-300 text-slate-500'
                            }`}>
                            <FaDownload className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h4 className="text-base font-semibold text-slate-800">AI Resume Import Module</h4>
                                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${aiConfig.enableImportModule
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {aiConfig.enableImportModule ? 'ENABLED' : 'DISABLED (DEFAULT OFF)'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Enable or disable user-side document resume import (PDF, DOCX, DOC, TXT, Image parsing via AI). Default is OFF.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => toggleProviderState('importModule')}
                        className="flex items-center space-x-2 focus:outline-none"
                    >
                        <div className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableImportModule ? 'bg-purple-600' : 'bg-slate-300'
                            }`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${aiConfig.enableImportModule ? 'translate-x-6' : 'translate-x-0'
                                }`} />
                        </div>
                    </button>
                </div>
            </div>

            {/* Provider Configuration Panels */}
            <div className="space-y-4">
                {/* 1. NVIDIA NIM */}
                <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableNvidia
                        ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-500/10'
                        : 'bg-slate-50 border-slate-200 opacity-90'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                            <SiNvidia className="text-emerald-600 w-5 h-5" />
                            <h4 className="text-sm font-semibold text-slate-800">NVIDIA NIM API (OpenAI Compatible)</h4>
                            {aiConfig.provider === 'nvidia' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded-full">PRIMARY</span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleProviderState('nvidia')}
                            className="flex items-center space-x-2 focus:outline-none"
                        >
                            <span className={`text-xs font-bold ${aiConfig.enableNvidia ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {aiConfig.enableNvidia ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableNvidia ? 'bg-emerald-600' : 'bg-slate-300'
                                }`}>
                                <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableNvidia ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                            </div>
                        </button>
                    </div>

                    <p className="text-xs text-slate-500 mb-3">
                        NVIDIA NIM provides high-throughput OpenAI-compatible endpoints with free starter credits for Llama 3.3 70B & Nemotron models.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">NVIDIA API Key</label>
                            <div className="relative">
                                <input
                                    type={showKeys.nvidia ? 'text' : 'password'}
                                    name="nvidiaApiKey"
                                    value={aiConfig.nvidiaApiKey}
                                    onChange={handleChange}
                                    disabled={!isSuperAdmin}
                                    placeholder={configuredProviders.nvidia ? 'Configured securely — enter only to replace' : 'nvapi-...'}
                                    className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('nvidia')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                >
                                    {showKeys.nvidia ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            {configuredProviders.nvidia && isSuperAdmin && (
                                <div className="mt-1 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                    <FaCheck className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                    <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('nvidia')} aria-label="Clear nvidia API key">Clear</button>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-semibold text-slate-600">NVIDIA Target Model</label>
                                <button
                                    type="button"
                                    onClick={handleFetchNvidiaModels}
                                    disabled={fetchingNvidiaModels || !isSuperAdmin}
                                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                                >
                                    {fetchingNvidiaModels ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                                    <span>Fetch Available Models</span>
                                </button>
                            </div>
                            <div className="space-y-1.5">
                                <select
                                    name="nvidiaModel"
                                    value={nvidiaModels.some(m => m.id === aiConfig.nvidiaModel) ? aiConfig.nvidiaModel : 'custom'}
                                    onChange={(e) => {
                                        if (e.target.value !== 'custom') {
                                            handleChange({ target: { name: 'nvidiaModel', value: e.target.value } });
                                        }
                                    }}
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                                >
                                    {nvidiaModels.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                    <option value="custom">✏️ Enter Custom Model ID Manually...</option>
                                </select>
                                <input
                                    type="text"
                                    name="nvidiaModel"
                                    value={aiConfig.nvidiaModel}
                                    onChange={handleChange}
                                    placeholder="e.g. meta/llama-3.2-11b-vision-instruct or custom model ID"
                                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono bg-slate-50"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-3">
                        <span className="text-[11px] font-mono text-slate-500">https://integrate.api.nvidia.com/v1</span>
                        <button
                            type="button"
                            onClick={() => testSpecificProvider('nvidia')}
                            disabled={testingProvider === 'nvidia' || !isSuperAdmin}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                        >
                            {testingProvider === 'nvidia' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                            <span>Test NVIDIA Live API</span>
                        </button>
                    </div>

                    {providerMessages.nvidia && (
                        <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.nvidia.type === 'success'
                                ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                : 'bg-red-100 border border-red-300 text-red-900'
                            }`}>
                            <div className="flex items-center space-x-2">
                                {providerMessages.nvidia.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                <span>{providerMessages.nvidia.text}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Google Gemini */}
                <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableGemini
                        ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/10'
                        : 'bg-slate-50 border-slate-200 opacity-90'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                            <FaKey className="text-blue-600" />
                            <h4 className="text-sm font-semibold text-slate-800">Google Gemini API</h4>
                            {aiConfig.provider === 'gemini' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">PRIMARY</span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleProviderState('gemini')}
                            className="flex items-center space-x-2 focus:outline-none"
                        >
                            <span className={`text-xs font-bold ${aiConfig.enableGemini ? 'text-blue-600' : 'text-slate-400'}`}>
                                {aiConfig.enableGemini ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableGemini ? 'bg-blue-600' : 'bg-slate-300'
                                }`}>
                                <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableGemini ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                            </div>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Gemini API Key</label>
                            <div className="relative">
                                <input
                                    type={showKeys.gemini ? 'text' : 'password'}
                                    name="geminiApiKey"
                                    value={aiConfig.geminiApiKey}
                                    onChange={handleChange}
                                    disabled={!isSuperAdmin}
                                    placeholder={configuredProviders.gemini ? 'Configured securely — enter only to replace' : 'AIzaSy...'}
                                    className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('gemini')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                >
                                    {showKeys.gemini ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            {configuredProviders.gemini && isSuperAdmin && (
                                <div className="mt-1 text-[11px] text-blue-700 font-medium flex items-center gap-1">
                                    <FaCheck className="w-3 h-3 text-blue-600 flex-shrink-0" />
                                    <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('gemini')} aria-label="Clear gemini API key">Clear</button>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Gemini Model Target</label>
                            <div className="space-y-1.5">
                                <select
                                    name="model"
                                    value={['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'].includes(aiConfig.model) ? aiConfig.model : 'custom'}
                                    onChange={(e) => {
                                        if (e.target.value !== 'custom') {
                                            handleChange({ target: { name: 'model', value: e.target.value } });
                                        }
                                    }}
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                                >
                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fastest)</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Reasoning)</option>
                                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                    <option value="custom">✏️ Enter Custom Gemini Model ID...</option>
                                </select>
                                <input
                                    type="text"
                                    name="model"
                                    value={aiConfig.model}
                                    onChange={handleChange}
                                    placeholder="e.g. gemini-2.0-flash or custom model ID"
                                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono bg-slate-50"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-3">
                        <span className="text-[11px] font-mono text-slate-500">v1beta.generativelanguage.googleapis.com</span>
                        <button
                            type="button"
                            onClick={() => testSpecificProvider('gemini')}
                            disabled={testingProvider === 'gemini' || !isSuperAdmin}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                        >
                            {testingProvider === 'gemini' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                            <span>Test Gemini Live API</span>
                        </button>
                    </div>

                    {providerMessages.gemini && (
                        <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.gemini.type === 'success'
                                ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                : 'bg-red-100 border border-red-300 text-red-900'
                            }`}>
                            <div className="flex items-center space-x-2">
                                {providerMessages.gemini.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                <span>{providerMessages.gemini.text}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. OpenAI & Custom Base URL */}
                <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableOpenai
                        ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-500/10'
                        : 'bg-slate-50 border-slate-200 opacity-90'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                            <FaServer className="text-indigo-600" />
                            <h4 className="text-sm font-semibold text-slate-800">OpenAI / OpenAI-Compatible Endpoint</h4>
                            {aiConfig.provider === 'openai' && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-full">PRIMARY</span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleProviderState('openai')}
                            className="flex items-center space-x-2 focus:outline-none"
                        >
                            <span className={`text-xs font-bold ${aiConfig.enableOpenai ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {aiConfig.enableOpenai ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableOpenai ? 'bg-indigo-600' : 'bg-slate-300'
                                }`}>
                                <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableOpenai ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                            </div>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">OpenAI API Key</label>
                            <div className="relative">
                                <input
                                    type={showKeys.openai ? 'text' : 'password'}
                                    name="openaiApiKey"
                                    value={aiConfig.openaiApiKey}
                                    onChange={handleChange}
                                    disabled={!isSuperAdmin}
                                    placeholder={configuredProviders.openai ? 'Configured securely — enter only to replace' : 'sk-proj-...'}
                                    className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('openai')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                >
                                    {showKeys.openai ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            {configuredProviders.openai && isSuperAdmin && (
                                <div className="mt-1 text-[11px] text-indigo-700 font-medium flex items-center gap-1">
                                    <FaCheck className="w-3 h-3 text-indigo-600 flex-shrink-0" />
                                    <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('openai')} aria-label="Clear openai API key">Clear</button>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Model Name</label>
                            <input
                                type="text"
                                name="openaiModel"
                                value={aiConfig.openaiModel}
                                onChange={handleChange}
                                placeholder="gpt-4o-mini, gpt-4o, etc."
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Custom Base URL (Optional)</label>
                            <input
                                type="text"
                                name="openaiBaseUrl"
                                value={aiConfig.openaiBaseUrl}
                                onChange={handleChange}
                                placeholder="https://api.openai.com/v1"
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-3">
                        <span className="text-[11px] font-mono text-slate-500">{aiConfig.openaiBaseUrl || 'https://api.openai.com/v1'}</span>
                        <button
                            type="button"
                            onClick={() => testSpecificProvider('openai')}
                            disabled={testingProvider === 'openai' || !isSuperAdmin}
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                        >
                            {testingProvider === 'openai' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                            <span>Test OpenAI Live API</span>
                        </button>
                    </div>

                    {providerMessages.openai && (
                        <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.openai.type === 'success'
                                ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                : 'bg-red-100 border border-red-300 text-red-900'
                            }`}>
                            <div className="flex items-center space-x-2">
                                {providerMessages.openai.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                <span>{providerMessages.openai.text}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Groq & OpenRouter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Groq */}
                    <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableGroq
                            ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-500/10'
                            : 'bg-slate-50 border-slate-200 opacity-90'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <FaBolt className="text-amber-600" />
                                <h4 className="text-sm font-semibold text-slate-800">Groq Cloud (Free Tier)</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleProviderState('groq')}
                                className="flex items-center space-x-2 focus:outline-none"
                            >
                                <span className={`text-xs font-bold ${aiConfig.enableGroq ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {aiConfig.enableGroq ? 'ENABLED' : 'DISABLED'}
                                </span>
                                <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableGroq ? 'bg-amber-600' : 'bg-slate-300'
                                    }`}>
                                    <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableGroq ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Groq API Key</label>
                                <div className="relative">
                                    <input
                                        type={showKeys.groq ? 'text' : 'password'}
                                        name="groqApiKey"
                                        value={aiConfig.groqApiKey}
                                        onChange={handleChange}
                                        disabled={!isSuperAdmin}
                                        placeholder={configuredProviders.groq ? 'Configured securely — enter only to replace' : 'gsk_...'}
                                        className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('groq')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                    >
                                        {showKeys.groq ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                {configuredProviders.groq && isSuperAdmin && (
                                    <div className="mt-1 text-[11px] text-amber-700 font-medium flex items-center gap-1">
                                        <FaCheck className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                        <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('groq')} aria-label="Clear groq API key">Clear</button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Groq Model</label>
                                <input
                                    type="text"
                                    name="groqModel"
                                    value={aiConfig.groqModel}
                                    onChange={handleChange}
                                    placeholder="llama-3.3-70b-versatile"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <span className="text-[11px] font-mono text-slate-500">api.groq.com</span>
                            <button
                                type="button"
                                onClick={() => testSpecificProvider('groq')}
                                disabled={testingProvider === 'groq' || !isSuperAdmin}
                                className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                            >
                                {testingProvider === 'groq' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                                <span>Test Groq API</span>
                            </button>
                        </div>

                        {providerMessages.groq && (
                            <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.groq.type === 'success'
                                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                    : 'bg-red-100 border border-red-300 text-red-900'
                                }`}>
                                <div className="flex items-center space-x-2">
                                    {providerMessages.groq.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                    <span>{providerMessages.groq.text}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* OpenRouter */}
                    <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableOpenrouter
                            ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-500/10'
                            : 'bg-slate-50 border-slate-200 opacity-90'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <FaGlobe className="text-purple-600" />
                                <h4 className="text-sm font-semibold text-slate-800">OpenRouter (Free Models)</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleProviderState('openrouter')}
                                className="flex items-center space-x-2 focus:outline-none"
                            >
                                <span className={`text-xs font-bold ${aiConfig.enableOpenrouter ? 'text-purple-600' : 'text-slate-400'}`}>
                                    {aiConfig.enableOpenrouter ? 'ENABLED' : 'DISABLED'}
                                </span>
                                <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableOpenrouter ? 'bg-purple-600' : 'bg-slate-300'
                                    }`}>
                                    <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableOpenrouter ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">OpenRouter API Key</label>
                                <div className="relative">
                                    <input
                                        type={showKeys.openrouter ? 'text' : 'password'}
                                        name="openrouterApiKey"
                                        value={aiConfig.openrouterApiKey}
                                        onChange={handleChange}
                                        disabled={!isSuperAdmin}
                                        placeholder={configuredProviders.openrouter ? 'Configured securely — enter only to replace' : 'sk-or-v1-...'}
                                        className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('openrouter')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                    >
                                        {showKeys.openrouter ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                {configuredProviders.openrouter && isSuperAdmin && (
                                    <div className="mt-1 text-[11px] text-purple-700 font-medium flex items-center gap-1">
                                        <FaCheck className="w-3 h-3 text-purple-600 flex-shrink-0" />
                                        <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('openrouter')} aria-label="Clear openrouter API key">Clear</button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">OpenRouter Model</label>
                                <input
                                    type="text"
                                    name="openrouterModel"
                                    value={aiConfig.openrouterModel}
                                    onChange={handleChange}
                                    placeholder="meta-llama/llama-3.3-70b-instruct:free"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <span className="text-[11px] font-mono text-slate-500">openrouter.ai/api/v1</span>
                            <button
                                type="button"
                                onClick={() => testSpecificProvider('openrouter')}
                                disabled={testingProvider === 'openrouter' || !isSuperAdmin}
                                className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                            >
                                {testingProvider === 'openrouter' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                                <span>Test OpenRouter</span>
                            </button>
                        </div>

                        {providerMessages.openrouter && (
                            <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.openrouter.type === 'success'
                                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                    : 'bg-red-100 border border-red-300 text-red-900'
                                }`}>
                                <div className="flex items-center space-x-2">
                                    {providerMessages.openrouter.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                    <span>{providerMessages.openrouter.text}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. DeepSeek & Ollama */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableDeepseek
                            ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/10'
                            : 'bg-slate-50 border-slate-200 opacity-90'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <FaRobot className="text-blue-600" />
                                <h4 className="text-sm font-semibold text-slate-800">DeepSeek AI</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleProviderState('deepseek')}
                                className="flex items-center space-x-2 focus:outline-none"
                            >
                                <span className={`text-xs font-bold ${aiConfig.enableDeepseek ? 'text-blue-600' : 'text-slate-400'}`}>
                                    {aiConfig.enableDeepseek ? 'ENABLED' : 'DISABLED'}
                                </span>
                                <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableDeepseek ? 'bg-blue-600' : 'bg-slate-300'
                                    }`}>
                                    <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableDeepseek ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">DeepSeek API Key</label>
                                <div className="relative">
                                    <input
                                        type={showKeys.deepseek ? 'text' : 'password'}
                                        name="deepseekApiKey"
                                        value={aiConfig.deepseekApiKey}
                                        onChange={handleChange}
                                        disabled={!isSuperAdmin}
                                        placeholder={configuredProviders.deepseek ? 'Configured securely — enter only to replace' : 'sk-...'}
                                        className="w-full pl-3 pr-10 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleKeyVisibility('deepseek')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 p-1"
                                    >
                                        {showKeys.deepseek ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                                {configuredProviders.deepseek && isSuperAdmin && (
                                    <div className="mt-1 text-[11px] text-blue-700 font-medium flex items-center gap-1">
                                        <FaCheck className="w-3 h-3 text-blue-600 flex-shrink-0" />
                                        <span>API key configured &amp; active on server (masked for security)</span><button type="button" className="ml-2 font-bold underline" onClick={() => clearProviderSecret('deepseek')} aria-label="Clear deepseek API key">Clear</button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">DeepSeek Model</label>
                                <input
                                    type="text"
                                    name="deepseekModel"
                                    value={aiConfig.deepseekModel}
                                    onChange={handleChange}
                                    placeholder="deepseek-chat"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <span className="text-[11px] font-mono text-slate-500">api.deepseek.com</span>
                            <button
                                type="button"
                                onClick={() => testSpecificProvider('deepseek')}
                                disabled={testingProvider === 'deepseek' || !isSuperAdmin}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                            >
                                {testingProvider === 'deepseek' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                                <span>Test DeepSeek</span>
                            </button>
                        </div>

                        {providerMessages.deepseek && (
                            <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.deepseek.type === 'success'
                                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                    : 'bg-red-100 border border-red-300 text-red-900'
                                }`}>
                                <div className="flex items-center space-x-2">
                                    {providerMessages.deepseek.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                    <span>{providerMessages.deepseek.text}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                        <div className="flex items-center gap-2"><FaDesktop className="text-slate-500" /><h4 className="text-sm font-semibold">Ollama / LocalAI</h4></div>
                        <p className="mt-2 text-xs">Not supported by the trusted multi-provider runtime. Browser-supplied self-hosted endpoints remain disabled by SSRF policy.</p>
                    </div>
                </div>

                {/* Fallback Checkbox */}
                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200 flex items-center space-x-3">
                    <input
                        type="checkbox"
                        id="enableFallback"
                        name="enableFallback"
                        checked={aiConfig.enableFallback}
                        onChange={handleChange}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    <label htmlFor="enableFallback" className="text-xs font-semibold text-slate-700 cursor-pointer">
                        Enable automatic fallback to the next configured provider when the primary provider fails or rate-limits
                    </label>
                </div>
            </div>

            {/* ── Quota Management Section ── */}
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-orange-50/40 p-5 space-y-5">
                <div>
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-0.5">
                        <FaChartBar className="text-amber-600" /> AI Quota Management
                    </h3>
                    <p className="text-xs text-slate-500">Configure daily generation limits per membership tier and manage user quotas.</p>
                </div>

                {quotaMessage && (
                    <div className={`p-3 rounded-lg text-xs font-medium flex items-center space-x-2 ${quotaMessage.type === 'success'
                        ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                        : 'bg-red-100 border border-red-300 text-red-900'}`}>
                        {quotaMessage.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                        <span>{quotaMessage.text}</span>
                    </div>
                )}

                {/* Tier Limit Configuration */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <FaSlidersH className="text-slate-500" /> Daily Generation Limits per Tier
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Basic (Free)</label>
                            <input
                                type="number" min="1" max="100000"
                                value={quotaLimits.basic}
                                onChange={e => setQuotaLimits(prev => ({ ...prev, basic: Number(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">generations / day</span>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Premium</label>
                            <input
                                type="number" min="1" max="100000"
                                value={quotaLimits.premium}
                                onChange={e => setQuotaLimits(prev => ({ ...prev, premium: Number(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">generations / day</span>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <FaUserShield className="text-amber-600" /> Admin
                            </label>
                            <input
                                type="number" min="1" max="1000000"
                                value={quotaLimits.admin}
                                onChange={e => setQuotaLimits(prev => ({ ...prev, admin: Number(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 mt-0.5 block">generations / day</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-end pt-1">
                        <button
                            type="button"
                            onClick={handleSaveQuotaLimits}
                            disabled={quotaSaving}
                            className="px-4 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                        >
                            {quotaSaving ? <FaSpinner className="animate-spin" /> : <FaCheck />}
                            <span>Save Quota Limits</span>
                        </button>
                    </div>
                </div>

                {/* Reset Quota Section */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <FaSyncAlt className="text-slate-500" /> Reset User Quotas
                    </h4>
                    <div className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">User UID (optional)</label>
                            <input
                                type="text"
                                value={resetTargetUid}
                                onChange={e => setResetTargetUid(e.target.value.trim())}
                                placeholder="Firebase UID — leave empty to reset all users"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-400 focus:border-red-400 focus:outline-none font-mono"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => handleResetQuota(resetTargetUid || null)}
                            disabled={quotaResetting !== null}
                            className="px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm disabled:opacity-50 whitespace-nowrap"
                        >
                            {quotaResetting ? <FaSpinner className="animate-spin" /> : <FaTrashAlt />}
                            <span>{resetTargetUid ? 'Reset User' : 'Reset All'}</span>
                        </button>
                    </div>
                </div>

                {/* Today's Usage Dashboard */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <FaChartBar className="text-slate-500" /> Today's AI Usage ({quotaToday || '—'})
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400">{quotaTotalHistorical} historical records</span>
                    </div>
                    {quotaLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <FaSpinner className="animate-spin text-slate-400 mr-2" />
                            <span className="text-xs text-slate-500">Loading usage data...</span>
                        </div>
                    ) : quotaRecords.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">No AI usage recorded today.</p>
                    ) : (
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50">
                                    <tr className="border-b border-slate-200">
                                        <th className="text-left py-1.5 px-2 font-semibold text-slate-600">User</th>
                                        <th className="text-center py-1.5 px-2 font-semibold text-slate-600">Used</th>
                                        <th className="text-center py-1.5 px-2 font-semibold text-slate-600">Limit</th>
                                        <th className="text-center py-1.5 px-2 font-semibold text-slate-600">%</th>
                                        <th className="text-right py-1.5 px-2 font-semibold text-slate-600">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quotaRecords.map((record, idx) => {
                                        const pct = record.limit > 0 ? Math.round((record.count / record.limit) * 100) : 0;
                                        const isExhausted = pct >= 100;
                                        const isHigh = pct >= 80;
                                        const initial = (record.displayName || record.email || record.uid || 'U').charAt(0).toUpperCase();
                                        const displayName = record.displayName || (record.email ? record.email.split('@')[0] : `User (${record.uid.slice(0, 6)})`);
                                        const isRecordAdmin = record.membership === 'Admin' || record.membership === 'admin' || record.limit >= 10000;
                                        const isRecordPremium = !isRecordAdmin && (record.membership === 'Premium' || record.membership === 'premium' || record.limit >= 100);
                                        return (
                                            <tr key={record.docId || idx} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs flex-shrink-0 overflow-hidden border border-slate-300 shadow-sm">
                                                            {record.photoURL ? (
                                                                <img src={record.photoURL} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span>{initial}</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-slate-800 text-xs truncate max-w-[180px]" title={displayName}>
                                                                    {displayName}
                                                                </span>
                                                                {isRecordAdmin && (
                                                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                                                        Admin
                                                                    </span>
                                                                )}
                                                                {isRecordPremium && (
                                                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                                        PRO
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {record.email && (
                                                                <div className="text-[11px] text-slate-500 truncate max-w-[200px]" title={record.email}>
                                                                    {record.email}
                                                                </div>
                                                            )}
                                                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] flex items-center gap-1">
                                                                <span title={record.uid}>UID: {record.uid.slice(0, 8)}...{record.uid.slice(-4)}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setResetTargetUid(record.uid)}
                                                                    className="text-amber-600 hover:text-amber-700 text-[10px] font-sans font-medium underline ml-1 cursor-pointer"
                                                                    title="Select this UID for reset"
                                                                >
                                                                    Select
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-700">{record.count}</td>
                                                <td className="py-2.5 px-2 text-center font-mono text-slate-500">{record.limit}</td>
                                                <td className="py-2.5 px-2 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        isExhausted ? 'bg-red-100 text-red-700 border border-red-200' : isHigh ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                    }`}>{pct}%</span>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetQuota(record.uid)}
                                                        disabled={quotaResetting === record.uid}
                                                        className="px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors disabled:opacity-50"
                                                        title={`Reset quota for ${displayName}`}
                                                    >
                                                        {quotaResetting === record.uid ? <FaSpinner className="animate-spin inline" /> : 'Reset'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving || loadFailed || !isSuperAdmin}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-black rounded-lg flex items-center space-x-2 shadow-md disabled:opacity-50"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>{isSuperAdmin ? 'Save AI Settings' : 'Super Admin only'}</span>
                </button>
            </div>
            {confirmationDialog}
        </form>
    );
};

export default AiSettings;