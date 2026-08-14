import React, { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react';
import {
    FaCheckCircle,
    FaTimesCircle,
    FaClock,
    FaArrowRight,
    FaArrowLeft,
    FaFlag,
    FaTrophy,
    FaChartLine,
    FaRedo,
    FaHome,
    FaPlay,
    FaPause,
    FaBookmark,
    FaRegBookmark,
    FaEye,
    FaDownload,
    FaBrain,
    FaUsers,
    FaCode,
    FaBullseye,
    FaLightbulb,
    FaGraduationCap,
    FaStar,
    FaFileExport,
    FaSearch,
    FaCalendarAlt,
    FaStopwatch,
    FaPercent,
    FaAward,
    FaExclamationTriangle,
    FaListOl,
    FaBars,
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import config from '../../../conf/configuration';
// Enhanced state management with useReducer
const initialState = {
    // Interview State
    currentQuestion: 0,
    selectedAnswers: {},
    flaggedQuestions: new Set(),
    isInterviewStarted: false,
    isInterviewCompleted: false,
    isPaused: false,
    showOccupationSelection: false,
    selectedOccupation: '',
    questionCount: 10, // Default question count

    // Timing
    timeRemaining: 3600, // 60 minutes default
    timePerQuestion: {},
    questionStartTime: null,
    pausedTime: 0,
    interviewStartTime: null,

    // Results & Analytics
    score: 0,
    categoryScores: {},
    performanceMetrics: {},

    // UI State
    selectedCategory: 'all',
    selectedDifficulty: 'all',
    showReview: false,
    confirmFinish: false,
    isLoading: false,
    loadingError: null,

    // Interview Configuration
    interviewType: 'technical', // technical, behavioral, mixed
    adaptiveDifficulty: false,
    timeLimit: 3600,

    // Interview Data
    interviewData: null,
};

function interviewReducer(state, action) {
    switch (action.type) {
        case 'SHOW_OCCUPATION_SELECTION':
            return {
                ...state,
                showOccupationSelection: true,
            };
        case 'SET_OCCUPATION':
            return {
                ...state,
                selectedOccupation: action.occupation,
            };
        case 'SET_QUESTION_COUNT':
            return {
                ...state,
                questionCount: action.count,
                // Adjust time limit based on question count (3 minutes per question)
                timeLimit: action.count * 180,
                timeRemaining: action.count * 180,
            };
        case 'FETCH_INTERVIEW_START':
            return {
                ...state,
                isLoading: true,
                loadingError: null,
            };
        case 'FETCH_INTERVIEW_SUCCESS':
            return {
                ...state,
                isLoading: false,
                interviewData: action.data,
                isInterviewStarted: true,
                showOccupationSelection: false,
                questionStartTime: Date.now(),
                interviewStartTime: Date.now(),
            };
        case 'FETCH_INTERVIEW_ERROR':
            return {
                ...state,
                isLoading: false,
                loadingError: action.error,
            };
        case 'ANSWER_QUESTION': {
            const currentTime = Date.now();
            const timeSpent = state.questionStartTime ? currentTime - state.questionStartTime : 0;

            // Update time for current question
            const updatedTimePerQuestion = {
                ...state.timePerQuestion,
                [action.questionId]: (state.timePerQuestion[action.questionId] || 0) + timeSpent,
            };

            return {
                ...state,
                selectedAnswers: {
                    ...state.selectedAnswers,
                    [action.questionId]: action.answerIndex,
                },
                timePerQuestion: updatedTimePerQuestion,
                questionStartTime: currentTime, // Reset timer for next interaction
            };
        }
        case 'NAVIGATE_QUESTION': {
            // Save time spent on current question before navigating
            const navTime = Date.now();
            const navTimeSpent = state.questionStartTime ? navTime - state.questionStartTime : 0;

            const currentQuestionId = state.interviewData?.questions[state.currentQuestion]?.id;
            const navUpdatedTimePerQuestion = currentQuestionId
                ? {
                      ...state.timePerQuestion,
                      [currentQuestionId]: (state.timePerQuestion[currentQuestionId] || 0) + navTimeSpent,
                  }
                : state.timePerQuestion;

            return {
                ...state,
                currentQuestion: action.questionIndex,
                questionStartTime: navTime,
                timePerQuestion: navUpdatedTimePerQuestion,
            };
        }
        case 'TOGGLE_FLAG': {
            const newFlagged = new Set(state.flaggedQuestions);
            if (newFlagged.has(action.questionId)) {
                newFlagged.delete(action.questionId);
            } else {
                newFlagged.add(action.questionId);
            }
            return {
                ...state,
                flaggedQuestions: newFlagged,
            };
        }
        case 'PAUSE_INTERVIEW':
            if (state.isPaused) {
                // Resuming
                return {
                    ...state,
                    isPaused: false,
                    questionStartTime: Date.now(),
                    pausedTime: state.pausedTime + (Date.now() - state.pauseStartTime),
                };
            } else {
                // Pausing - save time for current question
                const pauseTime = Date.now();
                const pauseTimeSpent = state.questionStartTime ? pauseTime - state.questionStartTime : 0;

                const pauseCurrentQuestionId = state.interviewData?.questions[state.currentQuestion]?.id;
                const pauseUpdatedTimePerQuestion = pauseCurrentQuestionId
                    ? {
                          ...state.timePerQuestion,
                          [pauseCurrentQuestionId]: (state.timePerQuestion[pauseCurrentQuestionId] || 0) + pauseTimeSpent,
                      }
                    : state.timePerQuestion;

                return {
                    ...state,
                    isPaused: true,
                    pauseStartTime: pauseTime,
                    timePerQuestion: pauseUpdatedTimePerQuestion,
                    questionStartTime: null,
                };
            }
        case 'UPDATE_TIME':
            if (state.timeRemaining <= 0) {
                // Auto-complete interview when time runs out
                return {
                    ...state,
                    timeRemaining: 0,
                    isInterviewCompleted: true,
                };
            }
            return {
                ...state,
                timeRemaining: state.timeRemaining - 1,
            };
        case 'COMPLETE_INTERVIEW': {
            // Save final time for current question
            const completeTime = Date.now();
            const completeTimeSpent = state.questionStartTime ? completeTime - state.questionStartTime : 0;

            const completeCurrentQuestionId = state.interviewData?.questions[state.currentQuestion]?.id;
            const finalTimePerQuestion = completeCurrentQuestionId
                ? {
                      ...state.timePerQuestion,
                      [completeCurrentQuestionId]: (state.timePerQuestion[completeCurrentQuestionId] || 0) + completeTimeSpent,
                  }
                : state.timePerQuestion;

            return {
                ...state,
                isInterviewCompleted: true,
                score: action.score,
                categoryScores: action.categoryScores,
                performanceMetrics: action.performanceMetrics,
                timePerQuestion: finalTimePerQuestion,
            };
        }
        case 'RESET_INTERVIEW':
            return {
                ...initialState,
                interviewType: state.interviewType,
                timeLimit: state.timeLimit,
                questionCount: state.questionCount,
                interviewData: null,
            };
        case 'SET_FILTER':
            return {
                ...state,
                [action.filterType]: action.value,
            };
        case 'TOGGLE_REVIEW':
            return {
                ...state,
                showReview: !state.showReview,
            };
        case 'SET_CONFIRM_FINISH':
            return {
                ...state,
                confirmFinish: action.value,
            };
        default:
            return state;
    }
}

const DashboardInterviews = () => {
    const { t } = useTranslation('common');
    const [state, dispatch] = useReducer(interviewReducer, initialState);
    const requestControllerRef = useRef(null);

    // Function to toggle mobile sidebar
    const toggleMobileSidebar = () => {
        window.dispatchEvent(new CustomEvent('toggleMobileSidebar'));
    };

    // Function to fetch interview questions from the backend
    const fetchInterviewQuestions = useCallback(async () => {
        requestControllerRef.current?.abort();
        const requestController = new AbortController();
        requestControllerRef.current = requestController;
        dispatch({ type: 'FETCH_INTERVIEW_START' });
        try {
            // Get current language from preferredLanguage in localStorage or default to 'en'
            const currentLanguage = localStorage.getItem('preferredLanguage') || localStorage.getItem('language') || 'en';

            const response = await fetch(config.provider + '://' + config.backendUrl + '/api/generate-interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: requestController.signal,
                body: JSON.stringify({
                    occupation: state.selectedOccupation,
                    interviewType: state.interviewType,
                    questionCount: state.questionCount,
                    language: currentLanguage,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            dispatch({ type: 'FETCH_INTERVIEW_SUCCESS', data });
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('Error fetching interview questions:', error);
                dispatch({ type: 'FETCH_INTERVIEW_ERROR', error: error.message });
            }
        } finally {
            if (requestControllerRef.current === requestController) requestControllerRef.current = null;
        }
    }, [state.selectedOccupation, state.interviewType, state.questionCount]);

    useEffect(() => () => { const controller = requestControllerRef.current; requestControllerRef.current = null; controller?.abort(); }, []);

    // Enhanced timer with persistence
    useEffect(() => {
        if (state.isInterviewStarted && !state.isInterviewCompleted && !state.isPaused && state.timeRemaining > 0) {
            const timer = setInterval(() => {
                dispatch({ type: 'UPDATE_TIME' });
            }, 1000);

            return () => clearInterval(timer);
        }

        // Auto-submit if time runs out
        if (state.timeRemaining === 0 && state.isInterviewStarted && !state.isInterviewCompleted) {
            calculateResults();
        }
    }, [state.isInterviewStarted, state.isInterviewCompleted, state.isPaused, state.timeRemaining]);

    // Save progress periodically
    useEffect(() => {
        if (state.isInterviewStarted && !state.isInterviewCompleted) {
            const saveInterval = setInterval(() => {
                localStorage.setItem(
                    'interviewProgress',
                    JSON.stringify({
                        ...state,
                        lastSaved: Date.now(),
                    })
                );
            }, 5000); // Save every 5 seconds

            return () => clearInterval(saveInterval);
        }
    }, [state]);

    // Load saved progress on mount
    useEffect(() => {
        const savedProgress = localStorage.getItem('interviewProgress');
        if (savedProgress) {
            try {
                const parsed = JSON.parse(savedProgress);
                // Only restore if within 24 hours
                if (Date.now() - parsed.lastSaved < 24 * 60 * 60 * 1000) {
                    // You can implement restore logic here if needed
                    console.log('Found saved progress:', parsed);
                }
            } catch (e) {
                console.error('Error loading saved progress:', e);
            }
        }
    }, []);

    // Enhanced calculation functions
    const calculateResults = useCallback(() => {
        // Ensure we have interview data and questions
        if (!state.interviewData || !state.interviewData.questions) {
            console.error('No interview data available for scoring');
            return;
        }

        const questions = state.interviewData.questions;
        let totalScore = 0;
        let totalWeight = 0;
        const categoryScores = {};
        const categoryWeights = {};

        questions.forEach((question) => {
            const isCorrect = state.selectedAnswers[question.id] === question.correctAnswer;
            const weight = question.weight || 1;

            totalWeight += weight;
            if (isCorrect) {
                totalScore += weight;
            }

            // Category scores
            if (!categoryScores[question.category]) {
                categoryScores[question.category] = 0;
                categoryWeights[question.category] = 0;
            }
            categoryWeights[question.category] += weight;
            if (isCorrect) {
                categoryScores[question.category] += weight;
            }
        });

        // Convert to percentages
        const overallScore = Math.round((totalScore / totalWeight) * 100);
        const categoryPercentages = {};
        Object.keys(categoryScores).forEach((category) => {
            categoryPercentages[category] = Math.round((categoryScores[category] / categoryWeights[category]) * 100);
        });

        // Performance metrics
        const timePerQuestionValues = Object.values(state.timePerQuestion);
        const avgTimePerQuestion = timePerQuestionValues.length > 0 ? timePerQuestionValues.reduce((a, b) => a + b, 0) / timePerQuestionValues.length : 0;
        const fastestQuestion = timePerQuestionValues.length > 0 ? Math.min(...timePerQuestionValues) : 0;
        const slowestQuestion = timePerQuestionValues.length > 0 ? Math.max(...timePerQuestionValues) : 0;
        const totalTimeSpent = state.timeLimit - state.timeRemaining;

        const performanceMetrics = {
            avgTimePerQuestion: Math.round(avgTimePerQuestion / 1000),
            fastestQuestion: Math.round(fastestQuestion / 1000),
            slowestQuestion: Math.round(slowestQuestion / 1000),
            totalTimeSpent: totalTimeSpent,
            questionsAnswered: Object.keys(state.selectedAnswers).length,
            questionsFlagged: state.flaggedQuestions.size,
        };

        dispatch({
            type: 'COMPLETE_INTERVIEW',
            score: overallScore,
            categoryScores: categoryPercentages,
            performanceMetrics,
        });
    }, [state.interviewData, state.selectedAnswers, state.timePerQuestion, state.flaggedQuestions, state.timeLimit, state.timeRemaining]);

    // Utility functions
    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 70) return 'text-blue-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getScoreBackground = (score) => {
        if (score >= 80) return 'from-green-50 to-emerald-50 border-green-200';
        if (score >= 70) return 'from-blue-50 to-indigo-50 border-blue-200';
        if (score >= 60) return 'from-yellow-50 to-orange-50 border-yellow-200';
        return 'from-red-50 to-rose-50 border-red-200';
    };

    const getPerformanceLevel = (score) => {
        if (score >= 90) return { label: t('DashboardInterviews.performanceLevels.exceptional'), icon: FaAward, color: 'text-purple-600' };
        if (score >= 80) return { label: t('DashboardInterviews.performanceLevels.excellent'), icon: FaTrophy, color: 'text-green-600' };
        if (score >= 70) return { label: t('DashboardInterviews.performanceLevels.good'), icon: FaStar, color: 'text-blue-600' };
        if (score >= 60)
            return {
                label: t('DashboardInterviews.performanceLevels.satisfactory'),
                icon: FaCheckCircle,
                color: 'text-yellow-600',
            };
        return {
            label: t('DashboardInterviews.performanceLevels.needsImprovement'),
            icon: FaExclamationTriangle,
            color: 'text-red-600',
        };
    };

    // Occupation Selection Screen
    if (state.showOccupationSelection) {
        const handleOccupationChange = (e) => {
            dispatch({ type: 'SET_OCCUPATION', occupation: e.target.value });
        };

        const handleQuestionCountChange = (e) => {
            dispatch({ type: 'SET_QUESTION_COUNT', count: parseInt(e.target.value) });
        };

        return (
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-8 py-4 transition-all duration-300">
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="text-center">
                                <div className="flex justify-center mb-4">
                                    <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
                                        <FaGraduationCap className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('DashboardInterviews.configurationScreen.title')}</h1>
                                <p className="text-sm text-gray-600">{t('DashboardInterviews.configurationScreen.subtitle')}</p>
                            </div>
                        </div>

                        {/* Configuration Form */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="max-w-xl mx-auto space-y-6">
                                {/* Occupation Input */}
                                <div>
                                    <label htmlFor="occupation" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('DashboardInterviews.configurationScreen.occupationLabel')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            id="occupation"
                                            name="occupation"
                                            value={state.selectedOccupation}
                                            onChange={handleOccupationChange}
                                            placeholder={t('DashboardInterviews.configurationScreen.occupationPlaceholder')}
                                            className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
                                        />
                                        {state.selectedOccupation && (
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                                <FaCheckCircle className="h-5 w-5 text-green-500" />
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-2 text-sm text-gray-600">{t('DashboardInterviews.configurationScreen.occupationHint')}</p>
                                </div>

                                {/* Question Count Selector */}
                                <div>
                                    <label htmlFor="questionCount" className="block text-sm font-medium text-gray-700 mb-2">
                                        {t('DashboardInterviews.configurationScreen.questionCountLabel')}
                                    </label>
                                    <div className="relative">
                                        <select
                                            id="questionCount"
                                            name="questionCount"
                                            value={state.questionCount}
                                            onChange={handleQuestionCountChange}
                                            className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white">
                                            {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((num) => (
                                                <option key={num} value={num}>
                                                    {num} {t('DashboardInterviews.configurationScreen.questionsText')}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                            <FaListOl className="h-5 w-5 text-gray-400" />
                                        </div>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-600">
                                        {t('DashboardInterviews.configurationScreen.estimatedTime')} {formatTime(state.timeLimit)} ({Math.floor(state.timeLimit / 60 / state.questionCount)}{' '}
                                        {t('DashboardInterviews.configurationScreen.minutesPerQuestion')})
                                    </p>
                                </div>

                                {/* Interview Type Preview */}
                                <div className="border-t border-gray-200 pt-4">
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">{t('DashboardInterviews.configurationScreen.interviewDetails')}</h3>
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.configurationScreen.type')}</span>
                                            <span className="font-medium text-gray-900 capitalize">{state.interviewType}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.configurationScreen.questions')}</span>
                                            <span className="font-medium text-gray-900">{state.questionCount}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.configurationScreen.timeLimit')}</span>
                                            <span className="font-medium text-gray-900">{formatTime(state.timeLimit)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.configurationScreen.passingScore')}</span>
                                            <span className="font-medium text-gray-900">70%</span>
                                        </div>
                                    </div>
                                </div>

                                {state.loadingError && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-[#ff3b30] text-sm">
                                        <div className="flex items-center">
                                            <FaExclamationTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                                            <p>
                                                {t('DashboardInterviews.configurationScreen.errorGenerating')} {state.loadingError}
                                            </p>
                                        </div>
                                        <p className="mt-2">{t('DashboardInterviews.configurationScreen.tryAgainError')}</p>
                                    </div>
                                )}

                                {state.isLoading && (
                                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[#4a6cf7] text-sm">
                                        <div className="flex items-center">
                                            <div className="animate-spin mr-2 h-4 w-4 border-2 border-[#4a6cf7] border-t-transparent rounded-full"></div>
                                            <p>{t('DashboardInterviews.configurationScreen.generatingQuestions', { count: state.questionCount })}</p>
                                        </div>
                                        <p className="mt-2">{t('DashboardInterviews.configurationScreen.generatingHint')}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between mt-8">
                                <button
                                onClick={() =>
                                    dispatch({
                                        type: 'SET_FILTER',
                                        filterType: 'showOccupationSelection',
                                        value: false,
                                    })
                                }
                                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors duration-200 flex items-center space-x-2 text-sm">
                                <FaArrowLeft className="w-4 h-4" />
                                <span>{t('DashboardInterviews.configurationScreen.back')}</span>
                            </button>

                            <button
                                onClick={fetchInterviewQuestions}
                                disabled={!state.selectedOccupation.trim() || state.isLoading}
                                className={`px-5 py-2 font-medium rounded-lg shadow transition-colors duration-200 flex items-center space-x-2 text-sm ${
                                    !state.selectedOccupation.trim() || state.isLoading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}>
                                {state.isLoading ? (
                                    <>
                                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                        <span>{t('DashboardInterviews.configurationScreen.generatingInterview')}</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{t('DashboardInterviews.configurationScreen.startAssessment')}</span>
                                        <FaArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Interview Type Selection Screen (Initial Screen)
    if (!state.isInterviewStarted && !state.isInterviewCompleted) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="text-center">
                                <div className="flex justify-center mb-4">
                                    <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
                                        <FaBrain className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('DashboardInterviews.selectionScreen.title')}</h1>
                                <p className="text-sm text-gray-600">{t('DashboardInterviews.selectionScreen.subtitle')}</p>
                            </div>
                        </div>
                        {/* Interview Type Cards */}
                        <div className="grid lg:grid-cols-2 gap-6">
                            <div
                                className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-1 ${
                                    state.interviewType === 'technical' ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-300'
                                }`}
                                onClick={() =>
                                    dispatch({
                                        type: 'SET_FILTER',
                                        filterType: 'interviewType',
                                        value: 'technical',
                                    })
                                }>
                                <div className="flex items-center space-x-4 mb-4">
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600">
                                        <FaCode className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-base font-semibold text-gray-900 capitalize">{t('DashboardInterviews.selectionScreen.technicalTitle')}</h3>
                                        <p className="text-sm text-gray-600">{t('DashboardInterviews.selectionScreen.technicalDepartment')}</p>
                                    </div>
                                    {state.interviewType === 'technical' && <FaCheckCircle className="w-5 h-5 text-blue-600" />}
                                </div>

                                <div className="space-y-3 mb-4">
                                    <p className="text-sm text-gray-600">{t('DashboardInterviews.selectionScreen.technicalDescription')}</p>
                                </div>

                                <div className="border-t border-gray-200 pt-4">
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">{t('DashboardInterviews.selectionScreen.focusAreas')}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            t('DashboardInterviews.selectionScreen.technicalSkills'),
                                            t('DashboardInterviews.selectionScreen.problemSolving'),
                                            t('DashboardInterviews.selectionScreen.bestPractices'),
                                            t('DashboardInterviews.selectionScreen.toolsTechnologies'),
                                        ].map((category, index) => (
                                            <span key={index} className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                {category}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div
                                className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-1 ${
                                    state.interviewType === 'behavioral' ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-blue-300'
                                }`}
                                onClick={() =>
                                    dispatch({
                                        type: 'SET_FILTER',
                                        filterType: 'interviewType',
                                        value: 'behavioral',
                                    })
                                }>
                                <div className="flex items-center space-x-4 mb-4">
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100 text-purple-600">
                                        <FaUsers className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-base font-semibold text-gray-900 capitalize">{t('DashboardInterviews.selectionScreen.behavioralTitle')}</h3>
                                        <p className="text-sm text-gray-600">{t('DashboardInterviews.selectionScreen.behavioralDepartment')}</p>
                                    </div>
                                    {state.interviewType === 'behavioral' && <FaCheckCircle className="w-5 h-5 text-blue-600" />}
                                </div>

                                <div className="space-y-3 mb-4">
                                    <p className="text-sm text-gray-600">{t('DashboardInterviews.selectionScreen.behavioralDescription')}</p>
                                </div>

                                <div className="border-t border-gray-200 pt-4">
                                    <h4 className="text-sm font-medium text-gray-900 mb-2">{t('DashboardInterviews.selectionScreen.focusAreas')}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            t('DashboardInterviews.selectionScreen.leadership'),
                                            t('DashboardInterviews.selectionScreen.communication'),
                                            t('DashboardInterviews.selectionScreen.problemSolving'),
                                            t('DashboardInterviews.selectionScreen.teamwork'),
                                        ].map((category, index) => (
                                            <span key={index} className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                                {category}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Guidelines */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                                <FaGraduationCap className="w-5 h-5 mr-2 text-green-600" />
                                {t('DashboardInterviews.selectionScreen.assessmentGuidelines')}
                            </h3>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-medium  mb-3 text-green-600">{t('DashboardInterviews.selectionScreen.bestPracticesTitle')}</h4>
                                    <ul className="space-y-2 text-sm text-gray-600">
                                        <li>{t('DashboardInterviews.selectionScreen.guideline1')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.guideline2')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.guideline3')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.guideline4')}</li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="font-medium  mb-3 text-red-600">{t('DashboardInterviews.selectionScreen.thingsToAvoid')}</h4>
                                    <ul className="space-y-2 text-sm text-gray-600">
                                        <li>{t('DashboardInterviews.selectionScreen.avoid1')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.avoid2')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.avoid3')}</li>
                                        <li>{t('DashboardInterviews.selectionScreen.avoid4')}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        {/* Continue Button */}
                        <div className="text-center">
                            <button
                                onClick={() => dispatch({ type: 'SHOW_OCCUPATION_SELECTION' })}
                                className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors duration-200">
                                <FaArrowRight className="w-4 h-4 mr-2" />
                                {t('DashboardInterviews.selectionScreen.continueToConfiguration')}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">{t('DashboardInterviews.selectionScreen.configurationHint')}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Results Screen
    if (state.isInterviewCompleted) {
        const currentInterview = state.interviewData;
        if (!currentInterview) {
            return <div>{t('DashboardInterviews.resultsScreen.noDataAvailable')}</div>;
        }

        const correctAnswers = currentInterview.questions.filter((question) => state.selectedAnswers[question.id] === question.correctAnswer).length;

        const performanceLevel = getPerformanceLevel(state.score);
        const PerformanceIcon = performanceLevel.icon;

        return (
            <div className="min-h-screen bg-gray-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                    <div className="space-y-6">
                        {/* Results Header */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="text-center">
                                <div className="flex justify-center mb-4">
                                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center bg-gradient-to-br ${getScoreBackground(state.score)}`}>
                                        <PerformanceIcon className={`w-8 h-8 ${performanceLevel.color}`} />
                                    </div>
                                </div>
                                <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('DashboardInterviews.resultsScreen.title')}</h1>
                                <p className="text-sm text-gray-600">
                                    {state.selectedOccupation} -{' '}
                                    {state.interviewType === 'technical' ? t('DashboardInterviews.resultsScreen.technicalInterview') : t('DashboardInterviews.resultsScreen.behavioralInterview')}{' '}
                                    Interview
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {new Date().toLocaleDateString()} • {state.questionCount} {t('DashboardInterviews.resultsScreen.questionsText')}
                                </p>
                            </div>
                        </div>

                        {/* Score Overview */}
                        <div className="grid lg:grid-cols-3 gap-6">
                            {/* Overall Score */}
                            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-base font-semibold text-gray-900">{t('DashboardInterviews.resultsScreen.overallPerformance')}</h2>
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r ${getScoreBackground(state.score)}`}>
                                        {performanceLevel.label}
                                    </span>
                                </div>

                                <div className="text-center mb-6">
                                    <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br ${getScoreBackground(state.score)} border-4 mb-3`}>
                                        <span className={`text-2xl font-bold ${getScoreColor(state.score)}`}>{state.score}%</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {state.score >= 70 ? (
                                            <span className="text-green-600 font-medium">{t('DashboardInterviews.resultsScreen.passedAssessment')}</span>
                                        ) : (
                                            <span className="text-red-600 font-medium">{t('DashboardInterviews.resultsScreen.failedAssessment')}</span>
                                        )}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                                        <FaCheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
                                        <p className="text-base font-semibold text-green-600">{correctAnswers}</p>
                                        <p className="text-xs text-gray-600">{t('DashboardInterviews.resultsScreen.correctAnswers')}</p>
                                    </div>
                                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                                        <FaTimesCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                                        <p className="text-base font-semibold text-red-600">{currentInterview.questions.length - correctAnswers}</p>
                                        <p className="text-xs text-gray-600">{t('DashboardInterviews.resultsScreen.incorrectAnswers')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Performance Metrics */}
                            <div className="space-y-6">
                                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                                        <FaStopwatch className="w-4 h-4 mr-2 text-blue-600" />
                                        {t('DashboardInterviews.metricsScreen.timeAnalysis')}
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.totalTime')}</span>
                                            <span className="font-medium text-gray-900">{formatTime(state.performanceMetrics.totalTimeSpent)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.avgPerQuestion')}</span>
                                            <span className="font-medium text-gray-900">{state.performanceMetrics.avgTimePerQuestion}s</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.fastest')}</span>
                                            <span className="font-medium text-green-600">{state.performanceMetrics.fastestQuestion}s</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.slowest')}</span>
                                            <span className="font-medium text-orange-600">{state.performanceMetrics.slowestQuestion}s</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                    <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                                        <FaFlag className="w-4 h-4 mr-2 text-purple-600" />
                                        {t('DashboardInterviews.metricsScreen.activitySummary')}
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.questionsAnswered')}</span>
                                            <span className="font-medium text-gray-900">
                                                {state.performanceMetrics.questionsAnswered}/{currentInterview.questions.length}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.questionsFlagged')}</span>
                                            <span className="font-medium text-purple-600">{state.performanceMetrics.questionsFlagged}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-600">{t('DashboardInterviews.metricsScreen.completionRate')}</span>
                                            <span className="font-medium text-blue-600">{Math.round((state.performanceMetrics.questionsAnswered / currentInterview.questions.length) * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Category Performance */}
                        {Object.keys(state.categoryScores).length > 0 && (
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                <h2 className="text-base font-semibold text-gray-900 mb-6 flex items-center">
                                    <FaChartLine className="w-5 h-5 mr-2 text-blue-600" />
                                    {t('DashboardInterviews.metricsScreen.performanceByCategory')}
                                </h2>
                                <div className="space-y-4">
                                    {Object.entries(state.categoryScores).map(([category, score]) => (
                                        <div key={category} className="bg-gray-50 rounded-lg p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-medium text-gray-900">{category}</span>
                                                <span className={`font-semibold ${getScoreColor(score)}`}>{score}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className={`h-2 rounded-full transition-all duration-500 ${
                                                        score >= 80 ? 'bg-green-500' : score >= 70 ? 'bg-blue-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                                    }`}
                                                    style={{ width: `${score}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-3 justify-center">
                            <button
                                onClick={() => dispatch({ type: 'RESET_INTERVIEW' })}
                                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors duration-200">
                                <FaRedo className="w-3 h-3 mr-2" />
                                {t('DashboardInterviews.metricsScreen.retakeAssessment')}
                            </button>
                            <button
                                onClick={() => dispatch({ type: 'TOGGLE_REVIEW' })}
                                className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors duration-200">
                                <FaEye className="w-3 h-3 mr-2" />
                                {t('DashboardInterviews.metricsScreen.reviewAnswers')}
                            </button>
                            <button className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm transition-colors duration-200">
                                <FaDownload className="w-3 h-3 mr-2" />
                                {t('DashboardInterviews.metricsScreen.downloadReport')}
                            </button>
                            <button
                                onClick={() => (window.location.href = '/dashboard2')}
                                className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md shadow-sm transition-colors duration-200">
                                <FaHome className="w-3 h-3 mr-2" />
                                {t('DashboardInterviews.metricsScreen.backToDashboard')}
                            </button>
                        </div>

                        {/* Review Section */}
                        {state.showReview && (
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-base font-semibold text-gray-900">{t('DashboardInterviews.metricsScreen.answerReview')}</h2>
                                    <button onClick={() => dispatch({ type: 'TOGGLE_REVIEW' })} className="text-gray-400 hover:text-gray-600">
                                        <FaTimesCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    {currentInterview.questions.map((question, index) => {
                                        const userAnswer = state.selectedAnswers[question.id];
                                        const isCorrect = userAnswer === question.correctAnswer;
                                        const wasFlagged = state.flaggedQuestions.has(question.id);

                                        return (
                                            <div key={question.id} className={`border rounded-lg p-4 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center space-x-2 mb-2">
                                                            <span className="text-sm font-medium text-gray-700">
                                                                {t('DashboardInterviews.metricsScreen.question')} {index + 1}
                                                            </span>
                                                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">{question.category}</span>
                                                            <span
                                                                className={`text-xs px-2 py-1 rounded ${
                                                                    question.difficulty === 'Easy'
                                                                        ? 'bg-green-100 text-green-700'
                                                                        : question.difficulty === 'Intermediate'
                                                                        ? 'bg-yellow-100 text-yellow-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                }`}>
                                                                {question.difficulty === 'Easy'
                                                                    ? t('DashboardInterviews.metricsScreen.difficulty.easy')
                                                                    : question.difficulty === 'Intermediate'
                                                                    ? t('DashboardInterviews.metricsScreen.difficulty.intermediate')
                                                                    : t('DashboardInterviews.metricsScreen.difficulty.hard')}
                                                            </span>
                                                            {wasFlagged && <FaFlag className="w-3 h-3 text-purple-600" />}
                                                        </div>
                                                        <h3 className="text-sm font-semibold text-gray-900 mb-3">{question.question}</h3>
                                                    </div>
                                                    <div
                                                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                                                            isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                        }`}>
                                                        {isCorrect ? <FaCheckCircle className="w-4 h-4" /> : <FaTimesCircle className="w-4 h-4" />}
                                                    </div>
                                                </div>

                                                <div className="space-y-2 mb-4">
                                                    {question.options.map((option, optionIndex) => (
                                                        <div
                                                            key={optionIndex}
                                                            className={`p-3 rounded-lg border ${
                                                                optionIndex === question.correctAnswer
                                                                    ? 'border-green-300 bg-green-50'
                                                                    : optionIndex === userAnswer && !isCorrect
                                                                    ? 'border-red-300 bg-red-50'
                                                                    : 'border-gray-200 bg-white'
                                                            }`}>
                                                            <div className="flex items-center space-x-3">
                                                                <span className="font-medium text-gray-700">{String.fromCharCode(65 + optionIndex)}.</span>
                                                                <span className="text-gray-900">{option}</span>
                                                                {optionIndex === question.correctAnswer && (
                                                                    <span className="text-green-600 text-sm font-medium">{t('DashboardInterviews.metricsScreen.correct')}</span>
                                                                )}
                                                                {optionIndex === userAnswer && optionIndex !== question.correctAnswer && (
                                                                    <span className="text-red-600 text-sm font-medium">{t('DashboardInterviews.metricsScreen.yourAnswer')}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                {question.explanation && (
                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                        <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                                                            <FaLightbulb className="w-3 h-3 mr-2" />
                                                            {t('DashboardInterviews.metricsScreen.explanation')}
                                                        </h4>
                                                        <p className="text-blue-800 text-sm">{question.explanation}</p>
                                                    </div>
                                                )}

                                                {state.timePerQuestion[question.id] && (
                                                    <div className="mt-4 text-sm text-gray-600">
                                                        {t('DashboardInterviews.metricsScreen.timeSpent')} {Math.round(state.timePerQuestion[question.id] / 1000)}s
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Interview Screen
    const currentInterview = state.interviewData;
    if (!currentInterview || !currentInterview.questions) {
        return <div>{t('DashboardInterviews.interviewScreen.loadingData')}</div>;
    }

    const currentQuestion = currentInterview.questions[state.currentQuestion];
    const progress = ((state.currentQuestion + 1) / currentInterview.questions.length) * 100;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h1 className="text-base font-semibold text-gray-900">
                                    {state.selectedOccupation} - {state.interviewType === 'technical' ? 'Technical' : 'Behavioral'} Interview
                                </h1>
                                <p className="text-sm text-gray-600 flex items-center space-x-2">
                                    <span>{t('DashboardInterviews.interviewScreen.professionalEvaluation')}</span>
                                    <span>•</span>
                                    <span className="flex items-center">
                                        <FaCalendarAlt className="w-3 h-3 mr-1" />
                                        {new Date().toLocaleDateString()}
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="text-center">
                                    <div className="text-xs text-gray-500">{t('DashboardInterviews.interviewScreen.timeRemaining')}</div>
                                    <div
                                        className={`text-sm font-mono font-semibold ${state.timeRemaining < 600 ? 'text-red-600' : state.timeRemaining < 1200 ? 'text-yellow-600' : 'text-green-600'}`}>
                                        {formatTime(state.timeRemaining)}
                                    </div>
                                </div>
                                <button
                                    onClick={() => dispatch({ type: 'PAUSE_INTERVIEW' })}
                                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                                        state.isPaused ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                    }`}>
                                    {state.isPaused ? (
                                        <>
                                            <FaPlay className="w-3 h-3" />
                                            <span>{t('DashboardInterviews.interviewScreen.resume')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <FaPause className="w-3 h-3" />
                                            <span>{t('DashboardInterviews.interviewScreen.pause')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">
                                    {t('DashboardInterviews.interviewScreen.questionProgress', { current: state.currentQuestion + 1, total: currentInterview.questions.length })}
                                </span>
                                <span className="text-sm text-blue-600 font-medium">
                                    {Math.round(progress)}
                                    {t('DashboardInterviews.interviewScreen.complete')}
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>

                        {/* Question Navigation */}
                        <div className="mt-4 flex flex-wrap gap-2">
                            {currentInterview.questions.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() =>
                                        dispatch({
                                            type: 'NAVIGATE_QUESTION',
                                            questionIndex: index,
                                        })
                                    }
                                    className={`relative w-8 h-8 rounded-md text-xs font-medium transition-all duration-200 ${
                                        index === state.currentQuestion
                                            ? 'bg-blue-600 text-white'
                                            : state.selectedAnswers[currentInterview.questions[index].id] !== undefined
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}>
                                    {index + 1}
                                    {state.flaggedQuestions.has(currentInterview.questions[index].id) && <FaFlag className="absolute -top-1 -right-1 w-2 h-2 text-purple-600" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Pause Overlay */}
                    {state.isPaused && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                            <p className="text-yellow-800 font-medium">{t('DashboardInterviews.interviewScreen.interviewPaused')}</p>
                            <p className="text-yellow-700 text-sm mt-1">{t('DashboardInterviews.interviewScreen.pauseMessage')}</p>
                        </div>
                    )}

                    {/* Main Question */}
                    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${state.isPaused ? 'opacity-50 pointer-events-none' : ''}`}>
                        {/* Question Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">{currentQuestion.category}</span>
                                <span
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                        currentQuestion.difficulty === 'Easy'
                                            ? 'bg-green-100 text-green-800'
                                            : currentQuestion.difficulty === 'Intermediate'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
                                    }`}>
                                    {currentQuestion.difficulty}
                                </span>
                                {currentQuestion.estimatedTime && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                                        <FaClock className="w-3 h-3 mr-1" />~{Math.round(currentQuestion.estimatedTime / 60)}
                                        {t('DashboardInterviews.common.min')}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() =>
                                    dispatch({
                                        type: 'TOGGLE_FLAG',
                                        questionId: currentQuestion.id,
                                    })
                                }
                                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                                    state.flaggedQuestions.has(currentQuestion.id) ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                                {state.flaggedQuestions.has(currentQuestion.id) ? <FaBookmark className="w-3 h-3" /> : <FaRegBookmark className="w-3 h-3" />}
                                <span>{state.flaggedQuestions.has(currentQuestion.id) ? t('DashboardInterviews.interviewScreen.flagged') : t('DashboardInterviews.interviewScreen.flag')}</span>
                            </button>
                        </div>

                        {/* Question */}
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">{currentQuestion.question}</h2>
                        </div>

                        {/* Answer Options */}
                        <div className="space-y-3 mb-8">
                            {currentQuestion.options.map((option, index) => (
                                <div
                                    key={index}
                                    className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                                        state.selectedAnswers[currentQuestion.id] === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-25'
                                    }`}
                                    onClick={() =>
                                        dispatch({
                                            type: 'ANSWER_QUESTION',
                                            questionId: currentQuestion.id,
                                            answerIndex: index,
                                        })
                                    }>
                                    <div className="flex items-center space-x-3">
                                        <div
                                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                state.selectedAnswers[currentQuestion.id] === index ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                                            }`}>
                                            {state.selectedAnswers[currentQuestion.id] === index && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                        </div>
                                        <div
                                            className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold ${
                                                state.selectedAnswers[currentQuestion.id] === index ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            {String.fromCharCode(65 + index)}
                                        </div>
                                        <span className="text-gray-900 font-medium">{option}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                            <button
                                onClick={() =>
                                    dispatch({
                                        type: 'NAVIGATE_QUESTION',
                                        questionIndex: state.currentQuestion - 1,
                                    })
                                }
                                disabled={state.currentQuestion === 0}
                                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                                    state.currentQuestion === 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                                }`}>
                                <FaArrowLeft className="w-3 h-3 mr-2" />
                                {t('DashboardInterviews.interviewScreen.previous')}
                            </button>

                            {state.currentQuestion === currentInterview.questions.length - 1 ? (
                                <button
                                    onClick={() => dispatch({ type: 'SET_CONFIRM_FINISH', value: true })}
                                    disabled={Object.keys(state.selectedAnswers).length === 0}
                                    className={`inline-flex items-center px-6 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                                        Object.keys(state.selectedAnswers).length > 0 ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}>
                                    <FaFlag className="w-3 h-3 mr-2" />
                                    {t('DashboardInterviews.interviewScreen.finishAssessment')}
                                </button>
                            ) : (
                                <button
                                    onClick={() =>
                                        dispatch({
                                            type: 'NAVIGATE_QUESTION',
                                            questionIndex: state.currentQuestion + 1,
                                        })
                                    }
                                    className="inline-flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors duration-200">
                                    {t('DashboardInterviews.interviewScreen.nextQuestion')}
                                    <FaArrowRight className="w-3 h-3 ml-2" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Confirmation Modal */}
                    {state.confirmFinish && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                                <div className="text-center mb-6">
                                    <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <FaExclamationTriangle className="w-6 h-6 text-yellow-600" />
                                    </div>
                                    <h3 className="text-base font-semibold text-gray-900 mb-2">{t('DashboardInterviews.confirmationModal.title')}</h3>
                                    <p className="text-sm text-gray-600">{t('DashboardInterviews.confirmationModal.message')}</p>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{t('DashboardInterviews.confirmationModal.questionsAnswered')}</span>
                                        <span className="font-medium">
                                            {Object.keys(state.selectedAnswers).length}/{currentInterview.questions.length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{t('DashboardInterviews.confirmationModal.questionsFlagged')}</span>
                                        <span className="font-medium text-purple-600">{state.flaggedQuestions.size}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">{t('DashboardInterviews.confirmationModal.timeUsed')}</span>
                                        <span className="font-medium">{formatTime(state.timeLimit - state.timeRemaining)}</span>
                                    </div>
                                </div>

                                {Object.keys(state.selectedAnswers).length < currentInterview.questions.length && (
                                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <p className="text-sm text-yellow-800">
                                            {t('DashboardInterviews.confirmationModal.unansweredWarning', { count: currentInterview.questions.length - Object.keys(state.selectedAnswers).length })}
                                        </p>
                                    </div>
                                )}

                                <div className="flex space-x-3">
                                    <button
                                        onClick={() => dispatch({ type: 'SET_CONFIRM_FINISH', value: false })}
                                        className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md transition-colors duration-200">
                                        {t('DashboardInterviews.confirmationModal.continueInterview')}
                                    </button>
                                    <button
                                        onClick={calculateResults}
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors duration-200">
                                        {t('DashboardInterviews.confirmationModal.submitNow')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardInterviews;
