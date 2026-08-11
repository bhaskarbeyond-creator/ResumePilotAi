import React from 'react';

const Resume2 = {
    render: ({ title, subtitle, description, resumeUrl, resumePreview, downloadText, stats, highlights }) => (
        <div className="py-16 px-4 bg-slate-900">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-white">{title}</h2>
                    {subtitle && <p className="text-lg text-slate-300">{subtitle}</p>}
                </div>
                
                {/* Stats Section */}
                {stats && stats.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                        {stats.map((stat, index) => (
                            <div key={index} className="bg-slate-800 rounded-lg p-6 text-center">
                                <div className="text-3xl mb-2">{stat.icon}</div>
                                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                                <div className="text-slate-400 text-sm">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="grid lg:grid-cols-3 gap-12">
                    {/* Resume Preview */}
                    <div className="lg:col-span-1">
                        {resumePreview && (
                            <div className="bg-white rounded-lg shadow-2xl p-6 sticky top-8">
                                <div className="mb-4">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Resume Preview</h3>
                                    <div className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4">
                                        <img 
                                            src={resumePreview} 
                                            alt="Resume Preview"
                                            className="w-full rounded shadow-sm"
                                        />
                                    </div>
                                </div>
                                <a 
                                    href={resumeUrl} 
                                    download
                                    className="w-full bg-slate-800 text-white px-6 py-3 rounded-lg hover:bg-slate-700 transition-colors font-semibold text-center flex items-center justify-center"
                                >
                                    <span className="mr-2">⬇️</span>
                                    {downloadText}
                                </a>
                            </div>
                        )}
                    </div>
                    
                    {/* Content */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-slate-800 rounded-lg p-8">
                            <h3 className="text-2xl font-bold text-white mb-4">Professional Overview</h3>
                            <p className="text-slate-300 text-lg leading-relaxed">{description}</p>
                        </div>
                        
                        {highlights && highlights.length > 0 && (
                            <div className="bg-slate-800 rounded-lg p-8">
                                <h3 className="text-2xl font-bold text-white mb-6">Key Highlights</h3>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {highlights.map((highlight, index) => (
                                        <div key={index} className="flex items-center p-4 bg-slate-700 rounded-lg">
                                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                                                <span className="text-white text-sm">✓</span>
                                            </div>
                                            <span className="text-slate-300">{highlight.highlight}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-center">
                            <h3 className="text-2xl font-bold text-white mb-4">Ready to Collaborate?</h3>
                            <p className="text-blue-100 mb-6">Let's discuss how I can contribute to your next project</p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <button className="bg-white text-blue-600 px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors font-semibold">
                                    Schedule a Call
                                </button>
                                <button className="border border-white text-white px-8 py-3 rounded-lg hover:bg-white hover:text-blue-600 transition-colors font-semibold">
                                    Send Message
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Resume2; 