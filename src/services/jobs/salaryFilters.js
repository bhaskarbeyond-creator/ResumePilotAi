const CURRENCY_LOCALES = Object.freeze({
    INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
    CAD: 'en-CA', AUD: 'en-AU', SGD: 'en-SG', AED: 'en-AE', JPY: 'ja-JP',
});

export const SALARY_FILTER_BANDS = Object.freeze([
    Object.freeze({ key: 'salary-40k-60k', min: 40_000, max: 60_000 }),
    Object.freeze({ key: 'salary-60k-80k', min: 60_000, max: 80_000 }),
    Object.freeze({ key: 'salary-80k-120k', min: 80_000, max: 120_000 }),
    Object.freeze({ key: 'salary-120k-plus', min: 120_000, max: Infinity }),
]);

export function formatSalaryFilterAmount(value, currency = 'INR') {
    const code = String(currency || '').trim().toUpperCase();
    if (!Number.isFinite(Number(value)) || !/^[A-Z]{3}$/.test(code)) return String(value);
    try {
        return new Intl.NumberFormat(CURRENCY_LOCALES[code] || 'en-US', {
            style: 'currency',
            currency: code,
            maximumFractionDigits: 0,
        }).format(Number(value));
    } catch {
        return `${code} ${Number(value).toLocaleString('en-IN')}`;
    }
}

export function formatSalaryBandLabel(band, currency = 'INR') {
    const minimum = formatSalaryFilterAmount(band.min, currency);
    if (!Number.isFinite(band.max)) return `${minimum}+`;
    const maximum = formatSalaryFilterAmount(band.max, currency);
    return `${minimum} – ${maximum}`;
}

/** A row can match multiple bands when the employer supplies a wide range. */
export function salaryRowMatchesBand(minValue, maxValue, band) {
    const minimum = Number(minValue);
    const maximum = Number(maxValue);
    const hasMinimum = Number.isFinite(minimum) && minimum > 0;
    const hasMaximum = Number.isFinite(maximum) && maximum > 0;
    if (!hasMinimum && !hasMaximum) return false;

    const rowMinimum = hasMinimum ? minimum : 0;
    const rowMaximum = hasMaximum ? maximum : Infinity;
    return rowMaximum >= band.min && rowMinimum < band.max;
}
