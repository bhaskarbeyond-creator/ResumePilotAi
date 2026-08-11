// Example of how to call the resume generation API from the frontend
async function generateResumeContent(occupation, experienceLevel, skills = [], education = []) {
    try {
        // Set loading state
        setIsLoading(true);
        setGenerationProgress(25); // Show progress to user

        // Call the backend API
        const response = await fetch('/api/generate-resume', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                occupation,
                experienceLevel,
                skills,
                education,
            }),
        });

        // Update progress
        setGenerationProgress(75);

        if (!response.ok) {
            throw new Error('Failed to generate resume data');
        }

        // Parse the response
        const resumeData = await response.json();

        // Update progress to 100%
        setGenerationProgress(100);

        console.log('Successfully received AI-generated resume data');

        return resumeData;
    } catch (error) {
        console.error('Error generating resume content:', error);
        setGenerationError('There was an error generating your resume content. Please try again later.');
        return null;
    } finally {
        setIsLoading(false);
    }
}

// Example usage in a React component:
/*
import React, { useEffect, useState, useRef } from 'react';
import './AIGenerationModal.scss';
import { FaBrain, FaRegFileAlt, FaGraduationCap, FaTools, FaBriefcase } from 'react-icons/fa';
import { BsCheckCircleFill, BsArrowLeft, BsArrowRight, BsX } from 'react-icons/bs';
import EmploymentModel from '../../../models/Employment';
import EducationModel from '../../../models/Education';
import LanguageModel from '../../../models/Language';
import SkillModel from '../../../models/Skills';

const AIGenerationModal = ({ closeModal, currentStep, handleStep, t, handleInputs, goThirdStep, setAIGeneratedContent, existingData = {} }) => {
    // Initialize experience level based on existingData or default to mid-level
    const determineExperienceLevel = () => {
        if (!existingData.employments || existingData.employments.length === 0) {
            return 'mid-level';
        }

        // If there's employment history, try to determine experience level
        const totalYears = existingData.employments.reduce((total, emp) => {
            // If there's a clear end and begin date, calculate years
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
    const [formData, setFormData] = useState({
        occupation: existingData.occupation || '',
        experienceLevel: determineExperienceLevel(),
    });

    // State for tag-based inputs
    const [skillsList, setSkillsList] = useState(existingData.skills?.map((skill) => skill.name) || []);
    const [educationList, setEducationList] = useState(existingData.educations?.map((edu) => edu.school) || []);
    const [currentSkill, setCurrentSkill] = useState('');
    const [currentEducation, setCurrentEducation] = useState('');

    // State for loading and error handling
    const [isLoading, setIsLoading] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationError, setGenerationError] = useState(null);

    // Refs for input fields
    const skillInputRef = useRef(null);
    const educationInputRef = useRef(null);

    useEffect(() => {
        // Simulate progress for the generation step
        if (currentStep === 3 && generationProgress < 25) {
            // If we're on the generation step but haven't started generating
            handleResumeGeneration();
        }
    }, [currentStep]);

    // Handle resume generation
    const handleResumeGeneration = async () => {
        if (isLoading || generationProgress >= 100) return;
        
        const resumeData = await generateResumeContent(
            formData.occupation,
            formData.experienceLevel,
            skillsList,
            educationList
        );
        
        if (resumeData) {
            // Store the generated data for later use
            if (setAIGeneratedContent) {
                setAIGeneratedContent(resumeData);
            }
        }
    };

    // Apply generated data to parent component
    const applyGeneratedData = () => {
        // Get the data from your local state or props
        const generatedData = setAIGeneratedContent ? null : localStorage.getItem('aiGeneratedData'); // Just an example
        
        if (generatedData) {
            console.log('Starting to apply AI generated data:', generatedData);

            // Apply all the generated data to parent component state
            Object.keys(generatedData).forEach((key) => {
                if (key === '_source') return; // Skip the source marker
                if (key === 'employments') {
                    // Handle employments separately
                    generatedData.employments.forEach((employment, index) => {
                        // Create proper employment model instance with current timestamp to ensure proper sorting
                        const employmentId = employment.id || Math.floor(Math.random() * 1000);
                        const employmentModel = new EmploymentModel(
                            employmentId,
                            employment.jobTitle || '',
                            employment.employer || '',
                            employment.begin || '',
                            employment.end || '',
                            employment.description || ''
                        );
                        employmentModel.date = Date.now() + index; // Ensure unique timestamp for each item

                        // Add each property to state
                        handleInputs('Job Title', employmentModel.jobTitle, employmentId, 'Employment');
                        handleInputs('Employer', employmentModel.employer, employmentId, 'Employment');
                        handleInputs('Begin', employmentModel.begin, employmentId, 'Employment');
                        handleInputs('End', employmentModel.end, employmentId, 'Employment');
                        handleInputs('Description', employmentModel.description, employmentId, 'Employment');
                    });
                } else if (key === 'educations') {
                    // Handle educations separately
                    generatedData.educations.forEach((education, index) => {
                        // Create proper education model instance
                        const educationId = education.id || Math.floor(Math.random() * 1000);
                        const educationModel = new EducationModel(
                            educationId,
                            education.school || '',
                            education.degree || '',
                            education.started || '',
                            education.finished || '',
                            education.description || ''
                        );
                        educationModel.date = Date.now() + index; // Ensure unique timestamp for each item

                        // Add each property to state
                        handleInputs('School', educationModel.school, educationId, 'Education');
                        handleInputs('Degree', educationModel.degree, educationId, 'Education');
                        handleInputs('Started', educationModel.started, educationId, 'Education');
                        handleInputs('Finished', educationModel.finished, educationId, 'Education');
                        handleInputs('Course Description', educationModel.description, educationId, 'Education');
                    });
                } else if (key === 'languages') {
                    // Handle languages separately
                    generatedData.languages.forEach((language, index) => {
                        // Create proper language model instance
                        const languageId = language.id || Math.floor(Math.random() * 1000);
                        const languageModel = new LanguageModel(languageId, language.name || '', language.level || '');
                        languageModel.date = Date.now() + index; // Ensure unique timestamp for each item

                        // Add each property to state
                        handleInputs('Language', languageModel.name, languageId, 'Languages');
                        handleInputs('Level', languageModel.level, languageId, 'Languages');
                    });
                } else if (key === 'skills') {
                    // Handle skills separately
                    generatedData.skills.forEach((skill, index) => {
                        // Create proper skill model instance
                        const skillId = skill.id || Math.floor(Math.random() * 1000);
                        const skillModel = new SkillModel(skillId, skill.name || '', skill.rating || 3);
                        skillModel.date = Date.now() + index; // Ensure unique timestamp for each item

                        // Add each property to state
                        handleInputs('Skill Name', skillModel.name, skillId, 'Skills');
                        handleInputs('Rating', skillModel.rating, skillId, 'Skills');
                    });
                } else {
                    // Handle simple fields
                    handleInputs(
                        key === 'firstname' ? 'First Name' : key === 'lastname' ? 'Last Name' : key === 'summary' ? 'Professional Summary' : key.charAt(0).toUpperCase() + key.slice(1),
                        generatedData[key]
                    );
                }
            });

            console.log('Completed applying all AI generated data');

            // Move to the data filling step if goThirdStep function is provided
            if (typeof goThirdStep === 'function') {
                goThirdStep();
            }
            closeModal();
        }
    };

    // Input handlers
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value,
        });
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

    // Other UI components and return logic
    // ...
}
*/

// Function to apply the generated data to your app state
function applyGeneratedData(generatedData) {
    if (generatedData) {
        console.log('Starting to apply AI generated data:', generatedData);

        // Apply all the generated data to app state
        Object.keys(generatedData).forEach((key) => {
            if (key === '_source') return; // Skip the source marker

            if (key === 'employments') {
                // Handle employments
                generatedData.employments.forEach((employment, index) => {
                    // Create employment models and update state
                    // Create an instance of your Employment model
                    const employmentId = employment.id || Math.floor(Math.random() * 1000);
                    const employmentModel = new EmploymentModel(
                        employmentId,
                        employment.jobTitle || '',
                        employment.employer || '',
                        employment.begin || '',
                        employment.end || '',
                        employment.description || ''
                    );

                    // Add to your state management (Redux store, React Context, etc.)
                    addEmployment(employmentModel);
                });
            } else if (key === 'educations') {
                // Handle educations
                generatedData.educations.forEach((education, index) => {
                    const educationId = education.id || Math.floor(Math.random() * 1000);
                    const educationModel = new EducationModel(
                        educationId,
                        education.school || '',
                        education.degree || '',
                        education.started || '',
                        education.finished || '',
                        education.description || ''
                    );

                    addEducation(educationModel);
                });
            } else if (key === 'languages') {
                // Handle languages
                generatedData.languages.forEach((language, index) => {
                    const languageId = language.id || Math.floor(Math.random() * 1000);
                    const languageModel = new LanguageModel(languageId, language.name || '', language.level || '');

                    addLanguage(languageModel);
                });
            } else if (key === 'skills') {
                // Handle skills
                generatedData.skills.forEach((skill, index) => {
                    const skillId = skill.id || Math.floor(Math.random() * 1000);
                    const skillModel = new SkillModel(skillId, skill.name || '', skill.rating || 3);

                    addSkill(skillModel);
                });
            } else {
                // Handle simple fields like name, email, summary, etc.
                updateBasicInfo(key, generatedData[key]);
            }
        });

        console.log('Completed applying all AI generated data');
    }
}
