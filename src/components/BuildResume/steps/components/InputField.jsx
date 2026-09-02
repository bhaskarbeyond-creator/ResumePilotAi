import React from 'react';
import { useTranslation } from 'react-i18next';

const InputField = ({ label, name, type = 'text', placeholder, required = false, value, onChange, disabled = false, error = '', hint = '' }) => {
    const { t } = useTranslation('common');

    return (
        <div className="relative w-full">
            <label htmlFor={name} className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {label}
                {required && <span className="text-red-500 ml-1 font-bold">*</span>}
            </label>
            <div className="relative">
                <input
                    type={type}
                    id={name}
                    name={name}
                    value={value || ''}
                    onChange={onChange}
                    disabled={disabled}
                    className={`w-full px-3.5 py-2.5 border rounded-xl transition-all duration-150 text-sm text-slate-900 placeholder-slate-400 bg-white
                        ${
                            disabled
                                ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                                : error
                                ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-3 focus:ring-red-500/15'
                                : 'border-slate-200 hover:border-slate-300 focus:border-indigo-600 focus:ring-3 focus:ring-indigo-500/15'
                        } 
                        focus:outline-none shadow-2xs`}
                    placeholder={placeholder}
                    aria-describedby={required ? `${name}-required` : undefined}
                />
            </div>

            {error ? (
                <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>
            ) : hint ? (
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
            ) : null}

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
