import React from 'react';

const Experience2 = {
    render: ({ title, subtitle, experiences }) => (
        <div className="py-16 px-4 bg-red-50">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                    {experiences &&
                        experiences.map((exp, index) => (
                            <div key={index} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                                <div className="flex items-start mb-4">
                                    {exp.companyLogo && <img src={exp.companyLogo} alt={exp.company} className="w-12 h-12 rounded-lg mr-4 object-cover" />}
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-gray-800">{exp.position}</h3>
                                        <h4 className="text-lg font-semibold text-red-600">{exp.company}</h4>
                                        <p className="text-gray-600 text-sm">{exp.location}</p>
                                        <span className="inline-block bg-red-100 text-red-700 px-2 py-1 rounded text-xs mt-2">
                                            {exp.startDate} - {exp.endDate}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-gray-700 mb-4">{exp.description}</p>

                                {exp.achievements && exp.achievements.length > 0 && (
                                    <div className="mb-4">
                                        <h5 className="font-semibold text-gray-800 mb-2">Achievements:</h5>
                                        <ul className="space-y-1">
                                            {exp.achievements.slice(0, 3).map((achievement, i) => (
                                                <li key={i} className="text-gray-600 text-sm flex items-start">
                                                    <span className="text-red-500 mr-2">•</span>
                                                    {achievement.achievement}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {exp.technologies && (
                                    <div className="flex flex-wrap gap-1">
                                        {exp.technologies
                                            .split(',')
                                            .slice(0, 6)
                                            .map((tech, i) => (
                                                <span key={i} className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                                                    {tech.trim()}
                                                </span>
                                            ))}
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            </div>
        </div>
    ),
};

export default Experience2;
