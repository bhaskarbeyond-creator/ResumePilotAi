import React, { useState } from 'react';

const TemplateModal = ({ isOpen, onClose, onSelect, templates, currentTemplate, category }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-2xl font-bold text-gray-800">Choose {category} Template</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
                        ×
                    </button>
                </div>

                {/* Template Grid */}
                <div className="p-6">
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all hover:shadow-lg ${
                                    currentTemplate === template.id ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => {
                                    onSelect(template.id);
                                    onClose();
                                }}>
                                {/* Template Preview */}
                                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                                    <img src={template.preview} alt={template.name} className="w-full h-full object-cover" />
                                    {currentTemplate === template.id && (
                                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">✓</div>
                                    )}
                                </div>

                                {/* Template Info */}
                                <div className="p-4">
                                    <h3 className="font-semibold text-gray-800 mb-1">{template.name}</h3>
                                    <p className="text-sm text-gray-600">{template.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-gray-50 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const TemplateSelector = ({ value, onChange, templates, category }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const currentTemplate = templates.find((t) => t.id === value);

    return (
        <>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">🎨 {category} Template</label>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full p-3 border border-gray-300 rounded-lg hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-left">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-medium text-gray-800">{currentTemplate?.name || 'Select Template'}</div>
                            <div className="text-sm text-gray-600">{currentTemplate?.description}</div>
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </button>
            </div>

            <TemplateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSelect={onChange} templates={templates} currentTemplate={value} category={category} />
        </>
    );
};

export { TemplateModal, TemplateSelector };
