import React, { useState, useEffect } from 'react';

const FinalizeStep = ({ resumeData, updateResumeData }) => {
    const [selectedTemplate, setSelectedTemplate] = useState('modern');
    const [isGenerating, setIsGenerating] = useState(false);
    const [resumeTitle, setResumeTitle] = useState(resumeData.title || 'My Resume');

    // Template options
    const templates = [
        {
            id: 'modern',
            name: 'Modern',
            description: 'Clean and contemporary design',
            preview: '/api/placeholder/200/280',
        },
        {
            id: 'professional',
            name: 'Professional',
            description: 'Traditional business format',
            preview: '/api/placeholder/200/280',
        },
        {
            id: 'creative',
            name: 'Creative',
            description: 'Artistic and eye-catching',
            preview: '/api/placeholder/200/280',
        },
        {
            id: 'minimal',
            name: 'Minimal',
            description: 'Simple and elegant',
            preview: '/api/placeholder/200/280',
        },
    ];

    const handleSave = () => {
        updateResumeData({
            title: resumeTitle,
            template: selectedTemplate,
        });

        // Mark step as completed
        const completedSteps = [...(resumeData.completedSteps || [])];
        if (!completedSteps.includes(5)) {
            completedSteps.push(5);
            updateResumeData({
                title: resumeTitle,
                template: selectedTemplate,
                completedSteps,
            });
        }
    };

    // Auto-save on change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSave();
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [resumeTitle, selectedTemplate]);

    const calculateCompleteness = () => {
        let score = 0;
        let total = 0;

        // Personal Info (20 points)
        const personalFields = ['firstname', 'lastname', 'email', 'phone', 'occupation'];
        personalFields.forEach((field) => {
            total += 4;
            if (resumeData[field]?.trim()) score += 4;
        });

        // Work Experience (30 points)
        total += 30;
        const validEmployments = (resumeData.employments || []).filter((emp) => emp.jobTitle?.trim() && emp.employer?.trim());
        score += Math.min(30, validEmployments.length * 15);

        // Skills (25 points)
        total += 25;
        const validSkills = (resumeData.skills || []).filter((skill) => skill.skillName?.trim());
        score += Math.min(25, validSkills.length * 5);

        // Summary (25 points)
        total += 25;
        if (resumeData.summary?.trim()) {
            if (resumeData.summary.length >= 200) score += 25;
            else if (resumeData.summary.length >= 100) score += 15;
            else if (resumeData.summary.length >= 50) score += 10;
        }

        return { score, total, percentage: Math.round((score / total) * 100) };
    };

    const completeness = calculateCompleteness();

    const handleDownload = async (format) => {
        setIsGenerating(true);
        try {
            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 2000));
            console.log(`Downloading resume as ${format}`);
            // Here you would typically call your API to generate and download the resume
        } catch (error) {
            console.error('Download failed:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const getCompletenessColor = (percentage) => {
        if (percentage >= 80) return 'text-green-600';
        if (percentage >= 60) return 'text-blue-600';
        if (percentage >= 40) return 'text-orange-600';
        return 'text-red-600';
    };

    const getCompletenessMessage = (percentage) => {
        if (percentage >= 80) return 'Excellent! Your resume is ready.';
        if (percentage >= 60) return 'Good progress! Consider adding more details.';
        if (percentage >= 40) return 'Getting there! Add more information.';
        return 'Needs improvement. Please complete more sections.';
    };

    return (
        <div className="px-4 py-6 max-w-6xl mx-auto w-full min-h-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Review and finalize your resume</h1>
                <p className="text-gray-600 text-base">Choose a template, review your information, and download your professional resume.</p>
            </div>

            <div className="space-y-5 max-w-4xl">
                {/* Resume Title */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <label htmlFor="title" className="block text-xs font-bold text-gray-900 mb-1 uppercase tracking-wide">
                        RESUME TITLE
                    </label>
                    <input
                        type="text"
                        id="title"
                        value={resumeTitle}
                        onChange={(e) => setResumeTitle(e.target.value)}
                        className="w-full px-3 py-4 outline-none border-1 border-gray-300 rounded-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm text-gray-700"
                        placeholder="e.g., John Doe - Software Engineer"
                    />
                </div>

                {/* Completeness Score */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume Completeness</h3>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Overall Score</span>
                        <span className={`text-lg font-bold ${getCompletenessColor(completeness.percentage)}`}>{completeness.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                        <div
                            className={`h-3 rounded-full transition-all duration-500 ${
                                completeness.percentage >= 80 ? 'bg-green-500' : completeness.percentage >= 60 ? 'bg-blue-500' : completeness.percentage >= 40 ? 'bg-orange-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${completeness.percentage}%` }}></div>
                    </div>
                    <p className={`text-sm ${getCompletenessColor(completeness.percentage)}`}>{getCompletenessMessage(completeness.percentage)}</p>

                    {/* Detailed Breakdown */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Personal Info</div>
                            <div className="text-gray-600">{resumeData.firstname && resumeData.lastname && resumeData.email && resumeData.phone ? '✓' : '○'}</div>
                        </div>
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Work Experience</div>
                            <div className="text-gray-600">{(resumeData.employments || []).filter((emp) => emp.jobTitle?.trim()).length > 0 ? '✓' : '○'}</div>
                        </div>
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Skills</div>
                            <div className="text-gray-600">{(resumeData.skills || []).filter((skill) => skill.skillName?.trim()).length >= 3 ? '✓' : '○'}</div>
                        </div>
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Summary</div>
                            <div className="text-gray-600">{resumeData.summary?.trim().length >= 100 ? '✓' : '○'}</div>
                        </div>
                    </div>
                </div>

                {/* Template Selection */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose Template</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                onClick={() => setSelectedTemplate(template.id)}
                                className={`cursor-pointer border-2 rounded-lg p-3 transition-all ${
                                    selectedTemplate === template.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                }`}>
                                <div className="aspect-[3/4] bg-gray-100 rounded mb-2 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                    </svg>
                                </div>
                                <h4 className="font-medium text-gray-900 text-sm">{template.name}</h4>
                                <p className="text-xs text-gray-600">{template.description}</p>
                                {selectedTemplate === template.id && (
                                    <div className="mt-2 flex items-center text-blue-600 text-xs">
                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Selected
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preview Section */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume Preview</h3>
                    <div className="bg-gray-50 rounded-lg p-6 min-h-[400px]">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 mb-1">
                                {resumeData.firstname} {resumeData.lastname}
                            </h2>
                            <p className="text-gray-600 mb-2">{resumeData.occupation}</p>
                            <p className="text-sm text-gray-500">
                                {resumeData.email} • {resumeData.phone}
                            </p>
                            {resumeData.city && resumeData.country && (
                                <p className="text-sm text-gray-500">
                                    {resumeData.city}, {resumeData.country}
                                </p>
                            )}
                        </div>

                        <div className="mt-6 text-center text-gray-500">
                            <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                            </svg>
                            <p>Full preview will be generated when you download</p>
                        </div>
                    </div>
                </div>

                {/* Download Options */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Download Your Resume</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => handleDownload('pdf')}
                            disabled={isGenerating || completeness.percentage < 40}
                            className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <div className="text-left">
                                <div className="font-medium">PDF</div>
                                <div className="text-sm text-gray-500">Best for applications</div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleDownload('docx')}
                            disabled={isGenerating || completeness.percentage < 40}
                            className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg className="w-6 h-6 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <div className="text-left">
                                <div className="font-medium">Word</div>
                                <div className="text-sm text-gray-500">Easy to edit</div>
                            </div>
                        </button>

                        <button
                            onClick={() => handleDownload('txt')}
                            disabled={isGenerating || completeness.percentage < 40}
                            className="flex items-center justify-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg className="w-6 h-6 text-gray-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                            <div className="text-left">
                                <div className="font-medium">Text</div>
                                <div className="text-sm text-gray-500">Plain format</div>
                            </div>
                        </button>
                    </div>

                    {isGenerating && (
                        <div className="mt-4 flex items-center justify-center p-4 bg-blue-50 rounded-lg">
                            <svg className="animate-spin w-5 h-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-blue-700">Generating your resume...</span>
                        </div>
                    )}

                    {completeness.percentage < 40 && (
                        <div className="mt-4 p-4 bg-orange-50 rounded-lg">
                            <p className="text-orange-700 text-sm">⚠️ Complete more sections to enable download (minimum 40% required)</p>
                        </div>
                    )}
                </div>

                {/* Additional Actions */}
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Actions</h3>
                    <div className="flex flex-wrap gap-4">
                        <button className="flex items-center px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                                />
                            </svg>
                            Share Resume
                        </button>
                        <button className="flex items-center px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Save to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinalizeStep;
