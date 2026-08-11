import React, { useState, useEffect } from 'react';
import { FaTimes, FaCrown, FaCheck, FaShieldAlt, FaLock, FaCreditCard, FaPaypal, FaMagic } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import HomepagePricing from '../../Dashboard2/elements/HomepagePricing';
import Checkout from '../../Billing/Plans/Checkout';
import { getSubscriptionStatus } from '../../../firestore/dbOperations';

const stripePromise = (conf.stripe_publishable_key && conf.stripe_publishable_key.trim())
    ? loadStripe(conf.stripe_publishable_key.trim())
    : Promise.resolve(null);

const SubscriptionModal = ({ isOpen, onClose, user }) => {
    const [step, setStep] = useState(0);
    const [selectedPlan, setSelectedPlan] = useState('monthly');
    const [subscriptionConfig, setSubscriptionConfig] = useState({
        monthlyPrice: 199,
        quartarlyPrice: 399,
        yearlyPrice: 499,
        currency: 'USD',
        symbol: '$',
        onlyPP: false,
        razorpayUPI: true,
        isLoading: true
    });

    useEffect(() => {
        if (isOpen) {
            setStep(0);
            getSubscriptionStatus().then((data) => {
                if (data) {
                    const currSymbol = (data.currency === 'INR' || data.currency === '₹') ? '₹' : '$';
                    setSubscriptionConfig({
                        monthlyPrice: data.monthlyPrice || 199,
                        quartarlyPrice: data.quartarlyPrice || 399,
                        yearlyPrice: data.yearlyPrice || 499,
                        currency: data.currency || 'USD',
                        symbol: currSymbol,
                        onlyPP: Boolean(data.onlyPP),
                        razorpayUPI: Boolean(data.razorpayUPI),
                        isLoading: false
                    });
                }
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const nextStep = (plan) => {
        setSelectedPlan(plan);
        setStep(1);
    };

    const previousStep = () => {
        setStep(0);
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
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden relative my-auto">
                
                {/* Executive Header Bar */}
                <div className="px-6 py-4.5 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-500/20">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-indigo-500/30 border border-amber-400/40 flex items-center justify-center text-amber-400 font-extrabold shadow-sm shrink-0">
                            <FaCrown className="w-5 h-5 text-amber-400 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">PRO Membership &amp; Upgrades</h3>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                    Instant Activation
                                </span>
                            </div>
                            <p className="text-[11px] text-indigo-200/80">Native In-Dashboard Upgrade • Zero Redirects</p>
                        </div>
                    </div>
                    
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                        <FaTimes className="w-4 h-4" />
                    </button>
                </div>

                {/* Interactive Step Breadcrumb Bar */}
                <div className="bg-slate-50 border-b border-slate-200/80 px-6 py-2.5 flex items-center justify-between text-xs font-bold shrink-0">
                    <div className="flex items-center gap-6">
                        <div className={`flex items-center gap-2 ${step === 0 ? 'text-indigo-600 font-extrabold' : 'text-slate-500'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>1</span>
                            <span>Select Tier Plan</span>
                        </div>
                        <span className="text-slate-300">→</span>
                        <div className={`flex items-center gap-2 ${step === 1 ? 'text-indigo-600 font-extrabold' : 'text-slate-400'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                            <span>Secure Payment ({subscriptionConfig.onlyPP ? 'PayPal' : 'Cards / PayPal / UPI'})</span>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <FaLock className="w-3 h-3 text-emerald-500" />
                        <span>256-Bit SSL Encrypted</span>
                    </div>
                </div>

                {/* Modal Scroll Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gradient-to-b from-slate-50/50 via-white to-slate-50/30">
                    <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                        <Elements stripe={stripePromise}>
                            <div className="w-full">
                                {step === 0 && (
                                    <div className="space-y-6">
                                        <div className="text-center max-w-xl mx-auto space-y-2">
                                            <span className="px-3.5 py-1 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                                                <FaMagic className="w-3.5 h-3.5 text-indigo-500" />
                                                Choose Your Career Booster Plan
                                            </span>
                                            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Accelerate Your Job Applications with AI</h2>
                                            <p className="text-xs sm:text-sm text-slate-500">
                                                Gain full access to unlimited resume exports, cover letter builders, executive bio enhancers &amp; ATS keywords optimizer.
                                            </p>
                                        </div>

                                        <HomepagePricing nextStep={nextStep} />
                                    </div>
                                )}

                                {step === 1 && (
                                    <div className="space-y-6 max-w-4xl mx-auto">
                                        <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                                            <button
                                                type="button"
                                                onClick={previousStep}
                                                className="px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer">
                                                ← Change Selected Plan
                                            </button>
                                            <div className="text-right">
                                                <span className="text-xs text-slate-500">Active Selection:</span>
                                                <div className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
                                                    {selectedPlan} Plan ({subscriptionConfig.symbol}{selectedPlan === 'monthly' ? subscriptionConfig.monthlyPrice : selectedPlan === 'halfYear' ? subscriptionConfig.quartarlyPrice : subscriptionConfig.yearlyPrice})
                                                </div>
                                            </div>
                                        </div>

                                        <ElementsConsumer>
                                            {({ stripe, elements }) => (
                                                <Checkout
                                                    currency={subscriptionConfig.symbol}
                                                    currencyCode={currencyCode}
                                                    onlyPP={subscriptionConfig.onlyPP}
                                                    previousStep={previousStep}
                                                    stripe={stripe}
                                                    elements={elements}
                                                    monthly={subscriptionConfig.monthlyPrice}
                                                    quartarly={subscriptionConfig.quartarlyPrice}
                                                    yearly={subscriptionConfig.yearlyPrice}
                                                    selectedPlan={selectedPlan}
                                                />
                                            )}
                                        </ElementsConsumer>
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
