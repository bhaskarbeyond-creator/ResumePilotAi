import React from 'react';
import { FaCalendarAlt, FaChevronDown, FaCheck } from 'react-icons/fa';

const MONTHS = [
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Feb' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' },
    { value: '05', label: 'May' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Aug' },
    { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => String(currentYear - i));

/**
 * Premium Modern Resume Month & Year Picker Component
 * Sleek unified glass control + custom dropdowns + native HTML5 calendar picker + Present toggle
 */
export function MonthYearPicker({ label, value, onChange, disabled, showPresentCheck, isCurrent, onCurrentChange }) {
    // Parse value (e.g. "Jan 2024", "2024-03", "2024", "Present")
    const parseValue = (val) => {
        if (!val || typeof val !== 'string') return { month: '', year: '' };
        const str = val.trim();
        if (str.toLowerCase() === 'present') return { month: 'Present', year: 'Present' };

        // Match YYYY-MM
        const isoMatch = str.match(/^(\d{4})-(\d{2})$/);
        if (isoMatch) return { year: isoMatch[1], month: isoMatch[2] };

        // Match "Jan 2024" or "January 2024"
        const monthNameMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const yearMatch = str.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? yearMatch[1] : '';

        let month = '';
        const lower = str.toLowerCase();
        for (const [name, num] of Object.entries(monthNameMap)) {
            if (lower.includes(name)) { month = num; break; }
        }
        return { month, year };
    };

    const { month, year } = parseValue(value);

    const handleMonthChange = (newMonth) => {
        if (!year && newMonth) {
            const yr = String(new Date().getFullYear());
            formatAndEmit(newMonth, yr);
        } else {
            formatAndEmit(newMonth, year);
        }
    };

    const handleYearChange = (newYear) => {
        formatAndEmit(month, newYear);
    };

    const handleNativeMonthChange = (e) => {
        const isoVal = e.target.value; // e.g. "2024-03"
        if (isoVal) {
            const [y, m] = isoVal.split('-');
            formatAndEmit(m, y);
        }
    };

    const formatAndEmit = (m, y) => {
        if (!y) {
            onChange('');
            return;
        }
        const mObj = MONTHS.find(item => item.value === m);
        const mLabel = mObj ? mObj.label : '';
        const result = mLabel ? `${mLabel} ${y}` : y;
        onChange(result);
    };

    // Calculate YYYY-MM for native picker default
    const nativeIso = (year && month && month !== 'Present') ? `${year}-${month}` : '';

    return (
        <div className="space-y-1.5 font-sans">
            {label && <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">{label}</label>}
            
            <div className={`relative flex items-center bg-white border rounded-xl shadow-xs transition-all ${
                isCurrent 
                    ? 'border-indigo-200 bg-indigo-50/40 text-indigo-900 ring-2 ring-indigo-500/10' 
                    : 'border-slate-300 hover:border-indigo-400 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500/20'
            }`}>
                {/* Calendar Icon Button */}
                <div className="relative flex items-center justify-center pl-3 pr-2 py-2.5 text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors" title="Click to open interactive calendar picker">
                    <FaCalendarAlt className="w-3.5 h-3.5 text-indigo-500" />
                    {!isCurrent && (
                        <input
                            type="month"
                            disabled={disabled}
                            value={nativeIso}
                            onChange={handleNativeMonthChange}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                    )}
                </div>

                {isCurrent ? (
                    <div className="flex-1 py-2.5 px-3 text-xs font-bold text-indigo-700 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <FaCheck className="w-3 h-3 text-indigo-600" />
                            <span>Currently Active Position</span>
                        </div>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">Present</span>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center pr-1">
                        {/* Month Select */}
                        <div className="relative flex-1">
                            <select
                                disabled={disabled}
                                value={month}
                                onChange={(e) => handleMonthChange(e.target.value)}
                                className="w-full text-xs py-2 pl-1.5 pr-5 bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer appearance-none">
                                <option value="">Month</option>
                                {MONTHS.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            <FaChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400 pointer-events-none" />
                        </div>

                        <span className="text-slate-300 font-light select-none px-0.5">/</span>

                        {/* Year Select */}
                        <div className="relative flex-1">
                            <select
                                disabled={disabled}
                                value={year}
                                onChange={(e) => handleYearChange(e.target.value)}
                                className="w-full text-xs py-2 pl-1.5 pr-5 bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer appearance-none">
                                <option value="">Year</option>
                                {YEARS.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                            <FaChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                )}
            </div>

            {/* Currently Work Here Checkbox Toggle */}
            {showPresentCheck && (
                <label className={`inline-flex items-center gap-2 mt-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                    isCurrent
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}>
                    <input
                        type="checkbox"
                        checked={Boolean(isCurrent)}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            if (onCurrentChange) onCurrentChange(checked);
                            if (checked) onChange('Present');
                            else onChange('');
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer accent-indigo-600"
                    />
                    <span>I currently work here</span>
                </label>
            )}
        </div>
    );
}

export default MonthYearPicker;
