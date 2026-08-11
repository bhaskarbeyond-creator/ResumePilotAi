import React from 'react';

const Awards2 = {
    render: ({ title, subtitle, awards }) => {
        // Sort awards by date (newest first)
        const sortedAwards = awards
            ? [...awards].sort((a, b) => {
                  const yearA = parseInt(a.date) || 0;
                  const yearB = parseInt(b.date) || 0;
                  return yearB - yearA;
              })
            : [];

        return (
            <div className="py-16 px-4 bg-red-50">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                        {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                    </div>

                    <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-red-300"></div>

                        <div className="space-y-8">
                            {sortedAwards.map((award, index) => (
                                <div key={index} className="relative pl-20">
                                    {/* Timeline dot */}
                                    <div
                                        className={`absolute left-6 w-4 h-4 rounded-full border-4 border-white shadow ${
                                            award.category === 'professional'
                                                ? 'bg-blue-500'
                                                : award.category === 'academic'
                                                ? 'bg-green-500'
                                                : award.category === 'competition'
                                                ? 'bg-red-500'
                                                : award.category === 'recognition'
                                                ? 'bg-purple-500'
                                                : 'bg-gray-500'
                                        }`}></div>

                                    <div className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center mb-2">
                                                    <span className="text-3xl mr-3">{award.icon}</span>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-800">{award.title}</h3>
                                                        <h4 className="text-lg font-semibold text-red-600">{award.organization}</h4>
                                                    </div>
                                                </div>
                                                <span
                                                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                                        award.category === 'professional'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : award.category === 'academic'
                                                            ? 'bg-green-100 text-green-800'
                                                            : award.category === 'competition'
                                                            ? 'bg-red-100 text-red-800'
                                                            : award.category === 'recognition'
                                                            ? 'bg-purple-100 text-purple-800'
                                                            : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {award.category ? award.category.toUpperCase() : 'CERTIFICATION'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium mb-2">{award.date}</span>
                                                {award.image && <img src={award.image} alt={award.title} className="w-12 h-12 rounded-lg object-cover" />}
                                            </div>
                                        </div>

                                        <p className="text-gray-700 mb-4">{award.description}</p>

                                        {award.certificateUrl && (
                                            <div className="flex justify-end">
                                                <a
                                                    href={award.certificateUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
                                                    <span className="mr-2">🏆</span>
                                                    View Certificate
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Awards by Category */}
                    <div className="mt-16 bg-white rounded-lg p-8 shadow-sm">
                        <h3 className="text-xl font-semibold text-gray-800 mb-6 text-center">Awards by Category</h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {['professional', 'academic', 'competition', 'recognition', 'certification'].map((category) => {
                                const count = awards ? awards.filter((a) => a.category === category).length : 0;
                                const colors = {
                                    professional: 'text-blue-600',
                                    academic: 'text-green-600',
                                    competition: 'text-red-600',
                                    recognition: 'text-purple-600',
                                    certification: 'text-orange-600',
                                };

                                return (
                                    <div key={category} className="text-center">
                                        <div className={`text-2xl font-bold ${colors[category]}`}>{count}</div>
                                        <div className="text-sm text-gray-600 capitalize">{category}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
};

export default Awards2;
