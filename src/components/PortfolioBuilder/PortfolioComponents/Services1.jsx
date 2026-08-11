import React from 'react';

const Services1 = {
    render: ({ title, subtitle, services }) => (
        <div className="py-16 px-4 bg-purple-50">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {services &&
                        services.map((service, index) => (
                            <div
                                key={index}
                                className={`bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-all duration-300 relative ${
                                    service.popular ? 'ring-2 ring-purple-500 transform scale-105' : ''
                                }`}>
                                {service.popular && (
                                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                        <span className="bg-purple-500 text-white px-4 py-1 rounded-full text-sm font-medium">Most Popular</span>
                                    </div>
                                )}

                                <div className="text-center mb-6">
                                    <div className="text-4xl mb-4">{service.icon}</div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">{service.title}</h3>
                                    <p className="text-gray-600 mb-4">{service.description}</p>
                                    <div className="text-2xl font-bold text-purple-600 mb-2">{service.price}</div>
                                    <div className="text-sm text-gray-500">{service.duration}</div>
                                </div>

                                {service.features && service.features.length > 0 && (
                                    <div className="mb-6">
                                        <ul className="space-y-2">
                                            {service.features.map((feature, i) => (
                                                <li key={i} className="flex items-center text-sm text-gray-600">
                                                    <span className="text-purple-500 mr-2">✓</span>
                                                    {feature.feature}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <button className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors font-medium">Get Started</button>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    ),
};

export default Services1;
