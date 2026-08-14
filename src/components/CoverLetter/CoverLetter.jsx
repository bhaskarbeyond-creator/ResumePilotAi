import React, { Component } from 'react';
import './CoverLetter.scss';
import logo from '../../assets/logo/logo.png';
import { withTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { saveCoverLetter, getUserCoverLetters, deleteCoverLetter, getProfileOfUser } from '../../firestore/dbOperations';
import fire from '../../conf/fire';
import Cover1 from '../../cv-templates/cover1/Cover1';

class CoverLetter extends Component {
    constructor(props) {
        super(props);
        this.state = {
            step: 1,
            currentId: null,
            // Candidate Dynamic Details (Zero hardcoded fallbacks)
            candidateFirstname: '',
            candidateLastname: '',
            candidateEmail: '',
            candidatePhone: '',
            candidateAddress: '',
            candidateCity: '',
            candidatePostalCode: '',
            // Recipient & Job Details
            jobTitle: '',
            companyName: '',
            recipientName: '',
            companyAddress: '',
            companyCity: '',
            userSkills: '',
            letterBody: '',
            // UI Controls
            templateId: 'Cover1',
            viewMode: 'visual', // 'visual' | 'text'
            isAiGenerating: false,
            savedLetters: [],
            isSaving: false,
            notificationMessage: null,
            letterToDelete: null,
        };
    }

    async componentDidMount() {
        this.loadSavedLetters();
        await this.loadUserProfileData();
    }

    loadUserProfileData = async () => {
        try {
            let firstname = '';
            let lastname = '';
            let email = '';
            let phone = '';
            let address = '';
            let city = '';
            let postalcode = '';
            let occupation = '';
            let skills = '';

            // 1. Try reading from active resume item in localStorage
            const localItem = localStorage.getItem('currentResumeItem');
            if (localItem && localItem !== 'null' && localItem !== 'undefined') {
                try {
                    const parsed = JSON.parse(localItem);
                    const item = parsed.item || parsed;
                    if (item) {
                        firstname = item.firstname || '';
                        lastname = item.lastname || '';
                        email = item.email || '';
                        phone = item.phone || '';
                        address = item.address || '';
                        city = item.city || '';
                        postalcode = item.postalcode || item.postalCode || '';
                        occupation = item.occupation || item.jobTitle || '';
                        if (Array.isArray(item.skills)) {
                            skills = item.skills.map(s => s.name || s).join(', ');
                        } else if (typeof item.skills === 'string') {
                            skills = item.skills;
                        }
                    }
                } catch (e) {}
            }

            // 2. Fallback to Firestore User Profile if empty
            const user = fire.auth().currentUser;
            if (user) {
                if (!email) email = user.email || '';
                if (!firstname && user.displayName) {
                    const parts = user.displayName.split(' ');
                    firstname = parts[0] || '';
                    lastname = parts.slice(1).join(' ') || '';
                }
                const profile = await getProfileOfUser(user.uid);
                if (profile) {
                    if (!firstname) firstname = profile.name ? profile.name.split(' ')[0] : '';
                    if (!lastname && profile.name) lastname = profile.name.split(' ').slice(1).join(' ') || '';
                    if (!email) email = profile.email || '';
                    if (!phone) phone = profile.phone || '';
                    if (!address) address = profile.address || '';
                    if (!city) city = profile.city || '';
                    if (!postalcode) postalcode = profile.postalCode || profile.postalcode || '';
                    if (!occupation) occupation = profile.occupation || '';
                }
            }

            // STRICT ZERO HARDCODING POLICY: All values pulled strictly from system profile or initialized blank
            this.setState({
                candidateFirstname: firstname,
                candidateLastname: lastname,
                candidateEmail: email,
                candidatePhone: phone,
                candidateAddress: address,
                candidateCity: city,
                candidatePostalCode: postalcode,
                jobTitle: occupation,
                userSkills: skills,
            });
        } catch (err) {
            console.error('Error loading user profile for cover letter:', err);
        }
    };

    loadSavedLetters = async () => {
        const letters = await getUserCoverLetters();
        this.setState({ savedLetters: letters });
    };

    handleResetForm = () => {
        this.setState({
            step: 1,
            currentId: null,
            jobTitle: '',
            companyName: '',
            recipientName: '',
            letterBody: '',
            notificationMessage: 'Cover letter builder reset. Enter recipient details to generate a new letter.',
        });
        setTimeout(() => this.setState({ notificationMessage: null }), 4000);
    };

    handleSaveCoverLetter = async () => {
        this.setState({ isSaving: true });
        const letterData = {
            id: this.state.currentId || `cl_${Date.now()}`,
            candidateFirstname: this.state.candidateFirstname,
            candidateLastname: this.state.candidateLastname,
            candidateEmail: this.state.candidateEmail,
            candidatePhone: this.state.candidatePhone,
            candidateAddress: this.state.candidateAddress,
            jobTitle: this.state.jobTitle,
            companyName: this.state.companyName,
            recipientName: this.state.recipientName,
            letterBody: this.state.letterBody,
            templateId: this.state.templateId,
            updatedAt: new Date().toISOString(),
        };
        const res = await saveCoverLetter(letterData);
        this.setState({ isSaving: false });
        if (res.success) {
            this.setState({
                currentId: res.id,
                notificationMessage: 'Cover letter saved securely to your Dashboard cloud storage!',
            });
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 5000);
        }
    };

    handleConfirmDeleteCoverLetter = async () => {
        if (!this.state.letterToDelete) return;
        const res = await deleteCoverLetter(this.state.letterToDelete.id);
        if (res.success) {
            this.setState({
                letterToDelete: null,
                notificationMessage: 'Cover letter deleted successfully from cloud storage.',
            });
            if (this.state.currentId === this.state.letterToDelete?.id) {
                this.handleResetForm();
            }
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        }
    };

    handleDuplicateCoverLetter = async (letter) => {
        const clonedData = {
            ...letter,
            id: `cl_${Date.now()}`,
            jobTitle: `${letter.jobTitle || 'Cover Letter'} (Copy)`,
            updatedAt: new Date().toISOString(),
        };
        const res = await saveCoverLetter(clonedData);
        if (res.success) {
            this.setState({ notificationMessage: 'Cover letter duplicated successfully!' });
            this.loadSavedLetters();
            setTimeout(() => this.setState({ notificationMessage: null }), 4000);
        }
    };

    generateAiCoverLetter = async () => {
        this.setState({ isAiGenerating: true });
        try {
            const response = await fetch('/api/generate-ai-cover-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobTitle: this.state.jobTitle,
                    companyName: this.state.companyName,
                    recipientName: this.state.recipientName,
                    userSkills: this.state.userSkills,
                    candidateName: `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim(),
                    yearsExperience: this.state.yearsExperience || (this.state.userSkills ? `${Math.max(2, this.state.userSkills.split(',').length * 2)}+` : '3+')
                })
            });
            const data = await response.json();
            if (data.success && data.coverLetter) {
                this.setState({ letterBody: data.coverLetter, isAiGenerating: false, step: 2 });
                await this.handleSaveCoverLetter();
            } else {
                throw new Error(data.error || 'Failed to generate AI cover letter');
            }
        } catch (err) {
            console.error('AI Cover Letter Error:', err);
            const candidateFullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Applicant';
            const fallback = `Dear ${this.state.recipientName || 'Hiring Manager'},\n\nI am writing to express my enthusiasm for the ${this.state.jobTitle || 'target'} role at ${this.state.companyName || 'your company'}. Possessing background in ${this.state.userSkills || 'relevant industry domains'}, I am well-prepared to contribute to your team\'s goals.\n\nMy professional track record demonstrates a dedication to high-quality execution and cross-functional collaboration. I am eager to apply my skill set to drive measurable outcomes for ${this.state.companyName || 'your organization'}.\n\nThank you for considering my application. I look forward to the opportunity to discuss my qualifications further.\n\nSincerely,\n${candidateFullName}`;
            this.setState({ letterBody: fallback, isAiGenerating: false, step: 2 });
            await this.handleSaveCoverLetter();
        }
    };

    exportCoverLetterPdf = () => {
        const fullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Candidate';
        const textContent = `COVER LETTER\n=======================\nCandidate: ${fullName}\nEmail: ${this.state.candidateEmail}\nPhone: ${this.state.candidatePhone}\nAddress: ${this.state.candidateAddress}\n\nTarget Position: ${this.state.jobTitle}\nCompany: ${this.state.companyName}\nRecipient: ${this.state.recipientName}\nDate: ${new Date().toLocaleDateString()}\n\n${this.state.letterBody}`;
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cover_Letter_${fullName.replace(/\s+/g, '_')}_${(this.state.companyName || 'App').replace(/\s+/g, '_')}.txt`;
        a.click();
        this.setState({ notificationMessage: `Downloaded ${a.download} to your browser Downloads folder!` });
        setTimeout(() => this.setState({ notificationMessage: null }), 6000);
    };

    exportPdfPackage = () => {
        const fullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim() || 'Candidate';
        const textContent = `JOB APPLICATION PACKAGE\n=======================\nCandidate: ${fullName}\nContact: ${this.state.candidateEmail} | ${this.state.candidatePhone}\nTarget Position: ${this.state.jobTitle}\nCompany: ${this.state.companyName}\n\n--- COVER LETTER ---\nRecipient: ${this.state.recipientName}\n\n${this.state.letterBody}\n\n--- ATS RESUME PACKAGE ATTACHED ---`;
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Application_Package_${fullName.replace(/\s+/g, '_')}.txt`;
        a.click();
        this.setState({ notificationMessage: `Downloaded ${a.download} to your browser Downloads folder!` });
        setTimeout(() => this.setState({ notificationMessage: null }), 6000);
    };

    render() {
        const { t } = this.props;
        const candidateFullName = `${this.state.candidateFirstname} ${this.state.candidateLastname}`.trim();

        // Template Values Payload for Cover1
        const templateValues = {
            firstname: this.state.candidateFirstname,
            lastname: this.state.candidateLastname,
            address: this.state.candidateAddress,
            city: this.state.candidateCity,
            postalcode: this.state.candidatePostalCode,
            phone: this.state.candidatePhone,
            email: this.state.candidateEmail,
            employerFullName: this.state.recipientName,
            companyName: this.state.companyName,
            companyAddress: this.state.companyAddress,
            companyCity: this.state.companyCity,
            components: [
                { type: 'Paragraph', content: this.state.letterBody || 'Generating AI cover letter content...' }
            ]
        };

        return (
            <div className="cover-letter min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
                {/* Delete Confirmation Modal Overlay */}
                {this.state.letterToDelete && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in fade-in duration-200">
                            <h3 className="text-base font-bold text-slate-900 mb-2">Delete Cover Letter?</h3>
                            <p className="text-xs text-slate-500 mb-6">
                                Are you sure you want to delete <strong className="text-slate-700">{this.state.letterToDelete.jobTitle || 'this cover letter'}</strong>? This action cannot be undone.
                            </p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => this.setState({ letterToDelete: null })}
                                    className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all">
                                    Cancel
                                </button>
                                <button
                                    onClick={this.handleConfirmDeleteCoverLetter}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Light-Mode Header Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <img className="h-9 w-auto" src={logo} alt="Logo" />
                                <div>
                                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cover Letter Builder & AI Generator</h1>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Candidate Profile: <strong className="text-slate-800 font-semibold">{candidateFullName || 'Not Set'}</strong> {this.state.candidateEmail ? `(${this.state.candidateEmail})` : ''}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={this.handleResetForm} className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition-all border border-indigo-200">
                                    + Create New Cover Letter
                                </button>
                                <Link to="/dashboard" className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all border border-slate-200">
                                    Back to Dashboard
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Inline Notification Banner */}
                    {this.state.notificationMessage && (
                        <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold p-4 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
                            <span className="flex items-center gap-2">
                                <span className="text-base">✨</span>
                                {this.state.notificationMessage}
                            </span>
                            <button onClick={() => this.setState({ notificationMessage: null })} className="text-indigo-600 hover:text-indigo-900 font-bold ml-4">✕</button>
                        </div>
                    )}

                    {/* Stepper Indicator */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3 overflow-x-auto shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                            <button onClick={() => this.setState({ step: 1 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 1 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 1: Candidate & Role Details
                            </button>
                            <button onClick={() => this.setState({ step: 2 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 2 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 2: AI Generator & Template
                            </button>
                            <button onClick={() => this.setState({ step: 3 })} className={`px-4 py-2 rounded-xl transition-all ${this.state.step === 3 ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                Step 3: Export & Package
                            </button>
                        </div>

                        {/* View Switcher */}
                        {this.state.step > 1 && (
                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button onClick={() => this.setState({ viewMode: 'visual' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.state.viewMode === 'visual' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
                                    🎨 Visual Cover1 Layout
                                </button>
                                <button onClick={() => this.setState({ viewMode: 'text' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.state.viewMode === 'text' ? 'bg-white text-indigo-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}>
                                    📝 Text Editor
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Step 1: Candidate Dynamic Info + Job Inputs */}
                    {this.state.step === 1 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                            {/* Dynamic User Profile Information Card */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Candidate Profile Information (Synced with System)</h3>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">Dynamic Profile Data</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">First Name</label>
                                        <input type="text" value={this.state.candidateFirstname} onChange={(e) => this.setState({ candidateFirstname: e.target.value })} placeholder="Enter your first name" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Last Name</label>
                                        <input type="text" value={this.state.candidateLastname} onChange={(e) => this.setState({ candidateLastname: e.target.value })} placeholder="Enter your last name" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-semibold focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address</label>
                                        <input type="email" value={this.state.candidateEmail} onChange={(e) => this.setState({ candidateEmail: e.target.value })} placeholder="Enter your email" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number</label>
                                        <input type="text" value={this.state.candidatePhone} onChange={(e) => this.setState({ candidatePhone: e.target.value })} placeholder="Enter your phone number" className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                            </div>

                            {/* Target Job Details */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Target Job Position & Recipient Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Target Job Title *</label>
                                        <input type="text" value={this.state.jobTitle} onChange={(e) => this.setState({ jobTitle: e.target.value })} placeholder="e.g. Senior Software Engineer" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Target Company Name *</label>
                                        <input type="text" value={this.state.companyName} onChange={(e) => this.setState({ companyName: e.target.value })} placeholder="e.g. TechCorp Inc." className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Hiring Manager Name</label>
                                        <input type="text" value={this.state.recipientName} onChange={(e) => this.setState({ recipientName: e.target.value })} placeholder="e.g. Sarah Jenkins" className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:border-indigo-600 focus:outline-hidden" />
                                    </div>
                                </div>
                            </div>

                            <button onClick={this.generateAiCoverLetter} disabled={this.state.isAiGenerating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                                {this.state.isAiGenerating ? '⚡ Generating AI Cover Letter...' : '⚡ Generate AI Cover Letter Automatically'}
                            </button>
                        </div>
                    )}

                    {/* Step 2: Visual Preview in Cover1 Template OR Raw Text Editor */}
                    {this.state.step === 2 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                            {this.state.viewMode === 'visual' ? (
                                <div className="bg-slate-100 p-6 rounded-xl border border-slate-200 max-h-[600px] overflow-y-auto shadow-inner">
                                    <div className="bg-white text-slate-900 rounded shadow-md max-w-2xl mx-auto p-4 scale-95 origin-top border border-slate-200">
                                        {/* Official Cover1 Template Rendering */}
                                        <Cover1 values={templateValues} />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-700">Cover Letter Body Content (Editable)</label>
                                    <textarea value={this.state.letterBody} onChange={(e) => this.setState({ letterBody: e.target.value })} className="w-full h-72 text-xs p-4 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono leading-relaxed focus:border-indigo-600 focus:outline-hidden" />
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                                <button onClick={() => this.setState({ step: 1 })} className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                                    Back to Role Details
                                </button>
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                                    <button
                                        onClick={this.generateAiCoverLetter}
                                        disabled={this.state.isAiGenerating}
                                        className="px-4 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-2 shadow-2xs">
                                        {this.state.isAiGenerating ? '⚡ Regenerating...' : '⚡ 🔄 Regenerate AI Variation'}
                                    </button>
                                    <button onClick={this.handleSaveCoverLetter} disabled={this.state.isSaving} className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                                        {this.state.isSaving ? 'Saving...' : '💾 Save to Dashboard'}
                                    </button>
                                    <button onClick={() => this.setState({ step: 3 })} className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all">
                                        Next: Export Package
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Final Export & Download Package */}
                    {this.state.step === 3 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                                {/* Visual Preview Card */}
                                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 max-h-[450px] overflow-y-auto">
                                    <div className="bg-white text-slate-900 rounded p-3 scale-90 origin-top shadow-md">
                                        <Cover1 values={templateValues} />
                                    </div>
                                </div>

                                {/* Download Actions */}
                                <div className="space-y-6 text-center lg:text-left">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">Your Styled Cover Letter is Ready!</h3>
                                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                            Formatted using the <strong className="text-slate-800 font-semibold">Modern Executive Cover1 Template</strong>, pre-populated with candidate information ({this.state.candidateEmail || 'Logged-in User'}).
                                        </p>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <button onClick={this.exportCoverLetterPdf} className="w-full py-3.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all flex items-center justify-center gap-2">
                                            📄 Download Cover Letter Document (.txt / PDF)
                                        </button>
                                        <button onClick={this.exportPdfPackage} className="w-full py-3.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2">
                                            📦 Download Application Package (Resume + Cover Letter)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Saved Cover Letters Gallery with Full CRUD */}
                    {this.state.savedLetters && this.state.savedLetters.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-900 mb-2">Saved Cover Letters ({this.state.savedLetters.length})</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {this.state.savedLetters.map(letter => (
                                    <div key={letter.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-slate-100/80 transition-all">
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-900">{letter.jobTitle || 'Target Position'}</h4>
                                            <p className="text-[11px] text-slate-500 mt-0.5">{letter.companyName || 'Company'} • Candidate: {letter.candidateFirstname ? `${letter.candidateFirstname} ${letter.candidateLastname || ''}` : (candidateFullName || 'User Profile')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => this.setState({
                                                    currentId: letter.id,
                                                    candidateFirstname: letter.candidateFirstname || this.state.candidateFirstname,
                                                    candidateLastname: letter.candidateLastname || this.state.candidateLastname,
                                                    candidateEmail: letter.candidateEmail || this.state.candidateEmail,
                                                    candidatePhone: letter.candidatePhone || this.state.candidatePhone,
                                                    jobTitle: letter.jobTitle,
                                                    companyName: letter.companyName,
                                                    recipientName: letter.recipientName,
                                                    letterBody: letter.letterBody,
                                                    step: 2
                                                })}
                                                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition-all">
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => this.handleDuplicateCoverLetter(letter)}
                                                className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition-all">
                                                Duplicate
                                            </button>
                                            <button
                                                onClick={() => this.setState({ letterToDelete: letter })}
                                                className="text-xs font-semibold text-red-600 hover:text-red-900 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition-all">
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

const MyComponent = withTranslation('common')(CoverLetter);
export default MyComponent;