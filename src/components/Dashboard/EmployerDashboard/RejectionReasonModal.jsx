import React, { useState } from 'react';

const RejectionReasonModal = ({ isOpen, onClose, onSubmit, applicationData, loading = false }) => {
    const [rejectionMessage, setRejectionMessage] = useState('');
    const [charCount, setCharCount] = useState(0);
    const maxChars = 500;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (rejectionMessage.trim()) {
            onSubmit(rejectionMessage.trim());
        }
    };

    const handleMessageChange = (e) => {
        const message = e.target.value;
        if (message.length <= maxChars) {
            setRejectionMessage(message);
            setCharCount(message.length);
        }
    };

    const handleClose = () => {
        setRejectionMessage('');
        setCharCount(0);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Provide Rejection Feedback</h3>
                    <button 
                        className="p-2 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
                        onClick={handleClose}
                        disabled={loading}
                    >
                        <span className="text-xl text-slate-500">×</span>
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-sm text-slate-700 mb-1"><strong>Applicant:</strong> {applicationData?.applicantName}</p>
                        <p className="text-sm text-slate-700"><strong>Position:</strong> {applicationData?.jobTitle}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label htmlFor="rejectionMessage" className="block text-sm font-medium text-slate-700">
                                Rejection Reason <span className="text-slate-500 font-normal">(Optional but recommended)</span>
                            </label>
                            <textarea
                                id="rejectionMessage"
                                value={rejectionMessage}
                                onChange={handleMessageChange}
                                placeholder="Please provide constructive feedback to help the candidate understand why they weren't selected. This helps them improve for future applications."
                                rows="6"
                                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed resize-none"
                                disabled={loading}
                            />
                            <div className="text-xs text-slate-500 text-right">
                                {charCount}/{maxChars} characters
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        <span>Rejecting...</span>
                                    </>
                                ) : (
                                    <span>Reject Application</span>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="px-6 py-4 bg-blue-50 border-t border-slate-200">
                    <p className="text-sm text-blue-800">
                        💡 <strong>Tip:</strong> Providing specific feedback helps candidates improve and creates a positive impression of your company.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default RejectionReasonModal;
