import React, { useState, useEffect } from 'react';
import { FaTimes, FaCrown, FaCheck, FaShieldAlt, FaTag, FaArrowRight, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import fire from '../../../conf/fire';
import Checkout from '../../Billing/Plans/Checkout';
import { getSubscriptionStatus, getAccountInfo, getActiveCoupons, validateCoupon } from '../../../services/api/platform';

const stripePromise = (conf.stripe_publishable_key && conf.stripe_publishable_key.trim())
    ? loadStripe(conf.stripe_publishable_key.trim())
    : Promise.resolve(null);

const PRO_UNLOCKED_FEATURES = [
    'All 51 ATS Resume Templates & Real-time ATS Score',
    'Executive Bio & Summary AI Synthesizer (100 ops/day)',
    'AI Mock Interview Coach & CBT Simulator',
    'Cover Letter AI Builder & Job Tailoring',
    '1-Click Clean Vector PDF & Word DocX (.docx) Export',
    '100% Watermark-Free Professional Document Delivery'
];

class CheckoutErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error('[SubscriptionModal CheckoutErrorBoundary]:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-xl font-bold">
                        ⚠️
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">Checkout Gateway Temporarily Unavailable</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Could not initialize the payment interface ({this.state.error?.message || 'Client initialization error'}). You can return to plan selection and try again.
                    </p>
                    <div className="pt-2 flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                if (this.props.onReset) this.props.onReset();
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                            Return to Plan Selection
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const SubscriptionModal = ({ isOpen, onClose, user, onSuccess }) => {
    const [step, setStep] = useState(1); // 1 = Cart & Plan Selection, 2 = Native Checkout
    const [selectedDuration, setSelectedDuration] = useState('12'); // '1', '6', '12' months
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
    const [availableCoupons, setAvailableCoupons] = useState([]);
    const [userCurrentMembership, setUserCurrentMembership] = useState('Free Basic Tier');

    // Keyboard listener for Escape key to close modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && typeof onClose === 'function') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleMembershipUpdated = () => {
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        };
        window.addEventListener('userMembershipUpdated', handleMembershipUpdated);
        return () => window.removeEventListener('userMembershipUpdated', handleMembershipUpdated);
    }, [isOpen, onSuccess]);

    const [subscriptionConfig, setSubscriptionConfig] = useState({
        monthlyPrice: null,
        quartarlyPrice: null,
        yearlyPrice: null,
        currency: null,
        symbol: '',
        onlyPP: false,
        razorpayUPI: true,
        stripeEnabled: true,
        paypalEnabled: true,
        razorpayEnabled: true,
        sandboxMode: false,
        isLoading: true,
        error: null
    });

    const loadSubscriptionPricing = () => {
        setSubscriptionConfig(prev => ({ ...prev, isLoading: true, error: null }));
        getSubscriptionStatus().then((data) => {
            if (data && (data.monthlyPrice !== undefined || data.pricingMatrix)) {
                const curr = data.currency || 'INR';
                const matrix = data.pricingMatrix?.[curr] || {};
                const mPrice = Number(matrix.monthly ?? data.monthlyPrice);
                const qPrice = Number(matrix.quartarly ?? data.quartarlyPrice);
                const yPrice = Number(matrix.yearly ?? data.yearlyPrice);
                const currSymbol = data.currencySymbol || ((curr === 'INR' || curr === '₹') ? '₹' : (curr === 'EUR' || curr === '€') ? '€' : (curr === 'GBP' || curr === '£') ? '£' : '$');
                if (!Number.isFinite(mPrice) || !Number.isFinite(qPrice) || !Number.isFinite(yPrice)) {
                    setSubscriptionConfig(prev => ({ ...prev, isLoading: false, error: 'Unable to load current pricing. Please retry.' }));
                    return;
                }
                setSubscriptionConfig({
                    monthlyPrice: mPrice,
                    quartarlyPrice: qPrice,
                    yearlyPrice: yPrice,
                    currency: curr,
                    symbol: currSymbol,
                    onlyPP: Boolean(data.onlyPP),
                    razorpayUPI: Boolean(data.razorpayUPI),
                    stripeEnabled: data.stripeEnabled !== undefined ? Boolean(data.stripeEnabled) : true,
                    paypalEnabled: data.paypalEnabled !== undefined ? Boolean(data.paypalEnabled) : true,
                    razorpayEnabled: data.razorpayEnabled !== undefined ? Boolean(data.razorpayEnabled) : true,
                    sandboxMode: Boolean(data.sandboxMode),
                    isLoading: false,
                    error: null
                });
            } else {
                setSubscriptionConfig(prev => ({ ...prev, isLoading: false, error: 'Unable to load current pricing. Please retry.' }));
            }
        }).catch(() => {
            setSubscriptionConfig(prev => ({ ...prev, isLoading: false, error: 'Unable to load current pricing. Please retry.' }));
        });
    };

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
                }).catch(() => {});
            }

            // Fetch authoritative active promo coupons from backend
            getActiveCoupons().then((coupons) => {
                if (Array.isArray(coupons)) {
                    setAvailableCoupons(coupons);
                }
            }).catch(() => {});

            // Fetch global authoritative pricing configuration
            loadSubscriptionPricing();
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const getRawSubtotal = () => {
        if (!subscriptionConfig.monthlyPrice) return 0;
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
        return Math.max(0, subtotal - discount);
    };

    const handleApplyCoupon = async (e, explicitCode = '') => {
        if (e) e.preventDefault();
        setCouponError('');
        const code = (explicitCode || couponInput).trim().toUpperCase();
        if (!code) {
            setCouponError('Please enter or select a valid coupon code.');
            return;
        }

        const planId = selectedDuration === '1' ? 'monthly' : selectedDuration === '6' ? 'halfYear' : 'yearly';
        setIsValidatingCoupon(true);

        try {
            const res = await validateCoupon(code, planId, user?.uid);
            if (res && res.valid && res.coupon) {
                setAppliedCoupon(res.coupon);
                setCouponInput(res.coupon.code);
                setCouponError('');
            } else {
                setCouponError(res?.error || `Coupon "${code}" is invalid, inactive, or expired.`);
                setAppliedCoupon(null);
            }
        } catch (_err) {
            setCouponError('Coupon verification service temporarily unavailable.');
            setAppliedCoupon(null);
        } finally {
            setIsValidatingCoupon(false);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError('');
    };

    const paypalClientId = (conf.paypalClientID || import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb').trim();
    const currencyCode = subscriptionConfig.symbol === '₹' ? 'INR' : subscriptionConfig.symbol === '£' ? 'GBP' : subscriptionConfig.symbol === '€' ? 'EUR' : (subscriptionConfig.currency || 'USD');
    const paypalOptions = {
        'client-id': paypalClientId || 'sb',
        currency: currencyCode,
        intent: 'capture',
        'disable-funding': 'credit,card',
    };

    return (
        <div
            className="fixed inset-0 z-[10000] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200 pointer-events-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-modal-title"
        >
            <div className="bg-white rounded-3xl max-w-3xl w-full flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative my-auto text-slate-900">
                
                {/* Executive Light Header */}
                <div className="px-6 py-3.5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 flex items-center justify-between shrink-0 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-400 font-extrabold shadow-sm shrink-0">
                            <FaCrown className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h2 id="subscription-modal-title" className="text-base font-extrabold tracking-tight text-white leading-tight">
                                PRO Candidate Subscription
                            </h2>
                            <div className="flex items-center gap-2 text-[11px] text-indigo-100/90 mt-0.5">
                                <span className="font-semibold text-amber-300">
                                    Current Plan: <strong>{userCurrentMembership}</strong>
                                </span>
                                <span className="text-indigo-300">•</span>
                                <span className="flex items-center gap-1 text-emerald-300 font-medium">
                                    <FaShieldAlt className="w-3 h-3" />
                                    <span>30-Day Money Back Guarantee</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-white/50"
                        aria-label="Close subscription modal">
                        <FaTimes className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* STEP 1: VALUE PROPOSITION + BILLING CYCLE + COUPON + CHECKOUT */}
                {step === 1 && (
                    <div className="flex-1 flex flex-col">
                        {/* What am I buying & Benefits (Full Width, No Squeezing) */}
                        <div className="bg-gradient-to-r from-indigo-50/80 via-purple-50/40 to-slate-50/70 border-b border-indigo-100/80 px-6 py-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                                <div>
                                    <span className="text-[10px] font-extrabold tracking-wider uppercase text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md mr-2">
                                        Upgrade Offer
                                    </span>
                                    <h3 className="inline text-base font-extrabold text-slate-900 tracking-tight">
                                        Accelerate your career with PRO Candidate features
                                    </h3>
                                </div>
                                <span className="text-xs font-semibold text-slate-500 shrink-0">
                                    100% Watermark-Free Export
                                </span>
                            </div>

                            {/* Balanced Benefits Checklist */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-700">
                                {PRO_UNLOCKED_FEATURES.map((feat, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                        <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span className="font-semibold text-[11px] leading-tight text-slate-800">{feat}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Body: Billing Selection + Coupon & Summary */}
                        <div className="p-6 space-y-5">
                            {subscriptionConfig.error && (
                                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-800 text-xs font-semibold shadow-xs">
                                    <div className="flex items-center gap-2">
                                        <FaTimes className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        <span>{subscriptionConfig.error}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadSubscriptionPricing}
                                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}

                            {/* 1. Billing Cycle Selection */}
                            <div>
                                <div className="flex items-center justify-between mb-2.5">
                                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                                        1. Select Billing Cycle
                                    </h4>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                        Cancel anytime with 1-click
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                    {/* 1 Month */}
                                    <div
                                        onClick={() => setSelectedDuration('1')}
                                        className={`relative rounded-2xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                            selectedDuration === '1'
                                                ? 'bg-indigo-50/20 border-indigo-600 shadow-md ring-2 ring-indigo-600/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                        role="radio"
                                        aria-checked={selectedDuration === '1'}
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setSelectedDuration('1'); }}
                                    >
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Monthly</span>
                                                <span className="text-[9px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Standard</span>
                                            </div>
                                            <div className="mb-1">
                                                <span className="text-2xl font-black text-slate-900">{subscriptionConfig.monthlyPrice ? `${subscriptionConfig.symbol}${subscriptionConfig.monthlyPrice}` : '--'}</span>
                                                <span className="text-xs text-slate-500"> / mo</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-tight">Flexible monthly billing.</p>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                            <span>Renews monthly</span>
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedDuration === '1' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                                {selectedDuration === '1' && <FaCheck className="w-2 h-2 text-white" />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 6 Months */}
                                    <div
                                        onClick={() => setSelectedDuration('6')}
                                        className={`relative rounded-2xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                            selectedDuration === '6'
                                                ? 'bg-indigo-50/20 border-indigo-600 shadow-md ring-2 ring-indigo-600/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                        role="radio"
                                        aria-checked={selectedDuration === '6'}
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setSelectedDuration('6'); }}
                                    >
                                        <div className="absolute -top-2.5 right-3">
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-gradient-to-r from-purple-600 to-indigo-600 text-white uppercase shadow-2xs">
                                                Save 35%
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">6 Months</span>
                                                <span className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Popular</span>
                                            </div>
                                            <div className="mb-1">
                                                <span className="text-2xl font-black text-slate-900">{subscriptionConfig.quartarlyPrice ? `${subscriptionConfig.symbol}${Math.round(subscriptionConfig.quartarlyPrice / 6)}` : '--'}</span>
                                                <span className="text-xs text-slate-500"> / mo</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-tight">
                                                Billed {subscriptionConfig.quartarlyPrice ? `${subscriptionConfig.symbol}${subscriptionConfig.quartarlyPrice}` : '--'} semi-annually.
                                            </p>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                            <span>Renews every 6 months</span>
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedDuration === '6' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                                {selectedDuration === '6' && <FaCheck className="w-2 h-2 text-white" />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 12 Months */}
                                    <div
                                        onClick={() => setSelectedDuration('12')}
                                        className={`relative rounded-2xl p-4 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                            selectedDuration === '12'
                                                ? 'bg-amber-50/20 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                        role="radio"
                                        aria-checked={selectedDuration === '12'}
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setSelectedDuration('12'); }}
                                    >
                                        <div className="absolute -top-2.5 right-3">
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 text-white uppercase shadow-2xs">
                                                Best Value
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5 mt-0.5">
                                                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">12 Months</span>
                                                <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Top Choice</span>
                                            </div>
                                            <div className="mb-1">
                                                <span className="text-2xl font-black text-slate-900">{subscriptionConfig.yearlyPrice ? `${subscriptionConfig.symbol}${Math.round(subscriptionConfig.yearlyPrice / 12)}` : '--'}</span>
                                                <span className="text-xs text-slate-500"> / mo</span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 leading-tight">
                                                Billed {subscriptionConfig.yearlyPrice ? `${subscriptionConfig.symbol}${subscriptionConfig.yearlyPrice}` : '--'} annually.
                                            </p>
                                        </div>
                                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                                            <span>Renews annually</span>
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedDuration === '12' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                                {selectedDuration === '12' && <FaCheck className="w-2 h-2 text-white" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Promo Coupon Code */}
                            <div>
                                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                                    2. Have a Coupon Code?
                                </h4>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                            <FaTag className="w-3.5 h-3.5" />
                                        </div>
                                        <input
                                            type="text"
                                            value={couponInput}
                                            onChange={(e) => {
                                                setCouponInput(e.target.value.toUpperCase());
                                                setCouponError('');
                                            }}
                                            aria-label="Coupon code input"
                                            placeholder="e.g. SPRING30"
                                            className="w-full pl-9 pr-3 py-2 text-xs font-bold uppercase rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden bg-slate-50/50"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleApplyCoupon}
                                        disabled={isValidatingCoupon || !couponInput.trim()}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
                                    >
                                        {isValidatingCoupon ? 'Checking...' : 'Apply'}
                                    </button>
                                </div>

                                {/* Active Promos Pill List */}
                                {availableCoupons.length > 0 && !appliedCoupon && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[10px] text-slate-500 font-medium">Available promos:</span>
                                        {availableCoupons.map((c) => (
                                            <button
                                                key={c.code}
                                                type="button"
                                                onClick={() => {
                                                    setCouponInput(c.code);
                                                    setCouponError('');
                                                }}
                                                className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-md text-[10px] font-bold tracking-wider cursor-pointer transition"
                                            >
                                                {c.code} (-{c.discount}%)
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {couponError && (
                                    <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                                        <FaTimes className="w-3 h-3" />
                                        <span>{couponError}</span>
                                    </p>
                                )}

                                {appliedCoupon && (
                                    <div className="mt-2.5 p-2.5 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                                        <div className="flex items-center gap-2">
                                            <FaCheckCircle className="w-4 h-4 text-emerald-600" />
                                            <span className="font-bold">✓ {appliedCoupon.code} (-{appliedCoupon.discount}%)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRemoveCoupon}
                                            className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold underline cursor-pointer"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 3. Order Summary & CTA */}
                            <div className="border-t border-slate-200 pt-4">
                                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-3">
                                    <div className="space-y-1 text-xs text-slate-600">
                                        <div className="flex justify-between items-center">
                                            <span>Standard Plan Rate</span>
                                            <span className="font-semibold text-slate-900">{subscriptionConfig.monthlyPrice ? `${subscriptionConfig.symbol}${getOriginalPriceBeforeDiscount()}` : '--'}</span>
                                        </div>
                                        {getDurationSavings() > 0 && (
                                            <div className="flex justify-between items-center text-emerald-700 font-medium">
                                                <span>Duration Savings</span>
                                                <span>-{subscriptionConfig.symbol}{getDurationSavings()}</span>
                                            </div>
                                        )}
                                        {appliedCoupon && (
                                            <div className="flex justify-between items-center text-emerald-700 font-bold">
                                                <span>Coupon Discount ({appliedCoupon.code})</span>
                                                <span>-{subscriptionConfig.symbol}{getCouponDiscountAmount()}</span>
                                            </div>
                                        )}
                                        <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center">
                                            <span className="font-bold text-slate-800">Total Due Today</span>
                                            <span className="text-2xl text-indigo-950 font-black tracking-tight">
                                                {subscriptionConfig.monthlyPrice ? `${subscriptionConfig.symbol}${getFinalTotal()}` : '--'}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setStep(2)}
                                        disabled={subscriptionConfig.isLoading || !!subscriptionConfig.error || subscriptionConfig.monthlyPrice === null}
                                        className={`w-full py-3 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all ${
                                            subscriptionConfig.isLoading || !!subscriptionConfig.error || subscriptionConfig.monthlyPrice === null
                                                ? 'bg-slate-400 cursor-not-allowed opacity-60'
                                                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-indigo-600/20 cursor-pointer hover:scale-[1.01]'
                                        }`}
                                    >
                                        <span>Continue to Checkout</span>
                                        <FaArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: NATIVE CHECKOUT & EMBEDDED GATEWAYS */}
                {step === 2 && (
                    <div className="p-6 space-y-5">
                        <CheckoutErrorBoundary onReset={() => setStep(1)}>
                            <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                                <Elements stripe={stripePromise}>
                                    <div className="space-y-5 max-w-2xl mx-auto">
                                        
                                        {/* Cart Review Banner */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                                            <button
                                                type="button"
                                                onClick={() => setStep(1)}
                                                className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-2xs"
                                            >
                                                ← Edit Plan &amp; Duration
                                            </button>
                                            <div className="text-right">
                                                <span className="text-xs text-slate-500 mr-2">Due Today:</span>
                                                <span className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                                    {selectedDuration} Mos • {subscriptionConfig.symbol}{getFinalTotal()} {subscriptionConfig.currency}
                                                    {appliedCoupon && <span className="ml-1.5 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] border border-emerald-300 font-bold">{appliedCoupon.code}</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Native Embedded Checkout Gateway */}
                                        <div className="bg-white rounded-2xl p-4 sm:p-6 text-slate-900 shadow-lg border border-slate-200">
                                            <ElementsConsumer>
                                                {({ stripe, elements }) => (
                                                    <Checkout
                                                        user={user || fire.auth().currentUser}
                                                        embedded={true}
                                                        currency={subscriptionConfig.symbol}
                                                        currencyCode={currencyCode}
                                                        onlyPP={subscriptionConfig.onlyPP}
                                                        stripeEnabled={subscriptionConfig.stripeEnabled}
                                                        paypalEnabled={subscriptionConfig.paypalEnabled}
                                                        razorpayEnabled={subscriptionConfig.razorpayEnabled}
                                                        paytmEnabled={subscriptionConfig.paytmEnabled}
                                                        phonepeEnabled={subscriptionConfig.phonepeEnabled}
                                                        sandboxMode={subscriptionConfig.sandboxMode}
                                                        couponCode={appliedCoupon?.code || ''}
                                                        taxConfig={{
                                                            enableTax: Boolean(subscriptionConfig.enableTax),
                                                            taxName: subscriptionConfig.taxName || 'GST',
                                                            taxRate: subscriptionConfig.taxRate || 0,
                                                            taxInclusive: Boolean(subscriptionConfig.taxInclusive),
                                                            companyTaxId: subscriptionConfig.companyTaxId || '',
                                                            requireCustomerTaxId: Boolean(subscriptionConfig.requireCustomerTaxId),
                                                        }}
                                                        previousStep={() => setStep(1)}
                                                        stripe={stripe}
                                                        elements={elements}
                                                        monthly={getFinalTotal()}
                                                        quartarly={getFinalTotal()}
                                                        yearly={getFinalTotal()}
                                                        selectedPlan={selectedDuration === '1' ? 'monthly' : selectedDuration === '6' ? 'halfYear' : 'yearly'}
                                                        onPaymentSuccess={onSuccess}
                                                    />
                                                )}
                                            </ElementsConsumer>
                                        </div>
                                    </div>
                                </Elements>
                            </PayPalScriptProvider>
                        </CheckoutErrorBoundary>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubscriptionModal;
