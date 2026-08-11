import React from 'react';
import { useTranslation } from 'react-i18next';

const ProgressCard = ({
    title,
    value,
    maxValue,
    progressText,
    colorScheme = 'blue', // blue, emerald, amber, red
    className = '',
}) => {
    const { t } = useTranslation('common');
    const percentage = Math.min(100, (value / maxValue) * 100);

    const colorSchemes = {
        blue: {
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            text: 'text-blue-800',
            progressText: 'text-blue-900',
            bar: 'bg-blue-600',
        },
        emerald: {
            bg: 'bg-emerald-50',
            border: 'border-emerald-200',
            text: 'text-emerald-800',
            progressText: 'text-emerald-900',
            bar: 'bg-emerald-600',
        },
        amber: {
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            text: 'text-amber-800',
            progressText: 'text-amber-900',
            bar: 'bg-amber-600',
        },
        red: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            text: 'text-red-800',
            progressText: 'text-red-900',
            bar: 'bg-red-600',
        },
    };

    const colors = colorSchemes[colorScheme];

    return (
        <div className={`bg-white rounded-lg border border-slate-200 p-4 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                <span className="text-xs text-slate-500 font-medium">
                    {value}/{maxValue}
                </span>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-600">Progress</span>
                    <span className="text-xs font-semibold text-slate-800">{percentage}%</span>
                </div>

                <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${percentage}%` }}
                        role="progressbar"
                        aria-valuenow={percentage}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-label={t('ProgressCard.accessibility.progressBar')}
                    />
                </div>
            </div>
            {progressText && <p className="text-xs text-slate-600 mt-2">{progressText}</p>}
        </div>
    );
};

export default ProgressCard;
