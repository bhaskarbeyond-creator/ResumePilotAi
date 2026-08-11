import React, { Component } from 'react';
import Logo from '../../../assets/logo/logo.png';
import conf from '../../../conf/configuration';

import './Plans.scss';
import '../../CustomPage/CustomPage.scss';
import { getPageByName, getPages, getWebsiteDetails, getSocialLinks, getWebsiteData, getSubscriptionStatus } from '../../../firestore/dbOperations';
import Checkout from './Checkout';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, ElementsConsumer } from '@stripe/react-stripe-js';
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import { Link } from 'react-router-dom';
import { withTranslation } from 'react-i18next';
import { AuthContext } from '../../../main'; // Import AuthContext
import HomepagePricing from '../../Dashboard2/elements/HomepagePricing';
import { trackEvent, trackEngagement } from '../../../utils/ga4';
import i18n from '../../../i18n';
import HomepageFooter from '../../Dashboard2/elements/HomepageFooter';
import HomepageNavbar from '../../Dashboard2/elements/HomepageNavbar';

class Billing extends Component {
    static contextType = AuthContext; // Set contextType to AuthContext
    constructor(props) {
        super(props);
        this.state = {
            pages: [],
            websiteName: '',
            websiteDescription: '',
            pageContent: '',
            socialLinks: null,
            step: 0,
            monthly: null,
            quartarly: null,
            yearly: null,
            selectedPlan: null,
            isLoading: true,
            onlyPP: false,
            currency: '',
        };
        this.customStyles = this.customStyles.bind(this);
        this.nextStep = this.nextStep.bind(this);
        this.previousStep = this.previousStep.bind(this);
        this.customStyles();
        this.stripePromise = (conf.stripe_publishable_key && conf.stripe_publishable_key.trim())
            ? loadStripe(conf.stripe_publishable_key.trim())
            : Promise.resolve(null);
    }

    // Helper function to convert currency symbols to proper currency codes
    getCurrencyCode(currency) {
        if (!currency) return 'USD'; // Default to USD if no currency provided

        // Convert common currency symbols to ISO currency codes
        const currencyMap = {
            $: 'USD',
            '€': 'EUR',
            '£': 'GBP',
            '¥': 'JPY',
            '₹': 'INR',
            C$: 'CAD',
            A$: 'AUD',
            CHF: 'CHF',
            USD: 'USD',
            EUR: 'EUR',
            GBP: 'GBP',
            JPY: 'JPY',
            INR: 'INR',
            CAD: 'CAD',
            AUD: 'AUD',
        };

        return currencyMap[currency] || 'USD'; // Default to USD if currency not found
    }

    nextStep(plan) {
        // Track plan selection
        trackEvent('plan_selected', 'Billing', plan, 1);
        trackEngagement('checkout_started', {
            plan_type: plan,
            step: 'plan_selection',
        });

        this.setState((prevState) => ({
            step: prevState.step + 1,
            selectedPlan: plan,
        }));
    }
    previousStep() {
        this.setState((prevState) => ({
            step: prevState.step - 1,
        }));
    }
    // Giving the proper styling for custom pages
    customStyles() {
        const rootEl = document.getElementById('root');
        if (rootEl) {
            rootEl.style.overflow = 'unset';
        }
    }
    componentDidMount() {
        // Track page view for billing page
        trackEvent('page_view', 'Billing', 'Plans page visited');

        getPages().then((value) => this.setState({ pages: value }));
        getWebsiteData().then((value) => {
            value !== null &&
                this.setState({
                    websiteName: value.title,
                    websiteDescription: value.description,
                });
        });
        getSocialLinks().then((value) => {
            value !== null && this.setState({ socialLinks: value });
        });
        getSubscriptionStatus().then((data) => {
            this.setState({
                monthly: data.monthlyPrice,
                quartarly: data.quartarlyPrice,
                yearly: data.yearlyPrice,
                onlyPP: data.onlyPP,
                currency: data.currency,
            });
        });

        // Log user status from context
        console.log('User in Plans.js:', this.context);
    }
    componentWillMount() {
        // Check which language
        if (localStorage.getItem('language')) {
            this.handleLanguageClick(localStorage.getItem('language'));
        } else {
            // this.handleLanguageClick('en')
        }
    }
    // Handle language click
    handleLanguageClick(language) {
        i18n.changeLanguage(language);
        this.setState({ language: language });
        localStorage.setItem('language', language);
    }

    // function to render the navbar

    renderNavbar() {
        const { t } = this.props;
        return (
            <div className="custom-page__nav">
                <a>
                    <img className="custom-page__nav__logo" src={Logo} />
                </a>
                <ul className="custom-page__navlinks">
                    <li>
                        {' '}
                        <Link className="custom-page__navlinks" to={{ pathname: '/' }}>
                            {t('billing.navbar.home')}
                        </Link>{' '}
                    </li>
                    {this.state.pages !== null &&
                        this.state.pages.map((value, index) => {
                            return (
                                <li key={index}>
                                    {' '}
                                    <Link className="custom-page__navlinks" to={{ pathname: '/p/' + value.id }}>
                                        {value.id}
                                    </Link>{' '}
                                </li>
                            );
                        })}
                    <li>
                        {' '}
                        <Link className="custom-page__navlinks" to={{ pathname: '/contact' }}>
                            {t('billing.navbar.contact')}
                        </Link>{' '}
                    </li>
                </ul>
                <div className="custom-page__nav__action">
                    <Link to={{ pathname: '/' }}>{t('billing.navbar.home')}</Link>
                </div>
            </div>
        );
    }
    render() {
        const { t } = this.props;

        // Get the converted currency code first
        const convertedCurrency = this.getCurrencyCode(this.state.currency);

        const paypalClientId = (this.state.paypalClientID || conf.paypalClientID || import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb').trim();

        // PayPal configuration options
        const paypalOptions = {
            'client-id': paypalClientId || 'sb',
            currency: convertedCurrency,
            intent: 'capture',
            'disable-funding': 'credit,card',
        };

        const isEmbeddedInDashboard = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard');

        return (
            <PayPalScriptProvider options={paypalOptions} deferLoading={false}>
                <Elements stripe={this.stripePromise}>
                    <div className={isEmbeddedInDashboard ? "p-4 sm:p-8 space-y-6" : "custom-page"}>
                        {/* Render Navbar only if outside dashboard */}
                        {!isEmbeddedInDashboard && <HomepageNavbar user={this.props.user} />}

                        {/* Page Content */}
                        <div className="custom-page__content w-full">
                            {isEmbeddedInDashboard && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                                    <div>
                                        <h1 className="text-xl font-bold text-slate-900">Subscription &amp; Billing Plans</h1>
                                        <p className="text-xs text-slate-500 mt-1">Upgrade your tier for unlimited AI resume builds, cover letters &amp; job tracking tools.</p>
                                    </div>
                                    <a href="/dashboard/settings" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all self-start sm:self-auto">
                                        ← Back to Settings
                                    </a>
                                </div>
                            )}

                            <div className="custom-page__Plans w-full">
                                {this.state.step == 0 && (
                                    <HomepagePricing nextStep={this.nextStep} />
                                )}
                                {this.state.step == 1 && (
                                    <ElementsConsumer>
                                        {({ stripe, elements }) => (
                                            <Checkout
                                                currency={this.state.currency}
                                                currencyCode={this.getCurrencyCode(this.state.currency)}
                                                onlyPP={this.state.onlyPP}
                                                previousStep={this.previousStep}
                                                stripe={stripe}
                                                elements={elements}
                                                monthly={this.state.monthly}
                                                quartarly={this.state.quartarly}
                                                yearly={this.state.yearly}
                                                selectedPlan={this.state.selectedPlan}
                                            />
                                        )}
                                    </ElementsConsumer>
                                )}
                            </div>
                        </div>
                        {/* Page Footer only if outside dashboard */}
                        {!isEmbeddedInDashboard && <HomepageFooter />}
                    </div>
                </Elements>
            </PayPalScriptProvider>
        );
    }
}

const MyComponent = withTranslation('common')(Billing);
export default MyComponent;
