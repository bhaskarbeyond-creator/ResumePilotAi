import { isAuthoritativeCreditNote, isAuthoritativeInvoice, printAuthoritativeCreditNote, printAuthoritativeInvoice } from '../../../utils/authoritativeInvoice';
import React, { Component } from 'react';
import { setSubscriptionsData, getAllCouponsAdmin, saveCoupon, deleteCoupon, getAdminSystemSettings, saveSystemSettings, getAllAdminTransactions, refundOrderTransaction, getAdminPaymentSettings, testAdminPaymentProvider, getPaymentWebhooks, replayPaymentWebhook } from '../../../services/api/platform';
import { FaCheck, FaTimes, FaCreditCard, FaRupeeSign, FaDollarSign, FaToggleOn, FaToggleOff, FaPaypal, FaStripe, FaFlask, FaShieldAlt, FaTag, FaPlus, FaTrash, FaEdit, FaCalendarAlt, FaPercent, FaEye, FaEyeSlash, FaDownload, FaSearch, FaFileInvoice, FaPrint, FaListAlt, FaCog, FaUndo, FaExclamationCircle, FaSyncAlt, FaBolt, FaCode } from 'react-icons/fa';
import { useAdminSession } from '../AdminContext';

class SubscriptionSetting extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pricingMatrix: {},
            websiteTitle: '',
            checkedSubscriptions: false,
            checkedOnlyPP: false,
            checkedRazorpayUPI: false,
            checkedStripe: false,
            checkedPayPal: false,
            checkedRazorpay: false,
            sandboxMode: false,
            monthlyPrice: '',
            monthlyOriginalPrice: '',
            quartarlyPrice: '',
            quartarlyOriginalPrice: '',
            yearlyPrice: '',
            yearlyOriginalPrice: '',
            enterprisePrice: '',
            enterpriseOriginalPrice: '',
            quarterlyBadgeText: 'Save 33% off retail',
            yearlyBadgeText: 'Save 79% • Best Value',
            enterpriseBadgeText: 'Save 40% on annual licenses',
            currency: '',
            isSuccessOpen: false,
            saveError: null,
            isSaving: false,
            // Inline notice for invoice/export actions. These used to be native
            // alert() dialogs.
            invoiceNotice: null,
            // Honest surfacing of payment-projection load failures. `false` means
            // the gateway fields below are placeholders, not stored values.
            paymentSettingsNotice: null,
            paymentSettingsLoaded: false,

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
            paytmWebsite: '',
            // PhonePe credentials
            checkedPhonePe: false,
            phonepeId: '',
            phonepeSaltKey: '',
            phonepeSaltIndex: '',
            paymentRevision: 0,
            clearSecrets: {},
            testingProvider: null,
            providerTestMessage: null,

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
            invoiceLedgerError: '',
            refundingDocId: null,

            // Webhook Diagnostics & Telemetry State
            webhooksList: [],
            loadingWebhooks: false,
            webhookSearchQuery: '',
            webhookProviderFilter: 'all',
            webhookError: '',
            selectedWebhookPayload: null,
            replayingWebhookId: null,
            webhookSuccessNotice: null,

            // Sales Tax & GST Config State
            enableTax: false,
            taxName: '',
            taxRate: '',
            taxInclusive: true,
            companyTaxId: '',
            supplierLegalName: '',
            supplierTradeName: '',
            supplierGstin: '',
            supplierPan: '',
            supplierAddress: '',
            supplierCity: '',
            supplierState: '',
            supplierStateCode: '',
            supplierPincode: '',
            sacCode: '',
            invoicePrefix: '',
            financialYear: '',
            requireCustomerTaxId: false,

            // Coupon Management Admin State
            couponsList: [],
            showCouponModal: false,
            enableCouponsModule: false,
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
            refundModalInvoice: null,
            refundReason: '',
            customRefundNote: '',
            isProcessingRefund: false,
            orderSuccessToast: '',
            orderErrorToast: '',
        };
        this.handleChange = this.handleChange.bind(this);
        this.handleSubscriptionToggleChange = this.handleSubscriptionToggleChange.bind(this);
        this.handleMatrixChange = this.handleMatrixChange.bind(this);
        this.handlePPCheckedChange = this.handlePPCheckedChange.bind(this);
        this.handleRazorpayToggle = this.handleRazorpayToggle.bind(this);
        this.handleStripeToggle = this.handleStripeToggle.bind(this);
        this.handlePayPalToggle = this.handlePayPalToggle.bind(this);
        this.handlePaytmToggle = this.handlePaytmToggle.bind(this);
        this.handlePhonePeToggle = this.handlePhonePeToggle.bind(this);
        this.handleSandboxToggle = this.handleSandboxToggle.bind(this);
        this.submitHandler = this.submitHandler.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.fetchAdminCoupons = this.fetchAdminCoupons.bind(this);
        this.fetchAdminInvoices = this.fetchAdminInvoices.bind(this);
        this.handleExportGSTR1CSV = this.handleExportGSTR1CSV.bind(this);
        this.handleOpenPDFModal = this.handleOpenPDFModal.bind(this);
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
        this.clearPaymentSecret = this.clearPaymentSecret.bind(this);
        this.testPaymentProvider = this.testPaymentProvider.bind(this);
    }

    async componentDidMount() {
        this.fetchAdminInvoices();
        this.fetchAdminCoupons();

        try {
            const systemSettings = await getAdminSystemSettings();
            if (systemSettings && systemSettings.modules) {
                this.setState({ enableCouponsModule: systemSettings.modules.enableCouponsModule === true });
            }
        } catch (e) {
            console.warn('getAdminSystemSettings error:', e);
        }

        // Payment gateway projection. A failure here MUST be surfaced: previously
        // this was a bare console.warn, so an authorisation failure (or any load
        // error) rendered every gateway field empty with `paymentRevision: 0` and
        // no explanation — operators saw "Razorpay values disappeared" and the
        // next save failed with an unexplained 409 revision conflict.
        try {
            const paymentData = await getAdminPaymentSettings();
            const { settings, publicKeys, configuredProviders, maskedKeys, credentialSources } = paymentData;
            
            const defaultMatrixRates = {
                INR: { monthly: 199, monthlyOriginal: 349, quartarly: 399, quartarlyOriginal: 597, yearly: 499, yearlyOriginal: 2388, enterprise: 2999, enterpriseOriginal: 4999 },
                USD: { monthly: 19, monthlyOriginal: 30, quartarly: 39, quartarlyOriginal: 57, yearly: 49, yearlyOriginal: 228, enterprise: 49, enterpriseOriginal: 99 },
                EUR: { monthly: 19, monthlyOriginal: 30, quartarly: 39, quartarlyOriginal: 57, yearly: 49, yearlyOriginal: 228, enterprise: 49, enterpriseOriginal: 99 },
                GBP: { monthly: 15, monthlyOriginal: 25, quartarly: 35, quartarlyOriginal: 50, yearly: 45, yearlyOriginal: 200, enterprise: 39, enterpriseOriginal: 79 },
            };
            const loadedMatrix = settings.pricingMatrix && typeof settings.pricingMatrix === 'object' ? { ...settings.pricingMatrix } : {};
            const primaryCurr = settings.currency || 'INR';

            ['INR', 'USD', 'EUR', 'GBP'].forEach((c) => {
                const def = defaultMatrixRates[c];
                if (!loadedMatrix[c] || typeof loadedMatrix[c] !== 'object') {
                    if (c === primaryCurr) {
                        loadedMatrix[c] = {
                            monthly: settings.monthlyPrice ?? def.monthly,
                            monthlyOriginal: settings.monthlyOriginalPrice ?? def.monthlyOriginal,
                            quartarly: settings.quartarlyPrice ?? def.quartarly,
                            quartarlyOriginal: settings.quartarlyOriginalPrice ?? def.quartarlyOriginal,
                            yearly: settings.yearlyPrice ?? def.yearly,
                            yearlyOriginal: settings.yearlyOriginalPrice ?? def.yearlyOriginal,
                            enterprise: settings.enterprisePrice ?? def.enterprise,
                            enterpriseOriginal: settings.enterpriseOriginalPrice ?? def.enterpriseOriginal,
                        };
                    } else {
                        loadedMatrix[c] = { ...def };
                    }
                } else {
                    loadedMatrix[c] = {
                        monthly: loadedMatrix[c].monthly ?? (c === primaryCurr ? settings.monthlyPrice ?? def.monthly : def.monthly),
                        monthlyOriginal: loadedMatrix[c].monthlyOriginal ?? (c === primaryCurr ? settings.monthlyOriginalPrice ?? def.monthlyOriginal : def.monthlyOriginal),
                        quartarly: loadedMatrix[c].quartarly ?? (c === primaryCurr ? settings.quartarlyPrice ?? def.quartarly : def.quartarly),
                        quartarlyOriginal: loadedMatrix[c].quartarlyOriginal ?? (c === primaryCurr ? settings.quartarlyOriginalPrice ?? def.quartarlyOriginal : def.quartarlyOriginal),
                        yearly: loadedMatrix[c].yearly ?? (c === primaryCurr ? settings.yearlyPrice ?? def.yearly : def.yearly),
                        yearlyOriginal: loadedMatrix[c].yearlyOriginal ?? (c === primaryCurr ? settings.yearlyOriginalPrice ?? def.yearlyOriginal : def.yearlyOriginal),
                        enterprise: loadedMatrix[c].enterprise ?? (c === primaryCurr ? settings.enterprisePrice ?? def.enterprise : def.enterprise),
                        enterpriseOriginal: loadedMatrix[c].enterpriseOriginal ?? (c === primaryCurr ? settings.enterpriseOriginalPrice ?? def.enterpriseOriginal : def.enterpriseOriginal),
                    };
                }
            });

            this.setState({
                checkedSubscriptions: settings.state === true,
                monthlyPrice: settings.monthlyPrice ?? loadedMatrix[primaryCurr]?.monthly ?? '',
                monthlyOriginalPrice: settings.monthlyOriginalPrice ?? loadedMatrix[primaryCurr]?.monthlyOriginal ?? '',
                quartarlyPrice: settings.quartarlyPrice ?? loadedMatrix[primaryCurr]?.quartarly ?? '',
                quartarlyOriginalPrice: settings.quartarlyOriginalPrice ?? loadedMatrix[primaryCurr]?.quartarlyOriginal ?? '',
                yearlyPrice: settings.yearlyPrice ?? loadedMatrix[primaryCurr]?.yearly ?? '',
                yearlyOriginalPrice: settings.yearlyOriginalPrice ?? loadedMatrix[primaryCurr]?.yearlyOriginal ?? '',
                enterprisePrice: settings.enterprisePrice ?? loadedMatrix[primaryCurr]?.enterprise ?? '',
                enterpriseOriginalPrice: settings.enterpriseOriginalPrice ?? loadedMatrix[primaryCurr]?.enterpriseOriginal ?? '',
                quarterlyBadgeText: settings.quarterlyBadgeText || 'Save 33% off retail',
                yearlyBadgeText: settings.yearlyBadgeText || 'Save 79% • Best Value',
                enterpriseBadgeText: settings.enterpriseBadgeText || 'Save 40% on annual licenses',
                currency: primaryCurr,
                pricingMatrix: loadedMatrix,
                checkedOnlyPP: settings.onlyPP === true,
                checkedRazorpayUPI: settings.razorpayUPI === true,
                checkedStripe: settings.stripeEnabled === true,
                checkedPayPal: settings.paypalEnabled === true,
                checkedRazorpay: settings.razorpayEnabled === true,
                checkedPaytm: settings.paytmEnabled === true,
                checkedPhonePe: settings.phonepeEnabled === true,
                sandboxMode: settings.sandboxMode === true,
                enableTax: settings.enableTax === true,
                taxName: settings.taxName || '',
                taxRate: settings.taxRate ?? '',
                taxInclusive: settings.taxInclusive !== false,
                companyTaxId: settings.companyTaxId || '',
                supplierLegalName: settings.supplierLegalName || '',
                supplierTradeName: settings.supplierTradeName || '',
                supplierGstin: settings.supplierGstin || '',
                supplierPan: settings.supplierPan || '',
                supplierAddress: settings.supplierAddress || '',
                supplierCity: settings.supplierCity || '',
                supplierState: settings.supplierState || '',
                supplierStateCode: settings.supplierStateCode || '',
                supplierPincode: settings.supplierPincode || '',
                sacCode: settings.sacCode || '',
                invoicePrefix: settings.invoicePrefix || '',
                financialYear: settings.financialYear || '',
                requireCustomerTaxId: settings.requireCustomerTaxId === true,
                razorpayKeyId: publicKeys.razorpayKeyId || '',
                stripePublishableKey: publicKeys.stripePublishableKey || '',
                paypalClientId: publicKeys.paypalClientId || '',
                paytmMid: publicKeys.paytmMid || '',
                paytmWebsite: publicKeys.paytmWebsite || '',
                phonepeId: publicKeys.phonepeId || '',
                phonepeSaltIndex: publicKeys.phonepeSaltIndex || '',
                // Secrets are write-only. Empty inputs preserve existing values.
                configuredProviders,
                maskedKeys,
                credentialSources,
                paymentRevision: Number(paymentData.revision),
                clearSecrets: {},
                razorpayKeySecret: '',
                stripeSecretKey: '',
                paypalClientSecret: '',
                paytmMerchantKey: '',
                phonepeSaltKey: '',
                paymentSettingsNotice: null,
                paymentSettingsLoaded: true,
            });
        } catch (e) {
            // Honest failure. Never render silently-empty gateway fields: an empty
            // panel plus a stale revision invites an overwrite and an unexplained
            // 409 on the next save.
            console.warn('Error loading payment settings:', e);
            this.setState({
                paymentSettingsLoaded: false,
                paymentSettingsNotice:
                    `Could not load payment gateway settings${e?.message ? `: ${e.message}` : ''}. Fields below are NOT the stored values — saving now would not change stored credentials. Refresh, and if this persists confirm your role and MFA session.`,
            });
        }
    }

    componentDidUpdate(prevProps) {
        if (this.props.defaultTab && this.props.defaultTab !== prevProps.defaultTab) {
            this.setState({ adminTab: this.props.defaultTab });
        }
    }

    async fetchAdminInvoices() {
        this.setState({ loadingInvoices: true, invoiceLedgerError: '' });
        try {
            const invoices = await getAllAdminTransactions();
            this.setState({ adminInvoicesList: invoices, loadingInvoices: false, invoiceLedgerError: '' });
        } catch (err) {
            console.error('Error fetching admin invoices:', err);
            this.setState({
                adminInvoicesList: [],
                loadingInvoices: false,
                invoiceLedgerError: err.message || 'The authoritative payment and invoice ledger is unavailable.',
            });
        }
    }

    async fetchWebhooks() {
        this.setState({ loadingWebhooks: true, webhookError: '', webhookSuccessNotice: null });
        try {
            const result = await getPaymentWebhooks({
                provider: this.state.webhookProviderFilter !== 'all' ? this.state.webhookProviderFilter : undefined,
                q: this.state.webhookSearchQuery || undefined,
                limit: 50
            });
            this.setState({ webhooksList: result.events || [], loadingWebhooks: false });
        } catch (err) {
            console.error('Error loading payment webhooks:', err);
            this.setState({ webhookError: err.message || 'Failed to load payment webhooks telemetry.', loadingWebhooks: false });
        }
    }

    async handleReplayWebhook(eventId) {
        if (!this.props.isSuperAdmin) return;
        this.setState({ replayingWebhookId: eventId, webhookError: '', webhookSuccessNotice: null });
        try {
            const result = await replayPaymentWebhook(eventId);
            this.setState({
                webhookSuccessNotice: result.message || `Webhook event ${eventId} replayed successfully.`,
                replayingWebhookId: null
            });
            this.fetchWebhooks();
        } catch (err) {
            this.setState({ webhookError: err.message || 'Replay operation failed.', replayingWebhookId: null });
        }
    }

    handleOpenPDFModal(inv) {
        this.printModalInvoice(inv);
    }


    handleOpenRefundModal(inv) {
        const standardReasons = [
            'Customer requested refund',
            'Duplicate payment / Accidental double checkout',
            'Unsatisfied with service quality',
            'Fraudulent / Unauthorized credit card transaction',
            'Custom admin override',
        ];
        const existingReason = String(inv?.refundReason || '').trim();
        this.setState({
            refundModalInvoice: inv,
            refundReason: standardReasons.includes(existingReason) ? existingReason : existingReason ? 'Custom admin override' : '',
            customRefundNote: standardReasons.includes(existingReason) ? '' : existingReason,
        });
    }

    handleCloseRefundModal() {
        this.setState({ refundModalInvoice: null, isProcessingRefund: false });
    }

    async handleExecuteRefund() {
        const inv = this.state.refundModalInvoice;
        if (!inv) return;
        const txnId = inv.transactionId || inv.id;
        const fullReason = `${this.state.refundReason}${this.state.customRefundNote ? `: ${this.state.customRefundNote}` : ''}`.trim();
        if (fullReason.length < 5) {
            this.setState({ orderErrorToast: 'Select a refund reason or enter an audit note before contacting the provider.' });
            return;
        }

        this.setState({ isProcessingRefund: true, orderErrorToast: '' });
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

    printCreditNote(inv) {
        const creditNote = inv?.creditNote || inv?.invoice?.creditNote || (isAuthoritativeCreditNote(inv) ? inv : null);
        if (!isAuthoritativeCreditNote(creditNote)) {
            this.setState({ invoiceNotice: 'No immutable credit note is attached to this refunded payment.' });
            return;
        }
        try {
            printAuthoritativeCreditNote(creditNote);
            this.setState({ invoiceNotice: null });
        } catch (error) {
            this.setState({ invoiceNotice: error.message || 'The immutable credit note could not be opened.' });
        }
    }

    printModalInvoice(inv) {
        const invoice = inv?.invoice || (isAuthoritativeInvoice(inv) ? inv : null);
        if (!isAuthoritativeInvoice(invoice)) {
            this.setState({
                invoiceNotice: 'No immutable issued invoice is attached to this payment order. A payment ledger row cannot be reconstructed into a tax invoice from current settings.',
            });
            return;
        }
        try {
            printAuthoritativeInvoice(invoice);
            this.setState({ invoiceNotice: null });
        } catch (error) {
            this.setState({ invoiceNotice: error.message || 'The immutable invoice document could not be opened.' });
        }
    }

    handleExportGSTR1CSV() {
        const invoices = (this.state.adminInvoicesList || [])
            .map(record => record?.invoice)
            .filter(isAuthoritativeInvoice);
        if (invoices.length === 0) {
            this.setState({ invoiceNotice: 'There are no immutable issued billing documents to export. Payment orders without an issued invoice are intentionally excluded.' });
            return;
        }
        const documents = invoices.flatMap(invoice => [
            { type: 'TAX_INVOICE', document: invoice, originalInvoiceNumber: '' },
            ...(isAuthoritativeCreditNote(invoice.creditNote)
                ? [{ type: 'CREDIT_NOTE', document: invoice.creditNote, originalInvoiceNumber: invoice.invoiceNumber }]
                : []),
        ]);
        const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const headers = [
            'Document Type', 'Document Number', 'Original Invoice Number',
            'GSTIN/UIN of Recipient', 'Receiver Name', 'Document Date',
            'Document Value', 'Currency', 'Place Of Supply', 'Reverse Charge',
            'Customer Type', 'Rate', 'Taxable Value', 'Tax Amount', 'HSN/SAC',
            'Item Description', 'Provider Refund Reference'
        ];
        const rows = documents.flatMap(({ type, document, originalInvoiceNumber }) => document.lineItems.map(item => [
            type,
            type === 'CREDIT_NOTE' ? document.creditNoteNumber : document.invoiceNumber,
            originalInvoiceNumber,
            document.customerSnapshot.gstin || '',
            document.customerSnapshot.name,
            type === 'CREDIT_NOTE' ? document.creditNoteDate : document.invoiceDate,
            Number(document.grandTotal).toFixed(2),
            document.currency,
            document.placeOfSupply,
            document.reverseCharge,
            document.customerSnapshot.gstin ? 'B2B' : 'B2C',
            Number(document.gstRate).toFixed(2),
            Number(item.taxableValue).toFixed(2),
            Number(document.totalTax).toFixed(2),
            item.sacCode,
            item.description,
            type === 'CREDIT_NOTE' ? document.providerRefundId : '',
        ].map(csvCell).join(',')));
        const csvStr = [headers.map(csvCell).join(','), ...rows].join('\n');
        const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Immutable_Billing_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.setState({
            invoiceNotice: 'Exported an immutable invoice and credit-note accounting ledger. This generic CSV is not represented as a filing-portal import format.',
        });
    }

    handlePrintInvoicePDF(inv) {
        this.printModalInvoice(inv);
    }

    handleChange(event, inputName) {
        switch (inputName) {
            case 'monthly':
                this.setState({ monthlyPrice: event.target.value });
                break;
            case 'monthlyOriginal':
                this.setState({ monthlyOriginalPrice: event.target.value });
                break;
            case 'quartarly':
                this.setState({ quartarlyPrice: event.target.value });
                break;
            case 'quartarlyOriginal':
                this.setState({ quartarlyOriginalPrice: event.target.value });
                break;
            case 'yearly':
                this.setState({ yearlyPrice: event.target.value });
                break;
            case 'yearlyOriginal':
                this.setState({ yearlyOriginalPrice: event.target.value });
                break;
            case 'enterprise':
                this.setState({ enterprisePrice: event.target.value });
                break;
            case 'enterpriseOriginal':
                this.setState({ enterpriseOriginalPrice: event.target.value });
                break;
            case 'quarterlyBadgeText':
                this.setState({ quarterlyBadgeText: event.target.value });
                break;
            case 'yearlyBadgeText':
                this.setState({ yearlyBadgeText: event.target.value });
                break;
            case 'enterpriseBadgeText':
                this.setState({ enterpriseBadgeText: event.target.value });
                break;
            case 'currency': {
                const newCurr = event.target.value;
                const matrixForCurr = this.state.pricingMatrix?.[newCurr];
                this.setState({
                    currency: newCurr,
                    monthlyPrice: matrixForCurr?.monthly ?? this.state.monthlyPrice,
                    monthlyOriginalPrice: matrixForCurr?.monthlyOriginal ?? this.state.monthlyOriginalPrice,
                    quartarlyPrice: matrixForCurr?.quartarly ?? this.state.quartarlyPrice,
                    quartarlyOriginalPrice: matrixForCurr?.quartarlyOriginal ?? this.state.quartarlyOriginalPrice,
                    yearlyPrice: matrixForCurr?.yearly ?? this.state.yearlyPrice,
                    yearlyOriginalPrice: matrixForCurr?.yearlyOriginal ?? this.state.yearlyOriginalPrice,
                    enterprisePrice: matrixForCurr?.enterprise ?? this.state.enterprisePrice,
                    enterpriseOriginalPrice: matrixForCurr?.enterpriseOriginal ?? this.state.enterpriseOriginalPrice,
                });
                break;
            }
            default:
                break;
        }
    }

    
    handleMatrixChange(currency, planType, value) {
        this.setState(prevState => {
            const nextMatrix = {
                ...prevState.pricingMatrix,
                [currency]: {
                    ...prevState.pricingMatrix[currency],
                    [planType]: value
                }
            };
            const updates = { pricingMatrix: nextMatrix };
            if (currency === (prevState.currency || 'INR')) {
                if (planType === 'monthly') updates.monthlyPrice = value;
                if (planType === 'monthlyOriginal') updates.monthlyOriginalPrice = value;
                if (planType === 'quartarly') updates.quartarlyPrice = value;
                if (planType === 'quartarlyOriginal') updates.quartarlyOriginalPrice = value;
                if (planType === 'yearly') updates.yearlyPrice = value;
                if (planType === 'yearlyOriginal') updates.yearlyOriginalPrice = value;
                if (planType === 'enterprise') updates.enterprisePrice = value;
                if (planType === 'enterpriseOriginal') updates.enterpriseOriginalPrice = value;
            }
            return updates;
        });
    }

    handleSubscriptionToggleChange() {
        this.setState((prevState) => ({ checkedSubscriptions: !prevState.checkedSubscriptions }));
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

    clearPaymentSecret(provider) {
        if (!this.props.isSuperAdmin) {
            this.setState({ couponErrorMsg: 'Only Super Admin can clear payment provider credentials.' });
            return;
        }
        const fieldByProvider = {
            razorpay: 'razorpayKeySecret',
            stripe: 'stripeSecretKey',
            paypal: 'paypalClientSecret',
            paytm: 'paytmMerchantKey',
            phonepe: 'phonepeSaltKey',
        };
        const field = fieldByProvider[provider];
        if (!field) return;
        this.setState(previous => ({
            [field]: '',
            clearSecrets: { ...(previous.clearSecrets || {}), [provider]: true },
        }));
    }

    async testPaymentProvider(provider) {
        if (!this.props.isSuperAdmin) {
            this.setState({ providerTestMessage: { type: 'error', text: 'Only Super Admin can run payment provider tests.' } });
            return;
        }
        if (this.state.testingProvider) return;
        this.setState({ testingProvider: provider, providerTestMessage: null });
        const credentialsByProvider = {
            razorpay: { keyId: this.state.razorpayKeyId, keySecret: this.state.razorpayKeySecret },
            stripe: { secretKey: this.state.stripeSecretKey },
            paypal: { clientId: this.state.paypalClientId, clientSecret: this.state.paypalClientSecret },
            paytm: { mid: this.state.paytmMid, merchantKey: this.state.paytmMerchantKey },
            phonepe: { merchantId: this.state.phonepeId, saltKey: this.state.phonepeSaltKey, saltIndex: this.state.phonepeSaltIndex },
        };
        try {
            const result = await testAdminPaymentProvider(provider, credentialsByProvider[provider] || {});
            this.setState({ providerTestMessage: { type: 'success', text: result.message || `${provider} connection verified.` } });
        } catch (error) {
            this.setState({ providerTestMessage: { type: 'error', text: error.message || `${provider} test failed.` } });
        } finally {
            this.setState({ testingProvider: null });
        }
    }

    async handleToggleCouponsModule() {
        const nextState = !this.state.enableCouponsModule;
        this.setState({ enableCouponsModule: nextState, couponErrorMsg: '', couponSuccessMsg: '' });

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
            this.setState({
                enableCouponsModule: !nextState,
                couponErrorMsg: err.message || 'Failed to update coupons module setting. Please try again.'
            });
            setTimeout(() => this.setState({ couponErrorMsg: '' }), 5000);
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

        try {
            const res = await saveCoupon(code.trim(), discount, description, active, {
                expiryDate,
                maxUses,
                singleUsePerUser,
                revision,
            });

            if (res.success !== false) {
                this.setState({
                    showCouponModal: false,
                    couponSuccessMsg: res.message || 'Coupon saved successfully!',
                    couponErrorMsg: '',
                });
                await this.fetchAdminCoupons();
                setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
            } else {
                this.setState({ couponErrorMsg: res.error || 'Failed to save coupon.' });
            }
        } catch (err) {
            this.setState({ couponErrorMsg: err.message || 'Unable to save coupon.' });
        }
    }

    async handleToggleCouponStatus(c) {
        try {
            const result = await saveCoupon(c.code, c.discount, c.description, !c.active, {
                expiryDate: c.expiryDate, maxUses: c.maxUses, singleUsePerUser: c.singleUsePerUser, revision: c.revision,
            });
            if (result.success !== false) {
                await this.fetchAdminCoupons();
            } else {
                this.setState({ couponErrorMsg: result.error || 'Coupon could not be updated.' });
            }
        } catch (err) {
            this.setState({ couponErrorMsg: err.message || 'Coupon could not be updated.' });
        }
    }

    handleDeleteCouponCode(code) {
        this.setState({ deleteConfirmCode: code });
    }

    async confirmDeleteCouponCode() {
        const code = this.state.deleteConfirmCode;
        if (!code) return;
        this.setState({ isDeleting: true });
        try {
            const coupon = (this.state.couponsList || []).find(item => item.code === code);
            const res = await deleteCoupon(code, coupon?.revision || 0);
            if (res.success !== false) {
                await this.fetchAdminCoupons();
                this.setState({
                    deleteConfirmCode: null,
                    isDeleting: false,
                    couponSuccessMsg: `Coupon ${code} deleted permanently!`,
                    couponErrorMsg: '',
                });
                setTimeout(() => this.setState({ couponSuccessMsg: '' }), 4000);
            } else {
                this.setState({ isDeleting: false, couponErrorMsg: res.error || 'Failed to delete coupon' });
            }
        } catch (err) {
            this.setState({ isDeleting: false, couponErrorMsg: err.message || 'Failed to delete coupon' });
        }
    }

    async submitHandler() {
        if (!this.props.isSuperAdmin) {
            const msg = 'Payment credential and gateway changes are Super Admin-only. This view is read-only for Admin.';
            this.setState({ saveError: msg, couponErrorMsg: msg });
            return;
        }
        if (!this.state.paymentSettingsLoaded) {
            const msg = 'Payment gateway settings are not loaded, so saving is disabled. Reload this panel to fetch the current stored configuration before editing.';
            this.setState({
                paymentSettingsNotice: msg,
                saveError: msg,
                couponErrorMsg: 'Save blocked: payment settings are not loaded. Reload the panel and try again.',
            });
            return;
        }

        this.setState({ isSaving: true, saveError: null, couponErrorMsg: '' });

        const activeCurrency = this.state.currency || 'INR';
        const matrixMonthly = this.state.pricingMatrix?.[activeCurrency]?.monthly;
        const matrixQuartarly = this.state.pricingMatrix?.[activeCurrency]?.quartarly;
        const matrixYearly = this.state.pricingMatrix?.[activeCurrency]?.yearly;

        const effectiveMonthly = this.state.monthlyPrice !== '' && this.state.monthlyPrice !== null && this.state.monthlyPrice !== undefined
            ? this.state.monthlyPrice
            : (matrixMonthly !== undefined && matrixMonthly !== '' ? matrixMonthly : 199);
        const effectiveQuartarly = this.state.quartarlyPrice !== '' && this.state.quartarlyPrice !== null && this.state.quartarlyPrice !== undefined
            ? this.state.quartarlyPrice
            : (matrixQuartarly !== undefined && matrixQuartarly !== '' ? matrixQuartarly : 399);
        const effectiveYearly = this.state.yearlyPrice !== '' && this.state.yearlyPrice !== null && this.state.yearlyPrice !== undefined
            ? this.state.yearlyPrice
            : (matrixYearly !== undefined && matrixYearly !== '' ? matrixYearly : 499);
        const effectiveEnterprise = this.state.enterprisePrice !== '' && this.state.enterprisePrice !== null && this.state.enterprisePrice !== undefined
            ? this.state.enterprisePrice
            : (this.state.pricingMatrix?.[activeCurrency]?.enterprise ?? 2999);
        const effectiveEnterpriseOriginal = this.state.enterpriseOriginalPrice !== '' && this.state.enterpriseOriginalPrice !== null && this.state.enterpriseOriginalPrice !== undefined
            ? this.state.enterpriseOriginalPrice
            : (this.state.pricingMatrix?.[activeCurrency]?.enterpriseOriginal ?? 4999);
        const effectiveMonthlyOriginal = this.state.monthlyOriginalPrice !== '' && this.state.monthlyOriginalPrice !== null && this.state.monthlyOriginalPrice !== undefined
            ? this.state.monthlyOriginalPrice
            : (this.state.pricingMatrix?.[activeCurrency]?.monthlyOriginal ?? Math.round(effectiveMonthly * 1.6));
        const effectiveQuartarlyOriginal = this.state.quartarlyOriginalPrice !== '' && this.state.quartarlyOriginalPrice !== null && this.state.quartarlyOriginalPrice !== undefined
            ? this.state.quartarlyOriginalPrice
            : (this.state.pricingMatrix?.[activeCurrency]?.quartarlyOriginal ?? (effectiveMonthly * 3));
        const effectiveYearlyOriginal = this.state.yearlyOriginalPrice !== '' && this.state.yearlyOriginalPrice !== null && this.state.yearlyOriginalPrice !== undefined
            ? this.state.yearlyOriginalPrice
            : (this.state.pricingMatrix?.[activeCurrency]?.yearlyOriginal ?? (effectiveMonthly * 12));

        try {
            const result = await setSubscriptionsData(
                this.state.checkedSubscriptions,
                effectiveMonthly,
                effectiveQuartarly,
                effectiveYearly,
                this.state.checkedOnlyPP,
                activeCurrency,
                this.state.checkedRazorpayUPI,
                {
                    pricingMatrix: this.state.pricingMatrix && typeof this.state.pricingMatrix === 'object' ? this.state.pricingMatrix : {},
                    monthlyOriginalPrice: effectiveMonthlyOriginal,
                    quartarlyOriginalPrice: effectiveQuartarlyOriginal,
                    yearlyOriginalPrice: effectiveYearlyOriginal,
                    enterprisePrice: effectiveEnterprise,
                    enterpriseOriginalPrice: effectiveEnterpriseOriginal,
                    quarterlyBadgeText: this.state.quarterlyBadgeText,
                    yearlyBadgeText: this.state.yearlyBadgeText,
                    enterpriseBadgeText: this.state.enterpriseBadgeText,
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
                    paytmWebsite: this.state.paytmWebsite,
                    phonepeId: this.state.phonepeId,
                    phonepeSaltKey: this.state.phonepeSaltKey,
                    phonepeSaltIndex: this.state.phonepeSaltIndex,
                    clearSecrets: this.state.clearSecrets || {},
                    expectedRevision: this.state.paymentRevision,
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
                }
            );
            this.setState({
                isSaving: false,
                isSuccessOpen: true,
                saveError: null,
                couponErrorMsg: '',
                paymentRevision: Number(result.revision || this.state.paymentRevision),
                configuredProviders: result.configuredProviders || this.state.configuredProviders || {},
                maskedKeys: result.maskedKeys || this.state.maskedKeys || {},
                credentialSources: result.credentialSources || this.state.credentialSources || {},
                clearSecrets: {},
                razorpayKeySecret: '',
                stripeSecretKey: '',
                paypalClientSecret: '',
                paytmMerchantKey: '',
                phonepeSaltKey: '',
            });
            setTimeout(() => {
                this.setState({ isSuccessOpen: false });
            }, 4000);
        } catch (error) {
            const errorMsg = error.message || 'Unable to save payment settings.';
            this.setState({
                isSaving: false,
                saveError: errorMsg,
                couponErrorMsg: errorMsg,
            });
        }
    }

    handleClose() {
        this.setState({ isSuccessOpen: false });
    }

    render() {
        this.state.currency === 'INR' ? '₹' : this.state.currency === 'USD' ? '$' : this.state.currency === 'EUR' ? '€' : '£';

        return (
            <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
                {this.state.paymentSettingsNotice && (
                    <div
                        role="alert"
                        data-testid="payment-settings-notice"
                        className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 flex items-start gap-2"
                    >
                        <span className="flex-1">{this.state.paymentSettingsNotice}</span>
                        <button
                            type="button"
                            onClick={() => this.setState({ paymentSettingsNotice: null })}
                            className="underline underline-offset-2"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
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
                {this.state.saveError && (
                    <div
                        role="alert"
                        data-testid="save-error-notice"
                        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex items-start justify-between gap-2 shadow-2xs animate-fade-in"
                    >
                        <div className="flex items-center gap-2.5">
                            <FaExclamationCircle className="w-5 h-5 text-rose-600 shrink-0" />
                            <span className="font-semibold">{this.state.saveError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => this.setState({ saveError: null })}
                            className="text-rose-500 hover:text-rose-700 font-bold p-1 cursor-pointer"
                        >
                            <FaTimes className="w-4 h-4" />
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
                            <span>Payment &amp; Invoice Ledger ({this.state.adminInvoicesList.length})</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                this.setState({ adminTab: 'webhooks' });
                                this.fetchWebhooks();
                            }}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                this.state.adminTab === 'webhooks'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <FaBolt className="w-3.5 h-3.5" />
                            <span>Webhook Diagnostics ({this.state.webhooksList.length})</span>
                        </button>
                    </div>
                </div>

                {/* --- TAB 6: INBOUND PAYMENT WEBHOOK TELEMETRY & DIAGNOSTICS --- */}
                {this.state.adminTab === 'webhooks' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FaBolt className="text-amber-500" /> Inbound Payment Webhooks &amp; Idempotency Stream
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Live inspection of inbound gateway delivery events (`payment_webhook_events`), signature validation, and payload diagnostics.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <select
                                    value={this.state.webhookProviderFilter}
                                    onChange={(e) => this.setState({ webhookProviderFilter: e.target.value }, () => this.fetchWebhooks())}
                                    className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700"
                                >
                                    <option value="all">All Gateways</option>
                                    <option value="stripe">Stripe</option>
                                    <option value="razorpay">Razorpay</option>
                                    <option value="paypal">PayPal</option>
                                    <option value="paytm">Paytm</option>
                                    <option value="phonepe">PhonePe</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => this.fetchWebhooks()}
                                    disabled={this.state.loadingWebhooks}
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 hover:bg-slate-50 transition shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                >
                                    <FaSyncAlt className={`h-3.5 w-3.5 text-slate-600 ${this.state.loadingWebhooks ? 'animate-spin' : ''}`} />
                                    <span>Refresh Stream</span>
                                </button>
                            </div>
                        </div>

                        {this.state.webhookSuccessNotice && (
                            <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
                                <span>✅ {this.state.webhookSuccessNotice}</span>
                                <button type="button" onClick={() => this.setState({ webhookSuccessNotice: null })} className="text-emerald-600 hover:text-emerald-800"><FaTimes /></button>
                            </div>
                        )}
                        {this.state.webhookError && (
                            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xs">
                                <span>⚠️ {this.state.webhookError}</span>
                                <button type="button" onClick={() => this.setState({ webhookError: '' })} className="text-rose-600 hover:text-rose-800"><FaTimes /></button>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50/80 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="py-3 px-4">Event ID / Timestamp</th>
                                        <th className="py-3 px-4">Gateway</th>
                                        <th className="py-3 px-4">Event Type</th>
                                        <th className="py-3 px-4">Linked Order</th>
                                        <th className="py-3 px-4">Delivery Status</th>
                                        <th className="py-3 px-4 text-right">Diagnostic Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {this.state.webhooksList.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="py-12 text-center text-slate-400">
                                                <FaBolt className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                                                <p className="font-bold text-slate-600">No webhook events logged</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Inbound webhook notifications from payment providers will appear here in real-time.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        this.state.webhooksList.map((ev) => (
                                            <tr key={ev.eventId} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-3 px-4">
                                                    <span className="font-mono font-bold text-slate-900 block truncate max-w-[180px]">{ev.eventId}</span>
                                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{ev.receivedAt ? new Date(ev.receivedAt).toLocaleString() : '—'}</span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                                                        {ev.provider}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                                                    {ev.eventType}
                                                </td>
                                                <td className="py-3 px-4 font-mono text-slate-600">
                                                    {ev.orderId || '—'}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <FaCheck className="h-2.5 w-2.5" /> IDEMPOTENT_LOGGED
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right space-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => this.setState({ selectedWebhookPayload: ev })}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                                                    >
                                                        <FaCode className="h-3 w-3 text-slate-500" />
                                                        <span>Payload</span>
                                                    </button>
                                                    {this.props.isSuperAdmin && (
                                                        <button
                                                            type="button"
                                                            onClick={() => this.handleReplayWebhook(ev.eventId)}
                                                            disabled={this.state.replayingWebhookId === ev.eventId}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50"
                                                        >
                                                            <FaSyncAlt className={`h-3 w-3 ${this.state.replayingWebhookId === ev.eventId ? 'animate-spin' : ''}`} />
                                                            <span>{this.state.replayingWebhookId === ev.eventId ? 'Replaying...' : 'Replay'}</span>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Webhook Payload Modal */}
                        {this.state.selectedWebhookPayload && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <div>
                                            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                                                <FaCode className="text-indigo-600" /> Webhook Payload Diagnostic
                                            </h4>
                                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">Event ID: {this.state.selectedWebhookPayload.eventId}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ selectedWebhookPayload: null })}
                                            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
                                        >
                                            <FaTimes />
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-xl overflow-auto flex-1 max-h-[50vh]">
                                        <pre>{JSON.stringify(this.state.selectedWebhookPayload.payload, null, 2)}</pre>
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                        <button
                                            type="button"
                                            onClick={() => this.setState({ selectedWebhookPayload: null })}
                                            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

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
                        {this.state.invoiceLedgerError && (
                            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-900">
                                {this.state.invoiceLedgerError} No zero-valued ledger summary is being shown.
                            </div>
                        )}

                        {!this.state.invoiceLedgerError && (() => {
                            const rawList = this.state.adminInvoicesList || [];
                            const paidList = rawList.filter(inv => inv.status === 'Completed' || inv.status === 'Paid' || inv.status === 'PAID');
                            const refundedList = rawList.filter(inv => inv.status === 'Refunded' || inv.status === 'REFUNDED');
                            const failedList = rawList.filter(inv => inv.status === 'Failed' || inv.status === 'FAILED');
                            const pendingList = rawList.filter(inv => inv.status === 'Pending' || inv.status === 'PENDING');

                            const paidValue = paidList.reduce((acc, inv) => acc + (parseFloat(inv.price !== undefined ? inv.price : (inv.amount || 0)) || 0), 0);
                            const refundedVal = refundedList.reduce((acc, inv) => acc + (parseFloat(inv.price !== undefined ? inv.price : (inv.amount || 0)) || 0), 0);
                            const totalGross = paidValue + refundedVal;
                            const netRev = paidValue;
                            const ledgerCurrencies = new Set([...paidList, ...refundedList].map(item => item.currency).filter(Boolean));
                            const summaryCurrency = ledgerCurrencies.size === 1 ? [...ledgerCurrencies][0] : null;
                            const summarySymbol = summaryCurrency === 'INR' ? '₹' : summaryCurrency === 'USD' ? '$' : summaryCurrency === 'EUR' ? '€' : summaryCurrency ? `${summaryCurrency} ` : '';
                            const hasConfirmedVolume = paidList.length + refundedList.length > 0;
                            const grossDisplay = !hasConfirmedVolume ? 'No confirmed volume' : summaryCurrency ? `${summarySymbol}${totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Multiple currencies';
                            const netDisplay = !hasConfirmedVolume ? 'No confirmed volume' : summaryCurrency ? `${summarySymbol}${netRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Multiple currencies';
                            const refundDisplay = refundedList.length === 0 ? 'No refunds' : summaryCurrency ? `${summarySymbol}${refundedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Multiple currencies';

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
                                        <div className="text-xl font-black font-mono">{refundDisplay}</div>
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
                                    <p className="text-xs text-slate-500 mt-0.5">Latest MariaDB payment orders (up to 200), joined only to immutable invoices and credit notes; ambiguous legacy transaction rows are excluded.</p>
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
                                        <span>Export Billing Ledger CSV</span>
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
                                const name = (inv.customerName || '').toLowerCase();
                                const email = (inv.customerEmail || '').toLowerCase();
                                const gstin = (inv.customerGstin || '').toLowerCase();
                                const gw = (inv.paymentType || '').toLowerCase();
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
                                                const gstin = inv.customerGstin || '';
                                                const isB2B = Boolean(gstin && gstin.length === 15);
                                                const symbol = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : inv.currency === 'INR' ? '₹' : `${inv.currency || ''} `;
                                                const invNo = inv.invoiceNumber || inv.transactionId || inv.docId || 'Reference unavailable';
                                                const priceVal = inv.price !== null && inv.price !== undefined && Number.isFinite(Number(inv.price)) ? Number(inv.price) : null;
                                                const tax = inv.taxAmount !== null && inv.taxAmount !== undefined && Number.isFinite(Number(inv.taxAmount)) ? Number(inv.taxAmount) : null;
                                                const taxable = inv.subtotal !== null && inv.subtotal !== undefined && Number.isFinite(Number(inv.subtotal)) ? Number(inv.subtotal) : null;
                                                
                                                const status = (inv.status || 'Unknown').toLowerCase();
                                                const isPaid = status === 'completed' || status === 'paid';
                                                const isRefunded = status === 'refunded';
                                                const isFailed = status === 'failed';
                                                const isPending = status === 'pending';
                                                const isRefundPending = String(inv.rawStatus || '').toUpperCase() === 'REFUND_PENDING';

                                                return (
                                                    <tr key={inv.docId || inv.transactionId || idx} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="p-3">
                                                            <div className="font-mono font-bold text-indigo-950 text-[11px]">{invNo}</div>
                                                            <div className="text-[10px] text-slate-500 mt-0.5">{inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN') : 'Date unavailable'}</div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-slate-900 text-xs">
                                                                    {inv.customerName || 'Customer identity unavailable'}
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
                                                                {inv.customerEmail || inv.userId || 'Customer reference unavailable'}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${isB2B ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                                                    {inv.paymentType || 'Provider unknown'} {inv.invoice ? (isB2B ? '• B2B invoice' : '• B2C invoice') : '• No issued invoice'}
                                                                </span>
                                                                {isB2B && <span className="font-mono text-[9px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">GST: {gstin}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono">
                                                            <div className="font-extrabold text-slate-900 text-sm">{priceVal === null ? 'Amount unavailable' : `${symbol}${priceVal.toFixed(2)}`}</div>
                                                            {inv.invoice ? (
                                                                <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1.5 mt-0.5 whitespace-nowrap">
                                                                    <span>Net: {taxable === null ? '—' : `${symbol}${taxable.toFixed(2)}`}</span>
                                                                    <span className="text-slate-300">•</span>
                                                                    <span className="text-indigo-600 font-bold">GST: {tax === null ? '—' : `${symbol}${tax.toFixed(2)}`}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="text-[10px] text-amber-700 mt-0.5">Tax breakdown unavailable without an issued invoice</div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                                                                {(isPaid || isRefunded) && isAuthoritativeInvoice(inv.invoice) && <button
                                                                    type="button"
                                                                    onClick={() => this.handleOpenPDFModal(inv)}
                                                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] transition-colors border border-indigo-200 cursor-pointer inline-flex items-center gap-1"
                                                                >
                                                                    <FaPrint className="w-3 h-3" />
                                                                    <span>View invoice</span>
                                                                </button>}
                                                                {isRefunded && isAuthoritativeCreditNote(inv.creditNote) && <button
                                                                    type="button"
                                                                    onClick={() => this.printCreditNote(inv)}
                                                                    className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg text-[11px] transition-colors border border-purple-200 cursor-pointer inline-flex items-center gap-1"
                                                                >
                                                                    <FaPrint className="w-3 h-3" />
                                                                    <span>Credit note</span>
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
                                                                {isRefundPending && inv.source === 'payment_orders' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => this.handleOpenRefundModal(inv)}
                                                                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg text-[11px] transition-colors border border-amber-200 cursor-pointer inline-flex items-center gap-1"
                                                                    >
                                                                        <span>Reconcile refund</span>
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
                                    <div className="md:col-span-2 p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">Tax-Inclusive Pricing Mode</h4>
                                                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">Required For Checkout</span>
                                            </div>
                                            <p className="text-[11px] text-indigo-900/80 mt-1 leading-relaxed">
                                                Catalog plan prices entered in Subscription Tiers already include tax (e.g. ₹199 total includes 18% GST).
                                                This guarantees displayed, charged, and invoiced totals are 100% identical with zero unexpected surcharges at checkout.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => this.setState((prev) => ({ taxInclusive: !prev.taxInclusive }))}
                                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                                this.state.taxInclusive
                                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                            }`}
                                        >
                                            {this.state.taxInclusive ? (
                                                <>
                                                    <FaToggleOn className="w-4 h-4" />
                                                    <span>Tax-Inclusive ON</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FaToggleOff className="w-4 h-4 text-slate-500" />
                                                    <span>Exclusive OFF</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

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
                                            placeholder="IME365 Technologies Pvt Ltd"
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
                                            placeholder="IME365"
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
                                            placeholder="6-digit SAC"
                                            inputMode="numeric"
                                            maxLength={6}
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold focus:border-indigo-500 outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Invoice Prefix
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.invoicePrefix}
                                            onChange={(e) => this.setState({ invoicePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 3) })}
                                            placeholder="Up to 3 characters"
                                            maxLength={3}
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-semibold focus:border-indigo-500 outline-none"
                                        />
                                        <p className="mt-1 text-[10px] text-slate-500">Kept to three characters so the generated serial stays within 16 characters.</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Financial Year
                                        </label>
                                        <input
                                            type="text"
                                            value={this.state.financialYear}
                                            onChange={(e) => this.setState({ financialYear: e.target.value.trim().slice(0, 5) })}
                                            placeholder="YY-YY"
                                            maxLength={5}
                                            inputMode="numeric"
                                            className="w-full text-xs p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono font-semibold focus:border-indigo-500 outline-none"
                                        />
                                        <p className="mt-1 text-[10px] text-slate-500">Use the audited five-character format, for example YY-YY.</p>
                                    </div>

                                </div>
                            )}
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
                        <fieldset disabled={!this.props.isSuperAdmin} className="contents">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
                            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                                    <FaFlask className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Payment Gateway API Keys &amp; Credentials (Sandbox &amp; Production)</h3>
                                    <p className="text-xs text-slate-500">Configure test (sandbox) or live API keys for Razorpay, Stripe, PayPal, Paytm, and PhonePe.</p>
                                    <p className="mt-1 text-[10px] font-semibold text-slate-500">Secrets are write-only. Empty fields preserve the active credential; use Clear, then Save, to intentionally remove a MariaDB-stored credential.</p>
                                    {this.state.providerTestMessage && <div role={this.state.providerTestMessage.type === 'success' ? 'status' : 'alert'} className={`mt-3 rounded-lg border p-3 text-xs font-semibold ${this.state.providerTestMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{this.state.providerTestMessage.text}</div>}
                                    <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase text-slate-500">Test active credentials</span>{['razorpay', 'stripe', 'paypal', 'paytm', 'phonepe'].map(provider => <button key={provider} type="button" onClick={() => this.testPaymentProvider(provider)} disabled={Boolean(this.state.testingProvider)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{this.state.testingProvider === provider ? 'Testing…' : provider}</button>)}</div>
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
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={this.state.razorpayKeySecret}
                                                onChange={(e) => this.setState(prev => ({ razorpayKeySecret: e.target.value, clearSecrets: { ...(prev.clearSecrets || {}), razorpay: false } }))}
                                                placeholder={this.state.configuredProviders?.razorpay ? '✓ Configured securely — enter to replace' : 'Paste your Razorpay key secret'}
                                                className={`w-full text-xs p-2.5 bg-white border rounded-lg text-slate-900 font-mono outline-none ${
                                                    this.state.configuredProviders?.razorpay && !this.state.razorpayKeySecret ? 'border-emerald-300 placeholder:text-emerald-700 focus:border-emerald-500' : 'border-slate-300 focus:border-emerald-500'
                                                }`}
                                            />
                                            {this.state.configuredProviders?.razorpay && !this.state.razorpayKeySecret && (
                                                <div className="absolute right-2.5 top-1.5 flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-1 rounded border border-emerald-200">
                                                    <span>{this.state.maskedKeys?.razorpay}</span>
                                                    <button type="button" className="underline hover:no-underline" onClick={() => this.clearPaymentSecret('razorpay')} aria-label="Clear razorpay credential">Clear</button>
                                                </div>
                                            )}
                                        </div>
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
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={this.state.stripeSecretKey}
                                                onChange={(e) => this.setState(prev => ({ stripeSecretKey: e.target.value, clearSecrets: { ...(prev.clearSecrets || {}), stripe: false } }))}
                                                placeholder={this.state.configuredProviders?.stripe ? '✓ Configured securely — enter to replace' : 'e.g. sk_test_...'}
                                                className={`w-full text-xs p-2.5 bg-white border rounded-lg text-slate-900 font-mono outline-none ${
                                                    this.state.configuredProviders?.stripe && !this.state.stripeSecretKey ? 'border-indigo-300 placeholder:text-indigo-700 focus:border-indigo-500' : 'border-slate-300 focus:border-indigo-500'
                                                }`}
                                            />
                                            {this.state.configuredProviders?.stripe && !this.state.stripeSecretKey && (
                                                <div className="absolute right-2.5 top-1.5 flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-200">
                                                    <span>{this.state.maskedKeys?.stripe}</span>
                                                    <button type="button" className="underline hover:no-underline" onClick={() => this.clearPaymentSecret('stripe')} aria-label="Clear stripe credential">Clear</button>
                                                </div>
                                            )}
                                        </div>
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
                                        <div className="relative">
                                            <input
                                                type="password"
                                                value={this.state.paypalClientSecret}
                                                onChange={(e) => this.setState(prev => ({ paypalClientSecret: e.target.value, clearSecrets: { ...(prev.clearSecrets || {}), paypal: false } }))}
                                                placeholder={this.state.configuredProviders?.paypal ? '✓ Configured securely — enter to replace' : 'e.g. E...'}
                                                className={`w-full text-xs p-2.5 bg-white border rounded-lg text-slate-900 font-mono outline-none ${
                                                    this.state.configuredProviders?.paypal && !this.state.paypalClientSecret ? 'border-blue-300 placeholder:text-blue-700 focus:border-blue-500' : 'border-slate-300 focus:border-blue-500'
                                                }`}
                                            />
                                            {this.state.configuredProviders?.paypal && !this.state.paypalClientSecret && (
                                                <div className="absolute right-2.5 top-1.5 flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-1 rounded border border-blue-200">
                                                    <span>{this.state.maskedKeys?.paypal}</span>
                                                    <button type="button" className="underline hover:no-underline" onClick={() => this.clearPaymentSecret('paypal')} aria-label="Clear paypal credential">Clear</button>
                                                </div>
                                            )}
                                        </div>
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
                                                onChange={(e) => this.setState(prev => ({ paytmMerchantKey: e.target.value, clearSecrets: { ...(prev.clearSecrets || {}), paytm: false } }))}
                                                placeholder={this.state.configuredProviders?.paytm ? '✓ Configured securely — enter to replace' : 'Merchant Key from Paytm Dashboard'}
                                                className={`w-full text-xs p-2.5 bg-white border rounded-lg text-slate-900 font-mono outline-none pr-20 ${
                                                    this.state.configuredProviders?.paytm && !this.state.paytmMerchantKey ? 'border-sky-300 placeholder:text-sky-700 focus:border-sky-500' : 'border-slate-300 focus:border-sky-500'
                                                }`}
                                            />
                                            {this.state.configuredProviders?.paytm && !this.state.paytmMerchantKey ? (
                                                <div className="absolute right-2.5 top-1.5 flex items-center gap-1 text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-1 rounded border border-sky-200">
                                                    <span>{this.state.maskedKeys?.paytm}</span>
                                                    <button type="button" className="underline hover:no-underline" onClick={() => this.clearPaymentSecret('paytm')} aria-label="Clear paytm credential">Clear</button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={() => this.setState((s) => ({ showPaytmKey: !s.showPaytmKey }))} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                                                    {this.state.showPaytmKey ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
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
                                                onChange={(e) => this.setState(prev => ({ phonepeSaltKey: e.target.value, clearSecrets: { ...(prev.clearSecrets || {}), phonepe: false } }))}
                                                placeholder={this.state.configuredProviders?.phonepe ? '✓ Configured securely — enter to replace' : 'Salt Key from PhonePe Dashboard'}
                                                className={`w-full text-xs p-2.5 bg-white border rounded-lg text-slate-900 font-mono outline-none pr-20 ${
                                                    this.state.configuredProviders?.phonepe && !this.state.phonepeSaltKey ? 'border-violet-300 placeholder:text-violet-700 focus:border-violet-500' : 'border-slate-300 focus:border-violet-500'
                                                }`}
                                            />
                                            {this.state.configuredProviders?.phonepe && !this.state.phonepeSaltKey ? (
                                                <div className="absolute right-2.5 top-1.5 flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-1 rounded border border-violet-200">
                                                    <span>{this.state.maskedKeys?.phonepe}</span>
                                                    <button type="button" className="underline hover:no-underline" onClick={() => this.clearPaymentSecret('phonepe')} aria-label="Clear phonepe credential">Clear</button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={() => this.setState((s) => ({ showPhonePeKey: !s.showPhonePeKey }))} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                                                    {this.state.showPhonePeKey ? <FaEyeSlash className="w-3.5 h-3.5" /> : <FaEye className="w-3.5 h-3.5" />}
                                                </button>
                                            )}
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
                        </fieldset>
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

                    {this.state.couponErrorMsg && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl flex items-center gap-2">
                            <span className="font-bold text-rose-600">✕</span>
                            <span>{this.state.couponErrorMsg}</span>
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
                                    <p className="text-xs text-slate-500 mt-0.5">Confirm permanent removal from the authoritative MariaDB coupon store.</p>
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
                        {/* Pricing Tiers & Slashed Rates Matrix Card */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                                    <FaRupeeSign className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Subscription Tiers, Enterprise &amp; Slashed Pricing Rates</h3>
                                    <p className="text-xs text-slate-500">Configure active live prices and slashed (strikethrough retail) comparison rates per currency across all plans.</p>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-slate-200 rounded-xl mb-6">
                                <table className="w-full text-left text-sm text-slate-600">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-extrabold text-slate-700">
                                        <tr>
                                            <th className="px-4 py-3">Currency</th>
                                            <th className="px-4 py-3">Monthly (Active / Slashed)</th>
                                            <th className="px-4 py-3">Quarterly (Active / Slashed)</th>
                                            <th className="px-4 py-3">Annual (Active / Slashed)</th>
                                            <th className="px-4 py-3">Enterprise / Seat (Active / Slashed)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {['INR', 'USD', 'EUR', 'GBP'].map(curr => {
                                            const isINR = curr === 'INR';
                                            const isGBP = curr === 'GBP';
                                            const symbol = isINR ? '₹' : (curr === 'USD' ? '$' : (curr === 'EUR' ? '€' : '£'));
                                            return (
                                                <tr key={curr} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3 font-extrabold text-slate-900 whitespace-nowrap">
                                                        <span>{curr} ({symbol})</span>
                                                        {curr === this.state.currency && (
                                                            <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                                                                Primary
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5 min-w-[170px]">
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Active</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.monthly ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'monthly', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '199' : (isGBP ? '15' : '19')} className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Slashed</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.monthlyOriginal ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'monthlyOriginal', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '349' : (isGBP ? '25' : '30')} className="w-full px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-slate-50" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5 min-w-[170px]">
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Active</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.quartarly ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'quartarly', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '399' : (isGBP ? '35' : '39')} className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Slashed</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.quartarlyOriginal ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'quartarlyOriginal', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '597' : (isGBP ? '50' : '57')} className="w-full px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-slate-50" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5 min-w-[170px]">
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Active</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.yearly ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'yearly', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '499' : (isGBP ? '45' : '49')} className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Slashed</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.yearlyOriginal ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'yearlyOriginal', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '2388' : (isGBP ? '200' : '228')} className="w-full px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-slate-50" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-1.5 min-w-[170px]">
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Active</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.enterprise ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'enterprise', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '2999' : (isGBP ? '39' : '49')} className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-white" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Slashed</label>
                                                                <input type="number" step="1" min="0" value={this.state.pricingMatrix?.[curr]?.enterpriseOriginal ?? ''} onChange={(e) => this.handleMatrixChange(curr, 'enterpriseOriginal', e.target.value)} disabled={!this.state.checkedSubscriptions} placeholder={isINR ? '4999' : (isGBP ? '79' : '99')} className="w-full px-2.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 bg-slate-50" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Marketing & Discount Badges Configuration */}
                            <div className="border-t border-slate-200 pt-6 mt-6">
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Marketing Badges &amp; Discount Callouts</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Quarterly Badge Text</label>
                                        <input
                                            type="text"
                                            value={this.state.quarterlyBadgeText}
                                            onChange={(e) => this.handleChange(e, 'quarterlyBadgeText')}
                                            disabled={!this.state.checkedSubscriptions}
                                            placeholder="Save 33% off retail"
                                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-semibold text-slate-900 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Annual Plan Badge Text</label>
                                        <input
                                            type="text"
                                            value={this.state.yearlyBadgeText}
                                            onChange={(e) => this.handleChange(e, 'yearlyBadgeText')}
                                            disabled={!this.state.checkedSubscriptions}
                                            placeholder="🔥 Best Value • Save 79%"
                                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-semibold text-slate-900 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Enterprise Badge Text</label>
                                        <input
                                            type="text"
                                            value={this.state.enterpriseBadgeText}
                                            onChange={(e) => this.handleChange(e, 'enterpriseBadgeText')}
                                            disabled={!this.state.checkedSubscriptions}
                                            placeholder="Save 40% on annual licenses"
                                            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-semibold text-slate-900 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Primary Currency Selector */}
                            <div className="border-t border-slate-200 pt-6 mt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="relative">
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Primary Platform Currency</label>
                                        <select
                                            value={this.state.currency}
                                            onChange={(event) => this.handleChange(event, 'currency')}
                                            disabled={!this.state.checkedSubscriptions}
                                            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-800 font-bold bg-white text-slate-900 appearance-none"
                                        >
                                            <option value="INR">🇮🇳 INR (₹ - Indian Rupee)</option>
                                            <option value="USD">💵 USD ($ - US Dollar)</option>
                                            <option value="EUR">💶 EUR (€ - Euro)</option>
                                            <option value="GBP">💷 GBP (£ - British Pound)</option>
                                        </select>
                                        <p className="text-[11px] text-slate-500 mt-1">Default currency for platform billing and checkout</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Persistent Save Action Button (Available across configuration tabs) */}
                {this.state.adminTab !== 'invoices' && (
                    <div className="space-y-3 pt-4 border-t border-slate-200 bg-white p-4 rounded-2xl shadow-2xs">
                        {this.state.saveError && (
                            <div
                                role="alert"
                                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-center justify-between gap-2"
                            >
                                <div className="flex items-center gap-2">
                                    <FaExclamationCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                    <span className="font-semibold">{this.state.saveError}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ saveError: null })}
                                    className="text-rose-500 hover:text-rose-700 font-bold p-1 cursor-pointer"
                                >
                                    <FaTimes className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center text-xs text-slate-500">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
                                <span>Enterprise changes apply immediately to user dashboard &amp; popup checkout</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => this.submitHandler()}
                                disabled={this.state.isSaving}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:bg-slate-600 transition-colors flex items-center space-x-2 shadow-md cursor-pointer disabled:cursor-not-allowed"
                            >
                                {this.state.isSaving ? (
                                    <>
                                        <FaSyncAlt className="w-4 h-4 text-emerald-400 animate-spin" />
                                        <span>Saving Settings…</span>
                                    </>
                                ) : (
                                    <>
                                        <FaCheck className="w-4 h-4 text-emerald-400" />
                                        <span>Save Subscription &amp; Payment Settings</span>
                                    </>
                                )}
                            </button>
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
                                        <h3 className="font-bold text-sm text-white">
                                            {String(this.state.refundModalInvoice.rawStatus || '').toUpperCase() === 'REFUND_PENDING' ? 'Reconcile Pending Refund' : 'Request Full Order Refund'}
                                        </h3>
                                        <p className="text-[11px] text-rose-300 font-mono">Order: {this.state.refundModalInvoice.docId || this.state.refundModalInvoice.id || 'Unavailable'}</p>
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
                                        Customer: <strong>{this.state.refundModalInvoice.customerName || 'Customer identity unavailable'}</strong> ({this.state.refundModalInvoice.customerEmail || 'Email unavailable'})
                                    </div>
                                    <div className="text-rose-900 font-extrabold font-mono text-sm pt-0.5">
                                        Refund Amount: {this.state.refundModalInvoice.currency ? `${this.state.refundModalInvoice.currency} ` : ''}{this.state.refundModalInvoice.price === null || this.state.refundModalInvoice.price === undefined ? 'Unavailable' : Number(this.state.refundModalInvoice.price).toFixed(2)} via {this.state.refundModalInvoice.paymentType || 'Provider unavailable'}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-slate-800 block text-xs">Primary Refund Reason *</label>
                                    <select
                                        value={this.state.refundReason}
                                        onChange={(e) => this.setState({ refundReason: e.target.value })}
                                        className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-rose-500 font-medium"
                                    >
                                        <option value="" disabled>Select a verified reason</option>
                                        <option value="Customer requested refund">Customer requested refund</option>
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
                                        <span>Refund state-machine actions:</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                                        <li>Use the durable attempt key to submit or query the provider refund</li>
                                        <li>Keep the order pending while the provider reports a non-terminal status</li>
                                        <li>After confirmed completion, reconcile entitlement and persist the audit record in one MariaDB transaction</li>
                                        <li>Issue an immutable credit note when an authoritative tax invoice exists</li>
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
                                        disabled={this.state.isProcessingRefund || `${this.state.refundReason}${this.state.customRefundNote}`.trim().length < 5}
                                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <span>{this.state.isProcessingRefund ? 'Contacting Provider...' : (String(this.state.refundModalInvoice.rawStatus || '').toUpperCase() === 'REFUND_PENDING' ? 'Reconcile Provider Status' : 'Submit Full Refund')}</span>
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

export default function SubscriptionSettingWithSession(props) {
    const { isSuperAdmin } = useAdminSession();
    return <SubscriptionSetting {...props} isSuperAdmin={isSuperAdmin === true} />;
}
