import React, { useEffect, useState, useRef } from 'react';
import { FaBrain, FaRegFileAlt, FaGraduationCap, FaTools, FaBriefcase } from 'react-icons/fa';
import { BsCheckCircleFill, BsArrowLeft, BsArrowRight, BsX, BsStars, BsInfoCircle, BsLightning } from 'react-icons/bs';
import { motion, AnimatePresence } from 'framer-motion';
import { useLottie } from 'lottie-react';
import { useTranslation } from 'react-i18next';
import aiGeneratingAnimation from '../../../assets/animations/Ai-Generating.json';
import EmploymentModel from '../../../models/Employment';
import EducationModel from '../../../models/Education';
import LanguageModel from '../../../models/Language';
import SkillModel from '../../../models/Skills';
import { generateUserAiContent } from '../../../services/aiService';

// AI resume data generator using Backend API & Universal aiService
const generateAIResumeData = async (occupation, experienceLevel, skills = [], education = [], language = 'en', options = {}) => {
    try {
        const resumeData = await generateUserAiContent('generate-resume', {
            occupation,
            jobTitle: occupation,
            experienceLevel,
            skills,
            education,
            language,
        }, options);

        console.log('Successfully received AI-generated resume data');
        return resumeData;
    } catch (error) {
        console.error('Error generating AI content:', error);
        throw error;
    }
};

// Compact Lottie Animation component
const LottieAnimation = () => {
    const options = {
        animationData: aiGeneratingAnimation,
        loop: true,
        autoplay: true,
        rendererSettings: {
            preserveAspectRatio: 'xMidYMid slice',
        },
    };

    const { View } = useLottie(options);

    return <div className="w-24 h-24 mx-auto">{View}</div>;
};

const AIGenerationModal = ({ closeModal, currentStep, handleStep, t, handleInputs, goThirdStep, setAIGeneratedContent, existingData = {} }) => {
    const { i18n } = useTranslation();
    console.log(existingData);
    // Initialize experience level based on existingData or default to mid-level
    const determineExperienceLevel = () => {
        if (!existingData.employments || existingData.employments.length === 0) {
            return 'mid-level';
        }

        const totalYears = existingData.employments.reduce((total, emp) => {
            if (emp.begin && emp.end && emp.end !== 'Present') {
                return total + (parseInt(emp.end) - parseInt(emp.begin));
            } else if (emp.begin && emp.end === 'Present') {
                return total + (new Date().getFullYear() - parseInt(emp.begin));
            }
            return total;
        }, 0);

        if (totalYears >= 6) return 'senior-level';
        if (totalYears >= 3) return 'mid-level';
        return 'entry-level';
    };

    // Form state for the AI generation
    const [formData, setFormData] = React.useState({
        occupation: existingData.occupation || '',
        experienceLevel: determineExperienceLevel(),
    });

    // State for tag-based inputs
    const [skillsList, setSkillsList] = useState(existingData.skills?.map((skill) => skill.name) || []);
    const [educationList, setEducationList] = useState(existingData.educations?.map((edu) => edu.school) || []);
    const [currentSkill, setCurrentSkill] = useState('');
    const [currentEducation, setCurrentEducation] = useState('');

    // State for the generated AI data
    const [generatedData, setGeneratedData] = useState(null);

    // State for form validation
    const [formErrors, setFormErrors] = useState({});

    // Refs for input fields
    const skillInputRef = useRef(null);
    const educationInputRef = useRef(null);
    const occupationInputRef = useRef(null);

    // Animation state for generation step
    const [generationProgress, setGenerationProgress] = React.useState(0);
    const [generationError, setGenerationError] = React.useState(null);
    const generationInProgressRef = useRef(false);
    const requestControllerRef = useRef(null);

    // Transition variants for animations
    const slideVariants = {
        hidden: { opacity: 0, x: 20 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
        exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: 'easeIn' } },
    };

    useEffect(() => {
        if (currentStep === 2 && occupationInputRef.current) {
            occupationInputRef.current.focus();
        }
    }, [currentStep]);

    useEffect(() => {
        if (currentStep === 3) {
            let interval;
            if (generationProgress < 90) {
                interval = setInterval(() => {
                    setGenerationProgress((prev) => {
                        return Math.min(90, prev + 5);
                    });
                }, 300);
            }

            if (generationProgress >= 25 && !generatedData && !generationError && !generationInProgressRef.current) {
                generateAIData();
            }

            return () => {
                if (interval) clearInterval(interval);
            };
        }
    }, [currentStep, generationProgress, generatedData, generationError]);

    // Function to generate AI data using the backend API
    const generateAIData = async () => {
        if (generationInProgressRef.current) return;
        generationInProgressRef.current = true;
        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;

        try {
            // Get current language from preferredLanguage in localStorage or i18n
            const currentLanguage = localStorage.getItem('preferredLanguage') || i18n.language || 'en';
            const aiData = await generateAIResumeData(formData.occupation, formData.experienceLevel, skillsList, educationList, currentLanguage, { signal: requestController.signal });

            const validatedData = {
                ...aiData,
                skills: Array.isArray(aiData.skills) ? aiData.skills : [],
                languages: Array.isArray(aiData.languages) ? aiData.languages : [],
                employments: Array.isArray(aiData.employments) ? aiData.employments : [],
                educations: Array.isArray(aiData.educations) ? aiData.educations : [],
            };

            setGeneratedData(validatedData);
            setGenerationProgress(100);
            console.log('Resume generation completed successfully');
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('Failed to generate AI data:', error);
                setGenerationError('There was an error generating your resume content. Please try again later.');
                setGenerationProgress((prev) => Math.max(prev, 95));
            }
        } finally {
            if (requestControllerRef.current === requestController) {
                requestControllerRef.current = null;
                generationInProgressRef.current = false;
            }
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });

        if (formErrors[name]) {
            setFormErrors({
                ...formErrors,
                [name]: null,
            });
        }
    };

    // Handle tag input changes
    const handleSkillChange = (e) => {
        setCurrentSkill(e.target.value);
    };

    const handleEducationChange = (e) => {
        setCurrentEducation(e.target.value);
    };

    // Add tag when Enter is pressed
    const handleSkillKeyDown = (e) => {
        if (e.key === 'Enter' && currentSkill.trim()) {
            e.preventDefault();
            if (!skillsList.includes(currentSkill.trim())) {
                setSkillsList([...skillsList, currentSkill.trim()]);
                setCurrentSkill('');
            }
        }
    };

    const handleEducationKeyDown = (e) => {
        if (e.key === 'Enter' && currentEducation.trim()) {
            e.preventDefault();
            if (!educationList.includes(currentEducation.trim())) {
                setEducationList([...educationList, currentEducation.trim()]);
                setCurrentEducation('');
            }
        }
    };

    // Remove tag when clicked
    const removeSkill = (skillToRemove) => {
        setSkillsList(skillsList.filter((skill) => skill !== skillToRemove));
        skillInputRef.current.focus();
    };

    const removeEducation = (educationToRemove) => {
        setEducationList(educationList.filter((edu) => edu !== educationToRemove));
        educationInputRef.current.focus();
    };

    // Validate form before proceeding to generation
    const validateForm = () => {
        const errors = {};

        if (!formData.occupation.trim()) {
            errors.occupation = 'Occupation is required';
        }

        if (!formData.experienceLevel) {
            errors.experienceLevel = 'Experience level is required';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Handle next step with validation
    const handleNextStep = () => {
        if (currentStep === 2) {
            if (validateForm()) {
                handleStep(3);
            } else {
                if (formErrors.occupation && occupationInputRef.current) {
                    occupationInputRef.current.focus();
                }
            }
        } else {
            handleStep(currentStep + 1);
        }
    };

    // Apply generated data to parent component
    const applyGeneratedData = () => {
        if (generatedData) {
            console.log('=== AI GENERATION: Starting to apply generated data ===');
            console.log('Generated data received:', generatedData);

            if (generatedData._source === 'fallback') {
                console.warn('WARNING: Using fallback data instead of AI-generated data');
            } else {
                console.log('SUCCESS: Using real AI-generated data');
            }

            // Prepare the data with filled model objects
            const processedData = {};

            // Process employments
            if (generatedData.employments && Array.isArray(generatedData.employments)) {
                console.log('=== Processing employments ===');
                processedData.employments = generatedData.employments.map((employment, index) => {
                    const timestamp = Date.now() - 1000 * index;
                    const employmentId = employment.id || Math.floor(Math.random() * 1000000);

                    const jobTitle = employment.jobTitle || employment.title || employment.position || '';
                    const employer = employment.employer || employment.company || '';
                    const begin = employment.begin || employment.startDate || employment.started || '';
                    const end = employment.end || employment.endDate || employment.finished || 'Present';
                    const description = employment.description || '';
                    // Ensure description is a string before calling trim
                    const descriptionStr = typeof description === 'string' ? description : String(description || '');
                    // Format description for Lexical editor (wrap plain text in paragraph tags)
                    const formattedDescription = descriptionStr.trim() ? `<p class="editor-paragraph">${descriptionStr}</p>` : '';

                    console.log(`Employment description processing:`, {
                        original: description,
                        type: typeof description,
                        stringified: descriptionStr,
                        formatted: formattedDescription,
                    });

                    const employmentModel = new EmploymentModel(employmentId, jobTitle, employer, begin, end, formattedDescription);
                    employmentModel.date = timestamp;

                    console.log(`Created filled employment:`, employmentModel);
                    return employmentModel;
                });
            }

            // Process educations
            if (generatedData.educations && Array.isArray(generatedData.educations)) {
                console.log('=== Processing educations ===');
                processedData.educations = generatedData.educations.map((education, index) => {
                    const timestamp = Date.now() - 1000 * index;
                    const educationId = education.id || Math.floor(Math.random() * 1000000);

                    const school = education.school || '';
                    const degree = education.degree || '';
                    const started = education.started || education.begin || '';
                    const finished = education.finished || education.end || '';
                    const description = education.description || '';
                    // Ensure description is a string before calling trim
                    const descriptionStr = typeof description === 'string' ? description : String(description || '');
                    // Format description for Lexical editor (wrap plain text in paragraph tags)
                    const formattedDescription = descriptionStr.trim() ? `<p class="editor-paragraph">${descriptionStr}</p>` : '';

                    console.log(`Education description processing:`, {
                        original: description,
                        type: typeof description,
                        stringified: descriptionStr,
                        formatted: formattedDescription,
                    });

                    const educationModel = new EducationModel(educationId, school, degree, started, finished, formattedDescription);
                    educationModel.date = timestamp;

                    console.log(`Created filled education:`, educationModel);
                    return educationModel;
                });
            }

            // Process languages
            if (generatedData.languages && Array.isArray(generatedData.languages)) {
                console.log('=== Processing languages ===');
                processedData.languages = generatedData.languages.map((language, index) => {
                    const timestamp = Date.now() - 1000 * index;
                    const languageId = language.id || Math.floor(Math.random() * 1000000);

                    const languageModel = new LanguageModel(languageId, language.name || '', language.level || '');
                    languageModel.date = timestamp;

                    console.log(`Created filled language:`, languageModel);
                    return languageModel;
                });
            }

            // Process skills
            if (generatedData.skills && Array.isArray(generatedData.skills)) {
                console.log('=== Processing skills ===');
                processedData.skills = generatedData.skills.map((skill, index) => {
                    const timestamp = Date.now() - 1000 * index;
                    const skillId = skill.id || Math.floor(Math.random() * 1000000);

                    const skillModel = new SkillModel(skillId, skill.name || '', skill.rating || 3);
                    skillModel.date = timestamp;

                    console.log(`Created filled skill:`, skillModel);
                    return skillModel;
                });
            }

            // Add simple fields with special handling for summary
            Object.keys(generatedData).forEach((key) => {
                if (!['employments', 'educations', 'languages', 'skills', '_source'].includes(key)) {
                    if (key === 'summary' && generatedData[key]) {
                        // Format summary for Lexical editor (wrap plain text in paragraph tags)
                        const summaryStr = typeof generatedData[key] === 'string' ? generatedData[key] : String(generatedData[key] || '');
                        const formattedSummary = summaryStr.trim() ? `<p class="editor-paragraph">${summaryStr}</p>` : '';

                        console.log(`Summary processing:`, {
                            original: generatedData[key],
                            type: typeof generatedData[key],
                            stringified: summaryStr,
                            formatted: formattedSummary,
                        });

                        processedData[key] = formattedSummary;
                    } else {
                        processedData[key] = generatedData[key];
                    }
                }
            });

            console.log('=== Calling applyAIGeneratedData with filled models ===');
            console.log('Processed data:', processedData);

            // Call the new method that applies filled models directly
            handleInputs('AI_GENERATED_DATA', processedData);

            console.log('=== AI GENERATION: Completed applying all generated data ===');

            if (typeof goThirdStep === 'function') {
                console.log('Calling goThirdStep to navigate to data filling step');
                goThirdStep();
            }
            closeModal();
        }
    };

    // Render different content based on the current step
    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <motion.div className="flex flex-col items-center text-center space-y-6 px-6 py-4" initial="hidden" animate="visible" exit="exit" variants={slideVariants}>
                        {/* Header */}
                        <div className="relative flex flex-col items-center space-y-3">
                            <div className="relative">
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FaBrain className="text-2xl text-white" />
                                </div>
                                <div className="absolute -top-1 -right-1">
                                    <BsStars className="text-yellow-400 text-lg animate-pulse" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">AI Resume Builder</h2>
                                <div className="w-16 h-0.5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full mx-auto"></div>
                            </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-600 leading-relaxed max-w-md">Let artificial intelligence craft professional resume content tailored to your industry and experience level.</p>

                        {/* Features Grid */}
                        <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
                            {[
                                {
                                    icon: FaRegFileAlt,
                                    text: 'Professional summary',
                                    color: 'from-blue-500 to-blue-600',
                                },
                                {
                                    icon: FaBriefcase,
                                    text: 'Work experience',
                                    color: 'from-green-500 to-green-600',
                                },
                                {
                                    icon: FaTools,
                                    text: 'Tailored skills',
                                    color: 'from-orange-500 to-orange-600',
                                },
                                {
                                    icon: FaGraduationCap,
                                    text: 'Education',
                                    color: 'from-purple-500 to-purple-600',
                                },
                            ].map((feature, index) => (
                                <div key={index} className="flex flex-col items-center space-y-2 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
                                    <div className={`w-8 h-8 bg-gradient-to-br ${feature.color} rounded-lg flex items-center justify-center shadow-sm`}>
                                        <feature.icon className="text-white text-sm" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 text-center leading-tight">{feature.text}</span>
                                </div>
                            ))}
                        </div>

                        {/* Testimonial */}
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100 max-w-md">
                            <div className="flex justify-center space-x-1 mb-2">
                                {[...Array(5)].map((_, i) => (
                                    <span key={i} className="text-yellow-400 text-sm">
                                        ★
                                    </span>
                                ))}
                            </div>
                            <p className="text-gray-700 text-xs italic mb-2 leading-relaxed">"Saved me hours of work and created better content than I could have written myself!"</p>
                            <div className="text-xs font-semibold text-gray-800">- Michael S.</div>
                        </div>

                        {/* CTA Button */}
                        <button
                            onClick={returnToDetails}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg flex items-center space-x-2 text-sm">
                            <BsLightning className="text-sm" />
                            <span>Get Started</span>
                            <BsArrowRight className="text-sm" />
                        </button>
                    </motion.div>
                );

            case 2:
                return (
                    <motion.div className="flex flex-col space-y-6 px-6 py-4 max-w-lg mx-auto" initial="hidden" animate="visible" exit="exit" variants={slideVariants}>
                        {/* Header */}
                        <div className="text-center space-y-2">
                            <h2 className="text-xl font-bold text-gray-900">Tell us about yourself</h2>
                            <p className="text-sm text-gray-600 leading-relaxed">Provide details so our AI can generate the most relevant content for your resume.</p>
                        </div>

                        {/* Form */}
                        <div className="space-y-4">
                            {/* Occupation Field */}
                            <div className="space-y-2">
                                <label htmlFor="occupation" className="flex items-center space-x-1 text-sm font-medium text-gray-700">
                                    <span>Job Title</span>
                                    <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    id="occupation"
                                    name="occupation"
                                    value={formData.occupation}
                                    onChange={handleInputChange}
                                    placeholder="e.g. Software Engineer, Marketing Manager"
                                    ref={occupationInputRef}
                                    className={`w-full px-3 py-2.5 text-sm border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 ${
                                        formErrors.occupation ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                                    }`}
                                />
                                {formErrors.occupation && (
                                    <p className="text-red-600 text-xs flex items-center space-x-1">
                                        <span>⚠</span>
                                        <span>{formErrors.occupation}</span>
                                    </p>
                                )}
                            </div>

                            {/* Experience Level Field */}
                            <div className="space-y-2">
                                <label htmlFor="experienceLevel" className="flex items-center space-x-1 text-sm font-medium text-gray-700">
                                    <span>Experience Level</span>
                                    <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="experienceLevel"
                                    name="experienceLevel"
                                    value={formData.experienceLevel}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 py-2.5 text-sm border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 ${
                                        formErrors.experienceLevel ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                                    }`}>
                                    <option value="entry-level">Entry Level (0-2 years)</option>
                                    <option value="mid-level">Mid Level (3-5 years)</option>
                                    <option value="senior-level">Senior Level (6+ years)</option>
                                </select>
                            </div>

                            {/* Skills Field */}
                            <div className="space-y-2">
                                <label htmlFor="skills" className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                                    <span>Key Skills</span>
                                    <span className="text-gray-400 text-xs">(optional)</span>
                                    <div className="relative group">
                                        <BsInfoCircle className="text-gray-400 hover:text-gray-600 cursor-help text-xs" />
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                                            Helps create targeted content
                                        </div>
                                    </div>
                                </label>
                                <div className="border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all duration-200 min-h-[42px]">
                                    {/* Tags Display */}
                                    {skillsList.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {skillsList.map((skill, index) => (
                                                <div key={index} className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs flex items-center space-x-1">
                                                    <span>{skill}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeSkill(skill)}
                                                        className="text-indigo-600 hover:text-indigo-800 focus:outline-none"
                                                        aria-label={`Remove ${skill}`}>
                                                        <BsX className="text-sm" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Input */}
                                    <input
                                        type="text"
                                        id="skills"
                                        ref={skillInputRef}
                                        value={currentSkill}
                                        onChange={handleSkillChange}
                                        onKeyDown={handleSkillKeyDown}
                                        placeholder={skillsList.length ? 'Add more...' : 'e.g. JavaScript (press Enter)'}
                                        className="w-full focus:outline-none bg-transparent text-sm"
                                    />
                                </div>
                            </div>

                            {/* Education Field */}
                            <div className="space-y-2">
                                <label htmlFor="education" className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                                    <span>Education</span>
                                    <span className="text-gray-400 text-xs">(optional)</span>
                                </label>
                                <div className="border border-gray-300 rounded-lg p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all duration-200 min-h-[42px]">
                                    {/* Tags Display */}
                                    {educationList.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {educationList.map((education, index) => (
                                                <div key={index} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs flex items-center space-x-1">
                                                    <span>{education}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeEducation(education)}
                                                        className="text-purple-600 hover:text-purple-800 focus:outline-none"
                                                        aria-label={`Remove ${education}`}>
                                                        <BsX className="text-sm" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Input */}
                                    <input
                                        type="text"
                                        id="education"
                                        ref={educationInputRef}
                                        value={currentEducation}
                                        onChange={handleEducationChange}
                                        onKeyDown={handleEducationKeyDown}
                                        placeholder={educationList.length ? 'Add more...' : 'e.g. University of California (press Enter)'}
                                        className="w-full focus:outline-none bg-transparent text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex justify-between pt-4">
                            <button
                                onClick={() => handleStep(1)}
                                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm">
                                <BsArrowLeft className="text-sm" />
                                <span>Back</span>
                            </button>
                            <button
                                onClick={handleNextStep}
                                disabled={!formData.occupation || !formData.experienceLevel}
                                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium">
                                <BsLightning className="text-sm" />
                                <span>Generate</span>
                                <BsArrowRight className="text-sm" />
                            </button>
                        </div>
                    </motion.div>
                );

            case 3:
                return (
                    <motion.div className="flex flex-col items-center space-y-6 px-6 py-4 text-center" initial="hidden" animate="visible" exit="exit" variants={slideVariants}>
                        {/* Header */}
                        <h2 className="text-xl font-bold text-gray-900">Crafting your resume</h2>

                        {/* Progress Section */}
                        <div className="w-full max-w-xs space-y-3">
                            <div className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{generationProgress}%</div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${generationProgress}%` }}></div>
                            </div>

                            <div className="text-xs text-gray-600 font-medium">{getGenerationStatus(generationProgress)}</div>
                        </div>

                        {/* Animation */}
                        <div className="py-2">
                            <LottieAnimation />
                        </div>

                        {/* Error or Success Message */}
                        {generationError ? (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-sm">
                                <div className="flex items-center justify-center space-x-2 mb-2">
                                    <BsInfoCircle className="text-red-500 text-lg" />
                                    <span className="text-red-800 font-medium text-sm">Generation Error</span>
                                </div>
                                <p className="text-red-700 mb-3 text-sm">{generationError}</p>
                                <button
                                    onClick={() => {
                                        setGenerationError(null);
                                        setGenerationProgress(25);
                                        setGeneratedData(null);
                                        generationInProgressRef.current = false;
                                    }}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm transition-colors duration-200">
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 max-w-sm">
                                <p className="text-gray-700 text-sm leading-relaxed">Our AI is analyzing successful resumes from your industry to create optimized content.</p>
                                <p className="text-xs text-gray-500">{generationProgress < 100 ? 'This will only take a moment...' : 'Generation complete! Your resume content is ready.'}</p>
                            </div>
                        )}

                        {/* Action Button */}
                        {generationProgress < 100 ? (
                            <button
                                onClick={returnToDetails}
                                disabled={generationProgress > 50 && !generationError}
                                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm">
                                <BsArrowLeft className="text-sm" />
                                <span>Back</span>
                            </button>
                        ) : (
                            <button
                                onClick={applyGeneratedData}
                                className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all duration-200 transform hover:scale-105 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-medium">
                                <span>Apply to Resume</span>
                                <BsCheckCircleFill className="text-lg" />
                            </button>
                        )}
                    </motion.div>
                );

            default:
                return null;
        }
    };

    // Helper function to get generation status message based on progress
    const getGenerationStatus = (progress) => {
        if (progress < 25) return 'Analyzing requirements...';
        if (progress < 50) return 'Creating summary...';
        if (progress < 75) return 'Generating experience...';
        if (progress < 95) return 'Adding skills...';
        return 'Finalizing content...';
    };

    const cancelGeneration = () => {
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        generationInProgressRef.current = false;
        closeModal();
    };

    const returnToDetails = () => {
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
        generationInProgressRef.current = false;
        setGenerationProgress(0);
        handleStep(2);
    };

    // Handle keyboard navigation
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') cancelGeneration();
    };

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            const controller = requestControllerRef.current;
            requestControllerRef.current = null;
            controller?.abort();
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                {/* Close Button */}
                <button
                    onClick={cancelGeneration}
                    className="absolute top-4 right-4 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 z-10"
                    aria-label="Close modal">
                    <BsX className="text-lg text-gray-600" />
                </button>

                {/* Step Indicator */}
                <div className="flex items-center justify-center py-4 bg-gray-50 border-b border-gray-200 rounded-t-xl">
                    <div className="flex items-center space-x-3">
                        {[1, 2, 3].map((step) => (
                            <React.Fragment key={step}>
                                <div
                                    className={`flex items-center justify-center w-8 h-8 rounded-full font-medium text-sm transition-all duration-300 ${
                                        currentStep >= step ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                    {step}
                                </div>
                                {step < 3 && (
                                    <div
                                        className={`w-8 h-0.5 rounded-full transition-all duration-300 ${currentStep > step ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-gray-200'}`}></div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="relative">
                    <AnimatePresence mode="wait">{renderStepContent()}</AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default AIGenerationModal;
