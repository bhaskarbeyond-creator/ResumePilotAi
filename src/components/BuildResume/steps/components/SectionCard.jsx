import React from 'react';
import { useTranslation } from 'react-i18next';

const SectionCard = ({ title, badge, children, icon, iconColor = 'text-blue-600', isRequired = false, isCompleted = false, className = '', onClick }) => {
    const { t } = useTranslation('common');

    const getBadgeStyles = () => {
        if (isCompleted) {
            return 'bg-green-100 text-green-800 border-green-200';
        }
        if (isRequired) {
            return 'bg-orange-100 text-orange-800 border-orange-200';
        }
        return 'bg-slate-100 text-slate-600 border-slate-200';
    };

    return (
        <div
            className={`bg-white rounded-xl border border-slate-200 p-6 transition-all duration-200 hover:shadow-md hover:border-slate-300 ${className}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            aria-label={onClick ? t('SectionCard.accessibility.clickableSection') : undefined}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                    {icon && (
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <div className={`w-5 h-5 ${iconColor}`}>{icon}</div>
                        </div>
                    )}
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                </div>
                {badge && <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getBadgeStyles()}`}>{badge}</span>}
            </div>
            {children}
        </div>
    );
};

export default SectionCard;
