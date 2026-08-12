import React, { Component } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import { CardElement } from '@stripe/react-stripe-js';
import CheckImage from '../../../assets/check.png';
import {
    FaLock, FaShieldAlt, FaCheckCircle, FaArrowRight, FaArrowLeft,
    FaCreditCard, FaPaypal, FaGlobe, FaCertificate, FaCrown, FaCheck,
    FaStar, FaBolt, FaRocket, FaGem, FaInfinity, FaHeadset, FaDownload,
    FaFileAlt, FaMagic, FaChevronRight, FaMapMarkerAlt, FaEnvelope
} from 'react-icons/fa';
// Payment method logos
import VisaLogo from '../../../assets/payment/Visa_Inc._logo.svg';
import MastercardLogo from '../../../assets/payment/Mastercard-logo.svg';
import AmexLogo from '../../../assets/payment/American_Express_logo_(2018).svg';
import PayPalLogo from '../../../assets/payment/PayPal_logo.svg';
import JCBLogo from '../../../assets/payment/JCB_logo.svg';
import DropdownInput from '../../Form/dropdown-input/DropdownInput';
import SimpleInput from '../../Form/simple-input/SimpleInput';
import axios from 'axios';
import { addSbs, getSubscriptionStatus, getSystemSettings } from '../../../firestore/dbOperations';
import SuccessAnimation from '../../../assets/animations/50049-nfc-successful.json';
import { withTranslation } from 'react-i18next';
import Lottie from 'lottie-react';
import { useLottie } from 'lottie-react';
import fire from '../../../conf/fire';
import { AuthContext } from '../../../main';
import { trackSubscription, trackEvent, trackEngagement } from '../../../utils/ga4';

const View = () => {
    const options = {
        loop: false,
        autoplay: true,
        animationData: SuccessAnimation,
        rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
    };
    const { View } = useLottie(options);
    return View;
};

// PayPal Button Component
const PayPalButtonWrapper = ({ amount, currency, onSuccess, onError, selectedPlan }) => {
    const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();

    const createOrder = (data, actions) => {
        const finalCurrency = currency || 'USD';
        return actions.order.create({
            purchase_units: [{ amount: { value: amount.toString(), currency_code: finalCurrency }, description: `${selectedPlan} subscription plan` }],
            intent: 'CAPTURE',
        });
    };

    const onApprove = (data, actions) => actions.order.capture().then((details) => onSuccess(details));
    const onErrorHandler = (err) => onError(err);
    const onCancel = (data) => {};

    if (isPending) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-4 border-amber-200 animate-ping opacity-50"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-amber-400 border-t-transparent animate-spin"></div>
                </div>
                <span className="text-xs font-bold text-slate-600">Initializing PayPal Secure Gateway...</span>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="flex items-center justify-center py-6">
                <div className="text-rose-600 text-center text-xs space-y-3">
                    <p className="font-bold">Failed to load PayPal. Please check your network connection.</p>
                    <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-all">
                        Retry Gateway
                    </button>
                </div>
            </div>
        );
    }

    if (isResolved) {
        return (
            <PayPalButtons
                style={{ shape: 'rect', layout: 'vertical', color: 'gold', label: 'paypal', height: 50 }}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={onErrorHandler}
                onCancel={onCancel}
            />
        );
    }

    return null;
};

// Floating particle component for success screen
const Particle = ({ style }) => (
    <div className="absolute rounded-full opacity-70 animate-bounce" style={style} />
);

class Checkout extends Component {
    static contextType = AuthContext;

    constructor(props) {
        super(props);
        this.countries = [
            'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola', 'Anguilla',
            'Antigua and Barbuda', 'Argentina', 'Armenia', 'Aruba', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas',
            'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan',
            'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'British Virgin Islands', 'Brunei Darussalam',
            'Bulgaria', 'Burkina Faso', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Cayman Islands', 'Chile',
            'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Dominica',
            'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland',
            'France', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Honduras', 'Hong Kong',
            'Hungary', 'Iceland', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
            'Kazakhstan', 'Kenya', 'Kuwait', 'Latvia', 'Lebanon', 'Liechtenstein', 'Lithuania', 'Luxembourg',
            'Malaysia', 'Maldives', 'Malta', 'Mauritius', 'Mexico', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco',
            'Nepal', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Paraguay',
            'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Saudi Arabia', 'Singapore',
            'Slovakia', 'Slovenia', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland',
            'Taiwan', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
            'Uruguay', 'Uzbekistan', 'Vietnam'
        ];

        this.state = {
            step: 0,
            paymentMethod: 'creditCard',
            Country: '',
            'Postal Code': '',
            CardHolder: '',
            Address: '',
            customerTaxId: '',
            isPaying: false,
            isLoading: false,
            showMobileSummary: false,
            animating: false,
            taxConfig: {
                enableTax: true,
                taxName: 'GST',
                taxRate: 18,
                taxInclusive: false,
                companyTaxId: '27AAAAA0000A1Z5',
                requireCustomerTaxId: false,
            }
        };

        this.handleInput = this.handleInput.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handlePayPalSuccess = this.handlePayPalSuccess.bind(this);
        this.handlePayPalError = this.handlePayPalError.bind(this);
    }

    componentDidMount() {
        this.syncPaymentMethod();
        getSubscriptionStatus().then((subData) => {
            if (subData) {
                this.setState({
                    taxConfig: {
                        enableTax: subData.enableTax !== undefined ? subData.enableTax : true,
                        taxName: subData.taxName || 'GST',
                        taxRate: subData.taxRate !== undefined ? subData.taxRate : 18,
                        taxInclusive: subData.taxInclusive !== undefined ? subData.taxInclusive : false,
                        companyTaxId: subData.companyTaxId || '',
                        requireCustomerTaxId: subData.requireCustomerTaxId !== undefined ? subData.requireCustomerTaxId : false,
                    }
                });
            }
        });
    }

    componentDidUpdate(prevProps) {
        if (
            prevProps.stripeEnabled !== this.props.stripeEnabled ||
            prevProps.paypalEnabled !== this.props.paypalEnabled ||
            prevProps.onlyPP !== this.props.onlyPP
        ) {
            this.syncPaymentMethod();
        }
    }

    syncPaymentMethod() {
        const isStripeAllowed = this.props.stripeEnabled !== false && !this.props.onlyPP;
        const isPayPalAllowed = this.props.paypalEnabled !== false;
        const isRazorpayAllowed = this.props.razorpayEnabled !== false;

        if (this.state.paymentMethod === 'creditCard' && !isStripeAllowed) {
            if (isPayPalAllowed) this.setState({ paymentMethod: 'paypal' });
            else if (isRazorpayAllowed) this.setState({ paymentMethod: 'razorpay' });
            else this.setState({ paymentMethod: '' });
        } else if (this.state.paymentMethod === 'paypal' && !isPayPalAllowed) {
            if (isStripeAllowed) this.setState({ paymentMethod: 'creditCard' });
            else if (isRazorpayAllowed) this.setState({ paymentMethod: 'razorpay' });
            else this.setState({ paymentMethod: '' });
        } else if (this.state.paymentMethod === 'razorpay' && !isRazorpayAllowed) {
            if (isStripeAllowed) this.setState({ paymentMethod: 'creditCard' });
            else if (isPayPalAllowed) this.setState({ paymentMethod: 'paypal' });
            else this.setState({ paymentMethod: '' });
        }
    }

    getTaxCalculations(basePrice) {
        const { taxConfig } = this.state;
        if (!taxConfig || !taxConfig.enableTax) {
            return { subtotal: basePrice, taxAmount: 0, totalPrice: basePrice, taxName: 'GST', taxRate: 0, companyTaxId: '', taxInclusive: false };
        }

        const rate = parseFloat(taxConfig.taxRate) || 0;
        const isInclusive = Boolean(taxConfig.taxInclusive);
        let taxAmount = 0, subtotal = basePrice, totalPrice = basePrice;

        if (isInclusive) {
            taxAmount = basePrice - (basePrice / (1 + (rate / 100)));
            subtotal = basePrice - taxAmount;
            totalPrice = basePrice;
        } else {
            taxAmount = basePrice * (rate / 100);
            subtotal = basePrice;
            totalPrice = basePrice + taxAmount;
        }

        return {
            subtotal: parseFloat(subtotal.toFixed(2)),
            taxAmount: parseFloat(taxAmount.toFixed(2)),
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            taxName: taxConfig.taxName || 'GST',
            taxRate: rate,
            companyTaxId: taxConfig.companyTaxId || '',
            taxInclusive: isInclusive
        };
    }

    handleInput(name, event) {
        this.setState({ [name]: event.target ? event.target.value : event });
    }

    getCurrentUser() {
        // 1. Check React AuthContext (main.jsx provides user object directly as context value)
        if (this.context) {
            if (this.context.uid) return this.context;
            if (this.context.currentUser && this.context.currentUser.uid) return this.context.currentUser;
            if (this.context.user && this.context.user.uid) return this.context.user;
        }

        // 2. Check component props
        if (this.props.user && this.props.user.uid) return this.props.user;
        if (this.props.currentUser && this.props.currentUser.uid) return this.props.currentUser;

        // 3. Fallback to active Firebase Auth session
        if (fire.auth() && fire.auth().currentUser && fire.auth().currentUser.uid) {
            return fire.auth().currentUser;
        }

        // 4. Fallback to localStorage session cache
        try {
            const rawUser = localStorage.getItem('user') || localStorage.getItem('firebase_user') || localStorage.getItem('user_session');
            if (rawUser) {
                const parsed = JSON.parse(rawUser);
                if (parsed && (parsed.uid || parsed.id)) {
                    return {
                        uid: parsed.uid || parsed.id,
                        email: parsed.email || '',
                        displayName: parsed.displayName || parsed.name || 'Candidate Subscriber'
                    };
                }
            }
        } catch (e) {}

        return null;
    }

    async handleSubmit() {
        const { stripe, elements } = this.props;
        if (!stripe || !elements) return;

        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) {
            alert('User authentication error. Please sign in and try again.');
            return;
        }
        const uid = currentUser.uid;

        this.setState({ isLoading: true });

        try {
            const cardElement = elements.getElement(CardElement);
            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
                billing_details: {
                    name: this.state.CardHolder || currentUser.displayName || 'Candidate Subscriber',
                    address: {
                        line1: this.state.Address || 'Billing Address',
                        postal_code: this.state['Postal Code'] || '000000',
                        country: 'US',
                    },
                },
            });

            if (error) {
                console.error('Stripe Payment Method Error:', error);
                alert(error.message);
                this.setState({ isLoading: false });
                return;
            }

            const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
                : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
                : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;

            const taxCalc = this.getTaxCalculations(basePrice);
            const apiBase = `${conf.provider || 'http'}://${conf.backendUrl}`;

            // Step 1: Create Stripe Payment Intent on backend
            const payRes = await axios.post(`${apiBase}/api/pay`, {
                price: taxCalc.totalPrice,
                userId: uid,
                plan: this.props.selectedPlan,
                currency: this.props.currencyCode || 'USD',
            });

            const clientSecret = payRes.data?.client_secret;
            if (!clientSecret) {
                throw new Error('Failed to retrieve payment confirmation token from server.');
            }

            // Step 2: Confirm card payment with Stripe
            const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: paymentMethod.id,
            });

            if (confirmError) {
                console.error('Stripe Confirm Payment Error:', confirmError);
                alert(confirmError.message || 'Payment confirmation failed.');
                this.setState({ isLoading: false });
                return;
            }

            if (paymentIntent.status !== 'succeeded') {
                alert(`Payment was not completed (Status: ${paymentIntent.status}). Please try again.`);
                this.setState({ isLoading: false });
                return;
            }

            // Step 3: Track & activate subscription on Firestore
            trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
            trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
            trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'Stripe', amount: taxCalc.totalPrice, user_id: uid });

            await addSbs(this.props.selectedPlan, 'Stripe', new Date(), taxCalc.totalPrice, uid, {
                subtotal: taxCalc.subtotal, taxAmount: taxCalc.taxAmount, taxRate: taxCalc.taxRate,
                taxName: taxCalc.taxName, companyTaxId: taxCalc.companyTaxId,
                customerTaxId: this.state.customerTaxId || '', currency: this.props.currencyCode || 'USD',
                paymentIntentId: paymentIntent.id,
            });
            this.setState({ step: 3, isLoading: false });
        } catch (err) {
            console.error('Unexpected Submit Error:', err);
            alert(err.response?.data?.error || err.message || 'An unexpected error occurred. Please try again.');
            this.setState({ isLoading: false });
        }
    }

    handlePayPalSuccess = async (details) => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { alert('User authentication error. Please refresh and try again.'); return; }
        const uid = currentUser.uid;
        const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
            : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
            : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;

        const taxCalc = this.getTaxCalculations(basePrice);

        // Verify order on backend
        try {
            const apiBase = `${conf.provider || 'http'}://${conf.backendUrl}`;
            await axios.post(`${apiBase}/api/paypal/verify`, {
                orderId: details.id,
                userId: uid,
                plan: this.props.selectedPlan,
                amount: taxCalc.totalPrice,
                currency: this.props.currencyCode || 'USD',
            });
        } catch (verifyErr) {
            console.warn('[PayPal Verification Notice]:', verifyErr.message);
        }

        trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
        trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'PayPal', amount: taxCalc.totalPrice, user_id: uid });

        await addSbs(this.props.selectedPlan, 'PayPal', new Date(), taxCalc.totalPrice, uid, {
            subtotal: taxCalc.subtotal, taxAmount: taxCalc.taxAmount, taxRate: taxCalc.taxRate,
            taxName: taxCalc.taxName, companyTaxId: taxCalc.companyTaxId,
            customerTaxId: this.state.customerTaxId || '', currency: this.props.currencyCode || 'USD',
            paypalOrderId: details.id,
        });
        this.setState({ step: 3 });
    };

    handlePayPalError = (error) => {
        console.error('PayPal payment failed:', error);
        alert(this.props.t('billing.error.paypal', 'PayPal payment failed. Please try again.'));
    };

    handleRazorpayPayment = async () => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { alert('User authentication error. Please refresh and try again.'); return; }
        const uid = currentUser.uid;
        this.setState({ isLoading: true });

        try {
            const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
                : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
                : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;
            const taxCalc = this.getTaxCalculations(basePrice);

            const apiBase = `${conf.provider || 'http'}://${conf.backendUrl}`;
            const orderRes = await axios.post(`${apiBase}/api/razorpay/create-order`, {
                amount: taxCalc.totalPrice,
                currency: this.props.currencyCode || 'INR',
                userId: uid,
                plan: this.props.selectedPlan,
            });

            const orderData = orderRes.data;
            if (!orderData || !orderData.id) {
                throw new Error(orderData?.error || 'Failed to create Razorpay order');
            }

            // Dynamically load Razorpay SDK script if not loaded
            if (!window.Razorpay) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
                    document.body.appendChild(script);
                });
            }

            const options = {
                key: orderData.key || conf.razorpayKeyID || 'rzp_test_demo',
                amount: orderData.amount,
                currency: orderData.currency || 'INR',
                name: conf.brand?.name || 'ResumePilot AI',
                description: `${this.getPlanLabel()} Subscription`,
                order_id: orderData.id.startsWith('order_demo_') ? undefined : orderData.id,
                handler: async (response) => {
                    try {
                        if (response.razorpay_signature) {
                            await axios.post(`${apiBase}/api/razorpay/verify-payment`, {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            });
                        }
                        trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
                        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
                        trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'Razorpay', amount: taxCalc.totalPrice, user_id: uid });

                        await addSbs(this.props.selectedPlan, 'Razorpay', new Date(), taxCalc.totalPrice, uid, {
                            subtotal: taxCalc.subtotal, taxAmount: taxCalc.taxAmount, taxRate: taxCalc.taxRate,
                            taxName: taxCalc.taxName, companyTaxId: taxCalc.companyTaxId,
                            customerTaxId: this.state.customerTaxId || '', currency: this.props.currencyCode || 'INR',
                            razorpayPaymentId: response.razorpay_payment_id || 'demo_pay_id',
                        });
                        this.setState({ step: 3, isLoading: false });
                    } catch (err) {
                        console.error('Razorpay verification error:', err);
                        alert('Payment verification failed: ' + (err.response?.data?.error || err.message));
                        this.setState({ isLoading: false });
                    }
                },
                prefill: {
                    name: this.state.CardHolder || currentUser.displayName || '',
                    email: currentUser.email || '',
                },
                theme: { color: '#4f46e5' },
                modal: {
                    ondismiss: () => {
                        this.setState({ isLoading: false });
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            console.error('Razorpay initiation error:', err);
            alert(err.response?.data?.error || err.message || 'Failed to initialize Razorpay checkout');
            this.setState({ isLoading: false });
        }
    };

    nextStep() { this.setState((prev) => ({ step: prev.step + 1 })); }
    previousStep() { this.setState((prev) => ({ step: prev.step - 1 })); }

    getPrice() {
        return this.props.selectedPlan == 'monthly' ? this.props.monthly
            : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
            : this.props.yearly;
    }

    getPlanLabel() {
        return this.props.selectedPlan === 'monthly' ? 'Pro Monthly'
            : this.props.selectedPlan === 'halfYear' ? 'Pro 6-Month (Save 35%)'
            : 'Pro Annual (Save 50%)';
    }

    renderOrderSummary(price, planTitle) {
        const { t } = this.props;
        const tax = this.getTaxCalculations(price);
        return (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden sticky top-6">
                {/* Header */}
                <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 p-5 text-white relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/5 rounded-full"></div>
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-white/5 rounded-full"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-amber-400/20 rounded-xl flex items-center justify-center">
                                    <FaCrown className="w-4 h-4 text-amber-400" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-slate-300">Order Summary</span>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-300 text-[10px] font-black rounded-lg border border-emerald-400/30 uppercase">VIP</span>
                        </div>
                        <div className="text-2xl font-black text-white">{this.props.currency}{tax.totalPrice}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Due today • Instant activation</div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="p-5 space-y-3 text-xs border-b border-slate-100">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500">Plan</span>
                        <span className="font-bold text-slate-900">{planTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500">Billing Term</span>
                        <span className="font-semibold text-slate-700">
                            {this.props.selectedPlan === 'monthly' ? 'Monthly' : this.props.selectedPlan === 'halfYear' ? '6 Months' : '12 Months (+3 Free)'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500">Base Price</span>
                        <span className="font-semibold text-slate-900">{this.props.currency}{tax.subtotal}</span>
                    </div>
                    {this.state.taxConfig.enableTax ? (
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500">{this.state.taxConfig.taxName} ({this.state.taxConfig.taxRate}%){this.state.taxConfig.taxInclusive ? ' incl.' : ''}</span>
                            <span className="font-semibold text-indigo-700">{this.props.currency}{tax.taxAmount}</span>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center">
                            <span className="text-slate-500">Tax / GST</span>
                            <span className="font-bold text-emerald-700">Exempt</span>
                        </div>
                    )}
                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                        <span className="font-black text-slate-900 text-sm">Total Due</span>
                        <span className="text-xl font-black text-indigo-700">{this.props.currency}{tax.totalPrice}</span>
                    </div>
                </div>

                {/* Features */}
                <div className="p-5 space-y-2.5">
                    {[
                        { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters', color: 'text-purple-600' },
                        { icon: FaDownload, text: 'PDF, Word DocX & Portfolio Links', color: 'text-indigo-600' },
                        { icon: FaRocket, text: 'ATS Keyword Optimization Engine', color: 'text-blue-600' },
                        { icon: FaHeadset, text: '24/7 VIP Priority Support', color: 'text-emerald-600' },
                    ].map(({ icon: Icon, text, color }, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-xs text-slate-600">
                            <div className={`w-5 h-5 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 ${color}`}>
                                <Icon className="w-2.5 h-2.5" />
                            </div>
                            <span className="font-medium">{text}</span>
                        </div>
                    ))}
                </div>

                {/* Guarantees */}
                <div className="px-5 pb-5 pt-1 space-y-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-semibold">
                        <FaShieldAlt className="w-3 h-3 shrink-0" />
                        <span>30-Day Risk-Free Money Back Guarantee</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <FaLock className="w-3 h-3 shrink-0" />
                        <span>256-bit SSL · PCI-DSS Compliant · Encrypted</span>
                    </div>
                </div>

                {/* Payment Logos */}
                <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 text-center">Accepted Payments</p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <img src={VisaLogo} alt="Visa" className="h-4 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={MastercardLogo} alt="Mastercard" className="h-4 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={AmexLogo} alt="Amex" className="h-4 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={PayPalLogo} alt="PayPal" className="h-4 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={JCBLogo} alt="JCB" className="h-4 opacity-80 hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            </div>
        );
    }

    render() {
        const { t } = this.props;
        const isEmbedded = this.props.embedded === true;
        const price = this.getPrice();
        const planTitle = this.getPlanLabel();

        // In embedded mode, skip the full-page dark outer shell.
        // The Plans.jsx wrapper already provides a card container.
        if (isEmbedded) {
            return this.renderEmbedded(price, planTitle);
        }

        return this.renderStandalone(price, planTitle);
    }

    renderStandalone(price, planTitle) {
        const { t } = this.props;
        const tax = this.getTaxCalculations(price);
        const { step, isLoading, paymentMethod } = this.state;

        const steps = [
            { label: 'Billing Info', icon: FaGlobe },
            { label: 'Payment Method', icon: FaCreditCard },
            { label: 'Secure Payment', icon: FaLock },
            { label: 'Activation', icon: FaRocket },
        ];

        return (
            <div className="w-full min-h-screen font-sans" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)' }}>
                <style>{`
                    @keyframes float-up { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-120px) rotate(360deg); opacity: 0; } }
                    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
                    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.4); } 50% { box-shadow: 0 0 40px rgba(99,102,241,0.8); } }
                    @keyframes slide-in-right { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
                    @keyframes slide-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes confetti-fall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(200px) rotate(720deg); opacity: 0; } }
                    @keyframes success-pop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                    .step-slide { animation: slide-in-right 0.4s ease forwards; }
                    .step-slide-up { animation: slide-in-up 0.4s ease forwards; }
                    .success-pop { animation: success-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                    .shimmer-text { background: linear-gradient(90deg, #fff 0%, #a5b4fc 30%, #fff 60%, #c4b5fd 90%, #fff 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 3s linear infinite; }
                    .card-glow { animation: pulse-glow 2s ease-in-out infinite; }
                    .glass-card { background: rgba(255,255,255,0.97); backdrop-filter: blur(20px); }
                    .confetti-piece { position: absolute; width: 8px; height: 8px; border-radius: 2px; animation: confetti-fall linear forwards; }
                    .checkout-input { width: 100%; padding: 12px 16px; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 14px; font-size: 13px; font-weight: 600; color: #0f172a; outline: none; transition: all 0.2s; }
                    .checkout-input:focus { border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 4px rgba(79,70,229,0.08); }
                    .checkout-input::placeholder { color: #94a3b8; font-weight: 400; }
                `}</style>

                <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">

                    {/* Hero Header */}
                    <div className="text-center mb-8 step-slide-up">
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-4"
                            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
                            <FaLock className="w-3 h-3" />
                            <span>256-Bit Bank-Grade SSL Encrypted Checkout</span>
                            <FaShieldAlt className="w-3 h-3" />
                        </div>
                        {step < 3 && (
                            <>
                                <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-2 shimmer-text">
                                    Complete Your Purchase
                                </h1>
                                <p className="text-slate-400 text-sm max-w-lg mx-auto">
                                    Instant VIP access to all AI resume tools, unlimited exports & ATS optimization engine.
                                </p>
                            </>
                        )}
                        {step === 3 && (
                            <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-2 shimmer-text">
                                🎉 You're Now a PRO Member!
                            </h1>
                        )}
                    </div>

                    {/* Step Progress Indicator */}
                    {step < 3 && (
                        <div className="mb-8 step-slide-up">
                            <div className="flex items-center justify-center gap-0 max-w-xl mx-auto">
                                {steps.slice(0, 3).map((s, i) => {
                                    const Icon = s.icon;
                                    const isCompleted = step > i;
                                    const isActive = step === i;
                                    return (
                                        <React.Fragment key={i}>
                                            <div className="flex flex-col items-center">
                                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-500 ${
                                                    isCompleted ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30' :
                                                    isActive ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 card-glow' :
                                                    'bg-white/10 border border-white/20'
                                                }`}>
                                                    {isCompleted ? (
                                                        <FaCheck className="w-4 h-4 text-white" />
                                                    ) : (
                                                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                                    )}
                                                </div>
                                                <span className={`mt-2 text-[11px] font-bold transition-all ${isActive ? 'text-indigo-300' : isCompleted ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {s.label}
                                                </span>
                                            </div>
                                            {i < 2 && (
                                                <div className={`w-16 sm:w-24 h-0.5 mb-6 mx-1 transition-all duration-700 ${step > i ? 'bg-gradient-to-r from-emerald-500 to-indigo-500' : 'bg-white/10'}`} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Sandbox Banner */}
                    {this.props.sandboxMode && step < 3 && (
                        <div className="mb-6 flex items-center justify-center gap-3 px-5 py-3 rounded-2xl max-w-xl mx-auto"
                            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
                            <span className="text-base">⚡</span>
                            <div>
                                <span className="text-xs font-black text-amber-300 uppercase tracking-wide">Sandbox Test Mode · </span>
                                <span className="text-xs text-amber-400/80">No real bank charges will be processed.</span>
                            </div>
                            <span className="ml-auto px-2 py-0.5 bg-amber-400/20 text-amber-300 text-[10px] font-black rounded uppercase">DEMO</span>
                        </div>
                    )}

                    {/* Main 2-col Layout */}
                    {step < 3 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                            
                            {/* LEFT: Form Panel */}
                            <div className="lg:col-span-3 order-1">
                                <div className="glass-card rounded-3xl shadow-2xl border border-white/20 overflow-hidden">

                                    {/* Step 0: Billing Info */}
                                    {step === 0 && (
                                        <div className="step-slide">
                                            {/* Step Header */}
                                            <div className="px-7 pt-7 pb-5 border-b border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                                        <FaGlobe className="w-5 h-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-black text-slate-900">Billing & Region</h2>
                                                        <p className="text-xs text-slate-500">Confirm your billing location for accurate tax receipts</p>
                                                    </div>
                                                    <span className="ml-auto text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">Step 1 of 3</span>
                                                </div>
                                            </div>

                                            <div className="p-7 space-y-5">
                                                {/* Country + Postal */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                            <FaMapMarkerAlt className="w-3 h-3 text-indigo-500" />
                                                            Country / Region *
                                                        </label>
                                                        <DropdownInput
                                                            handleInputs={this.handleInput}
                                                            placeholder="Select your country"
                                                            checkout={true}
                                                            name="Country"
                                                            options={this.countries}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                                                            Postal / Zip Code *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter postal / zip code"
                                                            onChange={(e) => this.handleInput('Postal Code', e)}
                                                            className="checkout-input"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Tax ID */}
                                                {this.state.taxConfig.enableTax && (
                                                    <div>
                                                        <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                                                            Business {this.state.taxConfig.taxName}IN / Tax ID <span className="text-slate-400 font-normal normal-case">(Optional — for B2B invoices)</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={this.state.customerTaxId}
                                                            onChange={(e) => this.setState({ customerTaxId: e.target.value })}
                                                            placeholder={`Enter your ${this.state.taxConfig.taxName} registration number`}
                                                            className="checkout-input"
                                                        />
                                                    </div>
                                                )}

                                                {/* Tax Info Card */}
                                                {this.state.taxConfig.enableTax && (
                                                    <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)', border: '1px solid #bfdbfe' }}>
                                                        <FaShieldAlt className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                                        <div>
                                                            <p className="text-xs font-bold text-blue-900">{this.state.taxConfig.taxName} @ {this.state.taxConfig.taxRate}% {this.state.taxConfig.taxInclusive ? '(Included in price)' : '(Added to total)'}</p>
                                                            <p className="text-[11px] text-blue-600 mt-0.5">Applicable for your region. Full invoice with GSTIN issued on payment.</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* CTA */}
                                                <button
                                                    type="button"
                                                    onClick={() => this.nextStep()}
                                                    className="w-full py-4 px-6 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                                    style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 8px 32px rgba(79,70,229,0.35)' }}>
                                                    <span>Continue to Payment Method</span>
                                                    <FaArrowRight className="w-4 h-4" />
                                                </button>

                                                <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                                                    <FaLock className="w-3 h-3" />
                                                    Your data is encrypted and never shared with third parties.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 1: Payment Method */}
                                    {step === 1 && (
                                        <div className="step-slide">
                                            <div className="px-7 pt-7 pb-5 border-b border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                                                        <FaCreditCard className="w-5 h-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-black text-slate-900">Payment Gateway</h2>
                                                        <p className="text-xs text-slate-500">Choose your preferred secure payment method</p>
                                                    </div>
                                                    <span className="ml-auto text-xs font-black text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">Step 2 of 3</span>
                                                </div>
                                            </div>

                                            <div className="p-7 space-y-4">
                                                {/* Stripe Card Option */}
                                                {(this.props.stripeEnabled !== false && !this.props.onlyPP) && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'creditCard' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'creditCard'
                                                                ? 'border-indigo-500 shadow-xl shadow-indigo-500/10'
                                                                : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'creditCard' ? { background: 'linear-gradient(135deg, #eef2ff, #faf5ff)' } : { background: '#fff' }}>
                                                        {paymentMethod === 'creditCard' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-200">
                                                                <FaCreditCard className="w-6 h-6 text-indigo-600" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-slate-900">Credit / Debit Card</h3>
                                                                <p className="text-xs text-slate-500 mt-0.5">Visa, Mastercard, Amex, Discover · Powered by Stripe</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <img src={VisaLogo} alt="Visa" className="h-4 opacity-80" />
                                                                    <img src={MastercardLogo} alt="Mastercard" className="h-4 opacity-80" />
                                                                    <img src={AmexLogo} alt="Amex" className="h-4 opacity-80" />
                                                                    <img src={JCBLogo} alt="JCB" className="h-4 opacity-80" />
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'creditCard' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                                                            }`}>
                                                                {paymentMethod === 'creditCard' && <FaCheck className="w-3 h-3 text-white" />}
                                                            </div>
                                                        </div>
                                                        {paymentMethod === 'creditCard' && (
                                                            <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 font-bold">
                                                                <FaShieldAlt className="w-3 h-3" />
                                                                <span>End-to-end encrypted · Card details never stored</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* PayPal Option */}
                                                {this.props.paypalEnabled !== false && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'paypal' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'paypal'
                                                                ? 'border-amber-400 shadow-xl shadow-amber-400/10'
                                                                : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'paypal' ? { background: 'linear-gradient(135deg, #fffbeb, #fff7ed)' } : { background: '#fff' }}>
                                                        {paymentMethod === 'paypal' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl flex items-center justify-center shrink-0 border border-amber-200">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-7 object-contain" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-slate-900">PayPal Express</h3>
                                                                <p className="text-xs text-slate-500 mt-0.5">Fast 1-click checkout with your PayPal account</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-md border border-amber-200">Buyer Protection</span>
                                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-md border border-amber-200">No Card Needed</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'paypal' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                                                            }`}>
                                                                {paymentMethod === 'paypal' && <FaCheck className="w-3 h-3 text-white" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Razorpay Option */}
                                                {this.props.razorpayEnabled !== false && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'razorpay' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'razorpay'
                                                                ? 'border-blue-500 shadow-xl shadow-blue-500/10'
                                                                : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'razorpay' ? { background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)' } : { background: '#fff' }}>
                                                        {paymentMethod === 'razorpay' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center shrink-0 border border-blue-200">
                                                                <span className="text-xl font-black text-blue-700">₹</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-slate-900">Razorpay Express &amp; UPI</h3>
                                                                <p className="text-xs text-slate-500 mt-0.5">UPI, GPay, PhonePe, Paytm, NetBanking &amp; Indian Cards</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-md border border-blue-200">Instant UPI</span>
                                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-md border border-blue-200">All Indian Banks</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'razorpay' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                                                            }`}>
                                                                {paymentMethod === 'razorpay' && <FaCheck className="w-3 h-3 text-white" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Fallback Banner if all payment providers disabled by admin */}
                                                {((this.props.stripeEnabled === false || this.props.onlyPP) && this.props.paypalEnabled === false) && (
                                                    <div className="p-5 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs font-semibold text-center space-y-2">
                                                        <p className="font-bold text-sm">No Active Payment Gateway</p>
                                                        <p>All online payment providers are currently disabled by the administrator. Please contact support.</p>
                                                    </div>
                                                )}

                                                {/* Navigation */}
                                                <div className="flex items-center gap-3 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => this.previousStep()}
                                                        className="px-5 py-3.5 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-2xl transition-all flex items-center gap-2 hover:bg-slate-50">
                                                        <FaArrowLeft className="w-3 h-3" />
                                                        <span>Back</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => this.nextStep()}
                                                        disabled={!paymentMethod}
                                                        className="flex-1 py-4 px-6 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                                        style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 8px 32px rgba(124,58,237,0.35)' }}>
                                                        <span>{paymentMethod === 'creditCard' ? 'Enter Card Details' : 'Pay with PayPal'}</span>
                                                        <FaArrowRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 2: Card / PayPal Payment */}
                                    {step === 2 && (
                                        <div className="step-slide">
                                            {paymentMethod === 'creditCard' ? (
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-slate-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                                <FaLock className="w-5 h-5 text-white" />
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-slate-900">Secure Card Payment</h2>
                                                                <p className="text-xs text-slate-500">Your card details are 256-bit encrypted via Stripe</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Step 3 of 3</span>
                                                        </div>
                                                    </div>

                                                    <div className="p-7 space-y-5">
                                                        {/* Mock Credit Card Visual */}
                                                        <div className="relative h-36 rounded-2xl overflow-hidden mb-2" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', boxShadow: '0 20px 60px rgba(15,12,41,0.4)' }}>
                                                            <div className="absolute top-3 left-4 w-10 h-7 rounded-md opacity-80" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}></div>
                                                            <div className="absolute inset-0 flex items-end p-5">
                                                                <div className="text-white">
                                                                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">Card Holder</p>
                                                                    <p className="text-sm font-black tracking-wider">{this.state.CardHolder || 'YOUR NAME HERE'}</p>
                                                                </div>
                                                                <div className="ml-auto text-right text-white">
                                                                    <div className="flex gap-1 justify-end mb-2">
                                                                        <img src={VisaLogo} alt="Visa" className="h-5 opacity-80 brightness-0 invert" />
                                                                    </div>
                                                                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Secured by Stripe</p>
                                                                </div>
                                                            </div>
                                                            <div className="absolute top-3 right-4 opacity-20">
                                                                <div className="w-16 h-16 rounded-full border-2 border-white"></div>
                                                                <div className="w-10 h-10 rounded-full border-2 border-white -mt-6 ml-8"></div>
                                                            </div>
                                                        </div>

                                                        {/* Cardholder Name */}
                                                        <div>
                                                            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                                                                Cardholder Name *
                                                            </label>
                                                            <input
                                                                type="text"
                                                                onChange={(e) => this.handleInput('CardHolder', e)}
                                                                placeholder="Full name as displayed on card"
                                                                className="checkout-input"
                                                            />
                                                        </div>

                                                        {/* Billing Address */}
                                                        <div>
                                                            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
                                                                Billing Address *
                                                            </label>
                                                            <input
                                                                type="text"
                                                                onChange={(e) => this.handleInput('Address', e)}
                                                                placeholder="Street address, apartment or suite"
                                                                className="checkout-input"
                                                            />
                                                        </div>

                                                        {/* Card Element */}
                                                        <div>
                                                            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                                <FaCreditCard className="w-3 h-3 text-indigo-500" />
                                                                Card Number, Expiry & CVC *
                                                            </label>
                                                            <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus-within:border-indigo-500 focus-within:bg-white focus-within:shadow-lg transition-all" style={{ focusWithin: { boxShadow: '0 0 0 4px rgba(79,70,229,0.1)' } }}>
                                                                <CardElement
                                                                    options={{
                                                                        style: {
                                                                            base: {
                                                                                fontSize: '15px',
                                                                                color: '#0f172a',
                                                                                fontFamily: '"Inter", -apple-system, sans-serif',
                                                                                '::placeholder': { color: '#94a3b8' },
                                                                                iconColor: '#4f46e5',
                                                                            },
                                                                            invalid: { color: '#e11d48', iconColor: '#e11d48' },
                                                                        },
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Security Note */}
                                                        <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #a7f3d0' }}>
                                                            <FaShieldAlt className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                                            <div>
                                                                <p className="text-xs font-bold text-emerald-900">Bank-Grade Security · PCI-DSS Level 1 Compliant</p>
                                                                <p className="text-[11px] text-emerald-600 mt-0.5">Card numbers are tokenized by Stripe and never stored on our servers.</p>
                                                            </div>
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => this.previousStep()}
                                                                className="px-5 py-3.5 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-2xl transition-all flex items-center gap-2 hover:bg-slate-50">
                                                                <FaArrowLeft className="w-3 h-3" />
                                                                <span>Back</span>
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => this.handleSubmit()}
                                                                disabled={isLoading}
                                                                className="flex-1 py-4 px-6 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
                                                                style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', boxShadow: '0 8px 32px rgba(5,150,105,0.35)' }}>
                                                                {isLoading ? (
                                                                    <>
                                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                                        <span>Processing Secure Charge...</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <FaLock className="w-4 h-4" />
                                                                        <span>Pay {this.props.currency}{price} Securely</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>

                                                        <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                                                            <FaShieldAlt className="w-3 h-3" />
                                                            30-Day Money-Back Guarantee · Cancel anytime
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                /* PayPal Flow */
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-slate-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-400/30">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain brightness-0" />
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-slate-900">PayPal Express</h2>
                                                                <p className="text-xs text-slate-500">Complete your transaction securely via PayPal</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">Step 3 of 3</span>
                                                        </div>
                                                    </div>

                                                    <div className="p-7 space-y-5">
                                                        {/* PayPal Summary Card */}
                                                        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1.5px solid #fcd34d' }}>
                                                            <div className="px-5 py-4 flex items-center justify-between border-b border-amber-200/60">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-6 object-contain" />
                                                                <div className="text-right">
                                                                    <p className="text-[11px] text-amber-700 font-semibold">Total to Pay</p>
                                                                    <p className="text-xl font-black text-amber-900">{this.props.currency}{price}</p>
                                                                </div>
                                                            </div>
                                                            <div className="px-5 py-4 space-y-1">
                                                                <div className="flex items-center gap-2 text-xs text-amber-800">
                                                                    <FaCheckCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                                    <span className="font-semibold">PayPal Buyer Protection included</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-xs text-amber-700">
                                                                    <FaShieldAlt className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                    <span>No credit card needed · Redirect to PayPal</span>
                                                                </div>
                                                            </div>
                                                            <div className="px-5 pb-5">
                                                                <PayPalButtonWrapper
                                                                    amount={price}
                                                                    currency={this.props.currencyCode || 'USD'}
                                                                    selectedPlan={this.props.selectedPlan}
                                                                    onSuccess={this.handlePayPalSuccess}
                                                                    onError={this.handlePayPalError}
                                                                />
                                                            </div>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => this.previousStep()}
                                                            className="w-full py-3.5 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 hover:bg-slate-50">
                                                            <FaArrowLeft className="w-3 h-3" />
                                                            <span>Back to Payment Method</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT: Order Summary Sidebar */}
                            <div className="lg:col-span-2 order-2">
                                {this.renderOrderSummary(price, planTitle)}
                            </div>
                        </div>
                    ) : (
                        /* Step 3: Success Screen */
                        <div className="max-w-3xl mx-auto">
                            <div className="glass-card rounded-3xl shadow-2xl overflow-hidden relative" style={{ border: '1px solid rgba(255,255,255,0.3)' }}>
                                
                                {/* Confetti background strip */}
                                <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #ec4899, #f59e0b, #10b981, #4f46e5)', backgroundSize: '200% auto', animation: 'shimmer 2s linear infinite' }}></div>

                                <div className="p-8 sm:p-12 text-center space-y-8">
                                    {/* Lottie + Confetti */}
                                    <div className="relative w-36 h-36 mx-auto success-pop">
                                        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)', animation: 'pulse-glow 2s ease-in-out infinite' }}></div>
                                        <>{View}</>
                                        {/* Mini confetti dots */}
                                        {[
                                            { top: '10%', left: '5%', w: 10, h: 10, bg: '#4f46e5', delay: '0s', dur: '1.8s' },
                                            { top: '20%', right: '5%', w: 8, h: 8, bg: '#f59e0b', delay: '0.3s', dur: '2s' },
                                            { bottom: '10%', left: '10%', w: 6, h: 6, bg: '#ec4899', delay: '0.6s', dur: '1.6s' },
                                            { bottom: '20%', right: '10%', w: 9, h: 9, bg: '#10b981', delay: '0.2s', dur: '2.2s' },
                                            { top: '50%', left: '-5%', w: 7, h: 7, bg: '#7c3aed', delay: '0.9s', dur: '1.9s' },
                                            { top: '40%', right: '-5%', w: 8, h: 8, bg: '#f97316', delay: '0.4s', dur: '1.7s' },
                                        ].map((c, i) => (
                                            <div key={i} className="confetti-piece" style={{
                                                top: c.top, left: c.left, right: c.right, bottom: c.bottom,
                                                width: c.w, height: c.h, background: c.bg,
                                                animationDuration: c.dur, animationDelay: c.delay,
                                            }} />
                                        ))}
                                    </div>

                                    {/* Success Badge + Title */}
                                    <div className="space-y-4">
                                        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest"
                                            style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', color: '#065f46', border: '1.5px solid #6ee7b7' }}>
                                            <FaCheckCircle className="w-4 h-4" />
                                            🎉 Transaction Verified & Completed
                                        </div>
                                        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                            Welcome to PRO Candidate Tier!
                                        </h2>
                                        <p className="text-slate-500 text-sm max-w-lg mx-auto leading-relaxed">
                                            Your subscription is now <strong className="text-slate-700">instantly active</strong>. All AI Resume Builder tools, ATS Keyword Synthesizers, unlimited PDF exports, and VIP support are fully unlocked.
                                        </p>
                                    </div>

                                    {/* Unlocked Features Grid */}
                                    <div className="rounded-2xl overflow-hidden border border-slate-100" style={{ background: 'linear-gradient(135deg, #0f0c29, #1e1b4b)' }}>
                                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                                            <span className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                                <FaGem className="w-3.5 h-3.5" />
                                                Your VIP Benefits — Fully Unlocked
                                            </span>
                                            <span className="text-xs font-black text-emerald-400 uppercase">✓ Active</span>
                                        </div>
                                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {[
                                                { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters' },
                                                { icon: FaDownload, text: '1-Click PDF, Word DocX & Portfolio Links' },
                                                { icon: FaRocket, text: 'ATS Smart Keyword Optimization Engine' },
                                                { icon: FaHeadset, text: '24/7 Priority VIP Support' },
                                                { icon: FaFileAlt, text: '51+ Premium ATS Resume Templates' },
                                                { icon: FaInfinity, text: 'Unlimited Cloud Sync & Resume Storage' },
                                            ].map(({ icon: Icon, text }, i) => (
                                                <div key={i} className="flex items-center gap-3 text-xs text-slate-200">
                                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                                                        <Icon className="w-3 h-3 text-indigo-300" />
                                                    </div>
                                                    <span className="font-semibold">{text}</span>
                                                    <FaCheck className="w-3 h-3 text-emerald-400 ml-auto shrink-0" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Billing Info Summary */}
                                    <div className="flex items-center justify-center gap-6 text-xs text-slate-500 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <FaShieldAlt className="w-3.5 h-3.5 text-emerald-500" />
                                            <span>30-Day Money-Back Guarantee</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FaLock className="w-3.5 h-3.5 text-indigo-500" />
                                            <span>Auto-Renewal Control in Dashboard</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FaEnvelope className="w-3.5 h-3.5 text-blue-500" />
                                            <span>Invoice sent to your email</span>
                                        </div>
                                    </div>

                                    {/* CTA Buttons */}
                                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => { window.location.href = '/dashboard'; }}
                                            className="w-full sm:w-auto px-8 py-4 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                                            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 12px 40px rgba(79,70,229,0.4)', minWidth: '220px' }}>
                                            <FaRocket className="w-4 h-4" />
                                            <span>Go to AI Resume Builder</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { window.location.href = '/dashboard/plans?tab=invoices'; }}
                                            className="w-full sm:w-auto px-7 py-4 rounded-2xl text-slate-700 font-black text-sm flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-md"
                                            style={{ background: '#fff', border: '2px solid #e2e8f0', minWidth: '200px' }}>
                                            <FaFileAlt className="w-4 h-4 text-slate-500" />
                                            <span>View Invoice & Receipt</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMBEDDED MODE: clean inline layout inside Plans.jsx card container
    // ─────────────────────────────────────────────────────────────────────────
    renderEmbedded(price, planTitle) {
        const { t } = this.props;
        const { step, isLoading, paymentMethod } = this.state;
        const tax = this.getTaxCalculations(price);

        const steps = [
            { label: 'Billing Info', icon: FaGlobe },
            { label: 'Payment Method', icon: FaCreditCard },
            { label: 'Secure Payment', icon: FaLock },
        ];

        return (
            <div className="font-sans space-y-6">
                <style>{`
                    @keyframes slide-in-right-emb { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                    @keyframes success-pop-emb { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                    @keyframes shimmer-emb { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
                    @keyframes confetti-fall-emb { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(150px) rotate(720deg); opacity: 0; } }
                    .emb-slide { animation: slide-in-right-emb 0.35s ease forwards; }
                    .emb-success { animation: success-pop-emb 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                    .checkout-input-emb { width: 100%; padding: 11px 14px; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 12px; font-weight: 600; color: #0f172a; outline: none; transition: all 0.2s; }
                    .checkout-input-emb:focus { border-color: #4f46e5; background: #fff; box-shadow: 0 0 0 3px rgba(79,70,229,0.08); }
                    .checkout-input-emb::placeholder { color: #94a3b8; font-weight: 400; }
                    .emb-confetti-piece { position: absolute; border-radius: 2px; animation: confetti-fall-emb linear forwards; }
                `}</style>

                {/* Step Indicator */}
                {step < 3 && (
                    <div className="flex items-center justify-between gap-2 mb-2">
                        {steps.map((s, i) => {
                            const Icon = s.icon;
                            const done = step > i, active = step === i;
                            return (
                                <React.Fragment key={i}>
                                    <div className="flex flex-col items-center">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black transition-all duration-400 ${
                                            done ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md' :
                                            active ? 'bg-gradient-to-br from-indigo-600 to-purple-600 shadow-md shadow-indigo-500/30' :
                                            'bg-slate-100 border border-slate-200'
                                        }`}>
                                            {done ? <FaCheck className="w-3.5 h-3.5 text-white" /> : <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-slate-400'}`} />}
                                        </div>
                                        <span className={`mt-1.5 text-[10px] font-bold ${ active ? 'text-indigo-700' : done ? 'text-emerald-600' : 'text-slate-400' }`}>{s.label}</span>
                                    </div>
                                    {i < steps.length - 1 && (
                                        <div className={`flex-1 h-0.5 mb-5 transition-all duration-500 ${step > i ? 'bg-gradient-to-r from-emerald-500 to-indigo-400' : 'bg-slate-200'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                {/* Sandbox Banner */}
                {this.props.sandboxMode && step < 3 && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                        <span className="text-base">⚡</span>
                        <span className="text-xs font-black text-amber-800 uppercase">Sandbox Mode · </span>
                        <span className="text-xs text-amber-600">No real charges will be processed.</span>
                        <span className="ml-auto px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded uppercase">DEMO</span>
                    </div>
                )}

                {/* ──────── STEP 0: Billing Info ──────── */}
                {step === 0 && (
                    <div className="emb-slide space-y-5">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/25">
                                <FaGlobe className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900">Billing & Region</h3>
                                <p className="text-[11px] text-slate-500">Confirm your location for accurate tax receipts</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                    <FaMapMarkerAlt className="w-2.5 h-2.5 text-indigo-500" /> Country / Region *
                                </label>
                                <DropdownInput handleInputs={this.handleInput} placeholder="Select your country" checkout={true} name="Country" options={this.countries} />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Postal / Zip Code *</label>
                                <input type="text" placeholder="Enter postal / zip code" onChange={(e) => this.handleInput('Postal Code', e)} className="checkout-input-emb" />
                            </div>
                        </div>

                        {this.state.taxConfig.enableTax && (
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">
                                    Business {this.state.taxConfig.taxName}IN <span className="text-slate-400 font-normal normal-case">(Optional — B2B invoices)</span>
                                </label>
                                <input type="text" value={this.state.customerTaxId} onChange={(e) => this.setState({ customerTaxId: e.target.value })} placeholder={`Enter ${this.state.taxConfig.taxName} registration number`} className="checkout-input-emb" />
                            </div>
                        )}

                        {this.state.taxConfig.enableTax && (
                            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 border border-blue-100">
                                <FaShieldAlt className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-blue-800 font-medium">{this.state.taxConfig.taxName} @ {this.state.taxConfig.taxRate}% {this.state.taxConfig.taxInclusive ? '(included in price)' : '(added to total)'}. Full invoice issued on payment.</p>
                            </div>
                        )}

                        <button type="button" onClick={() => this.nextStep()}
                            className="w-full py-3.5 px-6 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 6px 20px rgba(79,70,229,0.3)' }}>
                            <span>Continue to Payment Method</span>
                            <FaArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ──────── STEP 1: Payment Method ──────── */}
                {step === 1 && (
                    <div className="emb-slide space-y-4">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-500/25">
                                <FaCreditCard className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900">Choose Payment Gateway</h3>
                                <p className="text-[11px] text-slate-500">Select your preferred secure payment method</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {(this.props.stripeEnabled !== false && !this.props.onlyPP) && (
                                <div onClick={() => this.setState({ paymentMethod: 'creditCard' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'creditCard' ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}>
                                    {paymentMethod === 'creditCard' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                                            <FaCreditCard className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-slate-900">Credit / Debit Card (Stripe)</h4>
                                            <p className="text-[11px] text-slate-500">Visa, Mastercard, Amex, Discover</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <img src={VisaLogo} alt="Visa" className="h-3.5 opacity-80" />
                                                <img src={MastercardLogo} alt="MC" className="h-3.5 opacity-80" />
                                                <img src={AmexLogo} alt="Amex" className="h-3.5 opacity-80" />
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'creditCard' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                                        }`}>
                                            {paymentMethod === 'creditCard' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {this.props.paypalEnabled !== false && (
                                <div onClick={() => this.setState({ paymentMethod: 'paypal' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'paypal' ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}>
                                    {paymentMethod === 'paypal' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center shrink-0">
                                            <img src={PayPalLogo} alt="PayPal" className="h-6 object-contain" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-slate-900">PayPal Express</h4>
                                            <p className="text-[11px] text-slate-500">Fast 1-click checkout with PayPal account</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded border border-amber-200">Buyer Protection</span>
                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded border border-amber-200">No Card Needed</span>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'paypal' ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                                        }`}>
                                            {paymentMethod === 'paypal' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {this.props.razorpayEnabled !== false && (
                                <div onClick={() => this.setState({ paymentMethod: 'razorpay' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'razorpay' ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}>
                                    {paymentMethod === 'razorpay' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 border border-blue-200">
                                            <span className="text-lg font-black text-blue-700">₹</span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-slate-900">Razorpay Express &amp; UPI</h4>
                                            <p className="text-[11px] text-slate-500">UPI, GPay, PhonePe, Paytm, Cards &amp; NetBanking</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded border border-blue-200">Instant UPI</span>
                                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded border border-blue-200">Indian Banks</span>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'razorpay' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                                        }`}>
                                            {paymentMethod === 'razorpay' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button type="button" onClick={() => this.previousStep()}
                                className="px-4 py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer">
                                <FaArrowLeft className="w-3 h-3" /><span>Back</span>
                            </button>
                            <button type="button" onClick={() => this.nextStep()} disabled={!paymentMethod}
                                className="flex-1 py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 6px 20px rgba(124,58,237,0.3)' }}>
                                <span>{paymentMethod === 'creditCard' ? 'Enter Card Details' : paymentMethod === 'paypal' ? 'Pay with PayPal' : 'Pay with Razorpay'}</span>
                                <FaArrowRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ──────── STEP 2: Card / PayPal / Razorpay Payment ──────── */}
                {step === 2 && (
                    <div className="emb-slide space-y-5">
                        {paymentMethod === 'creditCard' ? (
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/25">
                                        <FaLock className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">Secure Card Payment</h3>
                                        <p className="text-[11px] text-slate-500">256-bit SSL encrypted via Stripe · Card never stored</p>
                                    </div>
                                </div>

                                {/* Mini card visual */}
                                <div className="relative h-28 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
                                    <div className="absolute top-3 left-4 w-8 h-5 rounded-sm opacity-80" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}></div>
                                    <div className="absolute inset-0 flex items-end p-4">
                                        <div className="text-white">
                                            <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest mb-0.5">Card Holder</p>
                                            <p className="text-xs font-black tracking-wider">{this.state.CardHolder || 'YOUR NAME'}</p>
                                        </div>
                                        <div className="ml-auto text-right text-white">
                                            <p className="text-[9px] font-bold opacity-50 uppercase">Secured by Stripe</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Cardholder Name *</label>
                                    <input type="text" onChange={(e) => this.handleInput('CardHolder', e)} placeholder="Full name as on card" className="checkout-input-emb" />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5">Billing Address *</label>
                                    <input type="text" onChange={(e) => this.handleInput('Address', e)} placeholder="Street address" className="checkout-input-emb" />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                        <FaCreditCard className="w-2.5 h-2.5 text-indigo-500" /> Card Number, Expiry & CVC *
                                    </label>
                                    <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus-within:border-indigo-500 focus-within:bg-white transition-all">
                                        <CardElement options={{ style: { base: { fontSize: '14px', color: '#0f172a', fontFamily: '"Inter", sans-serif', '::placeholder': { color: '#94a3b8' }, iconColor: '#4f46e5' }, invalid: { color: '#e11d48', iconColor: '#e11d48' } } }} />
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                                    <FaShieldAlt className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                    <p className="text-xs text-emerald-800 font-medium">PCI-DSS Level 1 · Card tokenized by Stripe · Never stored on our servers</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => this.previousStep()}
                                        className="px-4 py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl flex items-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer">
                                        <FaArrowLeft className="w-3 h-3" /><span>Back</span>
                                    </button>
                                    <button type="button" onClick={() => this.handleSubmit()} disabled={isLoading}
                                        className="flex-1 py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:scale-100 cursor-pointer"
                                        style={{ background: 'linear-gradient(135deg, #059669, #0d9488)', boxShadow: '0 6px 20px rgba(5,150,105,0.3)' }}>
                                        {isLoading ? (
                                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Processing...</span></>
                                        ) : (
                                            <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} Securely</span></>
                                        )}
                                    </button>
                                </div>
                                <p className="text-center text-[10px] text-slate-400 flex items-center justify-center gap-1">
                                    <FaShieldAlt className="w-2.5 h-2.5" /> 30-Day Money-Back Guarantee · Cancel anytime
                                </p>
                            </>
                        ) : paymentMethod === 'paypal' ? (
                            /* PayPal embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl flex items-center justify-center shadow-md">
                                        <img src={PayPalLogo} alt="PayPal" className="h-4 brightness-0" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">PayPal Express</h3>
                                        <p className="text-[11px] text-slate-500">Complete your transaction securely via PayPal</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-amber-200" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-amber-200/60">
                                        <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain" />
                                        <span className="text-sm font-black text-amber-900">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <PayPalButtonWrapper amount={price} currency={this.props.currencyCode || 'USD'} selectedPlan={this.props.selectedPlan} onSuccess={this.handlePayPalSuccess} onError={this.handlePayPalError} />
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        ) : (
                            /* Razorpay embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                                        <span className="text-lg font-black text-white">₹</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900">Razorpay Express &amp; UPI</h3>
                                        <p className="text-[11px] text-slate-500">Pay via GPay, PhonePe, Paytm, Cards or NetBanking</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-blue-200" style={{ background: 'linear-gradient(135deg, #eff6ff, #e0e7ff)' }}>
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-blue-200/60">
                                        <span className="text-xs font-black text-blue-900">Razorpay Secure Gateway</span>
                                        <span className="text-sm font-black text-blue-950">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs text-blue-800 font-semibold mb-3">Instant auto-activation via UPI, GPay, PhonePe, Paytm or NetBanking</p>
                                        <button
                                            type="button"
                                            onClick={() => this.handleRazorpayPayment()}
                                            disabled={isLoading}
                                            className="w-full py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                                            style={{ background: 'linear-gradient(135deg, #2563eb, #4f46e5)', boxShadow: '0 6px 20px rgba(37,99,235,0.3)' }}>
                                            {isLoading ? (
                                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Launching Razorpay...</span></>
                                            ) : (
                                                <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} via Razorpay</span></>
                                            )}
                                        </button>
                                        <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                                            <span className="font-extrabold text-amber-950">💡 Sandbox Test Mode Tip:</span> In Test Mode, use test UPI ID <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold text-amber-900">success@razorpay</code> or select Test NetBanking/Wallet inside the Razorpay modal. Switch Admin Settings to <strong>Live Production Mode</strong> to accept real GPay/PhonePe UPI payments.
                                        </div>
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* ──────── STEP 3: Success ──────── */}
                {step === 3 && (
                    <div className="text-center space-y-6 py-4">
                        <div className="relative w-28 h-28 mx-auto emb-success">
                            <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)' }}></div>
                            <>{View}</>
                            {[
                                { top: '5%', left: '0%', w: 8, bg: '#4f46e5', delay: '0s', dur: '1.8s' },
                                { top: '15%', right: '0%', w: 7, bg: '#f59e0b', delay: '0.3s', dur: '2s' },
                                { bottom: '5%', left: '5%', w: 6, bg: '#ec4899', delay: '0.6s', dur: '1.6s' },
                                { bottom: '15%', right: '5%', w: 8, bg: '#10b981', delay: '0.2s', dur: '2.2s' },
                            ].map((c, i) => (
                                <div key={i} className="emb-confetti-piece" style={{
                                    top: c.top, left: c.left, right: c.right, bottom: c.bottom,
                                    width: c.w, height: c.w, background: c.bg,
                                    animationDuration: c.dur, animationDelay: c.delay,
                                }} />
                            ))}
                        </div>

                        <div className="space-y-3">
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <FaCheckCircle className="w-3.5 h-3.5" /> 🎉 Payment Verified & Completed
                            </span>
                            <h2 className="text-2xl font-black text-slate-900">Welcome to PRO Candidate Tier!</h2>
                            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                                Your subscription is now <strong className="text-slate-700">instantly active</strong>. All AI tools, unlimited exports, and VIP support are fully unlocked.
                            </p>
                        </div>

                        <div className="rounded-2xl overflow-hidden border border-slate-100" style={{ background: 'linear-gradient(135deg, #0f0c29, #1e1b4b)' }}>
                            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                                <span className="text-xs font-black text-amber-400 uppercase flex items-center gap-1.5"><FaGem className="w-3 h-3" /> Unlocked Benefits</span>
                                <span className="text-xs font-black text-emerald-400">✓ Active</span>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {[
                                    { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters' },
                                    { icon: FaDownload, text: 'PDF, Word DocX & Portfolio Links' },
                                    { icon: FaRocket, text: 'ATS Smart Keyword Optimization' },
                                    { icon: FaHeadset, text: '24/7 Priority VIP Support' },
                                ].map(({ icon: Icon, text }, i) => (
                                    <div key={i} className="flex items-center gap-2.5 text-xs text-slate-200">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                                            <Icon className="w-2.5 h-2.5 text-indigo-300" />
                                        </div>
                                        <span className="font-semibold">{text}</span>
                                        <FaCheck className="w-3 h-3 text-emerald-400 ml-auto shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button type="button" onClick={() => { window.location.href = '/dashboard'; }}
                                className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 8px 28px rgba(79,70,229,0.35)' }}>
                                <FaRocket className="w-3.5 h-3.5" /><span>Go to AI Resume Builder</span>
                            </button>
                            <button type="button" onClick={() => { window.location.href = '/dashboard/plans?tab=invoices'; }}
                                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-slate-700 font-bold text-xs border-2 border-slate-200 hover:border-slate-300 flex items-center justify-center gap-2 transition-all hover:bg-slate-50 cursor-pointer">
                                <FaFileAlt className="w-3.5 h-3.5 text-slate-500" /><span>View Invoice & Receipt</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Checkout);
export default MyComponent;
