import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { getSubscriptionStatus } from '../../services/api/platform';

/**
 * PremiumUpgradeModal
 * 
 * High-conversion upsell modal presented when a Free candidate attempts to
 * download or export their resume. Dynamically reads authoritative pricing
 * from MariaDB configuration (zero hardcoded prices).
 */
const PremiumUpgradeModal = ({
    isOpen,
    onClose,
    onUpgrade,
    downloadType = 'pdf',
    resumeTitle = 'Resume'
}) => {
    const { t } = useTranslation('common');
    const modalRef = useRef(null);
    const upgradeBtnRef = useRef(null);
    const returnFocusRef = useRef(null);

    const [pricing, setPricing] = useState({
        monthlyPrice: null,
        yearlyPrice: null,
        currency: 'USD',
        currencySymbol: '$',
        marketingBadge: 'PRO CAREER PASS',
        isLoading: true
    });

    useEffect(() => {
        let isMounted = true;
        if (isOpen) {
            getSubscriptionStatus().then(config => {
                if (!isMounted) return;
                const curr = String(config?.currency || 'USD').toUpperCase();
                const matrix = config?.pricingMatrix?.[curr] || {};
                const mPrice = Number(matrix.monthly ?? config?.monthlyPrice);
                const yPrice = Number(matrix.yearly ?? config?.yearlyPrice);
                const sym = config?.currencySymbol || (curr === 'INR' ? '₹' : curr === 'EUR' ? '€' : '$');

                if (!Number.isFinite(mPrice)) {
                    setPricing(prev => ({ ...prev, isLoading: false, error: 'Unable to load current pricing. Please retry.' }));
                    return;
                }

                setPricing({
                    monthlyPrice: mPrice,
                    yearlyPrice: Number.isFinite(yPrice) ? yPrice : null,
                    currency: curr,
                    currencySymbol: sym,
                    marketingBadge: config?.marketingBadge || 'PRO CAREER PASS',
                    isLoading: false,
                    error: null
                });
            }).catch(() => {
                if (isMounted) {
                    setPricing(prev => ({ ...prev, isLoading: false, error: 'Unable to load current pricing. Please retry.' }));
                }
            });
        }
        return () => { isMounted = false; };
    }, [isOpen]);

    // Body scroll locking and focus management
    useEffect(() => {
        if (!isOpen) return undefined;

        document.body.style.overflow = 'hidden';
        returnFocusRef.current = document.activeElement;

        const focusTimer = setTimeout(() => {
            upgradeBtnRef.current?.focus();
        }, 50);

        return () => {
            clearTimeout(focusTimer);
            document.body.style.overflow = 'unset';
            returnFocusRef.current?.focus?.();
        };
    }, [isOpen]);

    // Keyboard accessibility: Close on Escape and Tab focus trap
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key === 'Tab' && modalRef.current) {
                const focusable = modalRef.current.querySelectorAll(
                    'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusable.length > 0) {
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const isDocx = downloadType === 'docx';
    const isShare = downloadType === 'share';
    const featureTitle = isDocx 
        ? 'Microsoft Word (.docx)' 
        : isShare 
            ? 'Live Public Share Link' 
            : 'High-Quality Vector PDF';

    return (
        <AnimatePresence>
            <div 
                className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm pointer-events-auto"
                onClick={onClose}
                role="dialog"
                aria-modal="true"
                aria-labelledby="upgrade-modal-title"
            >
                <motion.div
                    ref={modalRef}
                    initial={{ opacity: 0, scale: 0.94, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 14 }}
                    transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                    className="relative w-full max-w-lg overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Top Decorative Gradient Banner */}
                    <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white overflow-hidden">
                        {/* Background subtle radial glow */}
                        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />
                        <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-purple-500/20 blur-xl pointer-events-none" />

                        {/* Dismiss Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            aria-label="Close modal"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Top Badge */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[11px] font-black uppercase tracking-wider shadow-sm mb-3">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span>{pricing.marketingBadge}</span>
                        </div>

                        {/* Modal Header */}
                        <h2 id="upgrade-modal-title" className="text-2xl font-black tracking-tight text-white">
                            Your Resume Is Ready!
                        </h2>
                        <p className="mt-1 text-sm text-indigo-100/90 leading-relaxed">
                            {isShare
                                ? 'Share your live public resume link with Pro Career Pass.'
                                : `Download your polished resume as a ${featureTitle} with Pro Career Pass.`}
                        </p>
                    </div>

                    {/* Features Checklist */}
                    <div className="p-6 space-y-5 bg-white">
                        <div className="space-y-3">
                            {[
                                { text: 'High-quality vector PDF export', subtext: 'Crisp text on all screens and ATS scanners' },
                                { text: 'Native Microsoft Word (.docx) & 51 Templates', subtext: 'Forensic-grade formatting for every industry' },
                                { text: 'AI-powered resume enhancement', subtext: 'STAR bullet optimizer & Executive summary writer' },
                                { text: '100% Watermark-free professional delivery', subtext: 'Zero platform watermarks on your final documents' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mt-0.5">
                                        <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-900">{item.text}</p>
                                        <p className="text-[11px] text-slate-500">{item.subtext}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Authoritative Price Display */}
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/50 border border-indigo-100/80 flex items-center justify-between">
                            <div>
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                    Fixed-Term Pro Pass
                                </span>
                                <span className="text-xs text-slate-600">
                                    Full access • No recurring auto-charges
                                </span>
                            </div>
                            <div className="text-right">
                                {pricing.isLoading ? (
                                    <div className="h-7 w-20 bg-slate-200 animate-pulse rounded-lg" />
                                ) : pricing.error ? (
                                    <span className="text-xs font-bold text-rose-600">{pricing.error}</span>
                                ) : (
                                    <div>
                                        <span className="text-2xl font-black text-indigo-900 tracking-tight">
                                            {pricing.currencySymbol}{pricing.monthlyPrice}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-500"> / month</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-2.5 pt-1">
                            <button
                                ref={upgradeBtnRef}
                                type="button"
                                onClick={onUpgrade}
                                disabled={pricing.isLoading || !!pricing.error || pricing.monthlyPrice === null}
                                className={`w-full py-3.5 px-6 rounded-xl font-bold text-white text-sm transition-all flex items-center justify-center gap-2 ${
                                    pricing.isLoading || !!pricing.error || pricing.monthlyPrice === null
                                        ? 'bg-slate-400 cursor-not-allowed opacity-60'
                                        : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.99] shadow-lg shadow-indigo-600/25 cursor-pointer'
                                }`}
                            >
                                <span>{isShare ? 'Upgrade & Share' : 'Upgrade & Download'}</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                                Maybe Later
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default PremiumUpgradeModal;
