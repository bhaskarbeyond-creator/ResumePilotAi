import React, { Component } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import conf from '../../../conf/configuration';
import { CardElement } from '@stripe/react-stripe-js';
import CheckImage from '../../../assets/check.png';
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

    // Debug the currency being passed to PayPal
    console.log('=== PayPal Button Wrapper Debug ===');
    console.log('Amount:', amount);
    console.log('Currency received:', currency);
    console.log('Currency type:', typeof currency);
    console.log('Selected plan:', selectedPlan);
    console.log('=== End PayPal Button Debug ===');

    const createOrder = (data, actions) => {
        console.log('Creating PayPal order with amount:', amount, 'currency:', currency);
        console.log('Currency type:', typeof currency, 'Currency value:', JSON.stringify(currency));
        const finalCurrency = currency || 'USD';
        console.log('Final currency being used:', finalCurrency);

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
        console.log('PayPal payment approved:', data);
        return actions.order.capture().then((details) => {
            console.log('PayPal payment captured:', details);
            onSuccess(details);
        });
    };

    const onErrorHandler = (err) => {
        console.error('PayPal Error:', err);
        onError(err);
    };

    const onCancel = (data) => {
        console.log('PayPal payment cancelled:', data);
    };

    if (isPending) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading PayPal...</span>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="text-red-600 text-center">
                    <p>Failed to load PayPal. Please check your network connection and try again.</p>
                    <button onClick={() => window.location.reload()} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Retry
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
                    height: 40,
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
            'Afghanistan',
            'Åland Islands',
            'Albania',
            'Algeria',
            'American Samoa',
            'Andorra',
            'Angola',
            'Anguilla',
            'Antigua and Barbuda',
            'Argentina',
            'Armenia',
            'Aruba',
            'Australia',
            'Austria',
            'Azerbaijan',
            'Bangladesh',
            'Barbados',
            'Bahamas',
            'Bahrain',
            'Belarus',
            'Belgium',
            'Belize',
            'Benin',
            'Bermuda',
            'Bhutan',
            'Bolivia',
            'Bosnia and Herzegovina',
            'Botswana',
            'Brazil',
            'British Indian Ocean Territory',
            'British Virgin Islands',
            'Brunei Darussalam',
            'Bulgaria',
            'Burkina Faso',
            'Burma',
            'Burundi',
            'Cambodia',
            'Cameroon',
            'Canada',
            'Cape Verde',
            'Cayman Islands',
            'Central African Republic',
            'Chad',
            'Chile',
            'China',
            'Christmas Island',
            'Cocos (Keeling) Islands',
            'Colombia',
            'Comoros',
            'Congo-Brazzaville',
            'Congo-Kinshasa',
            'Cook Islands',
            'Costa Rica',
            '$_[',
            'Croatia',
            'Curaçao',
            'Cyprus',
            'Czech Republic',
            'Denmark',
            'Djibouti',
            'Dominica',
            'Dominican Republic',
            'East Timor',
            'Ecuador',
            'El Salvador',
            'Egypt',
            'Equatorial Guinea',
            'Eritrea',
            'Estonia',
            'Ethiopia',
            'Falkland Islands',
            'Faroe Islands',
            'Federated States of Micronesia',
            'Fiji',
            'Finland',
            'France',
            'French Guiana',
            'French Polynesia',
            'French Southern Lands',
            'Gabon',
            'Gambia',
            'Georgia',
            'Germany',
            'Ghana',
            'Gibraltar',
            'Greece',
            'Greenland',
            'Grenada',
            'Guadeloupe',
            'Guam',
            'Guatemala',
            'Guernsey',
            'Guinea',
            'Guinea-Bissau',
            'Guyana',
            'Haiti',
            'Heard and McDonald Islands',
            'Honduras',
            'Hong Kong',
            'Hungary',
            'Iceland',
            'India',
            'Indonesia',
            'Iraq',
            'Ireland',
            'Isle of Man',
            'Israel',
            'Italy',
            'Jamaica',
            'Japan',
            'Jersey',
            'Jordan',
            'Kazakhstan',
            'Kenya',
            'Kiribati',
            'Kuwait',
            'Kyrgyzstan',
            'Laos',
            'Latvia',
            'Lebanon',
            'Lesotho',
            'Liberia',
            'Libya',
            'Liechtenstein',
            'Lithuania',
            'Luxembourg',
            'Macau',
            'Macedonia',
            'Madagascar',
            'Malawi',
            'Malaysia',
            'Maldives',
            'Mali',
            'Malta',
            'Marshall Islands',
            'Martinique',
            'Mauritania',
            'Mauritius',
            'Mayotte',
            'Mexico',
            'Moldova',
            'Monaco',
            'Mongolia',
            'Montenegro',
            'Montserrat',
            'Morocco',
            'Mozambique',
            'Namibia',
            'Nauru',
            'Nepal',
            'Netherlands',
            'New Caledonia',
            'New Zealand',
            'Nicaragua',
            'Niger',
            'Nigeria',
            'Niue',
            'Norfolk Island',
            'Northern Mariana Islands',
            'Norway',
            'Oman',
            'Pakistan',
            'Palau',
            'Panama',
            'Papua New Guinea',
            'Paraguay',
            'Peru',
            'Philippines',
            'Pitcairn Islands',
            'Poland',
            'Portugal',
            'Puerto Rico',
            'Qatar',
            'Réunion',
            'Romania',
            'Russia',
            'Rwanda',
            'Saint Barthélemy',
            'Saint Helena',
            'Saint Kitts and Nevis',
            'Saint Lucia',
            'Saint Martin',
            'Saint Pierre and Miquelon',
            'Saint Vincent',
            'Samoa',
            'San Marino',
            'São Tomé and Príncipe',
            'Saudi Arabia',
            'Senegal',
            'Serbia',
            'Seychelles',
            'Sierra Leone',
            'Singapore',
            'Sint Maarten',
            'Slovakia',
            'Slovenia',
            'Solomon Islands',
            'Somalia',
            'South Africa',
            'South Georgia',
            'South Korea',
            'Spain',
            'Sri Lanka',
            'Sudan',
            'Suriname',
            'Svalbard and Jan Mayen',
            'Sweden',
            'Swaziland',
            'Switzerland',
            'Syria',
            'Taiwan',
            'Tajikistan',
            'Tanzania',
            'Thailand',
            'Togo',
            'Tokelau',
            'Tonga',
            'Trinidad and Tobago',
            'Tunisia',
            'Turkey',
            'Turkmenistan',
            'Turks and Caicos Islands',
            'Tuvalu',
            'Uganda',
            'Ukraine',
            'United Arab Emirates',
            'United Kingdom',
            'United States',
            'Uruguay',
            'Uzbekistan',
            'Vanuatu',
            'Vatican City',
            'Vietnam',
            'Venezuela',
            'Wallis and Futuna',
            'Western Sahara',
            'Yemen',
            'Zambia',
            'Zimbabwe',
        ];
        this.state = {
            step: 0,
            isLoading: false,
            postalCode: '',
            country: '',
            cardHolder: '',
            address: '',
            paymentMethod: 'creditCard', // Default to credit card
        };
        this.nextStep = this.nextStep.bind(this);
        this.previousStep = this.previousStep.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleInput = this.handleInput.bind(this);
        this.handlePayPalSuccess = this.handlePayPalSuccess.bind(this);
        this.handlePayPalError = this.handlePayPalError.bind(this);
    }

    handleInput(name, event) {
        switch (name) {
            case 'Postal':
                this.setState({
                    postalCode: event.target.value,
                });
                break;
            case 'Country':
                this.setState({
                    country: event.target.value,
                });
                break;
            case 'CardHolder':
                this.setState({
                    cardHolder: event.target.value,
                });
                break;
            case 'Address':
                this.setState({
                    address: event.target.value,
                });
                break;
            default:
                break;
        }
    }

    handleSubmit = async () => {
        const { stripe, elements } = this.props;
        if (!stripe || !elements) {
            return;
        }
        this.setState({ isLoading: true });

        const currentUser = this.context;
        if (!currentUser) {
            console.error('User not authenticated. Cannot process payment.');
            alert(this.props.t('billing.error.login'));
            this.setState({ isLoading: false });
            return;
        }
        const uid = currentUser.uid;

        try {
            const res = await axios.post(conf.provider + '://' + conf.backendUrl + '/api/pay', {
                price:
                    this.props.selectedPlan == 'monthly'
                        ? this.props.monthly
                        : this.props.selectedPlan == 'halfYear'
                        ? this.props.quartarly
                        : this.props.selectedPlan == 'yearly'
                        ? this.props.yearly
                        : 0,
            });
            const clientSecret = res.data['client_secret'];
            const time = res.data['server_time'];
            const result = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: elements.getElement(CardElement),
                    billing_details: {
                        name: this.state.cardHolder,
                    },
                },
            });
            if (result.error) {
                alert(this.props.t('billing.error.payment') + ': ' + result.error.message);
                console.log(result.error.message);
            } else {
                if (result.paymentIntent.status === 'succeeded') {
                    console.log('Adding subscription for user ID:', uid);

                    const price =
                        this.props.selectedPlan == 'monthly'
                            ? this.props.monthly
                            : this.props.selectedPlan == 'halfYear'
                            ? this.props.quartarly
                            : this.props.selectedPlan == 'yearly'
                            ? this.props.yearly
                            : 0;

                    // Track successful subscription purchase
                    trackSubscription(this.props.selectedPlan, price);
                    trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, price);
                    trackEngagement('purchase_completed', {
                        plan_type: this.props.selectedPlan,
                        payment_method: 'Stripe',
                        amount: price,
                        user_id: uid,
                    });

                    addSbs(this.props.selectedPlan, 'Visa', new Date(time).toDateString(), price, uid);
                    this.setState({ step: 3 });
                }
            }
        } catch (error) {
            console.error('Payment processing error:', error);
            alert(this.props.t('billing.error.general'));
        } finally {
            this.setState({ isLoading: false });
        }
    };

    // PayPal Success Handler
    handlePayPalSuccess = (details) => {
        const currentUser = this.context;
        if (!currentUser) {
            console.error('User not authenticated. Cannot process PayPal payment.');
            alert(this.props.t('billing.error.login'));
            return;
        }
        const uid = currentUser.uid;

        console.log('PayPal payment successful:', details);
        console.log('Adding PayPal subscription for user ID:', uid);

        const price =
            this.props.selectedPlan == 'monthly' ? this.props.monthly : this.props.selectedPlan == 'halfYear' ? this.props.quartarly : this.props.selectedPlan == 'yearly' ? this.props.yearly : 0;

        // Track successful PayPal subscription purchase
        trackSubscription(this.props.selectedPlan, price);
        trackEvent('subscription_purchase', 'Billing', this.props.selectedPlan, price);
        trackEngagement('purchase_completed', {
            plan_type: this.props.selectedPlan,
            payment_method: 'PayPal',
            amount: price,
            user_id: uid,
        });

        // Add subscription to database
        addSbs(this.props.selectedPlan, 'PayPal', new Date().toDateString(), price, uid);

        // Move to success step
        this.setState({ step: 3 });
    };

    // PayPal Error Handler
    handlePayPalError = (error) => {
        console.error('PayPal payment failed:', error);
        alert(this.props.t('billing.error.paypal', 'PayPal payment failed. Please try again.'));
    };

    nextStep() {
        this.setState((prevStat, props) => ({
            step: prevStat.step + 1,
        }));
    }

    previousStep() {
        this.setState((prevStat, props) => ({
            step: prevStat.step - 1,
        }));
    }

    renderSecurityBadges() {
        const { t } = this.props;
        return (
            <div className="py-4 border-t border-gray-100 space-y-4">
                {/* Payment Methods */}
                <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3">{t('checkout.paymentMethods', 'We accept')}</p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                        <img src={VisaLogo} alt="Visa" className="h-6 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={MastercardLogo} alt="Mastercard" className="h-6 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={AmexLogo} alt="American Express" className="h-6 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={PayPalLogo} alt="PayPal" className="h-6 opacity-80 hover:opacity-100 transition-opacity" />
                        <img src={JCBLogo} alt="JCB" className="h-6 opacity-80 hover:opacity-100 transition-opacity" />
                    </div>
                </div>
                
                {/* Security Badges */}
                <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 1L5 6v3.5c0 3.45 2.55 6.5 5 6.5s5-3.05 5-6.5V6l-5-5zM8 10l2 2 4-4-1.5-1.5L10 9l-.5-.5L8 10z" clipRule="evenodd" />
                        </svg>
                        <span>{t('checkout.security.sslSecured', 'SSL Secured')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-4 1 1-4 .257-.257A6 6 0 1118 8zm-6-2a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                        </svg>
                        <span>{t('checkout.security.encryption', '256-bit Encryption')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{t('checkout.security.pciCompliant', 'PCI Compliant')}</span>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        const { t } = this.props;

        // Debug currency props
        console.log('Checkout props.currency:', this.props.currency);
        console.log('Checkout props.currencyCode:', this.props.currencyCode);

        const price = this.props.selectedPlan == 'monthly' ? this.props.monthly : this.props.selectedPlan == 'halfYear' ? this.props.quartarly : this.props.yearly;

        const stepTitles = [
            t('checkout.steps.billingInfo', 'Billing Information'),
            t('checkout.steps.paymentMethod', 'Payment Method'),
            t('checkout.steps.cardDetails', 'Card Details'),
            t('checkout.steps.confirmation', 'Confirmation'),
        ];

        return (
            <div className="min-h-screen bg-gray-50 py-8">
                <div className="max-w-6xl mx-auto px-4">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('checkout.title', 'Complete Your Purchase')}</h1>
                        <p className="text-gray-600">{t('checkout.secureCheckout', 'Secure checkout powered by Stripe and PayPal')}</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between max-w-2xl mx-auto">
                            {stepTitles.map((title, index) => (
                                <div key={index} className="flex items-center">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                                                this.state.step >= index
                                                    ? 'bg-blue-600 text-white'
                                                    : this.state.step === index - 1
                                                    ? 'bg-blue-100 text-blue-600 border-2 border-blue-600'
                                                    : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            {this.state.step > index ? (
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                            ) : (
                                                index + 1
                                            )}
                                        </div>
                                        <span className={`mt-2 text-xs font-medium transition-colors duration-300 ${this.state.step >= index ? 'text-blue-600' : 'text-gray-500'}`}>{title}</span>
                                    </div>
                                    {index < stepTitles.length - 1 && (
                                        <div className={`w-16 h-1 mx-4 rounded-full transition-all duration-300 ${this.state.step > index ? 'bg-blue-600' : 'bg-gray-200'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-5 gap-8">
                        {/* Order Summary - Sticky Sidebar */}
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 sticky top-8">
                                <div className="p-6 border-b border-gray-100">
                                    <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('checkout.orderSummary.title', 'Order Summary')}</h2>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">{t('checkout.orderSummary.plan', 'Plan')}</span>
                                            <span className="font-medium capitalize">{this.props.selectedPlan} Subscription</span>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">{t('checkout.orderSummary.billingCycle', 'Billing Cycle')}</span>
                                            <span className="font-medium">
                                                {this.props.selectedPlan === 'monthly'
                                                    ? t('plans.monthly', 'Monthly')
                                                    : this.props.selectedPlan === 'halfYear'
                                                    ? 'Every 6 months'
                                                    : t('plans.yearly', 'Yearly')}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">{t('checkout.orderSummary.subtotal', 'Subtotal')}</span>
                                            <span className="font-medium">
                                                {this.props.currency}
                                                {price}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">{t('checkout.orderSummary.tax', 'Tax')}</span>
                                            <span className="font-medium">{t('checkout.orderSummary.taxCalculated', 'Calculated at checkout')}</span>
                                        </div>

                                        <hr className="my-3" />

                                        <div className="flex justify-between items-center text-lg font-bold">
                                            <span>{t('checkout.orderSummary.total', 'Total')}</span>
                                            <span className="text-blue-600">
                                                {this.props.currency}
                                                {price}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Security & Support */}
                                <div className="p-6">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                            <span>{t('checkout.security.moneyBack', '30-day money-back guarantee')}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
                                            </svg>
                                            <span>{t('checkout.security.support', '24/7 customer support')}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                            <span>{t('checkout.security.cancelAnytime', 'Cancel anytime')}</span>
                                        </div>
                                    </div>
                                </div>

                          

                                {this.renderSecurityBadges()}
                            </div>
                        </div>

                        {/* Main Checkout Form */}
                        <div className="lg:col-span-3">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                                <div className="p-8">
                                    {/* Step 0: Billing Information */}
                                    {this.state.step === 0 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('checkout.billingForm.title', 'Billing Information')}</h2>
                                                <p className="text-gray-600">{t('checkout.billingForm.description', 'We need this information to process your payment and send you receipts.')}</p>
                                            </div>

                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('checkout.billingForm.countryLabel', 'Country/Region *')}</label>
                                                    <DropdownInput
                                                        handleInputs={this.handleInput}
                                                        placeholder={t('checkout.billingForm.countryPlaceholder', 'Select your country')}
                                                        checkout={true}
                                                        title="Country"
                                                        options={this.countries}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('checkout.billingForm.postalLabel', 'Postal Code *')}</label>
                                                    <SimpleInput handleInputs={this.handleInput} title="Postal Code" checkout={true} />
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-gray-100">
                                                <button
                                                    onClick={() => this.nextStep()}
                                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2">
                                                    {t('checkout.billingForm.continueButton', 'Continue to Payment Method')}
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 1: Payment Method */}
                                    {this.state.step === 1 && (
                                        <div className="space-y-6">
                                            <div>
                                                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('checkout.paymentMethod.title', 'Payment Method')}</h2>
                                                <p className="text-gray-600">{t('checkout.paymentMethod.description', "Choose how you'd like to pay.")}</p>
                                            </div>

                                            <div className="space-y-4">
                                                <div
                                                    className={`flex items-center justify-between p-4 border ${
                                                        this.state.paymentMethod === 'creditCard' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                                    } rounded-lg cursor-pointer`}
                                                    onClick={() => this.setState({ paymentMethod: 'creditCard' })}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-8 bg-gray-100 rounded-md flex items-center justify-center">
                                                            <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                                                <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v1H4V6zm0 3h12v5H4V9z" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium text-gray-900">{t('checkout.paymentMethod.cardTitle', 'Credit / Debit Card')}</h3>
                                                            <p className="text-sm text-gray-500">{t('checkout.paymentMethod.cardDescription', 'Visa, Mastercard, American Express')}</p>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={`w-5 h-5 rounded-full ${
                                                            this.state.paymentMethod === 'creditCard' ? 'bg-blue-500' : 'border border-gray-300'
                                                        } flex items-center justify-center`}>
                                                        {this.state.paymentMethod === 'creditCard' && (
                                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path
                                                                    fillRule="evenodd"
                                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                    clipRule="evenodd"
                                                                />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>

                                                <div
                                                    className={`flex items-center justify-between p-4 border ${
                                                        this.state.paymentMethod === 'paypal' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                                    } rounded-lg cursor-pointer`}
                                                    onClick={() => this.setState({ paymentMethod: 'paypal' })}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-8 bg-gray-100 rounded-md flex items-center justify-center">
                                                            <img src={PayPalLogo} alt="PayPal" className="h-5 object-contain" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium text-gray-900">{t('checkout.paymentMethod.paypalTitle', 'PayPal')}</h3>
                                                            <p className="text-sm text-gray-500">{t('checkout.paymentMethod.paypalDescription', 'Pay with your PayPal account')}</p>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className={`w-5 h-5 rounded-full ${
                                                            this.state.paymentMethod === 'paypal' ? 'bg-blue-500' : 'border border-gray-300'
                                                        } flex items-center justify-center`}>
                                                        {this.state.paymentMethod === 'paypal' && (
                                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path
                                                                    fillRule="evenodd"
                                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                    clipRule="evenodd"
                                                                />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-gray-100 flex items-center gap-4">
                                                <button onClick={() => this.previousStep()} className="text-gray-600 hover:text-gray-900 font-semibold flex items-center gap-1">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                    </svg>
                                                    {t('checkout.navigation.back', 'Back')}
                                                </button>

                                                <button
                                                    onClick={() => this.nextStep()}
                                                    disabled={!this.state.paymentMethod}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2">
                                                    {this.state.paymentMethod === 'creditCard'
                                                        ? t('checkout.paymentMethod.continueToCard', 'Continue to Card Details')
                                                        : t('checkout.paymentMethod.continueWithPaypal', 'Continue with PayPal')}
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 2: Payment Details */}
                                    {this.state.step === 2 && (
                                        <div className="space-y-6">
                                            {this.state.paymentMethod === 'creditCard' ? (
                                                // Credit Card Form
                                                <>
                                                    <div>
                                                        <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('checkout.cardForm.title', 'Card Information')}</h2>
                                                        <p className="text-gray-600">{t('checkout.cardForm.description', 'Your payment information is encrypted and secure.')}</p>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('checkout.cardForm.cardholderLabel', 'Cardholder Name *')}</label>
                                                            <input
                                                                onChange={(event) => this.handleInput('CardHolder', event)}
                                                                placeholder={t('checkout.cardForm.cardholderPlaceholder', 'Enter the name on your card')}
                                                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('checkout.cardForm.addressLabel', 'Billing Address *')}</label>
                                                            <input
                                                                onChange={(event) => this.handleInput('Address', event)}
                                                                placeholder={t('checkout.cardForm.addressPlaceholder', 'Enter your billing address')}
                                                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('checkout.cardForm.cardDetailsLabel', 'Card Details *')}</label>
                                                            <div className="p-4 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-colors bg-white">
                                                                <CardElement
                                                                    options={{
                                                                        style: {
                                                                            base: {
                                                                                fontSize: '16px',
                                                                                color: '#374151',
                                                                                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                                                                '::placeholder': { color: '#9CA3AF' },
                                                                                iconColor: '#6B7280',
                                                                            },
                                                                            invalid: {
                                                                                color: '#DC2626',
                                                                                iconColor: '#DC2626',
                                                                            },
                                                                        },
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                        <div className="flex items-start gap-3">
                                                            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                                <path
                                                                    fillRule="evenodd"
                                                                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                                                    clipRule="evenodd"
                                                                />
                                                            </svg>
                                                            <div>
                                                                <h4 className="font-medium text-blue-900">{t('checkout.security.securePaymentTitle', 'Your payment is secure')}</h4>
                                                                <p className="text-blue-800 text-sm mt-1">
                                                                    {t(
                                                                        'checkout.security.securePaymentDescription',
                                                                        'We use industry-standard encryption to protect your card information. Your data is never stored on our servers.'
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="pt-6 border-t border-gray-100 flex gap-4">
                                                        <button
                                                            onClick={() => this.previousStep()}
                                                            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                            </svg>
                                                            {t('checkout.navigation.backToPayment', 'Back to Payment')}
                                                        </button>
                                                        <button
                                                            onClick={() => this.handleSubmit()}
                                                            disabled={this.state.isLoading}
                                                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2">
                                                            {this.state.isLoading ? (
                                                                <>
                                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                                                    {t('checkout.cardForm.processing', 'Processing...')}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path
                                                                            fillRule="evenodd"
                                                                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                                                            clipRule="evenodd"
                                                                        />
                                                                    </svg>
                                                                    {t('checkout.cardForm.completePayment', 'Complete Payment')} ({this.props.currency}
                                                                    {price})
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                // PayPal Form
                                                <>
                                                    <div>
                                                        <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('checkout.paypal.title', 'PayPal Payment')}</h2>
                                                        <p className="text-gray-600">{t('checkout.paypal.description', 'Complete your payment securely with PayPal.')}</p>
                                                    </div>

                                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                                                        <div className="flex items-start gap-3 mb-4">
                                                            <img src={PayPalLogo} alt="PayPal" className="h-8 object-contain" />
                                                            <div>
                                                                <h4 className="font-medium text-yellow-900">{t('checkout.paypal.secureTitle', 'Secure PayPal Payment')}</h4>
                                                                <p className="text-yellow-800 text-sm mt-1">
                                                                    {t('checkout.paypal.secureDescription', 'You will be redirected to PayPal to complete your payment securely.')}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <PayPalButtonWrapper
                                                            amount={price}
                                                            currency={this.props.currencyCode || 'USD'}
                                                            selectedPlan={this.props.selectedPlan}
                                                            onSuccess={this.handlePayPalSuccess}
                                                            onError={this.handlePayPalError}
                                                        />
                                                    </div>

                                                    <div className="pt-6 border-t border-gray-100">
                                                        <button
                                                            onClick={() => this.previousStep()}
                                                            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-4 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2">
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                            </svg>
                                                            {t('checkout.navigation.backToPayment', 'Back to Payment Method')}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Step 3: Success */}
                                    {this.state.step === 3 && (
                                        <div className="text-center space-y-8 py-8">
                                            <div className="w-24 h-24 mx-auto">
                                                <>{View}</>
                                            </div>

                                            <div>
                                                <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('checkout.success.title', 'Payment Successful!')}</h2>
                                                <p className="text-gray-600 text-lg mb-2">{t('checkout.success.message', 'Thank you for your purchase. Your subscription is now active.')}</p>
                                                <p className="text-gray-500">
                                                    {t('checkout.success.emailConfirmation', "You'll receive a confirmation email shortly with your receipt and subscription details.")}
                                                </p>
                                            </div>

                                            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                                                <div className="flex items-center justify-center gap-3 text-green-800">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                                        <path
                                                            fillRule="evenodd"
                                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                            clipRule="evenodd"
                                                        />
                                                    </svg>
                                                    <span className="font-semibold">{t('checkout.success.activeSubscription', 'Your subscription is now active')}</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    window.location.href = window.location.pathname + '/';
                                                }}
                                                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200">
                                                {t('checkout.success.continueToDashboard', 'Continue to Dashboard')}
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
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
