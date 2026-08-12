import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import config from '../../../conf/configuration';
import { FaCreditCard, FaCheck, FaTimes, FaSpinner, FaLock, FaPaypal, FaStripe, FaEye, FaEyeSlash, FaRupeeSign } from 'react-icons/fa';

const PaymentSettings = () => {
    const [paymentsConfig, setPaymentsConfig] = useState({
        stripePublishableKey: '',
        stripeSecretKey: '',
        paypalClientId: '',
        paypalMode: 'sandbox',
        currency: 'INR',
        enableRazorpay: true,
        razorpayKeyId: '',
        razorpayKeySecret: '',
        razorpayWebhookSecret: '',
    });
    const [showSecretKey, setShowSecretKey] = useState(false);
    const [showRazorpaySecret, setShowRazorpaySecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        getSystemSettings().then((settings) => {
            const pay = (settings && settings.payments) || {};
            const hasRazorpayKey = !!(pay.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID);
            setPaymentsConfig({
                stripePublishableKey: pay.stripePublishableKey || config?.stripe_publishable_key || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
                stripeSecretKey: pay.stripeSecretKey || '',
                paypalClientId: pay.paypalClientId || config?.paypalClientID || '',
                paypalMode: pay.paypalMode || config?.paypalEnvironment || 'sandbox',
                currency: pay.currency || 'INR',
                enableRazorpay: pay.enableRazorpay !== undefined ? pay.enableRazorpay : hasRazorpayKey,
                razorpayKeyId: pay.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || '',
                razorpayKeySecret: pay.razorpayKeySecret || '',
                razorpayWebhookSecret: pay.razorpayWebhookSecret || '',
            });
            setLoading(false);
        });
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setPaymentsConfig((prev) => {
            const next = {
                ...prev,
                [name]: type === 'checkbox' ? checked : value,
            };
            if (type !== 'checkbox' && name === 'razorpayKeyId' && value.trim() !== '') {
                next.enableRazorpay = true;
            }
            return next;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('payments', paymentsConfig);
            setStatusMessage({ type: 'success', text: 'Payment gateway & Razorpay settings saved successfully!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    const handleTestStripe = async () => {
        setTesting(true);
        try {
            const response = await fetch('http://localhost:8080/api/admin/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'stripe', secretKey: paymentsConfig.stripeSecretKey })
            });
            const data = await response.json();
            if (data.success) {
                setStatusMessage({ type: 'success', text: `Stripe connection test succeeded! (${data.message})` });
            } else {
                setStatusMessage({ type: 'error', text: `Stripe test failed: ${data.error}` });
            }
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Could not reach backend: ${err.message}` });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading payment settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {statusMessage && (
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Razorpay Indian Payments */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaRupeeSign className="text-blue-600 text-lg" /> Razorpay Integration (India UPI, NetBanking & Cards)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Primary payment gateway for India supporting UPI (Google Pay, PhonePe, Paytm), RuPay Cards, and NetBanking.
                </p>

                <div className="space-y-4">
                    <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                        <input
                            type="checkbox"
                            id="enableRazorpay"
                            name="enableRazorpay"
                            checked={paymentsConfig.enableRazorpay}
                            onChange={handleChange}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <label htmlFor="enableRazorpay" className="text-sm font-semibold text-slate-800">
                            Enable Razorpay Payment Gateway & UPI Checkout
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Razorpay Key ID
                            </label>
                            <input
                                type="text"
                                name="razorpayKeyId"
                                value={paymentsConfig.razorpayKeyId}
                                onChange={handleChange}
                                placeholder="rzp_live_..."
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                Razorpay Key Secret
                            </label>
                            <div className="relative">
                                <input
                                    type={showRazorpaySecret ? "text" : "password"}
                                    name="razorpayKeySecret"
                                    value={paymentsConfig.razorpayKeySecret}
                                    onChange={handleChange}
                                    placeholder="Secret Key"
                                    className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowRazorpaySecret(!showRazorpaySecret)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                    title={showRazorpaySecret ? "Hide Secret" : "Show Secret"}
                                >
                                    {showRazorpaySecret ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stripe Settings */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaStripe className="text-indigo-600 text-xl" /> Stripe Configuration (International)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Manage your Stripe API credentials for processing international cards.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Stripe Publishable Key
                        </label>
                        <input
                            type="text"
                            name="stripePublishableKey"
                            value={paymentsConfig.stripePublishableKey}
                            onChange={handleChange}
                            placeholder="pk_test_..."
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            Stripe Secret Key
                        </label>
                        <div className="relative">
                            <input
                                type={showSecretKey ? "text" : "password"}
                                name="stripeSecretKey"
                                value={paymentsConfig.stripeSecretKey}
                                onChange={handleChange}
                                placeholder="sk_test_..."
                                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecretKey(!showSecretKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none"
                                title={showSecretKey ? "Hide Secret Key" : "Show Secret Key"}
                            >
                                {showSecretKey ? <FaEyeSlash className="w-4 h-4" /> : <FaEye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PayPal Settings */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-1">
                    <FaPaypal className="text-blue-600 text-xl" /> PayPal Express Configuration
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    Configure your PayPal API Client ID and environment for 1-click global checkout.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            PayPal Client ID
                        </label>
                        <input
                            type="text"
                            name="paypalClientId"
                            value={paymentsConfig.paypalClientId}
                            onChange={handleChange}
                            placeholder="Client ID (or 'sb' for sandbox)"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                            PayPal Environment Mode
                        </label>
                        <select
                            name="paypalMode"
                            value={paymentsConfig.paypalMode}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-slate-900"
                        >
                            <option value="sandbox">Sandbox (Testing Mode)</option>
                            <option value="live">Live (Production Environment)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Currency */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="w-full md:w-1/2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Default System Currency
                    </label>
                    <select
                        name="currency"
                        value={paymentsConfig.currency}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none font-semibold text-slate-900"
                    >
                        <option value="INR">INR (₹ - Indian Rupee)</option>
                        <option value="USD">USD ($ - US Dollar)</option>
                        <option value="EUR">EUR (€ - Euro)</option>
                        <option value="GBP">GBP (£ - British Pound)</option>
                    </select>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    onClick={handleTestStripe}
                    disabled={testing}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 flex items-center space-x-2"
                >
                    {testing ? <FaSpinner className="animate-spin text-slate-500" /> : <FaStripe className="text-indigo-600" />}
                    <span>Test Stripe API Connection</span>
                </button>

                <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md flex items-center space-x-2 shadow-sm"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Payment Settings</span>
                </button>
            </div>
        </form>
    );
};

export default PaymentSettings;
