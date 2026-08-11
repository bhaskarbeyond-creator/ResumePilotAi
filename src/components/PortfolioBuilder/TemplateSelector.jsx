import React from 'react';
import { TEMPLATE_PRESETS } from './TemplatePresets';

const TemplateSelector = ({ isVisible, onClose, onSelectTemplate, isLoading }) => {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" style={{ zIndex: 100000 }}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <svg className="w-6 h-6 text-white mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                </svg>
                                <div>
                                    <h3 className="text-xl font-semibold text-white">Portfolio Templates</h3>
                                    <p className="text-white/80 text-sm mt-0.5">Choose a professional template to get started quickly</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="text-white/80 cursor-pointer hover:text-white transition-colors p-1" disabled={isLoading}>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {Object.entries(TEMPLATE_PRESETS).map(([key, template]) => (
                                <div key={key} className="group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200">
                                    {/* Preview Image */}
                                    <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                                        <img
                                            src={template.preview}
                                            alt={template.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e) => {
                                                e.target.src = `https://placehold.co/600x450/6B7280/FFFFFF?text=${encodeURIComponent(template.name)}`;
                                            }}
                                        />
                                        <div className="absolute top-3 right-3">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-800 shadow-sm">
                                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                                    />
                                                </svg>
                                                {template.content?.length || 0} sections
                                            </span>
                                        </div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                                    </div>

                                    {/* Template Info */}
                                    <div className="p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-semibold text-gray-900 text-lg">{template.name}</h4>
                                            <div className="flex items-center text-xs text-gray-500">
                                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                Pro
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description}</p>

                                        {/* Template Components */}
                                        <div className="mb-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {template.content?.slice(0, 3).map((component, index) => (
                                                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                                        {component.type}
                                                    </span>
                                                ))}
                                                {template.content?.length > 3 && (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-700">
                                                        +{template.content.length - 3} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <button
                                            onClick={() => onSelectTemplate(key)}
                                            disabled={isLoading}
                                            className="w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 border border-transparent rounded-md hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm">
                                            {isLoading ? (
                                                <>
                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Loading...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                    </svg>
                                                    Use Template
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center text-sm text-gray-600">
                                <svg className="w-4 h-4 mr-2 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                </svg>
                                <span>All templates are fully customizable after loading</span>
                            </div>
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                Start from Scratch
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TemplateSelector;
