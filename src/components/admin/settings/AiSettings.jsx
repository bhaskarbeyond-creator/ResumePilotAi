import React, { useState, useEffect, useRef } from 'react';
import { reauthenticateUser } from '../../../firestore/dbOperations';
import { loadAdminAiSettings, saveAdminAiSettings, testAdminAiProvider } from '../../../services/adminAiSettings';
import fire from '../../../conf/fire';
import {
    FaRobot, FaCheck, FaTimes, FaSpinner, FaKey, FaSlidersH,
    FaEye, FaEyeSlash, FaServer, FaBolt, FaGlobe, FaBrain,
    FaDesktop, FaDownload
} from 'react-icons/fa';
import { SiNvidia } from 'react-icons/si';

const SUPPORTED_AI_PROVIDERS = ['gemini', 'nvidia', 'openai', 'groq', 'openrouter', 'deepseek'];
const PROVIDER_KEY_FIELDS = { gemini: 'geminiApiKey', nvidia: 'nvidiaApiKey', openai: 'openaiApiKey', groq: 'groqApiKey', openrouter: 'openrouterApiKey', deepseek: 'deepseekApiKey' };
const RECOMMENDED_NVIDIA_MODELS = [
    { id: 'meta/llama-3.1-8b-instruct', name: 'Meta Llama 3.1 8B Instruct (Ultra Fast - 215ms - Verified 200 OK)', badge: 'LLAMA' },
    { id: 'poolside/laguna-xs-2.1', name: 'Poolside Laguna XS 2.1 (Verified 200 OK)', badge: 'LAGUNA' },
    { id: 'meta/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct (High Capacity)', badge: 'LLAMA' },
];

const AiSettings = () => {
    const [aiConfig, setAiConfig] = useState({
        provider: 'gemini',
        enableGemini: true,
        geminiApiKey: '',
        model: 'gemini-2.0-flash',
        enableNvidia: false,
        nvidiaApiKey: '',
        nvidiaModel: 'poolside/laguna-xs-2.1',
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
    const [settingsRevision, setSettingsRevision] = useState(0);
    const [pendingOperation, setPendingOperation] = useState(null);
    const [reauthPassword, setReauthPassword] = useState('');
    const [reauthenticating, setReauthenticating] = useState(false);
    const usesPasswordProvider = fire.auth().currentUser?.providerData?.some(item => item.providerId === 'password') === true;

    // Per-provider inline message state
    const [providerMessages, setProviderMessages] = useState({});
    const [globalMessage, setGlobalMessage] = useState(null);

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
                geminiApiKey: '',
                model: ai.model || 'gemini-2.0-flash',
                enableNvidia: ai.enableNvidia !== undefined ? ai.enableNvidia : hasNvidiaKey,
                nvidiaApiKey: '',
                nvidiaModel: ai.nvidiaModel || 'poolside/laguna-xs-2.1',
                nvidiaBaseUrl: ai.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1',
                enableOpenai: ai.enableOpenai !== undefined ? ai.enableOpenai : hasOpenaiKey,
                openaiApiKey: '',
                openaiModel: ai.openaiModel || 'gpt-4o-mini',
                openaiBaseUrl: ai.openaiBaseUrl || '',
                enableGroq: ai.enableGroq !== undefined ? ai.enableGroq : hasGroqKey,
                groqApiKey: '',
                groqModel: ai.groqModel || 'llama-3.3-70b-versatile',
                enableOpenrouter: ai.enableOpenrouter !== undefined ? ai.enableOpenrouter : hasOpenrouterKey,
                openrouterApiKey: '',
                openrouterModel: ai.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
                enableDeepseek: ai.enableDeepseek !== undefined ? ai.enableDeepseek : hasDeepseekKey,
                deepseekApiKey: '',
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

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
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
        setFetchingNvidiaModels(true);
        setNvidiaModels(RECOMMENDED_NVIDIA_MODELS);
        setCardMessage('nvidia', 'success', `Loaded ${RECOMMENDED_NVIDIA_MODELS.length} curated NVIDIA models. Provider discovery runs server-side only.`);
        setFetchingNvidiaModels(false);
    };

    const saveSettings = async () => {
        if (loadFailed) { setGlobalMessage({ type: 'error', text: 'Reload AI settings successfully before saving to avoid overwriting unknown state.' }); return false; }
        setSaving(true);
        try {
            const result = await saveAdminAiSettings(aiConfig, settingsRevision);
            setSettingsRevision(Number(result.revision) || settingsRevision);
            setConfiguredProviders(result.configuredProviders || {});
            setCredentialSources(result.credentialSources || {});
            setAiConfig(current => ({
                ...current, ...(result.settings || {}),
                geminiApiKey: '', nvidiaApiKey: '', openaiApiKey: '', groqApiKey: '', openrouterApiKey: '', deepseekApiKey: '',
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
            const result = await testAdminAiProvider({
                provider: targetProvider,
                apiKey: key,
                model: aiConfig[modelFields[targetProvider]] || '',
            });
            setPendingOperation(null);
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
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-semibold text-slate-600">NVIDIA Target Model</label>
                                <button
                                    type="button"
                                    onClick={handleFetchNvidiaModels}
                                    disabled={fetchingNvidiaModels}
                                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                                >
                                    {fetchingNvidiaModels ? <FaSpinner className="animate-spin" /> : <FaDownload />}
                                    <span>Fetch Available Models</span>
                                </button>
                            </div>
                            <select
                                name="nvidiaModel"
                                value={aiConfig.nvidiaModel}
                                onChange={handleChange}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            >
                                {nvidiaModels.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-3">
                        <span className="text-[11px] font-mono text-slate-500">https://integrate.api.nvidia.com/v1</span>
                        <button
                            type="button"
                            onClick={() => testSpecificProvider('nvidia')}
                            disabled={testingProvider === 'nvidia'}
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
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Gemini Model Target</label>
                            <select
                                name="model"
                                value={aiConfig.model}
                                onChange={handleChange}
                                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            >
                                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fastest)</option>
                                <option value="gemini-1.5-pro">Gemini 1.5 Pro (High Reasoning)</option>
                                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-3">
                        <span className="text-[11px] font-mono text-slate-500">v1beta.generativelanguage.googleapis.com</span>
                        <button
                            type="button"
                            onClick={() => testSpecificProvider('gemini')}
                            disabled={testingProvider === 'gemini'}
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
                            disabled={testingProvider === 'openai'}
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
                                disabled={testingProvider === 'groq'}
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
                                disabled={testingProvider === 'openrouter'}
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
                                disabled={testingProvider === 'deepseek'}
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

            {/* Save Button */}
            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving || loadFailed}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-black rounded-lg flex items-center space-x-2 shadow-md disabled:opacity-50"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save AI Settings</span>
                </button>
            </div>
        </form>
    );
};

export default AiSettings;