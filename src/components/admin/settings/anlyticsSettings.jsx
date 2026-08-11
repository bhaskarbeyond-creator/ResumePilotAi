import React, { Component } from 'react';
import { editTrackingCode, getWebsiteData } from '../../../firestore/dbOperations';
import { initGA, isGA4Initialized } from '../../../utils/ga4';
import { FaCheck, FaTimes, FaGoogle, FaCode, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';

class AnalyticsSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            trackingCode: '',
            isSuccesShowed: false,
            isValidCode: true,
            isGA4Active: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.saveWebsiteMetaData = this.saveWebsiteMetaData.bind(this);
    }
    componentDidMount() {
        getWebsiteData().then((data) => {
            this.setState({
                trackingCode: data.trackingCode || '',
                isGA4Active: isGA4Initialized(),
            });
        });
    }
    handleChange(event, inputName) {
        switch (inputName) {
            case 'Tracking Code':
                const trackingCode = event.target.value.trim();
                const isValid = !trackingCode || trackingCode.match(/^(G-[A-Z0-9]{10}|UA-[0-9]+-[0-9]+)$/) !== null;
                this.setState({
                    trackingCode: event.target.value,
                    isValidCode: isValid,
                });
                break;
            default:
                break;
        }
    }
    saveWebsiteMetaData() {
        const trackingCode = this.state.trackingCode.trim();

        // Save to Firestore
        editTrackingCode(trackingCode);

        // Initialize GA4 if we have a valid tracking code
        if (trackingCode && this.state.isValidCode) {
            initGA(trackingCode);
            this.setState({ isGA4Active: true });
        }

        this.setState({ isSuccesShowed: true });

        // Auto-hide success message after 3 seconds
        setTimeout(() => {
            this.setState({ isSuccesShowed: false });
        }, 3000);
    }
    render() {
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
                                <p className="text-sm font-medium text-emerald-800">Analytics updated!</p>
                                <p className="text-xs text-emerald-600 mt-1">Google Analytics tracking is now configured.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => this.setState({ isSuccesShowed: false })}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Analytics Status */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                this.state.isGA4Active ? 'bg-emerald-50' : 'bg-slate-50'
                            }`}>
                                <FaGoogle className={`w-5 h-5 ${
                                    this.state.isGA4Active ? 'text-emerald-600' : 'text-slate-400'
                                }`} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Google Analytics</h3>
                                <p className="text-sm text-slate-500">Track website traffic and user behavior</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                            {this.state.isGA4Active ? (
                                <div className="flex items-center space-x-2 text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                                    <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                                    <span className="text-sm font-medium">Active</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                                    <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                                    <span className="text-sm font-medium">Inactive</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Configuration Section */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <FaCode className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Tracking Configuration</h3>
                            <p className="text-sm text-slate-500">Configure your Google Analytics tracking code</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaGoogle className="w-4 h-4 text-slate-600" />
                                    <span>Google Analytics Tracking Code</span>
                                </div>
                            </label>
                            
                            <div className="relative">
                                <textarea
                                    placeholder="Enter your Google Analytics tracking code (e.g., G-XXXXXXXXXX or UA-XXXXXXXX-X)"
                                    value={this.state.trackingCode}
                                    onChange={(event) => this.handleChange(event, 'Tracking Code')}
                                    rows="4"
                                    className={`w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-vertical font-mono text-sm bg-slate-50 text-slate-900 placeholder-slate-400 ${
                                        !this.state.isValidCode ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'focus:ring-blue-500'
                                    }`}
                                />
                                {this.state.trackingCode && this.state.isValidCode && (
                                    <div className="absolute top-2 right-2">
                                        <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                            <FaCheck className="w-3 h-3 text-emerald-600" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Validation Message */}
                            {!this.state.isValidCode && this.state.trackingCode && (
                                <div className="mt-3 flex items-start space-x-2 text-red-600 bg-red-50 rounded-lg p-3">
                                    <FaExclamationTriangle className="w-4 h-4 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium">Invalid tracking code format</p>
                                        <p className="text-xs text-red-500 mt-1">Please enter a valid Google Analytics ID (G-XXXXXXXXXX or UA-XXXXXXXX-X)</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Help Section */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                                <FaInfoCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-blue-900 mb-2">How to find your tracking code:</p>
                                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                                        <li>Sign in to your Google Analytics account</li>
                                        <li>Go to Admin → Data Streams → Select your website</li>
                                        <li>Copy the Measurement ID (G-XXXXXXXXXX) for GA4</li>
                                        <li>Or use Tracking ID (UA-XXXXXXXX-X) for Universal Analytics</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                    <div className="flex items-center text-sm text-slate-500">
                        <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
                        <span>Tracking data appears in your Google Analytics dashboard</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            onClick={() => this.setState({ trackingCode: '', isValidCode: true })}
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={() => this.saveWebsiteMetaData()}
                            disabled={!this.state.isValidCode || !this.state.trackingCode.trim()}
                            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2 ${
                                this.state.isValidCode && this.state.trackingCode.trim()
                                    ? 'text-white bg-slate-800 hover:bg-slate-700'
                                    : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                            }`}
                        >
                            <FaCheck className="w-4 h-4" />
                            <span>Save Configuration</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
export default AnalyticsSettings;
