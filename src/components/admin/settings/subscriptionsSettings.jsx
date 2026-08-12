import React, { Component } from 'react';
import { getSubscriptionStatus, setSubscriptionsData, getAllCouponsAdmin, saveCoupon, deleteCoupon, getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe, FaFlask, FaShieldAlt, FaTag, FaPlus, FaTrash, FaEdit, FaCalendarAlt, FaPercent } from 'react-icons/fa';

class SubscriptionSetting extends Component {
    constructor(props) {
        super(props);
        this.state = {
            websiteTitle: '',
            checkedSubscriptions: true,
            checkedOnlyPP: false,
            checkedRazorpayUPI: true,
            checkedStripe: true,
            checkedPayPal: true,
            checkedRazorpay: true,
            sandboxMode: false,
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            currency: 'INR',
            isSuccessOpen: false,

            // Payment Gateway API Credentials State
            razorpayKeyId: 'rzp_test_TOnviD5XeHLE0y',
            razorpayKeySecret: 'ERtqc12PbwXNyou8ITu0Ekqp',
            stripePublishableKey: '',
            stripeSecretKey: '',
            paypalClientId: '',
            paypalClientSecret: '',

            // Sales Tax & GST Config State
            enableTax: true,
            taxName: 'GST',
            taxRate: 18,
            taxInclusive: false,
            companyTaxId: '27AAAAA0000A1Z5',
            requireCustomerTaxId: false,
            receiptTemplate: 'modern',

            // Coupon Management Admin State
            couponsList: [],
            showCouponModal: false,
            enableCouponsModule: true,
            editingCode: null,
            couponForm: {
                code: '',
                discount: 20,
                description: '',
                expiryDate: '',
                maxUses: 0,
                singleUsePerUser: false,
                active: true,
            },
            couponSuccessMsg: '',
            couponErrorMsg: '',
            deleteConfirmCode: null,
            isDeleting: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleSubscriptionToggleChange = this.handleSubscriptionToggleChange.bind(this);
        this.handlePPCheckedChange = this.handlePPCheckedChange.bind(this);
        this.handleRazorpayToggle = this.handleRazorpayToggle.bind(this);
        this.handleStripeToggle = this.handleStripeToggle.bind(this);
        this.handlePayPalToggle = this.handlePayPalToggle.bind(this);
        this.handleSandboxToggle = this.handleSandboxToggle.bind(this);
        this.submitHandler = this.submitHandler.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.applyIndianPreset = this.applyIndianPreset.bind(this);
        this.fetchAdminCoupons = this.fetchAdminCoupons.bind(this);
        this.handleOpenNewCoupon = this.handleOpenNewCoupon.bind(this);
        this.handleEditCoupon = this.handleEditCoupon.bind(this);
        this.handleSaveCouponForm = this.handleSaveCouponForm.bind(this);
        this.handleToggleCouponStatus = this.handleToggleCouponStatus.bind(this);
        this.handleDeleteCouponCode = this.handleDeleteCouponCode.bind(this);
        this.confirmDeleteCouponCode = this.confirmDeleteCouponCode.bind(this);
        this.previewTemplate = this.previewTemplate.bind(this);
    }

    handleChange(event, inputName) {
        switch (inputName) {
            case 'monthly':
                this.setState({ monthlyPrice: event.target.value });
                break;
            case 'quartarly':
                this.setState({ quartarlyPrice: event.target.value });
                break;
            case 'yearly':
                this.setState({ yearlyPrice: event.target.value });
                break;
            case 'currency':
                this.setState({ currency: event.target.value });
                break;
            default:
                break;
        }
    }

    handleSubscriptionToggleChange() {
        this.setState((prevState) => ({ checkedSubscriptions: !prevState.checkedSubscriptions }));
    }

    previewTemplate(templateId) {
        const printWindow = window.open('', '_blank');
        const activeTemplate = templateId || 'modern';

        const sampleTxn = {
            transactionId: 'TXN_2026_SAMPLE_9981',
            date: new Date().toISOString(),
            planType: 'VIP Pro Yearly Subscription',
            paimentType: 'Credit Card / Stripe',
            price: '499.00',
            subtotal: '422.88',
            taxAmount: '76.12',
            taxRate: 18,
            taxName: this.state.taxName || 'GST',
            companyTaxId: this.state.companyTaxId || '27AAAAA0000A1Z5',
            customerTaxId: '07AAPCB1234E1Z0',
            currency: this.state.currency || 'INR',
            status: 'COMPLETED',
        };

        const { taxName, taxRate, subtotal, taxAmount, totalPrice, companyTaxId, customerTaxId, currency, status } = {
            taxName: sampleTxn.taxName,
            taxRate: sampleTxn.taxRate,
            subtotal: sampleTxn.subtotal,
            taxAmount: sampleTxn.taxAmount,
            totalPrice: sampleTxn.price,
            companyTaxId: sampleTxn.companyTaxId,
            customerTaxId: sampleTxn.customerTaxId,
            currency: sampleTxn.currency,
            status: sampleTxn.status,
        };

        let templateStyles = '';
        let headerHtml = '';

        if (activeTemplate === 'classic') {
            templateStyles = `
                body { font-family: Georgia, 'Times New Roman', serif; margin: 40px; color: #000; line-height: 1.4; }
                .header { border-bottom: 3px double #000; padding-bottom: 12px; margin-bottom: 24px; text-align: center; }
                .title { font-size: 26px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; border: 1px solid #000; padding: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #000; }
                th { text-align: left; padding: 10px; background: #eee; border: 1px solid #000; font-size: 11px; text-transform: uppercase; }
                td { padding: 10px; border: 1px solid #000; font-size: 12px; }
                .summary-box { border: 1px solid #000; padding: 12px; margin-top: 16px; width: 260px; margin-left: auto; }
                .total-row { font-weight: bold; font-size: 15px; border-top: 2px solid #000; margin-top: 6px; padding-top: 6px; }
            `;
            headerHtml = `
                <div class="header">
                    <div class="title">AI RESUME BUILDER</div>
                    <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">FORMAL TAX INVOICE &amp; PAYMENT RECEIPT (SAMPLE PREVIEW)</div>
                    ${companyTaxId ? `<div style="font-size: 11px; margin-top: 4px;">Supplier ${taxName} Registration No: ${companyTaxId}</div>` : ''}
                </div>
            `;
        } else if (activeTemplate === 'gradient') {
            templateStyles = `
                body { font-family: 'Outfit', 'Inter', sans-serif; margin: 30px; color: #0f172a; line-height: 1.5; background: #f8fafc; }
                .card-wrap { background: #fff; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); padding: 30px; border: 1px solid #e2e8f0; }
                .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #fff; padding: 24px; border-radius: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; background: #f1f5f9; padding: 16px; border-radius: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                th { text-align: left; padding: 12px; background: #ede9fe; color: #5b21b6; border-radius: 8px 8px 0 0; font-size: 11px; text-transform: uppercase; font-weight: 800; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; }
                .summary-box { background: linear-gradient(135deg, #f8fafc 0%, #ede9fe 100%); border: 1px solid #c7d2fe; border-radius: 14px; padding: 18px; margin-top: 20px; width: 290px; margin-left: auto; }
                .total-row { font-weight: 800; font-size: 16px; color: #4338ca; border-top: 2px solid #a5b4fc; padding-top: 8px; margin-top: 8px; }
            `;
            headerHtml = `
                <div class="header">
                    <div>
                        <div class="title">AI RESUME BUILDER</div>
                        <div style="font-size: 12px; opacity: 0.9;">Enterprise Tax Invoice Receipt (SAMPLE PREVIEW)</div>
                        ${companyTaxId ? `<div style="font-size: 11px; opacity: 0.85; margin-top: 4px;">GSTIN: ${companyTaxId}</div>` : ''}
                    </div>
                    <div style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: #fff; padding: 6px 16px; border-radius: 99px; font-weight: 800; font-size: 12px;">${status} ✓</div>
                </div>
            `;
        } else if (activeTemplate === 'compact') {
            templateStyles = `
                body { font-family: 'Courier New', Courier, monospace; margin: 20px auto; max-width: 420px; color: #000; line-height: 1.3; background: #fff; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 16px; }
                .title { font-size: 20px; font-weight: bold; }
                .grid { border-bottom: 1px dashed #000; padding-bottom: 12px; margin-bottom: 12px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                th { text-align: left; padding: 6px 0; border-bottom: 1px dashed #000; text-transform: uppercase; }
                td { padding: 6px 0; border-bottom: 1px dotted #ccc; }
                .summary-box { border-top: 2px dashed #000; margin-top: 12px; padding-top: 8px; font-size: 13px; }
                .total-row { font-weight: bold; font-size: 15px; margin-top: 6px; }
            `;
            headerHtml = `
                <div class="header">
                    <div class="title">AI RESUME BUILDER</div>
                    <div>===============================</div>
                    <div style="font-size: 12px; font-weight: bold;">PAYMENT RECEIPT VOUCHER (SAMPLE PREVIEW)</div>
                    ${companyTaxId ? `<div style="font-size: 11px;">GSTIN: ${companyTaxId}</div>` : ''}
                </div>
            `;
        } else {
            templateStyles = `
                body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #1e293b; line-height: 1.5; }
                .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4338ca; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; color: #4338ca; }
                .badge { background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: bold; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
                .value { font-size: 14px; font-weight: 600; color: #0f172a; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #475569; }
                td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 20px; width: 280px; margin-left: auto; }
                .summary-line { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
                .total-row { font-weight: bold; font-size: 16px; color: #4338ca; border-top: 2px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
            `;
            headerHtml = `
                <div class="header">
                    <div>
                        <div class="title">AI RESUME BUILDER</div>
                        <div style="font-size: 12px; color: #64748b;">Official B2B Tax Invoice &amp; Payment Receipt (SAMPLE PREVIEW)</div>
                        ${companyTaxId ? `<div style="font-size: 11px; font-weight: bold; color: #4338ca; margin-top: 4px;">Supplier ${taxName}IN / Reg No: ${companyTaxId}</div>` : ''}
                    </div>
                    <div class="badge">${status}</div>
                </div>
            `;
        }

        const invoiceHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>PREVIEW: ${activeTemplate.toUpperCase()} Invoice Template</title>
                <style>
                    ${templateStyles}
                    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
                </style>
            </head>
            <body>
                <div class="card-wrap">
                    ${headerHtml}
                    <div class="grid">
                        <div>
                            <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Billed To</div>
                            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">Sample Enterprise Candidate</div>
                            <div style="font-size: 12px; color: #64748b;">candidate@example.com</div>
                            ${customerTaxId ? `<div style="font-size: 11px; font-weight: bold; color: #0f172a; margin-top: 4px;">Customer ${taxName} ID: ${customerTaxId}</div>` : ''}
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Invoice Reference</div>
                            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${sampleTxn.transactionId}</div>
                            <div style="font-size: 12px; color: #64748b;">Date: ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Payment Gateway</th>
                                <th style="text-align: right;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight: bold;">${sampleTxn.planType}</td>
                                <td>${sampleTxn.paimentType}</td>
                                <td style="text-align: right; font-weight: bold;">${currency}${subtotal}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="summary-box">
                        <div style="display:flex; justify-content: space-between; margin-bottom:6px;">
                            <span>Base Price: </span>
                            <span style="font-weight:600;">${currency}${subtotal}</span>
                        </div>
                        <div style="display:flex; justify-content: space-between; margin-bottom:6px;">
                            <span>${taxName} (${taxRate}%): </span>
                            <span style="font-weight:600;">${currency}${taxAmount}</span>
                        </div>
                        <div class="total-row" style="display:flex; justify-content: space-between;">
                            <span>Total Paid: </span>
                            <span>${currency}${totalPrice}</span>
                        </div>
                    </div>

                    <div class="footer">
                        ADMIN PREVIEW: Official ${activeTemplate.toUpperCase()} Invoice Template. For support, visit airesume.projectdemo.guru
                    </div>
                </div>
            </body>
            </html>
        `;
        printWindow.document.write(invoiceHtml);
        printWindow.document.close();
    }

    handlePPCheckedChange() {
        this.setState((prevState) => ({ checkedOnlyPP: !prevState.checkedOnlyPP }));
    }

    handleRazorpayToggle() {
        this.setState((prevState) => ({
            checkedRazorpayUPI: !prevState.checkedRazorpayUPI,
            checkedRazorpay: !prevState.checkedRazorpay
        }));
    }

    handleStripeToggle() {
        this.setState((prevState) => ({ checkedStripe: !prevState.checkedStripe }));
    }

    handlePayPalToggle() {
        this.setState((prevState) => ({ checkedPayPal: !prevState.checkedPayPal }));
    }

    handleSandboxToggle() {
        this.setState((prevState) => ({ sandboxMode: !prevState.sandboxMode }));
    }

    applyIndianPreset() {
        this.setState({
            currency: 'INR',
            monthlyPrice: 199,
            quartarlyPrice: 399,
            yearlyPrice: 499,
            checkedRazorpayUPI: true,
            checkedRazorpay: true,
            checkedStripe: true,
            checkedPayPal: true,
            checkedSubscriptions: true,
            sandboxMode: false
        });
    }

    componentDidMount() {
        getSubscriptionStatus().then((data) => {
            if (data) {
                this.setState({
                    checkedSubscriptions: data.state !== undefined ? data.state : true,
                    monthlyPrice: data.monthlyPrice !== undefined ? data.monthlyPrice : 199,
                    quartarlyPrice: data.quartarlyPrice !== undefined ? data.quartarlyPrice : 399,
                    yearlyPrice: data.yearlyPrice !== undefined ? data.yearlyPrice : 499,
                    checkedOnlyPP: data.onlyPP === undefined ? false : data.onlyPP,
                    currency: data.currency || 'INR',
                    checkedRazorpayUPI: data.razorpayUPI !== undefined ? data.razorpayUPI : true,
                    checkedStripe: data.stripeEnabled !== undefined ? data.stripeEnabled : true,
                    checkedPayPal: data.paypalEnabled !== undefined ? data.paypalEnabled : true,
                    checkedRazorpay: data.razorpayEnabled !== undefined ? data.razorpayEnabled : true,
                    sandboxMode: data.sandboxMode !== undefined ? data.sandboxMode : false,
                    enableTax: data.enableTax !== undefined ? data.enableTax : true,
                    taxName: data.taxName || 'GST',
                    taxRate: data.taxRate !== undefined ? data.taxRate : 18,
                    taxInclusive: data.taxInclusive !== undefined ? data.taxInclusive : false,
                    companyTaxId: data.companyTaxId || '27AAAAA0000A1Z5',
                    requireCustomerTaxId: data.requireCustomerTaxId !== undefined ? data.requireCustomerTaxId : false,
                    receiptTemplate: data.receiptTemplate || 'modern',
                });
            }
        });
        getSystemSettings().then((settings) => {
            const mods = (settings && settings.modules) || {};
            this.setState({ enableCouponsModule: mods.enableCouponsModule !== false });
        });
        this.fetchAdminCoupons();
    }

    async handleToggleCouponsModule() {
        const nextState = !this.state.enableCouponsModule;
        this.setState({ enableCouponsModule: nextState });

        try {
            const settings = (await getSystemSettings()) || {};
            const mods = settings.modules || {};
            const updatedMods = { ...mods, enableCouponsModule: nextState };
            await saveSystemSettings('modules', updatedMods);

            window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
                detail: {
                    modules: updatedMods
                }
            }));

            this.setState({
                couponSuccessMsg: `Promo Coupons Module is now ${nextState ? 'ENABLED (ACTIVE)' : 'DISABLED (OFF)'}!`
            });
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } catch (err) {
            console.error('Error toggling coupon module:', err);
        }
    }

    fetchAdminCoupons() {
        getAllCouponsAdmin().then((list) => {
            this.setState({ couponsList: list });
        });
    }

    handleOpenNewCoupon() {
        this.setState({
            editingCode: null,
            couponForm: {
                code: '',
                discount: 20,
                description: '',
                expiryDate: '',
                maxUses: 0,
                singleUsePerUser: false,
                active: true,
            },
            showCouponModal: true,
            couponErrorMsg: '',
        });
    }

    handleEditCoupon(c) {
        this.setState({
            editingCode: c.code,
            couponForm: {
                code: c.code,
                discount: c.discount,
                description: c.description || '',
                expiryDate: c.expiryDate || '',
                maxUses: c.maxUses || 0,
                singleUsePerUser: Boolean(c.singleUsePerUser),
                active: c.active !== false,
            },
            showCouponModal: true,
            couponErrorMsg: '',
        });
    }

    async handleSaveCouponForm(e) {
        if (e) e.preventDefault();
        const { code, discount, description, active, expiryDate, maxUses, singleUsePerUser } = this.state.couponForm;
        if (!code || !code.trim()) {
            this.setState({ couponErrorMsg: 'Please enter a valid coupon code (e.g. SUMMER50).' });
            return;
        }

        const res = await saveCoupon(code.trim(), discount, description, active, {
            expiryDate,
            maxUses,
            singleUsePerUser,
        });

        if (res.success) {
            this.setState({
                showCouponModal: false,
                couponSuccessMsg: res.message,
            });
            this.fetchAdminCoupons();
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } else {
            this.setState({ couponErrorMsg: res.error });
        }
    }

    async handleToggleCouponStatus(c) {
        await saveCoupon(c.code, c.discount, c.description, !c.active, {
            expiryDate: c.expiryDate,
            maxUses: c.maxUses,
            singleUsePerUser: c.singleUsePerUser,
            usedCount: c.usedCount,
        });
        this.fetchAdminCoupons();
    }

    handleDeleteCouponCode(code) {
        this.setState({ deleteConfirmCode: code });
    }

    async confirmDeleteCouponCode() {
        const code = this.state.deleteConfirmCode;
        if (!code) return;
        this.setState({ isDeleting: true });
        const res = await deleteCoupon(code);
        if (res.success !== false) {
            await this.fetchAdminCoupons();
            this.setState({
                deleteConfirmCode: null,
                isDeleting: false,
                couponSuccessMsg: `Coupon ${code} deleted permanently!`
            });
            setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
        } else {
            this.setState({ isDeleting: false, couponErrorMsg: res.error || 'Failed to delete coupon' });
        }
    }

    submitHandler() {
        setSubscriptionsData(
            this.state.checkedSubscriptions,
            this.state.monthlyPrice,
            this.state.quartarlyPrice,
            this.state.yearlyPrice,
            this.state.checkedOnlyPP,
            this.state.currency,
            this.state.checkedRazorpayUPI,
            {
                stripeEnabled: this.state.checkedStripe,
                paypalEnabled: this.state.checkedPayPal,
                razorpayEnabled: this.state.checkedRazorpay,
                sandboxMode: this.state.sandboxMode,
                razorpayKeyId: this.state.razorpayKeyId,
                razorpayKeySecret: this.state.razorpayKeySecret,
                stripePublishableKey: this.state.stripePublishableKey,
                stripeSecretKey: this.state.stripeSecretKey,
                paypalClientId: this.state.paypalClientId,
                paypalClientSecret: this.state.paypalClientSecret,
                enableTax: this.state.enableTax,
                taxName: this.state.taxName,
                taxRate: parseFloat(this.state.taxRate) || 0,
                taxInclusive: this.state.taxInclusive,
                companyTaxId: this.state.companyTaxId,
                requireCustomerTaxId: this.state.requireCustomerTaxId,
                receiptTemplate: this.state.receiptTemplate || 'modern',
            }
        );
        this.setState({ isSuccessOpen: true });
        setTimeout(() => {
            this.setState({ isSuccessOpen: false });
        }, 3000);
    }

    handleClose() {
        this.setState({ isSuccessOpen: false });
    }

    render() {
        const currencySymbol = this.state.currency === 'INR' ? '₹' : this.state.currency === 'USD' ? '$' : this.state.currency === 'EUR' ? '€' : '£';

        return (
            <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
                {/* Success Alert */}
                {this.state.isSuccessOpen && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Enterprise Payment Gateway Settings Saved!</p>
                                <p className="text-xs text-emerald-600 mt-0.5">Your payment provider toggles, pricing tiers, and sandbox mode settings are now live.</p>
                            </div>
                        </div>
                        <button
                            onClick={this.handleClose}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Indian Preset Quick Banner */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                    <div>
                        <h4 className="text-base font-bold flex items-center gap-2">
                            🇮🇳 Quick Preset: Indian Market Pricing (INR ₹)
                        </h4>
                        <p className="text-xs text-emerald-100 mt-0.5">
                            Sets Monthly (₹199), 3 Months (₹399), Annual (₹499) with Razorpay UPI, Stripe &amp; PayPal enabled.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.applyIndianPreset}
                        className="px-4 py-2.5 text-xs font-extrabold text-slate-900 bg-white rounded-xl hover:bg-emerald-50 transition-colors shadow-sm shrink-0 cursor-pointer"
                    >
                        Apply Indian Preset
                    </button>
                </div>

                {/* Sales Tax & GST Compliance Panel */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                                %
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Sales Tax, GST &amp; VAT Configuration</h3>
                                <p className="text-xs text-slate-500">Configure automated tax calculations, tax rates, GSTIN registration numbers, and B2B invoice fields.</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => this.setState((prev) => ({ enableTax: !prev.enableTax }))}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.enableTax
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                        >
                            {this.state.enableTax ? (
                                <>
                                    <FaToggleOn className="w-5 h-5" />
                                    <span>Tax Calculation ENABLED</span>
                                </>
                            ) : (
                                <>
                                    <FaToggleOff className="w-5 h-5" />
                                    <span>Tax Disabled</span>
                                </>
                            )}
                        </button>
                    </div>

                    {this.state.enableTax && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Tax Type / Name Label
                                </label>
                                <input
                                    type="text"
                                    value={this.state.taxName}
                                    onChange={(e) => this.setState({ taxName: e.target.value })}
                                    placeholder="GST / VAT / Sales Tax"
                                    className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Tax Rate (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={this.state.taxRate}
                                    onChange={(e) => this.setState({ taxRate: e.target.value })}
                                    placeholder="18"
                                    className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Company GSTIN / Tax Registration No.
                                </label>
                                <input
                                    type="text"
                                    value={this.state.companyTaxId}
                                    onChange={(e) => this.setState({ companyTaxId: e.target.value })}
                                    placeholder="27AAAAA0000A1Z5"
                                    className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Tax Pricing Calculation Mode
                                </label>
                                <select
                                    value={this.state.taxInclusive ? 'inclusive' : 'exclusive'}
                                    onChange={(e) => this.setState({ taxInclusive: e.target.value === 'inclusive' })}
                                    className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                >
                                    <option value="exclusive">Tax Exclusive (+ {this.state.taxRate}% added at checkout)</option>
                                    <option value="inclusive">Tax Inclusive (Prices include {this.state.taxRate}% {this.state.taxName})</option>
                                </select>
                            </div>

                            <div className="md:col-span-2 flex items-center space-x-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="requireCustomerTaxId"
                                    checked={this.state.requireCustomerTaxId}
                                    onChange={(e) => this.setState({ requireCustomerTaxId: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                                <label htmlFor="requireCustomerTaxId" className="text-xs font-bold text-slate-700 cursor-pointer">
                                    Collect Customer GSTIN / Tax ID field at checkout for B2B Tax Invoices
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* PDF Receipt & Invoice Template Selector Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 font-bold">
                            📄
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">User PDF Receipt &amp; Invoice Design Template</h3>
                            <p className="text-xs text-slate-500">Select the official PDF invoice layout template that candidates download and print from their Billing History.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                        {[
                            { id: 'modern', name: 'Modern Minimalist', desc: 'Clean slate layout, indigo badges, rounded summary card', color: 'border-indigo-500 bg-indigo-50/40 text-indigo-900' },
                            { id: 'classic', name: 'Classic Corporate', desc: 'Traditional formal layout, serif headers, sharp black borders', color: 'border-slate-800 bg-slate-100/60 text-slate-900' },
                            { id: 'gradient', name: 'Vibrant Enterprise', desc: 'Bold purple-indigo gradient header banner with pill badges', color: 'border-purple-600 bg-purple-50/50 text-purple-900' },
                            { id: 'compact', name: 'Compact Stub Voucher', desc: 'Narrow monospace receipt stub layout with dashed line dividers', color: 'border-amber-500 bg-amber-50/40 text-amber-900' },
                        ].map((tpl) => {
                            const isSelected = (this.state.receiptTemplate || 'modern') === tpl.id;
                            return (
                                <div
                                    key={tpl.id}
                                    onClick={() => this.setState({ receiptTemplate: tpl.id })}
                                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                                        isSelected ? tpl.color + ' ring-2 ring-indigo-500/20 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}>
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-extrabold uppercase tracking-wider">{tpl.name}</span>
                                            {isSelected && <FaCheck className="w-3.5 h-3.5 text-indigo-600" />}
                                        </div>
                                        <p className="text-[11px] text-slate-600 leading-snug">{tpl.desc}</p>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80">
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {isSelected ? 'ACTIVE ✓' : 'Select'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                this.previewTemplate(tpl.id);
                                            }}
                                            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-2xs">
                                            👁️ Preview
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${this.state.sandboxMode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                <FaFlask className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900">Environment &amp; Sandbox Mode</h3>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${this.state.sandboxMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                                        {this.state.sandboxMode ? '⚡ Sandbox / Demo Mode Active' : '🟢 Live Production Mode'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">Toggle between live real transactions and sandbox demo checkout testing</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={this.handleSandboxToggle}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.sandboxMode
                                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                        >
                            {this.state.sandboxMode ? (
                                <>
                                    <FaToggleOn className="w-5 h-5" />
                                    <span>Sandbox Mode ON</span>
                                </>
                            ) : (
                                <>
                                    <FaToggleOff className="w-5 h-5" />
                                    <span>Live Production</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* --- PAYMENT GATEWAY API & SANDBOX CREDENTIALS CARD --- */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
                    <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                            <FaFlask className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Payment Gateway API Keys &amp; Credentials (Sandbox &amp; Production)</h3>
                            <p className="text-xs text-slate-500">Configure test (sandbox) or live API keys for Razorpay, Stripe, and PayPal.</p>
                        </div>
                    </div>

                    {/* Section 1: Razorpay Credentials */}
                    <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                        <div className="flex items-center gap-2">
                            <FaRupeeSign className="w-4 h-4 text-emerald-700" />
                            <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">Razorpay API Credentials (UPI, GPay, Paytm &amp; Cards)</h4>
                            <span className="ml-auto text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                {this.state.sandboxMode ? 'SANDBOX / TEST MODE' : 'PRODUCTION MODE'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Razorpay Key ID *</label>
                                <input
                                    type="text"
                                    value={this.state.razorpayKeyId}
                                    onChange={(e) => this.setState({ razorpayKeyId: e.target.value })}
                                    placeholder="e.g. rzp_test_TOnviD5XeHLE0y or rzp_live_..."
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Razorpay Key Secret *</label>
                                <input
                                    type="password"
                                    value={this.state.razorpayKeySecret}
                                    onChange={(e) => this.setState({ razorpayKeySecret: e.target.value })}
                                    placeholder="e.g. ERtqc12PbwXNyou8ITu0Ekqp"
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-emerald-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Stripe Credentials */}
                    <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
                        <div className="flex items-center gap-2">
                            <FaStripe className="w-5 h-5 text-indigo-700" />
                            <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">Stripe API Credentials (Credit / Debit Cards)</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Stripe Publishable Key</label>
                                <input
                                    type="text"
                                    value={this.state.stripePublishableKey}
                                    onChange={(e) => this.setState({ stripePublishableKey: e.target.value })}
                                    placeholder="e.g. pk_test_..."
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Stripe Secret Key</label>
                                <input
                                    type="password"
                                    value={this.state.stripeSecretKey}
                                    onChange={(e) => this.setState({ stripeSecretKey: e.target.value })}
                                    placeholder="e.g. sk_test_..."
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: PayPal Credentials */}
                    <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                        <div className="flex items-center gap-2">
                            <FaPaypal className="w-4 h-4 text-blue-700" />
                            <h4 className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">PayPal Express Credentials</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">PayPal Client ID</label>
                                <input
                                    type="text"
                                    value={this.state.paypalClientId}
                                    onChange={(e) => this.setState({ paypalClientId: e.target.value })}
                                    placeholder="e.g. AX... or sandbox client ID"
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">PayPal Client Secret</label>
                                <input
                                    type="password"
                                    value={this.state.paypalClientSecret}
                                    onChange={(e) => this.setState({ paypalClientSecret: e.target.value })}
                                    placeholder="e.g. E..."
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Subscription Master Switch */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                                <FaShieldAlt className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Subscription System Master Switch</h3>
                                <p className="text-xs text-slate-500">Enable or disable premium subscription tiers &amp; paid resume downloads</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={this.handleSubscriptionToggleChange}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.checkedSubscriptions
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {this.state.checkedSubscriptions ? (
                                <>
                                    <FaToggleOn className="w-5 h-5 text-emerald-600" />
                                    <span>Active</span>
                                </>
                            ) : (
                                <>
                                    <FaToggleOff className="w-5 h-5 text-slate-400" />
                                    <span>Disabled</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Individual Payment Providers ON / OFF Toggles */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900">Payment Gateway Providers (Enterprise Control)</h3>
                        <p className="text-xs text-slate-500">Enable or disable individual payment processors dynamically for candidate checkout</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        {/* Provider 1: Stripe */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedStripe ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaStripe className="w-7 h-7 text-indigo-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Stripe Cards</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleStripeToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedStripe ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedStripe ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Credit / Debit Cards (Visa, Mastercard, Amex)</p>
                        </div>

                        {/* Provider 2: PayPal */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedPayPal ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaPaypal className="w-6 h-6 text-blue-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">PayPal</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handlePayPalToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedPayPal ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedPayPal ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Global PayPal Accounts &amp; One-Touch Checkout</p>
                        </div>

                        {/* Provider 3: Razorpay UPI */}
                        <div className={`p-4 rounded-xl border transition-all ${this.state.checkedRazorpay ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <FaRupeeSign className="w-5 h-5 text-emerald-600" />
                                    <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Razorpay UPI</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleRazorpayToggle}
                                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                        this.state.checkedRazorpay ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {this.state.checkedRazorpay ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500">Google Pay, PhonePe, Paytm, BHIM &amp; RuPay (India)</p>
                        </div>
                    </div>
                </div>

                {/* --- ENTERPRISE ADMIN COUPON MANAGER CARD --- */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700 font-extrabold">
                                <FaTag className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Dynamic Promo Coupon Manager</h3>
                                <p className="text-xs text-slate-500">Create, edit, toggle active status, set expiry dates, and usage limits</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
                            {/* Promo Coupons Module Master Switch */}
                            <button
                                type="button"
                                onClick={this.handleToggleCouponsModule}
                                className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all border flex items-center gap-2 cursor-pointer ${
                                    this.state.enableCouponsModule
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                }`}>
                                {this.state.enableCouponsModule ? (
                                    <>
                                        <FaToggleOn className="w-4 h-4 text-emerald-600" />
                                        <span>Module ENABLED (ON)</span>
                                    </>
                                ) : (
                                    <>
                                        <FaToggleOff className="w-4 h-4 text-slate-400" />
                                        <span>Module DISABLED (OFF)</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={this.handleOpenNewCoupon}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer">
                                <FaPlus className="w-3 h-3" />
                                <span>Create New Coupon</span>
                            </button>
                        </div>
                    </div>

                    {this.state.couponSuccessMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                            <FaCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{this.state.couponSuccessMsg}</span>
                        </div>
                    )}

                    {/* Coupons List Table */}
                    {this.state.couponsList.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <FaTag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-xs font-bold text-slate-600">No Custom Coupons Created Yet</p>
                            <p className="text-[11px] text-slate-500">Click "Create New Coupon" to add a promo code (e.g. SAVE50, WELCOME20).</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase border-b border-slate-200">
                                    <tr>
                                        <th className="p-3">Code</th>
                                        <th className="p-3">Discount</th>
                                        <th className="p-3">Description</th>
                                        <th className="p-3">Expiry</th>
                                        <th className="p-3">Uses</th>
                                        <th className="p-3">Per User Limit</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {this.state.couponsList.map((c) => (
                                        <tr key={c.code} className="hover:bg-slate-50/80 transition-all">
                                            <td className="p-3 font-mono font-extrabold text-indigo-700">{c.code}</td>
                                            <td className="p-3 font-bold text-emerald-700">-{c.discount}%</td>
                                            <td className="p-3 text-slate-700 max-w-xs truncate">{c.description || '—'}</td>
                                            <td className="p-3 text-slate-600">{c.expiryDate || 'Unlimited'}</td>
                                            <td className="p-3 text-slate-600">{c.usedCount || 0} / {c.maxUses > 0 ? c.maxUses : '∞'}</td>
                                            <td className="p-3 text-slate-600">{c.singleUsePerUser ? '1 Use / Candidate' : 'Multi-Use'}</td>
                                            <td className="p-3">
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleToggleCouponStatus(c)}
                                                    className={`px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                                                        c.active
                                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                                    }`}
                                                    title={`Click to turn ${c.code} ${c.active ? 'OFF (Deactivate)' : 'ON (Activate)'}`}>
                                                    {c.active ? (
                                                        <>
                                                            <FaToggleOn className="w-4 h-4 text-white" />
                                                            <span>ON</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FaToggleOff className="w-4 h-4 text-slate-500" />
                                                            <span>OFF</span>
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                            <td className="p-3 text-right space-x-2">
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleEditCoupon(c)}
                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Edit Coupon">
                                                    <FaEdit className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => this.handleDeleteCouponCode(c.code)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Delete Coupon">
                                                    <FaTrash className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal for Creating / Editing Coupon */}
                {this.state.showCouponModal && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                    <FaTag className="text-indigo-600" />
                                    <span>{this.state.editingCode ? `Edit Coupon ${this.state.editingCode}` : 'Create New Promo Coupon'}</span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ showCouponModal: false })}
                                    className="text-slate-400 hover:text-slate-600 p-1">
                                    <FaTimes className="w-4 h-4" />
                                </button>
                            </div>

                            {this.state.couponErrorMsg && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
                                    {this.state.couponErrorMsg}
                                </div>
                            )}

                            <form onSubmit={this.handleSaveCouponForm} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Coupon Code</label>
                                    <input
                                        type="text"
                                        value={this.state.couponForm.code}
                                        onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, code: e.target.value.toUpperCase() } })}
                                        disabled={Boolean(this.state.editingCode)}
                                        placeholder="e.g. SUMMER50"
                                        className="w-full px-3.5 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none uppercase"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Discount %</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={this.state.couponForm.discount}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, discount: Number(e.target.value) } })}
                                            className="w-full px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Expiry Date</label>
                                        <input
                                            type="date"
                                            value={this.state.couponForm.expiryDate}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, expiryDate: e.target.value } })}
                                            className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={this.state.couponForm.description}
                                        onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, description: e.target.value } })}
                                        placeholder="e.g. 50% Special Career Accelerator Discount"
                                        className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-1">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Max Total Uses (0 = ∞)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={this.state.couponForm.maxUses}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, maxUses: Number(e.target.value) } })}
                                            className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:border-indigo-600 outline-none"
                                        />
                                    </div>

                                    <div className="flex flex-col justify-center">
                                        <label className="flex items-center gap-2 cursor-pointer pt-4">
                                            <input
                                                type="checkbox"
                                                checked={this.state.couponForm.singleUsePerUser}
                                                onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, singleUsePerUser: e.target.checked } })}
                                                className="w-4 h-4 text-indigo-600 rounded"
                                            />
                                            <span className="text-xs font-bold text-slate-700">1 Use Per Candidate</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={this.state.couponForm.active}
                                            onChange={(e) => this.setState({ couponForm: { ...this.state.couponForm, active: e.target.checked } })}
                                            className="w-4 h-4 text-emerald-600 rounded"
                                        />
                                        <span className="text-xs font-bold text-slate-800">Coupon Active</span>
                                    </label>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ showCouponModal: false })}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all">
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm">
                                            Save Coupon
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Custom Delete Coupon Confirmation Modal Pop-Up */}
                {this.state.deleteConfirmCode && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                                    <FaTrash className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Delete Promo Coupon</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Confirm permanent removal from Firestore database.</p>
                                </div>
                            </div>

                            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-relaxed">
                                Are you sure you want to permanently delete coupon code <span className="font-mono font-extrabold text-rose-950 uppercase">{this.state.deleteConfirmCode}</span>? Candidate checkout will no longer accept this discount code.
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => this.setState({ deleteConfirmCode: null })}
                                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={this.state.isDeleting}
                                    onClick={() => this.confirmDeleteCouponCode()}
                                    className="px-5 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer">
                                    {this.state.isDeleting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                                            <span>Deleting...</span>
                                        </>
                                    ) : (
                                        <span>Yes, Delete Coupon</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Pricing Plans */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                            <FaRupeeSign className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Subscription Tiers &amp; Pricing Rates</h3>
                            <p className="text-xs text-slate-500">Configure prices in INR (₹), USD ($), EUR (€), or GBP (£)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Monthly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Monthly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.monthlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'monthly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="199"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per month rate</p>
                        </div>

                        {/* Quarterly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Quarterly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.quartarlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'quartarly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="399"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per 3 months rate</p>
                        </div>

                        {/* Yearly Price */}
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Yearly Plan ({currencySymbol})</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={this.state.yearlyPrice || ''}
                                    onChange={(event) => this.handleChange(event, 'yearly')}
                                    disabled={!this.state.checkedSubscriptions}
                                    placeholder="499"
                                    className="w-full pl-8 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">
                                    {currencySymbol}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">Per year rate</p>
                        </div>

                        {/* Currency */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">System Currency</label>
                            <select
                                value={this.state.currency}
                                onChange={(event) => this.handleChange(event, 'currency')}
                                disabled={!this.state.checkedSubscriptions}
                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900"
                            >
                                <option value="INR">🇮🇳 INR (₹ - Indian Rupee)</option>
                                <option value="USD">💵 USD ($ - US Dollar)</option>
                                <option value="EUR">💶 EUR (€ - Euro)</option>
                                <option value="GBP">💷 GBP (£ - British Pound)</option>
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">Default currency</p>
                        </div>
                    </div>
                </div>

                {/* Save Action Button */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <div className="flex items-center text-xs text-slate-500">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                        <span>Enterprise changes apply immediately to user dashboard &amp; popup checkout</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => this.submitHandler()}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center space-x-2 shadow-md cursor-pointer"
                    >
                        <FaCheck className="w-4 h-4 text-emerald-400" />
                        <span>Save Subscription &amp; Payment Settings</span>
                    </button>
                </div>
            </div>
        );
    }
}

export default SubscriptionSetting;
