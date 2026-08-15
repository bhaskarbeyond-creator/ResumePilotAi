import React, { Component } from 'react';
// Importing packages that will help us to transfrom a div into a pdf ,  Div --> Canvas(jpeg) --> Pdf
import Canvas from '../canvas/Canvas';
// Toasts
import Toasts from '../../Toasts/Toats';
import {
    setResumePropertyPerUser,
    addEmployments,
    addEducations,
    IncrementDownloads,
    addSkills,
    addLanguages,
    setJsonPb,
    getResumeById,
    addCoverLetter,
    addOneToNumberOfDocumentsGenerated,
    addOneToNumberOfDocumentsDownloaded,
} from '../../../firestore/dbOperations';
// Animation Library
import { motion, AnimatePresence } from 'framer-motion';
import { withTranslation } from 'react-i18next';

import axios from 'axios';
import download from 'downloadjs';
import config from '../../../conf/configuration';
import fire from '../../../conf/fire';

// Icons
import { FaEye, FaDownload, FaSave, FaPalette } from 'react-icons/fa';
import { trackDownload, trackEvent, trackEngagement } from '../../../utils/ga4';
import { evaluateDownloadAccess } from '../../../utils/subscriptionUtils';

class BoardFilling extends Component {
    constructor(props) {
        super(props);
        this.state = {
            triggerDownload: false,
            page: 1,
            currentPage: 1,
            isSuccessToastVisible: false,
            isDownloadToastVisible: false,
            isUpgradeToastVisible: false,
            isSaving: false,
            showSavedIcon: false,
            count: 0,
            showColorPanel: false,
        };
        this.addPage = this.addPage.bind(this);
        this.nextPage = this.nextPage.bind(this);
        this.previousPage = this.previousPage.bind(this);
        this.ShowToast = this.ShowToast.bind(this);
        this.saveToDatabase = this.saveToDatabase.bind(this);
        this.setToFirstPage = this.setToFirstPage.bind(this);
        this.removePage = this.removePage.bind(this);
        this.startDownload = this.startDownload.bind(this);
        this.download = this.download.bind(this);
        this.saveCoverToDatabase = this.saveCoverToDatabase.bind(this);
        this.toggleColorPanel = this.toggleColorPanel.bind(this);
        this.handleColorChange = this.handleColorChange.bind(this);
    }

    toggleColorPanel() {
        this.setState((prevState) => ({
            showColorPanel: !prevState.showColorPanel,
        }));
    }

    handleColorChange(colorType, color) {
        // Update colors using the prop from parent component
        if (this.props.handleColorChange) {
            this.props.handleColorChange(colorType, color);
        }
    }

    setToFirstPage() {
        this.setState((prevState, props) => ({
            currentPage: 1,
        }));
    }

    addPage() {
        this.setState((prevState, props) => ({
            page: prevState.page + 1,
        }));
    }

    removePage() {
        this.setState((prevState, props) => ({
            page: prevState.page - 1,
        }));
    }

    nextPage() {
        this.setState((prevState, props) => ({
            currentPage: prevState.currentPage + 1,
        }));
    }

    previousPage() {
        this.setState((prevState, props) => ({
            currentPage: prevState.currentPage - 1,
        }));
    }

    componentDidMount() {
        for (let index = 0; index < 2; index++) {
            setTimeout(() => {
                if (this.state.count < 2) {
                    this.setState({ count: this.state.count });
                }
            }, 1000);
        }
    }

    startDownload() {
        if (this.state.isSaving === true) {
            return;
        }

        console.log('Download initiated. Subscription status:', this.props.values.subscriptionsStatus);

        const access = evaluateDownloadAccess({
            user: this.props.values.user,
            membership: this.props.values.membership,
            membershipEnds: this.props.values.membershipEnds,
            subscriptionsStatus: this.props.values.subscriptionsStatus,
            isStatusLoaded: true
        });

        console.log('Evaluated download access decision in BoardFilling:', access);

        if (access.allowed) {
            console.log(`Download allowed. Reason: ${access.reason}`);
            this.ShowToast('Download');
            this.download();
            return;
        }

        if (access.reason === 'LOGIN_REQUIRED') {
            console.log('User not logged in, showing auth prompt');
            this.props.authBtnHandler();
            return;
        }

        if (access.reason === 'PREMIUM_REQUIRED') {
            console.log('Non-premium user with subscriptions enabled, redirecting to billing');
            this.saveToDatabase();
            this.ShowToast('Upgrade');
            setTimeout(() => {
                window.location.href = '/billing/plans';
            }, 3000);
        }
    }

    async download() {
        const userId = fire.auth().currentUser?.uid;
        if (!userId) throw new Error('Sign in before downloading an account document.');
        const templateName = this.props.currentResumeName;
        const documentType = this.props.currentStep === 'Cover Filling' ? 'cover_letter' : 'resume';

        if (localStorage.getItem('currentResumeId') === null) {
            localStorage.setItem('currentResumeId', Math.floor(Math.random() * 20000).toString() + 'xknd');
            console.log(localStorage.getItem('currentResumeId'));
            await this.saveToDatabase();
        } else {
            await this.saveToDatabase();
        }
        await IncrementDownloads();
        await addOneToNumberOfDocumentsDownloaded(userId);

        setJsonPb(localStorage.getItem('currentResumeId'), this.props.values);

        axios
            .post(
                config.provider + '://' + config.backendUrl + '/api/export',
                {
                    language: this.props.values.language,
                    resumeId: localStorage.getItem('currentResumeId'),
                    resumeName: this.props.currentResumeName,
                },
                {
                    responseType: 'blob',
                }
            )
            .then(function (response) {
                console.log(response);
                const content = response.headers['content-type'];

                // Track the download event
                trackDownload(templateName, documentType);
                trackEvent('download_document', 'Documents', templateName, 1);
                trackEngagement('document_downloaded', {
                    template_name: templateName,
                    document_type: documentType,
                });

                download(response.data, 'resume.pdf', content);
            })
            .catch(function (error) {
                console.log(error);
                // Track download failure
                trackEvent('download_failed', 'Documents', templateName, 0);
            })
            .then(function () {
                // always executed
            });
    }

    ShowToast(type) {
        if (type === 'Download') {
            setTimeout(() => {
                this.setState((prevState, props) => ({
                    isDownloadToastVisible: !prevState.isDownloadToastVisible,
                }));
            }, 8000);
            this.setState((prevState, props) => ({
                isDownloadToastVisible: !prevState.isDownloadToastVisible,
            }));
        }
        if (type === 'Success') {
            setTimeout(() => {
                this.setState((prevState, props) => ({
                    isSuccessToastVisible: !prevState.isSuccessToastVisible,
                }));
            }, 8000);
            this.setState((prevState, props) => ({
                isSuccessToastVisible: !prevState.isSuccessToastVisible,
            }));
        }
        if (type === 'Upgrade') {
            setTimeout(() => {
                this.setState((prevState, props) => ({
                    isUpgradeToastVisible: !prevState.isUpgradeToastVisible,
                }));
            }, 8000);
            this.setState((prevState, props) => ({
                isUpgradeToastVisible: !prevState.isUpgradeToastVisible,
            }));
        }
    }

    async saveCoverToDatabase(values) {
        const userId = fire.auth().currentUser?.uid;
        if (!userId) throw new Error('Sign in before saving a cover letter.');
        await addCoverLetter(userId, values);
    }

    async saveToDatabase(event) {
        event !== undefined && event.preventDefault();
        const userId = fire.auth().currentUser?.uid;
        if (!userId) throw new Error('Sign in before saving a resume.');

        if (this.props.currentStep === 'Cover Filling') {
            // Generate currentCoverId if it doesn't exist
            if (localStorage.getItem('currentCoverId') === null) {
                localStorage.setItem('currentCoverId', Math.floor(Math.random() * 20000).toString() + 'xknd');
            }

            setJsonPb(localStorage.getItem('currentCoverId'), this.props.values);

            this.setState({ isSaving: true });
            let coverValues = {
                firstname: this.props.values.firstname,
                lastname: this.props.values.lastname,
                phone: this.props.values.phone,
                email: this.props.values.email,
                address: this.props.values.address,
                city: this.props.values.city,
                postalcode: this.props.values.postalcode,
                employerFullName: this.props.values.employerFullName,
                companyName: this.props.values.companyName,
                companyAddress: this.props.values.companyAddress,
                companyCity: this.props.values.companyCity,
                companyPostalCode: this.props.values.companyPostalCode,
                components: this.props.values.components,
                template: this.props.values.resumeName,
            };

            try {
                await this.saveCoverToDatabase(coverValues);
                this.ShowToast('Success');

                // Refresh the cover list in dashboard if needed
                if (this.props.onCoverSaved) {
                    this.props.onCoverSaved();
                }
            } catch (error) {
                console.error('Error saving cover letter:', error);
                // Optionally show error toast
            }

            setTimeout(() => {
                this.setState({ isSaving: false, showSavedIcon: true });
                setTimeout(() => {
                    this.setState({ showSavedIcon: false });
                }, 3000);
            }, 1500);
        } else {
            var numberOfInputs = 0;
            this.setState({ isSaving: true });
            if (!localStorage.getItem('currentResumeItem')) {
                this.currentResume = {};
                if (userId !== null) {
                    await addOneToNumberOfDocumentsGenerated(userId);
                }
            } else {
                this.currentResume = JSON.parse(localStorage.getItem('currentResumeItem'));
            }

            if (localStorage.getItem('currentResumeId') === null) {
                localStorage.setItem('currentResumeId', Math.floor(Math.random() * 20000).toString() + 'xknd');
            }
            const resumeId = localStorage.getItem('currentResumeId');
            setJsonPb(resumeId, this.props.values);
            setResumePropertyPerUser(userId, resumeId, 'pbId', resumeId);
            setResumePropertyPerUser(userId, resumeId, 'template', this.props.values.resumeName);
            setResumePropertyPerUser(userId, resumeId, 'title', this.props.values.title);

            setTimeout(() => {
                if (fire.auth().currentUser?.uid !== userId || localStorage.getItem('currentResumeId') !== resumeId) return;
                if (this.currentResume.firstname !== this.props.values.firstname || this.currentResume.firstname == undefined) {
                    console.log('Firstname need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'firstname', this.props.values.firstname);
                }
                if (this.currentResume.lastname !== this.props.values.lastname || this.currentResume.lastname == undefined) {
                    console.log('Lastname need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'lastname', this.props.values.lastname);
                }
                if (this.currentResume.email !== this.props.values.email || this.currentResume.email == undefined) {
                    console.log('Email need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'email', this.props.values.email);
                }
                if (this.currentResume.phone !== this.props.values.phone || this.currentResume.phone == undefined) {
                    console.log('Phone need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'phone', this.props.values.phone);
                }
                if (this.currentResume.occupation !== this.props.values.occupation || this.currentResume.occupation == undefined) {
                    console.log('Occupation need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'occupation', this.props.values.occupation);
                }
                if (this.currentResume.country !== this.props.values.country || this.currentResume.country == undefined) {
                    console.log('Country need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'country', this.props.values.country);
                }
                if (this.currentResume.city !== this.props.values.city || this.currentResume.city == undefined) {
                    console.log('City need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'city', this.props.values.city);
                }
                if (this.currentResume.address !== this.props.values.address || this.currentResume.address == undefined) {
                    console.log('Address need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'address', this.props.values.address);
                }
                if (this.currentResume.postalcode !== this.props.values.postalcode || this.currentResume.postalcode == undefined) {
                    console.log('Postal code need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'postalcode', this.props.values.postalcode);
                }
                if (this.currentResume.dateofbirth !== this.props.values.dateofbirth || this.currentResume.dateofbirth == undefined) {
                    console.log('Date of birth need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'dateofbirth', this.props.values.dateofbirth);
                }
                if (this.currentResume.drivinglicense !== this.props.values.drivinglicense || this.currentResume.drivinglicense == undefined) {
                    console.log('Driving license need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'drivinglicense', this.props.values.drivinglicense);
                }
                if (this.currentResume.nationality !== this.props.values.nationality || this.currentResume.nationality == undefined) {
                    console.log('Nationality need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'nationality', this.props.values.nationality);
                }
                if (this.currentResume.summary !== this.props.values.summary || this.currentResume.summary == undefined) {
                    console.log('Summary need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'summary', this.props.values.summary);
                }

                // Save colors to database
                if (this.currentResume.colors !== this.props.values.colors || this.currentResume.colors == undefined) {
                    console.log('Colors need to be changed in database');
                    setResumePropertyPerUser(userId, resumeId, 'colors', this.props.values.colors);
                }

                addEmployments(userId, resumeId, this.props.values.employments);
                addEducations(userId, resumeId, this.props.values.educations);
                addSkills(userId, resumeId, this.props.values.skills);
                addLanguages(userId, resumeId, this.props.values.languages);

                getResumeById(userId, resumeId).then((data) => {
                    if (fire.auth().currentUser?.uid !== userId || localStorage.getItem('currentResumeId') !== resumeId) return;
                    if (data != null) {
                        localStorage.setItem(
                            'currentResumeItem',
                            JSON.stringify({
                                id: resumeId,
                                item: data,
                                employments: data.employments,
                                educations: data.educations,
                                skills: data.skills,
                                languages: data.languages,
                            })
                        );
                    }
                });
            }, 1000);

            setJsonPb(resumeId, this.props.values);
            this.ShowToast('Success');

            setTimeout(() => {
                this.setState({ isSaving: false, showSavedIcon: true });
                setTimeout(() => {
                    this.setState({ showSavedIcon: false });
                }, 3000);
            }, 1500);
        }
    }

    render() {
        const { t } = this.props;
        const currentColors = this.props.values?.colors || {};
        const primaryColor = currentColors.primary || '#000000';
        const secondaryColor = currentColors.secondary || '#3d3e42';

        // Define which templates support color customization
        const templatesWithColorSupport = ['Cv1', 'Cv2', 'Cv3', 'Cv4', 'Cv5', 'Cv6'];
        const currentTemplate = this.props.values?.resumeName || this.props.currentResumeName;
        const supportsColors = templatesWithColorSupport.includes(currentTemplate);

        return (
            <div className="min-h-screen relative overflow-hidden">
                {/* Enhanced Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/30"></div>

                {/* Floating Decorative Elements */}
                <div className="absolute inset-0 -z-10 pointer-events-none">
                    <div className="absolute top-20 left-10 w-80 h-80 bg-[#4a6cf7]/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }}></div>
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#6a3ff7]/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }}></div>
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#4a6cf7]/8 rounded-full blur-2xl animate-pulse"
                        style={{ animationDuration: '8s', animationDelay: '2s' }}></div>
                    <div className="absolute top-10 right-1/4 w-48 h-48 bg-[#4a6cf7]/8 rounded-full blur-xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '0.5s' }}></div>
                    <div className="absolute bottom-10 left-1/4 w-32 h-32 bg-[#6a3ff7]/8 rounded-full blur-lg animate-pulse" style={{ animationDuration: '7s', animationDelay: '1.5s' }}></div>
                </div>

                {/* Gradient overlay for depth */}
                <div className="absolute inset-0 bg-[#f8f8f8]"></div>

                {/* Toast Notifications */}
                <AnimatePresence>
                    {this.state.isSuccessToastVisible && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            className="fixed top-6 right-6 z-50">
                            <Toasts type="Success" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {this.state.isDownloadToastVisible && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            className="fixed top-6 right-6 z-50">
                            <Toasts type="Download" />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {this.state.isUpgradeToastVisible && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            className="fixed top-6 right-6 z-50">
                            <Toasts type="Upgrade" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Color Customization Panel - Only show for templates that support colors */}
                <AnimatePresence>
                    {this.state.showColorPanel && supportsColors && (
                        <motion.div
                            initial={{ opacity: 0, x: 300 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 300 }}
                            transition={{ duration: 0.3 }}
                            className="fixed top-20 right-6 z-40 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 w-80">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                                    <FaPalette className="mr-2 text-[#4a6cf7]" />
                                    Customize Colors
                                </h3>
                                <button onClick={this.toggleColorPanel} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Primary Color Picker */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="color"
                                            value={primaryColor}
                                            onChange={(e) => this.handleColorChange('primary', e.target.value)}
                                            className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer shadow-sm"
                                        />
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={primaryColor}
                                                onChange={(e) => this.handleColorChange('primary', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                                placeholder="#000000"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Secondary Color Picker */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="color"
                                            value={secondaryColor}
                                            onChange={(e) => this.handleColorChange('secondary', e.target.value)}
                                            className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer shadow-sm"
                                        />
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={secondaryColor}
                                                onChange={(e) => this.handleColorChange('secondary', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
                                                placeholder="#3d3e42"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Color Presets */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Popular Colors</label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {['#000000', '#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#4338ca', '#16a34a'].map((color) => (
                                            <button
                                                key={color}
                                                onClick={() => this.handleColorChange('primary', color)}
                                                className={`w-10 h-10 rounded-lg border-2 transition-all ${
                                                    primaryColor === color ? 'border-gray-400 scale-110' : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                                style={{ backgroundColor: color }}
                                                title={color}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-500">Changes are applied in real-time to your resume preview.</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="relative z-10 p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Main Content */}
                        <div className="flex flex-col items-center justify-center max-h-[calc(90vh)] min-h-[calc(90vh)] px-4">
                            {/* Header Section */}
                            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
                                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#4a6cf7]/20 to-[#6a3ff7]/20 text-[#4a6cf7] px-4 py-2 rounded-full text-sm font-semibold mb-4 backdrop-blur-sm border border-[#4a6cf7]/30">
                                    <FaEye className="w-4 h-4" />
                                    RESUME PREVIEW
                                </div>
                            </motion.div>

                            {/* Resume Preview Container */}
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="w-full max-w-lg mx-auto mb-8">
                                <div className="relative">
                                    {/* Multiple layered glow effects */}
                                    {/* <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-indigo-500/20 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition-opacity duration-500"></div>
                                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/15 to-purple-500/15 rounded-3xl blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-700"></div>
                                    
                  */}

                                    {/* Main preview container */}
                                    <div
                                        id="Resume"
                                        className="relative bg-white/95 backdrop-blur-sm w-[470px] h-[700px] mx-auto overflow-hidden overflow-y-scroll rounded-3xl shadow-md border border-white/20 transition-all duration-500"
                                        style={{
                                            paddingRight: '17px',
                                            boxSizing: 'content-box',
                                        }}>
                                        {/* Shine effect */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-shine pointer-events-none rounded-3xl"></div>

                                        {/* Content */}
                                        <div className="transform-gpu origin-top scale-[0.625] relative -left-[90px] ">
                                            <Canvas
                                                setToFirstPage={this.setToFirstPage}
                                                currentResumeName={this.props.currentResumeName}
                                                initialisePages={this.initialisePages}
                                                currentPage={this.state.currentPage}
                                                pages={this.state.page}
                                                addPage={this.addPage}
                                                previousPage={this.removePage}
                                                downloadEnded={this.downloadEnded}
                                                triggerDownload={this.state.triggerDownload}
                                                values={this.props.values}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Action Controls */}
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} className="w-full max-w-4xl mx-auto">
                                <div className="bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-xl shadow-sm p-4">
                                    <div className="flex items-center justify-center gap-3 flex-wrap">
                                        {/* Template Selection */}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                this.props.handleTemplateShow();
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:border-[#4a6cf7] rounded-lg text-sm font-medium text-gray-700 hover:text-[#4a6cf7] transition-all duration-200 shadow-sm hover:shadow-md">
                                            <FaPalette className="w-4 h-4" />
                                            <span>{t('form.selectTemplate')}</span>
                                        </motion.button>

                                        {/* Color Customization Button - Only show for templates that support colors */}
                                        {supportsColors && (
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={this.toggleColorPanel}
                                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                                                    this.state.showColorPanel
                                                        ? 'bg-[#4a6cf7] text-white border border-[#4a6cf7]'
                                                        : 'bg-white border border-gray-300 text-gray-700 hover:border-[#4a6cf7] hover:text-[#4a6cf7]'
                                                }`}>
                                                <div className="w-3 h-3 rounded-sm border border-white/50" style={{ backgroundColor: primaryColor }} />
                                                <span>Colors</span>
                                            </motion.button>
                                        )}

                                        {/* Divider - Only show when color picker is available */}
                                        {supportsColors && <div className="h-6 w-px bg-gray-300"></div>}

                                        {/* Save Button */}
                                        {fire.auth().currentUser?.uid && (
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={(event) => this.saveToDatabase(event)}
                                                disabled={this.state.isSaving}
                                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                                                    this.state.isSaving
                                                        ? 'bg-gray-400 text-white cursor-not-allowed border border-gray-400'
                                                        : 'bg-green-500 hover:bg-green-600 text-white border border-green-500'
                                                }`}>
                                                {this.state.isSaving ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                        <span>Saving...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <FaSave className="w-4 h-4" />
                                                        <span>{t('form.save')}</span>
                                                    </>
                                                )}
                                            </motion.button>
                                        )}

                                        {/* Download Button */}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => this.startDownload()}
                                            disabled={this.state.isSaving}
                                            className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm hover:shadow-md ${
                                                this.state.isSaving
                                                    ? 'bg-gray-400 text-white cursor-not-allowed border border-gray-400'
                                                    : 'bg-[#4a6cf7] hover:bg-[#3d5af5] text-white border border-[#4a6cf7]'
                                            }`}>
                                            <FaDownload className="w-4 h-4" />
                                            <span>{t('form.download')}</span>
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </div>

                {/* Custom Scrollbar and Animation Styles */}
                <style jsx>{`
                    #Resume::-webkit-scrollbar {
                        width: 0;
                        background: transparent;
                    }

                    @keyframes gradient-x {
                        0%,
                        100% {
                            background-size: 200% 200%;
                            background-position: left center;
                        }
                        50% {
                            background-size: 200% 200%;
                            background-position: right center;
                        }
                    }

                    .animate-gradient-x {
                        animation: gradient-x 3s ease infinite;
                    }

                    @keyframes shine {
                        0% {
                            transform: translateX(-100%) translateY(-100%) rotate(30deg);
                        }
                        100% {
                            transform: translateX(100%) translateY(100%) rotate(30deg);
                        }
                    }

                    .animate-shine {
                        animation: shine 3s ease-in-out infinite;
                        animation-delay: 2s;
                    }
                `}</style>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(BoardFilling);
export default MyComponent;
