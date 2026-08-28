import React, { Component } from 'react';
import { getAdminSystemSettings, addSocial } from '../../../services/api/platform';
import { FaCheck, FaTimes, FaFacebook, FaTwitter, FaInstagram, FaPinterest, FaYoutube, FaLink } from 'react-icons/fa';

class SocialSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            facebook: '',
            instagram: '',
            twitter: '',
            pinterest: '',
            youtube: '',
            isSuccesShowed: false,
            // Pristine copy of the last saved values, used by Reset.
            savedLinks: null,
            saving: false,
            saveError: null,
            authoritativeLoaded: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.saveWebsiteMetaData = this.saveWebsiteMetaData.bind(this);
    }
    componentDidMount() {
        this.loadSocialLinks();
    }

    /**
     * Loads the saved links and keeps a pristine copy, so Reset can restore the
     * last saved values rather than merely blanking the form.
     */
    loadSocialLinks() {
        this.setState({ authoritativeLoaded: false, saveError: null });
        return getAdminSystemSettings().then((settings) => {
            if (settings?._settingsStale === true || settings?._settingsSource !== 'remote') {
                throw new Error(settings?._settingsError || 'Authoritative social links are unavailable.');
            }
            const element = settings.social || {};
            const saved = {
                facebook: element.facebook || '',
                instagram: element.instagram || '',
                twitter: element.twitter || '',
                pinterest: element.pinterest || '',
                youtube: element.youtube || '',
            };
            this.setState({ ...saved, savedLinks: saved, authoritativeLoaded: true });
        }).catch((error) => {
            this.setState({ savedLinks: null, authoritativeLoaded: false, saveError: error.message || 'Authoritative social links are unavailable.' });
        });
    }

    /** Discards unsaved edits, restoring the last values loaded from storage. */
    /** True when the form differs from the last saved values. */
    hasUnsavedChanges() {
        const saved = this.state.savedLinks;
        if (!saved) return false;
        return Object.keys(saved).some(key => (this.state[key] || '') !== (saved[key] || ''));
    }

    resetChanges() {
        const saved = this.state.savedLinks;
        if (!saved) return;
        this.setState({ ...saved, isSuccesShowed: false });
    }
    handleChange(event, inputName) {
        switch (inputName) {
            case 'facebook':
                this.setState({ facebook: event.target.value });
                break;
            case 'instagram':
                this.setState({ instagram: event.target.value });
                break;
            case 'twitter':
                this.setState({ twitter: event.target.value });
                break;
            case 'pinterest':
                this.setState({ pinterest: event.target.value });
                break;
            case 'youtube':
                this.setState({ youtube: event.target.value });
                break;
            default:
                break;
        }
    }
    async saveWebsiteMetaData() {
        // Previously this flagged success *before* awaiting the write and
        // ignored the result, so a failed save still told the operator it had
        // worked. Now the outcome decides what is shown.
        if (this.state.saving) return;
        if (!this.state.authoritativeLoaded) {
            this.setState({ saveError: 'Reload authoritative social links before saving.' });
            return;
        }
        this.setState({ saving: true, saveError: null, isSuccesShowed: false });
        try {
            await addSocial(
                this.state.facebook,
                this.state.twitter,
                this.state.instagram,
                this.state.youtube,
                this.state.pinterest,
            );
            const saved = {
                facebook: this.state.facebook,
                instagram: this.state.instagram,
                twitter: this.state.twitter,
                pinterest: this.state.pinterest,
                youtube: this.state.youtube,
            };
            // Refresh the pristine copy so Reset compares against what is now
            // actually stored.
            this.setState({ isSuccesShowed: true, savedLinks: saved });
            setTimeout(() => this.setState({ isSuccesShowed: false }), 3000);
        } catch (error) {
            this.setState({ saveError: error?.message || 'Social links could not be saved. Please retry.' });
        } finally {
            this.setState({ saving: false });
        }
    }
    render() {
        const socialPlatforms = [
            {
                key: 'facebook',
                label: 'Facebook',
                icon: FaFacebook,
                color: 'text-blue-600',
                bgColor: 'bg-blue-50',
                borderColor: 'border-blue-200',
                focusColor: 'focus:ring-blue-500',
                placeholder: 'https://facebook.com/yourpage'
            },
            {
                key: 'twitter',
                label: 'Twitter / X',
                icon: FaTwitter,
                color: 'text-sky-500',
                bgColor: 'bg-sky-50',
                borderColor: 'border-sky-200',
                focusColor: 'focus:ring-sky-500',
                placeholder: 'https://twitter.com/yourhandle'
            },
            {
                key: 'instagram',
                label: 'Instagram',
                icon: FaInstagram,
                color: 'text-pink-500',
                bgColor: 'bg-pink-50',
                borderColor: 'border-pink-200',
                focusColor: 'focus:ring-pink-500',
                placeholder: 'https://instagram.com/yourprofile'
            },
            {
                key: 'pinterest',
                label: 'Pinterest',
                icon: FaPinterest,
                color: 'text-red-600',
                bgColor: 'bg-red-50',
                borderColor: 'border-red-200',
                focusColor: 'focus:ring-red-500',
                placeholder: 'https://pinterest.com/yourprofile'
            },
            {
                key: 'youtube',
                label: 'YouTube',
                icon: FaYoutube,
                color: 'text-red-600',
                bgColor: 'bg-red-50',
                borderColor: 'border-red-200',
                focusColor: 'focus:ring-red-600',
                placeholder: 'https://youtube.com/yourchannel'
            }
        ];

        return (
            <div className="space-y-6">
                {/* Success Alert */}
                {this.state.isSuccesShowed && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-emerald-800">Social links updated!</p>
                                <p className="text-xs text-emerald-600 mt-1">Your social media links have been saved successfully.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => this.setState({ isSuccesShowed: false })}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Social Platforms */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {socialPlatforms.map((platform) => {
                        const Icon = platform.icon;
                        return (
                            <div key={platform.key} className="bg-white border border-slate-200 rounded-lg p-6">
                                <div className="flex items-center space-x-3 mb-4">
                                    <div className={`w-10 h-10 ${platform.bgColor} rounded-lg flex items-center justify-center`}>
                                        <Icon className={`w-5 h-5 ${platform.color}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900">{platform.label}</h3>
                                        <p className="text-sm text-slate-500">Connect your {platform.label.toLowerCase()} profile</p>
                                    </div>
                                </div>

                                <div className="relative">
                                    <FaLink className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="url"
                                        placeholder={platform.placeholder}
                                        value={this.state[platform.key] || ''}
                                        onChange={(event) => this.handleChange(event, platform.key)}
                                        className={`w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 ${platform.focusColor} focus:border-transparent bg-white text-slate-900 placeholder-slate-400`}
                                    />
                                </div>

                                {this.state[platform.key] && (
                                    <div className="mt-3 flex items-center space-x-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-2">
                                        <FaCheck className="w-3 h-3" />
                                        <span>Link configured</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Platform Stats */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                            <FaLink className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Configuration Summary</h3>
                            <p className="text-sm text-slate-500">Overview of your social media presence</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {socialPlatforms.map((platform) => {
                            const Icon = platform.icon;
                            const isConfigured = !!this.state[platform.key];
                            return (
                                <div key={platform.key} className={`p-3 rounded-lg border ${
                                    isConfigured
                                        ? `${platform.bgColor} ${platform.borderColor}`
                                        : 'bg-slate-100 border-slate-200'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <Icon className={`w-4 h-4 ${
                                            isConfigured ? platform.color : 'text-slate-400'
                                        }`} />
                                        {isConfigured ? (
                                            <FaCheck className="w-3 h-3 text-emerald-600" />
                                        ) : (
                                            <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                                        )}
                                    </div>
                                    <p className={`text-xs mt-2 font-medium ${
                                        isConfigured ? platform.color : 'text-slate-500'
                                    }`}>
                                        {platform.label}
                                    </p>
                                    <p className={`text-xs ${
                                        isConfigured ? 'text-emerald-600' : 'text-slate-400'
                                    }`}>
                                        {isConfigured ? 'Connected' : 'Not set'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {this.state.saveError && (
                    <div role="alert" data-testid="social-save-error" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {this.state.saveError}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                    <div className="flex items-center text-sm text-slate-500">
                        <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
                        <span>Links appear in your website footer</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            onClick={() => this.resetChanges()}
                            disabled={!this.state.savedLinks || !this.hasUnsavedChanges()}
                            title={this.hasUnsavedChanges() ? 'Discard unsaved changes' : 'No unsaved changes'}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={() => this.saveWebsiteMetaData()}
                            disabled={this.state.saving || !this.state.authoritativeLoaded}
                            className="px-6 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                        >
                            <FaCheck className="w-4 h-4" />
                            <span>{this.state.saving ? 'Saving…' : 'Save Changes'}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
export default SocialSettings;
