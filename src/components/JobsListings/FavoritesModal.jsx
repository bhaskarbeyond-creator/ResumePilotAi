import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaHeart, FaTimes, FaBookmark, FaBriefcase, FaMapMarkerAlt, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { withTranslation } from 'react-i18next';
import { getJobFavourites } from '../../firestore/dbOperations';

const FavoritesModal = ({ 
    isOpen, 
    onClose, 
    savedJobs, 
    jobs, 
    onToggleSaved, 
    onViewDetails,
    user,
    t
}) => {
    // Prevent background scrolling when modal is open
    React.useEffect(() => {
        if (isOpen) {
            document.documentElement.style.overflow = 'hidden';
        } else {
            document.documentElement.style.overflow = 'unset';
        }

        return () => {
            document.documentElement.style.overflow = 'unset';
        };
    }, [isOpen]);

    const modalVariants = {
        hidden: { x: '100%' },
        visible: {
            x: 0,
            transition: {
                type: 'tween',
                ease: [0.25, 0.46, 0.45, 0.94],
                duration: 0.4,
            },
        },
        exit: {
            x: '100%',
            transition: {
                type: 'tween',
                ease: [0.25, 0.46, 0.45, 0.94],
                duration: 0.4,
            },
        },
    };

    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { duration: 0.3 },
        },
        exit: {
            opacity: 0,
            transition: { duration: 0.3 },
        },
    };

    const handleViewDetailsAndClose = (job) => {
        onViewDetails(job);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/50 z-[10001]"
                        variants={backdropVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        className="fixed top-0 right-0 h-screen bg-white shadow-2xl z-[10002] overflow-hidden w-full lg:w-[600px] xl:w-[700px]"
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="h-full flex flex-col">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                                <div className="flex items-center justify-between px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                            <FaHeart className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <h1 className="text-lg font-semibold">{t('JobsUpdate.FavoritesModal.title', 'Favorite Jobs')}</h1>
                                            <p className="text-blue-100 text-sm">
                                                {savedJobs.size} {savedJobs.size === 1 ? t('JobsUpdate.FavoritesModal.job', 'job') : t('JobsUpdate.FavoritesModal.jobs', 'jobs')} {t('JobsUpdate.FavoritesModal.saved', 'saved')}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors duration-200"
                                    >
                                        <FaTimes className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6">
                                {savedJobs.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center">
                                        <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                                            <FaHeart className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 mb-2">No Favorite Jobs Yet</h3>
                                        <p className="text-slate-600 mb-6 text-sm max-w-sm">
                                            Start saving jobs you're interested in by clicking the bookmark icon on job cards.
                                        </p>
                                        <button
                                            onClick={onClose}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-sm shadow-sm"
                                        >
                                            {t('JobsUpdate.FavoritesModal.browseJobs', 'Browse Jobs')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-lg font-semibold text-slate-900">{t('JobsUpdate.FavoritesModal.yourSavedJobs', 'Your Saved Jobs')}</h2>
                                            <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                                                {savedJobs.size} {savedJobs.size === 1 ? t('JobsUpdate.FavoritesModal.job', 'job') : t('JobsUpdate.FavoritesModal.jobs', 'jobs')}
                                            </span>
                                        </div>

                                        {/* Check for missing jobs */}
                                        {(() => {
                                            const availableJobs = jobs.filter((job) => savedJobs.has(job.id));
                                            const missingJobsCount = savedJobs.size - availableJobs.length;
                                            
                                            return (
                                                <div className="space-y-3">
                                                    {/* Show warning for missing jobs */}
                                                    {missingJobsCount > 0 && (
                                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                                                            <div className="flex items-start gap-3">
                                                                <div className="w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                    <FaExclamationTriangle className="w-3 h-3 text-white" />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <h4 className="font-semibold text-amber-800 text-sm mb-1">
                                                                        {t('JobsUpdate.FavoritesModal.missingJobsWarning.title', '{0} Saved Job{plural} No Longer Available', { 0: missingJobsCount, plural: missingJobsCount > 1 ? 's' : '' })}
                                                                    </h4>
                                                                    <p className="text-amber-700 text-xs mb-2">
                                                                        {t('JobsUpdate.FavoritesModal.missingJobsWarning.description', 'Some jobs in your favorites may have been removed or are no longer active.')}
                                                                    </p>
                                                                    <button
                                                                        onClick={() => {
                                                                            // Remove missing job IDs from favorites
                                                                            const availableJobIds = new Set(jobs.map(job => job.id));
                                                                            const missingJobIds = Array.from(savedJobs).filter(id => !availableJobIds.has(id));
                                                                            missingJobIds.forEach(jobId => onToggleSaved(jobId));
                                                                        }}
                                                                        className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors duration-200"
                                                                    >
                                                                        {t('JobsUpdate.FavoritesModal.cleanUpMissingJobs', 'Clean Up Missing Jobs')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Available Jobs List */}
                                                    {availableJobs.map((job) => (
                                                    <div key={job.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-all duration-200">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-start gap-3">
                                                                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                                                                        <FaBriefcase className="w-4 h-4 text-slate-600" />
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <h3 className="font-semibold text-slate-900 text-sm mb-1">{job.title}</h3>
                                                                        <p className="text-slate-600 text-sm mb-2">{job.company}</p>
                                                                        <div className="flex items-center gap-4 text-xs text-slate-500">
                                                                            <span className="flex items-center gap-1">
                                                                                <FaMapMarkerAlt className="w-3 h-3" />
                                                                                {job.location}
                                                                            </span>
                                                                            <span className="flex items-center gap-1">
                                                                                <FaClock className="w-3 h-3" />
                                                                                {job.postedDate}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-3">
                                                                <button
                                                                    onClick={() => onToggleSaved(job.id)}
                                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                                                                    title={t('JobsUpdate.FavoritesModal.removeFromFavorites', 'Remove from favorites')}
                                                                >
                                                                    <FaBookmark className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleViewDetailsAndClose(job)}
                                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors duration-200"
                                                                >
                                                                    {t('JobsUpdate.FavoritesModal.viewDetails', 'View Details')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default withTranslation('common')(FavoritesModal);
