import React, { Component } from 'react';
import { getSubscriptionStatus, setSubscriptionsData } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe } from 'react-icons/fa';

class SubscriptionSetting extends Component {
    constructor(props) {
        super(props);
        this.state = {
            websiteTitle: '',
            checkedSubscriptions: true,
            checkedOnlyPP: false,
            checkedRazorpayUPI: true,
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            currency: 'INR',
            isSuccessOpen: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleSubscriptionToggleChange = this.handleSubscriptionToggleChange.bind(this);
        this.handlePPCheckedChange = this.handlePPCheckedChange.bind(this);
        this.handleRazorpayToggle = this.handleRazorpayToggle.bind(this);
        this.submitHandler = this.submitHandler.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.applyIndianPreset = this.applyIndianPreset.bind(this);
    }

    handleChange(event, inputName) {
        switch (inputName) {
            case 'monthly':
                this.setState({ monthlyPrice: event.target.value });
                break;
            case 'quartarly':
                this.setState({ quartarlyPrice: event.target.value });
                break;
            case 'yearly':
                this.setState({ yearlyPrice: event.target.value });
                break;
            case 'currency':
                this.setState({ currency: event.target.value });
                break;
            default:
                break;
        }
    }

    handleSubscriptionToggleChange() {
        this.setState((prevState) => ({ checkedSubscriptions: !prevState.checkedSubscriptions }));
    }

    handlePPCheckedChange() {
        this.setState((prevState) => ({ checkedOnlyPP: !prevState.checkedOnlyPP }));
    }

    handleRazorpayToggle() {
        this.setState((prevState) => ({ checkedRazorpayUPI: !prevState.checkedRazorpayUPI }));
    }

    applyIndianPreset() {
        this.setState({
            currency: 'INR',
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            checkedRazorpayUPI: true,
            checkedSubscriptions: true,
        });
    }

    componentDidMount() {
        getSubscriptionStatus().then((data) => {
            if (data) {
                this.setState({
                    checkedSubscriptions: data.state !== undefined ? data.state : true,
                    monthlyPrice: data.monthlyPrice !== undefined ? data.monthlyPrice : 199,
                    quartarlyPrice: data.quartarlyPrice !== undefined ? data.quartarlyPrice : 399,
                    yearlyPrice: data.yearlyPrice !== undefined ? data.yearlyPrice : 499,
                    checkedOnlyPP: data.onlyPP === undefined ? false : data.onlyPP,
                    currency: data.currency || 'INR',
                    checkedRazorpayUPI: data.razorpayUPI !== undefined ? data.razorpayUPI : true,
                });
            }
        });
    }

    submitHandler() {
        setSubscriptionsData(
            this.state.checkedSubscriptions,
            this.state.monthlyPrice,
            this.state.quartarlyPrice,
            this.state.yearlyPrice,
            this.state.checkedOnlyPP,
            this.state.currency,
            this.state.checkedRazorpayUPI
        );
        this.setState({ isSuccessOpen: true });
        setTimeout(() => {
            this.setState({ isSuccessOpen: false });
        }, 3000);
    }

    handleClose() {
        this.setState({ isSuccessOpen: false });
    }

    render() {
        const currencySymbol = this.state.currency === 'INR' ? '₹' : this.state.currency === 'USD' ? '$' : this.state.currency === 'EUR' ? '€' : '£';

        return (
            <div className="space-y-6">
                {/* Success Alert */}
                {this.state.isSuccessOpen && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-emerald-800">Subscription & Indian Pricing settings saved!</p>
                                <p className="text-xs text-emerald-600 mt-1">Your pricing configuration and Razorpay UPI settings have been updated.</p>
                            </div>
                        </div>
                        <button
                            onClick={this.handleClose}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Indian Preset Quick Banner */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                    <div>
                        <h4 className="text-base font-bold flex items-center gap-2">
                            🇮🇳 Quick Preset: Indian Market Pricing (INR ₹)
                        </h4>
                        <p className="text-xs text-emerald-100 mt-0.5">
                            Sets Monthly (₹199), 6 Months (₹399), Annual (₹499) with Razorpay UPI enabled.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.applyIndianPreset}
                        className="px-4 py-2 text-xs font-bold text-slate-900 bg-white rounded-lg hover:bg-emerald-50 transition-colors shadow-sm shrink-0"
                    >
                        Apply Indian Preset
                    </button>
                </div>

                {/* Subscription Toggle */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                <FaCreditCard className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Subscription System</h3>
                                <p className="text-sm text-slate-500">Enable premium subscription tiers & paid downloads</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={this.handleSubscriptionToggleChange}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                                this.state.checkedSubscriptions
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {this.state.checkedSubscriptions ? (
                                <>
                                    <FaToggleOn className="w-5 h-5 text-emerald-600" />
                                    <span>Active</span>
                                </>
                            ) : (
                                <>
                                    <FaToggleOff className="w-5 h-5 text-slate-400" />
                                    <span>Disabled</span>
                                </>
                            )}
                        </button>
                    </div>

                    {this.state.checkedSubscriptions && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="flex items-center space-x-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg p-3">
                                <FaCheck className="w-4 h-4" />
                                <span>Subscription system is active and accepting payments</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Pricing Plans */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                            <FaRupeeSign className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Subscription Tiers & Rates</h3>
                            <p className="text-sm text-slate-500">Configure prices in INR (₹) or international currencies</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Monthly Price */}
                        <div className="relative">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Monthly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.monthlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'monthly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="199"
                                    className={`w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 transition-colors font-semibold ${
                                        !this.state.checkedSubscriptions
                                            ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                            : 'bg-white text-slate-900'
                                    }`}
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Per month rate</p>
                        </div>

                        {/* Quarterly Price */}
                        <div className="relative">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Quarterly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.quartarlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'quartarly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="399"
                                    className={`w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 transition-colors font-semibold ${
                                        !this.state.checkedSubscriptions
                                            ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                            : 'bg-white text-slate-900'
                                    }`}
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Per 3 months rate</p>
                        </div>

                        {/* Yearly Price */}
                        <div className="relative">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Yearly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.yearlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'yearly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="999"
                                    className={`w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 transition-colors font-semibold ${
                                        !this.state.checkedSubscriptions
                                            ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                            : 'bg-white text-slate-900'
                                    }`}
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Per year rate</p>
                        </div>

                        {/* Currency */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Default Currency</label>
                            <select
                                value={this.state.currency}
                                onChange={(event) => this.handleChange(event, 'currency')}
                                disabled={!this.state.checkedSubscriptions}
                                className={`w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold transition-colors ${
                                    !this.state.checkedSubscriptions
                                        ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                                        : 'bg-white text-slate-900'
                                }`}
                            >
                                <option value="INR">🇮🇳 INR (₹ - Indian Rupee)</option>
                                <option value="USD">💵 USD ($ - US Dollar)</option>
                                <option value="EUR">💶 EUR (€ - Euro)</option>
                                <option value="GBP">💷 GBP (£ - British Pound)</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-1">System currency</p>
                        </div>
                    </div>
                </div>

                {/* Payment Gateway Preferences */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                <FaCreditCard className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Accepted Indian & Global Payment Gateways</h3>
                                <p className="text-sm text-slate-500">Enable Razorpay UPI, PhonePe, Paytm, Stripe, or PayPal</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                    <FaRupeeSign className="text-blue-600" /> Razorpay UPI & Cards (India)
                                </p>
                                <p className="text-xs text-slate-500">Google Pay, PhonePe, Paytm, BHIM & RuPay</p>
                            </div>
                            <button
                                type="button"
                                onClick={this.handleRazorpayToggle}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                    this.state.checkedRazorpayUPI ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                                }`}
                            >
                                {this.state.checkedRazorpayUPI ? 'Active' : 'Off'}
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                    <FaPaypal className="text-blue-600" /> PayPal Only Mode
                                </p>
                                <p className="text-xs text-slate-500">Restrict checkout strictly to PayPal</p>
                            </div>
                            <button
                                type="button"
                                onClick={this.handlePPCheckedChange}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                    this.state.checkedOnlyPP ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                                }`}
                            >
                                {this.state.checkedOnlyPP ? 'PayPal Only' : 'All Gateways'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Save Action Button */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center text-xs text-slate-500">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                        <span>Changes take effect immediately for checkout & subscription plans</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            onClick={() => this.submitHandler()}
                            className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center space-x-2 shadow-md"
                        >
                            <FaCheck className="w-4 h-4" />
                            <span>Save Subscription Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default SubscriptionSetting;
