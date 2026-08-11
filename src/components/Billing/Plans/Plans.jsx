import React, { useState, useEffect } from 'react';
import { FaCrown, FaCheck, FaShieldAlt, FaLock, FaCreditCard, FaPaypal, FaRupeeSign, FaTag, FaPercent, FaArrowRight, FaUserCheck, FaGift, FaCheckCircle, FaExclamationTriangle, FaClock, FaSparkles, FaArrowLeft, FaCalendarAlt } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import Checkout from './Checkout';
import { getSubscriptionStatus } from '../../../firestore/dbOperations';
import { getUserMembership } from '../../../firestore/paidOperations';
import fire from '../../../conf/fire';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import HomepagePricing from '../../Dashboard2/elements/HomepagePricing';
import './Plans.scss';
import '../../CustomPage/CustomPage.scss';

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

const PlansPage = (props) => {
    // Check path to distinguish public /billing/plans vs dashboard /dashboard/plans
    const isEmbeddedInDashboard = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard');

    // Dashboard View State
    const [step, setStep] = useState(1); // 1 = Cart & Plan Selection, 2 = Native Checkout
    const [selectedDuration, setSelectedDuration] = useState('12'); // '1', '6', '12' months
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [userCurrentMembership, setUserCurrentMembership] = useState('Loading Tier...');
    const [membershipExpiry, setMembershipExpiry] = useState('');
    const [candidateName, setCandidateName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    // Classic Public View State (for /billing/plans)
    const [publicStep, setPublicStep] = useState(0);
    const [publicSelectedPlan, setPublicSelectedPlan] = useState('monthly');

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
        // Realtime Auth State Listener for robust dynamic details
        const unsubscribe = fire.auth().onAuthStateChanged((currentUser) => {
            if (currentUser) {
                setUserEmail(currentUser.email || '');
                if (currentUser.displayName) {
                    setCandidateName(currentUser.displayName);
                }

                // Query Firestore users/{uid} document for exact membership, name, expiry
                getUserMembership(currentUser.uid).then((data) => {
                    if (data) {
                        // Pull candidate name from Firestore doc (same fields as auth.js addUser)
                        const firstName = data.firstname || data.profile?.firstname || '';
                        const lastName = data.lastname || data.profile?.lastname || '';
                        if (firstName || lastName) {
                            setCandidateName(`${firstName} ${lastName}`.trim());
                        }
                        // Pull email from Firestore if available
                        if (data.email) {
                            setUserEmail(data.email);
                        }

                        // Resolve membership tier (same logic as DashboardMain authListener)
                        const rawMembership = data.membership || data.profile?.membership || 'Basic';
                        let resolvedTier = rawMembership;

                        // Check if membership has expired
                        let isExpired = false;
                        const membershipEndsRaw = data.membershipEnds || data.profile?.membershipEnds;
                        if (membershipEndsRaw) {
                            try {
                                const expiryDate = membershipEndsRaw.toDate
                                    ? membershipEndsRaw.toDate()
                                    : new Date(membershipEndsRaw);
                                if (!isNaN(expiryDate.getTime())) {
                                    isExpired = expiryDate < new Date();
                                    if (!isExpired) {
                                        setMembershipExpiry(
                                            expiryDate.toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })
                                        );
                                    }
                                }
                            } catch (err) {
                                console.error('Error parsing membershipEnds:', err);
                            }
                        }

                        // Determine final display tier
                        const isPremium =
                            rawMembership === 'Premium' ||
                            rawMembership.toLowerCase().includes('premium') ||
                            rawMembership.toLowerCase().includes('pro');

                        if (isPremium && !isExpired) {
                            resolvedTier = 'Premium Pro';
                        } else if (isPremium && isExpired) {
                            resolvedTier = 'Premium (Expired)';
                        } else {
                            resolvedTier = 'Free Basic';
                        }

                        setUserCurrentMembership(resolvedTier);
                    } else {
                        setUserCurrentMembership('Free Basic');
                    }
                }).catch((err) => {
                    console.error('Error fetching user membership:', err);
                    setUserCurrentMembership('Free Basic');
                });
            } else {
                setUserCurrentMembership('Guest');
                setUserEmail('');
                setCandidateName('');
            }
        });

        // Global Subscription Config
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

        return () => unsubscribe();
    }, []);

    // Classic Public View Handlers
    const handlePublicNextStep = (plan) => {
        setPublicSelectedPlan(plan);
        setPublicStep(1);
    };

    const handlePublicPreviousStep = () => {
        setPublicStep(0);
    };

    // Pricing calculations for Dashboard View
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

    // IF ACCESSED AS PUBLIC PAGE (/billing/plans) -> RENDER THE CLASSIC ORIGINAL PUBLIC VIEW
    if (!isEmbeddedInDashboard) {
        return (
            <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                <Elements stripe={stripePromise}>
                    <div className="custom-page">
                        <HomepageNavbar user={props.user} />
                        <div className="custom-page__content w-full">
                            <div className="custom-page__Plans w-full">
                                {publicStep === 0 && (
                                    <HomepagePricing nextStep={handlePublicNextStep} />
                                )}
                                {publicStep === 1 && (
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
                                                previousStep={handlePublicPreviousStep}
                                                stripe={stripe}
                                                elements={elements}
                                                monthly={subscriptionConfig.monthlyPrice}
                                                quartarly={subscriptionConfig.quartarlyPrice}
                                                yearly={subscriptionConfig.yearlyPrice}
                                                selectedPlan={publicSelectedPlan}
                                            />
                                        )}
                                    </ElementsConsumer>
                                )}
                            </div>
                        </div>
                        <HomepageFooter />
                    </div>
                </Elements>
            </PayPalScriptProvider>
        );
    }

    // IF ACCESSED FROM DASHBOARD (/dashboard/plans) -> RENDER THE RICH CANDIDATE DASHBOARD PAGE
    return (
        <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
            <Elements stripe={stripePromise}>
                <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
                    
                    {/* Dashboard Header Bar */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-extrabold text-xl shrink-0">
                                <FaCrown className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-extrabold text-slate-900">PRO Membership &amp; Subscription Plans</h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase ${
                                        userCurrentMembership.includes('Premium')
                                            ? (userCurrentMembership.includes('Expired')
                                                ? 'bg-red-50 text-red-700 border-red-300'
                                                : 'bg-amber-50 text-amber-800 border-amber-300')
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}>
                                        Active Tier: {userCurrentMembership}
                                    </span>
                                    {membershipExpiry && (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                                            <FaCalendarAlt className="w-2.5 h-2.5 text-slate-400" />
                                            Expires: {membershipExpiry}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">Upgrade your account to unlock unlimited AI resumes, cover letters, and priority export tools.</p>
                            </div>
                        </div>

                        <a href="/dashboard/settings" className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-2 self-start md:self-auto shrink-0">
                            <FaArrowLeft className="w-3 h-3" />
                            <span>Back to Account Settings</span>
                        </a>
                    </div>

                    {/* STEP 1: CART PAGE & UPGRADE COMPARISON */}
                    {step === 1 && (
                        <div className="space-y-8">
                            
                            {/* Current Plan vs PRO Upgrade Hero Comparison Card */}
                            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white border border-indigo-500/30 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 shadow-md">
                                <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                                            Account: {candidateName ? `${candidateName} (${userEmail})` : userEmail || 'Candidate'}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                                            INSTANT ACTIVATION
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-extrabold text-white tracking-tight">
                                        Upgrade from <span className="text-slate-300 underline font-semibold">{userCurrentMembership}</span> to <strong className="text-amber-400">AI Resume Builder PRO</strong>
                                    </h3>
                                    <p className="text-xs text-slate-300">
                                        Unlock full AI power, unlimited exports, ATS optimization, and VIP candidate support.
                                    </p>
                                </div>

                                {/* Unlocked Features Checklist */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 shrink-0">
                                    {PRO_UNLOCKED_FEATURES.map((feat, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-white/10 px-3.5 py-2 rounded-xl border border-white/10">
                                            <FaCheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                            <span className="font-semibold">{feat}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Duration Options Header */}
                            <div className="text-center max-w-2xl mx-auto space-y-2 pt-2">
                                <span className="px-3.5 py-1 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                                    <FaCrown className="w-3.5 h-3.5 text-amber-500" />
                                    Select Duration &amp; Maximize Savings
                                </span>
                                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Choose your subscription billing cycle</h2>
                                <p className="text-xs sm:text-sm text-slate-500">
                                    Longer billing terms grant deeper discount savings plus 3 extra months free on annual plans.
                                </p>
                            </div>

                            {/* Enterprise Duration Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                
                                {/* Card 1: 1 Month */}
                                <div
                                    onClick={() => setSelectedDuration('1')}
                                    className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                        selectedDuration === '1'
                                            ? 'bg-white border-indigo-600 shadow-xl ring-2 ring-indigo-600/20'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}>
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">1 Month</h4>
                                            <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Standard</span>
                                        </div>
                                        <div className="mb-4">
                                            <span className="text-3xl font-extrabold text-slate-900">{subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice}</span>
                                            <span className="text-xs text-slate-500"> / month</span>
                                        </div>
                                        <p className="text-xs text-slate-500">Flexible monthly plan. Cancel anytime with 1 click.</p>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-xs text-slate-500">Renews monthly</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '1' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                            {selectedDuration === '1' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Card 2: 6 Months (Save 35%) */}
                                <div
                                    onClick={() => setSelectedDuration('6')}
                                    className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                        selectedDuration === '6'
                                            ? 'bg-white border-indigo-600 shadow-xl ring-2 ring-indigo-600/20'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}>
                                    <div className="absolute -top-3 right-4">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-purple-600 to-indigo-600 text-white uppercase shadow-sm">
                                            Save 35%
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">6 Months</h4>
                                            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Popular</span>
                                        </div>
                                        <div className="mb-1">
                                            <span className="text-3xl font-extrabold text-slate-900">{subscriptionConfig.symbol}{Math.round(subscriptionConfig.quartarlyPrice / 6)}</span>
                                            <span className="text-xs text-slate-500"> / month</span>
                                        </div>
                                        <div className="text-xs text-slate-400 line-through">
                                            {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 6} total
                                        </div>
                                        <p className="text-xs text-indigo-700 font-semibold mt-2">Billed as {subscriptionConfig.symbol}{subscriptionConfig.quartarlyPrice} every 6 months</p>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-xs text-emerald-600 font-bold">Save {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 6 - subscriptionConfig.quartarlyPrice}</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '6' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                            {selectedDuration === '6' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Card 3: 12 Months (Best Value + 3 Months Free) */}
                                <div
                                    onClick={() => setSelectedDuration('12')}
                                    className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                        selectedDuration === '12'
                                            ? 'bg-gradient-to-b from-amber-50/50 via-white to-indigo-50/30 border-amber-500 shadow-xl ring-2 ring-amber-500/20 scale-[1.02]'
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}>
                                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                                        <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 uppercase tracking-wider shadow-sm flex items-center gap-1">
                                            <FaCrown className="w-2.5 h-2.5 text-slate-950" /> BEST VALUE • SAVE 50%
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-3 mt-1">
                                            <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">12 Months</h4>
                                            <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">+3 Months Free</span>
                                        </div>
                                        <div className="mb-1">
                                            <span className="text-3xl font-extrabold text-indigo-900">{subscriptionConfig.symbol}{Math.round(subscriptionConfig.yearlyPrice / 12)}</span>
                                            <span className="text-xs text-slate-500"> / month</span>
                                        </div>
                                        <div className="text-xs text-slate-400 line-through">
                                            {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 12} total
                                        </div>
                                        <p className="text-xs text-indigo-700 font-semibold mt-2">Billed as {subscriptionConfig.symbol}{subscriptionConfig.yearlyPrice} annually</p>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-xs text-amber-800 font-extrabold">Save {subscriptionConfig.symbol}{subscriptionConfig.monthlyPrice * 12 - subscriptionConfig.yearlyPrice}</span>
                                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '12' ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-300'}`}>
                                            {selectedDuration === '12' && <FaCheck className="w-2.5 h-2.5 text-slate-950 font-bold" />}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Order Summary & 1-Click Coupon Code Box */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                                    <div>
                                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                                            <FaTag className="text-indigo-600" /> Apply Promo Coupon Discount
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Click a quick coupon pill below or enter your promo code manually</p>
                                    </div>

                                    {/* Coupon Form */}
                                    <form onSubmit={(e) => handleApplyCoupon(e)} className="flex items-center gap-2 shrink-0">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={couponInput}
                                                onChange={(e) => setCouponInput(e.target.value)}
                                                placeholder="Enter coupon code"
                                                className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 uppercase focus:border-indigo-600 outline-none w-48"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer shrink-0">
                                            Apply Coupon
                                        </button>
                                    </form>
                                </div>

                                {/* 1-Click Quick Coupon Pills */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-slate-500 font-semibold mr-1">Quick Apply Coupons:</span>
                                    {Object.keys(DEFAULT_COUPONS).map((code) => (
                                        <button
                                            key={code}
                                            type="button"
                                            onClick={(e) => handleApplyCoupon(e, code)}
                                            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                                appliedCoupon?.code === code
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-600 hover:text-indigo-700'
                                            }`}>
                                            <FaTag className="w-2.5 h-2.5 text-indigo-500" />
                                            <span>{code} (-{DEFAULT_COUPONS[code].discount}%)</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Coupon Error Notice */}
                                {couponError && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                                        <FaExclamationTriangle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                        <span>{couponError}</span>
                                    </div>
                                )}

                                {/* Coupon Applied Badge */}
                                {appliedCoupon && (
                                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                            <div>
                                                <span className="font-extrabold uppercase">{appliedCoupon.code}</span> — {appliedCoupon.description}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRemoveCoupon}
                                            className="text-xs text-red-600 hover:text-red-800 underline font-bold cursor-pointer">
                                            Remove
                                        </button>
                                    </div>
                                )}

                                {/* Cart Calculations Table */}
                                <div className="space-y-2.5 text-xs text-slate-600 pt-2">
                                    <div className="flex justify-between items-center">
                                        <span>Standard Plan Rate ({selectedDuration} Months)</span>
                                        <span className="font-semibold text-slate-900">{subscriptionConfig.symbol}{getOriginalPriceBeforeDiscount()}</span>
                                    </div>

                                    {getDurationSavings() > 0 && (
                                        <div className="flex justify-between items-center text-emerald-600 font-semibold">
                                            <span>Duration Savings Discount</span>
                                            <span>-{subscriptionConfig.symbol}{getDurationSavings()}</span>
                                        </div>
                                    )}

                                    {appliedCoupon && (
                                        <div className="flex justify-between items-center text-emerald-600 font-bold">
                                            <span>Coupon ({appliedCoupon.code} -{appliedCoupon.discount}%)</span>
                                            <span>-{subscriptionConfig.symbol}{getCouponDiscountAmount()}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center">
                                        <span>Sales Tax / GST</span>
                                        <span className="text-slate-400">Included ($0.00)</span>
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-base font-extrabold text-slate-900">
                                        <span>Total Due Today</span>
                                        <span className="text-2xl text-indigo-700">{subscriptionConfig.symbol}{getFinalTotal()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Button: Proceed to Checkout */}
                            <div className="flex items-center justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(2)}
                                    className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]">
                                    <span>Proceed to Secure Checkout</span>
                                    <FaArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: NATIVE ENTERPRISE CHECKOUT PAGE */}
                    {step === 2 && (
                        <div className="space-y-6">
                            
                            {/* Cart Review Banner */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto">
                                    ← Edit Cart &amp; Duration
                                </button>
                                <div className="text-right">
                                    <span className="text-xs text-slate-500">Order Summary Total:</span>
                                    <div className="text-base font-extrabold text-indigo-700 uppercase tracking-wider">
                                        {selectedDuration} Months • {subscriptionConfig.symbol}{getFinalTotal()} {subscriptionConfig.currency}
                                        {appliedCoupon && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] border border-emerald-300 font-bold">{appliedCoupon.code}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Native Embedded Checkout Gateway */}
                            <div className="bg-white rounded-2xl p-6 text-slate-900 shadow-sm border border-slate-200">
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
    );
};

export default PlansPage;
