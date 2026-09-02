import React from 'react';
import { useTranslation } from 'react-i18next';

const SectionCard = ({ title, badge, children, icon, iconColor = 'text-indigo-600', isRequired = false, isCompleted = false, className = '', onClick }) => {
    const { t } = useTranslation('common');

    const getBadgeStyles = () => {
        if (isCompleted) {
            return 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
        }
        if (isRequired) {
            return 'bg-amber-50 text-amber-800 border-amber-200/80';
        }
        return 'bg-slate-100 text-slate-700 border-slate-200';
    };

    return (
        <div
            className={`bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 transition-all duration-200 shadow-2xs ${className}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            aria-label={onClick ? t('SectionCard.accessibility.clickableSection') : undefined}>
            {title && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center space-x-2.5">
                        {icon && (
                            <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                                <div className={`w-4 h-4 ${iconColor}`}>{icon}</div>
                            </div>
                        )}
                        <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
                    </div>
                    {badge && <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getBadgeStyles()}`}>{badge}</span>}
                </div>
            )}
            {children}
        </div>
    );
};

export default SectionCard;
