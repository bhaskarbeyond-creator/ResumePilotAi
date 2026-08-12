// Indian States and State Codes Directory (GST Standard)
export const INDIAN_STATES = [
    { code: '01', name: 'Jammu and Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: '27', name: 'Maharashtra' },
    { code: '28', name: 'Andhra Pradesh' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '31', name: 'Lakshadweep' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '34', name: 'Puducherry' },
    { code: '35', name: 'Andaman and Nicobar Islands' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Ladakh' },
    { code: '38', name: 'Other Territory' }
];

export function getStateCodeByName(stateName) {
    if (!stateName) return '';
    const cleaned = stateName.trim().toLowerCase();
    const match = INDIAN_STATES.find(s => s.name.toLowerCase() === cleaned || cleaned.includes(s.name.toLowerCase()));
    return match ? match.code : '';
}

export function getStateNameByCode(stateCode) {
    if (!stateCode) return '';
    const match = INDIAN_STATES.find(s => s.code === String(stateCode).padStart(2, '0'));
    return match ? match.name : '';
}

// Convert monetary numbers to Indian Words (Rupees & Paise)
export function numberToIndianRupeesWords(amount, currency = 'INR') {
    const num = Math.abs(parseFloat(amount) || 0);
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

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

    const isINR = (currency || 'INR').toUpperCase() === 'INR';
    const mainUnit = isINR ? 'Rupees' : (currency === 'USD' ? 'Dollars' : 'Euros');
    const subUnit = isINR ? 'Paise' : (currency === 'USD' ? 'Cents' : 'Cents');

    const rupeesWords = convertRupees(rupees);
    const paiseWords = paise > 0 ? convertGroup(paise) : '';

    if (paise > 0) {
        return `${rupeesWords} ${mainUnit} and ${paiseWords} ${subUnit} Only`;
    }
    return `${rupeesWords} ${mainUnit} Only`;
}

// Calculate Decimal-Safe GST Tax Breakdown
export function calculateGSTBreakdown({
    amount = 499,
    gstRate = 18,
    supplierStateCode = '27',
    customerStateCode = '27',
    isTaxInclusive = false
}) {
    const totalAmount = parseFloat(amount) || 0;
    const rate = parseFloat(gstRate) || 18;

    let taxableAmount = 0;
    let taxAmount = 0;

    if (isTaxInclusive) {
        taxableAmount = parseFloat((totalAmount / (1 + (rate / 100))).toFixed(2));
        taxAmount = parseFloat((totalAmount - taxableAmount).toFixed(2));
    } else {
        taxableAmount = totalAmount;
        taxAmount = parseFloat((taxableAmount * (rate / 100)).toFixed(2));
    }

    const sCode = String(supplierStateCode).padStart(2, '0');
    const cCode = String(customerStateCode).padStart(2, '0');
    const isIntraState = sCode === cCode;

    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isIntraState) {
        cgstRate = rate / 2;
        sgstRate = rate / 2;
        cgstAmount = parseFloat((taxAmount / 2).toFixed(2));
        sgstAmount = parseFloat((taxAmount / 2).toFixed(2));
        taxAmount = parseFloat((cgstAmount + sgstAmount).toFixed(2));
    } else {
        igstRate = rate;
        igstAmount = taxAmount;
    }

    const grandTotal = isTaxInclusive
        ? totalAmount
        : parseFloat((taxableAmount + taxAmount).toFixed(2));

    return {
        taxableAmount,
        taxAmount,
        grandTotal,
        isIntraState,
        cgstRate,
        sgstRate,
        igstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        gstRate: rate,
        supplierStateCode: sCode,
        customerStateCode: cCode
    };
}
