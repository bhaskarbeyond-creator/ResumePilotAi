import React from 'react';

const Button = ({ children, variant = 'primary', size = 'md', disabled = false, loading = false, onClick, className = '', type = 'button', icon, ...props }) => {
    const baseClasses =
        'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
        primary: 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg focus:ring-blue-500',
        secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 focus:ring-slate-500',
        success: 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-md hover:shadow-lg focus:ring-emerald-500',
        outline: 'border border-blue-300 bg-transparent text-blue-700 hover:bg-blue-50 hover:border-blue-400 focus:ring-blue-500',
        ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-500',
        danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg focus:ring-red-500',
    };

    const sizeClasses = {
        sm: 'px-3 py-2 text-sm',
        md: 'px-4 py-2.5 text-sm',
        lg: 'px-6 py-3 text-base',
        xl: 'px-8 py-4 text-lg',
    };

    const iconSizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
        xl: 'w-6 h-6',
    };

    return (
        <button type={type} onClick={onClick} disabled={disabled || loading} className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>
            {loading && <div className={`${iconSizeClasses[size]} border-2 border-current border-t-transparent rounded-full animate-spin mr-2`}></div>}

            {icon && !loading && <span className={`${iconSizeClasses[size]} mr-2 flex-shrink-0`}>{icon}</span>}

            {children}
        </button>
    );
};

export default Button;
