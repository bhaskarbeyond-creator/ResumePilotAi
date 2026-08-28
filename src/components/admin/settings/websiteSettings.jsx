import React, { Component } from 'react';
import { getWebsiteData, settWebsiteData } from '../../../services/api/platform';
import { FaCheck, FaTimes, FaGlobe, FaTag, FaLanguage, FaFileAlt, FaToggleOn, FaToggleOff, FaCheckCircle, FaBan } from 'react-icons/fa';

const ALL_LANGUAGES = [
    { code: 'English', iso: 'en', label: 'English', flag: '🇺🇸', native: 'English' },
    { code: 'Hindi', iso: 'hi', label: 'Hindi', flag: '🇮🇳', native: 'हिंदी' },
    { code: 'Spanish', iso: 'es', label: 'Spanish', flag: '🇪🇸', native: 'Español' },
    { code: 'French', iso: 'fr', label: 'French', flag: '🇫🇷', native: 'Français' },
    { code: 'German', iso: 'de', label: 'German', flag: '🇩🇪', native: 'Deutsch' },
    { code: 'Italian', iso: 'it', label: 'Italian', flag: '🇮🇹', native: 'Italiano' },
    { code: 'Portuguese', iso: 'pt', label: 'Portuguese', flag: '🇵🇹', native: 'Português' },
    { code: 'Russian', iso: 'ru', label: 'Russian', flag: '🇷🇺', native: 'Русский' },
    { code: 'Dutch', iso: 'nl', label: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
    { code: 'Polish', iso: 'pl', label: 'Polish', flag: '🇵🇱', native: 'Polski' },
    { code: 'Swedish', iso: 'se', label: 'Swedish', flag: '🇸🇪', native: 'Svenska' },
    { code: 'Norwegian', iso: 'no', label: 'Norwegian', flag: '🇳🇴', native: 'Norsk' },
    { code: 'Danish', iso: 'dk', label: 'Danish', flag: '🇩🇰', native: 'Dansk' },
    { code: 'Icelandic', iso: 'is', label: 'Icelandic', flag: '🇮🇸', native: 'Íslenska' },
    { code: 'Greek', iso: 'gk', label: 'Greek', flag: '🇬🇷', native: 'Ελληνικά' },
    { code: 'Romanian', iso: 'ro', label: 'Romanian', flag: '🇷🇴', native: 'Română' },
];

class WebsiteSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            websiteTitle: 'ResumePilot AI — Resume Builder & CV Maker',
            websiteDescription: 'Create and edit resumes, cover letters, and professional portfolios with guided tools, configurable layouts, previews, and export options.',
            websiteKeywords: 'ResumePilot AI, resume builder, CV maker, cover letter builder, portfolio builder, resume templates',
            defaultLan: 'English',
            disabledLanguages: [],
            isSuccesShowed: false, saving: false, error: '', authoritativeLoaded: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.saveWebsiteMetaData = this.saveWebsiteMetaData.bind(this);
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        this.toggleLanguageAccess = this.toggleLanguageAccess.bind(this);
        this.enableAllLanguages = this.enableAllLanguages.bind(this);
        this.applyStudentPreset = this.applyStudentPreset.bind(this);
    }

    componentDidMount() {
        getWebsiteData().then((data) => {
            if (!data || data._settingsStale === true || data._settingsSource !== 'remote') {
                this.setState({
                    authoritativeLoaded: false,
                    error: data?._settingsError || 'Authoritative website metadata is unavailable. Reload after MariaDB recovery.',
                });
                return;
            }
            this.setState({
                websiteTitle: data.title || '',
                websiteDescription: data.description || '',
                websiteKeywords: data.keywords || '',
                defaultLan: data.language || 'English',
                disabledLanguages: data.disabledLanguages || [],
                authoritativeLoaded: true,
                error: '',
            });
        }).catch((error) => this.setState({
            authoritativeLoaded: false,
            error: error.message || 'Authoritative website metadata is unavailable.',
        }));
    }

    applyStudentPreset() {
        this.setState({
            websiteTitle: 'ResumePilot AI — Resume Builder & CV Maker',
            websiteDescription: 'Create and edit resumes, cover letters, and professional portfolios with guided tools, configurable layouts, previews, and export options.',
            websiteKeywords: 'ResumePilot AI, resume builder, CV maker, cover letter builder, portfolio builder, resume templates',
            defaultLan: 'English',
            disabledLanguages: [],
        });
    }

    handleChange(event, inputName) {
        this.setState({ [inputName]: event.target.value });
    }

    handleLanguageChange(event) {
        this.setState({ defaultLan: event.target.value });
    }

    toggleLanguageAccess(langCode) {
        this.setState((prev) => {
            const targetLang = ALL_LANGUAGES.find((l) => l.code === langCode || l.iso === langCode);
            const targetCode = targetLang ? targetLang.code : langCode;
            const targetIso = targetLang ? targetLang.iso : langCode.toLowerCase();

            const isDisabled = prev.disabledLanguages.includes(targetCode) || prev.disabledLanguages.includes(targetIso);
            const updated = isDisabled
                ? prev.disabledLanguages.filter((l) => l !== targetCode && l !== targetIso)
                : [...prev.disabledLanguages, targetCode, targetIso];

            let nextDefault = prev.defaultLan;
            if (!isDisabled && prev.defaultLan === targetCode) {
                const available = ALL_LANGUAGES.find((l) => !updated.includes(l.code) && !updated.includes(l.iso));
                if (available) nextDefault = available.code;
            }

            return { disabledLanguages: updated, defaultLan: nextDefault };
        });
    }

    enableAllLanguages() {
        this.setState({ disabledLanguages: [] });
    }

    async saveWebsiteMetaData() {
        if (!this.state.authoritativeLoaded) {
            this.setState({ error: 'Reload authoritative website metadata before saving.' });
            return;
        }
        const title = this.state.websiteTitle || '';
        const description = this.state.websiteDescription || '';
        const keywords = this.state.websiteKeywords || '';
        const language = this.state.defaultLan || 'English';
        const disabledLanguages = this.state.disabledLanguages || [];

        this.setState({ saving: true, error: '' });
        try {
            await settWebsiteData(title, description, keywords, language, disabledLanguages);
            window.dispatchEvent(new CustomEvent('websiteMetadataUpdated', { detail: { title, description, keywords, language, disabledLanguages } }));
            this.setState({ isSuccesShowed: true });
        } catch (error) { this.setState({ error: error.message || 'Website metadata could not be saved.' }); }
        finally { this.setState({ saving: false }); }
    }

    render() {
        const enabledLanguagesList = ALL_LANGUAGES.filter((l) => !this.state.disabledLanguages.includes(l.code));

        return (
            <div className="space-y-6">
                {this.state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{this.state.error}</div>}
                {/* Success Alert */}
                {this.state.isSuccesShowed && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-emerald-800">ResumePilot AI Metadata Saved!</p>
                                <p className="text-xs text-emerald-600 mt-1">Language access controls and SEO metadata updated successfully.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => this.setState({ isSuccesShowed: false })}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Preset Banner */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl shrink-0">
                            ✈️
                        </div>
                        <div>
                            <h4 className="text-base font-bold flex items-center gap-2">
                                ResumePilot AI — ATS Resume Builder & CV Maker
                            </h4>
                            <p className="text-xs text-blue-100">
                                Pre-populated for college freshers, university graduates, and Indian job market ATS standards.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={this.applyStudentPreset}
                        className="px-4 py-2 text-xs font-bold text-slate-900 bg-white rounded-lg hover:bg-blue-50 transition-colors shadow-sm shrink-0"
                    >
                        Load ResumePilot AI Preset
                    </button>
                </div>

                {/* Main Settings & Title Form */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    {/* Website Title */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                                <FaGlobe className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">Website Main Title</label>
                                <p className="text-[11px] text-slate-500">Appears in Google search results and browser tab titles</p>
                            </div>
                        </div>
                        <input
                            type="text"
                            placeholder="ResumePilot AI — Resume Builder & CV Maker"
                            value={this.state.websiteTitle}
                            onChange={(event) => this.handleChange(event, 'websiteTitle')}
                            className="w-full px-4 py-2.5 text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white text-slate-900"
                        />
                    </div>

                    {/* Website Description */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                                <FaFileAlt className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">Meta SEO Description</label>
                                <p className="text-[11px] text-slate-500">Search engine summary explaining how AI helps students build resumes</p>
                            </div>
                        </div>
                        <textarea
                            placeholder="Create ATS-friendly resumes for students with ResumePilot AI..."
                            value={this.state.websiteDescription}
                            onChange={(event) => this.handleChange(event, 'websiteDescription')}
                            rows="3"
                            className="w-full px-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white text-slate-900 resize-none leading-relaxed"
                        />
                    </div>

                    {/* Keywords */}
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                                <FaTag className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">SEO Keywords</label>
                                <p className="text-[11px] text-slate-500">Targeted keywords for Google indexing</p>
                            </div>
                        </div>
                        <input
                            type="text"
                            placeholder="ResumePilot AI, ATS Resume Builder..."
                            value={this.state.websiteKeywords}
                            onChange={(event) => this.handleChange(event, 'websiteKeywords')}
                            className="w-full px-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white text-slate-900"
                        />
                    </div>

                    {/* Default Primary Language */}
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                                <FaLanguage className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">Default Primary Language</label>
                                <p className="text-[11px] text-slate-500">Primary locale loaded for new visitors</p>
                            </div>
                        </div>
                        <select
                            value={this.state.defaultLan}
                            onChange={(event) => this.handleLanguageChange(event)}
                            className="w-full px-4 py-2.5 text-xs font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white text-slate-900"
                        >
                            {enabledLanguagesList.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.flag} {lang.label} ({lang.native})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Multi-Language Enable / Disable Access Matrix Grid */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <FaLanguage className="text-indigo-600" /> Platform Multi-Language Access Matrix
                            </h3>
                            <p className="text-xs text-slate-500">
                                Toggle language availability on the header language selector and landing pages.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={this.enableAllLanguages}
                            className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                            Enable All Languages
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {ALL_LANGUAGES.map((lang) => {
                            const isDisabled = this.state.disabledLanguages.includes(lang.code) || this.state.disabledLanguages.includes(lang.iso);
                            const isDefault = this.state.defaultLan === lang.code;

                            return (
                                <div
                                    key={lang.code}
                                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                                        isDisabled
                                            ? 'bg-red-50/40 border-red-200 opacity-60'
                                            : isDefault
                                            ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-center space-x-3">
                                        <span className="text-2xl">{lang.flag}</span>
                                        <div>
                                            <div className="flex items-center space-x-1.5">
                                                <span className="text-xs font-bold text-slate-900">{lang.label}</span>
                                                {isDefault && (
                                                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold text-blue-800 bg-blue-100 rounded">
                                                        DEFAULT
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-medium">{lang.native}</p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => this.toggleLanguageAccess(lang.code)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition-all ${
                                            isDisabled
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                        }`}
                                    >
                                        {isDisabled ? (
                                            <>
                                                <FaBan className="w-2.5 h-2.5" />
                                                <span>Disabled</span>
                                            </>
                                        ) : (
                                            <>
                                                <FaCheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                                                <span>Enabled</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center text-xs text-slate-500">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                        <span>Language settings take effect immediately across all client interfaces</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            onClick={() => this.saveWebsiteMetaData()}
                            disabled={this.state.saving || !this.state.authoritativeLoaded}
                            className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center space-x-2 shadow-md"
                        >
                            <FaCheck className="w-4 h-4" />
                            <span>Save Language & Brand Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
export default WebsiteSettings;
