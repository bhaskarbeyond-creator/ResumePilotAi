import React from 'react';

const Testimonials1 = {
    render: ({ title, subtitle, testimonials }) => (
        <div className="py-16 px-4 bg-pink-50">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">{title}</h2>
                    {subtitle && <p className="text-lg text-gray-600">{subtitle}</p>}
                </div>

                <div className="space-y-8">
                    {testimonials &&
                        testimonials.map((testimonial, index) => (
                            <div key={index} className="bg-white rounded-lg shadow-md p-8 relative">
                                <div className="absolute -top-6 left-8">
                                    <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center">
                                        <span className="text-white text-xl">"</span>
                                    </div>
                                </div>

                                <div className="pt-6">
                                    <div className="flex mb-4">
                                        {[...Array(5)].map((_, i) => (
                                            <span key={i} className={`text-xl ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                ★
                                            </span>
                                        ))}
                                    </div>

                                    <p className="text-gray-700 text-lg leading-relaxed mb-6 italic">"{testimonial.testimonial}"</p>

                                    <div className="flex items-center">
                                        <img src={testimonial.avatar} alt={testimonial.name} className="w-12 h-12 rounded-full mr-4 object-cover" />
                                        <div>
                                            <h4 className="font-semibold text-gray-800">{testimonial.name}</h4>
                                            <p className="text-gray-600">{testimonial.position}</p>
                                            <p className="text-pink-600 font-medium">{testimonial.company}</p>
                                            {testimonial.project && <p className="text-gray-500 text-sm">Project: {testimonial.project}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>

                {testimonials && testimonials.length > 3 && (
                    <div className="text-center mt-8">
                        <div className="flex justify-center space-x-2">
                            {testimonials.map((_, index) => (
                                <div key={index} className="w-2 h-2 bg-pink-300 rounded-full"></div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    ),
};

export default Testimonials1;
