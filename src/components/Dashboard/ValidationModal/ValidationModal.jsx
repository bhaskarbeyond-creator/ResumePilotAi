import React, { useState, useEffect } from 'react';
import { FaCheck, FaExclamationTriangle, FaTimes, FaSpinner, FaArrowRight, FaArrowLeft } from 'react-icons/fa';

const ValidationModal = ({ onClose, resumeData }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [validationResults, setValidationResults] = useState({
        requiredFields: {
            status: 'pending', // 'pending', 'validating', 'success', 'error'
            missingFields: [],
        },
        contentQuality: {
            status: 'pending',
            issues: {
                professionalSummary: [],
                employmentHistory: [],
                education: []
            }
        }
    });
    const [isProcessing, setIsProcessing] = useState(false);

    // Define required fields to validate
    const requiredFields = [
        { name: 'firstName', label: 'First Name' },
        { name: 'lastName', label: 'Last Name' },
        { name: 'email', label: 'Email' },
        { name: 'phone', label: 'Phone' },
        { name: 'occupation', label: 'Occupation' },
        { name: 'country', label: 'Country' },
        { name: 'city', label: 'City' },
        { name: 'address', label: 'Address' },
        { name: 'professionalSummary', label: 'Professional Summary' },
        { name: 'employmentHistory', label: 'Employment History' },
        { name: 'education', label: 'Education' },
        { name: 'languages', label: 'Languages' },
        { name: 'skills', label: 'Skills' }
    ];

    // Steps for the validation modal
    const steps = [
        {
            title: 'Required Fields',
            description: 'Checking that all required fields are filled',
        },
        {
            title: 'Content Quality',
            description: 'Analyzing your resume content for professional quality',
        },
        {
            title: 'Results',
            description: 'Review validation results and recommendations',
        }
    ];

    // Validate required fields
    const validateRequiredFields = () => {
        setValidationResults(prev => ({
            ...prev,
            requiredFields: {
                ...prev.requiredFields,
                status: 'validating'
            }
        }));
        
        // Mock data validation - replace with actual data validation logic
        setIsProcessing(true);
        
        setTimeout(() => {
            // This would be replaced with actual validation logic using resumeData
            const missing = requiredFields
                .filter(field => {
                    // Simple check to simulate missing fields (random for demo)
                    return Math.random() > 0.7;
                })
                .map(field => field.label);
            
            setValidationResults(prev => ({
                ...prev,
                requiredFields: {
                    status: missing.length === 0 ? 'success' : 'error',
                    missingFields: missing
                }
            }));
            setIsProcessing(false);
        }, 1500);
    };

    // Validate content quality
    const validateContentQuality = () => {
        setValidationResults(prev => ({
            ...prev,
            contentQuality: {
                ...prev.contentQuality,
                status: 'validating'
            }
        }));
        
        setIsProcessing(true);
        
        // Mock content quality validation - replace with actual AI validation
        setTimeout(() => {
            const mockIssues = {
                professionalSummary: [
                    'Consider adding more specific achievements',
                    'Avoid generic phrases like "team player"'
                ],
                employmentHistory: [
                    'Use more action verbs in your descriptions',
                    'Include quantifiable results where possible'
                ],
                education: [
                    'Add relevant coursework to strengthen your profile'
                ]
            };
            
            setValidationResults(prev => ({
                ...prev,
                contentQuality: {
                    status: 'success',
                    issues: mockIssues
                }
            }));
            setIsProcessing(false);
        }, 2000);
    };

    // Handle next step
    const handleNext = () => {
        if (currentStep === steps.length - 1) return;
        setCurrentStep(currentStep + 1);
    };

    // Handle previous step
    const handlePrevious = () => {
        if (currentStep === 0) return;
        setCurrentStep(currentStep - 1);
    };

    // Start validation based on current step
    useEffect(() => {
        if (currentStep === 0 && validationResults.requiredFields.status === 'pending') {
            validateRequiredFields();
        } else if (currentStep === 1 && validationResults.contentQuality.status === 'pending') {
            validateContentQuality();
        }
    }, [currentStep]);

    // Status indicator component
    const StatusIndicator = ({ status }) => {
        if (status === 'validating') {
            return <FaSpinner className="animate-spin text-[#4a6cf7]" />;
        } else if (status === 'success') {
            return <FaCheck className="text-green-500" />;
        } else if (status === 'error') {
            return <FaExclamationTriangle className="text-orange-500" />;
        }
        return null;
    };

    return (
        <div className="fixed z-50 inset-0 bg-black/50 flex items-center justify-center overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-8 relative">
                {/* Close button */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
                >
                    <FaTimes className="text-xl" />
                </button>
                
                {/* Header */}
                <div className="bg-[#4a6cf7] text-white p-6 rounded-t-lg">
                    <h2 className="text-2xl font-bold">AI Resume Validation</h2>
                    <p className="opacity-90 mt-1">
                        Let AI review your resume and provide professional improvement suggestions
                    </p>
                </div>
                
                {/* Progress steps */}
                <div className="flex justify-between px-8 pt-6">
                    {steps.map((step, index) => (
                        <div 
                            key={index} 
                            className={`flex flex-col items-center relative ${
                                index < currentStep ? 'text-[#4a6cf7]' : 
                                index === currentStep ? 'text-[#4a6cf7]' : 'text-gray-400'
                            }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                                index < currentStep ? 'bg-[#4a6cf7] text-white border-[#4a6cf7]' : 
                                index === currentStep ? 'border-[#4a6cf7] text-[#4a6cf7]' : 'border-gray-300'
                            }`}>
                                {index < currentStep ? (
                                    <FaCheck className="text-xs" />
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </div>
                            <div className="mt-2 text-sm font-medium">{step.title}</div>
                            
                            {/* Connector line */}
                            {index < steps.length - 1 && (
                                <div className={`absolute top-4 w-full h-0.5 left-1/2 ${
                                    index < currentStep ? 'bg-[#4a6cf7]' : 'bg-gray-300'
                                }`} style={{ width: 'calc(100% - 2rem)' }}></div>
                            )}
                        </div>
                    ))}
                </div>
                
                {/* Content */}
                <div className="p-8 min-h-[300px]">
                    {/* Step 1: Required Fields */}
                    {currentStep === 0 && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center">
                                Required Fields Validation
                                <span className="ml-2">
                                    <StatusIndicator status={validationResults.requiredFields.status} />
                                </span>
                            </h3>
                            
                            {isProcessing ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <FaSpinner className="animate-spin text-3xl text-[#4a6cf7] mb-4" />
                                    <p>Checking required fields...</p>
                                </div>
                            ) : (
                                <>
                                    {validationResults.requiredFields.status === 'success' ? (
                                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
                                            <FaCheck className="text-green-500 mt-1 mr-3 flex-shrink-0" />
                                            <div>
                                                <p className="font-medium text-green-800">All required fields are complete!</p>
                                                <p className="text-green-700 mt-1">Your resume has all the essential information needed.</p>
                                            </div>
                                        </div>
                                    ) : validationResults.requiredFields.status === 'error' ? (
                                        <div>
                                            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start mb-4">
                                                <FaExclamationTriangle className="text-orange-500 mt-1 mr-3 flex-shrink-0" />
                                                <div>
                                                    <p className="font-medium text-orange-800">Some required fields are missing</p>
                                                    <p className="text-orange-700 mt-1">Please complete these fields to improve your resume.</p>
                                                </div>
                                            </div>
                                            
                                            <h4 className="font-medium mb-2">Missing fields:</h4>
                                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                                                {validationResults.requiredFields.missingFields.map((field, idx) => (
                                                    <li key={idx}>{field}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Step 2: Content Quality */}
                    {currentStep === 1 && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4 flex items-center">
                                Content Quality Analysis
                                <span className="ml-2">
                                    <StatusIndicator status={validationResults.contentQuality.status} />
                                </span>
                            </h3>
                            
                            {isProcessing ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <FaSpinner className="animate-spin text-3xl text-[#4a6cf7] mb-4" />
                                    <p>Analyzing your resume content...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Professional Summary Analysis */}
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <h4 className="font-medium text-blue-800 mb-2">Professional Summary</h4>
                                        {validationResults.contentQuality.issues.professionalSummary.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                                                {validationResults.contentQuality.issues.professionalSummary.map((issue, idx) => (
                                                    <li key={idx}>{issue}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-green-700">Your professional summary looks great!</p>
                                        )}
                                    </div>
                                    
                                    {/* Employment History Analysis */}
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <h4 className="font-medium text-blue-800 mb-2">Employment History</h4>
                                        {validationResults.contentQuality.issues.employmentHistory.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                                                {validationResults.contentQuality.issues.employmentHistory.map((issue, idx) => (
                                                    <li key={idx}>{issue}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-green-700">Your employment history is well structured!</p>
                                        )}
                                    </div>
                                    
                                    {/* Education Analysis */}
                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <h4 className="font-medium text-blue-800 mb-2">Education</h4>
                                        {validationResults.contentQuality.issues.education.length > 0 ? (
                                            <ul className="list-disc list-inside space-y-1 text-gray-700">
                                                {validationResults.contentQuality.issues.education.map((issue, idx) => (
                                                    <li key={idx}>{issue}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-green-700">Your education section is complete!</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Step 3: Results Summary */}
                    {currentStep === 2 && (
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Validation Results</h3>
                            
                            <div className="space-y-6">
                                {/* Required Fields Summary */}
                                <div className="p-4 border rounded-lg">
                                    <div className="flex items-center mb-2">
                                        <h4 className="font-medium">Required Fields</h4>
                                        <span className="ml-2">
                                            {validationResults.requiredFields.status === 'success' ? (
                                                <FaCheck className="text-green-500" />
                                            ) : (
                                                <FaExclamationTriangle className="text-orange-500" />
                                            )}
                                        </span>
                                    </div>
                                    
                                    {validationResults.requiredFields.status === 'success' ? (
                                        <p className="text-green-700">All required fields are complete.</p>
                                    ) : (
                                        <p className="text-orange-700">
                                            {validationResults.requiredFields.missingFields.length} missing field(s).
                                        </p>
                                    )}
                                </div>
                                
                                {/* Content Quality Summary */}
                                <div className="p-4 border rounded-lg">
                                    <div className="flex items-center mb-2">
                                        <h4 className="font-medium">Content Quality</h4>
                                        <span className="ml-2">
                                            <FaCheck className="text-green-500" />
                                        </span>
                                    </div>
                                    
                                    <p className="text-gray-700">
                                        {Object.values(validationResults.contentQuality.issues).flat().length} 
                                        {' '}improvement suggestion(s) provided.
                                    </p>
                                </div>
                                
                                {/* Overall Assessment */}
                                <div className="p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-lg">
                                    <h4 className="text-xl font-bold mb-3">AI Resume Score</h4>
                                    <div className="flex items-center justify-between">
                                        <div className="text-3xl font-bold">
                                            {validationResults.requiredFields.status === 'success' ? '85%' : '70%'}
                                        </div>
                                        <p className="text-white opacity-90">
                                            {validationResults.requiredFields.status === 'success' 
                                                ? 'Your resume is very strong!' 
                                                : 'Complete missing fields to improve your score'}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Action Plan */}
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <h4 className="font-medium text-green-800 mb-2">Next Steps</h4>
                                    <ol className="list-decimal list-inside space-y-1 text-gray-700">
                                        {validationResults.requiredFields.status !== 'success' && (
                                            <li>Complete all missing required fields</li>
                                        )}
                                        <li>Apply the content quality suggestions to strengthen your resume</li>
                                        <li>Download your improved resume in PDF format</li>
                                        <li>Consider using our AI Assistant for more personalized help</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Footer with navigation */}
                <div className="p-6 border-t flex justify-between">
                    <button 
                        onClick={handlePrevious}
                        disabled={currentStep === 0 || isProcessing}
                        className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                            currentStep === 0 || isProcessing
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <FaArrowLeft className="mr-2" /> Previous
                    </button>
                    
                    {currentStep === steps.length - 1 ? (
                        <button 
                            onClick={onClose}
                            className="bg-[#4a6cf7] text-white px-6 py-2 rounded-lg hover:bg-[#3a5ce6] transition-colors"
                        >
                            Close
                        </button>
                    ) : (
                        <button 
                            onClick={handleNext}
                            disabled={isProcessing || 
                                     (currentStep === 0 && validationResults.requiredFields.status !== 'success' && 
                                      validationResults.requiredFields.status !== 'error')}
                            className={`flex items-center px-6 py-2 rounded-lg transition-colors ${
                                isProcessing || 
                                (currentStep === 0 && validationResults.requiredFields.status !== 'success' && 
                                 validationResults.requiredFields.status !== 'error')
                                    ? 'bg-blue-300 cursor-not-allowed'
                                    : 'bg-[#4a6cf7] hover:bg-[#3a5ce6] text-white'
                            }`}
                        >
                            Next <FaArrowRight className="ml-2" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ValidationModal;
