import React from 'react';
import { useTranslation } from 'react-i18next';

const InputField = ({ label, name, type = 'text', placeholder, required = false, value, onChange, disabled = false }) => {
    const { t } = useTranslation('common');

    return (
        <div className="relative">
            <label htmlFor={name} className="block text-sm font-semibold text-slate-800 mb-1.5 tracking-wide">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <div className="relative">
                <input
                    type={type}
                    id={name}
                    name={name}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    className={`w-full px-3 py-3 border rounded-sm transition-all duration-200 text-sm text-slate-900 placeholder-slate-400 bg-white
                        ${
                            disabled
                                ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'
                                : value && value.trim() !== ''
                                ? 'border-green-300 bg-green-50 focus:border-green-500 focus:ring-2 focus:ring-green-100'
                                : 'border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                        } 
                        focus:outline-none focus:ring-opacity-50`}
                    placeholder={placeholder}
                    aria-describedby={required ? `${name}-required` : undefined}
                />

                {/* Success icon */}
                {value && value.trim() !== '' && !disabled && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Required field helper text */}
            {required && (
                <p id={`${name}-required`} className="sr-only">
                    {t('InputField.accessibility.required')}
                </p>
            )}
        </div>
    );
};

export default InputField;
