import { writeSanitizedPrintDocument } from '../../../utils/sanitizeHtml';
import React, { Component } from 'react';
import { getSubscriptionStatus, setSubscriptionsData, getAllCouponsAdmin, saveCoupon, deleteCoupon, getSystemSettings, saveSystemSettings, getAllAdminTransactions, refundOrderTransaction } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe, FaFlask, FaShieldAlt, FaTag, FaPlus, FaTrash, FaEdit, FaCalendarAlt, FaPercent, FaEye, FaEyeSlash, FaDownload, FaSearch, FaFileInvoice, FaPrint, FaListAlt, FaCog, FaUndo } from 'react-icons/fa';
import config from '../../../conf/configuration';

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
            // Inline notice for invoice/export actions. These used to be native
            // alert() dialogs.
            invoiceNotice: null,

            // Payment Gateway API Credentials State
            razorpayKeyId: '',
            // Must default to empty. A credential-shaped default is persisted to
            // the payments config on save if the operator never touches the
            // field, silently writing a bogus secret into a live deployment.
            razorpayKeySecret: '',
            stripePublishableKey: '',
            stripeSecretKey: '',
            paypalClientId: '',
            paypalClientSecret: '',
            // Paytm credentials
            checkedPaytm: false,
            paytmMid: '',
            paytmMerchantKey: '',
            paytmWebsite: 'WEBSTAGING',
            // PhonePe credentials
            checkedPhonePe: false,
            phonepeId: '',
            phonepeSaltKey: '',
            phonepeSaltIndex: '1',

            // Secret Key Masking Toggles
            showRazorpaySecret: false,
            showStripeSecret: false,
            showPaypalSecret: false,
            showPaytmKey: false,
            showPhonePeKey: false,

            // Master Admin Invoice Ledger & Audit State
            adminTab: props.defaultTab || 'gateways', // 5 Tabs: 'gateways', 'gst', 'plans', 'coupons', 'invoices'
            adminInvoicesList: [],
            invoiceSearchQuery: '',
            invoiceTypeFilter: 'all',
            invoiceGatewayFilter: 'all',
            invoiceStatusFilter: 'all',
            loadingInvoices: false,
            refundingDocId: null,

            // Sales Tax & GST Config State
            enableTax: true,
            taxName: 'GST',
            taxRate: 18,
            taxInclusive: false,
            companyTaxId: '27AABCU9603R1ZM',
            supplierLegalName: 'ResumePilot Technologies Private Limited',
            supplierTradeName: 'ResumePilot AI',
            supplierGstin: '27AABCU9603R1ZM',
            supplierPan: 'AABCU9603R',
            supplierAddress: 'Unit 402, Apex Business Park, Bandra Kurla Complex, Bandra East',
            supplierCity: 'Mumbai',
            supplierState: 'Maharashtra',
            supplierStateCode: '27',
            supplierPincode: '400051',
            sacCode: '998313',
            invoicePrefix: 'RPAI',
            financialYear: '26-27',
            requireCustomerTaxId: false,
            receiptTemplate: 'modern',
            reverseCharge: 'No',

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

            // Invoice, Refund & Template Preview Modals State
            pdfModalInvoice: null,
            refundModalInvoice: null,
            previewTemplateModal: null,
            refundReason: 'Customer requested cancellation & refund',
            customRefundNote: '',
            isProcessingRefund: false,
            orderSuccessToast: '',
            orderErrorToast: '',
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleSubscriptionToggleChange = this.handleSubscriptionToggleChange.bind(this);
        this.handlePPCheckedChange = this.handlePPCheckedChange.bind(this);
        this.handleRazorpayToggle = this.handleRazorpayToggle.bind(this);
        this.handleStripeToggle = this.handleStripeToggle.bind(this);
        this.handlePayPalToggle = this.handlePayPalToggle.bind(this);
        this.handlePaytmToggle = this.handlePaytmToggle.bind(this);
        this.handlePhonePeToggle = this.handlePhonePeToggle.bind(this);
        this.handleSandboxToggle = this.handleSandboxToggle.bind(this);
        this.submitHandler = this.submitHandler.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.applyIndianPreset = this.applyIndianPreset.bind(this);
        this.fetchAdminCoupons = this.fetchAdminCoupons.bind(this);
        this.fetchAdminInvoices = this.fetchAdminInvoices.bind(this);
        this.handleExportGSTR1CSV = this.handleExportGSTR1CSV.bind(this);
        this.handleOpenPDFModal = this.handleOpenPDFModal.bind(this);
        this.handleClosePDFModal = this.handleClosePDFModal.bind(this);
        this.printModalInvoice = this.printModalInvoice.bind(this);
        this.handleOpenRefundModal = this.handleOpenRefundModal.bind(this);
        this.handleCloseRefundModal = this.handleCloseRefundModal.bind(this);
        this.handleExecuteRefund = this.handleExecuteRefund.bind(this);
        this.handleOpenNewCoupon = this.handleOpenNewCoupon.bind(this);
        this.handleEditCoupon = this.handleEditCoupon.bind(this);
        this.handleSaveCouponForm = this.handleSaveCouponForm.bind(this);
        this.handleToggleCouponStatus = this.handleToggleCouponStatus.bind(this);
        this.handleDeleteCouponCode = this.handleDeleteCouponCode.bind(this);
        this.confirmDeleteCouponCode = this.confirmDeleteCouponCode.bind(this);
        this.previewTemplate = this.previewTemplate.bind(this);
        this.closePreviewTemplateModal = this.closePreviewTemplateModal.bind(this);
    }

    async componentDidMount() {
        this.fetchAdminInvoices();
        this.fetchAdminCoupons();
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
                    companyTaxId: data.companyTaxId || '27AABCU9603R1ZM',
                    supplierLegalName: data.supplierLegalName || 'ResumePilot Technologies Private Limited',
                    supplierTradeName: data.supplierTradeName || 'ResumePilot AI',
                    supplierGstin: data.supplierGstin || data.companyTaxId || '27AABCU9603R1ZM',
                    supplierPan: data.supplierPan || 'AABCU9603R',
                    supplierAddress: data.supplierAddress || 'Unit 402, Apex Business Park, Bandra Kurla Complex, Bandra East',
                    supplierCity: data.supplierCity || 'Mumbai',
                    supplierState: data.supplierState || 'Maharashtra',
                    supplierStateCode: data.supplierStateCode || '27',
                    supplierPincode: data.supplierPincode || '400051',
                    sacCode: data.sacCode || '998313',
                    invoicePrefix: data.invoicePrefix || 'RPAI',
                    financialYear: data.financialYear || '26-27',
                    requireCustomerTaxId: data.requireCustomerTaxId !== undefined ? data.requireCustomerTaxId : false,
                    receiptTemplate: data.receiptTemplate || 'modern',
                    reverseCharge: data.reverseCharge || 'No',
                });
            }
        }).catch(e => console.warn('getSubscriptionStatus error:', e));

        try {
            const settings = await getSystemSettings();
            if (settings) {
                const mods = settings.modules || {};
                const pay = settings.payments || {};
                this.setState({
                    enableCouponsModule: mods.enableCouponsModule !== false,
                    razorpayKeyId: pay.razorpayKeyId || this.state.razorpayKeyId,
                    razorpayKeySecret: pay.razorpayKeySecret || this.state.razorpayKeySecret,
                    stripePublishableKey: pay.stripePublishableKey || this.state.stripePublishableKey,
                    stripeSecretKey: pay.stripeSecretKey || this.state.stripeSecretKey,
                    paypalClientId: pay.paypalClientId || this.state.paypalClientId,
                    paypalClientSecret: pay.paypalClientSecret || this.state.paypalClientSecret,
                    currency: pay.currency || this.state.currency,
                    // Load Paytm
                    checkedPaytm: pay.paytmEnabled === true,
                    paytmMid: pay.paytmMid || '',
                    paytmMerchantKey: pay.paytmMerchantKey || '',
                    paytmWebsite: pay.paytmWebsite || 'WEBSTAGING',
                    // Load PhonePe
                    checkedPhonePe: pay.phonepeEnabled === true,
                    phonepeId: pay.phonepeId || '',
                    phonepeSaltKey: pay.phonepeSaltKey || '',
                    phonepeSaltIndex: pay.phonepeSaltIndex || '1',
                });
            }
        } catch (e) {
            console.warn('Error in componentDidMount:', e);
        }
    }

    async fetchAdminInvoices() {
        this.setState({ loadingInvoices: true });
        try {
            const invoices = await getAllAdminTransactions();
            this.setState({ adminInvoicesList: invoices, loadingInvoices: false });
        } catch (err) {
            console.error('Error fetching admin invoices:', err);
            this.setState({ loadingInvoices: false });
        }
    }

    handleOpenPDFModal(inv) {
        this.setState({ pdfModalInvoice: inv });
    }

    handleClosePDFModal() {
        this.setState({ pdfModalInvoice: null });
    }

    handleOpenRefundModal(inv) {
        this.setState({
            refundModalInvoice: inv,
            refundReason: 'Customer requested cancellation & refund',
            customRefundNote: ''
        });
    }

    handleCloseRefundModal() {
        this.setState({ refundModalInvoice: null, isProcessingRefund: false });
    }

    async handleExecuteRefund() {
        const inv = this.state.refundModalInvoice;
        if (!inv) return;
        const txnId = inv.transactionId || inv.id;
        const fullReason = `${this.state.refundReason}${this.state.customRefundNote ? `: ${this.state.customRefundNote}` : ''}`;

        this.setState({ isProcessingRefund: true });
        try {
            const res = await refundOrderTransaction(inv.docId, txnId, inv.userId, fullReason);
            if (res && res.success) {
                this.setState({ refundModalInvoice: null, isProcessingRefund: false, orderSuccessToast: res.message || `Order ${txnId} refund confirmed.` });
                await this.fetchAdminInvoices();
                setTimeout(() => this.setState({ orderSuccessToast: '' }), 4500);
            } else {
                this.setState({ isProcessingRefund: false, orderErrorToast: res?.error || 'Refund could not be confirmed.' });
            }
        } catch (err) {
            console.error('Execute refund error:', err);
            this.setState({ isProcessingRefund: false, orderErrorToast: err.message || 'Refund failed.' });
        }
    }

    previewTemplate(tplId) {
        this.setState({ previewTemplateModal: tplId || 'modern' });
    }

    closePreviewTemplateModal() {
        this.setState({ previewTemplateModal: null });
    }

    renderTemplatePreviewSheet(tplId) {
        const style = tplId || 'modern';
        const supplierTradeName = (this.state.supplierTradeName || 'ResumePilot AI').trim();
        const supplierLegalName = (this.state.supplierLegalName || 'ResumePilot Technologies Private Limited').trim();
        const supplierGstin = (this.state.supplierGstin || '27AABCU9603R1ZM').trim();
        const supplierPan = (this.state.supplierPan || 'AABCU9603R').trim();
        const supplierAddress = (this.state.supplierAddress || 'Unit 402, BKC').trim();
        const supplierCity = (this.state.supplierCity || 'Mumbai').trim();
        const supplierState = (this.state.supplierState || 'Maharashtra').trim();
        const supplierPincode = (this.state.supplierPincode || '400051').trim();
        const supplierSacCode = this.state.sacCode || '998313';
        const supplierEmail = (this.state.supplierEmail || 'support@airesume.projectdemo.guru').trim();
        const invoiceNo = `${this.state.invoicePrefix || 'RPAI'}/${this.state.financialYear || '26-27'}/004821`;

        // ── 1. MODERN MINIMALIST ────────────────────────────────────────────────
        if (style === 'modern') {
            return (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md text-xs text-slate-800 font-sans space-y-6">
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 flex justify-between items-center relative border-b-4 border-indigo-500">
                        <div>
                            <div className="text-xl font-black uppercase tracking-tight">{supplierTradeName}</div>
                            <div className="text-[11px] text-indigo-300 font-bold uppercase tracking-wider mt-0.5">B2B GST Tax Invoice &amp; Payment Receipt</div>
                            <span className="mt-2 inline-block px-2.5 py-0.5 bg-indigo-900/60 border border-indigo-500/40 text-indigo-200 text-[9px] font-bold uppercase tracking-widest rounded-md">Original for Recipient</span>
                        </div>
                        <div className="text-right">
                            <span className="px-3.5 py-1 bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-extrabold text-xs rounded-full uppercase tracking-wider inline-block">PAID ✓</span>
                            <div className="text-slate-300 text-[11px] font-semibold mt-2">Date: Aug 13, 2026</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 px-6 py-3 bg-indigo-50/60 border-b border-indigo-100 text-center text-[10px]">
                        <div><div className="font-bold text-indigo-600 uppercase">Invoice Number</div><div className="font-mono font-extrabold text-slate-900">{invoiceNo}</div></div>
                        <div><div className="font-bold text-indigo-600 uppercase">Place of Supply</div><div className="font-bold text-slate-900">Maharashtra (27)</div></div>
                        <div><div className="font-bold text-indigo-600 uppercase">Reverse Charge</div><div className="font-bold text-slate-900">No</div></div>
                        <div><div className="font-bold text-indigo-600 uppercase">Customer Type</div><div className="font-bold text-slate-900">B2B Registered Entity</div></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Supplier / Billed From</div>
                            <div className="font-bold text-slate-900 text-sm">{supplierLegalName}</div>
                            <div className="text-slate-600 leading-snug">{supplierAddress}, {supplierCity}, {supplierState} - {supplierPincode}</div>
                            <div className="pt-1 font-bold text-slate-800">GSTIN: <span className="font-mono text-indigo-600">{supplierGstin}</span> | PAN: {supplierPan}</div>
                            <div className="text-slate-600">SAC Code: <span className="font-mono font-bold">{supplierSacCode}</span> ({supplierEmail})</div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Customer / Billed To</div>
                            <div className="font-bold text-slate-900 text-sm">Sarah Jenkins</div>
                            <div className="text-indigo-600 font-bold">Apex Tech Solutions Ltd</div>
                            <div className="text-slate-600">42 Financial District, Mumbai, Maharashtra, India</div>
                            <div className="pt-1 font-bold text-slate-800">Customer GSTIN: <span className="font-mono text-indigo-600">27AAACA1234B1Z9</span></div>
                        </div>
                    </div>

                    <div className="px-6">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-900 text-white text-[10px] uppercase font-bold tracking-wider">
                                    <th className="p-3 rounded-l-lg">Item Description</th>
                                    <th className="p-3">SAC</th>
                                    <th className="p-3">Qty</th>
                                    <th className="p-3 text-right">Taxable Value</th>
                                    <th className="p-3 text-right">CGST (9%)</th>
                                    <th className="p-3 text-right">SGST (9%)</th>
                                    <th className="p-3 text-right rounded-r-lg">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                <tr>
                                    <td className="p-3">
                                        <div className="font-bold text-slate-900">Annual Pro Membership Plan (12 Months)</div>
                                        <div className="text-[11px] text-slate-400">Full Access to AI Resume Builder, Cover Letters &amp; Portfolios</div>
                                    </td>
                                    <td className="p-3 font-mono text-xs">{supplierSacCode}</td>
                                    <td className="p-3">1</td>
                                    <td className="p-3 text-right font-bold text-slate-900">₹422.88</td>
                                    <td className="p-3 text-right text-slate-600">₹38.06</td>
                                    <td className="p-3 text-right text-slate-600">₹38.06</td>
                                    <td className="p-3 text-right font-black text-slate-900">₹499.00</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-6 pb-2">
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col justify-between">
                            <div>
                                <div className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Amount in Words</div>
                                <div className="font-bold text-indigo-950 text-sm mt-1">Four Hundred Ninety Nine Rupees Only</div>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-indigo-100">GST Rate: <strong>18% (CGST 9% + SGST 9%)</strong></div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between text-slate-600"><span>Taxable Value:</span><span>₹422.88</span></div>
                            <div className="flex justify-between text-slate-600"><span>CGST (9%):</span><span>₹38.06</span></div>
                            <div className="flex justify-between text-slate-600"><span>SGST (9%):</span><span>₹38.06</span></div>
                            <div className="flex justify-between font-black text-slate-900 text-sm pt-2 border-t border-slate-300"><span>Grand Total:</span><span>₹499.00 INR</span></div>
                        </div>
                    </div>

                    <div className="mx-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[11px] text-emerald-900">
                        <div>
                            <div className="font-extrabold uppercase text-[9px] text-emerald-700">Payment Verification Audit</div>
                            <div className="font-bold">Method: <strong>Razorpay / UPI</strong> | Status: <span className="text-emerald-600 font-black">PAID ✓</span></div>
                            <div className="font-mono text-[10px] text-emerald-700">Ref: TXN_SAMPLE_8849</div>
                        </div>
                        <div className="text-right text-[10px] text-emerald-700">Computer Generated Receipt · IT Act 2000</div>
                    </div>
                </div>
            );
        }

        // ── 2. CLASSIC CORPORATE ───────────────────────────────────────────────
        if (style === 'classic') {
            return (
                <div className="bg-white border-2 border-slate-900 rounded-lg p-6 shadow-md text-xs text-slate-900 font-serif space-y-6">
                    <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight">{supplierTradeName}</h2>
                            <p className="text-xs font-sans text-slate-600">{supplierLegalName}</p>
                            <span className="inline-block mt-2 px-3 py-1 bg-slate-900 text-white text-[10px] font-sans font-bold uppercase tracking-widest">OFFICIAL CORPORATE TAX INVOICE</span>
                        </div>
                        <div className="text-right font-sans">
                            <div className="text-lg font-black uppercase text-slate-900">PAID IN FULL</div>
                            <div className="text-xs text-slate-600 mt-1">Invoice No: <strong>{invoiceNo}</strong></div>
                            <div className="text-xs text-slate-600">Date: Aug 13, 2026</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 font-sans">
                        <div className="border border-slate-800 p-3 bg-slate-50">
                            <div className="font-bold uppercase text-[10px] text-slate-500 border-b border-slate-300 pb-1 mb-1">Supplier Entity</div>
                            <div className="font-bold text-sm">{supplierLegalName}</div>
                            <div className="text-xs text-slate-700">{supplierAddress}, {supplierCity}, {supplierState} - {supplierPincode}</div>
                            <div className="text-xs mt-1"><strong>GSTIN:</strong> {supplierGstin} | <strong>PAN:</strong> {supplierPan}</div>
                            <div className="text-xs"><strong>SAC Code:</strong> {supplierSacCode}</div>
                        </div>
                        <div className="border border-slate-800 p-3 bg-slate-50">
                            <div className="font-bold uppercase text-[10px] text-slate-500 border-b border-slate-300 pb-1 mb-1">Billed Recipient</div>
                            <div className="font-bold text-sm">Sarah Jenkins</div>
                            <div className="font-bold text-slate-800">Apex Tech Solutions Ltd</div>
                            <div className="text-xs text-slate-700">42 Financial District, Mumbai, Maharashtra</div>
                            <div className="text-xs mt-1"><strong>Customer GSTIN:</strong> 27AAACA1234B1Z9</div>
                        </div>
                    </div>

                    <table className="w-full text-left border border-slate-900 font-sans">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase">
                                <th className="p-2 border-r border-slate-700">Service Particulars</th>
                                <th className="p-2 border-r border-slate-700">SAC</th>
                                <th className="p-2 border-r border-slate-700 text-right">Taxable</th>
                                <th className="p-2 border-r border-slate-700 text-right">CGST</th>
                                <th className="p-2 border-r border-slate-700 text-right">SGST</th>
                                <th className="p-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                            <tr>
                                <td className="p-2 font-bold">Annual Pro Membership Plan (12 Months)</td>
                                <td className="p-2 font-mono">{supplierSacCode}</td>
                                <td className="p-2 text-right font-mono">₹422.88</td>
                                <td className="p-2 text-right font-mono">₹38.06</td>
                                <td className="p-2 text-right font-mono">₹38.06</td>
                                <td className="p-2 text-right font-mono font-bold">₹499.00</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex justify-between items-end font-sans pt-2">
                        <div className="text-xs text-slate-700">
                            <div>Amount in Words: <strong>Four Hundred Ninety Nine Rupees Only</strong></div>
                            <div className="text-[10px] text-slate-500 mt-1">Payment Method: Razorpay / UPI (Ref: TXN_SAMPLE_8849)</div>
                        </div>
                        <div className="border-2 border-slate-900 p-3 bg-slate-50 text-right min-w-[200px]">
                            <div className="text-xs">Taxable: ₹422.88</div>
                            <div className="text-xs">GST (18%): ₹76.12</div>
                            <div className="text-sm font-black border-t border-slate-900 pt-1 mt-1">TOTAL: ₹499.00 INR</div>
                        </div>
                    </div>
                </div>
            );
        }

        // ── 3. VIBRANT ENTERPRISE ─────────────────────────────────────────────
        if (style === 'gradient') {
            return (
                <div className="bg-white border border-purple-200 rounded-3xl overflow-hidden shadow-lg text-xs text-slate-800 font-sans space-y-6">
                    <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-pink-600 text-white p-6 flex justify-between items-center shadow-md">
                        <div>
                            <div className="text-2xl font-black uppercase tracking-tight">{supplierTradeName}</div>
                            <div className="text-xs text-purple-200 font-bold mt-0.5">Enterprise Tax Receipt &amp; GST Audit Sheet</div>
                            <span className="mt-2 inline-block px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-[10px] font-black uppercase tracking-widest rounded-full">B2B Verified Invoice</span>
                        </div>
                        <div className="text-right">
                            <span className="px-4 py-1.5 bg-emerald-400 text-slate-950 font-black text-xs rounded-full uppercase tracking-wider shadow-sm inline-block">PAID IN FULL ✓</span>
                            <div className="text-purple-100 text-xs font-bold mt-2">Date: Aug 13, 2026</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 px-6">
                        <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4">
                            <div className="text-[10px] font-black uppercase tracking-wider text-purple-600">Supplier / Billed From</div>
                            <div className="font-bold text-slate-900 text-sm mt-1">{supplierLegalName}</div>
                            <div className="text-slate-600 mt-1">{supplierAddress}, {supplierCity}, {supplierState}</div>
                            <div className="mt-2 font-bold text-slate-900 bg-white p-2 rounded-xl border border-purple-100">GSTIN: <span className="font-mono text-purple-700">{supplierGstin}</span></div>
                        </div>
                        <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-4">
                            <div className="text-[10px] font-black uppercase tracking-wider text-purple-600">Customer / Billed To</div>
                            <div className="font-bold text-slate-900 text-sm mt-1">Sarah Jenkins</div>
                            <div className="text-purple-700 font-bold">Apex Tech Solutions Ltd</div>
                            <div className="text-slate-600 mt-1">42 Financial District, Mumbai, Maharashtra</div>
                            <div className="mt-2 font-bold text-slate-900 bg-white p-2 rounded-xl border border-purple-100">Customer GSTIN: <span className="font-mono text-purple-700">27AAACA1234B1Z9</span></div>
                        </div>
                    </div>

                    <div className="px-6">
                        <table className="w-full text-left border-collapse overflow-hidden rounded-2xl border border-purple-100">
                            <thead>
                                <tr className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white text-[10px] uppercase font-bold tracking-wider">
                                    <th className="p-3">Service Description</th>
                                    <th className="p-3">SAC</th>
                                    <th className="p-3 text-right">Taxable</th>
                                    <th className="p-3 text-right">GST (18%)</th>
                                    <th className="p-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-100 bg-white font-semibold">
                                <tr>
                                    <td className="p-3 font-bold text-slate-900">Annual Pro Membership Plan (12 Months)</td>
                                    <td className="p-3 font-mono text-purple-700">{supplierSacCode}</td>
                                    <td className="p-3 text-right">₹422.88</td>
                                    <td className="p-3 text-right text-purple-700">₹76.12</td>
                                    <td className="p-3 text-right font-black text-purple-900 text-sm">₹499.00</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="mx-6 p-4 bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-2xl flex justify-between items-center">
                        <div>
                            <div className="text-[10px] text-purple-300 uppercase font-black tracking-widest">Grand Total Paid</div>
                            <div className="text-xl font-black text-amber-300 mt-0.5">₹499.00 INR</div>
                        </div>
                        <div className="text-right text-xs text-purple-200">
                            <div>Amount in Words: <strong className="text-white">Four Hundred Ninety Nine Rupees Only</strong></div>
                            <div className="text-[10px] text-purple-300 mt-1">Payment Method: Razorpay / UPI</div>
                        </div>
                    </div>
                </div>
            );
        }

        // ── 4. COMPACT STUB VOUCHER ────────────────────────────────────────────
        return (
            <div className="bg-slate-50 border-2 border-dashed border-slate-400 rounded-2xl p-6 text-xs text-slate-900 font-mono space-y-4 max-w-lg mx-auto shadow-sm">
                <div className="text-center border-b-2 border-dashed border-slate-400 pb-3">
                    <div className="text-lg font-black uppercase tracking-tight">{supplierTradeName}</div>
                    <div className="text-[10px] text-slate-600">{supplierLegalName}</div>
                    <div className="text-[10px] font-bold text-indigo-700 mt-1">GSTIN: {supplierGstin}</div>
                    <div className="mt-2 inline-block px-3 py-0.5 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest rounded">OFFICIAL RECEIPT STUB</div>
                </div>

                <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-3">
                    <div className="flex justify-between"><span>INVOICE NO:</span><span className="font-bold">{invoiceNo}</span></div>
                    <div className="flex justify-between"><span>DATE:</span><span>Aug 13, 2026</span></div>
                    <div className="flex justify-between"><span>CUSTOMER:</span><span className="font-bold">Sarah Jenkins</span></div>
                    <div className="flex justify-between"><span>COMPANY:</span><span>Apex Tech Solutions Ltd</span></div>
                    <div className="flex justify-between"><span>GSTIN:</span><span>27AAACA1234B1Z9</span></div>
                </div>

                <div className="space-y-2 border-b-2 border-dashed border-slate-400 pb-3 text-[11px]">
                    <div className="font-bold text-slate-900">ITEM: Annual Pro Membership (12 Mos)</div>
                    <div className="flex justify-between"><span>Taxable Value:</span><span>₹422.88</span></div>
                    <div className="flex justify-between"><span>CGST (9%):</span><span>₹38.06</span></div>
                    <div className="flex justify-between"><span>SGST (9%):</span><span>₹38.06</span></div>
                    <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300"><span>TOTAL PAID:</span><span>₹499.00</span></div>
                </div>

                <div className="text-center space-y-2 pt-1">
                    <div className="text-[10px] font-bold text-slate-600">AMOUNT IN WORDS:<br/><span className="text-slate-900 font-extrabold">Four Hundred Ninety Nine Rupees Only</span></div>
                    <div className="p-2 bg-white border border-slate-300 rounded font-mono text-[9px] text-slate-500 tracking-widest">
                        ||||||| | |||| |||||| || |||||||| |||||
                        <div className="text-[8px] text-slate-400 mt-0.5">TXN_SAMPLE_8849 · COMPUTER GENERATED STUB</div>
                    </div>
                </div>
            </div>
        );
    }

    printModalInvoice(inv) {
        if (!inv) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.setState({ invoiceNotice: 'Your browser blocked the invoice window. Allow pop-ups for this site, then try again.' });
            return;
        }

        const supplierTradeName = (this.state.supplierTradeName || 'ResumePilot AI').trim();
        const supplierLegalName = (this.state.supplierLegalName || 'ResumePilot Technologies Private Limited').trim();
        const supplierGstin = (this.state.supplierGstin || '').trim();
        const supplierPan = (this.state.supplierPan || '').trim();
        const supplierAddress = (this.state.supplierAddress || '').trim();
        const supplierCity = (this.state.supplierCity || '').trim();
        const supplierState = (this.state.supplierState || '').trim();
        const supplierStateCode = this.state.supplierStateCode ? String(this.state.supplierStateCode).padStart(2, '0') : (supplierGstin.length === 15 ? supplierGstin.substring(0, 2) : '27');
        const supplierPincode = (this.state.supplierPincode || '').trim();
        const supplierSacCode = this.state.sacCode || '998313';
        const supplierEmail = (this.state.supplierEmail || config.adminEmail || 'support@' + (typeof window !== 'undefined' ? window.location.hostname : 'airesume.projectdemo.guru')).trim();
        const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
        const isB2B = Boolean(gstin && gstin.length === 15);
        const isIssuedInvoice = inv.source === 'invoices' && Boolean(inv.invoiceNumber);
        const invoiceTitle = isIssuedInvoice ? (isB2B ? 'B2B GST Tax Invoice' : 'Tax Invoice') : 'Server-Verified Payment Receipt';
        const customerType = isB2B ? 'B2B Registered Entity' : 'B2C / Individual Customer';

        const billedCustomerName = inv.customerName || inv.customerSnapshot?.name || 'Valued Candidate';
        const customerEmail = inv.customerEmail || inv.customerSnapshot?.email || inv.userId || '';
        const customerCompany = inv.customerCompany || inv.customerSnapshot?.company || '';
        const customerAddress = inv.customerAddress || inv.customerSnapshot?.address || '';
        const customerCity = inv.customerCity || inv.customerSnapshot?.city || '';
        const customerState = inv.customerState || inv.customerSnapshot?.state || '';
        const customerStateCode = inv.customerStateCode ? String(inv.customerStateCode).padStart(2, '0') : (gstin.length === 15 ? gstin.substring(0, 2) : '');
        const customerCountry = inv.customerCountry || inv.customerSnapshot?.country || 'India';

        const txnId = inv.transactionId || inv.providerReference || inv.docId || 'Unavailable';
        const invoiceNo = isIssuedInvoice ? inv.invoiceNumber : `Receipt reference: ${inv.docId || txnId}`;
        const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
        const paymentMethod = inv.paymentType || inv.paimentType || inv.paymentMethod || 'Provider unavailable';
        const isRefunded = inv.status === 'Refunded';

        const totalPrice = Number(inv.price ?? inv.grandTotal ?? inv.amount ?? 0);
        const gstRate = Number(inv.taxRate || 0);
        const currency = String(inv.currency || 'UNKNOWN').toUpperCase();
        const currencySymbol = currency === 'INR' ? '₹' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : (currency === 'CAD' ? 'CA$' : '$')));

        const totalTax = Number(inv.taxAmount || 0);
        const taxableAmount = Number(inv.subtotal ?? (totalPrice - totalTax));

        const isIntraState = supplierStateCode === customerStateCode || (!customerStateCode && (currency === 'INR' || !inv.currency));
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
            const crore = Math.floor(n / 10000000); n %= 10000000;
            const lakh = Math.floor(n / 100000); n %= 100000;
            const thousand = Math.floor(n / 1000); n %= 1000;
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

        const planTitle = inv.planType || inv.planName || 'ResumePilot Pro Membership';

        // Dynamic Admin-Selected Receipt Template Style ('modern', 'classic', 'gradient', 'compact')
        const activeTemplateStyle = (inv.receiptTemplate || this.state.receiptTemplate || 'modern').toLowerCase();
        
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

        const templateStyles = `
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { height: 100%; font-family: ${fontFamily}; background: #f1f5f9; color: #0f172a; line-height: 1.4; }
            body { padding: 20px 10px; display: flex; flex-direction: column; align-items: center; }
            .invoice-card { 
                width: 210mm; max-width: 840px; min-height: 285mm; background: #ffffff; border-radius: 16px; 
                box-shadow: 0 20px 40px -12px rgba(15,23,42,0.12); border: ${cardBorder}; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; 
            }
            .invoice-content { padding: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
            .header-bar { background: ${headerBg}; color: #ffffff; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; position: relative; }
            .header-bar::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: ${headerBorder}; }
            .brand-title { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
            .brand-subtitle { font-size: 11px; color: #a5b4fc; font-weight: 700; margin-top: 2px; letter-spacing: 0.5px; text-transform: uppercase; }
            .copy-tag { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; font-size: 9px; font-weight: 800; padding: 3px 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; display: inline-block; }
            .paid-badge { background: rgba(16,185,129,0.15); border: 1.5px solid #10b981; color: #34d399; font-size: 12px; font-weight: 800; padding: 5px 16px; border-radius: 99px; text-transform: uppercase; letter-spacing: 1px; }
            .refunded-badge { background: rgba(239,68,68,0.15); border: 1.5px solid #ef4444; color: #f87171; font-size: 12px; font-weight: 800; padding: 5px 16px; border-radius: 99px; text-transform: uppercase; letter-spacing: 1px; }
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
            @page { size: A4 portrait; margin: 0; }
            @media print {
                .no-print { display: none !important; }
                html, body { width: 210mm !important; height: 297mm !important; margin: 0 !important; padding: 0 !important; background: #ffffff !important; overflow: hidden !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .invoice-card { width: 210mm !important; max-width: 210mm !important; height: 297mm !important; max-height: 297mm !important; margin: 0 !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; page-break-inside: avoid !important; page-break-after: avoid !important; overflow: hidden !important; }
            }
        `;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${invoiceTitle} - ${invoiceNo}</title>
                <style>${templateStyles}</style>
            </head>
            <body onload="setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 300)">
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
                                <div class="copy-tag">Official Administrative Audit Copy</div>
                            </div>
                            <div style="text-align: right;">
                                <div class="${isRefunded ? 'refunded-badge' : 'paid-badge'}">${isRefunded ? 'REFUNDED ↩' : 'PAID ✓'}</div>
                                <div style="font-size: 11px; color: #cbd5e1; font-weight: 700; margin-top: 6px;">Date: ${dateStr}</div>
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
                                <div class="c-val">${inv.reverseCharge || this.state.reverseCharge || 'No'}</div>
                            </div>
                            <div class="comp-item">
                                <div class="c-label">Customer Type</div>
                                <div class="c-val">${customerType}</div>
                            </div>
                        </div>

                        <!-- Meta Grid -->
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
                                <div class="val-sub">${supplierEmail}</div>
                            </div>

                            <div class="meta-box">
                                <div class="label">Billed To (Customer)</div>
                                <div class="val-bold">${billedCustomerName}</div>
                                ${customerCompany ? `<div class="val-sub" style="font-weight:700; color:#4f46e5;">${customerCompany}</div>` : ''}
                                ${(customerAddress || customerCity) ? `<div class="val-sub">${[customerAddress, customerCity, customerState, customerCountry].filter(Boolean).join(', ')}</div>` : `<div class="val-sub">${customerCountry}</div>`}
                                ${customerEmail ? `<div class="val-sub"><strong style="color:#0f172a">Email:</strong> ${customerEmail}</div>` : ''}
                                ${gstin ? `<div class="val-sub" style="margin-top:4px; background:#eef2ff; padding:3px 6px; border-radius:4px;"><strong style="color:#4338ca">Customer GSTIN:</strong> <span class="val-code">${gstin}</span></div>` : ''}
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
                                            <span style="font-size: 11px; color: #64748b;">AI Resume Builder, PDF Downloads &amp; Portfolio Access</span>
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

                        <!-- Payment Audit Record -->
                        <div class="audit-box" style="${isRefunded ? 'background:#fef2f2; border-color:#fecaca;' : ''}">
                            <div>
                                <div style="font-size: 9px; font-weight: 800; color: ${isRefunded ? '#991b1b' : '#166534'}; uppercase; letter-spacing: 0.5px;">Payment Verification Audit</div>
                                <div style="font-size: 12px; font-weight: 800; color: ${isRefunded ? '#7f1d1d' : '#14532d'}; margin-top: 1px;">
                                    Method: <strong>${paymentMethod}</strong> | Status: <span style="color: ${isRefunded ? '#dc2626' : '#059669'};">${isRefunded ? 'REFUNDED ↩' : 'PAID ✓'}</span>
                                </div>
                                <div style="font-size: 10px; color: ${isRefunded ? '#991b1b' : '#15803d'}; font-family: 'JetBrains Mono', monospace; margin-top: 1px;">
                                    Payment Ref / ID: ${txnId}
                                </div>
                                ${inv.refundReason ? `
                                    <div style="font-size: 10px; font-weight: 700; color: #dc2626; margin-top: 3px; font-family: sans-serif;">
                                        Refund Reason: ${inv.refundReason}
                                    </div>
                                ` : ''}
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 10px; font-weight: 700; color: ${isRefunded ? '#991b1b' : '#166534'};">Computer Generated Receipt</div>
                                <div style="font-size: 9px; color: ${isRefunded ? '#b91c1c' : '#15803d'};">No signature required under IT Act 2000</div>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="footer-bar">
                        Thank you for doing business with ${supplierTradeName}${supplierGstin ? ` (GSTIN: ${supplierGstin})` : ''}. Support: ${supplierEmail}.
                    </div>
                </div>
            </body>
            </html>
        `;

        writeSanitizedPrintDocument(printWindow, html);
        try {
            printWindow.focus();
        } catch (e) {}
        setTimeout(() => {
            try {
                printWindow.print();
            } catch (e) {
                console.error('Print window error:', e);
            }
        }, 400);
    }

    handleExportGSTR1CSV() {
        const invoices = this.state.adminInvoicesList || [];
        if (invoices.length === 0) {
            this.setState({ invoiceNotice: 'There are no invoices to export for the selected filters.' });
            return;
        }

        const headers = [
            'GSTIN/UIN of Recipient',
            'Receiver Name',
            'Invoice Number',
            'Invoice Date',
            'Invoice Value',
            'Place Of Supply',
            'Reverse Charge',
            'Applicable % of Tax Rate',
            'Invoice Type',
            'E-Commerce GSTIN',
            'Rate',
            'Taxable Value',
            'Cess Amount',
            'HSN/SAC',
            'Item Description'
        ];

        const rows = invoices.map((inv, idx) => {
            const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
            const name = inv.customerSnapshot?.name || inv.customerName || 'Valued Customer';
            const invNo = inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || `TXN_2026_${idx + 1001}`;
            const invDate = inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const priceVal = parseFloat(inv.price !== undefined ? inv.price : (inv.grandTotal || inv.amount || 199)).toFixed(2);
            const taxRate = parseFloat(inv.taxRate || this.state.taxRate || 18);
            const taxAmt = parseFloat(inv.totalTax !== undefined ? inv.totalTax : (inv.taxAmount || (priceVal * (taxRate / (100 + taxRate)))));
            const taxableVal = (parseFloat(priceVal) - taxAmt).toFixed(2);
            
            const supplierStateCode = this.state.supplierStateCode || '27';
            const supplierStateName = this.state.supplierState || 'Maharashtra';
            
            const custStateCode = inv.customerStateCode ? String(inv.customerStateCode).padStart(2, '0') : (gstin.length === 15 ? gstin.substring(0, 2) : supplierStateCode);
            const custStateName = inv.customerState || (custStateCode === supplierStateCode ? supplierStateName : 'Other State');
            const placeOfSupply = `${custStateCode}-${custStateName}`;
            
            const invType = gstin.length === 15 ? 'Regular' : 'B2C';
            const sacCode = this.state.sacCode || '998313';
            const itemDesc = 'AI Resume Builder Subscription';

            return [
                `"${gstin}"`,
                `"${name.replace(/"/g, '""')}"`,
                `"${invNo}"`,
                `"${invDate}"`,
                priceVal,
                `"${placeOfSupply}"`,
                '"N"',
                `"${taxRate}%"`,
                `"${invType}"`,
                '""',
                taxRate,
                taxableVal,
                '0.00',
                `"${sacCode}"`,
                `"${itemDesc}"`
            ].join(',');
        });

        const csvStr = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `GSTR1_Audit_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    handlePrintInvoicePDF(inv) {
        const win = window.open('', '_blank');
        if (!win) {
            this.setState({ invoiceNotice: 'Your browser blocked the invoice window. Allow pop-ups for this site, then try again.' });
            return;
        }

        const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
        const isB2B = Boolean(gstin && gstin.length === 15);
        const symbol = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : inv.currency === 'INR' ? '₹' : `${inv.currency || 'UNKNOWN'} `;
        const invNo = inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || 'TXN_SAMPLE';
        const priceVal = parseFloat(inv.price !== undefined ? inv.price : (inv.grandTotal || inv.amount || 199)).toFixed(2);
        const taxRate = parseFloat(inv.taxRate || this.state.taxRate || 18);
        const taxAmt = parseFloat(inv.totalTax !== undefined ? inv.totalTax : (inv.taxAmount || (priceVal * (taxRate / (100 + taxRate))))).toFixed(2);
        const taxableVal = (parseFloat(priceVal) - parseFloat(taxAmt)).toFixed(2);
        const cgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
        const sgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
        const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-IN');

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8"/>
                <title>Tax Invoice ${invNo} - ResumePilot AI</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.5; font-size: 13px; }
                    .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 24px; margin-bottom: 24px; }
                    .brand { font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
                    .badge { display: inline-block; padding: 4px 10px; background: #dcfce7; color: #166534; font-weight: 700; border-radius: 20px; font-size: 11px; text-transform: uppercase; margin-top: 4px; }
                    .inv-title { text-align: right; }
                    .inv-title h1 { font-size: 22px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
                    .inv-meta { font-size: 12px; color: #64748b; margin-top: 6px; }
                    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #f1f5f9; }
                    .party-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
                    .party-name { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
                    .party-detail { font-size: 12px; color: #334155; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
                    th { background: #0f172a; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px; text-align: left; }
                    td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
                    .number { text-align: right; font-family: monospace; }
                    .totals { display: flex; justify-content: flex-end; margin-bottom: 32px; }
                    .totals-table { width: 320px; border-collapse: collapse; }
                    .totals-table td { padding: 8px 12px; }
                    .grand-total { font-size: 16px; font-weight: 800; color: #4f46e5; border-top: 2px solid #0f172a; }
                    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; }
                    .sig-box { text-align: right; margin-top: 20px; margin-bottom: 30px; }
                    .sig-line { display: inline-block; border-top: 1px solid #cbd5e1; width: 200px; text-align: center; padding-top: 6px; font-weight: 700; color: #475569; font-size: 11px; }
                    @media print {
                        body { padding: 0; background: #fff; }
                        .invoice-card { border: none; box-shadow: none; padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom:20px; text-align:center;">
                    <button onclick="window.print()" style="padding:10px 24px; background:#4f46e5; color:#fff; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:14px; shadow:0 2px 4px rgba(0,0,0,0.1);">🖨️ Print / Save PDF Invoice</button>
                </div>
                <div class="invoice-card">
                    <div class="header">
                        <div>
                            <div class="brand">${this.state.supplierTradeName || 'ResumePilot AI'}</div>
                            <div style="font-size:12px; color:#475569; font-weight:bold; margin-top:2px;">${this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                            <div class="badge" style="${inv.status === 'Refunded' ? 'background:#fee2e2; color:#991b1b;' : ''}">${inv.status === 'Refunded' ? 'REFUNDED ↩' : 'PAID IN FULL ✓'}</div>
                        </div>
                        <div class="inv-title">
                            <h1>${isB2B ? 'TAX INVOICE' : 'PAYMENT RECEIPT'}</h1>
                            <div class="inv-meta">
                                <div>Invoice No: <strong style="color:#0f172a;">${invNo}</strong></div>
                                <div>Date: ${dateStr}</div>
                                <div>Payment Method: <strong>${inv.paimentType || 'Razorpay / Stripe'}</strong></div>
                            </div>
                        </div>
                    </div>

                    <div class="parties">
                        <div>
                            <div class="party-title">Supplier / Billed From</div>
                            <div class="party-name">${this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                            <div class="party-detail">${this.state.supplierAddress || 'Unit 402, BKC'}, ${this.state.supplierCity || 'Mumbai'}, ${this.state.supplierState || 'Maharashtra'} - ${this.state.supplierPincode || '400051'}</div>
                            <div class="party-detail" style="margin-top:6px;"><strong>GSTIN:</strong> ${this.state.supplierGstin || '27AABCU9603R1ZM'} | <strong>PAN:</strong> ${this.state.supplierPan || 'AABCU9603R'}</div>
                            <div class="party-detail"><strong>SAC Code:</strong> ${this.state.sacCode || '998313'} (Online Software Services)</div>
                        </div>
                        <div>
                            <div class="party-title">Customer / Billed To</div>
                            <div class="party-name">${inv.customerSnapshot?.name || inv.customerName || 'Valued Candidate'}</div>
                            <div class="party-detail">${inv.customerSnapshot?.email || inv.customerEmail || inv.userId || 'Customer'}</div>
                            ${isB2B ? `<div class="party-detail" style="margin-top:6px; color:#4f46e5; font-weight:bold;"><strong>GSTIN:</strong> ${gstin}</div><div class="party-detail"><strong>Invoice Type:</strong> B2B Corporate Supply</div>` : `<div class="party-detail" style="margin-top:6px;"><strong>Invoice Type:</strong> B2C Consumer Sale</div>`}
                            <div class="party-detail"><strong>Place of Supply:</strong> State Code ${this.state.supplierStateCode || '27'} (Maharashtra)</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Description of Service</th>
                                <th>SAC</th>
                                <th class="number">Base Price</th>
                                <th class="number">GST Tax (${taxRate}%)</th>
                                <th class="number">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>${inv.planType || 'ResumePilot Pro Membership'}</strong>
                                    <div style="font-size:11px; color:#64748b; margin-top:2px;">AI Resume Builder, PDF Downloads & Portfolio Hosting Access</div>
                                </td>
                                <td>${this.state.sacCode || '998313'}</td>
                                <td class="number">${symbol}${taxableVal}</td>
                                <td class="number">${symbol}${taxAmt}</td>
                                <td class="number" style="font-weight:bold;">${symbol}${priceVal}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="totals">
                        <table class="totals-table">
                            <tr>
                                <td>Subtotal (Taxable Value):</td>
                                <td class="number">${symbol}${taxableVal}</td>
                            </tr>
                            ${inv.currency === 'INR' || !inv.currency ? `
                            <tr>
                                <td>CGST (9%):</td>
                                <td class="number">${symbol}${cgstAmt}</td>
                            </tr>
                            <tr>
                                <td>SGST (9%):</td>
                                <td class="number">${symbol}${sgstAmt}</td>
                            </tr>
                            ` : `
                            <tr>
                                <td>Sales Tax / GST (${taxRate}%):</td>
                                <td class="number">${symbol}${taxAmt}</td>
                            </tr>
                            `}
                            <tr class="grand-total">
                                <td>Grand Total:</td>
                                <td class="number">${symbol}${priceVal}</td>
                            </tr>
                        </table>
                    </div>

                    <div class="sig-box">
                        <div class="sig-line">Authorized Signatory<br/><span style="font-weight:normal; color:#94a3b8; font-size:10px;">${this.state.supplierTradeName || 'ResumePilot AI'} Finance Team</span></div>
                    </div>

                    <div class="footer">
                        <p>This is a computer-generated Tax Invoice issued under Rule 46 of CGST Rules 2017. No signature required.</p>
                        <p style="margin-top:4px;">Thank you for choosing ${this.state.supplierTradeName || 'ResumePilot AI'}!</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        writeSanitizedPrintDocument(win, html);
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

    openWindowPrintPreview(templateId) {
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
        writeSanitizedPrintDocument(printWindow, invoiceHtml);
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

    handlePaytmToggle() {
        this.setState((prevState) => ({ checkedPaytm: !prevState.checkedPaytm }));
    }

    handlePhonePeToggle() {
        this.setState((prevState) => ({ checkedPhonePe: !prevState.checkedPhonePe }));
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
            checkedPaytm: true,
            checkedPhonePe: true,
            checkedSubscriptions: true,
            sandboxMode: false
        });
    }



    async handleToggleCouponsModule() {
        const nextState = !this.state.enableCouponsModule;
        this.setState({ enableCouponsModule: nextState });

        try {
            await saveSystemSettings('modules', { enableCouponsModule: nextState });

            window.dispatchEvent(new CustomEvent('systemSettingsUpdated', {
                detail: {
                    category: 'modules',
                    modules: { enableCouponsModule: nextState },
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
                revision: Number(c.revision || 0),
            },
            showCouponModal: true,
            couponErrorMsg: '',
        });
    }

    async handleSaveCouponForm(e) {
        if (e) e.preventDefault();
        const { code, discount, description, active, expiryDate, maxUses, singleUsePerUser, revision } = this.state.couponForm;
        if (!code || !code.trim()) {
            this.setState({ couponErrorMsg: 'Please enter a valid coupon code (e.g. SUMMER50).' });
            return;
        }

        const res = await saveCoupon(code.trim(), discount, description, active, {
            expiryDate,
            maxUses,
            singleUsePerUser,
            revision,
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
        const result = await saveCoupon(c.code, c.discount, c.description, !c.active, {
            expiryDate: c.expiryDate, maxUses: c.maxUses, singleUsePerUser: c.singleUsePerUser, revision: c.revision,
        });
        if (!result.success) { this.setState({ couponErrorMsg: result.error || 'Coupon could not be updated.' }); return; }
        await this.fetchAdminCoupons();
    }

    handleDeleteCouponCode(code) {
        this.setState({ deleteConfirmCode: code });
    }

    async confirmDeleteCouponCode() {
        const code = this.state.deleteConfirmCode;
        if (!code) return;
        this.setState({ isDeleting: true });
        const coupon = this.state.adminCoupons.find(item => item.code === code);
        const res = await deleteCoupon(code, coupon?.revision || 0);
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

    async submitHandler() {
        try {
            await setSubscriptionsData(
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
                paytmEnabled: this.state.checkedPaytm,
                phonepeEnabled: this.state.checkedPhonePe,
                sandboxMode: this.state.sandboxMode,
                razorpayKeyId: this.state.razorpayKeyId,
                razorpayKeySecret: this.state.razorpayKeySecret,
                stripePublishableKey: this.state.stripePublishableKey,
                stripeSecretKey: this.state.stripeSecretKey,
                paypalClientId: this.state.paypalClientId,
                paypalClientSecret: this.state.paypalClientSecret,
                paytmMid: this.state.paytmMid,
                paytmMerchantKey: this.state.paytmMerchantKey,
                paytmWebsite: this.state.paytmWebsite || 'WEBSTAGING',
                phonepeId: this.state.phonepeId,
                phonepeSaltKey: this.state.phonepeSaltKey,
                phonepeSaltIndex: this.state.phonepeSaltIndex || '1',
                enableTax: this.state.enableTax,
                taxName: this.state.taxName,
                taxRate: parseFloat(this.state.taxRate) || 0,
                taxInclusive: this.state.taxInclusive,
                companyTaxId: this.state.companyTaxId || this.state.supplierGstin,
                supplierLegalName: this.state.supplierLegalName,
                supplierTradeName: this.state.supplierTradeName,
                supplierGstin: this.state.supplierGstin || this.state.companyTaxId,
                supplierPan: this.state.supplierPan,
                supplierAddress: this.state.supplierAddress,
                supplierCity: this.state.supplierCity,
                supplierState: this.state.supplierState,
                supplierStateCode: this.state.supplierStateCode,
                supplierPincode: this.state.supplierPincode,
                sacCode: this.state.sacCode,
                invoicePrefix: this.state.invoicePrefix,
                financialYear: this.state.financialYear,
                requireCustomerTaxId: this.state.requireCustomerTaxId,
                receiptTemplate: this.state.receiptTemplate || 'modern',
                reverseCharge: this.state.reverseCharge || 'No',
            }
        );
        this.setState({ isSuccessOpen: true });
            setTimeout(() => {
                this.setState({ isSuccessOpen: false });
            }, 3000);
        } catch (error) {
            this.setState({ couponErrorMsg: error.message || 'Unable to save payment settings.' });
        }
    }

    handleClose() {
        this.setState({ isSuccessOpen: false });
    }

    render() {
        const currencySymbol = this.state.currency === 'INR' ? '₹' : this.state.currency === 'USD' ? '$' : this.state.currency === 'EUR' ? '€' : '£';

        return (
            <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
                {this.state.invoiceNotice && (
                    <div
                        role="alert"
                        data-testid="invoice-notice"
                        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2"
                    >
                        <span className="flex-1">{this.state.invoiceNotice}</span>
                        <button
                            type="button"
                            onClick={() => this.setState({ invoiceNotice: null })}
                            className="underline underline-offset-2"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
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

                {/* --- ELEGANT 5-TAB NAVIGATION BAR --- */}
                <div className="bg-slate-900 p-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-md">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => this.setState({ adminTab: 'gateways' })}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'gateways'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaFlask className="w-3.5 h-3.5" />
                            <span>Gateway &amp; API Keys</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => this.setState({ adminTab: 'gst' })}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'gst'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaShieldAlt className="w-3.5 h-3.5" />
                            <span>Business &amp; GST Details</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => this.setState({ adminTab: 'plans' })}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'plans'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaRupeeSign className="w-3.5 h-3.5" />
                            <span>Pricing &amp; Currency</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => this.setState({ adminTab: 'coupons' })}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'coupons'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaTag className="w-3.5 h-3.5" />
                            <span>Promo Coupons ({this.state.couponsList.length})</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                this.setState({ adminTab: 'invoices' });
                                this.fetchAdminInvoices();
                            }}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'invoices'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaListAlt className="w-3.5 h-3.5" />
                            <span>Invoices Audit Ledger ({this.state.adminInvoicesList.length})</span>
                        </button>
                    </div>
                </div>

                {/* --- TAB 5: INVOICES AUDIT LEDGER / ORDERS MANAGEMENT --- */}
                {this.state.adminTab === 'invoices' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-6">
                        {/* Order Success Toast Banner */}
                        {this.state.orderSuccessToast && (
                            <div role="status" aria-live="polite" className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
                                <span>✅ {this.state.orderSuccessToast}</span>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ orderSuccessToast: '' })}
                                    className="text-emerald-500 hover:text-emerald-800"
                                >
                                    <FaTimes className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        {this.state.orderErrorToast && <div role="alert" className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-900"><span>{this.state.orderErrorToast}</span><button type="button" aria-label="Dismiss refund error" onClick={() => this.setState({ orderErrorToast: '' })}><FaTimes /></button></div>}

                        {(() => {
                            const rawList = this.state.adminInvoicesList || [];
                            const paidList = rawList.filter(inv => inv.status === 'Completed' || inv.status === 'Paid' || inv.status === 'PAID');
                            const refundedList = rawList.filter(inv => inv.status === 'Refunded' || inv.status === 'REFUNDED');
                            const failedList = rawList.filter(inv => inv.status === 'Failed' || inv.status === 'FAILED');
                            const pendingList = rawList.filter(inv => inv.status === 'Pending' || inv.status === 'PENDING');

                            const totalGross = paidList.reduce((acc, inv) => acc + (parseFloat(inv.price !== undefined ? inv.price : (inv.amount || 0)) || 0), 0);
                            const refundedVal = refundedList.reduce((acc, inv) => acc + (parseFloat(inv.price !== undefined ? inv.price : (inv.amount || 0)) || 0), 0);
                            const netRev = totalGross - refundedVal;
                            const ledgerCurrencies = new Set([...paidList, ...refundedList].map(item => item.currency).filter(Boolean));
                            const summaryCurrency = ledgerCurrencies.size === 1 ? [...ledgerCurrencies][0] : null;
                            const summarySymbol = summaryCurrency === 'INR' ? '₹' : summaryCurrency === 'USD' ? '$' : summaryCurrency === 'EUR' ? '€' : summaryCurrency ? `${summaryCurrency} ` : '';
                            const grossDisplay = summaryCurrency ? `${summarySymbol}${totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Multiple currencies';
                            const netDisplay = summaryCurrency ? `${summarySymbol}${netRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Unavailable';

                            return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xs space-y-1 border border-slate-800">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gross Volume</div>
                                        <div className="text-xl font-black font-mono">{grossDisplay}</div>
                                        <div className="text-[10px] text-slate-400">{paidList.length} Confirmed Paid Orders</div>
                                    </div>
                                    <div className="bg-emerald-900 text-white p-4 rounded-2xl shadow-xs space-y-1 border border-emerald-800">
                                        <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Net Revenue</div>
                                        <div className="text-xl font-black font-mono">{netDisplay}</div>
                                        <div className="text-[10px] text-emerald-300">Revenue Excluding Refunds</div>
                                    </div>
                                    <div className="bg-rose-950 text-white p-4 rounded-2xl shadow-xs space-y-1 border border-rose-900">
                                        <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider">Failed Checkouts</div>
                                        <div className="text-xl font-black font-mono">{failedList.length + pendingList.length} Orders</div>
                                        <div className="text-[10px] text-rose-300">{failedList.length} Failed / {pendingList.length} Pending</div>
                                    </div>
                                    <div className="bg-purple-950 text-white p-4 rounded-2xl shadow-xs space-y-1 border border-purple-900">
                                        <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Refunds Issued</div>
                                        <div className="text-xl font-black font-mono">{summaryCurrency ? `${summarySymbol}${refundedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Multiple currencies'}</div>
                                        <div className="text-[10px] text-purple-300">{refundedList.length} Orders Refunded</div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="border-b border-slate-100 pb-4 space-y-4">
                            {/* Header Row 1: Title & Export Button */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FaFileInvoice className="w-4 h-4 text-indigo-600" />
                                        <span>Master Orders &amp; Transactions Audit Ledger</span>
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Latest server-authoritative payment, invoice, and legacy ledger records (up to 200 per source), with provider-confirmed refunds</p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={this.fetchAdminInvoices}
                                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                        <span>🔄 Sync Database</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleExportGSTR1CSV}
                                        className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                                    >
                                        <FaDownload className="w-3.5 h-3.5" />
                                        <span>Export GSTR-1 CSV</span>
                                    </button>
                                </div>
                            </div>

                            {/* Header Row 2: Search Bar & Multi-Filters */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                                <div className="relative">
                                    <FaSearch className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={this.state.invoiceSearchQuery}
                                        onChange={(e) => this.setState({ invoiceSearchQuery: e.target.value })}
                                        placeholder="Search TXN_..., candidate, GSTIN..."
                                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <select
                                    value={this.state.invoiceTypeFilter}
                                    onChange={(e) => this.setState({ invoiceTypeFilter: e.target.value })}
                                    className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                >
                                    <option value="all">All Types (B2B &amp; B2C)</option>
                                    <option value="b2b">B2B Invoices Only</option>
                                    <option value="b2c">B2C Receipts Only</option>
                                </select>
                                <select
                                    value={this.state.invoiceGatewayFilter}
                                    onChange={(e) => this.setState({ invoiceGatewayFilter: e.target.value })}
                                    className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                >
                                    <option value="all">All Gateways</option>
                                    <option value="razorpay">Razorpay UPI</option>
                                    <option value="stripe">Stripe Cards</option>
                                    <option value="paypal">PayPal Express</option>
                                </select>
                                <select
                                    value={this.state.invoiceStatusFilter}
                                    onChange={(e) => this.setState({ invoiceStatusFilter: e.target.value })}
                                    className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="completed">Paid / Completed Only</option>
                                    <option value="pending">Pending Only</option>
                                    <option value="failed">Failed / Unpaid Only</option>
                                    <option value="refunded">Refunded Only</option>
                                </select>
                            </div>
                        </div>

                        {this.state.loadingInvoices ? (
                            <div className="p-8 text-center text-slate-500 text-xs font-bold">
                                Loading site-wide invoice audit records...
                            </div>
                        ) : (() => {
                            const query = this.state.invoiceSearchQuery.toLowerCase().trim();
                            const filterType = this.state.invoiceTypeFilter;
                            const filterGw = this.state.invoiceGatewayFilter;
                            const filterStatus = this.state.invoiceStatusFilter;

                            const filtered = (this.state.adminInvoicesList || []).filter(inv => {
                                const invNo = (inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || '').toLowerCase();
                                const name = (inv.customerSnapshot?.name || inv.customerName || '').toLowerCase();
                                const email = (inv.customerSnapshot?.email || inv.customerEmail || '').toLowerCase();
                                const gstin = (inv.customerSnapshot?.gstin || inv.customerGstin || '').toLowerCase();
                                const gw = (inv.paimentType || '').toLowerCase();
                                const status = (inv.status || 'unknown').toLowerCase();
                                const isB2B = Boolean(gstin && gstin.length === 15);

                                const matchesQuery = !query || invNo.includes(query) || name.includes(query) || email.includes(query) || gstin.includes(query);
                                const matchesType = filterType === 'all' || (filterType === 'b2b' && isB2B) || (filterType === 'b2c' && !isB2B);
                                const matchesGw = filterGw === 'all' || gw.includes(filterGw);
                                const matchesStatus = filterStatus === 'all' ||
                                    (filterStatus === 'completed' && (status === 'completed' || status === 'paid')) ||
                                    (filterStatus === 'pending' && status === 'pending') ||
                                    (filterStatus === 'failed' && status === 'failed') ||
                                    (filterStatus === 'refunded' && status === 'refunded');

                                return matchesQuery && matchesType && matchesGw && matchesStatus;
                            });

                            if (filtered.length === 0) {
                                return (
                                    <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
                                        <FaFileInvoice className="w-10 h-10 text-slate-300 mx-auto" />
                                        <p className="text-sm font-bold text-slate-700">No Orders Found</p>
                                        <p className="text-xs text-slate-500">No customer transactions match your selected search or filter criteria.</p>
                                    </div>
                                );
                            }

                            return (
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse min-w-[850px]">
                                        <thead>
                                            <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                                                <th className="p-3">Transaction &amp; Date</th>
                                                <th className="p-3">Customer, Gateway &amp; Status</th>
                                                <th className="p-3 text-right">Amount &amp; Tax Breakdown</th>
                                                <th className="p-3 text-right">Enterprise Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {filtered.map((inv, idx) => {
                                                const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
                                                const isB2B = Boolean(gstin && gstin.length === 15);
                                                const symbol = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : inv.currency === 'INR' ? '₹' : `${inv.currency || 'UNKNOWN'} `;
                                                const invNo = inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || `TXN_${idx}`;
                                                const priceVal = inv.price !== undefined ? inv.price : (inv.grandTotal || inv.amount || 199);
                                                const tax = inv.totalTax !== undefined ? inv.totalTax : (inv.taxAmount || 0);
                                                const taxable = inv.subtotal !== undefined ? inv.subtotal : (priceVal - tax);
                                                
                                                const status = (inv.status || 'Unknown').toLowerCase();
                                                const isPaid = status === 'completed' || status === 'paid';
                                                const isRefunded = status === 'refunded';
                                                const isFailed = status === 'failed';
                                                const isPending = status === 'pending';

                                                return (
                                                    <tr key={inv.docId || inv.transactionId || idx} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="p-3">
                                                            <div className="font-mono font-bold text-indigo-950 text-[11px]">{invNo}</div>
                                                            <div className="text-[10px] text-slate-500 mt-0.5">{inv.formattedDate || (inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN') : 'Recent')}</div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-slate-900 text-xs">
                                                                    {inv.customerName || inv.customerSnapshot?.name || 'Candidate'}
                                                                </span>
                                                                {isPaid && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                                                                        PAID ✓
                                                                    </span>
                                                                )}
                                                                {isRefunded && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 whitespace-nowrap">
                                                                        REFUNDED ↩
                                                                    </span>
                                                                )}
                                                                {isFailed && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">
                                                                        FAILED ✖
                                                                    </span>
                                                                )}
                                                                {isPending && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                                                        PENDING ⏳
                                                                    </span>
                                                                )}
                                                                {!isPaid && !isRefunded && !isFailed && !isPending && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold text-slate-700">STATUS UNKNOWN</span>}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                                {inv.customerEmail || inv.customerSnapshot?.email || inv.userId || ''}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${isB2B ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                                                    {inv.paimentType || 'Provider unknown'} {isB2B ? '• B2B' : '• B2C'}
                                                                </span>
                                                                {isB2B && <span className="font-mono text-[9px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">GST: {gstin}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono">
                                                            <div className="font-extrabold text-slate-900 text-sm">{symbol}{parseFloat(priceVal).toFixed(2)}</div>
                                                            <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1.5 mt-0.5 whitespace-nowrap">
                                                                <span>Net: {symbol}{parseFloat(taxable).toFixed(2)}</span>
                                                                <span className="text-slate-300">•</span>
                                                                <span className="text-indigo-600 font-bold">GST: {symbol}{parseFloat(tax).toFixed(2)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                                                {(isPaid || isRefunded) && <button
                                                                    type="button"
                                                                    onClick={() => this.handleOpenPDFModal(inv)}
                                                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] transition-colors border border-indigo-200 cursor-pointer inline-flex items-center gap-1"
                                                                >
                                                                    <FaPrint className="w-3 h-3" />
                                                                    <span>{inv.source === 'invoices' && inv.invoiceNumber ? 'View invoice' : 'View receipt'}</span>
                                                                </button>}
                                                                {isPaid && inv.source === 'payment_orders' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => this.handleOpenRefundModal(inv)}
                                                                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-[11px] transition-colors border border-rose-200 cursor-pointer inline-flex items-center gap-1"
                                                                    >
                                                                        <span>Refund</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* --- ELEGANT IN-APP PDF TAX INVOICE MODAL --- */}
                {this.state.pdfModalInvoice && (
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                            {/* Modal Header Bar */}
                            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <FaFileInvoice className="w-5 h-5 text-indigo-400" />
                                    <div>
                                        <h3 className="font-bold text-sm text-white">Tax Invoice &amp; Payment Receipt</h3>
                                        <p className="text-[11px] text-slate-400 font-mono">Reference: {this.state.pdfModalInvoice.transactionId || this.state.pdfModalInvoice.id}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => this.printModalInvoice(this.state.pdfModalInvoice)}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                                    >
                                        <FaPrint className="w-3.5 h-3.5" />
                                        <span>Print / Save PDF</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleClosePDFModal}
                                        className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer rounded-lg"
                                    >
                                        <FaTimes className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Invoice Sheet Document */}
                            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-slate-50/50">
                                {(() => {
                                    const inv = this.state.pdfModalInvoice;
                                    const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
                                    const isB2B = Boolean(gstin && gstin.length === 15);
                                    const symbol = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : inv.currency === 'INR' ? '₹' : `${inv.currency || 'UNKNOWN'} `;
                                    const invNo = inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || 'TXN_INV';
                                    const priceVal = parseFloat(inv.price !== undefined ? inv.price : (inv.grandTotal || inv.amount || 199)).toFixed(2);
                                    const taxRate = parseFloat(inv.taxRate || this.state.taxRate || 18);
                                    const taxAmt = parseFloat(inv.totalTax !== undefined ? inv.totalTax : (inv.taxAmount || (priceVal * (taxRate / (100 + taxRate))))).toFixed(2);
                                    const taxableVal = (parseFloat(priceVal) - parseFloat(taxAmt)).toFixed(2);
                                    const cgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
                                    const sgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
                                    const dateStr = inv.formattedDate || (inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-IN'));
                                    const status = (inv.status || 'Unknown').toLowerCase();

                                    return (
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-xs text-slate-800">
                                            {/* Invoice Brand Header */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-5 gap-4">
                                                <div>
                                                    <div className="text-xl font-extrabold text-indigo-600 tracking-tight">{this.state.supplierTradeName || 'ResumePilot AI'}</div>
                                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                                                    <div className="mt-2">
                                                        {status === 'completed' || status === 'paid' ? (
                                                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-black text-[10px] uppercase">
                                                                PAID IN FULL ✓
                                                            </span>
                                                        ) : status === 'refunded' ? (
                                                            <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full font-black text-[10px] uppercase">
                                                                REFUNDED ↩
                                                            </span>
                                                        ) : status === 'failed' ? (
                                                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-black text-[10px] uppercase">
                                                                FAILED ✖
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full font-black text-[10px] uppercase">
                                                                PENDING ⏳
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <h2 className="text-lg font-black text-slate-900 tracking-wide uppercase">{isB2B ? 'TAX INVOICE' : 'PAYMENT RECEIPT'}</h2>
                                                    <div className="text-slate-500 text-xs mt-1 space-y-0.5">
                                                        <div>Invoice No: <span className="font-mono font-bold text-slate-900">{invNo}</span></div>
                                                        <div>Date: <span className="font-semibold text-slate-800">{dateStr}</span></div>
                                                        <div>Gateway: <span className="font-semibold text-slate-800">{inv.paymentType || inv.paimentType || 'Razorpay / Stripe'}</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Supplier & Customer Cards */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Supplier / Billed From</div>
                                                    <div className="font-bold text-slate-900 text-sm mt-1">{this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                                                    <div className="text-slate-600 mt-1 space-y-0.5">
                                                        <div>{this.state.supplierAddress || 'Unit 402, BKC'}, {this.state.supplierCity || 'Mumbai'}, {this.state.supplierState || 'Maharashtra'} - {this.state.supplierPincode || '400051'}</div>
                                                        <div className="pt-1 font-semibold text-slate-800">GSTIN: {this.state.supplierGstin || '27AABCU9603R1ZM'} | PAN: {this.state.supplierPan || 'AABCU9603R'}</div>
                                                        <div>SAC Code: <span className="font-mono font-bold text-indigo-700">{this.state.sacCode || '998313'}</span> (Online Software Services)</div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Customer / Billed To</div>
                                                    <div className="font-bold text-slate-900 text-sm mt-1">{inv.customerName || inv.customerSnapshot?.name || 'Valued Candidate'}</div>
                                                    <div className="text-slate-600 mt-1 space-y-0.5">
                                                        <div className="font-mono">{inv.customerEmail || inv.customerSnapshot?.email || inv.userId || 'Customer'}</div>
                                                        {isB2B ? (
                                                            <div className="pt-1 font-bold text-indigo-600">Corporate GSTIN: {gstin}</div>
                                                        ) : (
                                                            <div className="pt-1 font-medium text-slate-600">Invoice Type: B2C Consumer Sale</div>
                                                        )}
                                                        <div>Place of Supply: State Code {this.state.supplierStateCode || '27'} (Maharashtra)</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Itemized Table */}
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-900 text-white text-[11px] font-extrabold uppercase">
                                                        <th className="p-2.5 text-left rounded-l-lg">Description of Service</th>
                                                        <th className="p-2.5 text-center">SAC Code</th>
                                                        <th className="p-2.5 text-right">Base Price</th>
                                                        <th className="p-2.5 text-right">GST ({taxRate}%)</th>
                                                        <th className="p-2.5 text-right rounded-r-lg">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-medium">
                                                    <tr>
                                                        <td className="p-3">
                                                            <div className="font-bold text-slate-900">{inv.planType || 'ResumePilot Pro Membership'}</div>
                                                            <div className="text-[11px] text-slate-500">AI Resume Builder, PDF Downloads &amp; Portfolio Hosting Access</div>
                                                        </td>
                                                        <td className="p-3 text-center font-mono text-slate-700">{this.state.sacCode || '998313'}</td>
                                                        <td className="p-3 text-right font-mono text-slate-700">{symbol}{taxableVal}</td>
                                                        <td className="p-3 text-right font-mono text-slate-700">{symbol}{taxAmt}</td>
                                                        <td className="p-3 text-right font-mono font-extrabold text-slate-900">{symbol}{priceVal}</td>
                                                    </tr>
                                                </tbody>
                                            </table>

                                            {/* Summary Table */}
                                            <div className="flex justify-end">
                                                <div className="w-72 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                                                    <div className="flex justify-between text-slate-600">
                                                        <span>Taxable Subtotal:</span>
                                                        <span className="font-mono font-bold text-slate-800">{symbol}{taxableVal}</span>
                                                    </div>
                                                    {inv.currency === 'INR' || !inv.currency ? (
                                                        <>
                                                            <div className="flex justify-between text-slate-600">
                                                                <span>CGST (9%):</span>
                                                                <span className="font-mono font-bold text-slate-800">{symbol}{cgstAmt}</span>
                                                            </div>
                                                            <div className="flex justify-between text-slate-600">
                                                                <span>SGST (9%):</span>
                                                                <span className="font-mono font-bold text-slate-800">{symbol}{sgstAmt}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="flex justify-between text-slate-600">
                                                            <span>Sales Tax / GST ({taxRate}%):</span>
                                                            <span className="font-mono font-bold text-slate-800">{symbol}{taxAmt}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-sm font-extrabold text-indigo-700 border-t border-slate-300 pt-2 mt-1">
                                                        <span>Grand Total:</span>
                                                        <span className="font-mono">{symbol}{priceVal}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Signatory & Legal Disclaimer */}
                                            <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-3">
                                                <div>
                                                    <p>This is a computer-generated Tax Invoice issued under Rule 46 of CGST Rules 2017.</p>
                                                    <p className="mt-0.5">Thank you for choosing {this.state.supplierTradeName || 'ResumePilot AI'}!</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="border-t border-slate-300 pt-1 font-bold text-slate-600 text-xs">Authorized Signatory</div>
                                                    <div className="text-[10px] text-slate-400">{this.state.supplierTradeName || 'ResumePilot AI'} Finance Team</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ENTERPRISE 1-CLICK REFUND MODAL --- */}
                {this.state.refundModalInvoice && (
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
                            {/* Modal Header */}
                            <div className="bg-rose-950 text-white px-6 py-4 flex items-center justify-between border-b border-rose-900">
                                <div className="flex items-center gap-2">
                                    <FaUndo className="w-4 h-4 text-rose-400" />
                                    <h3 className="font-bold text-sm">Issue Order Refund &amp; Revoke Pass</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleCloseRefundModal}
                                    className="text-rose-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg"
                                >
                                    <FaTimes className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 space-y-4 text-xs text-slate-700">
                                <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl space-y-1">
                                    <div className="font-bold text-rose-900 text-sm">
                                        Order TXN ID: <span className="font-mono">{this.state.refundModalInvoice.transactionId || this.state.refundModalInvoice.id}</span>
                                    </div>
                                    <div className="text-rose-800">
                                        Customer: <strong>{this.state.refundModalInvoice.customerName || 'Candidate'}</strong> ({this.state.refundModalInvoice.customerEmail || 'No Email'})
                                    </div>
                                    <div className="text-rose-900 font-extrabold font-mono text-sm pt-0.5">
                                        Refund Amount: {this.state.refundModalInvoice.currency === 'USD' ? '$' : '₹'}{this.state.refundModalInvoice.price || 199} via {this.state.refundModalInvoice.paymentType || this.state.refundModalInvoice.paimentType || 'Gateway'}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-slate-800 block text-xs">Primary Refund Reason</label>
                                    <select
                                        value={this.state.refundReason}
                                        onChange={(e) => this.setState({ refundReason: e.target.value })}
                                        className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl font-medium outline-none focus:bg-white focus:border-rose-500"
                                    >
                                        <option value="Customer requested cancellation & refund">Customer requested cancellation &amp; refund</option>
                                        <option value="Duplicate payment / Accidental double checkout">Duplicate payment / Accidental double checkout</option>
                                        <option value="Unsatisfied with service quality">Unsatisfied with service quality</option>
                                        <option value="Fraudulent / Unauthorized credit card transaction">Fraudulent / Unauthorized credit card transaction</option>
                                        <option value="Custom admin override">Custom admin override</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-slate-800 block text-xs">Admin Notes (Optional)</label>
                                    <textarea
                                        value={this.state.customRefundNote}
                                        onChange={(e) => this.setState({ customRefundNote: e.target.value })}
                                        placeholder="Add additional audit notes for finance compliance..."
                                        className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-rose-500 h-20 resize-none"
                                    ></textarea>
                                </div>

                                <div className="bg-slate-100 p-3 rounded-xl space-y-1.5 text-[11px] text-slate-600">
                                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                        <FaShieldAlt className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Automated System Audit Actions:</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                                        <li>Mark status as <strong className="text-purple-700">REFUNDED ↩</strong> in master audit ledger</li>
                                        <li>Revert candidate membership status from <strong className="text-indigo-700">Pro</strong> to <strong className="text-slate-700">Free</strong></li>
                                        <li>Log timestamp &amp; audit reason in candidate profile</li>
                                    </ul>
                                </div>

                                {/* Modal Footer Buttons */}
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={this.handleCloseRefundModal}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleExecuteRefund}
                                        disabled={this.state.isProcessingRefund}
                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <span>{this.state.isProcessingRefund ? 'Processing Refund...' : 'Confirm & Process Refund'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ELEGANT IN-APP PDF TEMPLATE PREVIEW MODAL POPUP --- */}
                {this.state.previewTemplateModal && (
                    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                            {/* Modal Header Bar */}
                            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black">
                                        📄
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-sm text-white">PDF Invoice Template Live Preview</h3>
                                            <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 rounded-full font-mono text-[10px] uppercase font-bold">
                                                {this.state.previewTemplateModal.toUpperCase()}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400">Interactive live layout sample with candidate snapshot &amp; GST tax breakdown</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Active Status / Set Active Button */}
                                    {this.state.receiptTemplate === this.state.previewTemplateModal ? (
                                        <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl text-xs font-black uppercase flex items-center gap-1">
                                            <FaCheck className="w-3 h-3 text-emerald-400" /> Active Template
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                this.setState({ receiptTemplate: this.state.previewTemplateModal });
                                                this.submitHandler();
                                            }}
                                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5">
                                            <FaCheck className="w-3 h-3" />
                                            <span>Set as Active</span>
                                        </button>
                                    )}

                                    {/* Print Test Sample Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const sampleInv = {
                                                transactionId: 'TXN_SAMPLE_8849',
                                                invoiceNumber: `${this.state.invoicePrefix || 'RPAI'}/${this.state.financialYear || '26-27'}/004821`,
                                                created_at: new Date(),
                                                formattedDate: 'Aug 13, 2026',
                                                customerName: 'Sarah Jenkins',
                                                customerEmail: 'sarah.jenkins@example.com',
                                                customerCompany: 'Apex Tech Solutions Ltd',
                                                customerGstin: '27AAACA1234B1Z9',
                                                customerAddress: '42 Financial District',
                                                customerCity: 'Mumbai',
                                                customerState: 'Maharashtra',
                                                customerStateCode: '27',
                                                customerCountry: 'India',
                                                planType: 'Annual Pro Membership (12 Months)',
                                                price: 499,
                                                amount: 499,
                                                taxRate: this.state.taxRate || 18,
                                                currency: 'INR',
                                                paymentType: 'Razorpay / UPI',
                                                status: 'Completed'
                                            };
                                            this.printModalInvoice(sampleInv);
                                        }}
                                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5">
                                        <FaPrint className="w-3 h-3 text-indigo-400" />
                                        <span>Print Test</span>
                                    </button>

                                    {/* Close Button */}
                                    <button
                                        type="button"
                                        onClick={() => this.closePreviewTemplateModal()}
                                        className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer rounded-lg">
                                        <FaTimes className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Template Switcher Tabs inside Modal */}
                            <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2 shrink-0">Switch Design:</span>
                                {[
                                    { id: 'modern', label: '✨ Modern Minimalist' },
                                    { id: 'classic', label: '🏛️ Classic Corporate' },
                                    { id: 'gradient', label: '🎨 Vibrant Enterprise' },
                                    { id: 'compact', label: '🧾 Compact Stub' },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => this.setState({ previewTemplateModal: t.id })}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                            this.state.previewTemplateModal === t.id
                                                ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                                                : 'text-slate-600 hover:bg-white/60'
                                        }`}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* Modal Body: Live Rendered Invoice Sheet */}
                            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-slate-50/70">
                                {this.renderTemplatePreviewSheet(this.state.previewTemplateModal)}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 2: BUSINESS & GST DETAILS --- */}
                {this.state.adminTab === 'gst' && (
                    <div className="space-y-6">
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
                                            onChange={(e) => this.setState({ companyTaxId: e.target.value, supplierGstin: e.target.value })}
                                            placeholder="27AAAAA0000A1Z5"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Legal Supplier Business Name
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierLegalName}
                                            onChange={(e) => this.setState({ supplierLegalName: e.target.value })}
                                            placeholder="ResumePilot Technologies Pvt Ltd"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier Trade Name (Display Name)
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierTradeName}
                                            onChange={(e) => this.setState({ supplierTradeName: e.target.value })}
                                            placeholder="ResumePilot AI"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier Address
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierAddress}
                                            onChange={(e) => this.setState({ supplierAddress: e.target.value })}
                                            placeholder="Unit 402, Apex Business Park"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier City
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierCity}
                                            onChange={(e) => this.setState({ supplierCity: e.target.value })}
                                            placeholder="Mumbai"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier State
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierState}
                                            onChange={(e) => this.setState({ supplierState: e.target.value })}
                                            placeholder="Maharashtra"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier State Code
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierStateCode}
                                            onChange={(e) => this.setState({ supplierStateCode: e.target.value })}
                                            placeholder="27"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier Pincode / Zip Code
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierPincode}
                                            onChange={(e) => this.setState({ supplierPincode: e.target.value })}
                                            placeholder="400051"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Supplier PAN Number
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.supplierPan}
                                            onChange={(e) => this.setState({ supplierPan: e.target.value })}
                                            placeholder="AABCU9603R"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Services Accounting Code (SAC)
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.sacCode}
                                            onChange={(e) => this.setState({ sacCode: e.target.value })}
                                            placeholder="998313"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Reverse Charge Mechanism (RCM)
                                        </label>
                                        <select
                                            value={this.state.reverseCharge || 'No'}
                                            onChange={(e) => this.setState({ reverseCharge: e.target.value })}
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none cursor-pointer"
                                        >
                                            <option value="No">No (Forward Charge - Supplier collects GST)</option>
                                            <option value="Yes">Yes (Reverse Charge - Recipient pays tax directly)</option>
                                        </select>
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
                                                    onClick={() => this.setState({ previewTemplateModal: tpl.id || 'modern' })}
                                                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[10px] font-bold rounded-lg transition-colors cursor-pointer shadow-2xs">
                                                    👁️ Preview
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 1: GATEWAY & API KEYS --- */}
                {this.state.adminTab === 'gateways' && (
                    <div className="space-y-6">
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

                        {/* --- CARD 2: INDIVIDUAL PAYMENT GATEWAY PROVIDERS ON / OFF TOGGLES --- */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Payment Gateway Providers (Enterprise Control)</h3>
                                <p className="text-xs text-slate-500">Enable or disable individual payment processors dynamically for candidate checkout</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 pt-2">
                                {/* Provider 1: Stripe */}
                                <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${this.state.checkedStripe ? 'bg-indigo-50/50 border-indigo-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <FaStripe className="w-7 h-7 text-indigo-600 shrink-0" />
                                                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider truncate">Stripe</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={this.handleStripeToggle}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 shadow-2xs ${
                                                    this.state.checkedStripe ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}>
                                                {this.state.checkedStripe ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-snug">Credit &amp; Debit Cards (Visa, MC, Amex)</p>
                                    </div>
                                </div>

                                {/* Provider 2: PayPal */}
                                <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${this.state.checkedPayPal ? 'bg-blue-50/50 border-blue-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <FaPaypal className="w-5 h-5 text-blue-600 shrink-0" />
                                                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider truncate">PayPal</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={this.handlePayPalToggle}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 shadow-2xs ${
                                                    this.state.checkedPayPal ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}>
                                                {this.state.checkedPayPal ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-snug">Global PayPal &amp; 1-Touch Checkout</p>
                                    </div>
                                </div>

                                {/* Provider 3: Razorpay */}
                                <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${this.state.checkedRazorpay ? 'bg-emerald-50/50 border-emerald-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <FaRupeeSign className="w-4 h-4 text-emerald-600 shrink-0" />
                                                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider truncate">Razorpay</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={this.handleRazorpayToggle}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 shadow-2xs ${
                                                    this.state.checkedRazorpay ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}>
                                                {this.state.checkedRazorpay ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-snug">UPI, Cards &amp; NetBanking (India)</p>
                                    </div>
                                </div>

                                {/* Provider 4: Paytm */}
                                <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${this.state.checkedPaytm ? 'bg-sky-50/50 border-sky-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black text-sky-700 bg-sky-100 uppercase tracking-wider shrink-0">Paytm</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={this.handlePaytmToggle}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 shadow-2xs ${
                                                    this.state.checkedPaytm ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}>
                                                {this.state.checkedPaytm ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-snug">Paytm Wallet, UPI &amp; NetBanking</p>
                                    </div>
                                </div>

                                {/* Provider 5: PhonePe */}
                                <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${this.state.checkedPhonePe ? 'bg-violet-50/50 border-violet-200 shadow-2xs' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                    <div>
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-black text-violet-700 bg-violet-100 uppercase tracking-wider shrink-0">PhonePe</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={this.handlePhonePeToggle}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 shadow-2xs ${
                                                    this.state.checkedPhonePe ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}>
                                                {this.state.checkedPhonePe ? 'ON' : 'OFF'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* --- CARD 3: SUBSCRIPTION SYSTEM MASTER SWITCH --- */}
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

                        {/* --- CARD 4: PAYMENT GATEWAY API & SANDBOX CREDENTIALS CARD --- */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
                            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                                    <FaFlask className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Payment Gateway API Keys &amp; Credentials (Sandbox &amp; Production)</h3>
                                    <p className="text-xs text-slate-500">Configure test (sandbox) or live API keys for Razorpay, Stripe, PayPal, Paytm, and PhonePe.</p>
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
                                            placeholder="e.g. rzp_test_... or rzp_live_..."
                                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-emerald-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Razorpay Key Secret *</label>
                                        <input
                                            type="password"
                                            value={this.state.razorpayKeySecret}
                                            onChange={(e) => this.setState({ razorpayKeySecret: e.target.value })}
                                            placeholder="Paste your Razorpay key secret"
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

                            {/* Section 4: Paytm Credentials */}
                            <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded">Paytm</span>
                                        <h4 className="text-xs font-extrabold text-sky-950 uppercase tracking-wider">Paytm Checkout API Credentials</h4>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Paytm MID (Merchant ID) *</label>
                                        <input
                                            type="text"
                                            value={this.state.paytmMid}
                                            onChange={(e) => this.setState({ paytmMid: e.target.value })}
                                            placeholder="e.g. XYZco12345678901"
                                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-sky-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Paytm Merchant Key *</label>
                                        <div className="relative">
                                            <input
                                                type={this.state.showPaytmKey ? 'text' : 'password'}
                                                value={this.state.paytmMerchantKey}
                                                onChange={(e) => this.setState({ paytmMerchantKey: e.target.value })}
                                                placeholder="Merchant Key from Paytm Dashboard"
                                                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-sky-500 outline-none pr-9"
                                            />
                                            <button type="button" onClick={() => this.setState((s) => ({ showPaytmKey: !s.showPaytmKey }))} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                                                {this.state.showPaytmKey ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Paytm Website Mode</label>
                                        <select
                                            value={this.state.paytmWebsite}
                                            onChange={(e) => this.setState({ paytmWebsite: e.target.value })}
                                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-sky-500 outline-none font-bold">
                                            <option value="WEBSTAGING">WEBSTAGING (Test / Sandbox)</option>
                                            <option value="DEFAULT">DEFAULT (Production)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Section 5: PhonePe Credentials */}
                            <div className="p-4 bg-violet-50/60 border border-violet-200 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">PhonePe</span>
                                        <h4 className="text-xs font-extrabold text-violet-950 uppercase tracking-wider">PhonePe UPI &amp; Payments API Credentials</h4>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">PhonePe Merchant ID *</label>
                                        <input
                                            type="text"
                                            value={this.state.phonepeId}
                                            onChange={(e) => this.setState({ phonepeId: e.target.value })}
                                            placeholder="e.g. PGTESTPAYUAT or Merchant ID"
                                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">PhonePe Salt Key *</label>
                                        <div className="relative">
                                            <input
                                                type={this.state.showPhonePeKey ? 'text' : 'password'}
                                                value={this.state.phonepeSaltKey}
                                                onChange={(e) => this.setState({ phonepeSaltKey: e.target.value })}
                                                placeholder="Salt Key from PhonePe Dashboard"
                                                className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-violet-500 outline-none pr-9"
                                            />
                                            <button type="button" onClick={() => this.setState((s) => ({ showPhonePeKey: !s.showPhonePeKey }))} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                                                {this.state.showPhonePeKey ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Salt Index</label>
                                        <input
                                            type="text"
                                            value={this.state.phonepeSaltIndex}
                                            onChange={(e) => this.setState({ phonepeSaltIndex: e.target.value })}
                                            placeholder="1"
                                            className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB 4: PROMO COUPONS --- */}
                {this.state.adminTab === 'coupons' && (
                    <div className="space-y-6">
                        {/* ENTERPRISE ADMIN COUPON MANAGER CARD */}
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
            </div>
        )}

        {/* --- TAB 3: PRICING & CURRENCY --- */}
                {this.state.adminTab === 'plans' && (
                    <div className="space-y-6">
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

                        {/* Pricing Tiers Card */}
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
                    </div>
                )}

                {/* Persistent Save Action Button (Available across configuration tabs) */}
                {this.state.adminTab !== 'invoices' && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200 bg-white p-4 rounded-2xl shadow-2xs">
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
                )}

                {/* --- ELEGANT IN-APP PDF TAX INVOICE MODAL --- */}
                {this.state.pdfModalInvoice && (
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
                            {/* Modal Header Bar */}
                            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <FaFileInvoice className="w-5 h-5 text-indigo-400" />
                                    <div>
                                        <h3 className="font-bold text-sm text-white">Tax Invoice &amp; Payment Receipt</h3>
                                        <p className="text-[11px] text-slate-400 font-mono">Reference: {this.state.pdfModalInvoice.transactionId || this.state.pdfModalInvoice.id}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => this.printModalInvoice(this.state.pdfModalInvoice)}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                                    >
                                        <FaPrint className="w-3.5 h-3.5" />
                                        <span>Print / Save PDF</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleClosePDFModal}
                                        className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer rounded-lg"
                                    >
                                        <FaTimes className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Invoice Sheet Document */}
                            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-slate-50/50">
                                {(() => {
                                    const inv = this.state.pdfModalInvoice;
                                    const gstin = inv.customerSnapshot?.gstin || inv.customerGstin || '';
                                    const isB2B = Boolean(gstin && gstin.length === 15);
                                    const symbol = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : inv.currency === 'INR' ? '₹' : `${inv.currency || 'UNKNOWN'} `;
                                    const invNo = inv.transactionId || inv.invoiceNumber || inv.invoiceId || inv.id || 'TXN_INV';
                                    const priceVal = parseFloat(inv.price !== undefined ? inv.price : (inv.grandTotal || inv.amount || 199)).toFixed(2);
                                    const taxRate = parseFloat(inv.taxRate || this.state.taxRate || 18);
                                    const taxAmt = parseFloat(inv.totalTax !== undefined ? inv.totalTax : (inv.taxAmount || (priceVal * (taxRate / (100 + taxRate))))).toFixed(2);
                                    const taxableVal = (parseFloat(priceVal) - parseFloat(taxAmt)).toFixed(2);
                                    const cgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
                                    const sgstAmt = (parseFloat(taxAmt) / 2).toFixed(2);
                                    const dateStr = inv.formattedDate || (inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-IN'));
                                    const status = (inv.status || 'Unknown').toLowerCase();

                                    return (
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-xs text-slate-800">
                                            {/* Invoice Brand Header */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-5 gap-4">
                                                <div>
                                                    <div className="text-xl font-extrabold text-indigo-600 tracking-tight">{this.state.supplierTradeName || 'ResumePilot AI'}</div>
                                                    <div className="text-xs font-bold text-slate-700 mt-0.5">{this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                                                    <div className="mt-2">
                                                        {status === 'completed' || status === 'paid' ? (
                                                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-black text-[10px] uppercase">
                                                                PAID IN FULL ✓
                                                            </span>
                                                        ) : status === 'refunded' ? (
                                                            <span className="px-2.5 py-1 bg-purple-100 text-purple-800 border border-purple-200 rounded-full font-black text-[10px] uppercase">
                                                                REFUNDED ↩
                                                            </span>
                                                        ) : status === 'failed' ? (
                                                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-black text-[10px] uppercase">
                                                                FAILED ✖
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-full font-black text-[10px] uppercase">
                                                                PENDING ⏳
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <h2 className="text-lg font-black text-slate-900 tracking-wide uppercase">{isB2B ? 'TAX INVOICE' : 'PAYMENT RECEIPT'}</h2>
                                                    <div className="text-slate-500 text-xs mt-1 space-y-0.5">
                                                        <div>Invoice No: <span className="font-mono font-bold text-slate-900">{invNo}</span></div>
                                                        <div>Date: <span className="font-semibold text-slate-800">{dateStr}</span></div>
                                                        <div>Gateway: <span className="font-semibold text-slate-800">{inv.paymentType || inv.paimentType || 'Razorpay / Stripe'}</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Supplier & Customer Cards */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Supplier / Billed From</div>
                                                    <div className="font-bold text-slate-900 text-sm mt-1">{this.state.supplierLegalName || 'ResumePilot Technologies Private Limited'}</div>
                                                    <div className="text-slate-600 mt-1 space-y-0.5">
                                                        <div>{this.state.supplierAddress || 'Unit 402, BKC'}, {this.state.supplierCity || 'Mumbai'}, {this.state.supplierState || 'Maharashtra'} - {this.state.supplierPincode || '400051'}</div>
                                                        <div className="pt-1 font-semibold text-slate-800">GSTIN: {this.state.supplierGstin || '27AABCU9603R1ZM'} | PAN: {this.state.supplierPan || 'AABCU9603R'}</div>
                                                        <div>SAC Code: <span className="font-mono font-bold text-indigo-700">{this.state.sacCode || '998313'}</span> (Online Software Services)</div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Customer / Billed To</div>
                                                    <div className="font-bold text-slate-900 text-sm mt-1">{inv.customerName || inv.customerSnapshot?.name || 'Valued Candidate'}</div>
                                                    <div className="text-slate-600 mt-1 space-y-0.5">
                                                        {inv.customerCompany && <div className="font-semibold text-slate-800">{inv.customerCompany}</div>}
                                                        <div>{inv.customerEmail || inv.customerSnapshot?.email || 'No email associated'}</div>
                                                        {gstin && <div className="pt-1 font-bold text-indigo-700 font-mono">GSTIN: {gstin}</div>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Particulars Table */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-900 text-white text-[10px] uppercase font-bold tracking-wider">
                                                            <th className="p-2.5 rounded-l-lg">Item Description</th>
                                                            <th className="p-2.5">SAC</th>
                                                            <th className="p-2.5 text-right">Taxable</th>
                                                            <th className="p-2.5 text-right">Tax ({taxRate}%)</th>
                                                            <th className="p-2.5 text-right rounded-r-lg">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 font-medium">
                                                        <tr>
                                                            <td className="p-2.5">
                                                                <div className="font-bold text-slate-900">{inv.planType || inv.planName || 'ResumePilot AI Premium Subscription'}</div>
                                                                <div className="text-[11px] text-slate-500">Digital SaaS Subscription Access</div>
                                                            </td>
                                                            <td className="p-2.5 font-mono text-slate-600">{this.state.sacCode || '998313'}</td>
                                                            <td className="p-2.5 text-right font-mono">{symbol}{taxableVal}</td>
                                                            <td className="p-2.5 text-right font-mono text-slate-600">{symbol}{taxAmt}</td>
                                                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">{symbol}{priceVal}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Summary Calculation & Amount in Words */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                                                <div>
                                                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Amount Chargeable (in words)</div>
                                                    <div className="font-bold text-slate-900 text-xs mt-1">
                                                        {inv.currency === 'USD' ? `$${priceVal} USD` : `INR ₹${priceVal}`}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-2">
                                                        Includes GST Tax Rate @ {taxRate}% (Rule 46 Compliance)
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 text-right font-semibold">
                                                    <div className="flex justify-between text-slate-600">
                                                        <span>Taxable Amount:</span>
                                                        <span className="font-mono">{symbol}{taxableVal}</span>
                                                    </div>
                                                    {isB2B ? (
                                                        <>
                                                            <div className="flex justify-between text-slate-600">
                                                                <span>CGST (9%):</span>
                                                                <span className="font-mono font-bold text-slate-800">{symbol}{cgstAmt}</span>
                                                            </div>
                                                            <div className="flex justify-between text-slate-600">
                                                                <span>SGST (9%):</span>
                                                                <span className="font-mono font-bold text-slate-800">{symbol}{sgstAmt}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="flex justify-between text-slate-600">
                                                            <span>Sales Tax / GST ({taxRate}%):</span>
                                                            <span className="font-mono font-bold text-slate-800">{symbol}{taxAmt}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between text-sm font-extrabold text-indigo-700 border-t border-slate-300 pt-2 mt-1">
                                                        <span>Grand Total:</span>
                                                        <span className="font-mono">{symbol}{priceVal}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Signatory & Legal Disclaimer */}
                                            <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-3">
                                                <div>
                                                    <p>This is a computer-generated Tax Invoice issued under Rule 46 of CGST Rules 2017.</p>
                                                    <p className="mt-0.5">Thank you for choosing {this.state.supplierTradeName || 'ResumePilot AI'}!</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="border-t border-slate-300 pt-1 font-bold text-slate-600 text-xs">Authorized Signatory</div>
                                                    <div className="text-[10px] text-slate-400">{this.state.supplierTradeName || 'ResumePilot AI'} Finance Team</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ENTERPRISE 1-CLICK REFUND MODAL --- */}
                {this.state.refundModalInvoice && (
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
                            {/* Modal Header */}
                            <div className="bg-rose-900 text-white px-6 py-4 flex items-center justify-between border-b border-rose-950">
                                <div className="flex items-center gap-2.5">
                                    <FaUndo className="w-5 h-5 text-rose-400" />
                                    <div>
                                        <h3 className="font-bold text-sm text-white">Issue 1-Click Order Refund</h3>
                                        <p className="text-[11px] text-rose-300 font-mono">Order: {this.state.refundModalInvoice.transactionId || this.state.refundModalInvoice.id}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={this.handleCloseRefundModal}
                                    className="p-1.5 text-rose-300 hover:text-white transition-colors cursor-pointer rounded-lg"
                                >
                                    <FaTimes className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 space-y-5">
                                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-1">
                                    <div className="text-xs font-bold text-rose-950">
                                        Customer: <strong>{this.state.refundModalInvoice.customerName || 'Candidate'}</strong> ({this.state.refundModalInvoice.customerEmail || 'No Email'})
                                    </div>
                                    <div className="text-rose-900 font-extrabold font-mono text-sm pt-0.5">
                                        Refund Amount: {this.state.refundModalInvoice.currency === 'USD' ? '$' : '₹'}{this.state.refundModalInvoice.price || 199} via {this.state.refundModalInvoice.paymentType || this.state.refundModalInvoice.paimentType || 'Gateway'}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-slate-800 block text-xs">Primary Refund Reason *</label>
                                    <select
                                        value={this.state.refundReason}
                                        onChange={(e) => this.setState({ refundReason: e.target.value })}
                                        className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-rose-500 font-medium"
                                    >
                                        <option value="Customer requested cancellation & refund">Customer requested cancellation & refund</option>
                                        <option value="Duplicate payment / Accidental double checkout">Duplicate payment / Accidental double checkout</option>
                                        <option value="Unsatisfied with service quality">Unsatisfied with service quality</option>
                                        <option value="Fraudulent / Unauthorized credit card transaction">Fraudulent / Unauthorized credit card transaction</option>
                                        <option value="Custom admin override">Custom admin override</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-slate-800 block text-xs">Admin Notes (Optional)</label>
                                    <textarea
                                        value={this.state.customRefundNote}
                                        onChange={(e) => this.setState({ customRefundNote: e.target.value })}
                                        placeholder="Add additional audit notes for finance compliance..."
                                        className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-rose-500 h-20 resize-none"
                                    ></textarea>
                                </div>

                                <div className="bg-slate-100 p-3 rounded-xl space-y-1.5 text-[11px] text-slate-600">
                                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                        <FaShieldAlt className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Automated System Audit Actions:</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                                        <li>Mark status as <strong className="text-purple-700">REFUNDED ↩</strong> in master audit ledger</li>
                                        <li>Revert candidate membership status from <strong className="text-indigo-700">Pro</strong> to <strong className="text-slate-700">Free</strong></li>
                                        <li>Log timestamp &amp; audit reason in candidate profile</li>
                                    </ul>
                                </div>

                                {/* Modal Footer Buttons */}
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={this.handleCloseRefundModal}
                                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={this.handleExecuteRefund}
                                        disabled={this.state.isProcessingRefund}
                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <span>{this.state.isProcessingRefund ? 'Processing Refund...' : 'Confirm & Process Refund'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


            </div>
        );
    }
}

export default SubscriptionSetting;
