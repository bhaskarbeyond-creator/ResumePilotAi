import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCrop } from 'react-icons/fa';
import ImageCropModal from '../../../Dashboard/DashboardSettings/ImageCropModal';

const PhotoUpload = ({ label, value, onChange, showPhoto = true, onToggleShowPhoto, required = false, compact = false, hint }) => {
    const { t } = useTranslation('common');
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cropModalSrc, setCropModalSrc] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileChange = (file) => {
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setError(t('PhotoUpload.errors.sizeLimit', 'File size must be 5 MB or less.'));
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setError('Only JPEG, PNG, and WebP images are supported.');
            return;
        }

        setError(null);
        const reader = new FileReader();

        reader.onload = (event) => {
            setCropModalSrc(event.target.result);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        };

        reader.onerror = () => {
            setError(t('PhotoUpload.errors.readingError', 'Failed to read image.'));
        };

        reader.readAsDataURL(file);
    };

    const handleCroppedImage = (croppedDataUrl) => {
        setCropModalSrc(null);
        onChange(croppedDataUrl);
    };

    const handleInputChange = (e) => {
        const file = e.target.files[0];
        handleFileChange(file);
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragging(true);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileChange(files[0]);
        }
    };

    const handleRemoveImage = () => {
        onChange(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const triggerFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <div className="space-y-2">
            <label htmlFor="resume-photo-upload" className="block text-sm font-medium text-slate-700">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {value ? (
                <>
                <div className="relative group">
                    <div className={`${compact ? 'w-24 h-24 rounded-xl' : 'w-32 h-32 rounded-lg'} overflow-hidden border-2 border-slate-200 bg-slate-50 shadow-2xs`}>
                        <img src={value} alt="Profile" className="w-full h-full object-cover" />
                    </div>

                    {/* Action buttons overlay */}
                    <div className={`absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${compact ? 'rounded-xl' : 'rounded-lg'} flex items-center justify-center space-x-1.5`}>
                        <button
                            type="button"
                            onClick={() => setCropModalSrc(value)}
                            className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-all text-indigo-600 shadow-xs"
                            title="Crop & Adjust Photo">
                            <FaCrop className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={triggerFileInput}
                            className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-all text-slate-700 shadow-xs"
                            title={t('PhotoUpload.actions.changePhoto')}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-all text-red-600 shadow-xs"
                            title={t('PhotoUpload.actions.removePhoto')}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Show / Hide Photo on Resume Checkbox */}
                {compact ? (
                    <label className="mt-1 flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-bold text-slate-600">
                        <input
                            type="checkbox"
                            checked={showPhoto !== false}
                            onChange={(e) => onToggleShowPhoto && onToggleShowPhoto(e.target.checked)}
                            className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>{showPhoto !== false ? 'Show on CV' : 'Hidden'}</span>
                    </label>
                ) : (
                    <div className="mt-2.5 flex items-center justify-between p-2 bg-slate-50 border border-slate-200/80 rounded-lg w-full max-w-[200px]">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700">
                            <input
                                type="checkbox"
                                checked={showPhoto !== false}
                                onChange={(e) => onToggleShowPhoto && onToggleShowPhoto(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <span>{showPhoto !== false ? 'Show on CV' : 'Hide from CV'}</span>
                        </label>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${showPhoto !== false ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                            {showPhoto !== false ? 'ON' : 'OFF'}
                        </span>
                    </div>
                )}
            </>
            ) : (
                <div
                    className={`${compact ? 'w-24 h-24 rounded-xl' : 'w-32 h-32 rounded-lg'} border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center p-2 text-center ${
                        isDragging ? 'border-indigo-500 bg-indigo-50' : isLoading ? 'border-slate-300 bg-slate-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50'
                    }`}
                    onClick={triggerFileInput}
                    role="button"
                    tabIndex={0}
                    aria-label={t('PhotoUpload.actions.addPhoto')}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); triggerFileInput(); } }}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}>
                    {isLoading ? (
                        <div className="flex flex-col items-center">
                            <div className="w-5 h-5 border-2 border-t-transparent border-indigo-500 rounded-full animate-spin"></div>
                            <span className="text-[10px] text-slate-600 mt-1">{t('PhotoUpload.actions.processing')}</span>
                        </div>
                    ) : (
                        <>
                            <svg className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-[10px] font-bold text-slate-700 block mt-1">
                                {isDragging ? 'Drop' : 'Add Photo'}
                            </span>
                            {!compact && <span className="text-[10px] text-slate-400">{isDragging ? '' : t('PhotoUpload.actions.clickOrDrag')}</span>}
                        </>
                    )}
                </div>
            )}

            {/* File input */}
            <input id="resume-photo-upload" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleInputChange} className="hidden" />

            {/* Error message */}
            {error && (
                <div className="flex items-center text-red-600 text-xs">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Help text */}
            {!compact && <p className="text-xs text-slate-500">{t('PhotoUpload.hints.recommended')}</p>}

            {/* Image Crop Modal Popup */}
            {cropModalSrc && (
                <ImageCropModal
                    imageSrc={cropModalSrc}
                    onCrop={handleCroppedImage}
                    onCancel={() => setCropModalSrc(null)}
                    outputSize={400}
                />
            )}
        </div>
    );
};

export default PhotoUpload;
