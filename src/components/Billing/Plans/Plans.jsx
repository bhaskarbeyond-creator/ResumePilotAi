import React, { useState, useEffect } from 'react';
import { FaCrown, FaCheck, FaShieldAlt, FaLock, FaCreditCard, FaPaypal, FaRupeeSign, FaTag, FaPercent, FaArrowRight, FaUserCheck, FaGift, FaCheckCircle, FaExclamationTriangle, FaClock, FaArrowLeft, FaCalendarAlt, FaFileInvoice, FaHistory, FaExchangeAlt, FaUndo, FaTimes } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import Checkout from './Checkout';
import { getSubscriptionStatus, getCoupons, getActiveCoupons, validateCoupon, getUserTransactions, getUserInvoices, getSystemSettings } from '../../../services/api/platform';
import { useServiceAvailability, resolveUsable } from '../../../hooks/useServiceAvailability';
import { getUserMembership } from '../../../data/entitlements';
import { parseSafeDate, isUserPremium } from '../../../utils/subscriptionUtils';
import { printAuthoritativeCreditNote, printAuthoritativeInvoice } from '../../../utils/authoritativeInvoice';
import { isAuthoritativeSettings } from '../../../utils/moduleFlags';
import {
    formatCurrencyAmount,
    formatPlanPrice,
    resolveCurrencyCode,
    resolveCurrencySymbol,
} from '../../../utils/currencyFormat';
import fire from '../../../conf/fire';
import HomepageNavbar from '../../Marketing/elements/HomepageNavbar';
import HomepageFooter from '../../Marketing/elements/HomepageFooter';
import HomepagePricing from '../../Marketing/elements/HomepagePricing';
import AuthWrapper from '../../auth/authWrapper/AuthWrapper';
import '../../Marketing/public-site.css';
import './Plans.scss';
import '../../CustomPage/CustomPage.scss';

const PRO_UNLOCKED_FEATURES = [
    'All 51 ATS Resume Templates & Real-time ATS Score',
    'Executive Bio & Summary AI Synthesizer (100 ops/day)',
    'AI Mock Interview Coach & CBT Simulator',
    'Cover Letter AI Builder & Job Tailoring',
    '1-Click Clean PDF, Word DocX & Public Portfolio Links',
    'Priority Cloud Sync & 24/7 VIP Support'
];

const PlansPage = (props) => {
    // Check path to distinguish public /billing/plans vs dashboard /dashboard/plans
    const isEmbeddedInDashboard = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard');

    // Dashboard View State
    const [activeTab, setActiveTab] = useState('plans'); // 'plans', 'invoices', 'manage'
    const [step, setStep] = useState(1); // 1 = Cart & Plan Selection, 2 = Native Checkout
    const [selectedDuration, setSelectedDuration] = useState('12'); // '1', '6', '12' months
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [userCurrentMembership, setUserCurrentMembership] = useState('Loading Tier...');
    const [membershipExpiry, setMembershipExpiry] = useState('');
    const [_membershipExpiryDate, setMembershipExpiryDate] = useState(null);
    const [candidateName, setCandidateName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    // Advanced Enterprise Features & Addon Modules State
    const [availableCoupons, setAvailableCoupons] = useState({});
    const [enableCouponsModule, setEnableCouponsModule] = useState(false);
    const [transactionsList, setTransactionsList] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [transactionsError, setTransactionsError] = useState('');
    const [invoicesList, setInvoicesList] = useState([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [invoicesError, setInvoicesError] = useState('');

    // Classic Public View State (for /billing/plans)
    const [publicStep, setPublicStep] = useState(0);
    const [publicSelectedPlan, setPublicSelectedPlan] = useState('monthly');
    const [authModal, setAuthModal] = useState({ open: false, mode: 'signup', message: '' });

    const handleOpenAuthModal = (mode = 'signup', message = '') => {
        setAuthModal({ open: true, mode, message });
    };

    const handleCloseAuthModal = () => {
        setAuthModal({ open: false, mode: 'signup', message: '' });
    };

    const [subscriptionConfig, setSubscriptionConfig] = useState({
        monthlyPrice: null,
        quartarlyPrice: null,
        yearlyPrice: null,
        currency: '',
        symbol: '',
        state: false,
        onlyPP: false,
        razorpayUPI: false,
        stripeEnabled: false,
        paypalEnabled: false,
        razorpayEnabled: false,
        paytmEnabled: false,
        phonepeEnabled: false,
        sandboxMode: true,
        isLoading: true,
        configurationAvailable: false,
        configurationError: '',
    });

    // Live provider availability from the backend operational-status collector.
    // A gateway is offered only when the operator enabled it AND the backend
    // reports it can actually serve a request. This is what prevents a
    // "disabled PayPal" from rendering as a working payment option.
    const { availability: serviceAvailability, status: availabilityStatus } = useServiceAvailability();
    const livePayments = serviceAvailability?.payments || {};
    const billingEnabled = subscriptionConfig.configurationAvailable && subscriptionConfig.state === true;
    const paymentAvailability = {
        stripeEnabled: billingEnabled && resolveUsable(subscriptionConfig.stripeEnabled, livePayments.stripe, availabilityStatus),
        paypalEnabled: billingEnabled && resolveUsable(subscriptionConfig.paypalEnabled, livePayments.paypal, availabilityStatus),
        razorpayEnabled: billingEnabled && resolveUsable(subscriptionConfig.razorpayEnabled, livePayments.razorpay, availabilityStatus),
        paytmEnabled: billingEnabled && resolveUsable(subscriptionConfig.paytmEnabled, livePayments.paytm, availabilityStatus),
        phonepeEnabled: billingEnabled && resolveUsable(subscriptionConfig.phonepeEnabled, livePayments.phonepe, availabilityStatus),
    };
    const stripePromise = React.useMemo(() => {
        const publishableKey = String(conf.stripe_publishable_key || '').trim();
        return paymentAvailability.stripeEnabled && publishableKey
            ? loadStripe(publishableKey)
            : Promise.resolve(null);
    }, [paymentAvailability.stripeEnabled]);

    useEffect(() => {
        // Fetch System Addon Modules Settings for enableCouponsModule toggle
        getSystemSettings().then((settings) => {
            const mods = (settings && settings.modules) || {};
            // DIR-057: shared provenance predicate (accepts the raw `mariadb*`
            // and the adapter-relabelled `remote` vocabularies).
            const isCouponsOn = isAuthoritativeSettings(settings)
                && mods.enableCouponsModule === true;
            setEnableCouponsModule(isCouponsOn);
            if (!isCouponsOn) {
                setAppliedCoupon(null);
                setAvailableCoupons({});
            }
        });

        // Realtime event listener for live Addon Module toggle changes from Admin
        const handleModulesUpdate = (e) => {
            if (e.detail?.modules?.enableCouponsModule !== undefined) {
                const isCouponsOn = Boolean(e.detail.modules.enableCouponsModule);
                setEnableCouponsModule(isCouponsOn);
                if (!isCouponsOn) {
                    setAppliedCoupon(null);
                    setAvailableCoupons([]);
                } else {
                    getActiveCoupons().then((dynamic) => setAvailableCoupons(Array.isArray(dynamic) ? dynamic : []));
                }
            }
        };
        window.addEventListener('systemSettingsUpdated', handleModulesUpdate);

        // Fetch dynamic coupons from the authoritative backend API.
        getActiveCoupons().then((dynamic) => {
            setAvailableCoupons(Array.isArray(dynamic) ? dynamic : []);
        });

        // Realtime Auth State Listener for robust dynamic details
        const unsubscribe = fire.auth().onAuthStateChanged((currentUser) => {
            if (currentUser) {
                setUserEmail(currentUser.email || '');
                if (currentUser.displayName) {
                    setCandidateName(currentUser.displayName);
                }

                // Fetch billing transactions history for user
                setLoadingTransactions(true);
                setTransactionsError('');
                getUserTransactions(currentUser.uid).then((txns) => {
                    setTransactionsList(txns);
                }).catch((error) => {
                    setTransactionsList([]);
                    setTransactionsError(error.message || 'Transaction history is unavailable.');
                }).finally(() => setLoadingTransactions(false));

                setInvoicesLoading(true);
                setInvoicesError('');
                getUserInvoices(currentUser.uid).then((invoices) => {
                    setInvoicesList(invoices);
                }).catch((error) => {
                    setInvoicesList([]);
                    setInvoicesError(error.message || 'Invoice history is unavailable.');
                }).finally(() => setInvoicesLoading(false));

                // Query the authenticated MariaDB profile API for membership, name, expiry, and fixed-term status
                getUserMembership(currentUser.uid).then((data) => {
                    if (data?._entitlementStale === true || data?._entitlementSource !== 'remote') {
                        setUserCurrentMembership('Unavailable');
                        setMembershipExpiry('');
                        setMembershipExpiryDate(null);
                        return;
                    }
                    if (data) {
                        const firstName = data.firstname || data.profile?.firstname || '';
                        const lastName = data.lastname || data.profile?.lastname || '';
                        if (firstName || lastName) {
                            setCandidateName(`${firstName} ${lastName}`.trim());
                        }
                        if (data.email) {
                            setUserEmail(data.email);
                        }

                        // Resolve membership tier
                        const rawMembership = data.membership || 'Basic';
                        let resolvedTier = rawMembership;

                        // Check if membership has expired
                        let isExpired = false;
                        const membershipEndsRaw = data.membershipEnds;
                        if (membershipEndsRaw) {
                            const expiryDate = parseSafeDate(membershipEndsRaw);
                            if (expiryDate) {
                                setMembershipExpiryDate(expiryDate);
                                isExpired = expiryDate < new Date();
                                setMembershipExpiry(
                                    expiryDate.toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })
                                );
                            }
                        }

                        const isEnterprise = String(rawMembership).toLowerCase() === 'enterprise' || Boolean(data?.hasEnterpriseMembership || data?.profile?.hasEnterpriseMembership);
                        const isPremium = isEnterprise || isUserPremium(rawMembership, isExpired ? new Date(0) : membershipEndsRaw);

                        if (isEnterprise) {
                            resolvedTier = isExpired ? 'Enterprise (Suspended)' : 'Enterprise';
                        } else if (isPremium && !isExpired) {
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
                    setUserCurrentMembership('Unavailable');
                    setMembershipExpiry('');
                });
            } else {
                setUserCurrentMembership('Guest');
                setUserEmail('');
                setCandidateName('');
                setTransactionsList([]);
                setInvoicesList([]);
                setTransactionsError('');
                setInvoicesError('');
            }
        });

        // Global Subscription Config. Prices, provider flags, and supplier legal
        // data are displayed only when confirmed by the MariaDB projection.
        getSubscriptionStatus().then((data) => {
            if (!isAuthoritativeSettings(data)) {
                setSubscriptionConfig(current => ({
                    ...current,
                    isLoading: false,
                    configurationAvailable: false,
                    configurationError: 'Authoritative billing configuration is temporarily unavailable.',
                    state: false,
                    stripeEnabled: false,
                    paypalEnabled: false,
                    razorpayEnabled: false,
                    paytmEnabled: false,
                    phonepeEnabled: false,
                }));
                return;
            }
            // DIR-018 AC-3: the base currency now resolves through the single
            // shared helper instead of a local, drifting symbol map. A blank or
            // unrecognised code falls back to the platform base currency (INR)
            // rather than to an unlabelled code string.
            const baseCurr = resolveCurrencyCode(data.currency);
            setSubscriptionConfig({
                monthlyPrice: Number.isFinite(Number(data.monthlyPrice)) ? Number(data.monthlyPrice) : null,
                quartarlyPrice: Number.isFinite(Number(data.quartarlyPrice)) ? Number(data.quartarlyPrice) : null,
                yearlyPrice: Number.isFinite(Number(data.yearlyPrice)) ? Number(data.yearlyPrice) : null,
                currency: baseCurr,
                symbol: resolveCurrencySymbol(baseCurr),
                state: data.state === true,
                onlyPP: data.onlyPP === true,
                razorpayUPI: data.razorpayUPI === true,
                stripeEnabled: data.stripeEnabled === true,
                paypalEnabled: data.paypalEnabled === true,
                razorpayEnabled: data.razorpayEnabled === true,
                paytmEnabled: data.paytmEnabled === true,
                phonepeEnabled: data.phonepeEnabled === true,
                sandboxMode: data.sandboxMode === true,
                supplierLegalName: data.supplierLegalName || '',
                supplierTradeName: data.supplierTradeName || '',
                supplierAddress: data.supplierAddress || '',
                supplierCity: data.supplierCity || '',
                supplierState: data.supplierState || '',
                supplierStateCode: data.supplierStateCode || '',
                supplierPincode: data.supplierPincode || '',
                supplierPan: data.supplierPan || '',
                supplierGstin: data.supplierGstin || data.companyTaxId || '',
                sacCode: data.sacCode || '',
                invoicePrefix: data.invoicePrefix || '',
                financialYear: data.financialYear || '',
                taxRate: Number.isFinite(Number(data.taxRate)) ? Number(data.taxRate) : 0,
                enableTax: data.enableTax === true,
                taxName: data.taxName || '',
                taxInclusive: data.taxInclusive === true,
                companyTaxId: data.companyTaxId || '',
                requireCustomerTaxId: data.requireCustomerTaxId === true,
                isLoading: false,
                configurationAvailable: true,
                configurationError: '',
            });
        }).catch(() => setSubscriptionConfig(current => ({
            ...current,
            isLoading: false,
            configurationAvailable: false,
            configurationError: 'Authoritative billing configuration is temporarily unavailable.',
        })));

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

    // Existing paid time is preserved by extending the new term from membershipEnds on
    // the server, so no client-calculated monetary credit is applied.
    const getProRatedCredit = () => 0;

    // Pricing calculations for Dashboard View
    const getMonthlyEquivalent = () => {
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
        if (!enableCouponsModule || !appliedCoupon) return 0;
        const subtotal = getRawSubtotal();
        return Math.round((subtotal * appliedCoupon.discount) / 100);
    };

    const getFinalTotal = () => {
        const subtotal = getRawSubtotal();
        const discount = getCouponDiscountAmount();
        const proCredit = getProRatedCredit();
        return Math.max(1, subtotal - discount - proCredit);
    };

    const handleApplyCoupon = async (e, explicitCode = null) => {
        if (e) e.preventDefault();
        setCouponError('');
        if (!enableCouponsModule) {
            setCouponError('Promo coupons module is currently disabled by administrator.');
            return;
        }
        const code = (explicitCode || couponInput).trim().toUpperCase();
        if (!code) {
            setCouponError('Please enter or select a valid coupon code.');
            return;
        }

        const planId = selectedDuration === '1' ? 'monthly' : selectedDuration === '6' ? 'halfYear' : 'yearly';
        const currentUser = fire.auth().currentUser;

        try {
            const res = await validateCoupon(code, planId, currentUser?.uid);
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
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError('');
    };

    const paypalClientId = (conf.paypalClientID || import.meta.env.VITE_PAYPAL_CLIENT_ID || '').trim();
    // DIR-018 AC-3: this used to fall back to the literal 'USD', so any billing
    // configuration that had not yet resolved rendered a US dollar code to an
    // Indian storefront and sent the gateway a USD currency. The fallback is now
    // the platform's authoritative base currency (INR) via resolveCurrencyCode.
    const currencyCode = resolveCurrencyCode(subscriptionConfig.currency);
    // DIR-018 AC-3: every price on this page renders through the shared
    // formatter, so Indian grouping ("₹1,499") is identical on the cards, in
    // the summary and in checkout. `plan` uses whole units (subscription prices
    // are whole rupees in practice); `amount` keeps paise for tax/discount lines.
    const money = (value) => formatPlanPrice(value, { currency: currencyCode });
    const amount = (value) => formatCurrencyAmount(value, { currency: currencyCode });
    const paypalOptions = {
        'client-id': paypalClientId,
        currency: currencyCode,
        intent: 'capture',
        'disable-funding': 'credit,card',
    };
    const membershipKnown = !['Loading Tier...', 'Unavailable'].includes(userCurrentMembership);
    const membershipActive = userCurrentMembership === 'Premium Pro' || userCurrentMembership === 'Enterprise';

    // IF ACCESSED AS PUBLIC PAGE (/billing/plans) -> RENDER THE CLASSIC ORIGINAL PUBLIC VIEW
    if (!isEmbeddedInDashboard) {
        return (
            <PayPalScriptProvider options={paypalOptions} deferLoading={!paymentAvailability.paypalEnabled || !paypalClientId}>
                <Elements stripe={stripePromise}>
                    <div className="rp-public-site">
                        <HomepageNavbar onOpenAuthModal={handleOpenAuthModal} />
                        <main style={{ minHeight: '80vh' }}>
                            {publicStep === 0 && (
                                <HomepagePricing nextStep={handlePublicNextStep} onOpenAuthModal={handleOpenAuthModal} />
                            )}
                            {publicStep === 1 && (
                                <div className="rp-container" style={{ paddingTop: '110px', paddingBottom: '60px' }}>
                                    <ElementsConsumer>
                                        {({ stripe, elements }) => (
                                            <Checkout
                                                user={props.user || fire.auth().currentUser}
                                                currency={subscriptionConfig.symbol}
                                                currencyCode={currencyCode}
                                                onlyPP={subscriptionConfig.onlyPP}
                                                stripeEnabled={paymentAvailability.stripeEnabled}
                                                paypalEnabled={paymentAvailability.paypalEnabled}
                                                razorpayEnabled={paymentAvailability.razorpayEnabled}
                                                paytmEnabled={paymentAvailability.paytmEnabled}
                                                phonepeEnabled={paymentAvailability.phonepeEnabled}
                                                sandboxMode={subscriptionConfig.sandboxMode}
                                                couponCode={appliedCoupon?.code || null}
                                                taxConfig={{
                                                    enableTax: subscriptionConfig.enableTax,
                                                    taxName: subscriptionConfig.taxName,
                                                    taxRate: subscriptionConfig.taxRate,
                                                    taxInclusive: subscriptionConfig.taxInclusive,
                                                    companyTaxId: subscriptionConfig.companyTaxId,
                                                    requireCustomerTaxId: subscriptionConfig.requireCustomerTaxId,
                                                }}
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
                                </div>
                            )}
                        </main>
                        <HomepageFooter />

                        {/* Integrated Auth Modal */}
                        {authModal.open && (
                            <AuthWrapper
                                isAuthModalOpen={authModal.open}
                                authModalMode={authModal.mode}
                                authModalMessage={authModal.message}
                                closeAuthModal={handleCloseAuthModal}
                            />
                        )}
                    </div>
                </Elements>
            </PayPalScriptProvider>
        );
    }

    // IF ACCESSED FROM DASHBOARD (/dashboard/plans) -> RENDER THE RICH CANDIDATE DASHBOARD PAGE
    return (
        <PayPalScriptProvider options={paypalOptions} deferLoading={!paymentAvailability.paypalEnabled || !paypalClientId}>
            <Elements stripe={stripePromise}>
                <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
                    {!subscriptionConfig.isLoading && !subscriptionConfig.configurationAvailable && (
                        <div role="alert" className="rounded-2xl border border-cuba-warning-soft bg-cuba-warning-soft p-4 text-sm font-semibold text-cuba-warning">
                            {subscriptionConfig.configurationError || 'Verified billing configuration is unavailable. Purchases are disabled.'}
                        </div>
                    )}
                    {!subscriptionConfig.isLoading && subscriptionConfig.configurationAvailable && subscriptionConfig.state !== true && (
                        <div role="status" className="rounded-2xl border border-cuba-line-strong bg-cuba-canvas p-4 text-sm font-semibold text-cuba-ink">
                            Paid subscriptions are currently disabled by the platform operator.
                        </div>
                    )}
                    
                    {/* Dashboard Header Bar */}
                    <div className="bg-cuba-card rounded-2xl border border-cuba-line p-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-cuba-primary-soft border border-cuba-primary-soft flex items-center justify-center text-cuba-primary-ink-strong font-extrabold text-xl shrink-0">
                                <FaCrown className="w-6 h-6 text-cuba-warning" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h1 className="text-xl font-extrabold text-cuba-ink">PRO Membership &amp; Subscription Plans</h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border uppercase ${
                                        userCurrentMembership.includes('Enterprise')
                                            ? (userCurrentMembership.includes('Suspended')
                                                ? 'bg-cuba-danger-soft text-cuba-danger border-cuba-danger-soft'
                                                : 'bg-cuba-primary-soft text-cuba-primary-ink-strong border-cuba-primary-soft')
                                            : (userCurrentMembership.includes('Premium')
                                                ? (userCurrentMembership.includes('Expired')
                                                    ? 'bg-cuba-danger-soft text-cuba-danger border-cuba-danger-soft'
                                                    : 'bg-cuba-warning-soft text-cuba-warning border-cuba-warning-soft')
                                                : 'bg-cuba-success-soft text-cuba-success border-cuba-success-soft')
                                    }`}>
                                        Active Tier: {userCurrentMembership}
                                    </span>
                                    {membershipExpiry && (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cuba-elevated text-cuba-ink-muted border border-cuba-line flex items-center gap-1">
                                            <FaCalendarAlt className="w-2.5 h-2.5 text-cuba-ink-subtle" />
                                            Expires: {membershipExpiry}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-cuba-ink-muted mt-0.5">Upgrade your account to unlock unlimited AI resumes, cover letters, and priority export tools.</p>
                            </div>
                        </div>

                        <a href="/dashboard/settings" className="px-4 py-2.5 bg-cuba-elevated hover:bg-cuba-line text-cuba-ink text-xs font-bold rounded-xl transition-all flex items-center gap-2 self-start md:self-auto shrink-0">
                            <FaArrowLeft className="w-3 h-3" />
                            <span>Back to Account Settings</span>
                        </a>
                    </div>

                    {/* Dashboard Navigation Tabs */}
                    <div className="flex items-center gap-2 border-b border-cuba-line pb-1 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setActiveTab('plans')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'plans'
                                    ? 'bg-cuba-primary-fill text-cuba-on-primary shadow-md shadow-cuba-primary/20'
                                    : 'bg-cuba-card text-cuba-ink-muted hover:bg-cuba-elevated border border-cuba-line'
                            }`}>
                            <FaCrown className="w-3.5 h-3.5" />
                            <span>Plans &amp; Upgrades</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('invoices')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'invoices'
                                    ? 'bg-cuba-primary-fill text-cuba-on-primary shadow-md shadow-cuba-primary/20'
                                    : 'bg-cuba-card text-cuba-ink-muted hover:bg-cuba-elevated border border-cuba-line'
                            }`}>
                            <FaFileInvoice className="w-3.5 h-3.5" />
                            <span>Billing History &amp; PDF Invoices ({transactionsList.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('manage')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'manage'
                                    ? 'bg-cuba-primary-fill text-cuba-on-primary shadow-md shadow-cuba-primary/20'
                                    : 'bg-cuba-card text-cuba-ink-muted hover:bg-cuba-elevated border border-cuba-line'
                            }`}>
                            <FaShieldAlt className="w-3.5 h-3.5" />
                            <span>Subscription Controls</span>
                        </button>
                    </div>

                    {/* TAB 1: PLANS & UPGRADES */}
                    {activeTab === 'plans' && (
                        <>
                            {/* STEP 1: CART PAGE & UPGRADE COMPARISON */}
                            {step === 1 && (
                                <div className="space-y-8">
                                    
                                    {/* Current Plan vs PRO Upgrade Hero Comparison Card */}
                                    <div className="bg-gradient-to-r from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to rounded-2xl p-6 text-cuba-on-primary border border-cuba-primary/30 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 shadow-md">
                                        <div className="space-y-2 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cuba-ink text-cuba-ink-subtle border border-cuba-line-strong uppercase">
                                                    Account: {candidateName ? `${candidateName} (${userEmail})` : userEmail || 'Candidate'}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cuba-success/20 text-cuba-night-success border border-cuba-success/30 uppercase">
                                                    INSTANT ACTIVATION
                                                </span>
                                            </div>
                                            <h3 className="text-xl font-extrabold text-cuba-on-primary tracking-tight">
                                                {userCurrentMembership === 'Enterprise'
                                                    ? <>Manage <strong className="text-cuba-night-primary">Enterprise Organization Plan</strong></>
                                                    : userCurrentMembership && userCurrentMembership !== 'Free' && userCurrentMembership !== 'Free Basic' && userCurrentMembership !== 'Loading Tier...'
                                                        ? <>Renew or Extend <strong className="text-cuba-night-warning">PRO Membership</strong></>
                                                        : <>Unlock <strong className="text-cuba-night-warning">AI Resume Builder PRO</strong> — Full Power Access</>
                                                }
                                            </h3>
                                            <p className="text-xs text-cuba-ink-subtle">
                                                {userCurrentMembership === 'Enterprise'
                                                    ? 'Your organization workspace includes team governance, institutional AI limits, and all career features.'
                                                    : 'Unlock full STAR AI synthesizer, watermark-free vector PDF, Word DocX export, and priority candidate support.'}
                                            </p>
                                        </div>

                                        {/* Unlocked Features Checklist */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-cuba-ink-subtle shrink-0">
                                            {PRO_UNLOCKED_FEATURES.map((feat, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-cuba-night-line px-3.5 py-2 rounded-xl border border-cuba-night-line">
                                                    <FaCheckCircle className="w-3.5 h-3.5 text-cuba-night-success shrink-0" />
                                                    <span className="font-semibold">{feat}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Duration Options Header */}
                                    <div className="text-center max-w-2xl mx-auto space-y-2 pt-2">
                                        <span className="px-3.5 py-1 text-xs font-extrabold text-cuba-primary-ink-strong bg-cuba-primary-soft border border-cuba-primary-soft rounded-full inline-flex items-center gap-1.5 shadow-2xs">
                                            <FaCrown className="w-3.5 h-3.5 text-cuba-warning" />
                                            Select Duration &amp; Maximize Savings
                                        </span>
                                        <h2 className="text-2xl sm:text-3xl font-extrabold text-cuba-ink tracking-tight">Choose your subscription billing cycle</h2>
                                        <p className="text-xs sm:text-sm text-cuba-ink-muted">
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
                                                    ? 'bg-cuba-card border-cuba-primary shadow-xl ring-2 ring-cuba-primary/20'
                                                    : 'bg-cuba-card border-cuba-line hover:border-cuba-line-strong'
                                            }`}>
                                            <div>
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="text-sm font-bold text-cuba-ink uppercase tracking-wider">1 Month</h4>
                                                    <span className="text-[10px] font-extrabold text-cuba-ink-muted bg-cuba-elevated px-2 py-0.5 rounded-full border border-cuba-line">Standard</span>
                                                </div>
                                                <div className="mb-4">
                                                    <span className="text-3xl font-extrabold text-cuba-ink">{money(subscriptionConfig.monthlyPrice)}</span>
                                                    <span className="text-xs text-cuba-ink-muted"> / month</span>
                                                </div>
                                                <p className="text-xs text-cuba-ink-muted">Flexible monthly plan. Cancel anytime with 1 click.</p>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-cuba-line flex items-center justify-between">
                                                <span className="text-xs text-cuba-ink-muted">Renews monthly</span>
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '1' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'}`}>
                                                    {selectedDuration === '1' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 2: 6 Months (Save 35%) */}
                                        <div
                                            onClick={() => setSelectedDuration('6')}
                                            className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                                selectedDuration === '6'
                                                    ? 'bg-cuba-card border-cuba-primary shadow-xl ring-2 ring-cuba-primary/20'
                                                    : 'bg-cuba-card border-cuba-line hover:border-cuba-line-strong'
                                            }`}>
                                            <div className="absolute -top-3 right-4">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill text-cuba-on-primary uppercase shadow-sm">
                                                    Save 35%
                                                </span>
                                            </div>
                                            <div>
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="text-sm font-bold text-cuba-ink uppercase tracking-wider">6 Months</h4>
                                                    <span className="text-[10px] font-extrabold text-cuba-primary-ink-strong bg-cuba-primary-soft px-2 py-0.5 rounded-full border border-cuba-primary-soft">Popular</span>
                                                </div>
                                                <div className="mb-1">
                                                    <span className="text-3xl font-extrabold text-cuba-ink">{money(Math.round(subscriptionConfig.quartarlyPrice / 6))}</span>
                                                    <span className="text-xs text-cuba-ink-muted"> / month</span>
                                                </div>
                                                <div className="text-xs text-cuba-ink-subtle line-through">
                                                    {money(subscriptionConfig.monthlyPrice * 6)} total
                                                </div>
                                                <p className="text-xs text-cuba-primary-ink-strong font-semibold mt-2">Billed as {money(subscriptionConfig.quartarlyPrice)} every 6 months</p>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-cuba-line flex items-center justify-between">
                                                <span className="text-xs text-cuba-success font-bold">Save {money(subscriptionConfig.monthlyPrice * 6 - subscriptionConfig.quartarlyPrice)}</span>
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '6' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'}`}>
                                                    {selectedDuration === '6' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 3: 12 Months (Best Value + 3 Months Free) */}
                                        <div
                                            onClick={() => setSelectedDuration('12')}
                                            className={`relative rounded-2xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                                selectedDuration === '12'
                                                    ? 'bg-gradient-to-b from-cuba-warning-soft/50 via-cuba-card to-cuba-primary-soft/30 border-cuba-warning shadow-xl ring-2 ring-cuba-warning/20 scale-[1.02]'
                                                    : 'bg-cuba-card border-cuba-line hover:border-cuba-line-strong'
                                            }`}>
                                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                                                <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-cuba-warning to-cuba-warning text-cuba-ink uppercase tracking-wider shadow-sm flex items-center gap-1">
                                                    <FaCrown className="w-2.5 h-2.5 text-cuba-ink" /> BEST VALUE • SAVE 50%
                                                </span>
                                            </div>
                                            <div>
                                                <div className="flex justify-between items-center mb-3 mt-1">
                                                    <h4 className="text-sm font-extrabold text-cuba-ink uppercase tracking-wider">12 Months</h4>
                                                    <span className="text-[10px] font-extrabold text-cuba-warning bg-cuba-warning-soft px-2 py-0.5 rounded-full border border-cuba-warning-soft">+3 Months Free</span>
                                                </div>
                                                <div className="mb-1">
                                                    <span className="text-3xl font-extrabold text-cuba-primary-ink-strong">{money(Math.round(subscriptionConfig.yearlyPrice / 12))}</span>
                                                    <span className="text-xs text-cuba-ink-muted"> / month</span>
                                                </div>
                                                <div className="text-xs text-cuba-ink-subtle line-through">
                                                    {money(subscriptionConfig.monthlyPrice * 12)} total
                                                </div>
                                                <p className="text-xs text-cuba-primary-ink-strong font-semibold mt-2">Billed as {money(subscriptionConfig.yearlyPrice)} annually</p>
                                            </div>

                                            <div className="mt-6 pt-4 border-t border-cuba-line flex items-center justify-between">
                                                <span className="text-xs text-cuba-warning font-extrabold">Save {money(subscriptionConfig.monthlyPrice * 12 - subscriptionConfig.yearlyPrice)}</span>
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedDuration === '12' ? 'border-cuba-warning bg-cuba-warning text-cuba-ink' : 'border-cuba-line-strong'}`}>
                                                    {selectedDuration === '12' && <FaCheck className="w-2.5 h-2.5 text-cuba-ink font-bold" />}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Order Summary & 1-Click Coupon Code Box */}
                                    <div className="bg-cuba-card rounded-2xl p-6 border border-cuba-line shadow-sm space-y-6">
                                        {enableCouponsModule && (
                                            <>
                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-cuba-line">
                                                    <div>
                                                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-cuba-ink flex items-center gap-2">
                                                            <FaTag className="text-cuba-primary-ink-strong" /> Apply Promo Coupon Discount
                                                        </h3>
                                                        <p className="text-xs text-cuba-ink-muted mt-0.5">Click a quick coupon pill below or enter your promo code manually</p>
                                                    </div>

                                                    {/* Coupon Form */}
                                                    <form onSubmit={(e) => handleApplyCoupon(e)} className="flex items-center gap-2 shrink-0">
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                value={couponInput}
                                                                onChange={(e) => setCouponInput(e.target.value)}
                                                                placeholder="Enter coupon code"
                                                                className="px-3.5 py-2 bg-cuba-canvas border border-cuba-line-strong rounded-xl text-xs font-mono font-bold text-cuba-ink uppercase focus:border-cuba-primary outline-none w-48"
                                                            />
                                                        </div>
                                                        <button
                                                            type="submit"
                                                            className="px-4 py-2 bg-cuba-primary-fill hover:bg-cuba-primary-strong text-cuba-on-primary font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer shrink-0">
                                                            Apply Coupon
                                                        </button>
                                                    </form>
                                                </div>

                                                {/* 1-Click Quick Coupon Pills */}
                                                {(Array.isArray(availableCoupons) ? availableCoupons : Object.values(availableCoupons)).length > 0 && (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs text-cuba-ink-muted font-semibold mr-1">Available Promo Coupons:</span>
                                                        {(Array.isArray(availableCoupons) ? availableCoupons : Object.values(availableCoupons)).map((couponItem) => {
                                                            const code = couponItem.code;
                                                            return (
                                                                <button
                                                                    key={code}
                                                                    type="button"
                                                                    onClick={(e) => handleApplyCoupon(e, code)}
                                                                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                                                        appliedCoupon?.code === code
                                                                            ? 'bg-cuba-success-soft text-cuba-success border-cuba-success-soft'
                                                                            : 'bg-cuba-canvas text-cuba-ink border-cuba-line hover:border-cuba-primary hover:text-cuba-primary-ink-strong'
                                                                    }`}>
                                                                    <FaTag className="w-2.5 h-2.5 text-cuba-primary-ink-strong" />
                                                                    <span>{code} (-{couponItem.discount}%)</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Coupon Error Notice */}
                                                {couponError && (
                                                    <div className="p-3 bg-cuba-danger-soft border border-cuba-danger-soft rounded-xl text-cuba-danger text-xs flex items-center gap-2">
                                                        <FaExclamationTriangle className="w-3.5 h-3.5 shrink-0 text-cuba-danger" />
                                                        <span>{couponError}</span>
                                                    </div>
                                                )}

                                                {/* Coupon Applied Badge */}
                                                {appliedCoupon && (
                                                    <div className="p-3.5 bg-cuba-success-soft border border-cuba-success-soft rounded-xl text-cuba-success text-xs flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <FaCheckCircle className="w-4 h-4 text-cuba-success shrink-0" />
                                                            <div>
                                                                <span className="font-extrabold uppercase">{appliedCoupon.code}</span> — {appliedCoupon.description}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={handleRemoveCoupon}
                                                            className="text-xs text-cuba-danger hover:text-cuba-danger underline font-bold cursor-pointer">
                                                            Remove
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Cart Calculations Table */}
                                        <div className="space-y-2.5 text-xs text-cuba-ink-muted pt-2">
                                            <div className="flex justify-between items-center">
                                                <span>Standard Plan Rate ({selectedDuration} Months)</span>
                                                <span className="font-semibold text-cuba-ink">{amount(getOriginalPriceBeforeDiscount())}</span>
                                            </div>

                                            {getDurationSavings() > 0 && (
                                                <div className="flex justify-between items-center text-cuba-success font-semibold">
                                                    <span>Duration Savings Discount</span>
                                                    <span>-{amount(getDurationSavings())}</span>
                                                </div>
                                            )}

                                            {enableCouponsModule && appliedCoupon && (
                                                <div className="flex justify-between items-center text-cuba-success font-bold">
                                                    <span>Coupon ({appliedCoupon.code} -{appliedCoupon.discount}%)</span>
                                                    <span>-{amount(getCouponDiscountAmount())}</span>
                                                </div>
                                            )}

                                            {getProRatedCredit() > 0 && (
                                                <div className="flex justify-between items-center text-cuba-success font-bold">
                                                    <span className="flex items-center gap-1">
                                                        <FaExchangeAlt className="w-3 h-3 text-cuba-success" />
                                                        Pro-Rated Unused Membership Credit
                                                    </span>
                                                    <span>-{amount(getProRatedCredit())}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center">
                                                <span>Sales Tax / GST</span>
                                                <span className="text-cuba-ink-subtle">Included ($0.00)</span>
                                            </div>

                                            <div className="pt-3 border-t border-cuba-line flex justify-between items-center text-base font-extrabold text-cuba-ink">
                                                <span>Total Due Today</span>
                                                <span className="text-2xl text-cuba-primary-ink-strong">{amount(getFinalTotal())}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button: Proceed to Checkout */}
                                    <div className="flex items-center justify-end pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="px-8 py-3.5 bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill hover:from-cuba-primary-strong hover:to-cuba-primary-strong text-cuba-on-primary text-xs font-extrabold uppercase tracking-wider rounded-2xl shadow-lg shadow-cuba-primary/20 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]">
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
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-cuba-card p-5 rounded-2xl border border-cuba-line shadow-xs">
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            className="px-4 py-2 text-xs font-bold text-cuba-primary-ink-strong bg-cuba-primary-soft hover:bg-cuba-primary-soft border border-cuba-primary-soft rounded-xl transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto">
                                            ← Edit Cart &amp; Duration
                                        </button>
                                        <div className="text-right">
                                            <span className="text-xs text-cuba-ink-muted">Order Summary Total:</span>
                                            <div className="text-base font-extrabold text-cuba-primary-ink-strong uppercase tracking-wider">
                                                {selectedDuration} Months • {amount(getFinalTotal())} {subscriptionConfig.currency}
                                                {appliedCoupon && <span className="ml-2 px-2 py-0.5 bg-cuba-success-soft text-cuba-success rounded text-[10px] border border-cuba-success-soft font-bold">{appliedCoupon.code}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Native Embedded Checkout Gateway */}
                                    <div className="bg-cuba-card rounded-2xl p-6 text-cuba-ink shadow-sm border border-cuba-line">
                                        <ElementsConsumer>
                                            {({ stripe, elements }) => (
                                                <Checkout
                                                    user={props.user || fire.auth().currentUser}
                                                    embedded={true}
                                                    currency={subscriptionConfig.symbol}
                                                    currencyCode={currencyCode}
                                                    onlyPP={subscriptionConfig.onlyPP}
                                                    stripeEnabled={paymentAvailability.stripeEnabled}
                                                    paypalEnabled={paymentAvailability.paypalEnabled}
                                                    razorpayEnabled={paymentAvailability.razorpayEnabled}
                                                    paytmEnabled={paymentAvailability.paytmEnabled}
                                                    phonepeEnabled={paymentAvailability.phonepeEnabled}
                                                    sandboxMode={subscriptionConfig.sandboxMode}
                                                    couponCode={appliedCoupon?.code || null}
                                                    taxConfig={{
                                                        enableTax: subscriptionConfig.enableTax,
                                                        taxName: subscriptionConfig.taxName,
                                                        taxRate: subscriptionConfig.taxRate,
                                                        taxInclusive: subscriptionConfig.taxInclusive,
                                                        companyTaxId: subscriptionConfig.companyTaxId,
                                                        requireCustomerTaxId: subscriptionConfig.requireCustomerTaxId,
                                                    }}
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
                        </>
                    )}

                    {/* TAB 2: BILLING HISTORY & PDF INVOICES */}
                    {activeTab === 'invoices' && (
                        <div className="bg-cuba-card rounded-2xl p-6 border border-cuba-line shadow-sm space-y-6">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-cuba-line pb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-cuba-ink">Billing History &amp; Payment Records</h3>
                                    <p className="text-xs text-cuba-ink-muted">Verified tax invoices are generated and delivered during completed checkout.</p>
                                </div>
                                <span className="text-xs font-bold text-cuba-ink-muted bg-cuba-elevated px-3 py-1.5 rounded-xl border border-cuba-line self-start sm:self-auto">
                                    {transactionsError ? 'Transaction total unavailable' : `Total Transactions: ${transactionsList.length}`}
                                </span>
                            </div>

                            {loadingTransactions ? (
                                <div className="text-center py-12 text-cuba-ink-subtle">
                                    <FaClock className="w-8 h-8 animate-spin mx-auto mb-2 text-cuba-primary-ink-strong" />
                                    <p className="text-xs">Fetching payment history...</p>
                                </div>
                            ) : transactionsError ? (
                                <div role="alert" className="rounded-xl border border-cuba-danger-soft bg-cuba-danger-soft p-5 text-sm text-cuba-danger">
                                    {transactionsError}
                                </div>
                            ) : transactionsList.length === 0 ? (
                                <div className="text-center py-12 text-cuba-ink-subtle space-y-2">
                                    <FaFileInvoice className="w-12 h-12 mx-auto text-cuba-ink-subtle" />
                                    <p className="text-sm font-bold text-cuba-ink">No Payment Records Found</p>
                                    <p className="text-xs text-cuba-ink-muted max-w-sm mx-auto">Provider-confirmed payment orders will appear here after checkout.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-cuba-canvas text-cuba-ink-muted font-extrabold uppercase border-b border-cuba-line">
                                            <tr>
                                                <th className="p-3">Payment Reference</th>
                                                <th className="p-3">Date</th>
                                                <th className="p-3">Plan / Cycle</th>
                                                <th className="p-3">Amount</th>
                                                <th className="p-3">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-cuba-line">
                                            {transactionsList.map((txn) => (
                                                <tr key={txn.id} className="hover:bg-cuba-canvas/80 transition-all">
                                                    <td className="p-3 font-mono font-bold text-cuba-primary-ink-strong">{txn.txnId || txn.id}</td>
                                                    <td className="p-3 text-cuba-ink-muted">{txn.createdDateString || '—'}</td>
                                                    <td className="p-3 font-bold text-cuba-ink">{txn.planName || '—'}{txn.durationMonths ? ` (${txn.durationMonths}M)` : ''}</td>
                                                    <td className="p-3 font-extrabold text-cuba-ink">{txn.amount === null ? '—' : `${txn.currency || '—'} ${txn.amount}`}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${['ACTIVE', 'COMPLETED', 'PAID'].includes(String(txn.status).toUpperCase()) ? 'bg-cuba-success-soft text-cuba-success border-cuba-success-soft' : 'bg-cuba-elevated text-cuba-ink border-cuba-line-strong'}`}>
                                                            {txn.status || 'UNKNOWN'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="border-t border-cuba-line pt-6 space-y-4">
                                <div>
                                    <h4 className="text-sm font-extrabold text-cuba-ink">Issued Tax Invoices</h4>
                                    <p className="text-xs text-cuba-ink-muted">These documents render immutable supplier and customer snapshots stored when the invoice was issued.</p>
                                </div>
                                {invoicesLoading ? (
                                    <p className="text-xs text-cuba-ink-muted">Loading issued invoices…</p>
                                ) : invoicesError ? (
                                    <div role="alert" className="rounded-xl border border-cuba-danger-soft bg-cuba-danger-soft p-4 text-xs text-cuba-danger">{invoicesError}</div>
                                ) : invoicesList.length === 0 ? (
                                    <div className="rounded-xl border border-cuba-line bg-cuba-canvas p-4 text-xs text-cuba-ink-muted">
                                        No immutable invoice has been issued for this account. A payment record above is not itself a tax invoice.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {invoicesList.map(invoice => (
                                            <article key={invoice.paymentOrderId} className="rounded-xl border border-cuba-line p-4 flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="font-mono text-xs font-extrabold text-cuba-primary-ink-strong truncate">{invoice.invoiceNumber}</div>
                                                    <div className="text-xs text-cuba-ink-muted mt-1">{invoice.formattedDate || 'Date unavailable'} · {invoice.currency} {Number(invoice.grandTotal).toFixed(2)}</div>
                                                    <div className="text-[10px] uppercase font-bold text-cuba-ink-muted mt-1">{invoice.paymentStatus}</div>
                                                </div>
                                                <div className="shrink-0 flex flex-col gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            try {
                                                                setInvoicesError('');
                                                                printAuthoritativeInvoice(invoice);
                                                            } catch (error) {
                                                                setInvoicesError(error.message || 'Invoice document could not be opened.');
                                                            }
                                                        }}
                                                        className="px-3 py-2 rounded-lg bg-cuba-primary-fill text-cuba-on-primary text-xs font-bold hover:bg-cuba-primary-strong">
                                                        Print invoice
                                                    </button>
                                                    {invoice.creditNote && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                try {
                                                                    setInvoicesError('');
                                                                    printAuthoritativeCreditNote(invoice.creditNote);
                                                                } catch (error) {
                                                                    setInvoicesError(error.message || 'Credit note could not be opened.');
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded-lg bg-cuba-primary-strong text-cuba-on-primary text-xs font-bold hover:bg-cuba-primary-strong">
                                                            Credit note {invoice.creditNote.creditNoteNumber}
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 3: PLAN TERM & BILLING MODEL */}
                    {activeTab === 'manage' && (
                        <div className="bg-cuba-card rounded-2xl p-6 border border-cuba-line shadow-sm space-y-6">
                            <div className="border-b border-cuba-line pb-4">
                                <h3 className="text-lg font-bold text-cuba-ink">Plan Term &amp; Renewal</h3>
                                <p className="text-xs text-cuba-ink-muted">IME365 purchases are fixed-term, one-time payments. No payment method is stored or charged automatically.</p>
                            </div>

                            <div className="bg-gradient-to-r from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to rounded-2xl p-5 border border-cuba-primary/30 text-cuba-on-primary flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md">
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cuba-warning text-cuba-ink uppercase tracking-wider">
                                            MEMBERSHIP: {userCurrentMembership}
                                        </span>
                                        {membershipActive && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border bg-cuba-primary-fill/20 text-cuba-night-ink border-cuba-primary/30">
                                                MANUAL RENEWAL
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-base font-bold text-cuba-on-primary">
                                        Candidate Account: <span className="text-cuba-night-primary">{userEmail || candidateName || 'Unavailable'}</span>
                                    </h4>
                                    <p className="text-xs text-cuba-ink-subtle">
                                        Access valid until: <strong className="text-cuba-night-warning">{membershipExpiry || (membershipActive ? 'No expiry date recorded' : 'Not applicable')}</strong>
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-xs font-bold text-cuba-ink-subtle block">Status:</span>
                                    <span className={`text-sm font-extrabold ${membershipActive ? 'text-cuba-night-success' : 'text-cuba-night-warning'}`}>
                                        {membershipActive ? 'ACTIVE PAID MEMBERSHIP' : (membershipKnown ? 'NO ACTIVE PAID MEMBERSHIP' : 'STATUS UNAVAILABLE')}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-5 rounded-2xl border border-cuba-success-soft bg-cuba-success-soft/50 space-y-3">
                                    <span className="text-xs font-bold text-cuba-success uppercase tracking-wider">No Automatic Charge</span>
                                    <p className="text-xs text-cuba-success">
                                        Your current term ends on the date above. To continue after that date, return to Plans and complete a new provider-confirmed payment.
                                    </p>
                                </div>
                                <div className="p-5 rounded-2xl border border-cuba-line bg-cuba-canvas space-y-3">
                                    <span className="text-xs font-bold text-cuba-ink uppercase tracking-wider">Refund or Billing Help</span>
                                    <p className="text-xs text-cuba-ink-muted">
                                        Fixed-term access cannot be “cancelled” as a recurring mandate because no recurring mandate exists. For a refund review or an invoice issue, contact support with the payment reference shown in Billing History.
                                    </p>
                                    <a href="/contact" className="inline-flex px-3 py-2 bg-cuba-primary-fill hover:bg-cuba-primary-strong text-cuba-on-primary font-extrabold text-xs rounded-xl transition-all">
                                        Contact Billing Support
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Elements>
        </PayPalScriptProvider>
    );
};

export default PlansPage;
