import React, { Component } from 'react';
import { getSubscriptionStatus, setSubscriptionsData } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe, FaFlask, FaShieldAlt } from 'react-icons/fa';

class SubscriptionSetting extends Component {
    constructor(props) {
        super(props);
        this.state = {
            websiteTitle: '',
            checkedSubscriptions: true,
            checkedOnlyPP: false,
            checkedRazorpayUPI: true,
            checkedStripe: true,
            checkedPayPal: true,
            checkedRazorpay: true,
            sandboxMode: false,
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
        this.handleStripeToggle = this.handleStripeToggle.bind(this);
        this.handlePayPalToggle = this.handlePayPalToggle.bind(this);
        this.handleSandboxToggle = this.handleSandboxToggle.bind(this);
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
        this.setState((prevState) => ({
            checkedRazorpayUPI: !prevState.checkedRazorpayUPI,
            checkedRazorpay: !prevState.checkedRazorpay
        }));
    }

    handleStripeToggle() {
        this.setState((prevState) => ({ checkedStripe: !prevState.checkedStripe }));
    }

    handlePayPalToggle() {
        this.setState((prevState) => ({ checkedPayPal: !prevState.checkedPayPal }));
    }

    handleSandboxToggle() {
        this.setState((prevState) => ({ sandboxMode: !prevState.sandboxMode }));
    }

    applyIndianPreset() {
        this.setState({
            currency: 'INR',
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            checkedRazorpayUPI: true,
            checkedRazorpay: true,
            checkedStripe: true,
            checkedPayPal: true,
            checkedSubscriptions: true,
            sandboxMode: false
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
                    checkedStripe: data.stripeEnabled !== undefined ? data.stripeEnabled : true,
                    checkedPayPal: data.paypalEnabled !== undefined ? data.paypalEnabled : true,
                    checkedRazorpay: data.razorpayEnabled !== undefined ? data.razorpayEnabled : true,
                    sandboxMode: data.sandboxMode !== undefined ? data.sandboxMode : false,
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
            this.state.checkedRazorpayUPI,
            {
                stripeEnabled: this.state.checkedStripe,
                paypalEnabled: this.state.checkedPayPal,
                razorpayEnabled: this.state.checkedRazorpay,
                sandboxMode: this.state.sandboxMode
            }
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
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Enterprise Payment Gateway Settings Saved!</p>
                                <p className="text-xs text-emerald-600 mt-0.5">Your payment provider toggles, pricing tiers, and sandbox mode settings are now live.</p>
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
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                    <div>
                        <h4 className="text-base font-bold flex items-center gap-2">
                            🇮🇳 Quick Preset: Indian Market Pricing (INR ₹)
                        </h4>
                        <p className="text-xs text-emerald-100 mt-0.5">
                            Sets Monthly (₹199), 3 Months (₹399), Annual (₹499) with Razorpay UPI, Stripe &amp; PayPal enabled.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.applyIndianPreset}
                        className="px-4 py-2.5 text-xs font-extrabold text-slate-900 bg-white rounded-xl hover:bg-emerald-50 transition-colors shadow-sm shrink-0 cursor-pointer"
                    >
                        Apply Indian Preset
                    </button>
                </div>

                {/* Environment Mode: Live vs Sandbox / Demo */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${this.state.sandboxMode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                <FaFlask className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900">Environment &amp; Sandbox Mode</h3>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${this.state.sandboxMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                                        {this.state.sandboxMode ? '⚡ Sandbox / Demo Mode Active' : '🟢 Live Production Mode'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">Toggle between live real transactions and sandbox demo checkout testing</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={this.handleSandboxToggle}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.sandboxMode
                                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                        >
                            {this.state.sandboxMode ? (
                                <>
                                    <FaToggleOn className="w-5 h-5" />
                                    <span>Sandbox Mode ON</span>
                                </>
                            ) : (
                                <>
                                    <FaToggleOff className="w-5 h-5" />
                                    <span>Live Production</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Subscription Master Switch */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                                <FaShieldAlt className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Subscription System Master Switch</h3>
                                <p className="text-xs text-slate-500">Enable or disable premium subscription tiers &amp; paid resume downloads</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={this.handleSubscriptionToggleChange}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
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
                </div>

                {/* Individual Payment Providers ON / OFF Toggles */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900">Payment Gateway Providers (Enterprise Control)</h3>
                        <p className="text-xs text-slate-500">Enable or disable individual payment processors dynamically for candidate checkout</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        {/* Provider 1: Stripe */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedStripe ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaStripe className="w-7 h-7 text-indigo-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Stripe Cards</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleStripeToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedStripe ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedStripe ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Credit / Debit Cards (Visa, Mastercard, Amex)</p>
                        </div>

                        {/* Provider 2: PayPal */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedPayPal ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaPaypal className="w-6 h-6 text-blue-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">PayPal</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handlePayPalToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedPayPal ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedPayPal ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Global PayPal Accounts &amp; One-Touch Checkout</p>
                        </div>

                        {/* Provider 3: Razorpay UPI */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedRazorpay ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaRupeeSign className="w-5 h-5 text-emerald-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Razorpay UPI</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleRazorpayToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedRazorpay ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedRazorpay ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Google Pay, PhonePe, Paytm, BHIM &amp; RuPay (India)</p>
                        </div>
                    </div>
                </div>

                {/* Pricing Plans */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                            <FaRupeeSign className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Subscription Tiers &amp; Pricing Rates</h3>
                            <p className="text-xs text-slate-500">Configure prices in INR (₹), USD ($), EUR (€), or GBP (£)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Monthly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Monthly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.monthlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'monthly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="199"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per month rate</p>
                        </div>

                        {/* Quarterly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Quarterly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.quartarlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'quartarly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="399"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per 3 months rate</p>
                        </div>

                        {/* Yearly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Yearly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.yearlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'yearly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="499"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per year rate</p>
                        </div>

                        {/* Currency */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">System Currency</label>
                            <select
                                value={this.state.currency}
                                onChange={(event) => this.handleChange(event, 'currency')}
                                disabled={!this.state.checkedSubscriptions}
                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                            >
                                <option value="INR">🇮🇳 INR (₹ - Indian Rupee)</option>
                                <option value="USD">💵 USD ($ - US Dollar)</option>
                                <option value="EUR">💶 EUR (€ - Euro)</option>
                                <option value="GBP">💷 GBP (£ - British Pound)</option>
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">Default currency</p>
                        </div>
                    </div>
                </div>

                {/* Save Action Button */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center text-xs text-slate-500">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                        <span>Enterprise changes apply immediately to user dashboard &amp; popup checkout</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => this.submitHandler()}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center space-x-2 shadow-md cursor-pointer"
                    >
                        <FaCheck className="w-4 h-4 text-emerald-400" />
                        <span>Save Subscription &amp; Payment Settings</span>
                    </button>
                </div>
            </div>
        );
    }
}

export default SubscriptionSetting;
