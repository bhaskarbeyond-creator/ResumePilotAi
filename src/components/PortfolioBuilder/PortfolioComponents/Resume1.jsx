import React from 'react';

const Resume1 = {
    render: ({ title, subtitle, description, resumeUrl, resumePreview, downloadText, highlights }) => (
        <div className="py-16 px-4 bg-gray-900">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-white">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-300">{subtitle}</p>}
                </div>

                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <p className="text-gray-300 text-lg leading-relaxed mb-8">{description}</p>

                        {highlights && highlights.length > 0 && (
                            <div className="mb-8">
                                <h3 className="text-xl font-semibold text-white mb-4">Key Highlights:</h3>
                                <ul className="space-y-2">
                                    {highlights.map((highlight, index) => (
                                        <li key={index} className="flex items-center text-gray-300">
                                            <span className="text-blue-400 mr-3">✓</span>
                                            {highlight.highlight}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-4">
                            <a
                                href={resumeUrl}
                                download
                                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold text-center flex items-center justify-center">
                                <span className="mr-2">📄</span>
                                {downloadText}
                            </a>
                            <button className="border border-gray-600 text-gray-300 px-8 py-3 rounded-lg hover:bg-gray-800 transition-colors font-semibold">View Online</button>
                        </div>
                    </div>

                    <div className="text-center">
                        {resumePreview && (
                            <div className="bg-white rounded-lg shadow-2xl p-4 max-w-sm mx-auto transform hover:scale-105 transition-transform">
                                <img src={resumePreview} alt="Resume Preview" className="w-full rounded shadow-lg" />
                                <div className="mt-4 flex items-center justify-center space-x-2">
                                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                    <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="text-center mt-12">
                    <p className="text-gray-400 text-sm">Last updated: {new Date().toLocaleDateString()}</p>
                </div>
            </div>
        </div>
    ),
};

export default Resume1;
