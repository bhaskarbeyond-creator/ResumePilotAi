import React, { useState, useEffect } from 'react';
import { FaTimes, FaCrown, FaCheck, FaShieldAlt, FaLock, FaCreditCard, FaPaypal, FaRupeeSign, FaTag, FaPercent, FaArrowRight, FaUserCheck, FaGift, FaCheckCircle, FaExclamationTriangle, FaClock, FaRocket, FaCheckSquare, FaStar } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import Checkout from '../../Billing/Plans/Checkout';
import { getSubscriptionStatus, getAccountInfo } from '../../../firestore/dbOperations';

const stripePromise = (conf.stripe_publishable_key && conf.stripe_publishable_key.trim())
    ? loadStripe(conf.stripe_publishable_key.trim())
    : Promise.resolve(null);

const DEFAULT_COUPONS = {
    'SAVE20': { discount: 20, description: '20% Special Career Savings Applied!' },
    'WELCOME50': { discount: 50, description: '50% Welcome VIP Upgrade Discount!' },
    'SPECIAL10': { discount: 10, description: '10% Partner Special Discount Applied!' },
    'PROMO30': { discount: 30, description: '30% Professional Accelerator Discount!' },
};

const PRO_UNLOCKED_FEATURES = [
    'Unlimited AI Resume Builds & Downloads',
    'Executive Bio & Summary AI Synthesizer',
    'Cover Letter AI Builder & Job Tailoring',
    'ATS Smart Keyword Optimization Engine',
    '1-Click PDF, Word DocX & Public Portfolio Links',
    'Priority Cloud Sync & 24/7 VIP Support'
];

const SubscriptionModal = ({ isOpen, onClose, user }) => {
    const [step, setStep] = useState(1); // 1 = Cart & Plan Selection, 2 = Native Checkout
    const [selectedDuration, setSelectedDuration] = useState('12'); // '1', '6', '12' months
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [userCurrentMembership, setUserCurrentMembership] = useState('Free Basic Tier');

    const [subscriptionConfig, setSubscriptionConfig] = useState({
        monthlyPrice: 199,
        quartarlyPrice: 399,
        yearlyPrice: 499,
        currency: 'USD',
        symbol: '$',
        onlyPP: false,
        razorpayUPI: true,
        stripeEnabled: true,
        paypalEnabled: true,
        razorpayEnabled: true,
        sandboxMode: false,
        isLoading: true
    });

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setCouponInput('');
            setAppliedCoupon(null);
            setCouponError('');

            // Fetch current user account membership tier
            if (user && user.uid) {
                getAccountInfo(user.uid).then((info) => {
                    if (info && info.membership) {
                        setUserCurrentMembership(info.membership);
                    }
                });
            }

            // Fetch global pricing settings
            getSubscriptionStatus().then((data) => {
                if (data) {
                    const currSymbol = (data.currency === 'INR' || data.currency === '₹') ? '₹' : '$';
                    setSubscriptionConfig({
                        monthlyPrice: Number(data.monthlyPrice) || 199,
                        quartarlyPrice: Number(data.quartarlyPrice) || 399,
                        yearlyPrice: Number(data.yearlyPrice) || 499,
                        currency: data.currency || 'USD',
                        symbol: currSymbol,
                        onlyPP: Boolean(data.onlyPP),
                        razorpayUPI: Boolean(data.razorpayUPI),
                        stripeEnabled: data.stripeEnabled !== undefined ? Boolean(data.stripeEnabled) : true,
                        paypalEnabled: data.paypalEnabled !== undefined ? Boolean(data.paypalEnabled) : true,
                        razorpayEnabled: data.razorpayEnabled !== undefined ? Boolean(data.razorpayEnabled) : true,
                        sandboxMode: Boolean(data.sandboxMode),
                        isLoading: false
                    });
                }
            });
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    // Pricing calculation based on duration & pricing config
    const getBaseMonthlyRate = () => {
        if (selectedDuration === '1') return subscriptionConfig.monthlyPrice;
        if (selectedDuration === '6') return Math.round(subscriptionConfig.quartarlyPrice / 6 * 10) / 10;
        return Math.round(subscriptionConfig.yearlyPrice / 12 * 10) / 10;
    };

    const getRawSubtotal = () => {
        if (selectedDuration === '1') return subscriptionConfig.monthlyPrice;
        if (selectedDuration === '6') return subscriptionConfig.quartarlyPrice;
        return subscriptionConfig.yearlyPrice;
    };

    const getOriginalPriceBeforeDiscount = () => {
        const months = Number(selectedDuration);
        return Math.round(subscriptionConfig.monthlyPrice * months);
    };

    const getDurationSavings = () => {
        return Math.max(0, getOriginalPriceBeforeDiscount() - getRawSubtotal());
    };

    const getCouponDiscountAmount = () => {
        if (!appliedCoupon) return 0;
        const subtotal = getRawSubtotal();
        return Math.round((subtotal * appliedCoupon.discount) / 100);
    };

    const getFinalTotal = () => {
        const subtotal = getRawSubtotal();
        const discount = getCouponDiscountAmount();
        return Math.max(1, subtotal - discount);
    };

    const handleApplyCoupon = (e, explicitCode = null) => {
        if (e) e.preventDefault();
        setCouponError('');
        const code = (explicitCode || couponInput).trim().toUpperCase();
        if (!code) {
            setCouponError('Please enter or select a valid coupon code.');
            return;
        }

        if (DEFAULT_COUPONS[code]) {
            setAppliedCoupon({ code, ...DEFAULT_COUPONS[code] });
            setCouponInput(code);
            setCouponError('');
        } else {
            setCouponError(`Invalid coupon code "${code}". Try SAVE20, WELCOME50, or PROMO30.`);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError('');
    };

    const paypalClientId = (conf.paypalClientID || import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb').trim();
    const currencyCode = subscriptionConfig.symbol === '₹' ? 'INR' : (subscriptionConfig.currency || 'USD');
    const paypalOptions = {
        'client-id': paypalClientId || 'sb',
        currency: currencyCode,
        intent: 'capture',
        'disable-funding': 'credit,card',
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-5 overflow-y-auto animate-in fade-in duration-300">
            <div className="bg-slate-900 rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-indigo-500/30 overflow-hidden relative my-auto text-white">
                
                {/* Executive Enterprise Header */}
                <div className="px-6 py-4.5 bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#0f172a] flex items-center justify-between shrink-0 border-b border-indigo-500/20">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-indigo-400/40 flex items-center justify-center text-amber-400 font-extrabold shadow-md shrink-0">
                            <FaCrown className="w-6 h-6 text-amber-400 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-extrabold tracking-tight text-white">PRO Candidate Subscription &amp; Upgrades</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 uppercase tracking-wider">
                                    Enterprise Grade
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-indigo-200/80 mt-0.5">
                                <span className="flex items-center gap-1">
                                    <FaUserCheck className="w-3 h-3 text-emerald-400" />
                                    <span>Account: <strong className="text-white">{user?.email || 'Valued Candidate'}</strong></span>
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className="flex items-center gap-1 text-amber-300 font-semibold">
                                    <span>Current Plan: <strong>{userCurrentMembership}</strong></span>
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                        <FaTimes className="w-4 h-4" />
                    </button>
                </div>

                {/* Enterprise Stepper Progress Bar */}
                <div className="bg-slate-950/90 border-b border-slate-800 px-6 py-3 flex items-center justify-between text-xs font-bold shrink-0">
                    <div className="flex items-center gap-4 sm:gap-8">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className={`flex items-center gap-2 transition-colors ${step === 1 ? 'text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-200'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</span>
                            <span>Cart &amp; Duration Selection</span>
                        </button>
                        <span className="text-slate-700">/</span>
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className={`flex items-center gap-2 transition-colors ${step === 2 ? 'text-indigo-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>2</span>
                            <span>Checkout &amp; Instant Activation ({subscriptionConfig.onlyPP ? 'PayPal' : 'Cards / PayPal / UPI'})</span>
                        </button>
                    </div>

                    <div className="hidden sm:flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                        <FaShieldAlt className="w-3.5 h-3.5" />
                        <span>30-Day Money Back Guarantee</span>
                    </div>
                </div>

                {/* Modal Main Content Container */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-900">
                    <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                        <Elements stripe={stripePromise}>
                            <div className="w-full">
                                
                                {/* STEP 1: CART PAGE & UPGRADE COMPARISON */}
                                {step === 1 && (
                                    <div className="space-y-8 max-w-4xl mx-auto">
                                        
                                        {/* Current Plan vs PRO Upgrade Hero Comparison Card */}
                                        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-800/90 to-purple-950/80 rounded-2xl p-5 border border-indigo-500/30 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 shadow-lg">
                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                                                        Active Tier: {userCurrentMembership}
                                                    </span>
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                                                        UPGRADE AVAILABLE
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-extrabold text-white tracking-tight">
                                                    Upgrade from {userCurrentMembership} to <strong className="text-amber-400">PRO Candidate Tier</strong>
                                                </h3>
                                                <p className="text-xs text-slate-300">
                                                    Unlock full AI power, unlimited exports, ATS optimization, and VIP candidate support.
                                                </p>
                                            </div>

                                            {/* Feature Badges Grid */}
                                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-200 shrink-0">
                                                {PRO_UNLOCKED_FEATURES.slice(0, 4).map((feat, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-700/60">
                                                        <FaCheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                                                        <span className="truncate">{feat}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Headline Banner */}
                                        <div className="text-center max-w-2xl mx-auto space-y-2">
                                            <span className="px-3.5 py-1 text-xs font-extrabold text-indigo-300 bg-indigo-500/20 border border-indigo-400/30 rounded-full inline-flex items-center gap-1.5 shadow-xs">
                                                <FaCrown className="w-3.5 h-3.5 text-amber-400" />
                                                Choose Subscription Duration &amp; Maximize Savings
                                            </span>
                                            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Select your billing cycle</h2>
                                            <p className="text-xs sm:text-sm text-slate-400">
                                                Longer billing terms grant deeper discount savings plus 3 extra months free on annual plans.
                                            </p>
                                        </div>

                                        {/* Enterprise Duration Cards Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                            
                                            {/* Card 1: 1 Month */}
                                            <div
                                                onClick={() => setSelectedDuration('1')}
                                                className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                                    selectedDuration === '1'
                                                        ? 'bg-gradient-to-b from-indigo-900/40 via-slate-800 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10'
                                                        : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                                                }`}>
                                                <div>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">1 Month</h4>
                                                        <span className="text-[10px] font-extrabold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">Standard</span>
                                                    </div>
                                                    <div className="mb-4">
                                                        <span className="text-3xl font-extrabold text-white">{subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice}</span>
                                                        <span className="text-xs text-slate-400"> / month</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400">Flexible monthly plan. Cancel anytime with 1 click.</p>
                                                </div>

                                                <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                                                    <span className="text-xs text-slate-300">Renews monthly</span>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '1' ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600'}`}>
                                                        {selectedDuration === '1' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 2: 6 Months (Save 35%) */}
                                            <div
                                                onClick={() => setSelectedDuration('6')}
                                                className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                                    selectedDuration === '6'
                                                        ? 'bg-gradient-to-b from-indigo-900/50 via-slate-800 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/20'
                                                        : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                                                }`}>
                                                <div className="absolute -top-3 right-4">
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-purple-500 to-indigo-600 text-white uppercase shadow-sm">
                                                        Save 35%
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">6 Months</h4>
                                                        <span className="text-[10px] font-extrabold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">Popular</span>
                                                    </div>
                                                    <div className="mb-1">
                                                        <span className="text-3xl font-extrabold text-white">{subscriptionConfig.symbol}{Math.round(subscriptionConfig.quartarlyPrice / 6)}</span>
                                                        <span className="text-xs text-slate-400"> / month</span>
                                                    </div>
                                                    <div className="text-xs text-slate-400 line-through">
                                                        {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 6} total
                                                    </div>
                                                    <p className="text-xs text-indigo-300 font-semibold mt-2">Billed as {subscriptionConfig.symbol}{subscriptionConfig.quartarlyPrice} every 6 months</p>
                                                </div>

                                                <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                                                    <span className="text-xs text-emerald-400 font-semibold">Save {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 6 - subscriptionConfig.quartarlyPrice}</span>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '6' ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600'}`}>
                                                        {selectedDuration === '6' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 3: 12 Months (Best Value + 3 Months Free) */}
                                            <div
                                                onClick={() => setSelectedDuration('12')}
                                                className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                                    selectedDuration === '12'
                                                        ? 'bg-gradient-to-b from-purple-900/60 via-indigo-900/40 to-slate-900 border-amber-400 shadow-2xl shadow-purple-500/20 scale-[1.02]'
                                                        : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                                                }`}>
                                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                                                    <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 uppercase tracking-wider shadow-md flex items-center gap-1">
                                                        <FaCrown className="w-2.5 h-2.5 text-slate-950" /> BEST VALUE • SAVE 50%
                                                    </span>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between items-center mb-3 mt-1">
                                                        <h4 className="text-sm font-extrabold text-amber-300 uppercase tracking-wider">12 Months</h4>
                                                        <span className="text-[10px] font-extrabold text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-400/40">+3 Months Free</span>
                                                    </div>
                                                    <div className="mb-1">
                                                        <span className="text-3xl font-extrabold text-amber-400">{subscriptionConfig.symbol}{Math.round(subscriptionConfig.yearlyPrice / 12)}</span>
                                                        <span className="text-xs text-slate-300"> / month</span>
                                                    </div>
                                                    <div className="text-xs text-slate-400 line-through">
                                                        {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 12} total
                                                    </div>
                                                    <p className="text-xs text-amber-200 font-semibold mt-2">Billed as {subscriptionConfig.symbol}{subscriptionConfig.yearlyPrice} annually</p>
                                                </div>

                                                <div className="mt-6 pt-4 border-t border-amber-400/30 flex items-center justify-between">
                                                    <span className="text-xs text-amber-300 font-bold">Save {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 12 - subscriptionConfig.yearlyPrice}</span>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '12' ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600'}`}>
                                                        {selectedDuration === '12' && <FaCheck className="w-2.5 h-2.5 text-slate-950 font-bold" />}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Order Summary & 1-Click Coupon Code Box */}
                                        <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700/80 space-y-6">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700">
                                                <div>
                                                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                                                        <FaTag className="text-indigo-400" /> Apply Promo Coupon Discount
                                                    </h3>
                                                    <p className="text-xs text-slate-400 mt-0.5">Click a quick coupon pill below or enter your promo code manually</p>
                                                </div>

                                                {/* Coupon Form */}
                                                <form onSubmit={(e) => handleApplyCoupon(e)} className="flex items-center gap-2 shrink-0">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            value={couponInput}
                                                            onChange={(e) => setCouponInput(e.target.value)}
                                                            placeholder="Enter coupon code"
                                                            className="px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white uppercase focus:border-indigo-500 outline-none w-48"
                                                        />
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer shrink-0">
                                                        Apply Coupon
                                                    </button>
                                                </form>
                                            </div>

                                            {/* 1-Click Quick Coupon Pills */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs text-slate-400 font-semibold mr-1">Quick Apply Coupons:</span>
                                                {Object.keys(DEFAULT_COUPONS).map((code) => (
                                                    <button
                                                        key={code}
                                                        type="button"
                                                        onClick={(e) => handleApplyCoupon(e, code)}
                                                        className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                                            appliedCoupon?.code === code
                                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                                                                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:border-indigo-500 hover:text-white'
                                                        }`}>
                                                        <FaTag className="w-2.5 h-2.5 text-indigo-400" />
                                                        <span>{code} (-{DEFAULT_COUPONS[code].discount}%)</span>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Coupon Error Notice */}
                                            {couponError && (
                                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                                                    <FaExclamationTriangle className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{couponError}</span>
                                                </div>
                                            )}

                                            {/* Coupon Applied Badge */}
                                            {appliedCoupon && (
                                                <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <FaCheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                                                        <div>
                                                            <span className="font-extrabold uppercase text-white">{appliedCoupon.code}</span> — {appliedCoupon.description}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleRemoveCoupon}
                                                        className="text-xs text-red-400 hover:text-red-300 underline font-bold cursor-pointer">
                                                        Remove
                                                    </button>
                                                </div>
                                            )}

                                            {/* Cart Calculations Table */}
                                            <div className="space-y-2.5 text-xs text-slate-300 pt-2">
                                                <div className="flex justify-between items-center">
                                                    <span>Standard Plan Rate ({selectedDuration} Months)</span>
                                                    <span className="font-semibold">{subscriptionConfig.symbol}{getOriginalPriceBeforeDiscount()}</span>
                                                </div>

                                                {getDurationSavings() > 0 && (
                                                    <div className="flex justify-between items-center text-emerald-400">
                                                        <span>Duration Savings Discount</span>
                                                        <span className="font-bold">-{subscriptionConfig.symbol}{getDurationSavings()}</span>
                                                    </div>
                                                )}

                                                {appliedCoupon && (
                                                    <div className="flex justify-between items-center text-emerald-300 font-bold">
                                                        <span>Coupon ({appliedCoupon.code} -{appliedCoupon.discount}%)</span>
                                                        <span>-{subscriptionConfig.symbol}{getCouponDiscountAmount()}</span>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center">
                                                    <span>Sales Tax / GST</span>
                                                    <span className="text-slate-400">Included ($0.00)</span>
                                                </div>

                                                <div className="pt-3 border-t border-slate-700 flex justify-between items-center text-base font-extrabold text-white">
                                                    <span>Total Due Today</span>
                                                    <span className="text-2xl text-amber-400">{subscriptionConfig.symbol}{getFinalTotal()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Button: Proceed to Checkout */}
                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer">
                                                Cancel
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setStep(2)}
                                                className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-2xl shadow-xl shadow-indigo-500/25 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]">
                                                <span>Proceed to Secure Checkout</span>
                                                <FaArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: NATIVE ENTERPRISE CHECKOUT PAGE */}
                                {step === 2 && (
                                    <div className="space-y-6 max-w-4xl mx-auto">
                                        
                                        {/* Cart Review Banner */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-800/90 p-4 rounded-2xl border border-slate-700/80 shadow-2xs">
                                            <button
                                                type="button"
                                                onClick={() => setStep(1)}
                                                className="px-3.5 py-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto">
                                                ← Edit Cart &amp; Duration
                                            </button>
                                            <div className="text-right">
                                                <span className="text-xs text-slate-400">Order Summary Total:</span>
                                                <div className="text-sm font-extrabold text-amber-400 uppercase tracking-wider">
                                                    {selectedDuration} Months • {subscriptionConfig.symbol}{getFinalTotal()} {subscriptionConfig.currency}
                                                    {appliedCoupon && <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] border border-emerald-500/40 font-bold">{appliedCoupon.code}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Native Embedded Checkout Gateway */}
                                        <div className="bg-white rounded-2xl p-4 sm:p-6 text-slate-900 shadow-xl border border-slate-200">
                                            <ElementsConsumer>
                                                {({ stripe, elements }) => (
                                                    <Checkout
                                                        currency={subscriptionConfig.symbol}
                                                        currencyCode={currencyCode}
                                                        onlyPP={subscriptionConfig.onlyPP}
                                                        stripeEnabled={subscriptionConfig.stripeEnabled}
                                                        paypalEnabled={subscriptionConfig.paypalEnabled}
                                                        razorpayEnabled={subscriptionConfig.razorpayEnabled}
                                                        sandboxMode={subscriptionConfig.sandboxMode}
                                                        previousStep={() => setStep(1)}
                                                        stripe={stripe}
                                                        elements={elements}
                                                        monthly={getFinalTotal()}
                                                        quartarly={getFinalTotal()}
                                                        yearly={getFinalTotal()}
                                                        selectedPlan={selectedDuration === '1' ? 'monthly' : selectedDuration === '6' ? 'halfYear' : 'yearly'}
                                                    />
                                                )}
                                            </ElementsConsumer>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </Elements>
                    </PayPalScriptProvider>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionModal;
