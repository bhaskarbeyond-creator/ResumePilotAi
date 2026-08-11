import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PreviewModal = ({ showPreview, setShowPreview, resumeData, onDownload, isDownloading, currentTemplate = 'Cv1', getTemplateComponent, getTemplateName }) => {
    const { t, i18n } = useTranslation('common');
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (showPreview) {
            document.body.style.overflow = 'hidden';
            setTimeout(() => setIsVisible(true), 10);
        } else {
            document.body.style.overflow = 'unset';
            setIsVisible(false);
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showPreview]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => setShowPreview(false), 300);
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    const handleEscapeKey = (e) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    useEffect(() => {
        if (showPreview) {
            document.addEventListener('keydown', handleEscapeKey);
            return () => document.removeEventListener('keydown', handleEscapeKey);
        }
    }, [showPreview]);

    if (!showPreview) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
            {/* Enhanced Backdrop with glassmorphism effect */}
            <div
                className={`absolute inset-0 transition-all duration-500 ease-out ${isVisible ? 'bg-slate-900/20 backdrop-blur-md' : 'bg-transparent backdrop-blur-none'}`}
                onClick={handleBackdropClick}
                style={{
                    background: isVisible ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.1) 0%, rgba(30, 41, 59, 0.2) 100%)' : 'transparent',
                }}
            />

            {/* Modal Container with enhanced animations and mobile responsiveness */}
            <div
                className={`relative w-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] bg-white/95 backdrop-blur-xl rounded-lg sm:rounded-2xl shadow-2xl border border-white/20 transform transition-all duration-500 ease-out ${
                    isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-8 opacity-0 scale-95'
                }`}
                style={{
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                }}>
                {/* Enhanced Header with gradient background - Mobile responsive */}
                <div className="relative bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-slate-200/50 px-3 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 rounded-t-lg sm:rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
                            <div className="hidden sm:block p-2 lg:p-3 bg-blue-100 rounded-lg lg:rounded-xl">
                                <svg className="w-4 h-4 lg:w-6 lg:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-900 tracking-tight truncate">{t('PreviewModal.title')}</h2>
                                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1 font-medium truncate">
                                    {t('PreviewModal.subtitle', { templateName: getTemplateName ? getTemplateName(currentTemplate) : currentTemplate })}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                            {/* Enhanced Download Button - Mobile responsive */}
                            <button
                                onClick={onDownload}
                                disabled={isDownloading}
                                className={`relative px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg sm:rounded-xl font-semibold transition-all duration-300 flex items-center space-x-1 sm:space-x-2 text-xs sm:text-sm shadow-lg ${
                                    isDownloading
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                        : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-blue-500/25 hover:shadow-blue-500/40 hover:shadow-xl transform hover:-translate-y-0.5'
                                }`}>
                                {isDownloading ? (
                                    <>
                                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="hidden sm:inline">{t('PreviewModal.actions.generatingPdf')}</span>
                                        <span className="sm:hidden">PDF...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        <span className="hidden sm:inline">{t('PreviewModal.actions.downloadPdf')}</span>
                                        <span className="sm:hidden">PDF</span>
                                    </>
                                )}
                            </button>

                            {/* Enhanced Close Button - Mobile responsive */}
                            <button
                                onClick={handleClose}
                                className="p-2 sm:p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg sm:rounded-xl transition-all duration-200 group"
                                aria-label={t('PreviewModal.actions.close')}>
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Enhanced Modal Body with improved styling and mobile responsiveness */}
                <div className="relative flex-1 overflow-hidden rounded-b-lg sm:rounded-b-2xl">
                    {/* Gradient overlay for better visual depth */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/30 to-blue-50/50 pointer-events-none"></div>

                    <div className="relative h-[calc(95vh-100px)] sm:h-[calc(90vh-140px)] overflow-auto p-2 sm:p-4 custom-scrollbar">
                        <div className="flex justify-center items-start min-h-full">
                            {/* Enhanced CV Container with better shadow and styling - Mobile responsive */}
                            <div
                                className="bg-white rounded-lg sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl"
                                style={{
                                    // Mobile: smaller scale for better fit
                                    transform: window.innerWidth < 640 ? 'scale(0.45)' : window.innerWidth < 1024 ? 'scale(0.55)' : 'scale(0.65)',
                                    transformOrigin: 'top center',
                                    minHeight: '1122px',
                                    width: '794px',
                                    boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.15), 0 8px 32px -8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                                }}>
                                {(() => {
                                    try {
                                        if (!getTemplateComponent) {
                                            return (
                                                <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500">
                                                    <div className="text-center p-4">
                                                        <div className="text-sm sm:text-base">{t('PreviewModal.errors.noTemplate')}</div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        const TemplateComponent = getTemplateComponent(currentTemplate);
                                        return <TemplateComponent values={resumeData} language={i18n.language} />;
                                    } catch (error) {
                                        console.error('Error rendering template in preview modal:', error);
                                        return (
                                            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500">
                                                <div className="text-center p-4">
                                                    <div className="text-sm sm:text-base">{t('PreviewModal.errors.templateError')}</div>
                                                    <div className="text-xs sm:text-sm mt-1">{t('PreviewModal.errors.tryDifferent')}</div>
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Keyboard shortcut hint - Mobile responsive */}
                <div className="absolute bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-slate-800/90 backdrop-blur-sm text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-full text-xs font-medium flex items-center space-x-1 sm:space-x-2 shadow-lg">
                        <kbd className="bg-slate-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs">ESC</kbd>
                        <span className="hidden sm:inline">{t('PreviewModal.keyboard.escToClose')}</span>
                        <span className="sm:hidden">Close</span>
                    </div>
                </div>
            </div>

            {/* Custom scrollbar styles */}
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(241, 245, 249, 0.5);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.5);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(148, 163, 184, 0.8);
                }

                /* Mobile specific styles */
                @media (max-width: 640px) {
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 4px;
                    }
                }
            `}</style>
        </div>
    );
};

export default PreviewModal;
