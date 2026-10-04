import React, { Component } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import { CardElement } from '@stripe/react-stripe-js';
import { FaLock, FaShieldAlt, FaCheckCircle, FaArrowRight, FaArrowLeft, FaCreditCard, FaPaypal, FaGlobe, FaCertificate, FaCrown, FaCheck, FaStar, FaBolt, FaRocket, FaGem, FaInfinity, FaHeadset, FaDownload, FaFileAlt, FaMagic, FaChevronRight, FaMapMarkerAlt, FaEnvelope } from 'react-icons/fa';
// Payment method logos
import VisaLogo from '../../../assets/payment/Visa_Inc._logo.svg';
import MastercardLogo from '../../../assets/payment/Mastercard-logo.svg';
import AmexLogo from '../../../assets/payment/American_Express_logo_(2018).svg';
import PayPalLogo from '../../../assets/payment/PayPal_logo.svg';
import JCBLogo from '../../../assets/payment/JCB_logo.svg';
import DropdownInput from '../../Form/dropdown-input/DropdownInput';
import axios from 'axios';
import SuccessAnimation from '../../../assets/animations/50049-nfc-successful.json';
import { withTranslation } from 'react-i18next';
import { useLottie } from 'lottie-react';
import fire from '../../../conf/fire';
import { AuthContext } from '../../../context/AuthContext';
import { trackSubscription, trackEvent, trackEngagement } from '../../../utils/ga4';
import { calculateGSTBreakdown, getStateCodeByName } from '../../../utils/gstUtils';
import { formatCurrencyAmount } from '../../../utils/currencyFormat';
import {
    resolveCubaToken,
    CUBA_PRIMARY_FALLBACK,
    CUBA_INK_FALLBACK,
    CUBA_INK_SUBTLE_FALLBACK,
    CUBA_DANGER_FALLBACK,
} from '../../../utils/cubaToken';

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
const PayPalButtonWrapper = ({ _amount, _currency, onSuccess, onError, selectedPlan, couponCode, billingDetails }) => {
    const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();
    const paymentOrderIdRef = React.useRef(null);

    const createOrder = async () => {
        const apiBase = '';
        const response = await axios.post(`${apiBase}/api/paypal/create-order`, {
            planId: selectedPlan,
            couponCode,
            billingDetails,
        });
        paymentOrderIdRef.current = response.data.paymentOrderId;
        return response.data.orderId;
    };

    const onApprove = (data, actions) => actions.order.capture().then((details) => onSuccess({ ...details, paymentOrderId: paymentOrderIdRef.current }));
    const onErrorHandler = (err) => onError(err);
    const onCancel = (_data) => {};

    if (isPending) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-4 border-cuba-warning-soft animate-ping opacity-50"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-cuba-warning border-t-transparent animate-spin"></div>
                </div>
                <span className="text-xs font-bold text-cuba-ink-muted">Initializing PayPal Secure Gateway...</span>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="flex items-center justify-center py-6">
                <div className="text-cuba-danger text-center text-xs space-y-3">
                    <p className="font-bold">Failed to load PayPal. Please check your network connection.</p>
                    <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-cuba-primary-fill text-cuba-on-primary font-bold rounded-xl text-xs hover:bg-cuba-primary-strong transition-all">
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
        this.indianStates = [
            'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
            'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
            'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
            'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
            'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
            'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
        ];
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
            BillingName: '',
            CardHolder: '',
            Address: '',
            City: '',
            State: '',
            customerTaxId: '',
            isPaying: false,
            isLoading: false,
            serverPaymentStatus: 'IDLE',
            invoiceStatus: 'NOT_REQUESTED',
            invoiceError: '',
            showMobileSummary: false,
            animating: false,
            // Form validation
            validationErrors: {},
            // In-app toast notification (replaces alert())
            toast: { show: false, type: 'error', message: '' },
            // Stripe idempotency key — generated once per checkout attempt
            idempotencyKey: `ck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            taxConfig: (props.taxConfig && typeof props.taxConfig === 'object')
                ? {
                    enableTax: false,
                    taxName: 'GST',
                    taxRate: 0,
                    taxInclusive: false,
                    companyTaxId: '',
                    requireCustomerTaxId: false,
                    ...props.taxConfig
                }
                : {
                    enableTax: false,
                    taxName: 'GST',
                    taxRate: 0,
                    taxInclusive: false,
                    companyTaxId: '',
                    requireCustomerTaxId: false
                }
        };

        this.handleInput = this.handleInput.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handlePayPalSuccess = this.handlePayPalSuccess.bind(this);
        this.handlePayPalError = this.handlePayPalError.bind(this);
        this._toastTimer = null;
    }

    componentDidMount() {
        this.syncPaymentMethod();
        const currentUser = this.getCurrentUser();
        if (currentUser?.displayName) this.setState({ BillingName: currentUser.displayName });
        // PhonePe callback handler — restore pending order after redirect
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('phonepe_callback') === '1') {
                const raw = sessionStorage.getItem('phonepe_pending');
                if (raw) {
                    const pending = JSON.parse(raw);
                    sessionStorage.removeItem('phonepe_pending');
                    // Clean URL params without reload
                    const cleanUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, '', cleanUrl);
                    const apiBase = '';
                    axios.post(`${apiBase}/api/phonepe/status`, { orderId: pending.orderId })
                        .then(async (verification) => {
                            if (!verification.data?.verified || verification.data?.status !== 'ACTIVE') {
                                throw new Error('PhonePe payment was not activated by the server.');
                            }
                            this.recordIssuedInvoice(verification.data);
                            this.setState({ step: 3, serverPaymentStatus: 'ENTITLEMENT_ACTIVE' });
                            this.showToast('success', 'PhonePe payment verified; subscription and invoice were committed together.');
                        })
                        .catch((err) => this.showToast('error', 'PhonePe verification failed: ' + (err.response?.data?.error || err.message)));
                }
            }
        } catch (_e) { /* sessionStorage may be unavailable */ }
    }

    componentWillUnmount() {
        if (this._toastTimer) clearTimeout(this._toastTimer);
    }

    recordIssuedInvoice = (activation) => {
        if (activation?.invoiceStatus !== 'ISSUED' || !activation?.invoiceNumber) {
            throw new Error('Payment activation did not include its required immutable invoice.');
        }
        this.setState({ invoiceStatus: 'GENERATED', invoiceError: '' });
        try {
            window.dispatchEvent(new CustomEvent('userMembershipUpdated', { detail: { membership: 'Premium', activation } }));
        } catch (_e) {}
        if (typeof this.props.onPaymentSuccess === 'function') {
            this.props.onPaymentSuccess(activation);
        }
        return true;
    };

    componentDidUpdate(prevProps) {
        if (
            prevProps.stripeEnabled !== this.props.stripeEnabled ||
            prevProps.paypalEnabled !== this.props.paypalEnabled ||
            prevProps.onlyPP !== this.props.onlyPP ||
            prevProps.razorpayEnabled !== this.props.razorpayEnabled ||
            prevProps.paytmEnabled !== this.props.paytmEnabled ||
            prevProps.phonepeEnabled !== this.props.phonepeEnabled
        ) {
            this.syncPaymentMethod();
        }
        if (prevProps.taxConfig !== this.props.taxConfig) {
            this.setState({
                taxConfig: (this.props.taxConfig && typeof this.props.taxConfig === 'object')
                    ? {
                        enableTax: false,
                        taxName: 'GST',
                        taxRate: 0,
                        taxInclusive: false,
                        companyTaxId: '',
                        requireCustomerTaxId: false,
                        ...this.props.taxConfig
                    }
                    : {
                        enableTax: false,
                        taxName: 'GST',
                        taxRate: 0,
                        taxInclusive: false,
                        companyTaxId: '',
                        requireCustomerTaxId: false
                    }
            });
        }
    }

    syncPaymentMethod() {
        const isStripeAllowed = this.props.stripeEnabled !== false && !this.props.onlyPP;
        const isPayPalAllowed = this.props.paypalEnabled !== false;
        const isRazorpayAllowed = this.props.razorpayEnabled !== false;
        const isPaytmAllowed = this.props.paytmEnabled === true;
        const isPhonePeAllowed = this.props.phonepeEnabled === true;

        // Build ordered priority list of allowed gateways
        const allowed = [];
        if (isStripeAllowed) allowed.push('creditCard');
        if (isPayPalAllowed) allowed.push('paypal');
        if (isRazorpayAllowed) allowed.push('razorpay');
        if (isPaytmAllowed) allowed.push('paytm');
        if (isPhonePeAllowed) allowed.push('phonepe');

        const currentMethod = this.state.paymentMethod;
        if (currentMethod && !allowed.includes(currentMethod)) {
            // Current selection is now disabled — fall back to first available
            this.setState({ paymentMethod: allowed[0] || '' });
        } else if (!currentMethod && allowed.length > 0) {
            // No selection yet — auto-select first available
            this.setState({ paymentMethod: allowed[0] });
        }
    }

    getTaxCalculations(basePrice) {
        const { taxConfig } = this.state;
        const amount = parseFloat(basePrice) || 0;

        // DIR-018 AC-4 DEFECT FIX.
        //
        // This guard used to read `!taxConfig.taxInclusive`, which meant a
        // STANDARD EXCLUSIVE-TAX plan (taxInclusive === false — the default for
        // Indian SaaS, where 18% GST is added on top of the sticker price)
        // short-circuited here and billed the customer at the tax-inclusive
        // base price. The `else` branch below that correctly computes
        // `basePrice + 18%` was therefore UNREACHABLE for every exclusive-tax
        // merchant: the platform silently under-collected GST on every INR
        // sale. `configurationUnavailable` was also set to true on a path that
        // had nothing to do with configuration being unavailable, which made the
        // zero total indistinguishable from a real backend outage.
        //
        // Tax is now only skipped when the merchant genuinely has it disabled.
        // An absent rate falls back to the statutory Indian GST default rather
        // than silently zeroing a live revenue line.
        if (!taxConfig || !taxConfig.enableTax) {
            return {
                subtotal: amount,
                taxAmount: 0,
                totalPrice: amount,
                taxName: '',
                taxRate: 0,
                companyTaxId: '',
                taxInclusive: false,
                configurationUnavailable: false,
                gstBreakdown: null,
            };
        }

        const configuredRate = parseFloat(taxConfig.taxRate);
        const rate = Number.isFinite(configuredRate) ? configuredRate : 18;
        const isInclusive = Boolean(taxConfig.taxInclusive);

        // INTRA-state supply splits into CGST+SGST; INTER-state supply is a
        // single IGST line. The split is derived from the customer state the
        // user actually entered above, so the invoice matches the supply.
        const supplierStateCode = getStateCodeByName(
            this.props.taxConfig?.supplierState || this.props.taxConfig?.supplierStateName
        ) || getStateCodeByName(taxConfig.supplierState || '') || '27';
        const customerStateCode = getStateCodeByName(this.state.State) || supplierStateCode;

        const breakdown = calculateGSTBreakdown({
            amount,
            gstRate: rate,
            supplierStateCode,
            customerStateCode,
            isTaxInclusive: isInclusive,
        });

        return {
            subtotal: breakdown.taxableAmount,
            taxAmount: breakdown.taxAmount,
            totalPrice: breakdown.grandTotal,
            taxName: taxConfig.taxName || 'GST',
            taxRate: breakdown.gstRate,
            companyTaxId: taxConfig.companyTaxId || '',
            taxInclusive: isInclusive,
            configurationUnavailable: false,
            // CGST/SGST/IGST split, surfaced so the order summary can render the
            // itemised breakdown the directive requires instead of one opaque
            // "GST (18%)" line.
            gstBreakdown: breakdown,
        };
    }

    handleInput(name, event) {
        const value = event.target ? event.target.value : event;
        this.setState((prev) => ({
            [name]: value,
            // Clear validation error for this field when user types
            validationErrors: { ...prev.validationErrors, [name]: '' },
        }));
    }

    renderInvoiceAddressFields(inputClass) {
        const fieldClass = (name) => `${inputClass} ${this.state.validationErrors[name] ? 'border-cuba-danger bg-cuba-danger-soft/30' : ''}`;
        const field = (name, label, placeholder, options = {}) => (
            <div>
                <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2" htmlFor={`checkout-${name}`}>{label} *</label>
                <input
                    id={`checkout-${name}`}
                    type="text"
                    value={this.state[name]}
                    onChange={(event) => this.handleInput(name, event)}
                    placeholder={placeholder}
                    className={fieldClass(name)}
                    aria-invalid={Boolean(this.state.validationErrors[name])}
                    aria-describedby={this.state.validationErrors[name] ? `checkout-${name}-error` : undefined}
                    autoComplete={options.autoComplete}
                    list={options.list}
                    maxLength={options.maxLength || 160}
                />
                {this.state.validationErrors[name] && (
                    <p id={`checkout-${name}-error`} className="text-xs font-bold text-cuba-danger mt-1.5">⚠️ {this.state.validationErrors[name]}</p>
                )}
            </div>
        );
        return (
            <>
                {field('BillingName', 'Legal billing name', 'Name to print on the invoice', { autoComplete: 'name' })}
                {field('Address', 'Billing street address', 'Building, street and locality', { autoComplete: 'street-address', maxLength: 500 })}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {field('City', 'City', 'Billing city', { autoComplete: 'address-level2' })}
                    {field('State', 'State / Union Territory', 'Select or enter state', { autoComplete: 'address-level1', list: 'invoice-indian-states' })}
                </div>
                <datalist id="invoice-indian-states">
                    {this.indianStates.map((stateName) => <option key={stateName} value={stateName} />)}
                </datalist>
            </>
        );
    }

    // ── In-app toast system (replaces all native alert() calls) ──────────────
    showToast(type, message) {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this.setState({ toast: { show: true, type, message } });
        this._toastTimer = setTimeout(() => this.dismissToast(), 6000);
    }

    dismissToast() {
        this.setState({ toast: { show: false, type: 'error', message: '' } });
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

        return null;
    }

    getBillingDetails() {
        return {
            customerName: this.state.BillingName.trim(),
            customerCompany: '',
            customerGstin: this.state.customerTaxId.trim().toUpperCase(),
            customerAddress: this.state.Address.trim(),
            customerCity: this.state.City.trim(),
            customerState: this.state.State.trim(),
            customerPincode: this.state['Postal Code'].trim(),
            customerCountry: this.state.Country.trim(),
        };
    }

    async awaitServerPaymentConfirmation(orderId) {
        const apiBase = '';
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const response = await axios.get(`${apiBase}/api/payment-orders/${encodeURIComponent(orderId)}`);
            if (response.data.status === 'ACTIVE') return response.data;
            if (['FAILED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK', 'EXPIRED'].includes(response.data.status)) {
                throw new Error('Payment was not confirmed by the server.');
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return null;
    }

    async handleSubmit() {
        const { stripe, elements } = this.props;
        if (!stripe || !elements) return;

        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) {
            this.showToast('error', 'Session expired. Please sign in and try again.');
            return;
        }

        this.setState({ isLoading: true });

        try {
            const cardElement = elements.getElement(CardElement);
            const { error, paymentMethod } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
                billing_details: {
                    name: this.state.BillingName.trim(),
                    address: {
                        line1: this.state.Address.trim(),
                        postal_code: this.state['Postal Code'].trim(),
                        country: this.props.currencyCode === 'INR' && this.state.Country.trim().toLowerCase() === 'india'
                            ? 'IN'
                            : undefined,
                    },
                },
            });

            if (error) {
                console.error('Stripe Payment Method Error:', error);
                this.showToast('error', error.message || 'Card validation failed. Please check your details.');
                this.setState({ isLoading: false });
                return;
            }

            const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
                : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
                : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;

            const taxCalc = this.getTaxCalculations(basePrice);
            const apiBase = '';

            // Step 1: Create Stripe Payment Intent on backend (with idempotency key)
            const payRes = await axios.post(`${apiBase}/api/pay`, {
                planId: this.props.selectedPlan,
                couponCode: this.props.couponCode || null,
                billingDetails: this.getBillingDetails(),
            }, {
                headers: { 'Idempotency-Key': this.state.idempotencyKey },
            });

            const clientSecret = payRes.data?.client_secret;
            const paymentOrderId = payRes.data?.orderId;
            if (!clientSecret || !paymentOrderId) {
                throw new Error('Failed to retrieve payment confirmation token from server.');
            }

            // Step 2: Confirm card payment with Stripe
            const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: paymentMethod.id,
            });

            if (confirmError) {
                console.error('Stripe Confirm Payment Error:', confirmError);
                this.showToast('error', confirmError.message || 'Payment confirmation failed. Please try again.');
                this.setState({ isLoading: false });
                return;
            }

            if (paymentIntent.status !== 'succeeded') {
                this.showToast('warning', `Payment not completed (Status: ${paymentIntent.status}). Please try again.`);
                this.setState({ isLoading: false });
                return;
            }

            // Browser confirmation is not an entitlement. Wait for the verified server webhook/order state.
            this.setState({ paymentOrderId, serverPaymentStatus: 'PENDING_SERVER_CONFIRMATION' });
            const confirmedOrder = await this.awaitServerPaymentConfirmation(paymentOrderId);
            if (!confirmedOrder) {
                this.showToast('info', 'Payment is pending secure server confirmation. Your dashboard will update automatically.');
                this.setState({ isLoading: false });
                return;
            }
            trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
            trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
            trackEngagement('purchase_confirmed', { plan_type: this.props.selectedPlan, payment_method: 'Stripe' });
            this.recordIssuedInvoice(confirmedOrder);
            this.setState({ step: 3, serverPaymentStatus: 'ENTITLEMENT_ACTIVE', isLoading: false });
        } catch (err) {
            console.error('Unexpected Submit Error:', err);
            this.showToast('error', err.response?.data?.error || err.message || 'An unexpected error occurred. Please try again.');
            this.setState({ isLoading: false });
        }
    }

    handlePayPalSuccess = async (details) => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { this.showToast('error', 'Session expired. Please refresh and try again.'); return; }
        const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
            : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
            : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;

        const taxCalc = this.getTaxCalculations(basePrice);

        // Verification and entitlement activation are server-authoritative.
        try {
            const apiBase = '';
            const verification = await axios.post(`${apiBase}/api/paypal/verify`, {
                orderId: details.id,
                paymentOrderId: details.paymentOrderId,
            });
            if (!verification.data?.verified || verification.data?.status !== 'ACTIVE') {
                throw new Error('PayPal payment was not activated by the server.');
            }
            this.recordIssuedInvoice(verification.data);
        } catch (verifyErr) {
            this.showToast('error', verifyErr.response?.data?.error || verifyErr.message || 'PayPal verification failed.');
            return;
        }

        trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
        trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'PayPal', amount: taxCalc.totalPrice });
        this.setState({ step: 3, serverPaymentStatus: 'ENTITLEMENT_ACTIVE' });
    };

    handlePayPalError = (error) => {
        console.error('PayPal payment failed:', error);
        this.showToast('error', 'PayPal payment failed or was cancelled. Please try again.');
    };

    handleRazorpayPayment = async () => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { this.showToast('error', 'Session expired. Please refresh and try again.'); return; }
        this.setState({ isLoading: true });

        try {
            const basePrice = this.props.selectedPlan == 'monthly' ? this.props.monthly
                : this.props.selectedPlan == 'halfYear' ? this.props.quartarly
                : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;
            const taxCalc = this.getTaxCalculations(basePrice);

            const apiBase = '';
            const orderRes = await axios.post(`${apiBase}/api/razorpay/create-order`, {
                planId: this.props.selectedPlan,
                couponCode: this.props.couponCode || null,
                billingDetails: this.getBillingDetails(),
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
                key: orderData.key,
                amount: orderData.amount,
                currency: orderData.currency || 'INR',
                name: conf.brand?.name || 'IME365',
                description: `${this.getPlanLabel()} Subscription`,
                order_id: orderData.id,
                handler: async (response) => {
                    try {
                        if (!response.razorpay_signature) throw new Error('Missing Razorpay payment signature');
                        const verification = await axios.post(`${apiBase}/api/razorpay/verify-payment`, {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            paymentOrderId: orderData.paymentOrderId,
                        });
                        if (!verification.data?.verified || verification.data?.status !== 'ACTIVE') {
                            throw new Error('Payment was not activated by the server.');
                        }
                        trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
                        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
                        trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'Razorpay', amount: taxCalc.totalPrice });
                        this.recordIssuedInvoice(verification.data);
                        this.setState({ step: 3, serverPaymentStatus: 'ENTITLEMENT_ACTIVE', isLoading: false });
                    } catch (err) {
                        console.error('Razorpay verification error:', err);
                        this.showToast('error', 'Payment verification failed: ' + (err.response?.data?.error || err.message));
                        this.setState({ isLoading: false });
                    }
                },
                prefill: {
                    name: this.state.CardHolder || currentUser.displayName || '',
                    email: currentUser.email || '',
                },
                // DIR-018 AC-1: the Razorpay modal renders in a cross-origin
                // iframe, so it cannot inherit `var(--cuba-*)`. Resolve the
                // brand token against the LIVE theme instead of a frozen hex,
                // which also keeps the modal on-brand when the user switches
                // to the Cuba dark theme.
                theme: { color: resolveCubaToken('--cuba-primary-fill', CUBA_PRIMARY_FALLBACK) },
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
            this.showToast('error', err.response?.data?.error || err.message || 'Failed to initialize Razorpay. Please retry.');
            this.setState({ isLoading: false });
        }
    };

    handlePaytmPayment = async () => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { this.showToast('error', 'Session expired. Please refresh and try again.'); return; }
        this.setState({ isLoading: true });

        try {
            const basePrice = this.props.selectedPlan === 'monthly' ? this.props.monthly
                : this.props.selectedPlan === 'halfYear' ? this.props.quartarly
                : this.props.yearly;
            const taxCalc = this.getTaxCalculations(basePrice);
            const apiBase = '';
            const txnRes = await axios.post(`${apiBase}/api/paytm/initiate-transaction`, {
                planId: this.props.selectedPlan,
                couponCode: this.props.couponCode || null,
                billingDetails: this.getBillingDetails(),
            });

            const txnData = txnRes.data;

            if (!txnData.success || !txnData.txnToken) {
                throw new Error(txnData.error || 'Paytm transaction initiation failed');
            }

            // Load Paytm Checkout SDK dynamically
            const paytmEnv = txnData.isLive ? 'securegw.paytm.in' : 'securegw-stage.paytm.in';
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = `https://${paytmEnv}/merchantpgpui/checkoutjs/merchants/${txnData.mid}.js`;
                s.crossOrigin = 'anonymous';
                s.onload = resolve;
                s.onerror = () => reject(new Error('Failed to load Paytm checkout SDK'));
                document.body.appendChild(s);
            });

            const config = {
                root: '',
                flow: 'DEFAULT',
                data: {
                    orderId: txnData.orderId,
                    token: txnData.txnToken,
                    tokenType: 'TXN_TOKEN',
                    amount: txnData.amount,
                },
                handler: {
                    notifyMerchant: (eventName, _data) => {
                        if (eventName === 'SESSION_EXPIRED') {
                            this.showToast('warning', 'Paytm session expired. Please go back and try again.');
                            this.setState({ isLoading: false });
                        }
                    },
                    transactionStatus: async (_data) => {
                        try {
                            const verification = await axios.post(`${apiBase}/api/paytm/verify-transaction`, {
                                orderId: txnData.orderId,
                            });
                            if (!verification.data?.verified || verification.data?.status !== 'ACTIVE') {
                                throw new Error('Paytm payment was not activated by the server.');
                            }
                            trackSubscription(this.props.selectedPlan, taxCalc.totalPrice);
                            trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, taxCalc.totalPrice);
                            trackEngagement('purchase_completed', { plan_type: this.props.selectedPlan, payment_method: 'Paytm', amount: taxCalc.totalPrice });
                            this.recordIssuedInvoice(verification.data);
                            this.setState({ step: 3, serverPaymentStatus: 'ENTITLEMENT_ACTIVE', isLoading: false });
                        } catch (err) {
                            this.showToast('error', 'Paytm payment verification failed: ' + err.message);
                            this.setState({ isLoading: false });
                        }
                    },
                },
            };

            if (window.Paytm && window.Paytm.CheckoutJS) {
                window.Paytm.CheckoutJS.init(config).then(() => window.Paytm.CheckoutJS.invoke()).catch(err => {
                    throw err;
                });
            } else {
                throw new Error('Paytm CheckoutJS SDK not loaded properly.');
            }
        } catch (err) {
            console.error('Paytm initiation error:', err);
            this.showToast('error', err.response?.data?.error || err.message || 'Failed to initialize Paytm. Please retry.');
            this.setState({ isLoading: false });
        }
    };

    handlePhonePePayment = async () => {
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.uid) { this.showToast('error', 'Session expired. Please refresh and try again.'); return; }
        this.setState({ isLoading: true });

        try {
            const apiBase = '';
            const ppRes = await axios.post(`${apiBase}/api/phonepe/initiate`, {
                planId: this.props.selectedPlan,
                couponCode: this.props.couponCode || null,
                billingDetails: this.getBillingDetails(),
            });

            const ppData = ppRes.data;

            if (!ppData.success || !ppData.redirectUrl) {
                throw new Error(ppData.error || 'PhonePe payment initiation failed');
            }

            // Store pending order context in sessionStorage for callback handling
            try {
                // Store only the opaque order reference. Legal billing PII is
                // already held in the immutable server-side order snapshot.
                sessionStorage.setItem('phonepe_pending', JSON.stringify({ orderId: ppData.orderId }));
            } catch (_e) { /* sessionStorage may be unavailable in some environments */ }

            // Redirect to PhonePe-hosted payment page
            window.location.href = ppData.redirectUrl;
        } catch (err) {
            console.error('PhonePe initiation error:', err);
            this.showToast('error', err.response?.data?.error || err.message || 'Failed to initialize PhonePe. Please retry.');
            this.setState({ isLoading: false });
        }
    };

    nextStep() {
        const { step } = this.state;
        // Step 0 validation: collect the legal billing identity used to issue the invoice.
        if (step === 0) {
            const errors = {};
            const currency = String(this.props.currencyCode || 'INR').toUpperCase();
            if (!this.state.Country || !this.state.Country.trim()) {
                errors.Country = 'Please select your country / region.';
            } else if (currency === 'INR' && this.state.Country.trim().toLowerCase() !== 'india') {
                errors.Country = 'INR checkout requires an Indian billing address.';
            }
            if (!/^\d{6}$/.test(this.state['Postal Code'].trim())) {
                errors['Postal Code'] = 'Enter a valid six-digit Indian pincode.';
            }
            if (!this.state.BillingName.trim()) errors.BillingName = 'Enter the legal name to print on the invoice.';
            if (!this.state.Address.trim()) errors.Address = 'Enter the billing street address.';
            if (!this.state.City.trim()) errors.City = 'Enter the billing city.';
            if (!this.state.State.trim()) {
                errors.State = 'Enter the billing state or union territory.';
            } else if (currency === 'INR' && !this.indianStates.includes(this.state.State.trim())) {
                errors.State = 'Select a valid Indian state or union territory.';
            }
            const gstin = this.state.customerTaxId.trim().toUpperCase();
            if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
                errors.customerTaxId = 'Enter a valid 15-character GSTIN or leave it blank for a B2C invoice.';
            }
            if (Object.keys(errors).length > 0) {
                this.setState({ validationErrors: errors, gstinError: errors.customerTaxId || this.state.gstinError || '' });
                this.showToast('error', 'Please correct the required billing fields before continuing.');
                return;
            }
        }
        // Step 1 validation: a payment method must be selected
        if (step === 1 && !this.state.paymentMethod) {
            this.showToast('error', 'Please select a payment method before continuing.');
            return;
        }
        // Generate a fresh idempotency key each time user reaches step 2
        if (step === 1) {
            this.setState({ idempotencyKey: `ck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` });
        }
        this.setState((prev) => ({ step: prev.step + 1 }));
    }
    previousStep() {
        this.setState((prev) => ({ step: prev.step - 1, validationErrors: {} }));
    }

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
        const tax = this.getTaxCalculations(price);
        // Every monetary value on this surface goes through the single shared
        // formatter so INR grouping is identical here, on the pricing cards and
        // in the invoice ledger.
        const money = (value) => formatCurrencyAmount(value, { currency: this.props.currencyCode });
        const gst = tax.gstBreakdown;
        // An 18% rate split intra-state renders as "9%", not "9.0%" — a raw
        // float would print a misleading decimal on the invoice.
        const trimRate = (value) => String(Number(value) || 0).replace(/\.0+$/, '');
        return (
            <div className="bg-cuba-card rounded-3xl border border-cuba-line shadow-lg overflow-hidden sticky top-6">
                {/* Header */}
                <div className="bg-gradient-to-br from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to p-5 text-cuba-on-primary relative overflow-hidden">
                    <div className="absolute -top-8 -right-8 w-32 h-32 bg-cuba-night-line rounded-full"></div>
                    <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-cuba-night-line rounded-full"></div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-cuba-warning/20 rounded-xl flex items-center justify-center">
                                    <FaCrown className="w-4 h-4 text-cuba-night-warning" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider text-cuba-ink-subtle">Order Summary</span>
                            </div>
                            <span className="px-2 py-0.5 bg-cuba-success/20 text-cuba-night-success text-[10px] font-black rounded-lg border border-cuba-success/30 uppercase">VIP</span>
                        </div>
                        <div className="text-2xl font-black text-cuba-on-primary">{money(tax.totalPrice)}</div>
                        <div className="text-xs text-cuba-ink-subtle mt-0.5">Due today • Instant activation</div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="p-5 space-y-3 text-xs border-b border-cuba-line">
                    <div className="flex justify-between items-center">
                        <span className="text-cuba-ink-muted">Plan</span>
                        <span className="font-bold text-cuba-ink">{planTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-cuba-ink-muted">Billing Term</span>
                        <span className="font-semibold text-cuba-ink">
                            {this.props.selectedPlan === 'monthly' ? 'Monthly' : this.props.selectedPlan === 'halfYear' ? '6 Months' : '12 Months (+3 Free)'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-cuba-ink-muted">Base Price</span>
                        <span className="font-semibold text-cuba-ink">{money(tax.subtotal)}</span>
                    </div>
                    {this.state.taxConfig?.enableTax ? (
                        <>
                            {/* DIR-018 AC-4: the GST line is ITEMISED, not a
                                single opaque percentage. An intra-state supply
                                legally renders as CGST + SGST; an inter-state
                                supply as a single IGST line. The split comes
                                from the customer state entered above. */}
                            {gst && gst.isIntraState ? (
                                <>
                                    <div className="flex justify-between items-center">
                                        <span className="text-cuba-ink-muted">CGST ({trimRate(gst.cgstRate)}%)</span>
                                        <span className="font-semibold text-cuba-primary-ink-strong">{money(gst.cgstAmount)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-cuba-ink-muted">SGST ({trimRate(gst.sgstRate)}%)</span>
                                        <span className="font-semibold text-cuba-primary-ink-strong">{money(gst.sgstAmount)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex justify-between items-center">
                                    <span className="text-cuba-ink-muted">IGST ({trimRate(gst ? gst.igstRate : tax.taxRate)}%)</span>
                                    <span className="font-semibold text-cuba-primary-ink-strong">{money(tax.taxAmount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-cuba-ink-muted">{tax.taxName || 'GST'} total ({trimRate(tax.taxRate)}%){tax.taxInclusive ? ' incl.' : ''}</span>
                                <span className="font-semibold text-cuba-primary-ink-strong">{money(tax.taxAmount)}</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex justify-between items-center">
                            <span className="text-cuba-ink-muted">Tax / GST</span>
                            <span className="font-bold text-cuba-success">Exempt</span>
                        </div>
                    )}
                    <div className="pt-2 border-t border-cuba-line flex justify-between items-center">
                        <span className="font-black text-cuba-ink text-sm">Total Due</span>
                        <span className="text-xl font-black text-cuba-primary-ink-strong">{money(tax.totalPrice)}</span>
                    </div>
                </div>

                {/* Features */}
                <div className="p-5 space-y-2.5">
                    {[
                        { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters', color: 'text-cuba-primary-ink-strong' },
                        { icon: FaDownload, text: 'PDF, Word DocX & Portfolio Links', color: 'text-cuba-primary-ink-strong' },
                        { icon: FaRocket, text: 'ATS Keyword Optimization Engine', color: 'text-cuba-info' },
                        { icon: FaHeadset, text: '24/7 VIP Priority Support', color: 'text-cuba-success' },
                    ].map(({ icon: IconComponent, text, color }, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-xs text-cuba-ink-muted">
                            <div className={`w-5 h-5 rounded-lg bg-cuba-canvas flex items-center justify-center shrink-0 ${color}`}>
                                <IconComponent className="w-2.5 h-2.5" />
                            </div>
                            <span className="font-medium">{text}</span>
                        </div>
                    ))}
                </div>

                {/* Guarantees */}
                <div className="px-5 pb-5 pt-1 space-y-2 border-t border-cuba-line">
                    <div className="flex items-center gap-2 text-[11px] text-cuba-success font-semibold">
                        <FaShieldAlt className="w-3 h-3 shrink-0" />
                        <span>30-Day Risk-Free Money Back Guarantee</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-cuba-ink-muted font-medium">
                        <FaLock className="w-3 h-3 shrink-0" />
                        <span>256-bit SSL · PCI-DSS Compliant · Encrypted</span>
                    </div>
                </div>

                {/* Payment Logos */}
                <div className="px-5 pb-5 border-t border-cuba-line pt-4">
                    <p className="text-[10px] font-bold text-cuba-ink-subtle uppercase tracking-wider mb-2.5 text-center">Accepted Payments</p>
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

    renderToast() {
        const { toast } = this.state;
        if (!toast || !toast.show) return null;
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';
        return (
            <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-cuba-lg transition-all duration-300 transform translate-y-0 animate-bounce-short ${
                isError ? 'bg-cuba-danger/95 text-cuba-night-danger border border-cuba-danger/60' :
                isWarning ? 'bg-cuba-warning/95 text-cuba-night-ink border border-cuba-warning/60' :
                'bg-cuba-success/95 text-cuba-night-ink border border-cuba-success/60'
            }`} style={{ backdropFilter: 'blur(12px)', maxWidth: '420px' }}>
                <span className="text-xl shrink-0">{isError ? '⚠️' : isWarning ? '⚡' : '✅'}</span>
                <div className="flex-1 text-xs font-bold leading-relaxed">{toast.message}</div>
                <button type="button" onClick={() => this.dismissToast()} className="text-cuba-night-ink-muted hover:text-cuba-on-primary font-bold text-sm ml-2 p-1">✕</button>
            </div>
        );
    }

    render() {
        const isEmbedded = this.props.embedded === true;
        const price = this.getPrice();
        const planTitle = this.getPlanLabel();

        return (
            <React.Fragment>
                {this.renderToast()}
                {isEmbedded ? this.renderEmbedded(price, planTitle) : this.renderStandalone(price, planTitle)}
            </React.Fragment>
        );
    }

    renderStandalone(price, planTitle) {
        this.getTaxCalculations(price);
        const { step, isLoading, paymentMethod } = this.state;

        const steps = [
            { label: 'Billing Info', icon: FaGlobe },
            { label: 'Payment Method', icon: FaCreditCard },
            { label: 'Secure Payment', icon: FaLock },
            { label: 'Activation', icon: FaRocket },
        ];

        return (
            <div className="w-full min-h-screen font-sans bg-gradient-to-br from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to">
                <style>{`
                    @keyframes float-up { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-120px) rotate(360deg); opacity: 0; } }
                    @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
                    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px var(--cuba-primary-ring); } 50% { box-shadow: 0 0 40px var(--cuba-primary-ring); } }
                    @keyframes slide-in-right { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
                    @keyframes slide-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                    @keyframes confetti-fall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(200px) rotate(720deg); opacity: 0; } }
                    @keyframes success-pop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
                    .step-slide { animation: slide-in-right 0.4s ease forwards; }
                    .step-slide-up { animation: slide-in-up 0.4s ease forwards; }
                    .success-pop { animation: success-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                    .shimmer-text { background: linear-gradient(90deg, var(--cuba-night-ink) 0%, var(--cuba-night-primary) 30%, var(--cuba-night-ink) 60%, var(--cuba-night-secondary) 90%, var(--cuba-night-ink) 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 3s linear infinite; }
                    .card-glow { animation: pulse-glow 2s ease-in-out infinite; }
                    .glass-card { background: var(--cuba-glass-bg-strong); backdrop-filter: blur(20px); }
                    .confetti-piece { position: absolute; width: 8px; height: 8px; border-radius: 2px; animation: confetti-fall linear forwards; }
                    .checkout-input { width: 100%; padding: 12px 16px; background: var(--cuba-canvas); border: 2px solid var(--cuba-line); border-radius: 14px; font-size: 13px; font-weight: 600; color: var(--cuba-ink); outline: none; transition: all 0.2s; }
                    .checkout-input:focus { border-color: var(--cuba-primary-fill); background: var(--cuba-card); box-shadow: 0 0 0 4px var(--cuba-primary-ring); }
                    .checkout-input::placeholder { color: var(--cuba-ink-subtle); font-weight: 400; }
                `}</style>

                <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">

                    {/* Hero Header */}
                    <div className="text-center mb-8 step-slide-up">
                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-4"
                            style={{ background: 'var(--cuba-primary-soft)', border: '1px solid var(--cuba-primary-ring)', color: 'var(--cuba-night-primary)' }}>
                            <FaLock className="w-3 h-3" />
                            <span>256-Bit Bank-Grade SSL Encrypted Checkout</span>
                            <FaShieldAlt className="w-3 h-3" />
                        </div>
                        {step < 3 && (
                            <>
                                <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-2 shimmer-text">
                                    Complete Your Purchase
                                </h1>
                                <p className="text-cuba-ink-subtle text-sm max-w-lg mx-auto">
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
                                                    isCompleted ? 'bg-gradient-to-br from-cuba-success to-cuba-success shadow-lg shadow-cuba-success/30' :
                                                    isActive ? 'bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-fill shadow-lg shadow-cuba-primary/30 card-glow' :
                                                    'bg-cuba-night-line border border-cuba-night-line'
                                                }`}>
                                                    {isCompleted ? (
                                                        <FaCheck className="w-4 h-4 text-cuba-on-primary" />
                                                    ) : (
                                                        <Icon className={`w-4 h-4 ${isActive ? 'text-cuba-on-primary' : 'text-cuba-ink-subtle'}`} />
                                                    )}
                                                </div>
                                                <span className={`mt-2 text-[11px] font-bold transition-all ${isActive ? 'text-cuba-night-primary' : isCompleted ? 'text-cuba-night-success' : 'text-cuba-ink-muted'}`}>
                                                    {s.label}
                                                </span>
                                            </div>
                                            {i < 2 && (
                                                <div className={`w-16 sm:w-24 h-0.5 mb-6 mx-1 transition-all duration-700 ${step > i ? 'bg-gradient-to-r from-cuba-success to-cuba-primary-fill' : 'bg-cuba-night-line'}`} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Sandbox Banner */}
                    {this.props.sandboxMode && step < 3 && (
                        <div className="mb-6 flex items-center justify-center gap-3 px-5 py-3 rounded-2xl max-w-xl mx-auto bg-cuba-warning/10 border border-cuba-warning/30">
                            <span className="text-base">⚡</span>
                            <div>
                                <span className="text-xs font-black text-cuba-night-warning uppercase tracking-wide">Sandbox Test Mode · </span>
                                <span className="text-xs text-cuba-warning/80">No real bank charges will be processed.</span>
                            </div>
                            <span className="ml-auto px-2 py-0.5 bg-cuba-warning/20 text-cuba-night-warning text-[10px] font-black rounded uppercase">DEMO</span>
                        </div>
                    )}

                    {/* Main 2-col Layout */}
                    {step < 3 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                            
                            {/* LEFT: Form Panel */}
                            <div className="lg:col-span-3 order-1">
                                <div className="glass-card rounded-3xl shadow-2xl border border-cuba-night-line overflow-hidden">

                                    {/* Step 0: Billing Info */}
                                    {step === 0 && (
                                        <div className="step-slide">
                                            {/* Step Header */}
                                            <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-fill rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-primary/30">
                                                        <FaGlobe className="w-5 h-5 text-cuba-on-primary" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-black text-cuba-ink">Billing & Region</h2>
                                                        <p className="text-xs text-cuba-ink-muted">Confirm your billing location for accurate tax receipts</p>
                                                    </div>
                                                    <span className="ml-auto text-xs font-black text-cuba-primary-ink-strong bg-cuba-primary-soft px-3 py-1 rounded-full border border-cuba-primary-soft">Step 1 of 3</span>
                                                </div>
                                            </div>

                                            <div className="p-7 space-y-5">
                                                {/* Country + Postal */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                            <FaMapMarkerAlt className="w-3 h-3 text-cuba-primary-ink-strong" />
                                                            Country / Region *
                                                        </label>
                                                        <DropdownInput
                                                            handleInputs={this.handleInput}
                                                            placeholder="Select your country"
                                                            checkout={true}
                                                            name="Country"
                                                            options={this.countries}
                                                        />
                                                        {this.state.validationErrors['Country'] && (
                                                            <p className="text-xs font-bold text-cuba-danger mt-1.5 flex items-center gap-1">
                                                                ⚠️ {this.state.validationErrors['Country']}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2">
                                                            Postal / Zip Code *
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter postal / zip code"
                                                            onChange={(e) => this.handleInput('Postal Code', e)}
                                                            className={`checkout-input ${this.state.validationErrors['Postal Code'] ? 'border-cuba-danger bg-cuba-danger-soft/30' : ''}`}
                                                        />
                                                        {this.state.validationErrors['Postal Code'] && (
                                                            <p className="text-xs font-bold text-cuba-danger mt-1.5 flex items-center gap-1">
                                                                ⚠️ {this.state.validationErrors['Postal Code']}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {this.renderInvoiceAddressFields('checkout-input')}

                                                {/* Tax ID */}
                                                {Boolean(this.state.taxConfig?.enableTax) && (
                                                    <div>
                                                        <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2 flex items-center justify-between">
                                                            <span>Business {this.state.taxConfig?.taxName || 'GST'}IN / Tax ID <span className="text-cuba-ink-subtle font-normal normal-case">(Optional — for B2B invoices)</span></span>
                                                            {this.state.customerTaxId && (
                                                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                                                    this.state.customerTaxId.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(this.state.customerTaxId)
                                                                        ? 'bg-cuba-success-soft text-cuba-success'
                                                                        : 'bg-cuba-warning-soft text-cuba-warning'
                                                                }`}>
                                                                    {this.state.customerTaxId.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(this.state.customerTaxId)
                                                                        ? 'VALID B2B GSTIN ✓'
                                                                        : `${this.state.customerTaxId.length}/15 chars`}
                                                                </span>
                                                            )}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={this.state.customerTaxId}
                                                            onChange={(e) => {
                                                                const val = e.target.value.toUpperCase().trim();
                                                                let err = '';
                                                                if (val.length > 0 && val.length !== 15) {
                                                                    err = 'GSTIN must be 15 alphanumeric characters (e.g. 27AAAAA0000A1Z5)';
                                                                } else if (val.length === 15 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(val)) {
                                                                    err = 'Invalid GSTIN structure. Verify state code & PAN digits.';
                                                                }
                                                                this.setState((prev) => ({
                                                                    customerTaxId: val,
                                                                    gstinError: err,
                                                                    validationErrors: { ...prev.validationErrors, customerTaxId: '' }
                                                                }));
                                                            }}
                                                            placeholder={`Enter 15-character ${this.state.taxConfig?.taxName || 'GST'} number (e.g. 27AAAAA0000A1Z5)`}
                                                            className={`checkout-input uppercase font-mono ${this.state.gstinError ? 'border-cuba-warning bg-cuba-warning-soft/20' : ''}`}
                                                        />
                                                        {this.state.gstinError && (
                                                            <p className="text-[11px] font-bold text-cuba-warning mt-1 flex items-center gap-1">
                                                                💡 {this.state.gstinError}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Tax Info Card */}
                                                {Boolean(this.state.taxConfig?.enableTax) && (
                                                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-cuba-info-soft border border-cuba-info-soft">
                                                        <FaShieldAlt className="w-4 h-4 text-cuba-info mt-0.5 shrink-0" />
                                                        <div>
                                                            <p className="text-xs font-bold text-cuba-info">{this.state.taxConfig?.taxName || 'GST'} @ {this.state.taxConfig?.taxRate || 0}% {this.state.taxConfig?.taxInclusive ? '(Included in price)' : '(Added to total)'}</p>
                                                            <p className="text-[11px] text-cuba-info mt-0.5">Applicable for your region. Full invoice with GSTIN issued on payment.</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* CTA */}
                                                <button
                                                    type="button"
                                                    onClick={() => this.nextStep()}
                                                    className="cuba-btn-primary w-full py-4 px-6 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                                                    <span>Continue to Payment Method</span>
                                                    <FaArrowRight className="w-4 h-4" />
                                                </button>

                                                <p className="text-center text-[11px] text-cuba-ink-subtle flex items-center justify-center gap-1.5">
                                                    <FaLock className="w-3 h-3" />
                                                    Your data is encrypted and never shared with third parties.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 1: Payment Method */}
                                    {step === 1 && (
                                        <div className="step-slide">
                                            <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-11 h-11 bg-gradient-to-br from-cuba-primary-fill to-cuba-danger rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-primary/30">
                                                        <FaCreditCard className="w-5 h-5 text-cuba-on-primary" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-black text-cuba-ink">Payment Gateway</h2>
                                                        <p className="text-xs text-cuba-ink-muted">Choose your preferred secure payment method</p>
                                                    </div>
                                                    <span className="ml-auto text-xs font-black text-cuba-primary-ink-strong bg-cuba-primary-soft px-3 py-1 rounded-full border border-cuba-primary-soft">Step 2 of 3</span>
                                                </div>
                                            </div>

                                            <div className="p-7 space-y-4">
                                                {/* Stripe Card Option */}
                                                {(this.props.stripeEnabled !== false && !this.props.onlyPP) && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'creditCard' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'creditCard'
                                                                ? 'border-cuba-primary shadow-xl shadow-cuba-primary/10'
                                                                : 'border-cuba-line hover:border-cuba-line-strong hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'creditCard' ? { background: 'var(--cuba-primary-soft)' } : { background: 'var(--cuba-card)' }}>
                                                        {paymentMethod === 'creditCard' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-cuba-primary-soft to-cuba-primary-soft rounded-2xl flex items-center justify-center shrink-0 border border-cuba-primary-soft">
                                                                <FaCreditCard className="w-6 h-6 text-cuba-primary-ink-strong" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-cuba-ink">Credit / Debit Card</h3>
                                                                <p className="text-xs text-cuba-ink-muted mt-0.5">Visa, Mastercard, Amex, Discover · Powered by Stripe</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <img src={VisaLogo} alt="Visa" className="h-4 opacity-80" />
                                                                    <img src={MastercardLogo} alt="Mastercard" className="h-4 opacity-80" />
                                                                    <img src={AmexLogo} alt="Amex" className="h-4 opacity-80" />
                                                                    <img src={JCBLogo} alt="JCB" className="h-4 opacity-80" />
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'creditCard' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'
                                                            }`}>
                                                                {paymentMethod === 'creditCard' && <FaCheck className="w-3 h-3 text-cuba-on-primary" />}
                                                            </div>
                                                        </div>
                                                        {paymentMethod === 'creditCard' && (
                                                            <div className="mt-3 flex items-center gap-2 text-xs text-cuba-primary-ink-strong font-bold">
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
                                                                ? 'border-cuba-warning shadow-xl shadow-cuba-warning/10'
                                                                : 'border-cuba-line hover:border-cuba-line-strong hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'paypal' ? { background: 'var(--cuba-warning-soft)' } : { background: 'var(--cuba-card)' }}>
                                                        {paymentMethod === 'paypal' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cuba-warning to-cuba-warning rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-cuba-warning-soft to-cuba-warning-soft rounded-2xl flex items-center justify-center shrink-0 border border-cuba-warning-soft">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-7 object-contain" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-cuba-ink">PayPal Express</h3>
                                                                <p className="text-xs text-cuba-ink-muted mt-0.5">Fast 1-click checkout with your PayPal account</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-cuba-warning-soft text-cuba-warning text-[10px] font-black rounded-md border border-cuba-warning-soft">Buyer Protection</span>
                                                                    <span className="px-2 py-0.5 bg-cuba-warning-soft text-cuba-warning text-[10px] font-black rounded-md border border-cuba-warning-soft">No Card Needed</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'paypal' ? 'border-cuba-warning bg-cuba-warning' : 'border-cuba-line-strong'
                                                            }`}>
                                                                {paymentMethod === 'paypal' && <FaCheck className="w-3 h-3 text-cuba-on-primary" />}
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
                                                                ? 'border-cuba-info shadow-xl shadow-cuba-info/10'
                                                                : 'border-cuba-line hover:border-cuba-line-strong hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'razorpay' ? { background: 'var(--cuba-info-soft)' } : { background: 'var(--cuba-card)' }}>
                                                        {paymentMethod === 'razorpay' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cuba-info to-cuba-primary-fill rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-cuba-info-soft to-cuba-primary-soft rounded-2xl flex items-center justify-center shrink-0 border border-cuba-info-soft">
                                                                <span className="text-xl font-black text-cuba-info">₹</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-cuba-ink">Razorpay Express &amp; UPI</h3>
                                                                <p className="text-xs text-cuba-ink-muted mt-0.5">UPI, GPay, PhonePe, Paytm, NetBanking &amp; Indian Cards</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-cuba-info-soft text-cuba-info text-[10px] font-black rounded-md border border-cuba-info-soft">Instant UPI</span>
                                                                    <span className="px-2 py-0.5 bg-cuba-info-soft text-cuba-info text-[10px] font-black rounded-md border border-cuba-info-soft">All Indian Banks</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'razorpay' ? 'border-cuba-info bg-cuba-info' : 'border-cuba-line-strong'
                                                            }`}>
                                                                {paymentMethod === 'razorpay' && <FaCheck className="w-3 h-3 text-cuba-on-primary" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Paytm Option */}
                                                {this.props.paytmEnabled === true && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'paytm' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'paytm'
                                                                ? 'border-cuba-info shadow-xl shadow-cuba-info/10'
                                                                : 'border-cuba-line hover:border-cuba-line-strong hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'paytm' ? { background: 'var(--cuba-info-soft)' } : { background: 'var(--cuba-card)' }}>
                                                        {paymentMethod === 'paytm' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cuba-info to-cuba-info rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-cuba-info-soft to-cuba-info-soft rounded-2xl flex items-center justify-center shrink-0 border border-cuba-info-soft">
                                                                <span className="text-lg font-black text-cuba-info leading-none">Pay<br/>tm</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-cuba-ink">Paytm Checkout</h3>
                                                                <p className="text-xs text-cuba-ink-muted mt-0.5">Paytm Wallet, UPI, Cards &amp; NetBanking</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-cuba-info-soft text-cuba-info text-[10px] font-black rounded-md border border-cuba-info-soft">Paytm Wallet</span>
                                                                    <span className="px-2 py-0.5 bg-cuba-info-soft text-cuba-info text-[10px] font-black rounded-md border border-cuba-info-soft">UPI</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'paytm' ? 'border-cuba-info bg-cuba-info' : 'border-cuba-line-strong'
                                                            }`}>
                                                                {paymentMethod === 'paytm' && <FaCheck className="w-3 h-3 text-cuba-on-primary" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* PhonePe Option */}
                                                {this.props.phonepeEnabled === true && (
                                                    <div
                                                        onClick={() => this.setState({ paymentMethod: 'phonepe' })}
                                                        className={`relative p-5 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden ${
                                                            paymentMethod === 'phonepe'
                                                                ? 'border-cuba-primary shadow-xl shadow-cuba-primary/10'
                                                                : 'border-cuba-line hover:border-cuba-line-strong hover:shadow-md'
                                                        }`}
                                                        style={paymentMethod === 'phonepe' ? { background: 'var(--cuba-primary-soft)' } : { background: 'var(--cuba-card)' }}>
                                                        {paymentMethod === 'phonepe' && (
                                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill rounded-t-2xl"></div>
                                                        )}
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-14 h-14 bg-gradient-to-br from-cuba-primary-soft to-cuba-primary-soft rounded-2xl flex items-center justify-center shrink-0 border border-cuba-primary-soft">
                                                                <span className="text-[10px] font-black text-cuba-primary-ink-strong text-center leading-tight">Phone<br/>Pe</span>
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-sm font-black text-cuba-ink">PhonePe UPI &amp; Payments</h3>
                                                                <p className="text-xs text-cuba-ink-muted mt-0.5">PhonePe UPI payment</p>
                                                                <div className="flex items-center gap-2 mt-2.5">
                                                                    <span className="px-2 py-0.5 bg-cuba-primary-soft text-cuba-primary-ink-strong text-[10px] font-black rounded-md border border-cuba-primary-soft">UPI Instant</span>
                                                                    <span className="px-2 py-0.5 bg-cuba-primary-soft text-cuba-primary-ink-strong text-[10px] font-black rounded-md border border-cuba-primary-soft">500M+ Users</span>
                                                                </div>
                                                            </div>
                                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                                paymentMethod === 'phonepe' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'
                                                            }`}>
                                                                {paymentMethod === 'phonepe' && <FaCheck className="w-3 h-3 text-cuba-on-primary" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Fallback Banner if ALL payment providers disabled by admin */}
                                                {(
                                                    (this.props.stripeEnabled === false || this.props.onlyPP) &&
                                                    this.props.paypalEnabled === false &&
                                                    this.props.razorpayEnabled === false &&
                                                    this.props.paytmEnabled !== true &&
                                                    this.props.phonepeEnabled !== true
                                                ) && (
                                                    <div className="p-5 rounded-2xl bg-cuba-danger-soft border-2 border-cuba-danger-soft text-cuba-danger text-xs font-semibold text-center space-y-2">
                                                        <p className="font-bold text-sm">No Active Payment Gateway</p>
                                                        <p>All online payment providers are currently disabled by the administrator. Please contact support.</p>
                                                    </div>
                                                )}

                                                {/* Navigation */}
                                                <div className="flex items-center gap-3 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => this.previousStep()}
                                                        className="px-5 py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center gap-2 hover:bg-cuba-canvas">
                                                        <FaArrowLeft className="w-3 h-3" />
                                                        <span>Back</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => this.nextStep()}
                                                        disabled={!paymentMethod}
                                                        className="cuba-btn-primary flex-1 py-4 px-6 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                                                        <span>{
                                                            paymentMethod === 'creditCard' ? 'Enter Card Details' :
                                                            paymentMethod === 'paypal' ? 'Continue with PayPal' :
                                                            paymentMethod === 'razorpay' ? 'Pay via Razorpay / UPI' :
                                                            paymentMethod === 'paytm' ? 'Pay via Paytm' :
                                                            paymentMethod === 'phonepe' ? 'Pay via PhonePe' :
                                                            'Continue to Payment'
                                                        }</span>
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
                                                    <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-cuba-success to-cuba-success rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-success/30">
                                                                <FaLock className="w-5 h-5 text-cuba-on-primary" />
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-cuba-ink">Secure Card Payment</h2>
                                                                <p className="text-xs text-cuba-ink-muted">Your card details are 256-bit encrypted via Stripe</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-cuba-success bg-cuba-success-soft px-3 py-1 rounded-full border border-cuba-success-soft">Step 3 of 3</span>
                                                        </div>
                                                    </div>

                                                    <div className="p-7 space-y-5">
                                                        {/* Mock Credit Card Visual */}
                                                        <div className="relative h-36 rounded-2xl overflow-hidden mb-2 bg-gradient-to-br from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to shadow-cuba-shadow-lg">
                                                            <div className="absolute top-3 left-4 w-10 h-7 rounded-md opacity-80 bg-gradient-to-br from-cuba-pill-warning-fill to-cuba-pill-warning-line"></div>
                                                            <div className="absolute inset-0 flex items-end p-5">
                                                                <div className="text-cuba-on-primary">
                                                                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">Card Holder</p>
                                                                    <p className="text-sm font-black tracking-wider">{this.state.CardHolder || 'YOUR NAME HERE'}</p>
                                                                </div>
                                                                <div className="ml-auto text-right text-cuba-on-primary">
                                                                    <div className="flex gap-1 justify-end mb-2">
                                                                        <img src={VisaLogo} alt="Visa" className="h-5 opacity-80 brightness-0 invert" />
                                                                    </div>
                                                                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Secured by Stripe</p>
                                                                </div>
                                                            </div>
                                                            <div className="absolute top-3 right-4 opacity-20">
                                                                <div className="w-16 h-16 rounded-full border-2 border-cuba-line"></div>
                                                                <div className="w-10 h-10 rounded-full border-2 border-cuba-line -mt-6 ml-8"></div>
                                                            </div>
                                                        </div>

                                                        {/* Cardholder Name */}
                                                        <div>
                                                            <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2">
                                                                Cardholder Name *
                                                            </label>
                                                            <input
                                                                type="text"
                                                                onChange={(e) => this.handleInput('CardHolder', e)}
                                                                placeholder="Full name as displayed on card"
                                                                className="checkout-input"
                                                            />
                                                        </div>

                                                        {/* Card Element */}
                                                        <div>
                                                            <label className="block text-xs font-black text-cuba-ink uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                                <FaCreditCard className="w-3 h-3 text-cuba-primary-ink-strong" />
                                                                Card Number, Expiry & CVC *
                                                            </label>
                                                            <div className="p-4 bg-cuba-canvas border-2 border-cuba-line rounded-2xl focus-within:border-cuba-primary focus-within:bg-cuba-card focus-within:shadow-lg transition-all" style={{ focusWithin: { boxShadow: '0 0 0 4px var(--cuba-primary-ring)' } }}>
                                                                <CardElement
                                                                    options={{
                                                                        style: {
                                                                            base: {
                                                                                fontSize: '15px',
                                                                                color: resolveCubaToken('--cuba-ink', CUBA_INK_FALLBACK),
                                                                                fontFamily: '"Inter", -apple-system, sans-serif',
                                                                                '::placeholder': { color: resolveCubaToken('--cuba-ink-subtle', CUBA_INK_SUBTLE_FALLBACK) },
                                                                                iconColor: resolveCubaToken('--cuba-primary-fill', CUBA_PRIMARY_FALLBACK),
                                                                            },
                                                                            invalid: {
                                                                                color: resolveCubaToken('--cuba-danger', CUBA_DANGER_FALLBACK),
                                                                                iconColor: resolveCubaToken('--cuba-danger', CUBA_DANGER_FALLBACK),
                                                                            },
                                                                        },
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Security Note */}
                                                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-cuba-success-soft border border-cuba-success-soft">
                                                            <FaShieldAlt className="w-4 h-4 text-cuba-success mt-0.5 shrink-0" />
                                                            <div>
                                                                <p className="text-xs font-bold text-cuba-success">Bank-Grade Security · PCI-DSS Level 1 Compliant</p>
                                                                <p className="text-[11px] text-cuba-success mt-0.5">Card numbers are tokenized by Stripe and never stored on our servers.</p>
                                                            </div>
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => this.previousStep()}
                                                                className="px-5 py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center gap-2 hover:bg-cuba-canvas">
                                                                <FaArrowLeft className="w-3 h-3" />
                                                                <span>Back</span>
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => this.handleSubmit()}
                                                                disabled={isLoading}
                                                                className="cuba-btn-primary flex-1 py-4 px-6 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100">
                                                                {isLoading ? (
                                                                    <>
                                                                        <div className="w-5 h-5 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin"></div>
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

                                                        <p className="text-center text-[11px] text-cuba-ink-subtle flex items-center justify-center gap-1.5">
                                                            <FaShieldAlt className="w-3 h-3" />
                                                            30-Day Money-Back Guarantee · Cancel anytime
                                                        </p>
                                                    </div>
                                                </>
                                            ) : paymentMethod === 'paypal' ? (
                                                /* PayPal Flow */
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-cuba-warning to-cuba-warning rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-warning/30">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain brightness-0" />
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-cuba-ink">PayPal Express</h2>
                                                                <p className="text-xs text-cuba-ink-muted">Complete your transaction securely via PayPal</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-cuba-warning bg-cuba-warning-soft px-3 py-1 rounded-full border border-cuba-warning-soft">Step 3 of 3</span>
                                                        </div>
                                                    </div>

                                                    <div className="p-7 space-y-5">
                                                        <div className="rounded-2xl overflow-hidden bg-cuba-warning-soft border-[1.5px] border-cuba-pill-warning-line">
                                                            <div className="px-5 py-4 flex items-center justify-between border-b border-cuba-warning-soft/60">
                                                                <img src={PayPalLogo} alt="PayPal" className="h-6 object-contain" />
                                                                <div className="text-right">
                                                                    <p className="text-[11px] text-cuba-warning font-semibold">Total to Pay</p>
                                                                    <p className="text-xl font-black text-cuba-warning">{this.props.currency}{price}</p>
                                                                </div>
                                                            </div>
                                                            <div className="px-5 py-4 space-y-1">
                                                                <div className="flex items-center gap-2 text-xs text-cuba-warning">
                                                                    <FaCheckCircle className="w-3.5 h-3.5 text-cuba-warning shrink-0" />
                                                                    <span className="font-semibold">PayPal Buyer Protection included</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-xs text-cuba-warning">
                                                                    <FaShieldAlt className="w-3.5 h-3.5 text-cuba-warning shrink-0" />
                                                                    <span>No credit card needed · Redirect to PayPal</span>
                                                                </div>
                                                            </div>
                                                            <div className="px-5 pb-5">
                                                                <PayPalButtonWrapper
                                                                    amount={price}
                                                                    currency={this.props.currencyCode || 'USD'}
                                                                    selectedPlan={this.props.selectedPlan}
                                                                    couponCode={this.props.couponCode}
                                                                    billingDetails={this.getBillingDetails()}
                                                                    onSuccess={this.handlePayPalSuccess}
                                                                    onError={this.handlePayPalError}
                                                                />
                                                            </div>
                                                        </div>

                                                        <button type="button" onClick={() => this.previousStep()}
                                                            className="w-full py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 hover:bg-cuba-canvas">
                                                            <FaArrowLeft className="w-3 h-3" />
                                                            <span>Back to Payment Method</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : paymentMethod === 'razorpay' ? (
                                                /* Razorpay Flow */
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-cuba-info to-cuba-primary-fill rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-info/30">
                                                                <span className="text-xl font-black text-cuba-on-primary">₹</span>
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-cuba-ink">Razorpay Express &amp; UPI</h2>
                                                                <p className="text-xs text-cuba-ink-muted">Pay via GPay, PhonePe, Paytm, Cards or NetBanking</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-cuba-info bg-cuba-info-soft px-3 py-1 rounded-full border border-cuba-info-soft">Step 3 of 3</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-7 space-y-5">
                                                        <div className="rounded-2xl overflow-hidden border border-cuba-info-soft bg-cuba-info-soft">
                                                            <div className="px-5 py-4 flex items-center justify-between border-b border-cuba-info-soft/60">
                                                                <span className="text-xs font-black text-cuba-info">Razorpay Secure Gateway</span>
                                                                <span className="text-xl font-black text-cuba-info">{this.props.currency}{price}</span>
                                                            </div>
                                                            <div className="p-5">
                                                                <p className="text-xs text-cuba-info font-semibold mb-4">Instant auto-activation via UPI, GPay, PhonePe, Paytm or NetBanking</p>
                                                                <button type="button" onClick={() => this.handleRazorpayPayment()} disabled={isLoading}
                                                                    className="cuba-btn-primary w-full py-4 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:scale-100">
                                                                    {isLoading ? <><div className="w-5 h-5 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Launching Razorpay...</span></> : <><FaLock className="w-4 h-4" /><span>Pay {this.props.currency}{price} via Razorpay</span></>}
                                                                </button>
                                                                <div className="mt-3 p-3 rounded-xl bg-cuba-warning-soft border border-cuba-warning-soft text-[11px] text-cuba-warning">
                                                                    <span className="font-extrabold">💡 Test Mode Tip:</span> Use UPI ID <code className="bg-cuba-warning-soft px-1 rounded font-mono">success@razorpay</code> in sandbox mode.
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={() => this.previousStep()}
                                                            className="w-full py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 hover:bg-cuba-canvas">
                                                            <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : paymentMethod === 'paytm' ? (
                                                /* Paytm Flow */
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-cuba-info to-cuba-info rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-info/30">
                                                                <span className="text-sm font-black text-cuba-on-primary leading-none">Pay<br/>tm</span>
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-cuba-ink">Paytm Checkout</h2>
                                                                <p className="text-xs text-cuba-ink-muted">Pay via Paytm Wallet, UPI, Cards &amp; NetBanking</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-cuba-info bg-cuba-info-soft px-3 py-1 rounded-full border border-cuba-info-soft">Step 3 of 3</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-7 space-y-5">
                                                        <div className="rounded-2xl overflow-hidden border border-cuba-info-soft bg-cuba-info-soft">
                                                            <div className="px-5 py-4 flex items-center justify-between border-b border-cuba-info-soft/60">
                                                                <span className="text-xs font-black text-cuba-info">Paytm Secure Checkout</span>
                                                                <span className="text-xl font-black text-cuba-info">{this.props.currency}{price}</span>
                                                            </div>
                                                            <div className="p-5">
                                                                <p className="text-xs text-cuba-info font-semibold mb-4">Instant payment via Paytm Wallet, UPI, Cards or NetBanking</p>
                                                                <button type="button" onClick={() => this.handlePaytmPayment()} disabled={isLoading}
                                                                    className="cuba-btn-primary w-full py-4 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:scale-100">
                                                                    {isLoading ? <><div className="w-5 h-5 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Launching Paytm...</span></> : <><FaLock className="w-4 h-4" /><span>Pay {this.props.currency}{price} via Paytm</span></>}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={() => this.previousStep()}
                                                            className="w-full py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 hover:bg-cuba-canvas">
                                                            <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : paymentMethod === 'phonepe' ? (
                                                /* PhonePe Flow */
                                                <>
                                                    <div className="px-7 pt-7 pb-5 border-b border-cuba-line">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-11 h-11 bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-strong rounded-2xl flex items-center justify-center shadow-lg shadow-cuba-primary/30">
                                                                <span className="text-[10px] font-black text-cuba-on-primary text-center leading-tight">Phone<br/>Pe</span>
                                                            </div>
                                                            <div>
                                                                <h2 className="text-lg font-black text-cuba-ink">PhonePe UPI &amp; Payments</h2>
                                                                <p className="text-xs text-cuba-ink-muted">PhonePe UPI payment</p>
                                                            </div>
                                                            <span className="ml-auto text-xs font-black text-cuba-primary-ink-strong bg-cuba-primary-soft px-3 py-1 rounded-full border border-cuba-primary-soft">Step 3 of 3</span>
                                                        </div>
                                                    </div>
                                                    <div className="p-7 space-y-5">
                                                        <div className="rounded-2xl overflow-hidden border border-cuba-primary-soft bg-cuba-primary-soft">
                                                            <div className="px-5 py-4 flex items-center justify-between border-b border-cuba-primary-soft/60">
                                                                <span className="text-xs font-black text-cuba-primary-ink-strong">PhonePe Secure Gateway</span>
                                                                <span className="text-xl font-black text-cuba-primary-ink-strong">{this.props.currency}{price}</span>
                                                            </div>
                                                            <div className="p-5">
                                                                <p className="text-xs text-cuba-primary-ink-strong font-semibold mb-4">Instant payment via PhonePe UPI. You will be redirected to PhonePe to complete payment.</p>
                                                                <button type="button" onClick={() => this.handlePhonePePayment()} disabled={isLoading}
                                                                    className="cuba-btn-primary w-full py-4 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:scale-100">
                                                                    {isLoading ? <><div className="w-5 h-5 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Redirecting to PhonePe...</span></> : <><FaLock className="w-4 h-4" /><span>Pay {this.props.currency}{price} via PhonePe</span></>}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={() => this.previousStep()}
                                                            className="w-full py-3.5 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 hover:bg-cuba-canvas">
                                                            <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                                        </button>
                                                    </div>
                                                </>
                                            ) : null}
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
                            <div className="glass-card rounded-3xl shadow-2xl overflow-hidden relative" style={{ border: '1px solid var(--cuba-night-line)' }}>
                                
                                {/* Confetti background strip */}
                                <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg, var(--cuba-primary), var(--cuba-primary-fill), var(--cuba-secondary), var(--cuba-warning), var(--cuba-success), var(--cuba-primary))', backgroundSize: '200% auto', animation: 'shimmer 2s linear infinite' }}></div>

                                <div className="p-8 sm:p-12 text-center space-y-8">
                                    {/* Lottie + Confetti */}
                                    <div className="relative w-36 h-36 mx-auto success-pop">
                                        <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, var(--cuba-success-soft) 0%, transparent 70%)', animation: 'pulse-glow 2s ease-in-out infinite' }}></div>
                                        <View />
                                        {/* Mini confetti dots */}
                                        {[
                                            { top: '10%', left: '5%', w: 10, h: 10, bg: 'var(--cuba-primary)', delay: '0s', dur: '1.8s' },
                                            { top: '20%', right: '5%', w: 8, h: 8, bg: 'var(--cuba-warning)', delay: '0.3s', dur: '2s' },
                                            { bottom: '10%', left: '10%', w: 6, h: 6, bg: 'var(--cuba-secondary)', delay: '0.6s', dur: '1.6s' },
                                            { bottom: '20%', right: '10%', w: 9, h: 9, bg: 'var(--cuba-success)', delay: '0.2s', dur: '2.2s' },
                                            { top: '50%', left: '-5%', w: 7, h: 7, bg: 'var(--cuba-primary-fill)', delay: '0.9s', dur: '1.9s' },
                                            { top: '40%', right: '-5%', w: 8, h: 8, bg: 'var(--cuba-danger)', delay: '0.4s', dur: '1.7s' },
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
                                        <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest bg-cuba-success-soft text-cuba-success border-[1.5px] border-cuba-pill-success-line">
                                            <FaCheckCircle className="w-4 h-4" />
                                            🎉 Transaction Verified & Completed
                                        </div>
                                        <h2 className="text-3xl sm:text-4xl font-black text-cuba-ink tracking-tight">
                                            Welcome to PRO Candidate Tier!
                                        </h2>
                                        <p className="text-cuba-ink-muted text-sm max-w-lg mx-auto leading-relaxed">
                                            Your subscription is now <strong className="text-cuba-ink">instantly active</strong>. All AI Resume Builder tools, ATS Keyword Synthesizers, unlimited PDF exports, and VIP support are fully unlocked.
                                        </p>
                                    </div>

                                    {/* Unlocked Features Grid */}
                                    <div className="rounded-2xl overflow-hidden border border-cuba-line bg-gradient-to-br from-cuba-night-surface-from to-cuba-studio-to">
                                        <div className="px-6 py-4 border-b border-cuba-night-line flex items-center justify-between">
                                            <span className="text-xs font-black text-cuba-night-warning uppercase tracking-widest flex items-center gap-2">
                                                <FaGem className="w-3.5 h-3.5" />
                                                Your VIP Benefits — Fully Unlocked
                                            </span>
                                            <span className="text-xs font-black text-cuba-night-success uppercase">✓ Active</span>
                                        </div>
                                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {[
                                                { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters' },
                                                { icon: FaDownload, text: '1-Click PDF, Word DocX & Portfolio Links' },
                                                { icon: FaRocket, text: 'ATS Smart Keyword Optimization Engine' },
                                                { icon: FaHeadset, text: '24/7 Priority VIP Support' },
                                                { icon: FaFileAlt, text: '51+ Premium ATS Resume Templates' },
                                                { icon: FaInfinity, text: 'Unlimited Cloud Sync & Resume Storage' },
                                            ].map(({ icon: IconComponent, text }, i) => (
                                                <div key={i} className="flex items-center gap-3 text-xs text-cuba-ink-subtle">
                                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-cuba-primary/20 border border-cuba-primary/30">
                                                        <IconComponent className="w-3 h-3 text-cuba-night-primary" />
                                                    </div>
                                                    <span className="font-semibold">{text}</span>
                                                    <FaCheck className="w-3 h-3 text-cuba-night-success ml-auto shrink-0" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Billing Info Summary */}
                                    <div className="flex items-center justify-center gap-6 text-xs text-cuba-ink-muted flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <FaShieldAlt className="w-3.5 h-3.5 text-cuba-success" />
                                            <span>30-Day Money-Back Guarantee</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FaLock className="w-3.5 h-3.5 text-cuba-primary-ink-strong" />
                                            <span>Auto-Renewal Control in Dashboard</span>
                                        </div>
                                        <div className="flex items-center gap-2" role="status">
                                            <FaEnvelope className={`w-3.5 h-3.5 ${this.state.invoiceStatus === 'FAILED' ? 'text-cuba-danger' : 'text-cuba-info'}`} />
                                            <span>{this.state.invoiceStatus === 'GENERATED'
                                                ? 'Invoice generated; email queued for delivery'
                                                : this.state.invoiceStatus === 'FAILED'
                                                    ? 'Invoice generation needs attention'
                                                    : 'Generating authoritative invoice…'}</span>
                                        </div>
                                    </div>

                                    {this.state.invoiceStatus === 'FAILED' && (
                                        <div className="rounded-xl border border-cuba-danger-soft bg-cuba-danger-soft px-4 py-3 text-xs font-semibold text-cuba-danger" role="alert">
                                            {this.state.invoiceError}
                                        </div>
                                    )}

                                    {/* CTA Buttons */}
                                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => { window.location.href = '/dashboard'; }}
                                            className="cuba-btn-primary w-full sm:w-auto px-8 py-4 rounded-2xl text-cuba-on-primary font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
                                            style={{ minWidth: '220px' }}>
                                            <FaRocket className="w-4 h-4" />
                                            <span>Go to AI Resume Builder</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => { window.location.href = '/dashboard/plans?tab=invoices'; }}
                                            className="w-full sm:w-auto px-7 py-4 rounded-2xl text-cuba-ink font-black text-sm flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] hover:shadow-md"
                                            style={{ background: 'var(--cuba-card)', border: '2px solid var(--cuba-line)', minWidth: '200px' }}>
                                            <FaFileAlt className="w-4 h-4 text-cuba-ink-muted" />
                                            <span>View Billing History</span>
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
    renderEmbedded(price, _planTitle) {
        const { step, isLoading, paymentMethod } = this.state;
        this.getTaxCalculations(price);

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
                    .checkout-input-emb { width: 100%; padding: 11px 14px; background: var(--cuba-canvas); border: 2px solid var(--cuba-line); border-radius: 12px; font-size: 12px; font-weight: 600; color: var(--cuba-ink); outline: none; transition: all 0.2s; }
                    .checkout-input-emb:focus { border-color: var(--cuba-primary-fill); background: var(--cuba-card); box-shadow: 0 0 0 3px var(--cuba-primary-ring); }
                    .checkout-input-emb::placeholder { color: var(--cuba-ink-subtle); font-weight: 400; }
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
                                            done ? 'bg-gradient-to-br from-cuba-success to-cuba-success shadow-md' :
                                            active ? 'bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-fill shadow-md shadow-cuba-primary/30' :
                                            'bg-cuba-elevated border border-cuba-line'
                                        }`}>
                                            {done ? <FaCheck className="w-3.5 h-3.5 text-cuba-on-primary" /> : <Icon className={`w-3.5 h-3.5 ${active ? 'text-cuba-on-primary' : 'text-cuba-ink-subtle'}`} />}
                                        </div>
                                        <span className={`mt-1.5 text-[10px] font-bold ${ active ? 'text-cuba-primary-ink-strong' : done ? 'text-cuba-success' : 'text-cuba-ink-subtle' }`}>{s.label}</span>
                                    </div>
                                    {i < steps.length - 1 && (
                                        <div className={`flex-1 h-0.5 mb-5 transition-all duration-500 ${step > i ? 'bg-gradient-to-r from-cuba-success to-cuba-primary-fill' : 'bg-cuba-line'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                {/* Sandbox Banner */}
                {this.props.sandboxMode && step < 3 && (
                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-cuba-warning-soft border border-cuba-warning-soft">
                        <span className="text-base">⚡</span>
                        <span className="text-xs font-black text-cuba-warning uppercase">Sandbox Mode · </span>
                        <span className="text-xs text-cuba-warning">No real charges will be processed.</span>
                        <span className="ml-auto px-2 py-0.5 bg-cuba-warning-soft text-cuba-warning text-[10px] font-black rounded uppercase">DEMO</span>
                    </div>
                )}

                {/* ──────── STEP 0: Billing Info ──────── */}
                {step === 0 && (
                    <div className="emb-slide space-y-5">
                        <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                            <div className="w-10 h-10 bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-fill rounded-xl flex items-center justify-center shadow-md shadow-cuba-primary/25">
                                <FaGlobe className="w-4 h-4 text-cuba-on-primary" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-cuba-ink">Billing & Region</h3>
                                <p className="text-[11px] text-cuba-ink-muted">Confirm your location for accurate tax receipts</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-black text-cuba-ink uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                    <FaMapMarkerAlt className="w-2.5 h-2.5 text-cuba-primary-ink-strong" /> Country / Region *
                                </label>
                                <DropdownInput handleInputs={this.handleInput} placeholder="Select your country" checkout={true} name="Country" options={this.countries} />
                                {this.state.validationErrors['Country'] && (
                                    <p className="text-[11px] font-bold text-cuba-danger mt-1">⚠️ {this.state.validationErrors['Country']}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-black text-cuba-ink uppercase tracking-wide mb-1.5">Postal / Zip Code *</label>
                                <input type="text" placeholder="Enter postal / zip code" onChange={(e) => this.handleInput('Postal Code', e)} className={`checkout-input-emb ${this.state.validationErrors['Postal Code'] ? 'border-cuba-danger bg-cuba-danger-soft/30' : ''}`} />
                                {this.state.validationErrors['Postal Code'] && (
                                    <p className="text-[11px] font-bold text-cuba-danger mt-1">⚠️ {this.state.validationErrors['Postal Code']}</p>
                                )}
                            </div>
                        </div>

                        {this.renderInvoiceAddressFields('checkout-input-emb')}

                        {Boolean(this.state.taxConfig?.enableTax) && (
                            <div>
                                <label className="block text-xs font-black text-cuba-ink uppercase tracking-wide mb-1.5">
                                    Business {this.state.taxConfig?.taxName || 'GST'}IN <span className="text-cuba-ink-subtle font-normal normal-case">(Optional — B2B invoices)</span>
                                </label>
                                <input type="text" value={this.state.customerTaxId} onChange={(e) => this.handleInput('customerTaxId', { target: { value: e.target.value.toUpperCase().trim() } })} placeholder={`Enter ${this.state.taxConfig?.taxName || 'GST'} registration number`} className={`checkout-input-emb uppercase font-mono ${this.state.validationErrors.customerTaxId ? 'border-cuba-danger bg-cuba-danger-soft/30' : ''}`} maxLength={15} />
                                {this.state.validationErrors.customerTaxId && <p className="text-[11px] font-bold text-cuba-danger mt-1">⚠️ {this.state.validationErrors.customerTaxId}</p>}
                            </div>
                        )}

                        {Boolean(this.state.taxConfig?.enableTax) && (
                            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-cuba-info-soft border border-cuba-info-soft">
                                <FaShieldAlt className="w-3.5 h-3.5 text-cuba-info mt-0.5 shrink-0" />
                                <p className="text-xs text-cuba-info font-medium">{this.state.taxConfig?.taxName || 'GST'} @ {this.state.taxConfig?.taxRate || 0}% {this.state.taxConfig?.taxInclusive ? '(included in price)' : '(added to total)'}. Full invoice issued on payment.</p>
                            </div>
                        )}

                        <button type="button" onClick={() => this.nextStep()}
                            className="cuba-btn-primary w-full py-3.5 px-6 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]">
                            <span>Continue to Payment Method</span>
                            <FaArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* ──────── STEP 1: Payment Method ──────── */}
                {step === 1 && (
                    <div className="emb-slide space-y-4">
                        <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                            <div className="w-10 h-10 bg-gradient-to-br from-cuba-primary-fill to-cuba-danger rounded-xl flex items-center justify-center shadow-md shadow-cuba-primary/25">
                                <FaCreditCard className="w-4 h-4 text-cuba-on-primary" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-cuba-ink">Choose Payment Gateway</h3>
                                <p className="text-[11px] text-cuba-ink-muted">Select your preferred secure payment method</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {(this.props.stripeEnabled !== false && !this.props.onlyPP) && (
                                <div onClick={() => this.setState({ paymentMethod: 'creditCard' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'creditCard' ? 'border-cuba-primary bg-cuba-primary-soft/60' : 'border-cuba-line bg-cuba-card hover:border-cuba-line-strong'
                                    }`}>
                                    {paymentMethod === 'creditCard' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-cuba-primary-soft rounded-xl flex items-center justify-center shrink-0">
                                            <FaCreditCard className="w-5 h-5 text-cuba-primary-ink-strong" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-cuba-ink">Credit / Debit Card (Stripe)</h4>
                                            <p className="text-[11px] text-cuba-ink-muted">Visa, Mastercard, Amex, Discover</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <img src={VisaLogo} alt="Visa" className="h-3.5 opacity-80" />
                                                <img src={MastercardLogo} alt="MC" className="h-3.5 opacity-80" />
                                                <img src={AmexLogo} alt="Amex" className="h-3.5 opacity-80" />
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'creditCard' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'
                                        }`}>
                                            {paymentMethod === 'creditCard' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {this.props.paypalEnabled !== false && (
                                <div onClick={() => this.setState({ paymentMethod: 'paypal' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'paypal' ? 'border-cuba-warning bg-cuba-warning-soft/60' : 'border-cuba-line bg-cuba-card hover:border-cuba-line-strong'
                                    }`}>
                                    {paymentMethod === 'paypal' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cuba-warning to-cuba-warning rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-cuba-warning-soft border border-cuba-warning-soft rounded-xl flex items-center justify-center shrink-0">
                                            <img src={PayPalLogo} alt="PayPal" className="h-6 object-contain" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-cuba-ink">PayPal Express</h4>
                                            <p className="text-[11px] text-cuba-ink-muted">Fast 1-click checkout with PayPal account</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="px-1.5 py-0.5 bg-cuba-warning-soft text-cuba-warning text-[9px] font-black rounded border border-cuba-warning-soft">Buyer Protection</span>
                                                <span className="px-1.5 py-0.5 bg-cuba-warning-soft text-cuba-warning text-[9px] font-black rounded border border-cuba-warning-soft">No Card Needed</span>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'paypal' ? 'border-cuba-warning bg-cuba-warning' : 'border-cuba-line-strong'
                                        }`}>
                                            {paymentMethod === 'paypal' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {this.props.razorpayEnabled !== false && (
                                <div onClick={() => this.setState({ paymentMethod: 'razorpay' })}
                                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                        paymentMethod === 'razorpay' ? 'border-cuba-info bg-cuba-info-soft/60' : 'border-cuba-line bg-cuba-card hover:border-cuba-line-strong'
                                    }`}>
                                    {paymentMethod === 'razorpay' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cuba-info to-cuba-primary-fill rounded-t-xl" />}
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-cuba-info-soft rounded-xl flex items-center justify-center shrink-0 border border-cuba-info-soft">
                                            <span className="text-lg font-black text-cuba-info">₹</span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-xs font-black text-cuba-ink">Razorpay Express &amp; UPI</h4>
                                            <p className="text-[11px] text-cuba-ink-muted">UPI, GPay, PhonePe, Paytm, Cards &amp; NetBanking</p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="px-1.5 py-0.5 bg-cuba-info-soft text-cuba-info text-[9px] font-black rounded border border-cuba-info-soft">Instant UPI</span>
                                                <span className="px-1.5 py-0.5 bg-cuba-info-soft text-cuba-info text-[9px] font-black rounded border border-cuba-info-soft">Indian Banks</span>
                                            </div>
                                        </div>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                            paymentMethod === 'razorpay' ? 'border-cuba-info bg-cuba-info' : 'border-cuba-line-strong'
                                        }`}>
                                            {paymentMethod === 'razorpay' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Paytm Option */}
                        {this.props.paytmEnabled === true && (
                            <div onClick={() => this.setState({ paymentMethod: 'paytm' })}
                                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                    paymentMethod === 'paytm' ? 'border-cuba-info bg-cuba-info-soft/60' : 'border-cuba-line bg-cuba-card hover:border-cuba-line-strong'
                                }`}>
                                {paymentMethod === 'paytm' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cuba-info to-cuba-info rounded-t-xl" />}
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-cuba-info-soft border border-cuba-info-soft rounded-xl flex items-center justify-center shrink-0">
                                        <span className="text-base font-black text-cuba-info leading-none">Pay<br/>tm</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-xs font-black text-cuba-ink">Paytm Checkout</h4>
                                        <p className="text-[11px] text-cuba-ink-muted">Paytm Wallet, UPI, Cards &amp; NetBanking</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span className="px-1.5 py-0.5 bg-cuba-info-soft text-cuba-info text-[9px] font-black rounded border border-cuba-info-soft">Paytm Wallet</span>
                                            <span className="px-1.5 py-0.5 bg-cuba-info-soft text-cuba-info text-[9px] font-black rounded border border-cuba-info-soft">UPI</span>
                                        </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        paymentMethod === 'paytm' ? 'border-cuba-info bg-cuba-info' : 'border-cuba-line-strong'
                                    }`}>
                                        {paymentMethod === 'paytm' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* PhonePe Option */}
                        {this.props.phonepeEnabled === true && (
                            <div onClick={() => this.setState({ paymentMethod: 'phonepe' })}
                                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                                    paymentMethod === 'phonepe' ? 'border-cuba-primary bg-cuba-primary-soft/60' : 'border-cuba-line bg-cuba-card hover:border-cuba-line-strong'
                                }`}>
                                {paymentMethod === 'phonepe' && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cuba-primary-fill to-cuba-primary-fill rounded-t-xl" />}
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-cuba-primary-soft border border-cuba-primary-soft rounded-xl flex items-center justify-center shrink-0">
                                        <span className="text-[10px] font-black text-cuba-primary-ink-strong text-center leading-tight">Phone<br/>Pe</span>
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-xs font-black text-cuba-ink">PhonePe UPI &amp; Payments</h4>
                                        <p className="text-[11px] text-cuba-ink-muted">PhonePe UPI payment</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span className="px-1.5 py-0.5 bg-cuba-primary-soft text-cuba-primary-ink-strong text-[9px] font-black rounded border border-cuba-primary-soft">UPI Instant</span>
                                            <span className="px-1.5 py-0.5 bg-cuba-primary-soft text-cuba-primary-ink-strong text-[9px] font-black rounded border border-cuba-primary-soft">500M+ Users</span>
                                        </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        paymentMethod === 'phonepe' ? 'border-cuba-primary bg-cuba-primary-fill' : 'border-cuba-line-strong'
                                    }`}>
                                        {paymentMethod === 'phonepe' && <FaCheck className="w-2.5 h-2.5 text-cuba-on-primary" />}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-2">
                            <button type="button" onClick={() => this.previousStep()}
                                className="px-4 py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 hover:bg-cuba-canvas cursor-pointer">
                                <FaArrowLeft className="w-3 h-3" /><span>Back</span>
                            </button>
                            <button type="button" onClick={() => this.nextStep()} disabled={!paymentMethod}
                                className="cuba-btn-primary flex-1 py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer">
                                <span>{
                                    paymentMethod === 'creditCard' ? 'Enter Card Details' :
                                    paymentMethod === 'paypal' ? 'Pay with PayPal' :
                                    paymentMethod === 'razorpay' ? 'Pay via Razorpay / UPI' :
                                    paymentMethod === 'paytm' ? 'Pay via Paytm' :
                                    paymentMethod === 'phonepe' ? 'Pay via PhonePe' :
                                    'Continue to Payment'
                                }</span>
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
                                <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                                    <div className="w-10 h-10 bg-gradient-to-br from-cuba-success to-cuba-success rounded-xl flex items-center justify-center shadow-md shadow-cuba-success/25">
                                        <FaLock className="w-4 h-4 text-cuba-on-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-cuba-ink">Secure Card Payment</h3>
                                        <p className="text-[11px] text-cuba-ink-muted">256-bit SSL encrypted via Stripe · Card never stored</p>
                                    </div>
                                </div>

                                {/* Mini card visual */}
                                <div className="relative h-28 rounded-xl overflow-hidden bg-gradient-to-br from-cuba-night-surface-from via-cuba-night-surface-mid to-cuba-night-surface-to">
                                    <div className="absolute top-3 left-4 w-8 h-5 rounded-sm opacity-80 bg-gradient-to-br from-cuba-pill-warning-fill to-cuba-pill-warning-line"></div>
                                    <div className="absolute inset-0 flex items-end p-4">
                                        <div className="text-cuba-on-primary">
                                            <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest mb-0.5">Card Holder</p>
                                            <p className="text-xs font-black tracking-wider">{this.state.CardHolder || 'YOUR NAME'}</p>
                                        </div>
                                        <div className="ml-auto text-right text-cuba-on-primary">
                                            <p className="text-[9px] font-bold opacity-50 uppercase">Secured by Stripe</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-cuba-ink uppercase tracking-wide mb-1.5">Cardholder Name *</label>
                                    <input type="text" onChange={(e) => this.handleInput('CardHolder', e)} placeholder="Full name as on card" className="checkout-input-emb" />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-cuba-ink uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                        <FaCreditCard className="w-2.5 h-2.5 text-cuba-primary-ink-strong" /> Card Number, Expiry & CVC *
                                    </label>
                                    <div className="p-3.5 bg-cuba-canvas border-2 border-cuba-line rounded-xl focus-within:border-cuba-primary focus-within:bg-cuba-card transition-all">
                                        <CardElement options={{ style: { base: { fontSize: '14px', color: resolveCubaToken('--cuba-ink', CUBA_INK_FALLBACK), fontFamily: '"Inter", sans-serif', '::placeholder': { color: resolveCubaToken('--cuba-ink-subtle', CUBA_INK_SUBTLE_FALLBACK) }, iconColor: resolveCubaToken('--cuba-primary-fill', CUBA_PRIMARY_FALLBACK) }, invalid: { color: resolveCubaToken('--cuba-danger', CUBA_DANGER_FALLBACK), iconColor: resolveCubaToken('--cuba-danger', CUBA_DANGER_FALLBACK) } } }} />
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-cuba-success-soft border border-cuba-success-soft">
                                    <FaShieldAlt className="w-3.5 h-3.5 text-cuba-success mt-0.5 shrink-0" />
                                    <p className="text-xs text-cuba-success font-medium">PCI-DSS Level 1 · Card tokenized by Stripe · Never stored on our servers</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => this.previousStep()}
                                        className="px-4 py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl flex items-center gap-1.5 hover:bg-cuba-canvas transition-all cursor-pointer">
                                        <FaArrowLeft className="w-3 h-3" /><span>Back</span>
                                    </button>
                                    <button type="button" onClick={() => this.handleSubmit()} disabled={isLoading}
                                        className="cuba-btn-primary flex-1 py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:scale-100 cursor-pointer"
                                        >
                                        {isLoading ? (
                                            <><div className="w-4 h-4 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Processing...</span></>
                                        ) : (
                                            <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} Securely</span></>
                                        )}
                                    </button>
                                </div>
                                <p className="text-center text-[10px] text-cuba-ink-subtle flex items-center justify-center gap-1">
                                    <FaShieldAlt className="w-2.5 h-2.5" /> 30-Day Money-Back Guarantee · Cancel anytime
                                </p>
                            </>
                        ) : paymentMethod === 'paypal' ? (
                            /* PayPal embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                                    <div className="w-10 h-10 bg-gradient-to-br from-cuba-warning to-cuba-warning rounded-xl flex items-center justify-center shadow-md">
                                        <img src={PayPalLogo} alt="PayPal" className="h-4 brightness-0" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-cuba-ink">PayPal Express</h3>
                                        <p className="text-[11px] text-cuba-ink-muted">Complete your transaction securely via PayPal</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-cuba-warning-soft bg-cuba-warning-soft">
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-cuba-warning-soft/60">
                                        <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain" />
                                        <span className="text-sm font-black text-cuba-warning">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <PayPalButtonWrapper amount={price} currency={this.props.currencyCode || 'USD'} selectedPlan={this.props.selectedPlan} couponCode={this.props.couponCode} billingDetails={this.getBillingDetails()} onSuccess={this.handlePayPalSuccess} onError={this.handlePayPalError} />
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-cuba-canvas transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        ) : paymentMethod === 'razorpay' ? (
                            /* Razorpay embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                                    <div className="w-10 h-10 bg-gradient-to-br from-cuba-info to-cuba-primary-fill rounded-xl flex items-center justify-center shadow-md">
                                        <span className="text-lg font-black text-cuba-on-primary">₹</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-cuba-ink">Razorpay Express &amp; UPI</h3>
                                        <p className="text-[11px] text-cuba-ink-muted">Pay via GPay, PhonePe, Paytm, Cards or NetBanking</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-cuba-info-soft bg-cuba-info-soft">
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-cuba-info-soft/60">
                                        <span className="text-xs font-black text-cuba-info">Razorpay Secure Gateway</span>
                                        <span className="text-sm font-black text-cuba-info">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs text-cuba-info font-semibold mb-3">Instant auto-activation via UPI, GPay, PhonePe, Paytm or NetBanking</p>
                                        <button type="button" onClick={() => this.handleRazorpayPayment()} disabled={isLoading}
                                            className="cuba-btn-primary w-full py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                                            >
                                            {isLoading ? <><div className="w-4 h-4 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Launching Razorpay...</span></> : <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} via Razorpay</span></>}
                                        </button>
                                        <div className="mt-3 p-2.5 rounded-lg bg-cuba-warning-soft border border-cuba-warning-soft text-[11px] text-cuba-warning leading-snug">
                                            <span className="font-extrabold text-cuba-warning">💡 Sandbox Test Mode Tip:</span> Use test UPI ID <code className="bg-cuba-warning-soft px-1 py-0.5 rounded font-mono font-bold text-cuba-warning">success@razorpay</code> or select Test NetBanking inside the Razorpay modal.
                                        </div>
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-cuba-canvas transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        ) : paymentMethod === 'paytm' ? (
                            /* Paytm embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                                    <div className="w-10 h-10 bg-gradient-to-br from-cuba-info to-cuba-info rounded-xl flex items-center justify-center shadow-md">
                                        <span className="text-sm font-black text-cuba-on-primary leading-none">Pay<br/>tm</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-cuba-ink">Paytm Checkout</h3>
                                        <p className="text-[11px] text-cuba-ink-muted">Pay via Paytm Wallet, UPI, Cards &amp; NetBanking</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-cuba-info-soft bg-cuba-info-soft">
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-cuba-info-soft/60">
                                        <span className="text-xs font-black text-cuba-info">Paytm Secure Checkout</span>
                                        <span className="text-sm font-black text-cuba-info">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs text-cuba-info font-semibold mb-3">Instant payment via Paytm Wallet, UPI, Cards or NetBanking</p>
                                        <button type="button" onClick={() => this.handlePaytmPayment()} disabled={isLoading}
                                            className="cuba-btn-primary w-full py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                                            >
                                            {isLoading ? <><div className="w-4 h-4 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Launching Paytm...</span></> : <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} via Paytm</span></>}
                                        </button>
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-cuba-canvas transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        ) : paymentMethod === 'phonepe' ? (
                            /* PhonePe embedded */
                            <>
                                <div className="flex items-center gap-3 pb-4 border-b border-cuba-line">
                                    <div className="w-10 h-10 bg-gradient-to-br from-cuba-primary-fill to-cuba-primary-strong rounded-xl flex items-center justify-center shadow-md">
                                        <span className="text-[10px] font-black text-cuba-on-primary text-center leading-tight">Phone<br/>Pe</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-cuba-ink">PhonePe UPI &amp; Payments</h3>
                                        <p className="text-[11px] text-cuba-ink-muted">PhonePe UPI payment</p>
                                    </div>
                                </div>

                                <div className="rounded-xl overflow-hidden border border-cuba-primary-soft bg-cuba-primary-soft">
                                    <div className="px-5 py-3 flex items-center justify-between border-b border-cuba-primary-soft/60">
                                        <span className="text-xs font-black text-cuba-primary-ink-strong">PhonePe Secure Gateway</span>
                                        <span className="text-sm font-black text-cuba-primary-ink-strong">{this.props.currency}{price}</span>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-xs text-cuba-primary-ink-strong font-semibold mb-3">Instant UPI payment via PhonePe. You will be redirected to complete the transaction.</p>
                                        <button type="button" onClick={() => this.handlePhonePePayment()} disabled={isLoading}
                                            className="cuba-btn-primary w-full py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-70 cursor-pointer"
                                            >
                                            {isLoading ? <><div className="w-4 h-4 border-2 border-cuba-night-line border-t-cuba-on-primary rounded-full animate-spin" /><span>Redirecting to PhonePe...</span></> : <><FaLock className="w-3.5 h-3.5" /><span>Pay {this.props.currency}{price} via PhonePe</span></>}
                                        </button>
                                    </div>
                                </div>

                                <button type="button" onClick={() => this.previousStep()}
                                    className="w-full py-3 border-2 border-cuba-line hover:border-cuba-line-strong text-cuba-ink-muted font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 hover:bg-cuba-canvas transition-all cursor-pointer">
                                    <FaArrowLeft className="w-3 h-3" /><span>Back to Payment Method</span>
                                </button>
                            </>
                        ) : null}
                    </div>
                )}

                {/* ──────── STEP 3: Success ──────── */}
                {step === 3 && (
                    <div className="text-center space-y-6 py-4">
                        <div className="relative w-28 h-28 mx-auto emb-success">
                            <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, var(--cuba-success-soft) 0%, transparent 70%)' }}></div>
                            <View />
                            {[
                                { top: '5%', left: '0%', w: 8, bg: 'var(--cuba-primary)', delay: '0s', dur: '1.8s' },
                                { top: '15%', right: '0%', w: 7, bg: 'var(--cuba-warning)', delay: '0.3s', dur: '2s' },
                                { bottom: '5%', left: '5%', w: 6, bg: 'var(--cuba-secondary)', delay: '0.6s', dur: '1.6s' },
                                { bottom: '15%', right: '5%', w: 8, bg: 'var(--cuba-success)', delay: '0.2s', dur: '2.2s' },
                            ].map((c, i) => (
                                <div key={i} className="emb-confetti-piece" style={{
                                    top: c.top, left: c.left, right: c.right, bottom: c.bottom,
                                    width: c.w, height: c.w, background: c.bg,
                                    animationDuration: c.dur, animationDelay: c.delay,
                                }} />
                            ))}
                        </div>

                        <div className="space-y-3">
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide bg-cuba-success-soft text-cuba-success border border-cuba-success-soft">
                                <FaCheckCircle className="w-3.5 h-3.5" /> 🎉 Payment Verified & Completed
                            </span>
                            <h2 className="text-2xl font-black text-cuba-ink">Welcome to PRO Candidate Tier!</h2>
                            <p className="text-xs text-cuba-ink-muted max-w-md mx-auto leading-relaxed">
                                Your subscription is now <strong className="text-cuba-ink">instantly active</strong>. All AI tools, unlimited exports, and VIP support are fully unlocked.
                            </p>
                        </div>

                        <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${this.state.invoiceStatus === 'FAILED' ? 'border-cuba-danger-soft bg-cuba-danger-soft text-cuba-danger' : 'border-cuba-info-soft bg-cuba-info-soft text-cuba-info'}`} role={this.state.invoiceStatus === 'FAILED' ? 'alert' : 'status'}>
                            {this.state.invoiceStatus === 'GENERATED'
                                ? 'Your authoritative invoice was generated and its email notification was queued for delivery.'
                                : this.state.invoiceStatus === 'FAILED'
                                    ? this.state.invoiceError
                                    : 'Generating your authoritative invoice…'}
                        </div>

                        <div className="rounded-2xl overflow-hidden border border-cuba-line bg-gradient-to-br from-cuba-night-surface-from to-cuba-studio-to">
                            <div className="px-5 py-3 border-b border-cuba-night-line flex items-center justify-between">
                                <span className="text-xs font-black text-cuba-night-warning uppercase flex items-center gap-1.5"><FaGem className="w-3 h-3" /> Unlocked Benefits</span>
                                <span className="text-xs font-black text-cuba-night-success">✓ Active</span>
                            </div>
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {[
                                    { icon: FaMagic, text: 'Unlimited AI Resume & Cover Letters' },
                                    { icon: FaDownload, text: 'PDF, Word DocX & Portfolio Links' },
                                    { icon: FaRocket, text: 'ATS Smart Keyword Optimization' },
                                    { icon: FaHeadset, text: '24/7 Priority VIP Support' },
                                ].map(({ icon: IconComponent, text }, i) => (
                                    <div key={i} className="flex items-center gap-2.5 text-xs text-cuba-ink-subtle">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-cuba-primary-soft border border-cuba-primary-ring">
                                            <IconComponent className="w-2.5 h-2.5 text-cuba-night-primary" />
                                        </div>
                                        <span className="font-semibold">{text}</span>
                                        <FaCheck className="w-3 h-3 text-cuba-night-success ml-auto shrink-0" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <button type="button" onClick={() => { window.location.href = '/dashboard'; }}
                                className="cuba-btn-primary w-full sm:w-auto px-7 py-3.5 rounded-xl text-cuba-on-primary font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                                <FaRocket className="w-3.5 h-3.5" /><span>Go to AI Resume Builder</span>
                            </button>
                            <button type="button" onClick={() => { window.location.href = '/dashboard/plans?tab=invoices'; }}
                                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-cuba-ink font-bold text-xs border-2 border-cuba-line hover:border-cuba-line-strong flex items-center justify-center gap-2 transition-all hover:bg-cuba-canvas cursor-pointer">
                                <FaFileAlt className="w-3.5 h-3.5 text-cuba-ink-muted" /><span>View Billing History</span>
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
