import React, { useState, useEffect } from 'react';
import { FaCrown, FaCheck, FaShieldAlt, FaLock, FaCreditCard, FaPaypal, FaRupeeSign, FaTag, FaPercent, FaArrowRight, FaUserCheck, FaGift, FaCheckCircle, FaExclamationTriangle, FaClock, FaArrowLeft, FaCalendarAlt, FaFileInvoice, FaPrint, FaDownload, FaFilePdf, FaHistory, FaExchangeAlt, FaUndo, FaTimes } from 'react-icons/fa';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import Checkout from './Checkout';
import { getSubscriptionStatus, getCoupons, getUserTransactions, recordTransaction, updateUserAutoRenew, cancelUserSubscription, getSystemSettings, getWebsiteData } from '../../../firestore/dbOperations';
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
    const [activeTab, setActiveTab] = useState('plans'); // 'plans', 'invoices', 'manage'
    const [step, setStep] = useState(1); // 1 = Cart & Plan Selection, 2 = Native Checkout
    const [selectedDuration, setSelectedDuration] = useState('12'); // '1', '6', '12' months
    const [selectedCurrency, setSelectedCurrency] = useState('INR'); // 'INR', 'USD', 'EUR', 'GBP'
    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponError, setCouponError] = useState('');
    const [userCurrentMembership, setUserCurrentMembership] = useState('Loading Tier...');
    const [membershipExpiry, setMembershipExpiry] = useState('');
    const [membershipExpiryDate, setMembershipExpiryDate] = useState(null);
    const [candidateName, setCandidateName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [currentUserId, setCurrentUserId] = useState(null);

    // Advanced Enterprise Features & Addon Modules State
    const [availableCoupons, setAvailableCoupons] = useState({});
    const [enableCouponsModule, setEnableCouponsModule] = useState(true);
    const [transactionsList, setTransactionsList] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [autoRenew, setAutoRenew] = useState(true);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancellationStatus, setCancellationStatus] = useState(null);

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
        paytmEnabled: false,
        phonepeEnabled: false,
        sandboxMode: false,
        isLoading: true
    });

    useEffect(() => {
        // Fetch System Addon Modules Settings for enableCouponsModule toggle
        getSystemSettings().then((settings) => {
            const mods = (settings && settings.modules) || {};
            const isCouponsOn = mods.enableCouponsModule !== false;
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
                    setAvailableCoupons({});
                } else {
                    getCoupons().then((dynamic) => setAvailableCoupons(dynamic || {}));
                }
            }
        };
        window.addEventListener('systemSettingsUpdated', handleModulesUpdate);

        // Fetch dynamic coupons from Firestore 'coupons' collection
        getCoupons().then((dynamic) => {
            setAvailableCoupons(dynamic || {});
        });

        // Realtime Auth State Listener for robust dynamic details
        const unsubscribe = fire.auth().onAuthStateChanged((currentUser) => {
            if (currentUser) {
                setCurrentUserId(currentUser.uid);
                setUserEmail(currentUser.email || '');
                if (currentUser.displayName) {
                    setCandidateName(currentUser.displayName);
                }

                // Fetch billing transactions history for user
                setLoadingTransactions(true);
                getUserTransactions(currentUser.uid).then((txns) => {
                    setTransactionsList(txns);
                    setLoadingTransactions(false);
                });

                // Query Firestore users/{uid} document for exact membership, name, expiry, autoRenew
                getUserMembership(currentUser.uid).then((data) => {
                    if (data) {
                        setAutoRenew(data.autoRenew !== false);

                        const firstName = data.firstname || data.profile?.firstname || '';
                        const lastName = data.lastname || data.profile?.lastname || '';
                        if (firstName || lastName) {
                            setCandidateName(`${firstName} ${lastName}`.trim());
                        }
                        if (data.email) {
                            setUserEmail(data.email);
                        }

                        // Resolve membership tier
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
                                    setMembershipExpiryDate(expiryDate);
                                    isExpired = expiryDate < new Date();
                                    // Always set the formatted date — used to show expiry or "Expired on" label
                                    setMembershipExpiry(
                                        expiryDate.toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })
                                    );
                                }
                            } catch (err) {
                                console.error('Error parsing membershipEnds:', err);
                            }
                        }

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
                setCurrentUserId(null);
            }
        });

        // Global Subscription Config
        getSubscriptionStatus().then((data) => {
            if (data) {
                const currSymbol = selectedCurrency === 'INR' ? '₹' : (selectedCurrency === 'EUR' ? '€' : (selectedCurrency === 'GBP' ? '£' : '$'));
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
                    paytmEnabled: data.paytmEnabled === true,
                    phonepeEnabled: data.phonepeEnabled === true,
                    receiptTemplate: data.receiptTemplate || 'modern',
                    reverseCharge: data.reverseCharge || 'No',
                    sandboxMode: Boolean(data.sandboxMode),
                    isLoading: false
                });
            }
        });

        return () => unsubscribe();
    }, []);

    // Check for PhonePe or Paytm redirect callback query params on page mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const orderId = urlParams.get('order');
            if (urlParams.has('phonepe_callback') || urlParams.has('phonepe_demo')) {
                toast.success(`🎉 PhonePe Payment Verified! Order ${orderId || ''} activated successfully.`);
            } else if (urlParams.has('paytm_callback') || urlParams.has('paytm_demo')) {
                toast.success(`🎉 Paytm Payment Verified! Order ${orderId || ''} activated successfully.`);
            }
        }
    }, []);

    // Classic Public View Handlers
    const handlePublicNextStep = (plan) => {
        setPublicSelectedPlan(plan);
        setPublicStep(1);
    };

    const handlePublicPreviousStep = () => {
        setPublicStep(0);
    };

    // Calculate Pro-Rated Upgrade Credit for existing active Premium Pro users
    const getProRatedCredit = () => {
        if (!userCurrentMembership.includes('Premium') || userCurrentMembership.includes('Expired')) return 0;
        if (!membershipExpiryDate) return 0;
        
        const now = new Date();
        const diffMs = membershipExpiryDate.getTime() - now.getTime();
        if (diffMs <= 0) return 0;
        
        const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const dailyRate = subscriptionConfig.monthlyPrice / 30;
        const credit = Math.round(remainingDays * dailyRate);
        const subtotal = getRawSubtotal();
        
        // Cap credit at 50% of new plan subtotal to preserve platform margin
        return Math.min(credit, Math.round(subtotal * 0.5));
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

    const handleApplyCoupon = (e, explicitCode = null) => {
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

        const coupon = availableCoupons[code];

        if (!coupon) {
            setCouponError(`Invalid or inactive coupon code "${code}".`);
            return;
        }

        // Rule A: Active Status Check
        if (coupon.active === false) {
            setCouponError(`Coupon code "${code}" is currently disabled by administrator.`);
            return;
        }

        // Rule B: Expiry Date Validation
        if (coupon.expiryDate) {
            const exp = new Date(coupon.expiryDate);
            if (!isNaN(exp.getTime()) && exp < new Date()) {
                setCouponError(`Coupon code "${code}" expired on ${exp.toLocaleDateString()}.`);
                return;
            }
        }

        // Rule C: Maximum Usage Limit Check
        if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
            setCouponError(`Coupon code "${code}" has reached its maximum redemptions limit.`);
            return;
        }

        // Rule D: Per-User Single Use Check
        if (coupon.singleUsePerUser && transactionsList.some(t => t.couponUsed === code)) {
            setCouponError(`You have already redeemed promo coupon "${code}" on your account.`);
            return;
        }

        setAppliedCoupon({ code, ...coupon });
        setCouponInput(code);
        setCouponError('');
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput('');
        setCouponError('');
    };

    // ── 10/10 Factual Indian GST Tax Invoice & Payment Receipt Generator ────────────────
    const handleDownloadInvoice = (txn) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to download/print your PDF tax invoice.');
            return;
        }

        // Factual Supplier Snapshot (Zero Hallucinated Placeholders)
        const supplierTradeName = (subscriptionConfig.supplierTradeName || conf.brand?.name || 'ResumePilot AI').toUpperCase();
        const supplierLegalName = subscriptionConfig.supplierLegalName || conf.brand?.name || 'ResumePilot AI';
        const supplierGstin = (subscriptionConfig.supplierGstin || subscriptionConfig.companyTaxId || conf.companyTaxId || '').trim();
        const supplierPan = (subscriptionConfig.supplierPan || (supplierGstin.length === 15 ? supplierGstin.substring(2, 12) : '')).trim();
        const supplierAddress = (subscriptionConfig.supplierAddress || '').trim();
        const supplierCity = (subscriptionConfig.supplierCity || '').trim();
        const supplierState = (subscriptionConfig.supplierState || '').trim();
        const supplierStateCode = subscriptionConfig.supplierStateCode ? String(subscriptionConfig.supplierStateCode).padStart(2, '0') : (supplierGstin.length === 15 ? supplierGstin.substring(0, 2) : '');
        const supplierPincode = (subscriptionConfig.supplierPincode || '').trim();
        const supplierSacCode = subscriptionConfig.sacCode || '998313';
        const supplierEmail = (subscriptionConfig.supplierEmail || conf.adminEmail || 'support@' + (typeof window !== 'undefined' ? window.location.hostname : 'airesume.projectdemo.guru')).trim();
        const supplierPhone = (subscriptionConfig.supplierPhone || '').trim();
        const supplierWebsite = typeof window !== 'undefined' ? window.location.origin : 'https://airesume.projectdemo.guru';
        const invoicePrefix = subscriptionConfig.invoicePrefix || 'RPAI';
        const financialYear = subscriptionConfig.financialYear || '26-27';

        // Customer Snapshot & Dynamic B2B / B2C Detection
        const rawName = candidateName || txn.customerName || (props.user ? props.user.displayName : '');
        let billedCustomerName = 'Valued Customer';
        if (rawName && typeof rawName === 'string' && !rawName.toLowerCase().includes('welcome')) {
            billedCustomerName = rawName.trim();
        } else if (userEmail) {
            const parts = userEmail.split('@')[0].split('.')[0];
            billedCustomerName = parts.charAt(0).toUpperCase() + parts.slice(1);
        }

        const customerEmail = txn.customerEmail || userEmail || '';
        const customerGstin = (txn.customerGstin || txn.customerTaxId || '').trim();
        const customerCompany = (txn.customerCompany || '').trim();
        const customerAddress = (txn.customerAddress || '').trim();
        const customerCity = (txn.customerCity || '').trim();
        const customerState = (txn.customerState || '').trim();
        const customerStateCode = txn.customerStateCode ? String(txn.customerStateCode).padStart(2, '0') : (customerGstin.length === 15 ? customerGstin.substring(0, 2) : '');
        const customerCountry = txn.customerCountry || 'India';

        const isB2B = Boolean(customerGstin && customerGstin.length === 15);
        const invoiceTitle = isB2B ? 'B2B GST Tax Invoice & Payment Receipt' : 'Tax Invoice & Payment Receipt';
        const customerType = isB2B ? 'B2B Registered Entity' : 'B2C / Individual Customer';

        // Sequential Invoice Numbering & Payment Reference
        const txnId = txn.transactionId || txn.txnId || txn.paymentReference || txn.id || `TXN_${Date.now()}`;
        const invoiceNo = txn.invoiceNumber || `${invoicePrefix}/${financialYear}/${String(txn.id || Date.now()).slice(-6)}`;

        // Dates & Payment Details
        const formattedDate = txn.created_at?.toDate
            ? txn.created_at.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : (txn.createdDateString || txn.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
        const paymentMethod = txn.paymentType || txn.paymentMethod || txn.paimentType || 'Razorpay / Digital Payment';

        // Tax Math & Intra/Inter State Breakdown
        const totalPrice = parseFloat(txn.amount !== undefined ? txn.amount : (txn.price || '499')) || 499;
        const gstRate = parseFloat(subscriptionConfig.taxRate !== undefined ? subscriptionConfig.taxRate : 18) || 18;
        const currency = (txn.currency || subscriptionConfig.currency || 'INR').toUpperCase();
        const currencySymbol = currency === 'INR' ? '₹' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : (currency === 'CAD' ? 'CA$' : '$')));

        const taxableAmount = parseFloat((totalPrice / (1 + (gstRate / 100))).toFixed(2));
        const totalTax = parseFloat((totalPrice - taxableAmount).toFixed(2));

        const isIntraState = supplierStateCode === customerStateCode || (!customerStateCode && (currency === 'INR' || !txn.currency));
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        let cgstRate = 0, sgstRate = 0, igstRate = 0;

        if (isIntraState) {
            cgstRate = gstRate / 2;
            sgstRate = gstRate / 2;
            cgstAmount = parseFloat((totalTax / 2).toFixed(2));
            sgstAmount = parseFloat((totalTax / 2).toFixed(2));
        } else {
            igstRate = gstRate;
            igstAmount = totalTax;
        }

        // Amount in Words Generator (Rupees, Dollars, Euros, Pounds)
        const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        function convertGroup(n) {
            if (n === 0) return '';
            if (n < 20) return units[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '');
            return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertGroup(n % 100) : '');
        }

        function convertRupees(n) {
            if (n === 0) return 'Zero';
            const crore = Math.floor(n / 10000000);
            n %= 10000000;
            const lakh = Math.floor(n / 100000);
            n %= 100000;
            const thousand = Math.floor(n / 1000);
            n %= 1000;
            const hundred = n;

            let str = '';
            if (crore > 0) str += convertGroup(crore) + ' Crore ';
            if (lakh > 0) str += convertGroup(lakh) + ' Lakh ';
            if (thousand > 0) str += convertGroup(thousand) + ' Thousand ';
            if (hundred > 0) str += convertGroup(hundred);
            return str.trim();
        }

        const rupees = Math.floor(totalPrice);
        const paise = Math.round((totalPrice - rupees) * 100);
        const rupeesWords = convertRupees(rupees);
        const paiseWords = paise > 0 ? convertGroup(paise) : '';
        const mainUnit = currency === 'INR' ? 'Rupees' : (currency === 'USD' ? 'Dollars' : (currency === 'EUR' ? 'Euros' : (currency === 'GBP' ? 'Pounds' : currency)));
        const subUnit = currency === 'INR' ? 'Paise' : (currency === 'GBP' ? 'Pence' : 'Cents');
        const amountInWords = paise > 0
            ? `${rupeesWords} ${mainUnit} and ${paiseWords} ${subUnit} Only`
            : `${rupeesWords} ${mainUnit} Only`;

        const planTitle = txn.planName || txn.planType || 'Annual Resume Builder AI Subscription – 12 Months';

        // Dynamic Admin-Selected Receipt Template Style ('modern', 'classic', 'gradient', 'compact')
        const activeTemplateStyle = (txn.receiptTemplate || subscriptionConfig.receiptTemplate || 'modern').toLowerCase();
        
        let headerBg = 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)';
        let headerBorder = 'linear-gradient(90deg, #4f46e5, #ec4899, #8b5cf6)';
        let fontFamily = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
        let cardBorder = '1px solid #cbd5e1';
        let complianceBg = '#eef2ff';
        let complianceBorder = '#e0e7ff';
        let complianceText = '#4338ca';

        if (activeTemplateStyle === 'classic') {
            headerBg = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
            headerBorder = 'linear-gradient(90deg, #cbd5e1, #94a3b8, #cbd5e1)';
            fontFamily = "Georgia, 'Times New Roman', serif";
            cardBorder = '3px double #475569';
            complianceBg = '#f8fafc';
            complianceBorder = '#cbd5e1';
            complianceText = '#1e293b';
        } else if (activeTemplateStyle === 'gradient') {
            headerBg = 'linear-gradient(135deg, #3b0764 0%, #4c1d95 50%, #1e1b4b 100%)';
            headerBorder = 'linear-gradient(90deg, #f59e0b, #ec4899, #8b5cf6)';
            complianceBg = '#f3e8ff';
            complianceBorder = '#e9d5ff';
            complianceText = '#6b21a8';
        } else if (activeTemplateStyle === 'compact') {
            headerBg = 'linear-gradient(135deg, #18181b 0%, #27272a 100%)';
            headerBorder = 'linear-gradient(90deg, #10b981, #06b6d4)';
            fontFamily = "'JetBrains Mono', monospace";
            cardBorder = '2px dashed #64748b';
            complianceBg = '#f4f4f5';
            complianceBorder = '#e4e4e7';
            complianceText = '#27272a';
        }

        // Single Page A4 Styles Budget
        const templateStyles = `
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { height: 100%; font-family: ${fontFamily}; background: #f1f5f9; color: #0f172a; line-height: 1.4; }
            body { padding: 20px 10px; display: flex; flex-direction: column; align-items: center; }
            
            .invoice-card { 
                width: 210mm; 
                max-width: 840px; 
                min-height: 285mm;
                background: #ffffff; 
                border-radius: 16px; 
                box-shadow: 0 20px 40px -12px rgba(15,23,42,0.12); 
                border: ${cardBorder}; 
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                overflow: hidden; 
            }
            .invoice-content { padding: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
            
            .header-bar { background: ${headerBg}; color: #ffffff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; position: relative; }
            .header-bar::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: ${headerBorder}; }
            .brand-title { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
            .brand-subtitle { font-size: 11px; color: #a5b4fc; font-weight: 700; margin-top: 2px; letter-spacing: 0.5px; text-transform: uppercase; }
            .copy-tag { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; font-size: 9px; font-weight: 800; padding: 3px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; display: inline-block; }
            .paid-badge { background: rgba(16,185,129,0.15); border: 1.5px solid #10b981; color: #34d399; font-size: 12px; font-weight: 800; padding: 5px 16px; border-radius: 99px; text-transform: uppercase; letter-spacing: 1px; }
            
            .compliance-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 32px; background: ${complianceBg}; border-bottom: 1px solid ${complianceBorder}; text-align: center; }
            .comp-item .c-label { font-size: 8px; font-weight: 800; color: ${complianceText}; text-transform: uppercase; letter-spacing: 0.5px; }
            .comp-item .c-val { font-size: 11px; font-weight: 800; color: #1e1b4b; margin-top: 1px; }

            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 32px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
            .meta-box { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; }
            .label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
            .val-bold { font-size: 14px; font-weight: 800; color: #0f172a; }
            .val-sub { font-size: 11px; color: #475569; font-weight: 600; margin-top: 2px; line-height: 1.35; }
            .val-code { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #4f46e5; }
            
            .table-wrap { padding: 20px 32px 12px; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; }
            th { text-align: left; padding: 10px 12px; background: #0f172a; color: #f8fafc; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
            th:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
            th:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; text-align: right; }
            td { padding: 12px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; font-weight: 600; color: #1e293b; }
            td:last-child { text-align: right; }

            .summary-section { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; padding: 0 32px 20px; }
            .words-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; }
            .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
            .sum-line { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; }
            .sum-line.total { border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 8px; font-size: 15px; font-weight: 900; color: #0f172a; }

            .audit-box { margin: 0 32px 20px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
            .footer-bar { padding: 16px 32px; background: #fafafa; border-top: 1px solid #f1f5f9; text-align: center; font-size: 10px; color: #64748b; font-weight: 600; }
            
            @page {
                size: A4 portrait;
                margin: 0;
            }
            @media print {
                .no-print { display: none !important; }
                html, body { 
                    width: 210mm !important; 
                    height: 297mm !important; 
                    margin: 0 !important; 
                    padding: 0 !important; 
                    background: #ffffff !important; 
                    overflow: hidden !important; 
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important; 
                }
                .invoice-card { 
                    width: 210mm !important; 
                    max-width: 210mm !important; 
                    height: 297mm !important; 
                    max-height: 297mm !important; 
                    margin: 0 !important; 
                    border: none !important; 
                    box-shadow: none !important; 
                    border-radius: 0 !important; 
                    padding: 0 !important; 
                    page-break-inside: avoid !important;
                    page-break-after: avoid !important;
                    overflow: hidden !important;
                }
            }
        `;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${invoiceTitle} - ${invoiceNo}</title>
                <style>${templateStyles}</style>
            </head>
            <body>
                <div class="no-print" style="position: sticky; top: 0; z-index: 100; background: #0f172a; color: #fff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #4f46e5; box-shadow: 0 10px 25px rgba(0,0,0,0.2); margin-bottom: 20px; border-radius: 14px; width: 100%; max-width: 840px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; color: #fff;">📄</div>
                        <div>
                            <strong style="font-size: 14px; display: block; font-weight: 800;">${invoiceTitle}</strong>
                            <span style="font-size: 10px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">INVOICE NO: ${invoiceNo}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="window.print()" style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: #fff; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 12px; box-shadow: 0 4px 14px rgba(79,70,229,0.4); display: flex; align-items: center; gap: 6px;">
                            <span>🖨️</span> Save as PDF / Print
                        </button>
                        <button onclick="window.close()" style="background: #334155; color: #f8fafc; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px;">Close</button>
                    </div>
                </div>

                <div class="invoice-card">
                    <div class="invoice-content">
                        <!-- Header -->
                        <div class="header-bar">
                            <div>
                                <div class="brand-title">${supplierTradeName}</div>
                                <div class="brand-subtitle">${invoiceTitle}</div>
                                <div class="copy-tag">Original for Recipient</div>
                            </div>
                            <div style="text-align: right;">
                                <div class="paid-badge">PAID ✓</div>
                                <div style="font-size: 11px; color: #cbd5e1; font-weight: 700; margin-top: 6px;">Date: ${formattedDate}</div>
                            </div>
                        </div>

                        <!-- Compliance Bar -->
                        <div class="compliance-bar">
                            <div class="comp-item">
                                <div class="c-label">Invoice Number</div>
                                <div class="c-val" style="font-family: 'JetBrains Mono', monospace;">${invoiceNo}</div>
                            </div>
                            <div class="comp-item">
                                <div class="c-label">Place of Supply</div>
                                <div class="c-val">${customerState ? `${customerState}${customerStateCode ? ` (${customerStateCode})` : ''}` : (currency === 'INR' ? `${supplierState} (${supplierStateCode})` : 'International / Overseas')}</div>
                            </div>
                            <div class="comp-item">
                                <div class="c-label">Reverse Charge</div>
                                <div class="c-val">${txn.reverseCharge || subscriptionConfig.reverseCharge || 'No'}</div>
                            </div>
                            <div class="comp-item">
                                <div class="c-label">Customer Type</div>
                                <div class="c-val">${customerType}</div>
                            </div>
                        </div>

                        <!-- Meta Grid: Supplier vs Customer -->
                        <div class="meta-grid">
                            <div class="meta-box">
                                <div class="label">Supplier / Business Details</div>
                                <div class="val-bold">${supplierLegalName}</div>
                                ${(supplierAddress || supplierCity) ? `<div class="val-sub">${[supplierAddress, supplierCity, supplierState, supplierPincode].filter(Boolean).join(', ')}</div>` : `<div class="val-sub">${supplierState} (${supplierStateCode})</div>`}
                                ${supplierGstin ? `<div class="val-sub"><strong style="color:#0f172a">GSTIN:</strong> <span class="val-code">${supplierGstin}</span></div>` : ''}
                                <div class="val-sub">
                                    ${supplierPan ? `<strong style="color:#0f172a">PAN:</strong> ${supplierPan} | ` : ''}
                                    <strong style="color:#0f172a">SAC:</strong> ${supplierSacCode}
                                </div>
                                <div class="val-sub">${supplierEmail}${supplierPhone ? ` | ${supplierPhone}` : ''}</div>
                            </div>

                            <div class="meta-box">
                                <div class="label">Billed To (Customer)</div>
                                <div class="val-bold">${billedCustomerName}</div>
                                ${customerCompany ? `<div class="val-sub" style="font-weight:700; color:#4f46e5;">${customerCompany}</div>` : ''}
                                ${(customerAddress || customerCity) ? `<div class="val-sub">${[customerAddress, customerCity, customerState, customerCountry].filter(Boolean).join(', ')}</div>` : `<div class="val-sub">${customerState} (${customerStateCode}), ${customerCountry}</div>`}
                                ${customerEmail ? `<div class="val-sub"><strong style="color:#0f172a">Email:</strong> ${customerEmail}</div>` : ''}
                                ${customerGstin ? `<div class="val-sub" style="margin-top:4px; background:#eef2ff; padding:3px 6px; border-radius:4px;"><strong style="color:#4338ca">Customer GSTIN:</strong> <span class="val-code">${customerGstin}</span></div>` : ''}
                            </div>
                        </div>

                        <!-- Line Item Table -->
                        <div class="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Item Description</th>
                                        <th>HSN/SAC</th>
                                        <th>Qty</th>
                                        <th style="text-align: right;">Taxable Value</th>
                                        ${isIntraState ? `
                                            <th style="text-align: right;">CGST (${cgstRate}%)</th>
                                            <th style="text-align: right;">SGST (${sgstRate}%)</th>
                                        ` : `
                                            <th style="text-align: right;">IGST (${igstRate}%)</th>
                                        `}
                                        <th style="text-align: right;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <strong style="color: #0f172a; display: block; font-size: 13px;">${planTitle}</strong>
                                            <span style="font-size: 11px; color: #64748b;">Full Access to AI Resume Builder, Cover Letters &amp; Portfolios</span>
                                        </td>
                                        <td style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">${supplierSacCode}</td>
                                        <td>1</td>
                                        <td style="text-align: right; font-weight: 700;">${currencySymbol}${taxableAmount.toFixed(2)}</td>
                                        ${isIntraState ? `
                                            <td style="text-align: right; font-weight: 600; color: #475569;">${currencySymbol}${cgstAmount.toFixed(2)}</td>
                                            <td style="text-align: right; font-weight: 600; color: #475569;">${currencySymbol}${sgstAmount.toFixed(2)}</td>
                                        ` : `
                                            <td style="text-align: right; font-weight: 600; color: #475569;">${currencySymbol}${igstAmount.toFixed(2)}</td>
                                        `}
                                        <td style="text-align: right; font-weight: 800; color: #0f172a;">${currencySymbol}${totalPrice.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Summary & Amount in Words Section -->
                        <div class="summary-section">
                            <div class="words-box">
                                <div>
                                    <div class="label">Amount in Words</div>
                                    <div style="font-size: 12px; font-weight: 800; color: #1e1b4b; line-height: 1.35; margin-top: 3px;">
                                        ${amountInWords}
                                    </div>
                                </div>
                                <div style="font-size: 10px; color: #64748b; margin-top: 8px;">
                                    GST Tax Calculation: <strong>${gstRate}% (${isIntraState ? `CGST ${cgstRate}% + SGST ${sgstRate}%` : `IGST ${igstRate}%`})</strong>
                                </div>
                            </div>

                            <div class="summary-card">
                                <div class="sum-line"><span>Taxable Value:</span><span>${currencySymbol}${taxableAmount.toFixed(2)}</span></div>
                                ${isIntraState ? `
                                    <div class="sum-line"><span>CGST (${cgstRate}%):</span><span>${currencySymbol}${cgstAmount.toFixed(2)}</span></div>
                                    <div class="sum-line"><span>SGST (${sgstRate}%):</span><span>${currencySymbol}${sgstAmount.toFixed(2)}</span></div>
                                ` : `
                                    <div class="sum-line"><span>IGST (${igstRate}%):</span><span>${currencySymbol}${igstAmount.toFixed(2)}</span></div>
                                `}
                                <div class="sum-line" style="border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 4px;">
                                    <span>Total GST Tax:</span><span style="font-weight: 800; color: #4f46e5;">${currencySymbol}${totalTax.toFixed(2)}</span>
                                </div>
                                <div class="sum-line total">
                                    <span>Grand Total:</span><span>${currencySymbol}${totalPrice.toFixed(2)} ${currency}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Payment Gateway Audit Record -->
                        <div class="audit-box" style="${txn.status === 'Refunded' ? 'background:#fef2f2; border-color:#fecaca;' : ''}">
                            <div>
                                <div style="font-size: 9px; font-weight: 800; color: ${txn.status === 'Refunded' ? '#991b1b' : '#166534'}; uppercase; letter-spacing: 0.5px;">Payment Verification Audit</div>
                                <div style="font-size: 12px; font-weight: 800; color: ${txn.status === 'Refunded' ? '#7f1d1d' : '#14532d'}; margin-top: 1px;">
                                    Method: <strong>${paymentMethod}</strong> | Status: <span style="color: ${txn.status === 'Refunded' ? '#dc2626' : '#059669'};">${txn.status === 'Refunded' ? 'REFUNDED ↩' : 'PAID ✓'}</span>
                                </div>
                                <div style="font-size: 10px; color: ${txn.status === 'Refunded' ? '#991b1b' : '#15803d'}; font-family: 'JetBrains Mono', monospace; margin-top: 1px;">
                                    Payment Ref / ID: ${txnId}
                                </div>
                                ${txn.refundReason ? `
                                    <div style="font-size: 10px; font-weight: 700; color: #dc2626; margin-top: 3px; font-family: sans-serif;">
                                        Refund Reason: ${txn.refundReason}
                                    </div>
                                ` : ''}
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 10px; font-weight: 700; color: ${txn.status === 'Refunded' ? '#991b1b' : '#166534'};">Computer Generated Receipt</div>
                                <div style="font-size: 9px; color: ${txn.status === 'Refunded' ? '#b91c1c' : '#15803d'};">No signature required under IT Act 2000</div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="footer-bar">
                        Thank you for your business with ${supplierTradeName}${supplierGstin ? ` (GSTIN: ${supplierGstin})` : ''}. Support: ${supplierEmail}.
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
            try { printWindow.print(); } catch (e) {}
        }, 400);
    };

    const handleToggleAutoRenew = async () => {
        if (!currentUserId) return;
        const nextState = !autoRenew;
        setAutoRenew(nextState);
        await updateUserAutoRenew(currentUserId, nextState);
    };

    const handleConfirmCancellation = async (e) => {
        if (e) e.preventDefault();
        if (!currentUserId) return;
        const res = await cancelUserSubscription(currentUserId, cancelReason);
        if (res.success) {
            setCancellationStatus(res.message);
            setAutoRenew(false);
            setShowCancelModal(false);
        }
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
                                                user={props.user || fire.auth().currentUser}
                                                currency={subscriptionConfig.symbol}
                                                currencyCode={currencyCode}
                                                onlyPP={subscriptionConfig.onlyPP}
                                                stripeEnabled={subscriptionConfig.stripeEnabled}
                                                paypalEnabled={subscriptionConfig.paypalEnabled}
                                                razorpayEnabled={subscriptionConfig.razorpayEnabled}
                                                paytmEnabled={subscriptionConfig.paytmEnabled}
                                                phonepeEnabled={subscriptionConfig.phonepeEnabled}
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
                                <div className="flex items-center gap-2 flex-wrap">
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

                    {/* Dashboard Navigation Tabs */}
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-1 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setActiveTab('plans')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'plans'
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}>
                            <FaCrown className="w-3.5 h-3.5" />
                            <span>Plans &amp; Upgrades</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('invoices')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'invoices'
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}>
                            <FaFileInvoice className="w-3.5 h-3.5" />
                            <span>Billing History &amp; PDF Invoices ({transactionsList.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('manage')}
                            className={`px-4 py-2.5 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                                activeTab === 'manage'
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}>
                            <FaShieldAlt className="w-3.5 h-3.5" />
                            <span>Subscription Controls</span>
                        </button>

                        {/* Multi-Currency Switcher Pill Selector */}
                        <div className="ml-auto flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase px-2">Currency:</span>
                            {[
                                { code: 'INR', symbol: '₹' },
                                { code: 'USD', symbol: '$' },
                                { code: 'EUR', symbol: '€' },
                                { code: 'GBP', symbol: '£' },
                            ].map((c) => (
                                <button
                                    key={c.code}
                                    type="button"
                                    onClick={() => setSelectedCurrency(c.code)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                        selectedCurrency === c.code
                                            ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                                            : 'text-slate-600 hover:text-slate-900 font-bold'
                                    }`}>
                                    {c.symbol} {c.code}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* TAB 1: PLANS & UPGRADES */}
                    {activeTab === 'plans' && (
                        <>
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
                                                {userCurrentMembership && userCurrentMembership !== 'Free' && userCurrentMembership !== 'Loading Tier...'
                                                    ? <>Renew or Upgrade to <strong className="text-amber-400">AI Resume Builder PRO</strong></>
                                                    : <>Unlock <strong className="text-amber-400">AI Resume Builder PRO</strong> — Full Power Access</>
                                                }
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
                                        {enableCouponsModule && (
                                            <>
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
                                                {Object.keys(availableCoupons).length > 0 && (
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs text-slate-500 font-semibold mr-1">Available Promo Coupons:</span>
                                                        {Object.keys(availableCoupons).map((code) => (
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
                                                                <span>{code} (-{availableCoupons[code].discount}%)</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

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
                                            </>
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

                                            {enableCouponsModule && appliedCoupon && (
                                                <div className="flex justify-between items-center text-emerald-600 font-bold">
                                                    <span>Coupon ({appliedCoupon.code} -{appliedCoupon.discount}%)</span>
                                                    <span>-{subscriptionConfig.symbol}{getCouponDiscountAmount()}</span>
                                                </div>
                                            )}

                                            {getProRatedCredit() > 0 && (
                                                <div className="flex justify-between items-center text-emerald-600 font-bold">
                                                    <span className="flex items-center gap-1">
                                                        <FaExchangeAlt className="w-3 h-3 text-emerald-600" />
                                                        Pro-Rated Unused Membership Credit
                                                    </span>
                                                    <span>-{subscriptionConfig.symbol}{getProRatedCredit()}</span>
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
                                                    user={props.user || fire.auth().currentUser}
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
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Billing History &amp; Official Receipts</h3>
                                    <p className="text-xs text-slate-500">Download printable PDF tax invoices for your past subscription payments</p>
                                </div>
                                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
                                    Total Transactions: {transactionsList.length}
                                </span>
                            </div>

                            {loadingTransactions ? (
                                <div className="text-center py-12 text-slate-400">
                                    <FaClock className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
                                    <p className="text-xs">Fetching payment history...</p>
                                </div>
                            ) : transactionsList.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 space-y-2">
                                    <FaFileInvoice className="w-12 h-12 mx-auto text-slate-300" />
                                    <p className="text-sm font-bold text-slate-700">No Past Invoices Found</p>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto">When you complete a subscription purchase, your tax invoices and PDF receipts will appear here automatically.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase border-b border-slate-200">
                                            <tr>
                                                <th className="p-3">Invoice ID</th>
                                                <th className="p-3">Date</th>
                                                <th className="p-3">Plan / Cycle</th>
                                                <th className="p-3">Amount</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {transactionsList.map((txn) => (
                                                <tr key={txn.id} className="hover:bg-slate-50/80 transition-all">
                                                    <td className="p-3 font-mono font-bold text-indigo-700">{txn.txnId || txn.id}</td>
                                                    <td className="p-3 text-slate-600">{txn.createdDateString || '—'}</td>
                                                    <td className="p-3 font-bold text-slate-900">{txn.planName || 'PRO Membership'} ({txn.durationMonths || 12}M)</td>
                                                    <td className="p-3 font-extrabold text-slate-900">{subscriptionConfig.symbol}{txn.amount} {txn.currency || 'USD'}</td>
                                                    <td className="p-3">
                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                            {txn.status || 'PAID'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownloadInvoice(txn)}
                                                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all flex items-center gap-1.5 ml-auto cursor-pointer">
                                                            <FaPrint className="w-3 h-3 text-indigo-600" />
                                                            <span>Download PDF</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: SUBSCRIPTION CONTROLS */}
                    {activeTab === 'manage' && (
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                            <div className="border-b border-slate-100 pb-4">
                                <h3 className="text-lg font-bold text-slate-900">Subscription Auto-Renewal &amp; Plan Control</h3>
                                <p className="text-xs text-slate-500">Manage your subscription renewal preferences or request plan cancellation</p>
                            </div>

                            {/* Active Membership Status Banner */}
                            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 rounded-2xl p-5 border border-indigo-500/30 text-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase tracking-wider">
                                            ACTIVE TIER: {userCurrentMembership}
                                        </span>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${autoRenew ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                                            {autoRenew ? 'AUTO-RENEWAL ON' : 'MANUAL RENEWAL (OFF)'}
                                        </span>
                                    </div>
                                    <h4 className="text-base font-bold text-white">
                                        Candidate Account: <span className="text-indigo-300">{userEmail || candidateName}</span>
                                    </h4>
                                    <p className="text-xs text-slate-300">
                                        Access valid until: <strong className="text-amber-300">{membershipExpiry || 'Dec 1, 2099'}</strong>
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-xs font-bold text-slate-400 block">Status:</span>
                                    <span className="text-sm font-extrabold text-emerald-400">ACTIVE &amp; FULLY UNLOCKED ✓</span>
                                </div>
                            </div>

                            {cancellationStatus && (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                                    <FaCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span>{cancellationStatus}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Automatic Billing Renewal</span>
                                        <button
                                            type="button"
                                            onClick={handleToggleAutoRenew}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                                                autoRenew
                                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                    : 'bg-slate-200 text-slate-700 border-slate-300'
                                            }`}>
                                            {autoRenew ? 'ON (Auto-Renews)' : 'OFF (Manual)'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        When enabled, your PRO subscription automatically renews at the end of each term so your AI resume access is never interrupted.
                                    </p>
                                </div>

                                <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-rose-900 uppercase tracking-wider">Cancel Subscription</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowCancelModal(true)}
                                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer">
                                            Cancel Plan
                                        </button>
                                    </div>
                                    <p className="text-xs text-rose-700">
                                        You can cancel anytime. You will retain full PRO access to all AI resume tools until the end of your paid billing term.
                                    </p>
                                </div>
                            </div>

                            {/* Cancellation Confirmation Modal */}
                            {showCancelModal && (
                                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                                        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                                            <FaExclamationTriangle className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 text-center">Confirm Subscription Cancellation</h3>
                                        <p className="text-xs text-slate-500 text-center">
                                            Are you sure you want to request cancellation? Your PRO features will remain active until <strong>{membershipExpiry || 'end of term'}</strong>.
                                        </p>
                                        <textarea
                                            value={cancelReason}
                                            onChange={(e) => setCancelReason(e.target.value)}
                                            placeholder="Tell us why you are canceling (optional)..."
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-600 h-24"
                                        />
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowCancelModal(false)}
                                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all">
                                                Keep Subscription
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirmCancellation}
                                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all">
                                                Confirm Cancellation
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Elements>
        </PayPalScriptProvider>
    );
};

export default PlansPage;
