import React, { useState, useEffect } from 'react';
import { getSystemSettings, saveSystemSettings } from '../../../firestore/dbOperations';
import {
    FaFileCode,
    FaCheck,
    FaTimes,
    FaSpinner,
    FaStar,
    FaBan,
    FaSearch,
    FaUnlock,
    FaLock,
    FaEye,
    FaLayerGroup,
    FaCrown,
    FaFileAlt,
    FaCheckCircle,
    FaRedo,
    FaExpand
} from 'react-icons/fa';

// Import all 51 CV Template Thumbnail Images
import Cv1Img from '../../../assets/resumesNew/Cv1.JPG';
import Cv2Img from '../../../assets/resumesNew/Cv2.JPG';
import Cv3Img from '../../../assets/resumesNew/Cv3.JPG';
import Cv4Img from '../../../assets/resumesNew/Cv4.JPG';
import Cv5Img from '../../../assets/resumesNew/Cv5.JPG';
import Cv6Img from '../../../assets/resumesNew/Cv6.JPG';
import Cv7Img from '../../../assets/resumesNew/Cv7.JPG';
import Cv8Img from '../../../assets/resumesNew/Cv8.JPG';
import Cv9Img from '../../../assets/resumesNew/Cv9.JPG';
import Cv10Img from '../../../assets/resumesNew/Cv10.JPG';
import Cv11Img from '../../../assets/resumesNew/Cv11.JPG';
import Cv12Img from '../../../assets/resumesNew/Cv12.JPG';
import Cv13Img from '../../../assets/resumesNew/Cv13.JPG';
import Cv14Img from '../../../assets/resumesNew/Cv14.JPG';
import Cv15Img from '../../../assets/resumesNew/Cv15.JPG';
import Cv16Img from '../../../assets/resumesNew/Cv16.JPG';
import Cv17Img from '../../../assets/resumesNew/Cv17.JPG';
import Cv18Img from '../../../assets/resumesNew/Cv18.JPG';
import Cv19Img from '../../../assets/resumesNew/Cv19.JPG';
import Cv20Img from '../../../assets/resumesNew/Cv20.JPG';
import Cv21Img from '../../../assets/resumesNew/Cv21.JPG';
import Cv22Img from '../../../assets/resumesNew/Cv22.JPG';
import Cv23Img from '../../../assets/resumesNew/Cv23.JPG';
import Cv24Img from '../../../assets/resumesNew/Cv24.JPG';
import Cv25Img from '../../../assets/resumesNew/Cv25.JPG';
import Cv26Img from '../../../assets/resumesNew/Cv26.JPG';
import Cv27Img from '../../../assets/resumesNew/Cv27.JPG';
import Cv28Img from '../../../assets/resumesNew/Cv28.JPG';
import Cv29Img from '../../../assets/resumesNew/Cv29.JPG';
import Cv30Img from '../../../assets/resumesNew/Cv30.JPG';
import Cv31Img from '../../../assets/resumesNew/Cv31.JPG';
import Cv32Img from '../../../assets/resumesNew/Cv32.JPG';
import Cv33Img from '../../../assets/resumesNew/Cv33.JPG';
import Cv34Img from '../../../assets/resumesNew/Cv34.JPG';
import Cv35Img from '../../../assets/resumesNew/Cv35.JPG';
import Cv36Img from '../../../assets/resumesNew/Cv36.JPG';
import Cv37Img from '../../../assets/resumesNew/Cv37.JPG';
import Cv38Img from '../../../assets/resumesNew/Cv38.JPG';
import Cv39Img from '../../../assets/resumesNew/Cv39.JPG';
import Cv40Img from '../../../assets/resumesNew/Cv40.JPG';
import Cv41Img from '../../../assets/resumesNew/Cv41.JPG';
import Cv42Img from '../../../assets/resumesNew/Cv42.JPG';
import Cv43Img from '../../../assets/resumesNew/Cv43.JPG';
import Cv44Img from '../../../assets/resumesNew/Cv44.JPG';
import Cv45Img from '../../../assets/resumesNew/Cv45.JPG';
import Cv46Img from '../../../assets/resumesNew/Cv46.JPG';
import Cv47Img from '../../../assets/resumesNew/Cv47.JPG';
import Cv48Img from '../../../assets/resumesNew/Cv48.JPG';
import Cv49Img from '../../../assets/resumesNew/Cv49.JPG';
import Cv50Img from '../../../assets/resumesNew/Cv50.JPG';
import Cv51Img from '../../../assets/resumesNew/Cv51.JPG';

// Import Cover Letter Thumbnail Images
import Cover1Img from '../../../assets/coversNew/Cover1.JPG';
import Cover2Img from '../../../assets/coversNew/Cover2.JPG';
import Cover3Img from '../../../assets/coversNew/Cover3.JPG';
import Cover4Img from '../../../assets/coversNew/Cover4.JPG';

const cvThumbnails = {
    Cv1: Cv1Img, Cv2: Cv2Img, Cv3: Cv3Img, Cv4: Cv4Img, Cv5: Cv5Img,
    Cv6: Cv6Img, Cv7: Cv7Img, Cv8: Cv8Img, Cv9: Cv9Img, Cv10: Cv10Img,
    Cv11: Cv11Img, Cv12: Cv12Img, Cv13: Cv13Img, Cv14: Cv14Img, Cv15: Cv15Img,
    Cv16: Cv16Img, Cv17: Cv17Img, Cv18: Cv18Img, Cv19: Cv19Img, Cv20: Cv20Img,
    Cv21: Cv21Img, Cv22: Cv22Img, Cv23: Cv23Img, Cv24: Cv24Img, Cv25: Cv25Img,
    Cv26: Cv26Img, Cv27: Cv27Img, Cv28: Cv28Img, Cv29: Cv29Img, Cv30: Cv30Img,
    Cv31: Cv31Img, Cv32: Cv32Img, Cv33: Cv33Img, Cv34: Cv34Img, Cv35: Cv35Img,
    Cv36: Cv36Img, Cv37: Cv37Img, Cv38: Cv38Img, Cv39: Cv39Img, Cv40: Cv40Img,
    Cv41: Cv41Img, Cv42: Cv42Img, Cv43: Cv43Img, Cv44: Cv44Img, Cv45: Cv45Img,
    Cv46: Cv46Img, Cv47: Cv47Img, Cv48: Cv48Img, Cv49: Cv49Img, Cv50: Cv50Img,
    Cv51: Cv51Img,
};

const coverThumbnails = {
    Cover1: Cover1Img,
    Cover2: Cover2Img,
    Cover3: Cover3Img,
    Cover4: Cover4Img,
};

const TemplateManagerSettings = () => {
    const [templateConfig, setTemplateConfig] = useState({
        disabledCvTemplates: [],
        proCvTemplates: ['Cv1', 'Cv2', 'Cv5'],
        disabledCoverTemplates: [],
        proCoverTemplates: ['Cover2'],
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [filterCategory, setFilterCategory] = useState('All'); // All, Free, Pro, Disabled
    const [searchQuery, setSearchQuery] = useState('');
    const [previewModal, setPreviewModal] = useState(null); // { id, name, img }

    // List of 51 CV Templates
    const cvTemplatesList = Array.from({ length: 51 }, (_, i) => {
        const id = `Cv${i + 1}`;
        return {
            id,
            name: `Resume Template #${i + 1}`,
            category: i % 4 === 0 ? 'Modern & Clean' : i % 4 === 1 ? 'Executive & ATS' : i % 4 === 2 ? 'Creative & Design' : 'Minimalist',
            img: cvThumbnails[id] || Cv1Img,
        };
    });

    // List of 4 Cover Letter Templates with real thumbnails
    const coverTemplatesList = [
        { id: 'Cover1', name: 'Modern Executive Letter', category: 'Modern Professional', img: Cover1Img },
        { id: 'Cover2', name: 'Creative Portfolio Letter', category: 'Creative & Design', img: Cover2Img },
        { id: 'Cover3', name: 'ATS Clean Letter', category: 'Executive & ATS', img: Cover3Img },
        { id: 'Cover4', name: 'Minimalist Sleek Letter', category: 'Minimalist', img: Cover4Img },
    ];

    useEffect(() => {
        getSystemSettings().then((settings) => {
            if (settings && settings.templateManager) {
                setTemplateConfig({
                    disabledCvTemplates: [],
                    proCvTemplates: ['Cv1', 'Cv2', 'Cv5'],
                    disabledCoverTemplates: [],
                    proCoverTemplates: ['Cover2'],
                    ...settings.templateManager,
                });
            }
            setLoading(false);
        });
    }, []);

    const toggleProCv = (templateId) => {
        setTemplateConfig((prev) => {
            const exists = prev.proCvTemplates.includes(templateId);
            const updated = exists
                ? prev.proCvTemplates.filter((t) => t !== templateId)
                : [...prev.proCvTemplates, templateId];
            return { ...prev, proCvTemplates: updated };
        });
    };

    const toggleDisableCv = (templateId) => {
        setTemplateConfig((prev) => {
            const exists = prev.disabledCvTemplates.includes(templateId);
            const updated = exists
                ? prev.disabledCvTemplates.filter((t) => t !== templateId)
                : [...prev.disabledCvTemplates, templateId];
            return { ...prev, disabledCvTemplates: updated };
        });
    };

    const toggleProCover = (templateId) => {
        setTemplateConfig((prev) => {
            const proCovers = prev.proCoverTemplates || [];
            const exists = proCovers.includes(templateId);
            const updated = exists
                ? proCovers.filter((t) => t !== templateId)
                : [...proCovers, templateId];
            return { ...prev, proCoverTemplates: updated };
        });
    };

    const toggleDisableCover = (templateId) => {
        setTemplateConfig((prev) => {
            const exists = prev.disabledCoverTemplates.includes(templateId);
            const updated = exists
                ? prev.disabledCoverTemplates.filter((t) => t !== templateId)
                : [...prev.disabledCoverTemplates, templateId];
            return { ...prev, disabledCoverTemplates: updated };
        });
    };

    const makeAllFree = () => {
        setTemplateConfig((prev) => ({ ...prev, proCvTemplates: [], proCoverTemplates: [] }));
    };

    const enableAllTemplates = () => {
        setTemplateConfig((prev) => ({ ...prev, disabledCvTemplates: [], disabledCoverTemplates: [] }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await saveSystemSettings('templateManager', templateConfig);
            setStatusMessage({ type: 'success', text: 'Template access matrix updated successfully!' });
        } catch (error) {
            setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
        } finally {
            setSaving(false);
            setTimeout(() => setStatusMessage(null), 4000);
        }
    };

    const filteredCvTemplates = cvTemplatesList.filter((tpl) => {
        const isPro = templateConfig.proCvTemplates.includes(tpl.id);
        const isDisabled = templateConfig.disabledCvTemplates.includes(tpl.id);
        const isFree = !isPro && !isDisabled;

        const matchesSearch = tpl.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tpl.category.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        if (filterCategory === 'Free') return isFree;
        if (filterCategory === 'Pro') return isPro;
        if (filterCategory === 'Disabled') return isDisabled;
        return true;
    });

    const proCount = templateConfig.proCvTemplates.length;
    const disabledCount = templateConfig.disabledCvTemplates.length;
    const freeCount = 51 - proCount - disabledCount;

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <FaSpinner className="animate-spin text-slate-500 w-6 h-6 mr-2" />
                <span className="text-slate-600 text-sm">Loading visual template previews...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6 relative">
            {statusMessage && (
                <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${
                    statusMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                    <div className="flex items-center space-x-2">
                        {statusMessage.type === 'success' ? <FaCheck className="text-emerald-600" /> : <FaTimes className="text-red-600" />}
                        <span>{statusMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Statistics Bar Header */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
                        51
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium">Total CVs</p>
                        <p className="text-sm font-bold text-slate-800">51 Layouts</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
                        {freeCount}
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium">Free Access</p>
                        <p className="text-sm font-bold text-emerald-700">{freeCount} Free</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
                        {proCount}
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium">PRO Tier</p>
                        <p className="text-sm font-bold text-amber-700">{proCount} Pro</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg">
                        {disabledCount}
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium">Disabled</p>
                        <p className="text-sm font-bold text-red-700">{disabledCount} Hidden</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3 col-span-2 md:col-span-1">
                    <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">
                        4
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 font-medium">Cover Letters</p>
                        <p className="text-sm font-bold text-purple-700">4 Layouts</p>
                    </div>
                </div>
            </div>

            {/* Controls & Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                {/* Search Input */}
                <div className="relative w-full md:w-72">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    <input
                        type="text"
                        placeholder="Search template (e.g., Cv15, Cover2)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-800 focus:bg-white focus:outline-none transition-all"
                    />
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                    {['All', 'Free', 'Pro', 'Disabled'].map((cat) => {
                        const isActive = filterCategory === cat;
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setFilterCategory(cat)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    isActive
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {cat} {cat === 'Free' ? `(${freeCount})` : cat === 'Pro' ? `(${proCount})` : cat === 'Disabled' ? `(${disabledCount})` : ''}
                            </button>
                        );
                    })}
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
                    <button
                        type="button"
                        onClick={makeAllFree}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                        title="Remove PRO restriction from all templates"
                    >
                        Make All Free
                    </button>
                    <button
                        type="button"
                        onClick={enableAllTemplates}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
                        title="Re-enable all templates"
                    >
                        Enable All
                    </button>
                </div>
            </div>

            {/* Template Card Matrix Grid with Visual Thumbnails */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <FaLayerGroup className="text-amber-500" /> Resume Templates Matrix (51 Visual Layout Previews)
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                        Showing {filteredCvTemplates.length} of 51 Templates
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 max-h-[600px] overflow-y-auto p-1">
                    {filteredCvTemplates.map((tpl) => {
                        const isPro = templateConfig.proCvTemplates.includes(tpl.id);
                        const isDisabled = templateConfig.disabledCvTemplates.includes(tpl.id);

                        return (
                            <div
                                key={tpl.id}
                                className={`bg-white rounded-xl border p-3 flex flex-col justify-between shadow-sm transition-all hover:shadow-md group ${
                                    isDisabled
                                        ? 'border-red-300 bg-red-50/20 opacity-75'
                                        : isPro
                                        ? 'border-amber-300 ring-1 ring-amber-400/30'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                {/* Thumbnail Header */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                            {tpl.id}
                                        </span>
                                        {isDisabled ? (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-red-700 bg-red-100 rounded-full flex items-center gap-1">
                                                <FaBan className="w-2.5 h-2.5" /> Hidden
                                            </span>
                                        ) : isPro ? (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 rounded-full flex items-center gap-1">
                                                <FaCrown className="w-2.5 h-2.5 text-amber-600" /> PRO
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-100 rounded-full flex items-center gap-1">
                                                <FaUnlock className="w-2.5 h-2.5 text-emerald-600" /> Free
                                            </span>
                                        )}
                                    </div>

                                    {/* Visual Image Preview Box */}
                                    <div
                                        onClick={() => setPreviewModal(tpl)}
                                        className="relative w-full h-36 bg-slate-100 border border-slate-200 rounded-lg overflow-hidden mb-2 cursor-pointer group-hover:border-slate-400 transition-all flex items-center justify-center"
                                    >
                                        <img
                                            src={tpl.img}
                                            alt={tpl.name}
                                            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1 text-white text-xs font-semibold">
                                            <FaExpand className="w-3.5 h-3.5" />
                                            <span>Zoom Preview</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 text-center font-medium mb-2 truncate">
                                        {tpl.category}
                                    </p>
                                </div>

                                {/* Controls Matrix Buttons */}
                                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => toggleProCv(tpl.id)}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${
                                            isPro
                                                ? 'bg-amber-500 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800'
                                        }`}
                                    >
                                        <FaStar className="w-2.5 h-2.5" />
                                        <span>{isPro ? 'PRO' : 'Free'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => toggleDisableCv(tpl.id)}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${
                                            isDisabled
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-800'
                                        }`}
                                    >
                                        <FaBan className="w-2.5 h-2.5" />
                                        <span>{isDisabled ? 'Off' : 'Active'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Cover Letter Section with Full Visual Previews */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <FaFileAlt className="text-purple-600" /> Cover Letter Templates Matrix (4 Visual Layout Previews)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {coverTemplatesList.map((tpl) => {
                        const isDisabled = templateConfig.disabledCoverTemplates.includes(tpl.id);
                        const isPro = (templateConfig.proCoverTemplates || []).includes(tpl.id);

                        return (
                            <div
                                key={tpl.id}
                                className={`bg-white rounded-xl border p-3 flex flex-col justify-between shadow-sm transition-all hover:shadow-md group ${
                                    isDisabled
                                        ? 'border-red-300 bg-red-50/20 opacity-75'
                                        : isPro
                                        ? 'border-amber-300 ring-1 ring-amber-400/30'
                                        : 'border-slate-200 hover:border-slate-300'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                            {tpl.id}
                                        </span>
                                        {isDisabled ? (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-red-700 bg-red-100 rounded-full flex items-center gap-1">
                                                <FaBan className="w-2.5 h-2.5" /> Hidden
                                            </span>
                                        ) : isPro ? (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 rounded-full flex items-center gap-1">
                                                <FaCrown className="w-2.5 h-2.5 text-amber-600" /> PRO
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-100 rounded-full flex items-center gap-1">
                                                <FaUnlock className="w-2.5 h-2.5 text-emerald-600" /> Free
                                            </span>
                                        )}
                                    </div>

                                    {/* Cover Letter Image Preview */}
                                    <div
                                        onClick={() => setPreviewModal(tpl)}
                                        className="relative w-full h-44 bg-slate-100 border border-slate-200 rounded-lg overflow-hidden mb-2 cursor-pointer group-hover:border-slate-400 transition-all flex items-center justify-center"
                                    >
                                        <img
                                            src={tpl.img}
                                            alt={tpl.name}
                                            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-1 text-white text-xs font-semibold">
                                            <FaExpand className="w-3.5 h-3.5" />
                                            <span>Zoom Preview</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 text-center font-medium mb-2 truncate">
                                        {tpl.name}
                                    </p>
                                </div>

                                {/* Controls Matrix Buttons */}
                                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => toggleProCover(tpl.id)}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${
                                            isPro
                                                ? 'bg-amber-500 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800'
                                        }`}
                                    >
                                        <FaStar className="w-2.5 h-2.5" />
                                        <span>{isPro ? 'PRO' : 'Free'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => toggleDisableCover(tpl.id)}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 transition-all ${
                                            isDisabled
                                                ? 'bg-red-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-800'
                                        }`}
                                    >
                                        <FaBan className="w-2.5 h-2.5" />
                                        <span>{isDisabled ? 'Off' : 'Active'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Full-Screen High-Resolution Template Preview Zoom Modal */}
            {previewModal && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setPreviewModal(null)}
                >
                    <div
                        className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col justify-between shadow-2xl relative animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{previewModal.id} Preview</h3>
                                <p className="text-xs text-slate-500">{previewModal.name || previewModal.category}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewModal(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        {/* High Res Image */}
                        <div className="py-4 overflow-y-auto max-h-[70vh] flex justify-center">
                            <img
                                src={previewModal.img}
                                alt={previewModal.name}
                                className="max-w-full rounded-lg border border-slate-200 shadow-md"
                            />
                        </div>

                        {/* Modal Footer Controls */}
                        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">
                                {templateConfig.proCvTemplates.includes(previewModal.id) || (templateConfig.proCoverTemplates || []).includes(previewModal.id)
                                    ? '⭐ PRO Tier Template'
                                    : '🟢 Free Access Template'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPreviewModal(null)}
                                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-end pt-2">
                <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center space-x-2 shadow-md transition-all"
                >
                    {saving && <FaSpinner className="animate-spin text-white" />}
                    <span>Save Visual Template Matrix</span>
                </button>
            </div>
        </form>
    );
};

export default TemplateManagerSettings;
