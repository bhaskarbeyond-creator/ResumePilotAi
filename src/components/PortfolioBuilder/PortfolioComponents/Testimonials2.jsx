import React from 'react';

const Testimonials2 = {
    render: ({ title, subtitle, testimonials }) => (
        <div className="py-16 px-4 bg-teal-50">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {testimonials &&
                        testimonials.map((testimonial, index) => (
                            <div key={index} className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow">
                                <div className="mb-4">
                                    <div className="flex mb-2">
                                        {[...Array(5)].map((_, i) => (
                                            <span key={i} className={`text-sm ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                ★
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-gray-700 text-sm leading-relaxed italic">"{testimonial.testimonial}"</p>
                                </div>

                                <div className="flex items-center">
                                    <img src={testimonial.avatar} alt={testimonial.name} className="w-10 h-10 rounded-full mr-3 object-cover" />
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-gray-800 text-sm">{testimonial.name}</h4>
                                        <p className="text-gray-600 text-xs">{testimonial.position}</p>
                                        <p className="text-teal-600 font-medium text-xs">{testimonial.company}</p>
                                    </div>
                                    <div className="text-right">{testimonial.project && <p className="text-gray-500 text-xs">{testimonial.project}</p>}</div>
                                </div>
                            </div>
                        ))}
                </div>

                <div className="text-center mt-12">
                    <div className="bg-white rounded-lg p-6 shadow-sm max-w-2xl mx-auto">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Ready to work together?</h3>
                        <p className="text-gray-600 mb-4">Join these satisfied clients and let's create something amazing!</p>
                        <button className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 transition-colors">Get Started Today</button>
                    </div>
                </div>
            </div>
        </div>
    ),
};

export default Testimonials2;
