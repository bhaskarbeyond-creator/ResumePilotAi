import React, { Component } from 'react';
import { getSubscriptionStatus, setSubscriptionsData, getAllCouponsAdmin, saveCoupon, deleteCoupon, getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe, FaFlask, FaShieldAlt, FaTag, FaPlus, FaTrash, FaEdit, FaCalendarAlt, FaPercent } from 'react-icons/fa';

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

            // Coupon Management Admin State
            couponsList: [],
            showCouponModal: false,
            enableCouponsModule: true,
            editingCode: null,
            couponForm: {
                code: '',
                discount: 20,
                description: '',
                expiryDate: '',
                maxUses: 0,
                singleUsePerUser: false,
                active: true,
            },
            couponSuccessMsg: '',
            couponErrorMsg: '',
            deleteConfirmCode: null,
            isDeleting: false,
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
        this.fetchAdminCoupons = this.fetchAdminCoupons.bind(this);
        this.handleOpenNewCoupon = this.handleOpenNewCoupon.bind(this);
        this.handleEditCoupon = this.handleEditCoupon.bind(this);
        this.handleSaveCouponForm = this.handleSaveCouponForm.bind(this);
        this.handleToggleCouponStatus = this.handleToggleCouponStatus.bind(this);
        this.handleDeleteCouponCode = this.handleDeleteCouponCode.bind(this);
        this.confirmDeleteCouponCode = this.confirmDeleteCouponCode.bind(this);
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
        getSystemSettings().then((settings) => {
            const mods = (settings && settings.modules) || {};
            this.setState({ enableCouponsModule: mods.enableCouponsModule !== false });
        });
        this.fetchAdminCoupons();
    }

    async handleToggleCouponsModule() {
        const nextState = !this.state.enableCouponsModule;
        this.setState({ enableCouponsModule: nextState });

        try {
            const settings = (await getSystemSettings()) || {};
            const mods = settings.modules || {};
            const updatedMods = { ...mods, enableCouponsModule: nextState };
            await saveSystemSettings('modules', updatedMods);

            window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
                detail: {
                    modules: updatedMods
                }
            }));

            this.setState({
                couponSuccessMsg: `Promo Coupons Module is now ${nextState ? 'ENABLED (ACTIVE)' : 'DISABLED (OFF)'}!`
            });
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } catch (err) {
            console.error('Error toggling coupon module:', err);
        }
    }

    fetchAdminCoupons() {
        getAllCouponsAdmin().then((list) => {
            this.setState({ couponsList: list });
        });
    }

    handleOpenNewCoupon() {
        this.setState({
            editingCode: null,
            couponForm: {
                code: '',
                discount: 20,
                description: '',
                expiryDate: '',
                maxUses: 0,
                singleUsePerUser: false,
                active: true,
            },
            showCouponModal: true,
            couponErrorMsg: '',
        });
    }

    handleEditCoupon(c) {
        this.setState({
            editingCode: c.code,
            couponForm: {
                code: c.code,
                discount: c.discount,
                description: c.description || '',
                expiryDate: c.expiryDate || '',
                maxUses: c.maxUses || 0,
                singleUsePerUser: Boolean(c.singleUsePerUser),
                active: c.active !== false,
            },
            showCouponModal: true,
            couponErrorMsg: '',
        });
    }

    async handleSaveCouponForm(e) {
        if (e) e.preventDefault();
        const { code, discount, description, active, expiryDate, maxUses, singleUsePerUser } = this.state.couponForm;
        if (!code || !code.trim()) {
            this.setState({ couponErrorMsg: 'Please enter a valid coupon code (e.g. SUMMER50).' });
            return;
        }

        const res = await saveCoupon(code.trim(), discount, description, active, {
            expiryDate,
            maxUses,
            singleUsePerUser,
        });

        if (res.success) {
            this.setState({
                showCouponModal: false,
                couponSuccessMsg: res.message,
            });
            this.fetchAdminCoupons();
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } else {
            this.setState({ couponErrorMsg: res.error });
        }
    }

    async handleToggleCouponStatus(c) {
        await saveCoupon(c.code, c.discount, c.description, !c.active, {
            expiryDate: c.expiryDate,
            maxUses: c.maxUses,
            singleUsePerUser: c.singleUsePerUser,
            usedCount: c.usedCount,
        });
        this.fetchAdminCoupons();
    }

    handleDeleteCouponCode(code) {
        this.setState({ deleteConfirmCode: code });
    }

    async confirmDeleteCouponCode() {
        const code = this.state.deleteConfirmCode;
        if (!code) return;
        this.setState({ isDeleting: true });
        const res = await deleteCoupon(code);
        if (res.success !== false) {
            await this.fetchAdminCoupons();
            this.setState({
                deleteConfirmCode: null,
                isDeleting: false,
                couponSuccessMsg: `Coupon ${code} deleted permanently!`
            });
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } else {
            this.setState({ isDeleting: false, couponErrorMsg: res.error || 'Failed to delete coupon' });
        }
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
            <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
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

                {/* --- ENTERPRISE ADMIN COUPON MANAGER CARD --- */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-extrabold">
                                <FaTag className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Dynamic Promo Coupon Manager</h3>
                                <p className="text-xs text-slate-500">Create, edit, toggle active status, set expiry dates, and usage limits</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
                            {/* Promo Coupons Module Master Switch */}
                            <button
                                type="button"
                                onClick={this.handleToggleCouponsModule}
                                className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all border flex items-center gap-2 cursor-pointer ${
                                    this.state.enableCouponsModule
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                }`}>
                                {this.state.enableCouponsModule ? (
                                    <>
                                        <FaToggleOn className="w-4 h-4 text-emerald-600" />
                                        <span>Module ENABLED (ON)</span>
                                    </>
                                ) : (
                                    <>
                                        <FaToggleOff className="w-4 h-4 text-slate-400" />
                                        <span>Module DISABLED (OFF)</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={this.handleOpenNewCoupon}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer">
                                <FaPlus className="w-3 h-3" />
                                <span>Create New Coupon</span>
                            </button>
                        </div>
                    </div>

                    {this.state.couponSuccessMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                            <FaCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{this.state.couponSuccessMsg}</span>
                        </div>
                    )}

                    {/* Coupons List Table */}
                    {this.state.couponsList.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <FaTag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs font-bold text-slate-600">No Custom Coupons Created Yet</p>
                            <p className="text-[11px] text-slate-500">Click "Create New Coupon" to add a promo code (e.g. SAVE50, WELCOME20).</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Discount</th>
                                        <th className="p-3">Description</th>
                                        <th className="p-3">Expiry</th>
                                        <th className="p-3">Uses</th>
                                        <th className="p-3">Per User Limit</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {this.state.couponsList.map((c) => (
                                        <tr key={c.code} className="hover:bg-slate-50/80 transition-all">
                                            <td className="p-3 font-mono font-extrabold text-indigo-700">{c.code}</td>
                                            <td className="p-3 font-bold text-emerald-700">-{c.discount}%</td>
                                            <td className="p-3 text-slate-700 max-w-xs truncate">{c.description || '—'}</td>
                                            <td className="p-3 text-slate-600">{c.expiryDate || 'Unlimited'}</td>
                                            <td className="p-3 text-slate-600">{c.usedCount || 0} / {c.maxUses > 0 ? c.maxUses : '∞'}</td>
                                            <td className="p-3 text-slate-600">{c.singleUsePerUser ? '1 Use / Candidate' : 'Multi-Use'}</td>
                                            <td className="p-3">
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleToggleCouponStatus(c)}
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border cursor-pointer ${
                                                        c.active
                                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                            : 'bg-slate-100 text-slate-600 border-slate-300'
                                                    }`}>
                                                    {c.active ? 'ACTIVE' : 'INACTIVE'}
                                                </button>
                                            </td>
                                            <td className="p-3 text-right space-x-2">
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleEditCoupon(c)}
                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Edit Coupon">
                                                    <FaEdit className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleDeleteCouponCode(c.code)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Delete Coupon">
                                                    <FaTrash className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal for Creating / Editing Coupon */}
                {this.state.showCouponModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                    <FaTag className="text-indigo-600" />
                                    <span>{this.state.editingCode ? `Edit Coupon ${this.state.editingCode}` : 'Create New Promo Coupon'}</span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ showCouponModal: false })}
                                    className="text-slate-400 hover:text-slate-600 p-1">
                                    <FaTimes className="w-4 h-4" />
                                </button>
                            </div>

                            {this.state.couponErrorMsg && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
                                    {this.state.couponErrorMsg}
                                </div>
                            )}

                            <form onSubmit={this.handleSaveCouponForm} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Coupon Code</label>
                                    <input
                                        type="text"
                                        value={this.state.couponForm.code}
                                        onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, code: e.target.value.toUpperCase() } })}
                                        disabled={Boolean(this.state.editingCode)}
                                        placeholder="e.g. SUMMER50"
                                        className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none uppercase"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Discount %</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={this.state.couponForm.discount}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, discount: Number(e.target.value) } })}
                                            className="w-full px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Expiry Date</label>
                                        <input
                                            type="date"
                                            value={this.state.couponForm.expiryDate}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, expiryDate: e.target.value } })}
                                            className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={this.state.couponForm.description}
                                        onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, description: e.target.value } })}
                                        placeholder="e.g. 50% Special Career Accelerator Discount"
                                        className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-1">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Max Total Uses (0 = ∞)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={this.state.couponForm.maxUses}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, maxUses: Number(e.target.value) } })}
                                            className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>

                                    <div className="flex flex-col justify-center">
                                        <label className="flex items-center gap-2 cursor-pointer pt-4">
                                            <input
                                                type="checkbox"
                                                checked={this.state.couponForm.singleUsePerUser}
                                                onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, singleUsePerUser: e.target.checked } })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                            <span className="text-xs font-bold text-slate-700">1 Use Per Candidate</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={this.state.couponForm.active}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, active: e.target.checked } })}
                                            className="w-4 h-4 text-emerald-600 rounded"
                                        />
                                        <span className="text-xs font-bold text-slate-800">Coupon Active</span>
                                    </label>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ showCouponModal: false })}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all">
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                                            Save Coupon
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Custom Delete Coupon Confirmation Modal Pop-Up */}
                {this.state.deleteConfirmCode && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                                    <FaTrash className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Delete Promo Coupon</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Confirm permanent removal from Firestore database.</p>
                                </div>
                            </div>

                            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
                                Are you sure you want to permanently delete coupon code <span className="font-mono font-extrabold text-rose-950 uppercase">{this.state.deleteConfirmCode}</span>? Candidate checkout will no longer accept this discount code.
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => this.setState({ deleteConfirmCode: null })}
                                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={this.state.isDeleting}
                                    onClick={() => this.confirmDeleteCouponCode()}
                                    className="px-5 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer">
                                    {this.state.isDeleting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                                            <span>Deleting...</span>
                                        </>
                                    ) : (
                                        <span>Yes, Delete Coupon</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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
