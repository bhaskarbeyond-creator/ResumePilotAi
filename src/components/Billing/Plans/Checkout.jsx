import React, { Component } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import { CardElement } from '@stripe/react-stripe-js';
import CheckImage from '../../../assets/check.png';
import { FaLock, FaShieldAlt, FaCheckCircle, FaArrowRight, FaArrowLeft, FaCreditCard, FaPaypal, FaGlobe, FaCertificate, FaCrown, FaCheck, FaStar } from 'react-icons/fa';
// Payment method logos
import VisaLogo from '../../../assets/payment/Visa_Inc._logo.svg';
import MastercardLogo from '../../../assets/payment/Mastercard-logo.svg';
import AmexLogo from '../../../assets/payment/American_Express_logo_(2018).svg';
import PayPalLogo from '../../../assets/payment/PayPal_logo.svg';
import JCBLogo from '../../../assets/payment/JCB_logo.svg';
import DropdownInput from '../../Form/dropdown-input/DropdownInput';
import SimpleInput from '../../Form/simple-input/SimpleInput';
import axios from 'axios';
import { addSbs } from '../../../firestore/dbOperations';
import SuccessAnimation from '../../../assets/animations/50049-nfc-successful.json';
import { withTranslation } from 'react-i18next';
import Lottie from 'lottie-react';
import { useLottie } from 'lottie-react';
import { AuthContext } from '../../../main';
import { trackSubscription, trackEvent, trackEngagement } from '../../../utils/ga4';

const View = () => {
    const options = {
        loop: false,
        autoplay: true,
        animationData: SuccessAnimation,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
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
            purchase_units: [
                {
                    amount: {
                        value: amount.toString(),
                        currency_code: finalCurrency,
                    },
                    description: `${selectedPlan} subscription plan`,
                },
            ],
            intent: 'CAPTURE',
        });
    };

    const onApprove = (data, actions) => {
        return actions.order.capture().then((details) => {
            onSuccess(details);
        });
    };

    const onErrorHandler = (err) => {
        onError(err);
    };

    const onCancel = (data) => {};

    if (isPending) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2.5 text-xs font-bold text-slate-600">Initializing PayPal Secure Gateway...</span>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="flex items-center justify-center py-6">
                <div className="text-rose-600 text-center text-xs space-y-2">
                    <p className="font-bold">Failed to load PayPal. Please check your network connection.</p>
                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700">
                        Retry Gateway
                    </button>
                </div>
            </div>
        );
    }

    if (isResolved) {
        return (
            <PayPalButtons
                style={{
                    shape: 'rect',
                    layout: 'vertical',
                    color: 'gold',
                    label: 'paypal',
                    height: 42,
                }}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={onErrorHandler}
                onCancel={onCancel}
            />
        );
    }

    return null;
};

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
            isPaying: false,
            isLoading: false,
            showMobileSummary: false
        };

        this.handleInput = this.handleInput.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handlePayPalSuccess = this.handlePayPalSuccess.bind(this);
        this.handlePayPalError = this.handlePayPalError.bind(this);
    }

    handleInput(name, event) {
        this.setState({
            [name]: event.target.value,
        });
    }

    async handleSubmit() {
        const { stripe, elements } = this.props;

        if (!stripe || !elements) {
            return;
        }

        this.setState({ isLoading: true });

        try {
            const cardElement = elements.getElement(CardElement);
            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
                billing_details: {
                    name: this.state.CardHolder || 'Candidate Subscriber',
                    address: {
                        line1: this.state.Address || 'Billing Address',
                        postal_code: this.state['Postal Code'] || '000000',
                        country: 'US',
                    },
                },
            });

            if (error) {
                console.error('Stripe Payment Error:', error);
                alert(error.message);
                this.setState({ isLoading: false });
                return;
            }

            const price =
                this.props.selectedPlan == 'monthly'
                    ? this.props.monthly
                    : this.props.selectedPlan == 'halfYear'
                    ? this.props.quartarly
                    : this.props.selectedPlan == 'yearly'
                    ? this.props.yearly
                    : 0;

            const currentUser = this.context?.currentUser;
            const uid = currentUser ? currentUser.uid : null;

            trackSubscription(this.props.selectedPlan, price);
            trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, price);
            trackEngagement('purchase_completed', {
                plan_type: this.props.selectedPlan,
                payment_method: 'Stripe',
                amount: price,
                user_id: uid,
            });

            await addSbs(this.props.selectedPlan, 'Stripe', new Date().toDateString(), price, uid);
            this.setState({ step: 3, isLoading: false });
        } catch (err) {
            console.error('Unexpected Submit Error:', err);
            alert('An unexpected error occurred. Please try again.');
            this.setState({ isLoading: false });
        }
    }

    handlePayPalSuccess = async (details) => {
        const currentUser = this.context?.currentUser;
        if (!currentUser) {
            alert('User authentication error. Please refresh and try again.');
            return;
        }
        const uid = currentUser.uid;
        const price =
            this.props.selectedPlan == 'monthly'
                ? this.props.monthly
                : this.props.selectedPlan == 'halfYear'
                ? this.props.quartarly
                : this.props.selectedPlan == 'yearly'
                ? this.props.yearly
                : 0;

        trackSubscription(this.props.selectedPlan, price);
        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, price);
        trackEngagement('purchase_completed', {
            plan_type: this.props.selectedPlan,
            payment_method: 'PayPal',
            amount: price,
            user_id: uid,
        });

        await addSbs(this.props.selectedPlan, 'PayPal', new Date().toDateString(), price, uid);
        this.setState({ step: 3 });
    };

    handlePayPalError = (error) => {
        console.error('PayPal payment failed:', error);
        alert(this.props.t('billing.error.paypal', 'PayPal payment failed. Please try again.'));
    };

    nextStep() {
        this.setState((prevStat) => ({
            step: prevStat.step + 1,
        }));
    }

    previousStep() {
        this.setState((prevStat) => ({
            step: prevStat.step - 1,
        }));
    }

    renderSecurityBadges() {
        const { t } = this.props;
        return (
            <div className="py-4 border-t border-slate-100 space-y-4">
                <div className="text-center">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2.5">
                        {t('checkout.paymentMethods', 'We Accept All Major Payment Options')}
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <img src={VisaLogo} alt="Visa" className="h-5 opacity-90 hover:opacity-100 transition-opacity" />
                        <img src={MastercardLogo} alt="Mastercard" className="h-5 opacity-90 hover:opacity-100 transition-opacity" />
                        <img src={AmexLogo} alt="American Express" className="h-5 opacity-90 hover:opacity-100 transition-opacity" />
                        <img src={PayPalLogo} alt="PayPal" className="h-5 opacity-90 hover:opacity-100 transition-opacity" />
                        <img src={JCBLogo} alt="JCB" className="h-5 opacity-90 hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-semibold text-center">
                    <div className="flex items-center justify-center gap-1">
                        <FaShieldAlt className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>SSL Encrypted</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                        <FaLock className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span>256-Bit TLS</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                        <FaCertificate className="w-3 h-3 text-purple-600 shrink-0" />
                        <span>PCI-DSS Valid</span>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        const { t } = this.props;
        const isEmbeddedInDashboard = window.location.pathname.includes('/dashboard');

        const price =
            this.props.selectedPlan == 'monthly'
                ? this.props.monthly
                : this.props.selectedPlan == 'halfYear'
                ? this.props.quartarly
                : this.props.yearly;

        const planTitle =
            this.props.selectedPlan === 'monthly'
                ? 'Pro Monthly Tier'
                : this.props.selectedPlan === 'halfYear'
                ? 'Pro 6-Month Pass (Save 35%)'
                : 'Pro Annual Accelerator (Save 50%)';

        const stepTitles = [
            t('checkout.steps.billingInfo', '1. Billing Info'),
            t('checkout.steps.paymentMethod', '2. Payment Method'),
            t('checkout.steps.cardDetails', '3. Card Details'),
            t('checkout.steps.confirmation', '4. Activation'),
        ];

        return (
            <div className="w-full bg-slate-50/60 py-4 sm:py-8 px-2 sm:px-6 font-sans">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* Security Hero Header */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs uppercase tracking-wider">
                            <FaLock className="w-3 h-3 text-indigo-600" />
                            <span>256-Bit SSL Encrypted Enterprise Checkout</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                            {t('checkout.title', 'Complete Your Purchase')}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
                            {t('checkout.secureCheckout', 'Instant VIP access to all 51+ ATS resume templates, AI generators & downloads.')}
                        </p>
                    </div>

                    {/* Progress Bar - Responsive Stepper */}
                    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                        {/* Mobile Stepper Counter (<640px) */}
                        <div className="block sm:hidden text-center space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span>Step {this.state.step + 1} of 4</span>
                                <span className="text-indigo-600">{stepTitles[this.state.step]}</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                                    style={{ width: `${((this.state.step + 1) / 4) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Desktop Stepper (sm & up) */}
                        <div className="hidden sm:flex items-center justify-between max-w-2xl mx-auto">
                            {stepTitles.map((title, index) => (
                                <div key={index} className="flex items-center flex-1 last:flex-none">
                                    <div className="flex flex-col items-center mx-auto">
                                        <div
                                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-300 ${
                                                this.state.step >= index
                                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                                                    : this.state.step === index - 1
                                                    ? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-600'
                                                    : 'bg-slate-100 text-slate-400'
                                            }`}>
                                            {this.state.step > index ? (
                                                <FaCheck className="w-3.5 h-3.5" />
                                            ) : (
                                                index + 1
                                            )}
                                        </div>
                                        <span className={`mt-1.5 text-[11px] font-bold transition-colors duration-300 ${
                                            this.state.step >= index ? 'text-indigo-700' : 'text-slate-400'
                                        }`}>
                                            {title}
                                        </span>
                                    </div>
                                    {index < stepTitles.length - 1 && (
                                        <div className={`h-0.5 flex-1 mx-2 transition-all duration-300 ${
                                            this.state.step > index ? 'bg-indigo-600' : 'bg-slate-200'
                                        }`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Main Layout Grid (Responsive: 1-col on mobile, 5-col on desktop) */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                        {/* Order Summary - Sticky Sidebar */}
                        <div className="lg:col-span-2 order-2 lg:order-1">
                            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-5 lg:sticky lg:top-6">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <FaCrown className="text-amber-500 w-4 h-4" />
                                        <span>{t('checkout.orderSummary.title', 'Order Summary')}</span>
                                    </h2>
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold rounded-md border border-emerald-200">
                                        VIP Member
                                    </span>
                                </div>

                                <div className="space-y-3 text-xs">
                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">{t('checkout.orderSummary.plan', 'Selected Tier')}</span>
                                        <span className="font-extrabold text-slate-900">{planTitle}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">{t('checkout.orderSummary.billingCycle', 'Billing Term')}</span>
                                        <span className="font-semibold text-slate-800">
                                            {this.props.selectedPlan === 'monthly'
                                                ? 'Monthly Access'
                                                : this.props.selectedPlan === 'halfYear'
                                                ? '6 Months'
                                                : '12 Months (+3 Mo Free)'}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">{t('checkout.orderSummary.subtotal', 'Base Subscription')}</span>
                                        <span className="font-semibold text-slate-900">
                                            {this.props.currency}{price}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center py-1">
                                        <span className="text-slate-600">Sales Tax / GST</span>
                                        <span className="text-emerald-700 font-bold">Included ($0.00)</span>
                                    </div>

                                    <hr className="border-slate-100 my-2" />

                                    <div className="flex justify-between items-center pt-1 text-sm">
                                        <span className="font-extrabold text-slate-900">Total Due Today:</span>
                                        <span className="text-xl font-black text-indigo-700">
                                            {this.props.currency}{price}
                                        </span>
                                    </div>
                                </div>

                                {/* Security Badges & Guarantees */}
                                <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                                    <div className="flex items-center gap-2.5">
                                        <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                        <span>30-Day Risk-Free Money Back Guarantee</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <FaShieldAlt className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                        <span>Instant Auto-Renewal Control &amp; 1-Click Cancel</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <FaStar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        <span>24/7 Priority Support &amp; AI Writing Assistant</span>
                                    </div>
                                </div>

                                {this.renderSecurityBadges()}
                            </div>
                        </div>

                        {/* Main Checkout Form Container */}
                        <div className="lg:col-span-3 order-1 lg:order-2">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7">

                                {/* Step 0: Billing Information */}
                                {this.state.step === 0 && (
                                    <div className="space-y-6">
                                        <div className="border-b border-slate-100 pb-3">
                                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <FaGlobe className="text-indigo-600" />
                                                <span>{t('checkout.billingForm.title', 'Step 1: Billing & Region Info')}</span>
                                            </h2>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {t('checkout.billingForm.description', 'Please confirm your country/region for localized billing and tax receipts.')}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                                    {t('checkout.billingForm.countryLabel', 'Country / Region *')}
                                                </label>
                                                <DropdownInput
                                                    handleInputs={this.handleInput}
                                                    placeholder={t('checkout.billingForm.countryPlaceholder', 'Select your country')}
                                                    checkout={true}
                                                    title="Country"
                                                    options={this.countries}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                                    {t('checkout.billingForm.postalLabel', 'Postal / Zip Code *')}
                                                </label>
                                                <SimpleInput handleInputs={this.handleInput} title="Postal Code" checkout={true} />
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100">
                                            <button
                                                type="button"
                                                onClick={() => this.nextStep()}
                                                className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer">
                                                <span>{t('checkout.billingForm.continueButton', 'Continue to Payment Method')}</span>
                                                <FaArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Step 1: Payment Method Selection */}
                                {this.state.step === 1 && (
                                    <div className="space-y-6">
                                        <div className="border-b border-slate-100 pb-3">
                                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                <FaCreditCard className="text-indigo-600" />
                                                <span>{t('checkout.paymentMethod.title', 'Step 2: Choose Payment Gateway')}</span>
                                            </h2>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {t('checkout.paymentMethod.description', 'Select your preferred secure payment method below.')}
                                            </p>
                                        </div>

                                        {/* Demo Sandbox Alert */}
                                        {this.props.sandboxMode && (
                                            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                                                <div className="flex items-center space-x-2.5">
                                                    <span className="text-base">⚡</span>
                                                    <div>
                                                        <p className="text-xs font-extrabold text-amber-900 uppercase">Sandbox Test Mode Active</p>
                                                        <p className="text-[11px] text-amber-700">Simulating payment checkout flow. No actual bank charges processed.</p>
                                                    </div>
                                                </div>
                                                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black rounded uppercase">DEMO</span>
                                            </div>
                                        )}

                                        <div className="space-y-3.5">
                                            {/* Stripe Card Option */}
                                            {(this.props.stripeEnabled !== false && !this.props.onlyPP) && (
                                                <div
                                                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                                        this.state.paymentMethod === 'creditCard'
                                                            ? 'bg-indigo-50/50 border-indigo-600 shadow-sm ring-1 ring-indigo-500/20'
                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                    }`}
                                                    onClick={() => this.setState({ paymentMethod: 'creditCard' })}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center shrink-0">
                                                            <FaCreditCard className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                                                                {t('checkout.paymentMethod.cardTitle', 'Credit / Debit Card (Stripe)')}
                                                            </h3>
                                                            <p className="text-[11px] text-slate-500">Visa, Mastercard, American Express, Discover</p>
                                                        </div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                                        this.state.paymentMethod === 'creditCard' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                                                    }`}>
                                                        {this.state.paymentMethod === 'creditCard' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </div>
                                            )}

                                            {/* PayPal Option */}
                                            {this.props.paypalEnabled !== false && (
                                                <div
                                                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                                                        this.state.paymentMethod === 'paypal'
                                                            ? 'bg-indigo-50/50 border-indigo-600 shadow-sm ring-1 ring-indigo-500/20'
                                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                                    }`}
                                                    onClick={() => this.setState({ paymentMethod: 'paypal' })}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center shrink-0">
                                                            <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                                                                {t('checkout.paymentMethod.paypalTitle', 'PayPal Express')}
                                                            </h3>
                                                            <p className="text-[11px] text-slate-500">Fast 1-click checkout with PayPal Account</p>
                                                        </div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                                        this.state.paymentMethod === 'paypal' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                                                    }`}>
                                                        {this.state.paymentMethod === 'paypal' && <FaCheck className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => this.previousStep()}
                                                className="px-4 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer">
                                                <FaArrowLeft className="w-3 h-3" />
                                                <span>{t('checkout.navigation.back', 'Back')}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => this.nextStep()}
                                                disabled={!this.state.paymentMethod}
                                                className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer">
                                                <span>
                                                    {this.state.paymentMethod === 'creditCard'
                                                        ? t('checkout.paymentMethod.continueToCard', 'Continue to Card Details')
                                                        : t('checkout.paymentMethod.continueWithPaypal', 'Continue with PayPal')}
                                                </span>
                                                <FaArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Step 2: Payment Details (Stripe Card Form or PayPal Button) */}
                                {this.state.step === 2 && (
                                    <div className="space-y-6">
                                        {this.state.paymentMethod === 'creditCard' ? (
                                            <>
                                                <div className="border-b border-slate-100 pb-3">
                                                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                        <FaLock className="text-indigo-600" />
                                                        <span>{t('checkout.cardForm.title', 'Step 3: Secure Card Payment')}</span>
                                                    </h2>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {t('checkout.cardForm.description', 'Your card details are end-to-end encrypted with Stripe.')}
                                                    </p>
                                                </div>

                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                                            {t('checkout.cardForm.cardholderLabel', 'Cardholder Name *')}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            onChange={(event) => this.handleInput('CardHolder', event)}
                                                            placeholder={t('checkout.cardForm.cardholderPlaceholder', 'Full Name as displayed on card')}
                                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-indigo-600 outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                                            {t('checkout.cardForm.addressLabel', 'Billing Address *')}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            onChange={(event) => this.handleInput('Address', event)}
                                                            placeholder={t('checkout.cardForm.addressPlaceholder', 'Street address, apartment, or suite')}
                                                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-indigo-600 outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                                            {t('checkout.cardForm.cardDetailsLabel', 'Card Details (Number, Expiry & CVC) *')}
                                                        </label>
                                                        <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-xl focus-within:border-indigo-600 focus-within:ring-1 focus-within:ring-indigo-600 transition-all">
                                                            <CardElement
                                                                options={{
                                                                    style: {
                                                                        base: {
                                                                            fontSize: '14px',
                                                                            color: '#0f172a',
                                                                            fontFamily: '"Inter", -apple-system, sans-serif',
                                                                            '::placeholder': { color: '#94a3b8' },
                                                                            iconColor: '#4f46e5',
                                                                        },
                                                                        invalid: {
                                                                            color: '#e11d48',
                                                                            iconColor: '#e11d48',
                                                                        },
                                                                    },
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center gap-2.5">
                                                    <FaShieldAlt className="w-4 h-4 text-indigo-600 shrink-0" />
                                                    <span>We use 256-bit SSL encryption. Card numbers are never stored on our servers.</span>
                                                </div>

                                                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => this.previousStep()}
                                                        className="px-4 py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer">
                                                        <FaArrowLeft className="w-3 h-3" />
                                                        <span>{t('checkout.navigation.backToPayment', 'Back')}</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => this.handleSubmit()}
                                                        disabled={this.state.isLoading}
                                                        className="flex-1 py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer">
                                                        {this.state.isLoading ? (
                                                            <>
                                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                                <span>Processing Secure Charge...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <FaLock className="w-3.5 h-3.5 text-white" />
                                                                <span>Complete Secure Payment ({this.props.currency}{price})</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            /* PayPal Gateway Box */
                                            <>
                                                <div className="border-b border-slate-100 pb-3">
                                                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                        <FaPaypal className="text-amber-500" />
                                                        <span>{t('checkout.paypal.title', 'Step 3: PayPal Express Payment')}</span>
                                                    </h2>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {t('checkout.paypal.description', 'Complete your transaction securely via PayPal.')}
                                                    </p>
                                                </div>

                                                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <img src={PayPalLogo} alt="PayPal" className="h-6 object-contain" />
                                                        <span className="text-xs font-extrabold text-amber-900 uppercase">Total: {this.props.currency}{price}</span>
                                                    </div>

                                                    <PayPalButtonWrapper
                                                        amount={price}
                                                        currency={this.props.currencyCode || 'USD'}
                                                        selectedPlan={this.props.selectedPlan}
                                                        onSuccess={this.handlePayPalSuccess}
                                                        onError={this.handlePayPalError}
                                                    />
                                                </div>

                                                <div className="pt-4 border-t border-slate-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => this.previousStep()}
                                                        className="w-full py-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                                                        <FaArrowLeft className="w-3 h-3" />
                                                        <span>Back to Payment Method</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Step 3: Success Confirmation View */}
                                {this.state.step === 3 && (
                                    <div className="text-center space-y-6 py-6">
                                        <div className="w-20 h-20 mx-auto">
                                            <>{View}</>
                                        </div>

                                        <div className="space-y-2">
                                            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold rounded-full uppercase border border-emerald-300">
                                                🎉 Transaction Completed
                                            </span>
                                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                                {t('checkout.success.title', 'Subscription Successfully Activated!')}
                                            </h2>
                                            <p className="text-xs text-slate-600 max-w-md mx-auto">
                                                {t('checkout.success.emailConfirmation', 'Thank you for upgrading to VIP Pro! Your account now has full access to all AI resume templates & features.')}
                                            </p>
                                        </div>

                                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-center gap-2">
                                            <FaCheckCircle className="w-4 h-4 text-emerald-600" />
                                            <span>Full VIP Access Unlocked Immediately</span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                window.location.href = isEmbeddedInDashboard ? '/dashboard' : '/dashboard/plans';
                                            }}
                                            className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-600/20 inline-flex items-center gap-2 cursor-pointer">
                                            <span>Continue to Candidate Dashboard</span>
                                            <FaArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}

                            </div>
                        </div>

                    </div>
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(Checkout);
export default MyComponent;
