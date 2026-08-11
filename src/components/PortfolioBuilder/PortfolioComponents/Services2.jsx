import React from 'react';

const Services2 = {
    render: ({ title, subtitle, services }) => (
        <div className="py-16 px-4 bg-white">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                    {services &&
                        services.map((service, index) => (
                            <div
                                key={index}
                                className={`rounded-lg border-2 p-8 relative ${
                                    service.popular ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-orange-50 transform scale-105' : 'border-gray-200 bg-white hover:border-gray-300'
                                } transition-all duration-300`}>
                                {service.popular && (
                                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                                        <span className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-1 rounded-full text-sm font-bold">⭐ POPULAR</span>
                                    </div>
                                )}

                                <div className="text-center mb-8">
                                    <div className="text-5xl mb-4">{service.icon}</div>
                                    <h3 className="text-2xl font-bold text-gray-800 mb-4">{service.title}</h3>
                                    <div className="mb-4">
                                        <span className="text-4xl font-bold text-gray-800">{service.price}</span>
                                        <p className="text-gray-600 mt-2">{service.duration}</p>
                                    </div>
                                    <p className="text-gray-600">{service.description}</p>
                                </div>

                                {service.features && service.features.length > 0 && (
                                    <div className="mb-8">
                                        <div className="space-y-3">
                                            {service.features.map((feature, i) => (
                                                <div key={i} className="flex items-center">
                                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center mr-3">
                                                        <span className="text-white text-xs">✓</span>
                                                    </div>
                                                    <span className="text-gray-700">{feature.feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                                        service.popular
                                            ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white hover:from-yellow-500 hover:to-orange-500'
                                            : 'bg-gray-800 text-white hover:bg-gray-900'
                                    }`}>
                                    Choose {service.title}
                                </button>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    ),
};

export default Services2;
