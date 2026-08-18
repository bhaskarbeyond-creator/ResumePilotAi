import React, { Component } from "react";
import {
  getResumes,
  getFavourites,
  getProfileOfUser,
  getStatesOfUser,
  IncrementDownloads,
  addOneToNumberOfDocumentsDownloaded,
  getSystemSettings,
  getUserCoverLetters,
  deleteCoverLetter,
} from "../../../firestore/dbOperations";
import fire from '../../../conf/fire';
import { createResumeDraft, deleteResumeDraft, publishResume, saveResumeDraft } from '../../../services/resumePersistence';
import { normalizeResumeData } from '../../../utils/resumeData';
import LoaderAnimation from "../../../assets/animations/lottie-loader.json";
import { withTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLottie } from "lottie-react";
import {
  FaCheckCircle,
  FaChevronRight,
  FaPencilAlt,
  FaEllipsisH,
  FaEnvelope,
  FaPlus,
  FaBullseye,
  FaShareAlt,
  FaTrashAlt,
  FaFileAlt,
  FaClock,
  FaDownload,
  FaStar,
  FaCalendarAlt,
  FaUsers,
  FaBars,
  FaInbox,
  FaEye,
} from "react-icons/fa";
import axios from "axios";
import download from "downloadjs";
import config from "../../../conf/configuration";
import { trackDownload, trackEvent, trackEngagement } from "../../../utils/ga4";
import { toValidatedPdfBlob, pdfFileName } from "../../../utils/pdfDownload";
import { executeDocxDownload } from "../../../utils/docxDownload";
import { getTemplateComponent } from "../../../utils/templateRegistry";
import TemplateRenderer from "../../TemplateRenderer";
import PreviewModal from "../../BuildResume/PreviewModal";

const LoaderView = () => {
  const loaderOptions = {
    loop: true,
    autoplay: true,
    animationData: LoaderAnimation,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  const { View } = useLottie(loaderOptions);
  return View;
};

class DashboardHomepage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      displayDocuments: [],
      fetchedDocuments: [],
      pageNumber: 1,
      perPage: 3,
      favourites: [],
      isfetcing: false,
      isPaginating: false,
      hasDocuments: false,
      documentsError: null,
      enableImportModule: false,
      pagination: {
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      openDropdownId: null,
      deleteModal: {
        isOpen: false,
        resumeId: null,
        resumeName: "",
        isDeleting: false,
      },
      onboardingSteps: [
        {
          id: 1,
          title: props.t(
            "DashboardHomepage.onboarding.steps.createResume.title",
            "Create your first resume"
          ),
          description: props.t(
            "DashboardHomepage.onboarding.steps.createResume.description",
            "Create or edit resumes with our easy-to-use builder, 20+ templates and advanced AI capabilities for customization and job-specific tailoring."
          ),
          completed: false,
          route: "/build-resume/heading",
          score: 15,
        },
      ],
      profile: {
        name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "",
        occupation: "",
      },
      activeTab: "all",
      userStats: {
        documentsGenerated: 0,
        documentsDownloaded: 0,
        documentsVisited: 0,
      },
      loadedTemplates: {}, // Store dynamically loaded template components
      downloadingResumeIds: new Set(), // Track which resumes are currently being downloaded
      downloadingDocxIds: new Set(), // Track which resumes are currently downloading DOCX
      isDownloading: false, // Add loading state
      showPreviewModal: false,
      previewingDocument: null,
    };

    this.addFavorite = this.addFavorite.bind(this);
    this.removeFavorite = this.removeFavorite.bind(this);
    this.getAllDocuments = this.getAllDocuments.bind(this);
    this.returnDocuments = this.returnDocuments.bind(this);
    this.getProfileOfUserFront = this.getProfileOfUserFront.bind(this);
    this.setPageNumber = this.setPageNumber.bind(this);
    this.searchDocuments = this.searchDocuments.bind(this);
    this.frontGetFavourites = this.frontGetFavourites.bind(this);
    this.handleStepClick = this.handleStepClick.bind(this);
    this.completeStep = this.completeStep.bind(this);
    this.setAsCurrentResume = this.setAsCurrentResume.bind(this);
    this.handleDeleteResume = this.handleDeleteResume.bind(this);
    this.openDeleteModal = this.openDeleteModal.bind(this);
    this.closeDeleteModal = this.closeDeleteModal.bind(this);
    this.confirmDeleteResume = this.confirmDeleteResume.bind(this);
    this.getUserStats = this.getUserStats.bind(this);
    this.setActiveTab = this.setActiveTab.bind(this);
    this.downloadResume = this.downloadResume.bind(this);
    this.shareResume = this.shareResume.bind(this);
    this.renameResume = this.renameResume.bind(this);
    this.duplicateResume = this.duplicateResume.bind(this);
    this.openDocumentPreview = this.openDocumentPreview.bind(this);
    this.closeDocumentPreview = this.closeDocumentPreview.bind(this);
  }

  openDocumentPreview(document) {
    this.setState({
      previewingDocument: document,
      showPreviewModal: true,
    });
  }

  closeDocumentPreview() {
    this.setState({
      showPreviewModal: false,
      previewingDocument: null,
    });
  }

  async getAllDocuments(isPagination = false) {
    this.setState({ documentsError: null });
    // For pagination, don't clear documents and use different loading state
    if (isPagination) {
      this.setState({ isPaginating: true });
    } else {
      this.setState({ fetchedDocuments: [], isfetcing: true });
    }

    const { pageNumber, perPage } = this.state;
    let allDocuments = [];
    let response = null;

    try {
      const userId = fire.auth().currentUser?.uid;
      if (!userId) throw new Error('Authentication is required');
      response = await getResumes(userId, pageNumber, perPage);

      if (response && response.resumes) {
        allDocuments = [...response.resumes];
      }
    } catch (error) {
      this.setState({ documentsError: error.message || 'Resumes could not be loaded.', isfetcing: false, isPaginating: false });
      return;
    }

    if (allDocuments.length === 0) {
      this.setState({
        fetchedDocuments: [],
        displayDocuments: null,
        hasDocuments: false,
        isPaginating: false,
        isfetcing: false,
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: pageNumber,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
      return;
    }

    // Fetch saved cover letters for unified dashboard management
    const savedCoverLetters = await getUserCoverLetters();

    // Update all state at once for better React 19 compatibility
    this.setState({
      fetchedDocuments: allDocuments,
      displayDocuments: allDocuments,
      savedCoverLetters,
      hasDocuments: true,
      isPaginating: false,
      isfetcing: false,
      pagination: (response && response.pagination) || this.state.pagination,
    });
  }

  async getProfileOfUserFront() {
    let profile = await getProfileOfUser(fire.auth().currentUser?.uid);
    let stateProfile = this.state.profile;
    for (let key in profile) {
      if (Object.prototype.hasOwnProperty.call(stateProfile, key)) {
        stateProfile[key] = profile[key];
      }
    }
    this.setState({ profile: stateProfile });
  }

  calculatePages() {
    return Math.ceil(this.state.fetchedDocuments.length / this.state.perPage);
  }

  addFavorite(id) {
    this.setState({ favourites: this.state.favourites.concat(id) });
  }

  removeFavorite(id) {
    this.setState({
      favourites: this.state.favourites.filter((item) => item !== id),
    });
  }

  async handleDeleteResume(resumeId, resumeName) {
    this.openDeleteModal(resumeId, resumeName);
  }

  frontGetFavourites() {
    getFavourites(fire.auth().currentUser?.uid).then((value) => {
      this.setState({ favourites: value });
    });
  }

  async getUserStats() {
    try {
      const userId = fire.auth().currentUser?.uid;
      if (userId) {
        const stats = await getStatesOfUser(userId);
        if (stats) {
          this.setState({
            userStats: {
              documentsGenerated: stats.documentsGenerated || 0,
              documentsDownloaded: stats.documentsDownloaded || 0,
              documentsVisited: stats.documentsVisited || 0,
            },
          });
        }
      }
    } catch (error) {
      // Error handled silently
    }
  }

  componentDidMount() {
    getSystemSettings().then((settings) => {
      const enabled = settings?.modules?.enableImportModule !== undefined
        ? settings.modules.enableImportModule === true
        : settings?.ai?.enableImportModule === true;
      this.setState({ enableImportModule: enabled });
    }).catch(() => {
      this.setState({ enableImportModule: false });
    });

    // Reset pagination state to ensure we start from page 1
    this.setState(
      {
        pageNumber: 1,
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }
    );
    this.unsubscribeAuth = fire.auth().onAuthStateChanged(user => {
      if (user) {
        this.getAllDocuments();
        this.getUserStats();
      } else {
        this.setState({ fetchedDocuments: [], displayDocuments: [], hasDocuments: false, isfetcing: false });
      }
    });
  }

  componentWillUnmount() {
    this.unsubscribeAuth?.();
  }

  setPageNumber(pageNumber) {
    const { pagination } = this.state;
    if (
      pageNumber < 1 ||
      (pagination.totalPages > 0 && pageNumber > pagination.totalPages)
    ) {
      return;
    }

    this.setState({ pageNumber }, () => {
      this.getAllDocuments(true); // Pass true for pagination
    });
  }

  returnDocuments() {
    // Simply show all fetched documents (which are now only resumes)
    this.setState({
      displayDocuments: this.state.fetchedDocuments,
    });
  }

  searchDocuments(searchInput) {
    if (searchInput === "") {
      this.getAllDocuments();
    } else {
      const query = searchInput.toLocaleLowerCase();
      let documents = this.state.fetchedDocuments.filter(document =>
        [document.item?.title, document.item?.firstname, document.item?.lastname, document.item?.occupation]
          .some(value => String(value || '').toLocaleLowerCase().includes(query))
      );
      this.setState({ displayDocuments: documents });
    }
  }

  handleStepClick(stepId) {
    const step = this.state.onboardingSteps.find((s) => s.id === stepId);
    if (step && step.route) {
      this.props.navigate(step.route);
    }
  }

  completeStep(stepId) {
    const updatedSteps = this.state.onboardingSteps.map((step) => {
      if (step.id === stepId) {
        return { ...step, completed: true };
      }
      return step;
    });
    this.setState({ onboardingSteps: updatedSteps });
  }

  setAsCurrentResume(resumeId) {
    localStorage.setItem('currentResumeId', resumeId);
    localStorage.removeItem('currentResumeItem');
    this.props.navigate('/build-resume/heading');
  }

  async shareResume(document) {
    const userId = fire.auth().currentUser?.uid;
    if (!userId) return;
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow) previewWindow.opener = null;
    try {
      await publishResume(userId, document.id, normalizeResumeData(document.item || document), { expectedRevision: document.revision ?? document.item?.revision ?? null });
      if (previewWindow) {
        previewWindow.opener = null;
        previewWindow.location = `${window.location.origin}/shared/${document.id}`;
      }
    } catch (error) {
      previewWindow?.close();
      console.error('Unable to share resume:', error);
      this.props.showToast?.('Resume could not be shared.', 'error');
    }
  }

  async renameResume(document) {
    const userId = fire.auth().currentUser?.uid;
    const currentTitle = document.item?.title || 'Untitled Resume';
    const title = window.prompt('Rename resume', currentTitle);
    if (!userId || !title?.trim() || title.trim() === currentTitle) return;
    try {
      const data = normalizeResumeData({ ...document.item, title: title.trim().slice(0, 160) });
      const saved = await saveResumeDraft(userId, document.id, data, { expectedRevision: Number(document.item?.revision) || 0 });
      document.item = { ...saved.data, revision: saved.revision };
      this.setState(current => ({ displayDocuments: [...current.displayDocuments] }));
    } catch (error) {
      this.props.showToast?.(error.code === 'RESUME_CONFLICT' ? 'Resume changed elsewhere. Refresh before renaming.' : 'Resume could not be renamed.', 'error');
    }
  }

  async duplicateResume(document) {
    const userId = fire.auth().currentUser?.uid;
    if (!userId) return;
    try {
      const data = normalizeResumeData({ ...document.item, title: `${document.item?.title || 'Resume'} (Copy)` });
      const created = await createResumeDraft(userId, data);
      const copy = { id: created.id, template: created.data.template, item: { ...created.data, revision: created.revision }, employments: created.data.employments, educations: created.data.educations, skills: created.data.skills, languages: created.data.languages, isNewStyle: true };
      this.setState(current => ({ fetchedDocuments: [copy, ...current.fetchedDocuments], displayDocuments: [copy, ...current.displayDocuments] }));
    } catch (error) {
      this.props.showToast?.('Resume could not be duplicated.', 'error');
    }
  }

  // Open delete confirmation modal
  openDeleteModal(resumeId, resumeName) {
    this.setState({
      deleteModal: {
        isOpen: true,
        resumeId: resumeId,
        resumeName: resumeName,
        isDeleting: false,
      },
      openDropdownId: null, // Close any open dropdown
    });
  }

  // Close delete confirmation modal
  closeDeleteModal() {
    this.setState({
      deleteModal: {
        isOpen: false,
        resumeId: null,
        resumeName: "",
        isDeleting: false,
      },
    });
  }

  // Confirm and execute delete
  async confirmDeleteResume() {
    const { deleteModal } = this.state;
    if (!deleteModal.resumeId) return;

    this.setState({
      deleteModal: {
        ...deleteModal,
        isDeleting: true,
      },
    });

    try {
      const userId = fire.auth().currentUser?.uid;
      await deleteResumeDraft(userId, deleteModal.resumeId);

      // Close modal first
      this.closeDeleteModal();

      // Show skeleton loading and refresh the documents from server
      this.setState({ isPaginating: true });
      await this.getAllDocuments();
      this.setState({ isPaginating: false });
    } catch (error) {
      // Reset deleting state on error
      this.setState({
        deleteModal: {
          ...deleteModal,
          isDeleting: false,
        },
        isPaginating: false,
      });
    }
  }

  setActiveTab(tab) {
    this.setState({ activeTab: tab });
  }

  // Download resume as PDF
  async downloadResume(document) {
    // Prevent multiple simultaneous downloads of the same document
    if (this.state.downloadingResumeIds.has(document.id)) {
      return;
    }

    // Add to downloading set
    this.setState((prevState) => ({
      downloadingResumeIds: new Set(prevState.downloadingResumeIds).add(
        document.id
      ),
    }));

    try {
      const templateName =
        document?.template || document?.item?.template || "Cv1";
      const resumeId = document.id;
      const language = document?.item?.language || "en";

      // Reconstruct the complete resume data structure that the export expects
      const completeResumeData = {
        ...document.item,
        // Basic personal information
        firstname: document.item?.firstname || "",
        lastname: document.item?.lastname || "",
        email: document.item?.email || "",
        phone: document.item?.phone || "",
        address: document.item?.address || "",
        city: document.item?.city || "",
        country: document.item?.country || "",
        postalcode: document.item?.postalcode || "",
        occupation: document.item?.occupation || "",
        photo: document.item?.photo || null,

        // Transform employments to ensure proper field names
        employments: (document.employments || []).map((emp, index) => ({
          jobTitle: emp.jobTitle || emp.job_title || "",
          employer: emp.employer || emp.company || "",
          begin: emp.begin || emp.start_date || "",
          end: emp.end || emp.end_date || "",
          description: emp.description || "",
          date: emp.date || index + 1,
        })),

        // Transform educations to ensure proper field names
        educations: (document.educations || []).map((edu, index) => ({
          degree: edu.degree || edu.qualification || "",
          school: edu.school || edu.institution || "",
          started: edu.started || edu.start_year || "",
          finished: edu.finished || edu.end_year || "",
          description: edu.description || "",
          date: edu.date || index + 1,
        })),

        // Transform skills to match CV template expectations (skillName -> name)
        skills: (document.skills || []).map((skill, index) => ({
          name: skill.skillName || skill.name || skill.skill || "",
          rating: skill.rating || 50,
          date: skill.date || index + 1,
        })),

        // Transform languages to ensure proper field names
        languages: (document.languages || []).map((lang, index) => ({
          name: lang.name || lang.language || "",
          level: lang.level || lang.proficiency || "Intermediate",
          date: lang.date || index + 1,
        })),

        // Template and export metadata
        template: templateName,
        resumeName: templateName, // This is what the backend might be looking for
        summary: document.item?.summary || '',
        components: document.item?.components || [],
        colors: document.item?.colors || this.getTemplateColors(templateName),
        language: language,
      };

      // Save the canonical owner-scoped draft before export; never publish implicitly.
      const userId = fire.auth().currentUser?.uid;
      if (!userId) throw new Error('Authentication is required');
      const saved = await saveResumeDraft(userId, resumeId, completeResumeData, { expectedRevision: Number(document.item?.revision) || 0 });
      document.item = { ...saved.data, revision: saved.revision };

      // Call the export API
      const response = await axios.post(
        config.provider + "://" + config.backendUrl + "/api/export",
        {
          language: language,
          resumeId: resumeId,
          resumeName: templateName,
        },
        {
          responseType: "blob",
        }
      );

      // Verify the payload really is a PDF before saving it. A blob response type also
      // delivers JSON error bodies, which would otherwise be saved as a corrupt .pdf.
      const pdfBlob = await toValidatedPdfBlob(response.data);
      const fileName = pdfFileName(document.item?.firstname, document.item?.lastname);

      // Track the download event
      trackDownload(templateName, "resume");
      trackEvent("download_document", "Documents", templateName, 1);
      trackEngagement("document_downloaded", {
        template_name: templateName,
        document_type: "resume",
      });

      download(pdfBlob, fileName, "application/pdf");
      await Promise.allSettled([
        IncrementDownloads(),
        addOneToNumberOfDocumentsDownloaded(fire.auth().currentUser?.uid),
      ]);
    } catch (error) {
      // Track download failure
      trackEvent(
        "download_failed",
        "Documents",
        document?.template || "Unknown",
        0
      );
      // A failed export must never look like a completed one.
      this.props.showToast?.(
        error?.message?.startsWith('Download failed')
          ? error.message
          : 'The PDF could not be generated. Please try again.',
        'error'
      );
    } finally {
      // Always remove from downloading set when finished (success or failure)
      this.setState((prevState) => {
        const newDownloadingIds = new Set(prevState.downloadingResumeIds);
        newDownloadingIds.delete(document.id);
        return { downloadingResumeIds: newDownloadingIds };
      });
    }
  }

  // Download resume as Word (DOCX)
  async downloadResumeDocx(document) {
    if (this.state.downloadingDocxIds.has(document.id)) {
      return;
    }

    this.setState((prevState) => ({
      downloadingDocxIds: new Set(prevState.downloadingDocxIds).add(
        document.id
      ),
    }));

    try {
      const templateName =
        document?.template || document?.item?.template || "Cv1";
      const resumeId = document.id;
      const language = document?.item?.language || "en";

      const completeResumeData = {
        ...document.item,
        firstname: document.item?.firstname || "",
        lastname: document.item?.lastname || "",
        email: document.item?.email || "",
        phone: document.item?.phone || "",
        address: document.item?.address || "",
        city: document.item?.city || "",
        country: document.item?.country || "",
        postalcode: document.item?.postalcode || "",
        occupation: document.item?.occupation || "",
        photo: document.item?.photo || null,
        employments: (document.employments || []).map((emp, index) => ({
          jobTitle: emp.jobTitle || emp.job_title || "",
          employer: emp.employer || emp.company || "",
          begin: emp.begin || emp.start_date || "",
          end: emp.end || emp.end_date || "",
          description: emp.description || "",
          date: emp.date || index + 1,
        })),
        educations: (document.educations || []).map((edu, index) => ({
          degree: edu.degree || edu.qualification || "",
          school: edu.school || edu.institution || "",
          started: edu.started || edu.start_year || "",
          finished: edu.finished || edu.end_year || "",
          description: edu.description || "",
          date: edu.date || index + 1,
        })),
        skills: (document.skills || []).map((skill, index) => ({
          name: skill.skillName || skill.name || skill.skill || "",
          rating: skill.rating || 50,
          date: skill.date || index + 1,
        })),
        languages: (document.languages || []).map((lang, index) => ({
          name: lang.name || lang.language || "",
          level: lang.level || lang.proficiency || "Intermediate",
          date: lang.date || index + 1,
        })),
        template: templateName,
        resumeName: templateName,
        summary: document.item?.summary || '',
        components: document.item?.components || [],
        colors: document.item?.colors || this.getTemplateColors(templateName),
        language: language,
      };

      const userId = fire.auth().currentUser?.uid;
      if (!userId) throw new Error('Authentication is required');
      const saved = await saveResumeDraft(userId, resumeId, completeResumeData, { expectedRevision: Number(document.item?.revision) || 0 });
      document.item = { ...saved.data, revision: saved.revision };

      await executeDocxDownload({
        resumeId,
        resumeName: templateName,
        language,
        firstname: document.item?.firstname,
        lastname: document.item?.lastname,
        colors: document.item?.colors || null,
        userId,
      });

      this.props.showToast?.('DOCX download successful!', 'success');
    } catch (error) {
      console.error('DOCX download failed:', error);
      trackEvent('download_failed_docx', 'Documents', document?.template || 'Unknown', 0);
      this.props.showToast?.(
        error?.message?.startsWith('Download failed') ? error.message : 'The DOCX could not be generated. Please try again.',
        'error'
      );
    } finally {
      this.setState((prevState) => {
        const newSet = new Set(prevState.downloadingDocxIds);
        newSet.delete(document.id);
        return { downloadingDocxIds: newSet };
      });
    }
  }

  // Dynamic template loader
  async loadTemplate(templateName) {
    if (!templateName || this.state.loadedTemplates[templateName]) {
      return this.state.loadedTemplates[templateName];
    }

    try {
      // Dynamic import based on template name
      let templateModule;
      if (templateName.startsWith("Cover")) {
        templateModule = await import(
          `../../../cv-templates/${templateName.toLowerCase()}/${templateName}.jsx`
        );
      } else {
        templateModule = await import(
          `../../../cv-templates/${templateName.toLowerCase()}/${templateName}.jsx`
        );
      }

      const TemplateComponent = templateModule.default;

      this.setState((prevState) => ({
        loadedTemplates: {
          ...prevState.loadedTemplates,
          [templateName]: TemplateComponent,
        },
      }));

      return TemplateComponent;
    } catch (error) {
      // Fallback to Cv1 if template fails to load
      if (templateName !== "Cv1") {
        return this.loadTemplate("Cv1");
      }
      return null;
    }
  }

  // Render template component with error boundary
  renderTemplatePreview(document) {
    const templateName =
      document?.template || document?.item?.template || "Cv1";
    const cvData = this.generateSampleCvData(document);

    try {
      return (
        <TemplateRenderer
          templateId={templateName}
          values={cvData}
          language="en"
        />
      );
    } catch (error) {
      return (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
          <div className="text-gray-400 text-xs">Preview Error</div>
        </div>
      );
    }
  }

  // Get template-specific colors
  getTemplateColors(templateName) {
    const templateColors = {
      Cv1: { primary: "#000000", secondary: "#333333" },
      Cv2: { primary: "#f0c30e", secondary: "#f5f5f5" },
      Cv3: { primary: "#be8a95", secondary: "#000000" },
      Cv4: { primary: "#3d3e42", secondary: "#3d3e42" },
      Cv5: { primary: "#059669", secondary: "#2d3039" },
      Cv6: { primary: "#7c3aed", secondary: "#09043c" },
      Cv7: { primary: "#000000", secondary: "#f5f5f5" },
    };

    return (
      templateColors[templateName] || {
        primary: "#000000",
        secondary: "#333333",
      }
    );
  }

  // Generate CV data using actual document data with truthful normalizer
  generateSampleCvData(document) {
    if (!document) return normalizeResumeData({});
    const rawData = document.item || document.data || document;
    return normalizeResumeData(rawData, { template: document.template || rawData.template || 'Cv1' });
  }

  render() {
    const { t } = this.props;
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 max-w-none w-full" style={{maxWidth: '1600px'}}>
          {this.state.documentsError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{this.state.documentsError} <button type="button" onClick={() => this.getAllDocuments()} className="ml-2 font-semibold underline">Try again</button></div>}
          {/* Header Section */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FaFileAlt className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight truncate">
                    {t("DashboardHomepage.tabs.resumes", "My Resumes")}
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    {t(
                      "JobsUpdate.DashboardHomepageFix1.subtitle",
                      "Manage and create your professional resumes"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium shadow-sm"
                  onClick={() => {
                    localStorage.removeItem("currentResumeId");
                    localStorage.removeItem("currentResumeItem");
                    this.props.navigate("/build-resume/heading");
                  }}
                >
                  <FaPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("HomepageHero.createResume", "Create Resume")}</span>
                  <span className="sm:hidden">New Resume</span>
                </button>

                <button 
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-md flex items-center gap-2 transition-colors text-sm font-medium"
                  onClick={() => this.props.navigate("/dashboard/cover-letters")}
                >
                  <FaPlus className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">New Cover Letter</span>
                  <span className="sm:hidden">Cover Letter</span>
                </button>

                {this.state.enableImportModule && (
                  <button 
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-md flex items-center gap-2 transition-all text-sm font-medium shadow-sm"
                    onClick={() => {
                      localStorage.removeItem("currentResumeId");
                      localStorage.removeItem("currentResumeItem");
                      this.props.navigate("/build-resume/heading?import=true");
                    }}
                  >
                    <svg className="w-4 h-4 text-purple-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="hidden sm:inline">Import Resume</span>
                    <span className="sm:hidden">Import</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Category Folder Filter Tabs & Activity Stream */}
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-slate-200 gap-2 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <button onClick={() => this.setState({ activeTab: 'all' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${this.state.activeTab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>All Resumes ({this.state.fetchedDocuments?.length || 0})</button>
              <button onClick={() => this.setState({ activeTab: 'cover-letters' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${this.state.activeTab === 'cover-letters' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>Cover Letters ({this.state.savedCoverLetters?.length || 0})</button>
              <button onClick={() => this.setState({ activeTab: 'tech' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${this.state.activeTab === 'tech' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Tech & Engineering</button>
              <button onClick={() => this.setState({ activeTab: 'mgmt' })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${this.state.activeTab === 'mgmt' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Management</button>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <FaClock className="w-3 h-3 text-slate-400" />
              <span>Last activity: Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          {/* Statistics Cards */}
          {this.state.isfetcing && this.state.fetchedDocuments.length === 0 ? (
            /* Statistics Cards Skeleton */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-2/3 mb-2"></div>
                  <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : (
            (this.state.hasDocuments ||
              this.state.fetchedDocuments.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Resumes</p>
                      <p className="text-xl font-semibold text-slate-900 mt-1">{this.state.fetchedDocuments.length}</p>
                    </div>
                    <div className="p-3 bg-slate-100 rounded-md">
                      <FaFileAlt className="w-5 h-5 text-slate-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recent Activity</p>
                      <p className="text-xl font-semibold text-slate-900 mt-1">{t("DashboardHomepage.stats.today", "Today")}</p>
                    </div>
                    <div className="p-3 bg-green-100 rounded-md">
                      <FaClock className="w-5 h-5 text-green-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Downloads</p>
                      <p className="text-xl font-semibold text-slate-900 mt-1">{this.state.userStats.documentsDownloaded}</p>
                    </div>
                    <div className="p-3 bg-blue-100 rounded-md">
                      <FaDownload className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Favorites</p>
                      <p className="text-xl font-semibold text-slate-900 mt-1">{this.state.favourites.length}</p>
                    </div>
                    <div className="p-3 bg-yellow-100 rounded-md">
                      <FaStar className="w-5 h-5 text-yellow-600" />
                    </div>
                  </div>
                </div>
              </div>
            )
          )}



          {/* Document header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">{t("DashboardHomepage.sections.myResumes", "My Resumes")}</h2>
            </div>

            {this.state.fetchedDocuments.length > 0 && (
              <div className="flex items-center space-x-3 text-sm text-slate-600">
                <div>
                  {this.state.displayDocuments?.length || 0}{" "}
                  {t("DashboardHomepage.stats.resumesCount", "resumes")}
                </div>
              </div>
            )}
          </div>

          {/* Resume cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {/* Loading State (Pagination, Delete, or Initial Load) */}
            {(this.state.isPaginating || this.state.isfetcing) && (
              <>
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-pulse">
                    <div className="h-48 bg-slate-200"></div>
                    <div className="p-5">
                      <div className="h-5 bg-slate-200 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Cover Letters View */}
            {this.state.activeTab === 'cover-letters' && (
              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(!this.state.savedCoverLetters || this.state.savedCoverLetters.length === 0) ? (
                  <div className="col-span-full p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <p className="text-sm font-semibold text-slate-700">No cover letters created yet</p>
                    <p className="text-xs text-slate-500 mb-4">Generate your first AI-optimized cover letter in seconds.</p>
                    <button onClick={() => this.props.navigate('/dashboard/cover-letters')} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors">
                      + Create Cover Letter
                    </button>
                  </div>
                ) : (
                  this.state.savedCoverLetters.map(letter => (
                    <div key={letter.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between hover:shadow-md transition-all">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Cover Letter</span>
                          <span className="text-[10px] text-slate-400">Updated {new Date(letter.updatedAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 truncate mb-1">{letter.jobTitle || 'Target Position'}</h3>
                        <p className="text-xs text-slate-500 mb-3">{letter.companyName || 'Company Name'}</p>
                        <p className="text-xs text-slate-600 line-clamp-3 font-mono bg-slate-50 p-2.5 rounded border border-slate-100 mb-4">{letter.letterBody}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <button onClick={() => this.props.navigate('/dashboard/cover-letters')} className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg text-center transition-colors">
                          Open & Edit
                        </button>
                        <button onClick={async () => {
                          await deleteCoverLetter(letter.id);
                          const updated = await getUserCoverLetters();
                          this.setState({ savedCoverLetters: updated });
                        }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <FaTrashAlt className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Regular Resume Cards */}
            {this.state.activeTab !== 'cover-letters' &&
              !this.state.isPaginating &&
              !this.state.isfetcing &&
              this.state.displayDocuments !== null &&
              this.state.displayDocuments.length > 0 &&
              this.state.displayDocuments
                .filter(document => {
                  if (this.state.activeTab === 'tech') {
                    const str = JSON.stringify(document).toLowerCase();
                    return str.includes('engineer') || str.includes('developer') || str.includes('tech') || str.includes('software');
                  }
                  if (this.state.activeTab === 'mgmt') {
                    const str = JSON.stringify(document).toLowerCase();
                    return str.includes('manager') || str.includes('management') || str.includes('lead') || str.includes('director') || str.includes('ceo');
                  }
                  return true;
                })
                .map((document) => {
                if (document) {
                  return (
                    <div key={document.id} className="group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0 pr-2">
                          <h3 className="text-base font-semibold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors truncate" onClick={() => this.setAsCurrentResume(document.id, document)}>
                            {document.item?.title && document.item.title !== 'Untitled Resume'
                              ? document.item.title
                              : document.item?.firstname || document.item?.lastname
                              ? `${document.item?.firstname || ''} ${document.item?.lastname || ''}`.trim()
                              : t("DashboardHomepage.card.untitledResume", "Untitled Resume")}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1">
                            {t("DashboardHomepage.card.created", "Created")}{" "}
                            {new Date(
                              document.item?.created_at?.seconds * 1000 || Date.now()
                            ).toLocaleDateString("en-US", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>

                        {/* Action Menu */}
                        <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              this.setState({
                                openDropdownId:
                                  this.state.openDropdownId === document.id
                                    ? null
                                    : document.id,
                              });
                            }}>
                            <FaEllipsisH className="w-4 h-4" />
                          </button>
                          {this.state.openDropdownId === document.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg z-10 border border-slate-200">
                              <div className="py-1">
                                <button className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full text-left" onClick={() => { this.renameResume(document); this.setState({ openDropdownId: null }); }}>
                                  <FaPencilAlt className="w-3 h-3 mr-3" /><span>Rename</span>
                                </button>
                                <button className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full text-left" onClick={() => { this.duplicateResume(document); this.setState({ openDropdownId: null }); }}>
                                  <FaFileAlt className="w-3 h-3 mr-3" /><span>Duplicate</span>
                                </button>
                                <button className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left" onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const resumeName =
                                      document.item?.firstname &&
                                      document.item?.lastname
                                        ? `${document.item.firstname} ${document.item.lastname}`
                                        : document.item?.firstname
                                        ? document.item.firstname
                                        : document.item?.lastname
                                        ? document.item.lastname
                                        : "Untitled Resume";
                                    this.handleDeleteResume(
                                      document.id,
                                      resumeName
                                    );
                                    this.setState({ openDropdownId: null });
                                  }}>
                                  <FaTrashAlt className="w-3 h-3 mr-3 text-red-600" />
                                  <span>
                                    {t(
                                      "DashboardHomepage.actions.delete",
                                      "Delete"
                                    )}
                                  </span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Document Preview (Positioned right below Header) */}
                      <div className="relative h-72 bg-slate-50 cursor-pointer overflow-hidden rounded-lg mb-4 border border-slate-200/80 shadow-inner group/preview" onClick={() => this.openDocumentPreview(document)}>
                        {/* Resume Preview with Dynamic Template Component */}
                        <div className="absolute inset-0 overflow-hidden transform-gpu flex items-start justify-center">
                          <div className="w-[794px] h-[1123px] bg-white scale-[0.45] origin-top">
                            {this.renderTemplatePreview(document)}
                          </div>
                        </div>

                        {/* Full Preview Hover Overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover/preview:bg-black/25 transition-all duration-300 flex items-center justify-center">
                          <div className="transform scale-0 group-hover/preview:scale-100 transition-transform duration-200 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 text-slate-800 font-semibold text-xs border border-slate-200">
                            <FaEye className="w-3.5 h-3.5 text-blue-600" />
                            <span>{t("DashboardHomepage.actions.viewFullPreview", "Full Size Preview")}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-2.5 mt-auto">
                        {/* Primary Action - Edit Resume */}
                        <button className="w-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 shadow-sm" onClick={() => this.setAsCurrentResume(document.id, document)}>
                          <FaPencilAlt className="w-3.5 h-3.5" />
                          <span>
                            {t(
                              "DashboardHomepage.actions.editResume",
                              "Edit Resume"
                            )}
                          </span>
                        </button>

                        {/* Share Button - Secondary Style */}
                        <button className="w-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 shadow-sm" onClick={() => this.shareResume(document)}>
                          <FaShareAlt className="w-3.5 h-3.5" />
                          <span>
                            {t(
                              "DashboardHomepage.actions.shareResume",
                              "Share Resume"
                            )}
                          </span>
                        </button>

                        {/* Download Button - Gradient Style */}
                        <button className={`w-full text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 shadow-sm ${this.state.downloadingResumeIds.has(document.id)
                              ? "bg-slate-400 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700"
                          }`} onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (
                              !this.state.downloadingResumeIds.has(
                                document.id
                              )
                            ) {
                              this.downloadResume(document);
                            }
                          }}>
                          {this.state.downloadingResumeIds.has(document.id) ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>
                                {t(
                                  "DashboardHomepage.actions.downloading",
                                  "Downloading..."
                                )}
                              </span>
                            </>
                          ) : (
                            <>
                              <FaDownload className="w-3.5 h-3.5" />
                              <span>
                                {t(
                                  "DashboardHomepage.actions.downloadPdf",
                                  "Download PDF"
                                )}
                              </span>
                            </>
                          )}
                        </button>

                        {/* Download Word (DOCX) Button */}
                        <button className={`w-full text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 shadow-sm ${this.state.downloadingDocxIds.has(document.id)
                              ? "bg-slate-400 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`} onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (
                              !this.state.downloadingDocxIds.has(
                                document.id
                              )
                            ) {
                              this.downloadResumeDocx(document);
                            }
                          }}>
                          {this.state.downloadingDocxIds.has(document.id) ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Generating DOCX...</span>
                            </>
                          ) : (
                            <>
                              <FaDownload className="w-3.5 h-3.5" />
                              <span>Download Word (DOCX)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })}

            {/* Create new resume card - only show when not loading */}
            {!this.state.isPaginating && !this.state.isfetcing && (
              <div 
                className="bg-white rounded-lg shadow-sm border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-all duration-200 cursor-pointer group" 
                onClick={() => {
                  localStorage.removeItem("currentResumeId");
                  localStorage.removeItem("currentResumeItem");
                  this.props.navigate("/build-resume/heading");
                }}
              >
                <div className="p-8 text-center h-full flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center mb-6 transition-colors">
                    <FaPlus className="w-6 h-6 text-slate-600" />
                  </div>
                  <h3 className="text-base font-medium text-slate-900 mb-2">
                    {t(
                      "DashboardHomepage.card.newResumeTitle",
                      "Create New Resume"
                    )}
                  </h3>
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    {t(
                      "DashboardHomepage.card.newResumeDescription",
                      "Start building your professional resume"
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Import existing resume card - only show when enabled in admin settings (default OFF) */}
            {!this.state.isPaginating && !this.state.isfetcing && this.state.enableImportModule && (
              <div 
                className="bg-gradient-to-br from-purple-50/60 via-indigo-50/40 to-slate-50 rounded-lg shadow-sm border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50/80 transition-all duration-200 cursor-pointer group" 
                onClick={() => {
                  localStorage.removeItem("currentResumeId");
                  localStorage.removeItem("currentResumeItem");
                  this.props.navigate("/build-resume/heading?import=true");
                }}
              >
                <div className="p-8 text-center h-full flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-purple-100 group-hover:bg-purple-200 text-purple-600 rounded-full flex items-center justify-center mb-6 transition-colors shadow-inner">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-slate-900 mb-2">
                    Import Existing Resume
                  </h3>
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    Upload your PDF or DOCX file to pre-fill all details automatically
                  </p>
                </div>
              </div>
            )}
          </div>



          {/* Pagination */}
          {this.state.displayDocuments !== null &&
            this.state.pagination.totalPages > 1 && (
              <div className="flex justify-center mt-6 sm:mt-8 px-4">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <button
                    onClick={() =>
                      this.setPageNumber(this.state.pagination.currentPage - 1)
                    }
                    disabled={!this.state.pagination.hasPreviousPage}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                      this.state.pagination.hasPreviousPage
                        ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FaChevronRight className="transform rotate-180 w-3 h-3 sm:w-4 sm:h-4" />
                  </button>

                  <span className="text-gray-600 px-2 sm:px-4 text-sm sm:text-base">
                    {t("DashboardHomepage.pagination.page", "Page")}{" "}
                    {this.state.pagination.currentPage}{" "}
                    {t("DashboardHomepage.pagination.of", "of")}{" "}
                    {this.state.pagination.totalPages}
                  </span>

                  <button
                    onClick={() =>
                      this.setPageNumber(this.state.pagination.currentPage + 1)
                    }
                    disabled={!this.state.pagination.hasNextPage}
                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                      this.state.pagination.hasNextPage
                        ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <FaChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            )}

          {/* Delete Confirmation Modal */}
          {this.state.deleteModal.isOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
              onClick={(e) => {
                if (
                  e.target === e.currentTarget &&
                  !this.state.deleteModal.isDeleting
                ) {
                  this.closeDeleteModal();
                }
              }}
            >
              <div className="bg-white rounded-lg shadow-xl max-w-sm sm:max-w-md w-full mx-4 transform transition-all duration-200 scale-100">
                <div className="p-4 sm:p-6">
                  <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-red-100 rounded-full">
                    <FaTrashAlt className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                  </div>

                  <div className="text-center">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                      {t(
                        "DashboardHomepage.deleteModal.title",
                        "Delete Document"
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 sm:mb-6 leading-relaxed">
                      {t(
                        "DashboardHomepage.deleteModal.message",
                        "Are you sure you want to delete"
                      )}
                      {this.state.deleteModal.resumeName && (
                        <span className="font-medium text-gray-700">
                          {" "}
                          "{this.state.deleteModal.resumeName}"
                        </span>
                      )}
                      ?{" "}
                      {t(
                        "DashboardHomepage.deleteModal.warningMessage",
                        "This action cannot be undone."
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 order-2 sm:order-1"
                      onClick={this.closeDeleteModal}
                      disabled={this.state.deleteModal.isDeleting}
                    >
                      {t("DashboardHomepage.deleteModal.cancel", "Cancel")}
                    </button>
                    <button
                      className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 order-1 sm:order-2 ${
                        this.state.deleteModal.isDeleting
                          ? "bg-red-400 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-700"
                      }`}
                      onClick={this.confirmDeleteResume}
                      disabled={this.state.deleteModal.isDeleting}
                    >
                      {this.state.deleteModal.isDeleting ? (
                        <div className="flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          {t(
                            "DashboardHomepage.deleteModal.deleting",
                            "Deleting..."
                          )}
                        </div>
                      ) : (
                        t("DashboardHomepage.deleteModal.delete", "Delete")
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Full Size Resume Preview Modal */}
          {this.state.showPreviewModal && this.state.previewingDocument && (
            <PreviewModal
              showPreview={this.state.showPreviewModal}
              setShowPreview={(val) => {
                if (!val) {
                  this.closeDocumentPreview();
                } else {
                  this.setState({ showPreviewModal: true });
                }
              }}
              resumeData={this.generateSampleCvData(this.state.previewingDocument)}
              currentTemplate={this.state.previewingDocument.template || this.state.previewingDocument.item?.template || 'Cv1'}
              getTemplateComponent={getTemplateComponent}
              getTemplateName={(tId) => tId}
              onDownload={() => this.downloadResume(this.state.previewingDocument)}
              isDownloading={this.state.downloadingResumeIds.has(this.state.previewingDocument.id)}
              onDownloadDocx={() => this.downloadResumeDocx(this.state.previewingDocument)}
              isDownloadingDocx={this.state.downloadingDocxIds.has(this.state.previewingDocument.id)}
            />
          )}
        </div>
      </div>
    );
  }
}

// Wrapper component to provide navigation to class component
const DashboardHomepageWrapper = (props) => {
  const navigate = useNavigate();
  return <DashboardHomepage {...props} navigate={navigate} />;
};

const MyComponent = withTranslation("common")(DashboardHomepageWrapper);
export default MyComponent;
