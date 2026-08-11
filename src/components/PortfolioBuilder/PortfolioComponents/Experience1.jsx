import React from 'react';

const Experience1 = {
    render: ({ title, subtitle, experiences }) => (
        <div className="py-16 px-4 bg-white">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>
                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-green-300"></div>

                    <div className="space-y-8">
                        {experiences &&
                            experiences.map((exp, index) => (
                                <div key={index} className="relative pl-20">
                                    {/* Timeline dot */}
                                    <div className="absolute left-6 w-4 h-4 bg-green-500 rounded-full border-4 border-white shadow"></div>

                                    <div className="bg-gray-50 rounded-lg p-6 hover:shadow-md transition-shadow">
                                        <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-4">
                                            <div className="flex-1">
                                                <h3 className="text-xl font-bold text-gray-800">{exp.position}</h3>
                                                <h4 className="text-lg font-semibold text-green-600">{exp.company}</h4>
                                                <p className="text-gray-600">{exp.location}</p>
                                            </div>
                                            <div className="mt-2 md:mt-0">
                                                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                                                    {exp.startDate} - {exp.endDate}
                                                </span>
                                            </div>
                                        </div>

                                        <p className="text-gray-700 mb-4">{exp.description}</p>

                                        {exp.achievements && exp.achievements.length > 0 && (
                                            <div className="mb-4">
                                                <h5 className="font-semibold text-gray-800 mb-2">Key Achievements:</h5>
                                                <ul className="list-disc list-inside space-y-1">
                                                    {exp.achievements.map((achievement, i) => (
                                                        <li key={i} className="text-gray-600 text-sm">
                                                            {achievement.achievement}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {exp.technologies && (
                                            <div className="flex flex-wrap gap-2">
                                                {exp.technologies.split(',').map((tech, i) => (
                                                    <span key={i} className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs">
                                                        {tech.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Experience1;
