import React, { useState, useEffect } from 'react';
import { FaTimes, FaCrown, FaCheck, FaShieldAlt, FaLock } from 'react-icons/fa';
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
    const [currency, setCurrency] = useState('$');

    useEffect(() => {
        if (isOpen) {
            setStep(0);
            getSubscriptionStatus().then((data) => {
                if (data && data.currency) {
                    setCurrency(data.currency === 'USD' ? '$' : '₹');
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
    const paypalOptions = {
        'client-id': paypalClientId || 'sb',
        currency: currency === '₹' ? 'INR' : 'USD',
        intent: 'capture',
        'disable-funding': 'credit,card',
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden relative my-auto">
                
                {/* Executive Modal Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-amber-400 font-bold shrink-0">
                            <FaCrown className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Subscription &amp; Membership Plans</h3>
                            <p className="text-[11px] text-indigo-300">Native in-dashboard checkout with instant activation</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors">
                        <FaTimes className="w-4 h-4" />
                    </button>
                </div>

                {/* Modal Scroll Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8">
                    <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                        <Elements stripe={stripePromise}>
                            <div className="w-full">
                                {step === 0 && (
                                    <div>
                                        <div className="text-center mb-6">
                                            <span className="px-3.5 py-1 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full inline-flex items-center gap-1.5 mb-2">
                                                <FaCrown className="w-3.5 h-3.5 text-amber-500" /> Select Your Subscription Tier
                                            </span>
                                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Unlock Premium AI Resume &amp; Job Tools</h2>
                                            <p className="text-xs text-slate-500 mt-1">Instant activation • Secure encrypted checkout • Cancel anytime</p>
                                        </div>

                                        <HomepagePricing nextStep={nextStep} />
                                    </div>
                                )}

                                {step === 1 && (
                                    <div>
                                        <div className="mb-4 flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={previousStep}
                                                className="px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5">
                                                ← Back to Plan Options
                                            </button>
                                            <span className="text-xs font-bold text-slate-700 capitalize">
                                                Selected Plan: <strong className="text-indigo-600 uppercase">{selectedPlan}</strong>
                                            </span>
                                        </div>
                                        <ElementsConsumer>
                                            {({ stripe, elements }) => (
                                                <Checkout
                                                    currency={currency}
                                                    currencyCode={currency === '₹' ? 'INR' : 'USD'}
                                                    onlyPP={false}
                                                    previousStep={previousStep}
                                                    stripe={stripe}
                                                    elements={elements}
                                                    monthly={199}
                                                    quartarly={399}
                                                    yearly={499}
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
