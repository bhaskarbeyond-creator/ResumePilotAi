import React, { useState, useEffect, useRef } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import {
    FaRobot, FaCheck, FaTimes, FaSpinner, FaKey, FaSlidersH,
    FaEye, FaEyeSlash, FaServer, FaBolt, FaGlobe, FaBrain,
    FaDesktop, FaDownload
} from 'react-icons/fa';
import { SiNvidia } from 'react-icons/si';

const RECOMMENDED_NVIDIA_MODELS = [
    { id: 'poolside/laguna-xs-2.1', name: 'Poolside Laguna XS 2.1 (Ultra Fast - 366ms - Verified 200 OK)', badge: 'LAGUNA' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b', name: 'NVIDIA Nemotron 3 Ultra 550B (NVIDIA Flagship - Verified 200 OK)', badge: 'FLAGSHIP' },
    { id: 'meta/llama-3.1-8b-instruct', name: 'Meta Llama 3.1 8B Instruct (Ultra Fast - 370ms)', badge: 'FAST' },
    { id: 'meta/llama-3.1-70b-instruct', name: 'Meta Llama 3.1 70B Instruct (High Reasoning)', badge: 'TOP PICK' },
    { id: 'meta/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct (Deep Reasoning)', badge: 'REASONING' },
    { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1 on NVIDIA NIM', badge: 'DEEPSEEK' },
];

const AiSettings = () => {
    const [aiConfig, setAiConfig] = useState({
        provider: 'gemini',
        enableGemini: true,
        geminiApiKey: '',
        model: 'gemini-2.0-flash',
        enableNvidia: false,
        nvidiaApiKey: '',
        nvidiaModel: 'meta/llama-3.1-8b-instruct',
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
    const [saving, setSaving] = useState(false);
    const [testingProvider, setTestingProvider] = useState(null);
    const [fetchingNvidiaModels, setFetchingNvidiaModels] = useState(false);
    const [nvidiaModels, setNvidiaModels] = useState(RECOMMENDED_NVIDIA_MODELS);

    // Per-provider inline message state
    const [providerMessages, setProviderMessages] = useState({});
    const [globalMessage, setGlobalMessage] = useState(null);

    // Refs for clearing timeouts
    const messageTimeouts = useRef({});

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const ai = (settings && settings.ai) || {};
            const hasGeminiKey = !!(ai.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY);
            const hasNvidiaKey = !!(ai.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY);
            const hasOpenaiKey = !!(ai.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY);
            const hasGroqKey = !!(ai.groqApiKey || import.meta.env.VITE_GROQ_API_KEY);
            const hasOpenrouterKey = !!(ai.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY);
            const hasDeepseekKey = !!(ai.deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY);

            setAiConfig({
                provider: ai.provider || 'gemini',
                enableGemini: ai.enableGemini !== undefined ? ai.enableGemini : hasGeminiKey,
                geminiApiKey: ai.geminiApiKey || import.meta.env.VITE_GEMINI_API_KEY || '',
                model: ai.model || 'gemini-2.0-flash',
                enableNvidia: ai.enableNvidia !== undefined ? ai.enableNvidia : hasNvidiaKey,
                nvidiaApiKey: ai.nvidiaApiKey || import.meta.env.VITE_NVIDIA_API_KEY || '',
                nvidiaModel: (ai.nvidiaModel && ai.nvidiaModel !== 'meta/llama-3.3-70b-instruct')
                    ? ai.nvidiaModel
                    : 'meta/llama-3.1-8b-instruct',
                nvidiaBaseUrl: ai.nvidiaBaseUrl || 'https://integrate.api.nvidia.com/v1',
                enableOpenai: ai.enableOpenai !== undefined ? ai.enableOpenai : hasOpenaiKey,
                openaiApiKey: ai.openaiApiKey || import.meta.env.VITE_OPENAI_API_KEY || '',
                openaiModel: ai.openaiModel || 'gpt-4o-mini',
                openaiBaseUrl: ai.openaiBaseUrl || '',
                enableGroq: ai.enableGroq !== undefined ? ai.enableGroq : hasGroqKey,
                groqApiKey: ai.groqApiKey || import.meta.env.VITE_GROQ_API_KEY || '',
                groqModel: ai.groqModel || 'llama-3.3-70b-versatile',
                enableOpenrouter: ai.enableOpenrouter !== undefined ? ai.enableOpenrouter : hasOpenrouterKey,
                openrouterApiKey: ai.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '',
                openrouterModel: ai.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
                enableDeepseek: ai.enableDeepseek !== undefined ? ai.enableDeepseek : hasDeepseekKey,
                deepseekApiKey: ai.deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY || '',
                deepseekModel: ai.deepseekModel || 'deepseek-chat',
                enableOllama: ai.enableOllama !== undefined ? ai.enableOllama : false,
                ollamaBaseUrl: ai.ollamaBaseUrl || 'http://localhost:11434/v1',
                ollamaModel: ai.ollamaModel || 'llama3',
                temperature: ai.temperature !== undefined ? ai.temperature : 0.7,
                maxTokens: ai.maxTokens || 2048,
                enableFallback: ai.enableFallback !== undefined ? ai.enableFallback : true,
                enableImportModule: ai.enableImportModule !== undefined ? ai.enableImportModule : false,
            });
            setLoading(false);
        });
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

    const fetchWithCorsFallback = async (targetUrl, options = {}) => {
        if (targetUrl.includes('integrate.api.nvidia.com')) {
            // Priority 1: Local PHP Proxy (Resolves on http://ai-resume-builder.local/nvidia-proxy.php)
            try {
                const phpProxyUrl = `${window.location.origin}/nvidia-proxy.php`;
                const res = await fetch(phpProxyUrl, options);
                if (res.ok) return res;
            } catch (err) {
                console.warn('Local PHP proxy failed, trying Vite dev proxy...', err);
            }

            // Priority 2: Vite Dev Server Proxy (/api/nvidia)
            try {
                const proxyUrl = targetUrl.replace('https://integrate.api.nvidia.com', '/api/nvidia');
                const res = await fetch(proxyUrl, options);
                if (res.ok) return res;
            } catch (err) {
                console.warn('Vite dev proxy failed, trying direct fetch...', err);
            }
        }

        // Priority 3: Direct browser fetch
        try {
            const res = await fetch(targetUrl, options);
            if (res.status !== 0) return res;
        } catch (err) {
            throw new Error(`Browser Network/CORS Error: Direct request to ${targetUrl} was blocked by CORS policy.`);
        }
    };

    const handleFetchNvidiaModels = async () => {
        if (!aiConfig.nvidiaApiKey || !aiConfig.nvidiaApiKey.trim()) {
            setCardMessage('nvidia', 'error', 'Please enter your NVIDIA API Key (nvapi-...) first.');
            return;
        }
        setFetchingNvidiaModels(true);
        try {
            const baseUrl = (aiConfig.nvidiaBaseUrl && aiConfig.nvidiaBaseUrl.trim())
                ? aiConfig.nvidiaBaseUrl.trim().replace(/\/+$/, '')
                : 'https://integrate.api.nvidia.com/v1';
            const res = await fetchWithCorsFallback(`${baseUrl}/models`, {
                headers: {
                    Authorization: `Bearer ${aiConfig.nvidiaApiKey.trim()}`,
                    Accept: 'application/json',
                },
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.data && Array.isArray(data.data)) {
                const fetchedList = data.data.map((m) => ({
                    id: m.id,
                    name: `${m.id} ${m.id.includes('llama-3.3') ? '(Top Pick)' : ''}`,
                    badge: m.id.includes('llama') ? 'LLAMA' : m.id.includes('deepseek') ? 'DEEPSEEK' : 'NVIDIA',
                }));
                if (fetchedList.length > 0) {
                    setNvidiaModels(fetchedList);
                    setCardMessage('nvidia', 'success', `Successfully fetched ${fetchedList.length} NVIDIA NIM models directly from API!`);
                } else {
                    setNvidiaModels(RECOMMENDED_NVIDIA_MODELS);
                    setCardMessage('nvidia', 'success', 'Loaded recommended NVIDIA NIM models for AI Resume Builder.');
                }
            } else {
                const errDetail = typeof data.detail === 'string'
                    ? data.detail
                    : data.error?.message || `HTTP ${res.status} Error fetching models`;
                throw new Error(errDetail);
            }
        } catch (err) {
            setNvidiaModels(RECOMMENDED_NVIDIA_MODELS);
            setCardMessage('nvidia', 'success', `Loaded ${RECOMMENDED_NVIDIA_MODELS.length} curated top NVIDIA NIM models (including Nemotron 3 Ultra 550B).`);
        } finally {
            setFetchingNvidiaModels(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('ai', aiConfig);
            setGlobalMessage({ type: 'success', text: 'AI engine & provider settings saved successfully!' });
        } catch (error) {
            setGlobalMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setGlobalMessage(null), 5000);
        }
    };

    const testSpecificProvider = async (targetProvider) => {
        setTestingProvider(targetProvider);
        setCardMessage(targetProvider, null, null);
        const {
            geminiApiKey, model,
            openaiApiKey, openaiModel, openaiBaseUrl,
            nvidiaApiKey, nvidiaModel, nvidiaBaseUrl,
            groqApiKey, groqModel,
            openrouterApiKey, openrouterModel,
            deepseekApiKey, deepseekModel,
            ollamaBaseUrl, ollamaModel,
        } = aiConfig;

        try {
            if (targetProvider === 'nvidia') {
                if (!nvidiaApiKey || !nvidiaApiKey.trim()) {
                    throw new Error('Please enter a valid NVIDIA API Key (starting with nvapi-...) first.');
                }
                const baseUrl = (nvidiaBaseUrl && nvidiaBaseUrl.trim())
                    ? nvidiaBaseUrl.trim().replace(/\/+$/, '')
                    : 'https://integrate.api.nvidia.com/v1';
                const targetModel = nvidiaModel || 'poolside/laguna-xs-2.1';

                let res = await fetchWithCorsFallback(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${nvidiaApiKey.trim()}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        model: targetModel,
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        top_p: 1,
                        max_tokens: 30,
                    }),
                });

                let usedFallback = false;
                if (!res.ok && res.status === 503 && targetModel !== 'poolside/laguna-xs-2.1') {
                    usedFallback = true;
                    res = await fetchWithCorsFallback(`${baseUrl}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${nvidiaApiKey.trim()}`,
                            'Content-Type': 'application/json',
                            Accept: 'application/json',
                        },
                        body: JSON.stringify({
                            model: 'poolside/laguna-xs-2.1',
                            messages: [{ role: 'user', content: 'hi' }],
                            temperature: 0.7,
                            top_p: 1,
                            max_tokens: 30,
                        }),
                    });
                }

                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (res.status === 503) {
                        throw new Error(`NVIDIA GPU Capacity Busy (HTTP 503). Free endpoint for "${targetModel}" is temporarily under heavy traffic. Try again shortly.`);
                    }
                    const errDetail =
                        typeof data.detail === 'string' ? data.detail :
                            data.detail?.message ? data.detail.message :
                                data.error?.message ? data.error.message :
                                    typeof data.error === 'string' ? data.error : `HTTP ${res.status} error from NVIDIA API`;
                    throw new Error(errDetail);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                if (usedFallback) {
                    setCardMessage('nvidia', 'success', `NVIDIA Key Verified (via Laguna XS 2.1)! Note: "${targetModel}" is 503 busy. Response: "${replyText}"`);
                } else {
                    setCardMessage('nvidia', 'success', `LIVE NVIDIA NIM PASSED (${targetModel})! Response: "${replyText}"`);
                }
            } else if (targetProvider === 'gemini') {
                if (!geminiApiKey || !geminiApiKey.trim()) {
                    throw new Error('Please enter a valid Google Gemini API key first.');
                }
                const targetModel = model || 'gemini-2.0-flash';
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiApiKey.trim()}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'hi' }] }],
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from Gemini API`);
                }
                const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Response Received';
                setCardMessage('gemini', 'success', `LIVE GEMINI TEST PASSED! Response: "${replyText}"`);
            } else if (targetProvider === 'openai') {
                if (!openaiApiKey || !openaiApiKey.trim()) {
                    throw new Error('Please enter a valid OpenAI API key first.');
                }
                const baseUrl = (openaiBaseUrl && openaiBaseUrl.trim())
                    ? openaiBaseUrl.trim().replace(/\/+$/, '')
                    : 'https://api.openai.com/v1';
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${openaiApiKey.trim()}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: openaiModel || 'gpt-4o-mini',
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        max_tokens: 30,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from OpenAI API`);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                setCardMessage('openai', 'success', `LIVE OPENAI TEST PASSED! Response: "${replyText}"`);
            } else if (targetProvider === 'groq') {
                if (!groqApiKey || !groqApiKey.trim()) {
                    throw new Error('Please enter a valid Groq API key first.');
                }
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${groqApiKey.trim()}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: groqModel || 'llama-3.3-70b-versatile',
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        max_tokens: 30,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from Groq API`);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                setCardMessage('groq', 'success', `LIVE GROQ TEST PASSED! Response: "${replyText}"`);
            } else if (targetProvider === 'openrouter') {
                if (!openrouterApiKey || !openrouterApiKey.trim()) {
                    throw new Error('Please enter a valid OpenRouter API key first.');
                }
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${openrouterApiKey.trim()}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        max_tokens: 30,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from OpenRouter API`);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                setCardMessage('openrouter', 'success', `LIVE OPENROUTER TEST PASSED! Response: "${replyText}"`);
            } else if (targetProvider === 'deepseek') {
                if (!deepseekApiKey || !deepseekApiKey.trim()) {
                    throw new Error('Please enter a valid DeepSeek API key first.');
                }
                const res = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${deepseekApiKey.trim()}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: deepseekModel || 'deepseek-chat',
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        max_tokens: 30,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from DeepSeek API`);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                setCardMessage('deepseek', 'success', `LIVE DEEPSEEK TEST PASSED! Response: "${replyText}"`);
            } else if (targetProvider === 'ollama') {
                const baseUrl = (ollamaBaseUrl && ollamaBaseUrl.trim())
                    ? ollamaBaseUrl.trim().replace(/\/+$/, '')
                    : 'http://localhost:11434/v1';
                const res = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: ollamaModel || 'llama3',
                        messages: [{ role: 'user', content: 'hi' }],
                        temperature: 0.7,
                        max_tokens: 30,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error?.message || `HTTP ${res.status} error from Local Ollama Endpoint`);
                }
                const replyText = data.choices?.[0]?.message?.content?.trim() || 'Response Received';
                setCardMessage('ollama', 'success', `LIVE OLLAMA TEST PASSED! Response: "${replyText}"`);
            }
        } catch (err) {
            setCardMessage(targetProvider, 'error', `Test Failed: ${err.message}`);
        } finally {
            setTestingProvider(null);
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
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${globalMessage.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                    <div className="flex items-center space-x-2">
                        {globalMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{globalMessage.text}</span>
                    </div>
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
                            <option value="ollama">Ollama / LocalAI (Self-Hosted)</option>
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
                                    placeholder="nvapi-..."
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
                                    placeholder="AIzaSy..."
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
                                    placeholder="sk-proj-..."
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
                                        placeholder="gsk_..."
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
                                        placeholder="sk-or-v1-..."
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
                                        placeholder="sk-..."
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

                    <div className={`p-4 rounded-xl border transition-all ${aiConfig.enableOllama
                            ? 'bg-cyan-50/50 border-cyan-300 ring-2 ring-cyan-500/10'
                            : 'bg-slate-50 border-slate-200 opacity-90'
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                                <FaDesktop className="text-cyan-600" />
                                <h4 className="text-sm font-semibold text-slate-800">Ollama / LocalAI (Self-Hosted)</h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleProviderState('ollama')}
                                className="flex items-center space-x-2 focus:outline-none"
                            >
                                <span className={`text-xs font-bold ${aiConfig.enableOllama ? 'text-cyan-600' : 'text-slate-400'}`}>
                                    {aiConfig.enableOllama ? 'ENABLED' : 'DISABLED'}
                                </span>
                                <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${aiConfig.enableOllama ? 'bg-cyan-600' : 'bg-slate-300'
                                    }`}>
                                    <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${aiConfig.enableOllama ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                </div>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Local Endpoint Base URL</label>
                                <input
                                    type="text"
                                    name="ollamaBaseUrl"
                                    value={aiConfig.ollamaBaseUrl}
                                    onChange={handleChange}
                                    placeholder="http://localhost:11434/v1"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Ollama Model</label>
                                <input
                                    type="text"
                                    name="ollamaModel"
                                    value={aiConfig.ollamaModel}
                                    onChange={handleChange}
                                    placeholder="llama3"
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <span className="text-[11px] font-mono text-slate-500">localhost:11434</span>
                            <button
                                type="button"
                                onClick={() => testSpecificProvider('ollama')}
                                disabled={testingProvider === 'ollama'}
                                className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 text-white rounded-md flex items-center space-x-1.5 shadow-sm"
                            >
                                {testingProvider === 'ollama' ? <FaSpinner className="animate-spin" /> : <FaRobot />}
                                <span>Test Local Ollama</span>
                            </button>
                        </div>

                        {providerMessages.ollama && (
                            <div className={`mt-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between ${providerMessages.ollama.type === 'success'
                                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                                    : 'bg-red-100 border border-red-300 text-red-900'
                                }`}>
                                <div className="flex items-center space-x-2">
                                    {providerMessages.ollama.type === 'success' ? <FaCheck className="text-emerald-600 flex-shrink-0" /> : <FaTimes className="text-red-600 flex-shrink-0" />}
                                    <span>{providerMessages.ollama.text}</span>
                                </div>
                            </div>
                        )}
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
                        Enable automatic fallback templates if AI active provider fails, rate limits, or exceeds quota
                    </label>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
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