import React, { Component } from 'react';
import './Welcome.scss';
import LoaderAnimation from '../../assets/animations/lottie-loader.json';
import Board from '../Boards/board/board';
import Action from '../Actions/action/Action';
import { Analytics } from '../Analytics';
import MetaManager from '../MetaManager/MetaManager';
// Models
import EmploymentModel from '../../models/Employment';
import EducationModel from '../../models/Education';
import LanguageModel from '../../models/Language';
import SkillModel from '../../models/Skills';
// Images
import PreviewImg from '../../assets/preview.png';
import NextImg from '../../assets/next.png';
import { IoClose } from 'react-icons/io5';
import { RxHamburgerMenu } from 'react-icons/rx';
// Firease
import fire from '../../conf/fire';
import signOutUser from '../../utils/signOut';
import { InitialisationCheck, getPages, getWebsiteData, getSubscriptionStatus } from '../../services/api/platform';
import { getUserMembership } from '../../data/entitlements';
import { parseSafeDate } from '../../utils/subscriptionUtils';
// Initialisation Component
import InitialisationWrapper from '../initailisation/initialisationWrapper/initialisationWrapper';
/// Animation Library
import { motion, AnimatePresence } from 'framer-motion';
import i18n from '../../i18n';
import AuthWrapper from '../auth/authWrapper/AuthWrapper';
import { Link } from 'react-router-dom';
import ResumesSelector from '../Actions/ResumesSelector/ResumesSelector';

class Welcome extends Component {
    constructor(props) {
        super(props);

        this._isMounted = false;
        this._authGeneration = 0;
        this._activeUserUid = null;
        this.unsubscribeAuth = null;

        // Configuration constants
        this.steps = ['Introduction', 'Template Selection', 'Adding Data', 'Cover Filling', 'Action Cover Selection', 'Action Cover Filling'];

        // Initialize current resume from local storage
        this.currentResume = this.getProcessedCurrentResume();

        // Bind methods
        this.bindMethods();

        // Initialize state
        this.state = this.getInitialState();

        // Initialize analytics
        this.initializeAnalytics();
    }

    // Helper for getting processed current resume from localStorage
    getProcessedCurrentResume() {
        let currentResume = null;
        try { currentResume = JSON.parse(localStorage.getItem('currentResumeItem')); }
        catch { localStorage.removeItem('currentResumeItem'); }

        if (currentResume !== null) {
            // Remove nulls from arrays in current resume
            ['employments', 'educations', 'languages', 'skills'].forEach((field) => {
                if (currentResume[field]) {
                    currentResume[field] = this.checkForNullsInArray(currentResume[field], null);
                }
            });
        }

        return currentResume;
    }

    // Bind all the methods to this
    bindMethods() {
        this.authListener = this.authListener.bind(this);
        this.nextStep = this.nextStep.bind(this);
        this.logout = this.logout.bind(this);
        this.handleInputs = this.handleInputs.bind(this);
        this.setCurrentStep = this.setCurrentStep.bind(this);
        this.handlePreviewToggle = this.handlePreviewToggle.bind(this);
        this.createNewEmploymentObject = this.createNewEmploymentObject.bind(this);
        this.createNewEducationObject = this.createNewEducationObject.bind(this);
        this.createNewSkillObject = this.createNewSkillObject.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.changeSelectedResume = this.changeSelectedResume.bind(this);
        this.stepBack = this.stepBack.bind(this);
        this.closeInitialisation = this.closeInitialisation.bind(this);
        this.checkForNullsInArray = this.checkForNullsInArray.bind(this);
        this.goThirdStep = this.goThirdStep.bind(this);
        this.handleLanguageClick = this.handleLanguageClick.bind(this);
        this.menuClose = this.menuClose.bind(this);
        this.menuOpen = this.menuOpen.bind(this);
        this.handleMenuLink = this.handleMenuLink.bind(this);
        this.authBtnHandler = this.authBtnHandler.bind(this);
        this.checkFullFields = this.checkFullFields.bind(this);
        this.removeEmployment = this.removeEmployment.bind(this);
        this.removeEducation = this.removeEducation.bind(this);
        this.removeLanguage = this.removeLanguage.bind(this);
        this.removeSkill = this.removeSkill.bind(this);
        this.checkLanguageFromDB = this.checkLanguageFromDB.bind(this);
        this.goCoverStep = this.goCoverStep.bind(this);
        this.handleCoverParagraphChange = this.handleCoverParagraphChange.bind(this);
        this.handleComponentDelete = this.handleComponentDelete.bind(this);
        this.handleParagraphAdd = this.handleParagraphAdd.bind(this);
        this.handleListAdd = this.handleListAdd.bind(this);
        this.handleListItemChange = this.handleListItemChange.bind(this);
        this.handleListAddItem = this.handleListAddItem.bind(this);
        this.handleListNameChange = this.handleListNameChange.bind(this);
        this.goToCoverSelection = this.goToCoverSelection.bind(this);
        this.goToResumeSelectionStep = this.goToResumeSelectionStep.bind(this);
        this.setFinalStep = this.setFinalStep.bind(this);
        this.resetNavigation = this.resetNavigation.bind(this);
        this.addSummary = this.addSummary.bind(this);
        this.handleTemplateShow = this.handleTemplateShow.bind(this);
        this.handleColorChange = this.handleColorChange.bind(this);

        this.wrapper = React.createRef();
    }

    // Initialize analytics
    initializeAnalytics() {
        var AnalyticsObject = Analytics;
        AnalyticsObject('Homepage');
    }

    // Get initial state
    getInitialState() {
        return {
            // Meta data
            metaDataFetched: false,
            websiteTitle: '',
            websiteDescription: '',
            websiteKeywords: '',
            websiteLanguage: 'English', // Language from database for SEO

            // Subscriptions
            subscriptionsStatus: null,
            membership: null,
            membershipEnds: null,

            // UI State
            mobilePreviewOn: false,
            fullFields: 0,
            isMobileTogglerShowed: true,
            isMenuShowed: false,
            isAuthShowed: !this.props.user && !fire.auth().currentUser && typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/login/'),
            language: 'en',
            stepIndex: 0,
            currentStep: 'Introduction',
            isInitialisationShowed: false,
            loaded: false,
            isSelectTemplateShowed: false,

            // User data
            user: null,

            redirect: null,

            // Resume data
            resumeName: this.getValueFromCurrentResume('template', 'Cover1'),
            currentResumeName: this.getValueFromCurrentResume('template', 'Cv1'),
            ratingOf: 0,
            currentResume: null,
            title: this.getValueFromCurrentResume('title', 'Untitled'),
            progress: 0,
            pages: [],

            // Personal information
            firstname: this.getValueFromCurrentResume('firstname', ''),
            lastname: this.getValueFromCurrentResume('lastname', ''),
            email: this.getValueFromCurrentResume('email', ''),
            phone: this.getValueFromCurrentResume('phone', ''),
            occupation: this.getValueFromCurrentResume('occupation', ''),
            country: this.getValueFromCurrentResume('country', ''),
            city: this.getValueFromCurrentResume('city', ''),
            address: this.getValueFromCurrentResume('address', ''),
            postalcode: this.getValueFromCurrentResume('postalcode', ''),
            dateofbirth: this.getValueFromCurrentResume('dateofbirth', ''),
            dateOfBirth: this.getValueFromCurrentResume('dateOfBirth', ''),
            drivinglicense: this.getValueFromCurrentResume('drivinglicense', ''),
            nationality: this.getValueFromCurrentResume('nationality', ''),
            gender: this.getValueFromCurrentResume('gender', ''),
            summary: this.getValueFromCurrentResume('summary', ''),
            motherTongue: this.getValueFromCurrentResume('motherTongue', ''),
            photo: null,

            // Resume sections
            employments: this.getArrayFromCurrentResume('employments', []),
            educations: this.getArrayFromCurrentResume('educations', []),
            languages: this.getArrayFromCurrentResume('languages', []),
            skills: this.getArrayFromCurrentResume('skills', []),

            // Cover letter info
            employerFullName: this.getValueFromCurrentResume('employerFullName', ''),
            companyName: this.getValueFromCurrentResume('companyName', ''),
            companyAddress: this.getValueFromCurrentResume('companyAddress', ''),
            companyCity: this.getValueFromCurrentResume('companyCity', ''),
            companyPostalCode: this.getValueFromCurrentResume('companyPostalCode', ''),

            filledInputs: [],
            trackingCode: '',
            template: this.getValueFromCurrentResume('template', 'Cover1'),

            // Cover Letter state
            components: this.getArrayFromCurrentResume('components', []),

            // Colors for resume customization
            colors: this.getValueFromCurrentResume('colors', this.getDefaultColorsForTemplate()),
        };
    }

    // Get default colors based on current template
    getDefaultColorsForTemplate() {
        const currentTemplate = this.getValueFromCurrentResume('template', 'Cv1');

        // Template-specific default colors
        const templateColors = {
            Cv1: { primary: '#000000', secondary: '#333333' },
            Cv2: { primary: '#f0c30e', secondary: '#f5f5f5' }, // Fixed to match template's natural colors
            Cv3: { primary: '#be8a95', secondary: '#000000' },
            Cv4: { primary: '#3d3e42', secondary: '#3d3e42' }, // Fixed to match template's natural colors
            Cv5: { primary: '#059669', secondary: '#2d3039' },
            Cv6: { primary: '#7c3aed', secondary: '#09043c' },
            // Add more templates as needed
        };

        return templateColors[currentTemplate] || { primary: '#000000', secondary: '#333333' };
    }

    // Helper method to get value from current resume
    getValueFromCurrentResume(field, defaultValue) {
        return this.currentResume !== null && this.currentResume.item && this.currentResume.item[field] !== undefined ? this.currentResume.item[field] : defaultValue;
    }

    // Helper method to get array from current resume
    getArrayFromCurrentResume(field, defaultValue) {
        return this.currentResume !== null && this.currentResume[field] !== undefined ? this.currentResume[field] : defaultValue;
    }

    // Removed empty componentWillReceiveProps and replaced with static method
    static getDerivedStateFromProps(nextProps, prevState) {
        if (prevState.language !== nextProps.languages) {
            return { language: nextProps.language };
        }
        return null;
    }

    resetAccountBuilderState(user = null) {
        this.currentResume = null;
        const clean = this.getInitialState();
        this.setState(current => ({
            ...clean,
            metaDataFetched: current.metaDataFetched,
            websiteTitle: current.websiteTitle,
            websiteDescription: current.websiteDescription,
            websiteKeywords: current.websiteKeywords,
            websiteLanguage: current.websiteLanguage,
            subscriptionsStatus: current.subscriptionsStatus,
            pages: current.pages,
            loaded: current.loaded,
            language: current.language,
            user,
            email: user?.email || '',
        }));
    }

    // Check user authentication status
    authListener() {
        this.unsubscribeAuth?.();
        this.unsubscribeAuth = fire.auth().onAuthStateChanged(async user => {
            const generation = ++this._authGeneration;
            if (!this._isMounted) return;
            const previousUid = this._activeUserUid;
            const nextUid = user?.uid || null;
            this._activeUserUid = nextUid;
            if (!user) {
                if (previousUid) this.resetAccountBuilderState(null);
                else this.setState({ user: null, email: '', membership: 'Basic', membershipEnds: null });
                try { localStorage.removeItem('user'); } catch { /* compatibility storage */ }
                return;
            }
            if (previousUid && previousUid !== nextUid) this.resetAccountBuilderState(user);
            // Reset account-derived fields before any asynchronous A → B transition work.
            this.setState({ user, email: user.email, membership: 'Basic', membershipEnds: null, isAuthShowed: false });
            try { localStorage.setItem('user', user.uid); } catch { /* compatibility storage */ }
            // Firebase Authentication is the suspension authority. The backend
            // verifies revoked/disabled sessions on every protected request;
            // no MariaDB profile field is used as an identity fallback here.
            await this.fetchUserMembership(user.uid, generation);
        });
    }

    // Fetch user membership information without allowing a previous account's response
    // to populate a newly authenticated account's builder.
    async fetchUserMembership(userId, generation) {
        try {
            const value = await getUserMembership(userId);
            if (!this._isMounted || generation !== this._authGeneration || fire.auth().currentUser?.uid !== userId) return;
            if (value && value.membership) {
                this.setState({ 
                    membership: value.membership, 
                    membershipEnds: parseSafeDate(value.membershipEnds) 
                });
            }
        } catch (error) {
            if (this._isMounted && generation === this._authGeneration) console.warn('Membership unavailable:', error.message);
        }
    }

    // Go to cover selection step
    // goToCoverSelection() {
    //     this.setState({ currentStep: 'Action Cover Selection' });
    // }

    // Logout functionality
    logout() {
        signOutUser();
        this.currentResume = null;
        this.setState({ user: null });
    }

    // Setting the current step
    setCurrentStep(_step, _isLoginModalShowed) {
        this.setState({
            currentStep: this.steps[0],
            stepIndex: 0,
        });
    }

    // Go to third step
    goThirdStep() {
        this.setState({
            currentStep: this.steps[2],
            stepIndex: 2,
        });
    }

    // Go to cover step
    goCoverStep() {
        this.setState({
            currentStep: this.steps[3],
            stepIndex: 3,
        });
    }

    // Remove null values from array
    checkForNullsInArray(array, elem) {
        var nullIndex = array.indexOf(elem);
        while (nullIndex > -1) {
            array.splice(nullIndex, 1);
            nullIndex = array.indexOf(elem);
        }
        return array;
    }

    // Check language from database
    async checkLanguageFromDB() {
        if (localStorage.getItem('preferredLanguage')) {
            this.handleLanguageClick(localStorage.getItem('preferredLanguage'));
            this.setState({ loaded: true });
        } else {
            try {
                const data = await getWebsiteData();
                if (data) {
                    this.setState({
                        metaDataFetched: true,
                        websiteTitle: data.title,
                        websiteDescription: data.description,
                        websiteKeywords: data.keywords,
                        websiteLanguage: data.language || 'English',
                        ratingOf: data.rating,
                    });

                    // Set language based on database setting
                    if (data.language != undefined) {
                        this.setLanguageFromData(data.language);
                    }
                }
            } catch (error) {
                console.warn('Error fetching website data for language:', error);
                // Set default language
                this.handleLanguageClick('en');
            } finally {
                this.setState({ loaded: true });
            }
        }
    }

    // Set language based on database setting
    setLanguageFromData(dataLanguage) {
        const languageMap = {
            Danish: 'dk',
            Swedish: 'se',
            Spanish: 'es',
            English: 'en',
            Russian: 'ru',
            French: 'fr',
            Portuguese: 'pt',
            German: 'de',
            Italian: 'it',
            Greek: 'gk',
            Icelandic: 'is',
            Norwegian: 'no',
            Polish: 'pl',
            Romanian: 'ro',
        };

        if (languageMap[dataLanguage]) {
            this.handleLanguageClick(languageMap[dataLanguage]);
        }
    }

    componentDidMount() {
        this._isMounted = true;
        this.fetchInitialData();
        this.initializeUserState();
    }

    componentWillUnmount() {
        this._isMounted = false;
        this._authGeneration += 1;
        this.unsubscribeAuth?.();
    }

    // Fetch initial data
    async fetchInitialData() {
        try {
            // Initialize auth listener first
            this.authListener();

            // Fetch pages with error handling
            const pages = await getPages();
            if (pages && Array.isArray(pages)) {
                this.setState({ pages });
            } else {
                this.setState({ pages: [] });
            }

            // Check language settings
            this.checkLanguageFromDB();

            // Get subscription status with error handling
            const subscriptionData = await getSubscriptionStatus();
            if (subscriptionData) {
                this.setState({ subscriptionsStatus: subscriptionData });
            }

            // Get website data if no language is set
            if (!localStorage.getItem('preferredLanguage')) {
                this.fetchWebsiteData();
            }

            // Check for initialization needs with error handling
            const initValue = await InitialisationCheck();
            if (initValue === 'none' || initValue === undefined) {
                this.setState({ isInitialisationShowed: true });
            }

            // Calculate filled fields
            this.checkFullFields();
        } catch (error) {
            console.error('Error during initial data fetch:', error);
            // Set safe defaults
            this.setState({ 
                pages: [],
                loaded: true,
                subscriptionsStatus: {
                    state: false,
                    monthlyPrice: 30,
                    quartarlyPrice: 60,
                    yearlyPrice: 120,
                    onlyPP: false,
                    currency: 'USD'
                }
            });
        }
    }

    // Initialize user state based on localStorage
    initializeUserState() {
        const pathname = window.location.pathname;

        // If explicitly visiting Homepage (/ or /front or /login), force Introduction step (Homepage)
        if (pathname === '/' || pathname === '/front' || pathname === '/login') {
            this.setState({
                currentStep: 'Introduction',
                stepIndex: 0,
                isAuthShowed: !this.props.user && !this.state.user && !fire.auth().currentUser && pathname === '/login',
            });
            return;
        }

        // Check URL parameters for cover letter creation
        const urlParams = new URLSearchParams(window.location.search);

        // Check for step parameter in URL
        const stepParam = urlParams.get('step');
        if (stepParam === 'Cover') {
            // Go directly to cover letter selection
            this.goToCoverSelection();
            return;
        }

        if (urlParams.get('createCover') === 'true') {
            // Go directly to cover letter selection for new cover creation
            this.goToCoverSelection();
            return;
        }

        // Check if current cover letter exists in localStorage
        if (localStorage.getItem('currentCoverItem')) {
            const currentCoverData = JSON.parse(localStorage.getItem('currentCoverItem'));

            this.setState({
                currentResume: currentCoverData,
            });

            // It's a cover letter - go to cover filling directly
            this.setState({
                currentStep: 'Cover Filling',
                stepIndex: 3,
            });
            return;
        }

        // Check if current resume exists in localStorage (only if on builder routes)
        if (localStorage.getItem('currentResumeItem')) {
            const currentResumeData = JSON.parse(localStorage.getItem('currentResumeItem'));

            this.setState({
                currentResume: currentResumeData,
            });

            // If we have an existing resume and on a builder path, skip template selection and go directly to filling
            if (currentResumeData.employments !== undefined) {
                // It's a resume - go to Adding Data step (step 2)
                this.setState({
                    currentStep: this.steps[2],
                    stepIndex: 2,
                });
            } else {
                // It's a cover letter - go to cover selection
                this.goToCoverSelection();
            }
        }

        // Check URL parameters for specific step
        if (this.props.match !== undefined && this.props.match.params.step !== undefined) {
            this.setState({ currentStep: this.steps[2] });
        }
    }

    // Fetch website data
    fetchWebsiteData() {
        getWebsiteData()
            .then((data) => {
                if (data !== undefined) {
                    this.setState({
                        metaDataFetched: true,
                        websiteTitle: data.title,
                        websiteDescription: data.description,
                        websiteKeywords: data.keywords,
                        websiteLanguage: data.language || 'English',
                        trackingCode: data.trackingCode !== undefined ? data.trackingCode : '',
                    });

                    // Get subscription status
                    getSubscriptionStatus()
                        .then((val) => {
                            this.setState({ subscriptionsStatus: val });
                        })
                        .catch((error) => console.log(error));

                    // Set language
                    this.handleLanguageClick(data.language !== undefined ? data.language : 'en');
                }
            })
            .catch((error) => console.log(error));
    }

    // Remove value from array
    arrayRemove(arr, value) {
        return arr.filter(function (ele) {
            return ele !== value;
        });
    }

    // Go to next step
    nextStep() {
        this.setState((state) => {
            return {
                stepIndex: state.stepIndex + 1,
                currentStep: this.steps[state.stepIndex + 1],
                mobilePreviewOn: false,
            };
        });
    }

    // Set step to final one
    setFinalStep() {
        this.setState({
            currentStep: this.steps[3],
            stepIndex: 3,
        });
    }

    // Go to resume selection step
    goToResumeSelectionStep() {
        this.setState({
            stepIndex: 1,
            currentStep: 'Template Selection',
            mobilePreviewOn: false,
        });
    }

    // Go to cover letter selection step
    goToCoverSelection() {
        this.setState({
            stepIndex: 4,
            currentStep: 'Action Cover Selection',
            mobilePreviewOn: false,
        });
    }

    // Close initialization overlay
    closeInitialisation() {
        this.setState({ isInitialisationShowed: false });
    }

    // Go back one step
    stepBack() {
        this.setState((state) => {
            return {
                stepIndex: state.stepIndex - 1,
                currentStep: this.steps[state.stepIndex - 1],
                mobilePreviewOn: false,
            };
        });
    }

    // Create new employment object
    createNewEmploymentObject(id) {
        const newEmploymentObject = new EmploymentModel(id);
        newEmploymentObject.date = Date.now();
        return newEmploymentObject;
    }

    // Create new education object
    createNewEducationObject(id) {
        const newEducationObject = new EducationModel(id);
        newEducationObject.date = Date.now();
        return newEducationObject;
    }

    // Create new language object
    createNewLanguageObject(id) {
        const newLanguageObject = new LanguageModel(id);
        newLanguageObject.date = Date.now();
        return newLanguageObject;
    }

    // Create new skill object
    createNewSkillObject(id) {
        const newSkillObject = new SkillModel(id);
        newSkillObject.date = Date.now();
        return newSkillObject;
    }

    // Handle component deletion
    handleDelete(inputType, _id) {
        switch (inputType) {
            case 'Skills':
                this.setState({ skills: [] });
                break;
            default:
                break;
        }
    }

    // Handle cover paragraph input change
    handleCoverParagraphChange(name, content) {
        this.setState((prevState) => {
            const components = [...prevState.components];
            const paragraphIndex = components.findIndex((component) => component.name === name);

            if (paragraphIndex !== -1) {
                components[paragraphIndex] = {
                    ...components[paragraphIndex],
                    content: content,
                };
            }

            return { components };
        });
    }

    // Handle component deletion
    handleComponentDelete(name) {
        this.setState((prevState) => {
            const components = prevState.components.filter((component) => component.name !== name);
            return { components };
        });
    }

    // Add new paragraph component
    handleParagraphAdd() {
        this.setState((prevState) => {
            const count = prevState.components.length;
            const newComponents = [...prevState.components];

            newComponents.push({
                name: `Paragraph${count + 1}`,
                type: 'Paragraph',
                content: 'This is a paragraph',
            });

            return { components: newComponents };
        });
    }

    // Add new list component
    handleListAdd() {
        this.setState((prevState) => {
            const count = prevState.components.length;
            const newComponents = [...prevState.components];

            newComponents.push({
                id: 1,
                name: `List${count + 1}`,
                type: 'List',
                content: [''],
            });

            return { components: newComponents };
        });
    }

    // Handle list item content change
    handleListItemChange(listName, contentIndex, contentValue) {
        this.setState((prevState) => {
            const components = [...prevState.components];
            const listIndex = components.findIndex((component) => component.name === listName);

            if (listIndex !== -1) {
                const newContent = [...components[listIndex].content];
                newContent[contentIndex] = contentValue;

                components[listIndex] = {
                    ...components[listIndex],
                    content: newContent,
                };
            }

            return { components };
        });
    }

    // Handle list name change
    handleListNameChange(name, value) {
        this.setState((prevState) => {
            const components = [...prevState.components];
            const listIndex = components.findIndex((component) => component.name === name);

            if (listIndex !== -1) {
                components[listIndex] = {
                    ...components[listIndex],
                    name: value,
                };
            }

            return { components };
        });
    }

    // Add item to list component
    handleListAddItem(value, listName) {
        this.setState((prevState) => {
            const components = [...prevState.components];
            const listIndex = components.findIndex((component) => component.name === listName);

            if (listIndex !== -1) {
                const newContent = [...components[listIndex].content, value];

                components[listIndex] = {
                    ...components[listIndex],
                    content: newContent,
                };
            }

            return { components };
        });
    }

    // Add new item to list
    handleListItemAdd(name) {
        this.setState((prevState) => {
            const components = [...prevState.components];
            const componentIndex = components.findIndex((component) => component.name === name);

            if (componentIndex !== -1) {
                components[componentIndex] = {
                    ...components[componentIndex],
                    content: [...components[componentIndex].content, ''],
                };
            }

            return { components };
        });
    }

    // Apply AI generated data directly to state (bypasses individual field creation)
    applyAIGeneratedData(aiData) {
        const newState = {};

        // Apply employments if provided
        if (aiData.employments && Array.isArray(aiData.employments) && aiData.employments.length > 0) {
            newState.employments = [...this.state.employments, ...aiData.employments];
        }

        // Apply educations if provided
        if (aiData.educations && Array.isArray(aiData.educations) && aiData.educations.length > 0) {
            newState.educations = [...this.state.educations, ...aiData.educations];
        }

        // Apply languages if provided
        if (aiData.languages && Array.isArray(aiData.languages) && aiData.languages.length > 0) {
            newState.languages = [...this.state.languages, ...aiData.languages];
        }

        // Apply skills if provided
        if (aiData.skills && Array.isArray(aiData.skills) && aiData.skills.length > 0) {
            newState.skills = [...this.state.skills, ...aiData.skills];
        }

        // Apply simple fields
        ['firstname', 'lastname', 'email', 'phone', 'occupation', 'country', 'city', 'address', 'summary'].forEach((field) => {
            if (aiData[field] && aiData[field].trim() !== '') {
                // Only apply if field is currently empty or we're not preserving existing data
                const shouldPreserve = ['firstname', 'lastname', 'email', 'address', 'city', 'country'].includes(field) && this.state[field] && this.state[field].trim() !== '';

                if (!shouldPreserve) {
                    newState[field] = aiData[field];
                }
            }
        });

        this.setState(newState, () => {
            
        });
    }

    // Handle input changes from child components
    handleInputs(inputName, inputValue, idOptional, typeOptional) {
        // Handle AI generated data
        if (inputName === 'AI_GENERATED_DATA') {
            this.applyAIGeneratedData(inputValue);
            return;
        }
        // Handle personal information fields
        if (this.handlePersonalInfoInput(inputName, inputValue)) {
            return;
        }

        // Handle employer information fields
        if (this.handleEmployerInfoInput(inputName, inputValue)) {
            return;
        }

        // Handle employment related fields
        if (typeOptional === 'Employment' && this.handleEmploymentInput(inputName, inputValue, idOptional)) {
            return;
        }

        // Handle education related fields
        if (typeOptional === 'Education' && this.handleEducationInput(inputName, inputValue, idOptional)) {
            return;
        }

        // Handle language related fields
        if (typeOptional === 'Languages' && this.handleLanguageInput(inputName, inputValue, idOptional)) {
            return;
        }

        // Handle skill related fields
        if (typeOptional === 'Skills' && this.handleSkillInput(inputName, inputValue, idOptional)) {
            return;
        }
    }

    // Handle personal information input fields
    handlePersonalInfoInput(inputName, inputValue) {
        const personalInfoFields = {
            Title: 'title',
            'First Name': 'firstname',
            'Last Name': 'lastname',
            Email: 'email',
            Phone: 'phone',
            Photo: 'photo',
            Occupation: 'occupation',
            Country: 'country',
            City: 'city',
            Address: 'address',
            'Postal Code': 'postalcode',
            'Date Of Birth': 'dateOfBirth',
            'Driving License': 'drivinglicense',
            Nationality: 'nationality',
            Gender: 'gender',
            'Professional Summary': 'summary',
            'Mother Tongue': 'motherTongue',
        };

        if (personalInfoFields[inputName]) {
            const stateField = personalInfoFields[inputName];
            const wasEmpty = this.state[stateField] === '';
            const isEmpty = inputValue === '';

            const newState = { [stateField]: inputValue };

            // Update fullFields count
            if (wasEmpty && !isEmpty) {
                newState.fullFields = this.state.fullFields + 1;
            } else if (!wasEmpty && isEmpty) {
                newState.fullFields = this.state.fullFields - 1;
            }

            this.setState(newState);
            return true;
        }

        return false;
    }

    // Handle employer information input fields
    handleEmployerInfoInput(inputName, inputValue) {
        const employerInfoFields = {
            'Employer Full Name': 'employerFullName',
            'Company Name': 'companyName',
            'Company Address': 'companyAddress',
            'Company City': 'companyCity',
            'Company Postal Code': 'companyPostalCode',
        };

        if (employerInfoFields[inputName]) {
            this.setState({ [employerInfoFields[inputName]]: inputValue });
            return true;
        }

        return false;
    }

    // Handle employment related input fields
    handleEmploymentInput(inputName, inputValue, id) {
        const employmentFields = {
            'Job Title': 'jobTitle',
            Begin: 'begin',
            End: 'end',
            Employer: 'employer',
            Description: 'description',
        };

        if (!employmentFields[inputName]) {
            return false;
        }

        const field = employmentFields[inputName];
        let found = false;

        // Find and update existing employment
        const employments = [...this.state.employments];
        for (let i = 0; i < employments.length; i++) {
            if (employments[i] !== null && employments[i].id === id) {
                found = true;
                employments[i][field] = inputValue;
                this.setState({ employments });
                break;
            }
        }

        // Create new employment if not found
        if (!found) {
            const newEmployment = this.createNewEmploymentObject(id);
            newEmployment[field] = inputValue;
            this.setState({ employments: [...this.state.employments, newEmployment] });
        }

        return true;
    }

    // Handle education related input fields
    handleEducationInput(inputName, inputValue, id) {
        const educationFields = {
            School: 'school',
            Degree: 'degree',
            Started: 'started',
            Finished: 'finished',
            'Course Description': 'description',
        };

        if (!educationFields[inputName]) {
            return false;
        }

        const field = educationFields[inputName];
        let found = false;

        // Find and update existing education
        const educations = [...this.state.educations];
        for (let i = 0; i < educations.length; i++) {
            if (educations[i] !== null && educations[i].id === id) {
                found = true;
                educations[i][field] = inputValue;
                this.setState({ educations });
                break;
            }
        }

        // Create new education if not found
        if (!found) {
            const newEducation = this.createNewEducationObject(id);
            newEducation[field] = inputValue;
            this.setState({ educations: [...this.state.educations, newEducation] });
        }

        return true;
    }

    // Handle language related input fields
    handleLanguageInput(inputName, inputValue, id) {
        const languageFields = {
            Language: 'name',
            Level: 'level',
            // Cv51 specific CEFR fields
            Listening: 'listening',
            Reading: 'reading',
            'Spoken Interaction': 'spokenInteraction',
            'Spoken Production': 'spokenProduction',
            Writing: 'writing',
        };

        if (!languageFields[inputName]) {
            return false;
        }

        const field = languageFields[inputName];
        let found = false;

        // Find and update existing language
        const languages = [...this.state.languages];
        for (let i = 0; i < languages.length; i++) {
            if (languages[i] !== null && languages[i].id === id) {
                found = true;
                languages[i][field] = inputValue;
                this.setState({ languages });
                break;
            }
        }

        // Create new language if not found
        if (!found) {
            const newLanguage = this.createNewLanguageObject(id);
            newLanguage[field] = inputValue;
            this.setState({ languages: [...this.state.languages, newLanguage] });
        }

        return true;
    }

    // Handle skill related input fields
    handleSkillInput(inputName, inputValue, id) {
        const skillFields = {
            'Skill Name': 'name',
            Rating: 'rating',
        };

        if (!skillFields[inputName]) {
            return false;
        }

        const field = skillFields[inputName];
        let found = false;

        // Find and update existing skill
        const skills = [...this.state.skills];
        for (let i = 0; i < skills.length; i++) {
            if (skills[i] !== null && skills[i].id === id) {
                found = true;
                skills[i][field] = inputValue;
                this.setState({ skills });
                break;
            }
        }

        // Create new skill if not found
        if (!found) {
            const newSkill = this.createNewSkillObject(id);
            newSkill[field] = inputValue;
            this.setState({ skills: [...this.state.skills, newSkill] });
        }

        return true;
    }

    // Count filled fields
    checkFullFields() {
        const requiredFields = ['firstname', 'lastname', 'email', 'phone', 'occupation', 'country', 'city', 'address', 'postalcode', 'dateofbirth', 'nationality', 'summary'];

        let count = 0;
        requiredFields.forEach((field) => {
            if (this.state[field] && this.state[field].length > 0) {
                count++;
            }
        });

        // Check arrays
        ['employments', 'educations', 'languages', 'skills'].forEach((arrayField) => {
            if (this.state[arrayField] && this.state[arrayField].length > 0) {
                count++;
            }
        });

        this.setState({ fullFields: count });
    }

    // Toggle mobile preview
    handlePreviewToggle() {
        const newPreviewState = !this.state.mobilePreviewOn;
        const shouldShowToggler = this.state.currentStep !== 'Introduction';

        this.setState({
            mobilePreviewOn: newPreviewState,
            isMobileTogglerShowed: shouldShowToggler,
        });
    }

    // Change selected resume template
    changeSelectedResume(resumeName) {
        // Get default colors for the new template
        const templateColors = {
            Cv1: { primary: '#000000', secondary: '#333333' },
            Cv2: { primary: '#f0c30e', secondary: '#f5f5f5' }, // Fixed to match template's natural colors
            Cv3: { primary: '#be8a95', secondary: '#000000' },
            Cv4: { primary: '#3d3e42', secondary: '#3d3e42' }, // Fixed to match template's natural colors
            Cv5: { primary: '#059669', secondary: '#2d3039' },
            Cv6: { primary: '#7c3aed', secondary: '#09043c' },
            // Add more templates as needed
        };

        const newColors = templateColors[resumeName] || { primary: '#000000', secondary: '#333333' };

        this.setState({
            resumeName: resumeName,
            currentResumeName: resumeName,
            colors: newColors,
        });
    }

    // Handle language change
    handleLanguageClick(language) {
        i18n.changeLanguage(language);
        this.setState({ language });
        localStorage.setItem('preferredLanguage', language);
    }

    // Menu management methods
    menuClose() {
        this.setState({ isMenuShowed: false });
    }

    menuOpen() {
        this.setState({ isMenuShowed: true });
    }

    // Handle menu navigation
    handleMenuLink(pagename) {
        if (pagename === 'Home') {
            window.location.href = window.location.pathname;
            this.menuClose();
        } else if (pagename === 'Contact') {
            window.location.href = window.location.pathname + '/contact';
        } else {
            window.location.href = window.location.pathname + 'p/' + pagename;
        }
    }

    // Toggle auth modal
    authBtnHandler() {
        if (!fire.auth().currentUser) {
            this.setState((prevState) => ({ isAuthShowed: !prevState.isAuthShowed }));
        } else {
            this.setState({ isAuthShowed: false });
        }
    }

    // Remove item methods
    removeItem(collection, id) {
        const index = this.state[collection].findIndex((item) => item.id === id);

        if (index !== -1) {
            const updatedItems = [...this.state[collection]];
            updatedItems.splice(index, 1);
            this.setState({ [collection]: updatedItems });
        }
    }

    // Remove employment
    removeEmployment(id) {
        this.removeItem('employments', id);
    }

    // Remove education
    removeEducation(id) {
        this.removeItem('educations', id);
    }

    // Remove language
    removeLanguage(id) {
        this.removeItem('languages', id);
    }

    // Remove skill
    removeSkill(id) {
        this.removeItem('skills', id);
    }

    // Reset navigation
    resetNavigation() {
        this.setState({
            currentStep: 'Introduction',
            isMobileTogglerShowed: false,
            mobilePreviewOn: false,
            stepIndex: 0,
        });
    }

    // Add text to summary
    addSummary(text) {
        this.setState((prevState) => ({
            summary: prevState.summary + text,
        }));
    }

    // Toggle template selector
    handleTemplateShow() {
        this.setState((prevState, _props) => ({
            isSelectTemplateShowed: !prevState.isSelectTemplateShowed,
        }));
    }

    handleColorChange(colorType, color) {
        this.setState((prevState) => ({
            colors: {
                ...prevState.colors,
                [colorType]: color,
            },
        }));
    }

    render() {
        const menuWrapperVariants = {
            initial: { width: '0px', height: '0px' },
            isOpened: {
                width: '1200px',
                height: '1200px',
                transition: { duration: '0.5' },
            },
            isClosed: {
                width: '0px',
                height: '0px',
                transition: { duration: '0.5' },
            },
        };

        const _loaderOptions = {
            loop: true,
            autoplay: true,
            animationData: LoaderAnimation,
            rendererSettings: {
                preserveAspectRatio: 'xMidYMid slice',
            },
        };

        // Prepare values object for child components
        const values = {
            user: this.state.user,
            email: this.state.email,
            resumeName: this.state.resumeName,
            title: this.state.title,
            isAuthShowed: this.state.isAuthShowed,
            firstname: this.state.firstname,
            lastname: this.state.lastname,
            summary: this.state.summary,
            occupation: this.state.occupation,
            address: this.state.address,
            postalcode: this.state.postalcode,
            country: this.state.country,
            dateofbirth: this.state.dateofbirth,
            dateOfBirth: this.state.dateOfBirth,
            city: this.state.city,
            phone: this.state.phone,
            employments: this.state.employments,
            drivinglicense: this.state.drivinglicense,
            nationality: this.state.nationality,
            gender: this.state.gender,
            educations: this.state.educations,
            languages: this.state.languages,
            skills: this.state.skills,
            photo: this.state.photo,
            language: this.state.language,
            membership: this.state.membership,
            membershipEnds: this.state.membershipEnds,
            fullFields: this.state.fullFields,
            components: this.state.components,
            employerFullName: this.state.employerFullName,
            companyName: this.state.companyName,
            companyAddress: this.state.companyAddress,
            companyPostalCode: this.state.companyPostalCode,
            template: this.state.template,
            currentStep: this.state.currentStep,
            ratingOf: this.state.ratingOf,
            subscriptionsStatus: this.state.subscriptionsStatus,
            colors: this.state.colors,
            motherTongue: this.state.motherTongue,
        };

        return (
            <div className="wrapper">
                {/* Dynamic SEO Meta Management */}
                <MetaManager 
                    title={this.state.websiteTitle || 'Resume Builder App'}
                    description={this.state.websiteDescription || 'Professional Resume Builder - Create stunning resumes and cover letters'}
                    keywords={this.state.websiteKeywords || 'resume, cv, cover letter, job application, professional'}
                    language={this.state.websiteLanguage || 'English'}
                />
                {this.state.loaded && (
                    <>
                        <AnimatePresence>
                            {this.state.isAuthShowed && (
                                <motion.div exit={{ opacity: 0 }} initial="hidden" animate="visible" variants={this.authVariants} transition={{ duration: 0.4 }}>
                                    <AuthWrapper closeModal={this.authBtnHandler} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {this.state.isInitialisationShowed && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    <InitialisationWrapper closeInitialisation={this.closeInitialisation} />{' '}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {/* {this.props.match.params.step != undefined && alert(this.props.match.params.step)} */}
                        {this.state.mobilePreviewOn == true && (
                            <div className="menuToggle">
                                <a onClick={() => this.menuOpen()}>
                                    <RxHamburgerMenu className="hamburgerImage" />
                                </a>
                            </div>
                        )}
                        <AnimatePresence>
                            {this.state.isMenuShowed && <motion.div variants={menuWrapperVariants} initial="initial" animate="isOpened" exit="isClosed" className="menu"></motion.div>}
                        </AnimatePresence>
                        <AnimatePresence>
                            {this.state.isMenuShowed && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.4 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }} className="menu-content">
                                    <ul>
                                        <li className="menu-active" onClick={() => this.handleMenuLink('Home')}>
                                            Home <a></a>
                                        </li>
                                        {this.state.pages.map((value, index) => {
                                            return (
                                                <li key={index + 10}>
                                                    {' '}
                                                    <Link to={{ pathname: '/p/' + value.id }}>{value.id}</Link>{' '}
                                                </li>
                                            );
                                        })}
                                        <li>
                                            {' '}
                                            <Link to={{ pathname: '/contact' }}>Contact Us</Link>{' '}
                                        </li>
                                        <li>
                                            <IoClose onClick={() => this.menuClose()} className="closeImage" />
                                        </li>
                                    </ul>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="actions">
                            <Action
                                handleLanguageClick={this.handleLanguageClick}
                                goThirdStep={this.goThirdStep}
                                currentResumeName={this.state.currentResumeName}
                                removeEmployment={this.removeEmployment}
                                removeEducation={this.removeEducation}
                                removeLanguage={this.removeLanguage}
                                removeSkill={this.removeSkill}
                                nextStep={this.nextStep}
                                stepBack={this.stepBack}
                                goCoverStep={this.goCoverStep}
                                handleCoverParagraphChange={this.handleCoverParagraphChange}
                                handleParagraphAdd={this.handleParagraphAdd}
                                values={values}
                                authBtnHandler={this.authBtnHandler}
                                setCurrentStep={this.setCurrentStep}
                                logout={this.logout}
                                user={this.state.user}
                                handlePreviewToggle={this.handlePreviewToggle}
                                handleDelete={this.handleDelete}
                                progress={this.state.progress}
                                currentStep={this.state.currentStep}
                                handleInputs={this.handleInputs}
                                handleComponentDelete={this.handleComponentDelete}
                                handleListAdd={this.handleListAdd}
                                handleListAddItem={this.handleListAddItem}
                                handleListItemChange={this.handleListItemChange}
                                handleListNameChange={this.handleListNameChange}
                                goToCoverSelection={this.goToCoverSelection}
                                resetNavigation={this.resetNavigation}
                                addSummary={this.addSummary}
                                goToResumeSelectionStep={this.goToResumeSelectionStep}
                                changeResumeName={this.changeSelectedResume}
                            />
                        </div>
                        {this.state.currentStep !== 'Introduction' && this.state.currentStep !== 'Template Selection' && this.state.currentStep !== 'Action Cover Selection' && (
                            <div className={this.state.mobilePreviewOn ? ' right-panel  boardShowed' : 'right-panel '}>
                                <Board
                                    nextStep={this.nextStep}
                                    stepBack={this.stepBack}
                                    changeResumeName={this.changeSelectedResume}
                                    currentResumeName={this.state.resumeName}
                                    values={{
                                        subscriptionsStatus: this.state.subscriptionsStatus,
                                        user: this.state.user,
                                        resumeName: this.state.resumeName,
                                        title: this.state.title,
                                        isAuthShowed: this.state.isAuthShowed,
                                        firstname: this.state.firstname,
                                        lastname: this.state.lastname,
                                        summary: this.state.summary,
                                        occupation: this.state.occupation,
                                        address: this.state.address,
                                        postalcode: this.state.postalcode,
                                        country: this.state.country,
                                        city: this.state.city,
                                        dateofbirth: this.state.dateofbirth,
                                        dateOfBirth: this.state.dateOfBirth,
                                        drivinglicense: this.state.drivinglicense,
                                        email: this.state.email,
                                        nationality: this.state.nationality,
                                        gender: this.state.gender,
                                        phone: this.state.phone,
                                        employments: this.state.employments,
                                        educations: this.state.educations,
                                        languages: this.state.languages,
                                        skills: this.state.skills,
                                        photo: this.state.photo,
                                        membership: this.state.membership,
                                        membershipEnds: this.state.membershipEnds,
                                        language: this.state.language,
                                        employerFullName: this.state.employerFullName,
                                        components: this.state.components,
                                        companyName: this.state.companyName,
                                        companyAddress: this.state.companyAddress,
                                        companyCity: this.state.companyCity,
                                        companyPostalCode: this.state.companyPostalCode,
                                        template: this.state.template,
                                        colors: this.state.colors,
                                        motherTongue: this.state.motherTongue,
                                    }}
                                    currentStep={this.state.currentStep}
                                    authBtnHandler={this.authBtnHandler}
                                    goToResumeSelectionStep={this.goToResumeSelectionStep}
                                    goToCoverSelection={this.goToCoverSelection}
                                    setFinalStep={this.setFinalStep}
                                    handleTemplateShow={this.handleTemplateShow}
                                    handleColorChange={this.handleColorChange}
                                />
                            </div>
                        )}

                        <AnimatePresence>
                            {this.state.isMobileTogglerShowed && (
                                <div onClick={this.handlePreviewToggle} className="previewButton">
                                    <img className="previewImg" src={this.state.currentStep == 'Introduction' ? NextImg : PreviewImg} alt="Preview" />
                                </div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {this.state.isSelectTemplateShowed && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="welcome_select_template">
                                    <ResumesSelector currentStep={this.state.currentStep} changeResumeName={this.changeSelectedResume} handleTemplateShow={this.handleTemplateShow} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        );
    }
}
export default Welcome;
