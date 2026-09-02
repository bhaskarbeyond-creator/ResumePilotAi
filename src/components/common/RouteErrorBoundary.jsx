import React from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw, FiHome } from 'react-icons/fi';

export class RouteErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('[RouteErrorBoundary caught an unhandled render error]:', error, errorInfo);
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            const isDev = Boolean(import.meta.env?.DEV);
            const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';
            const isAdminRoute = typeof window !== 'undefined' && (
                window.location.pathname.startsWith('/adm') ||
                window.location.pathname.startsWith('/admin') ||
                window.location.pathname.startsWith('/platform')
            );
            const returnPath = isAdminRoute ? '/adm' : '/dashboard';
            const returnLabel = isAdminRoute ? 'Return to Admin' : 'Return to Dashboard';
            
            return (
                <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 select-none font-sans">
                    <div className="max-w-lg w-full bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
                        <div className="flex items-center gap-3 text-amber-400 mb-4">
                            <FiAlertTriangle className="h-8 w-8 shrink-0" />
                            <h1 className="text-xl font-black tracking-tight text-white">Application View Error</h1>
                        </div>
                        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                            This page encountered an unexpected client error while rendering. Your data is safe on the server.
                        </p>
                        
                        {isDev && this.state.error && (
                            <div className="mb-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-rose-300 overflow-x-auto max-h-48 select-text">
                                <div className="font-bold text-rose-400 mb-1">{errorMessage}</div>
                                <div className="text-slate-500 whitespace-pre-wrap text-[11px]">{this.state.error.stack}</div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 !text-white text-xs font-extrabold transition shadow-md shadow-indigo-600/30 cursor-pointer"
                            >
                                <FiRefreshCw className="h-3.5 w-3.5" />
                                <span>Reload View</span>
                            </button>
                            <Link
                                to={returnPath}
                                onClick={() => this.setState({ hasError: false })}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 !text-slate-100 text-xs font-bold transition border border-slate-600/80 cursor-pointer"
                            >
                                <FiHome className="h-3.5 w-3.5" />
                                <span>{returnLabel}</span>
                            </Link>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default RouteErrorBoundary;
