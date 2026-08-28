import React, { useState, useEffect } from 'react';
import { getAdminSystemSettings, saveSystemSettings } from '../../../services/api/platform';
import { FaCode, FaCheck, FaTimes, FaSpinner } from 'react-icons/fa';

const CodeInjectionSettings = () => {
    const [codeConfig, setCodeConfig] = useState({
        headerScripts: '',
        footerScripts: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getAdminSystemSettings().then((settings) => {
            if (settings && settings.codeInjection) {
                setCodeConfig({ ...codeConfig, ...settings.codeInjection });
            }
            setLoading(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCodeConfig((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('codeInjection', codeConfig);
            setStatusMessage({ type: 'success', text: 'Custom script injection settings saved successfully!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading code injection settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && (
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaCode className="text-emerald-600" /> Custom Code & Script Injection
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Inject custom JavaScript code, Google Tag Manager scripts, or live chat widgets (Crisp, Tawk.to, Intercom).
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Header Scripts (Injected inside &lt;head&gt;)
                        </label>
                        <textarea
                            name="headerScripts"
                            rows="5"
                            value={codeConfig.headerScripts}
                            onChange={handleChange}
                            placeholder="<!-- Custom Head Tags, Meta verification, or GTM scripts -->"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-900 text-emerald-400"
                        ></textarea>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Footer Scripts (Injected before &lt;/body&gt;)
                        </label>
                        <textarea
                            name="footerScripts"
                            rows="5"
                            value={codeConfig.footerScripts}
                            onChange={handleChange}
                            placeholder="<!-- Crisp / Tawk.to Live Chat Script or Custom Analytics -->"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-900 text-emerald-400"
                        ></textarea>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Script Injections</span>
                </button>
            </div>
        </form>
    );
};

export default CodeInjectionSettings;
