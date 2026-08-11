import React, { Component } from "react";
import "./BoardSelection.scss";
import { CSSTransition } from "react-transition-group";
import { withTranslation } from "react-i18next";
import { FiSearch, FiStar, FiFilter, FiArrowLeft, FiArrowRight, FiEye } from "react-icons/fi";
import { motion } from "framer-motion";

class BoardSelection extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchTerm: "",
      activeCategory: "all",
      previewTemplate: null,
      currentPage: 1,
      templatesPerPage: 3,
      favoriteTemplates: [],
      isLoading: true
    };
    
    this.togglerHandler = this.togglerHandler.bind(this);
    this.handleResumeClick = this.handleResumeClick.bind(this);
    this.handleSearchChange = this.handleSearchChange.bind(this);
    this.setActiveCategory = this.setActiveCategory.bind(this);
    this.toggleFavorite = this.toggleFavorite.bind(this);
    this.showTemplatePreview = this.showTemplatePreview.bind(this);
    this.closeTemplatePreview = this.closeTemplatePreview.bind(this);
    this.changePage = this.changePage.bind(this);
  }

  componentDidMount() {
    // Simulate loading templates data
    setTimeout(() => {
      this.setState({ isLoading: false });
    }, 600);

    // Add event listener to handle window resize
    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    // Clean up event listener
    window.removeEventListener('resize', this.handleResize);
  }

  handleResize = () => {
    // Force a re-render when window is resized to ensure proper layout
    this.forceUpdate();
  }

  togglerHandler() {
    this.props.toggler();
    this.props.nextStep();
  }

  handleResumeClick(resumeName) {
    this.props.changeResumeName(resumeName);
    if (this.props.currentStep === "Template Selection") {
      this.props.nextStep();
    } else {
      this.props.setFinalStep();
    }
  }

  handleSearchChange(e) {
    this.setState({ searchTerm: e.target.value, currentPage: 1 });
  }

  setActiveCategory(category) {
    this.setState({ activeCategory: category, currentPage: 1 });
  }

  toggleFavorite(templateId) {
    this.setState(prevState => {
      const favorites = [...prevState.favoriteTemplates];
      if (favorites.includes(templateId)) {
        return { favoriteTemplates: favorites.filter(id => id !== templateId) };
      } else {
        return { favoriteTemplates: [...favorites, templateId] };
      }
    });
  }

  showTemplatePreview(template) {
    this.setState({ previewTemplate: template });
  }

  closeTemplatePreview() {
    this.setState({ previewTemplate: null });
  }

  changePage(pageNumber) {
    this.setState({ currentPage: pageNumber });
  }

  getCategories() {
    if (this.props.currentStep === "Template Selection") {
      return [
        { id: "all", name: "All Templates" },
        { id: "modern", name: "Modern" },
        { id: "professional", name: "Professional" },
        { id: "creative", name: "Creative" },
        { id: "simple", name: "Simple" }
      ];
    } else {
      return [
        { id: "all", name: "All Cover Letters" },
        { id: "standard", name: "Standard" },
        { id: "modern", name: "Modern" }
      ];
    }
  }

  renderTemplateCategories() {
    const categories = this.getCategories();
    const { activeCategory } = this.state;

    return (
      <div className="template-categories-container">
        <div className="template-categories">
          {categories.map(category => (
            <motion.button
              key={category.id}
              className={`category-btn ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => this.setActiveCategory(category.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {category.name}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  renderPagination(totalTemplates) {
    const { currentPage, templatesPerPage } = this.state;
    const totalPages = Math.ceil(totalTemplates / templatesPerPage);
    
    if (totalPages <= 1) return null;
    
    const pages = [];
    const maxVisiblePages = 5;
    
    // Simplified pagination logic
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return (
      <div className="pagination">
        <button 
          className="pagination-arrow"
          onClick={() => this.changePage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <FiArrowLeft />
        </button>
        
        {pages.map(page => (
          <button
            key={page}
            className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
            onClick={() => this.changePage(page)}
          >
            {page}
          </button>
        ))}
        
        <button 
          className="pagination-arrow"
          onClick={() => this.changePage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <FiArrowRight />
        </button>
      </div>
    );
  }

  renderTemplatePreview() {
    const { previewTemplate } = this.state;
    if (!previewTemplate) return null;
    
    return (
      <div className="template-preview-overlay" onClick={this.closeTemplatePreview}>
        <div className="template-preview-container" onClick={e => e.stopPropagation()}>
          <button className="close-preview" onClick={this.closeTemplatePreview}>
            &times;
          </button>
          <div className="preview-image-container">
            <img src={previewTemplate.src} alt={previewTemplate.id} />
          </div>
          <div className="preview-controls">
            <button 
              className="preview-select-btn"
              onClick={() => {
                this.handleResumeClick(previewTemplate.id);
                this.closeTemplatePreview();
              }}
            >
              Select This Template
            </button>
          </div>
        </div>
      </div>
    );
  }

  renderLoadingState() {
    return (
      <div className="templates-loading">
        <div className="loader"></div>
        <p>Loading templates...</p>
      </div>
    );
  }

  renderTemplates() {
    const { currentStep } = this.props;
    const { searchTerm, activeCategory, currentPage, templatesPerPage, favoriteTemplates, isLoading } = this.state;
    
    // Show loading state
    if (isLoading) {
      return this.renderLoadingState();
    }

    if (currentStep === "Template Selection") {
      const templates = [
        { id: "Cv1", src: require("../../../assets/1.JPG"), category: "professional" },
        { id: "Cv2", src: require("../../../assets/resumesNew/Cv2.JPG"), category: "modern" },
        { id: "Cv6", src: require("../../../assets/6.JPG"), category: "simple" },
        { id: "Cv3", src: require("../../../assets/3.JPG"), category: "creative" },
        { id: "Cv4", src: require("../../../assets/4.jpg"), category: "professional" },
        { id: "Cv5", src: require("../../../assets/5.JPG"), category: "modern" },
        { id: "Cv7", src: require("../../../assets/7.JPG"), category: "creative" },
        { id: "Cv8", src: require("../../../assets/8.jpg"), category: "simple" },
        { id: "Cv9", src: require("../../../assets/9.jpg"), category: "professional" },
        { id: "Cv10", src: require("../../../assets/10.JPG"), category: "modern" },
        { id: "Cv11", src: require("../../../assets/resumesNew/Cv11.JPG"), category: "creative" },
        { id: "Cv12", src: require("../../../assets/resumesNew/Cv12.JPG"), category: "simple" },
        { id: "Cv13", src: require("../../../assets/resumesNew/Cv13.JPG"), category: "professional" },
        { id: "Cv14", src: require("../../../assets/resumesNew/Cv14.JPG"), category: "modern" },
        { id: "Cv15", src: require("../../../assets/resumesNew/Cv15.JPG"), category: "creative" },
      ];

      // Filter based on search and category
      let filteredTemplates = templates;
      
      if (searchTerm) {
        filteredTemplates = filteredTemplates.filter(template => 
          template.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      if (activeCategory !== "all") {
        filteredTemplates = filteredTemplates.filter(template => 
          template.category === activeCategory
        );
      }
      
      // Pagination
      const indexOfLastTemplate = currentPage * templatesPerPage;
      const indexOfFirstTemplate = indexOfLastTemplate - templatesPerPage;
      const currentTemplates = filteredTemplates.slice(indexOfFirstTemplate, indexOfLastTemplate);
    const totalTemplates = filteredTemplates.length;

      return (
        <>
          <div className="templates-header">
            <div className="search-container">
              <FiSearch className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={this.handleSearchChange}
              />
            </div>
            {this.renderTemplateCategories()}
          </div>
          
          <div className="templates-counter">
            <span>Showing {currentTemplates.length} of {totalTemplates} templates</span>
          </div>
          
          {filteredTemplates.length === 0 ? (
            <div className="no-results">
              <p>No templates found matching your criteria</p>
            </div>
          ) : (
            <>
              <div className="templatesList">
                {currentTemplates.map((template) => (
                  <motion.div 
                    className="template" 
                    key={template.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    whileHover={{ y: -5 }}
                  >
                    <div className="template-card">
                      <div className="template-header">
                        <span className="template-id">{template.id}</span>
                        <button 
                          className={`favorite-btn ${favoriteTemplates.includes(template.id) ? 'active' : ''}`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            this.toggleFavorite(template.id); 
                          }}
                        >
                          <FiStar />
                        </button>
                      </div>
                      <div className="template-image">
                        <img
                          src={template.src}
                          alt={`Resume Template ${template.id}`}
                          onClick={() => this.handleResumeClick(template.id)}
                        />
                      </div>
                      <div className="template-actions">
                        <button
                          className="preview-btn"
                          onClick={() => this.showTemplatePreview(template)}
                        >
                          <FiEye /> Preview
                        </button>
                        <button
                          className="select-btn"
                          onClick={() => this.handleResumeClick(template.id)}
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {this.renderPagination(filteredTemplates.length)}
            </>
          )}
          {this.renderTemplatePreview()}
        </>
      );
    } else if (currentStep === "Action Cover Selection") {
      const coverTemplates = [
        { id: "Cover1", src: require("../../../assets/coversNew/Cover1.JPG"), category: "standard" },
        { id: "Cover2", src: require("../../../assets/coversNew/Cover2.JPG"), category: "modern" },
        { id: "Cover3", src: require("../../../assets/coversNew/Cover3.JPG"), category: "standard" },
        { id: "Cover4", src: require("../../../assets/coversNew/Cover4.JPG"), category: "modern" },
      ];

      // Filter based on search and category
      let filteredTemplates = coverTemplates;
      
      if (searchTerm) {
        filteredTemplates = filteredTemplates.filter(template => 
          template.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      if (activeCategory !== "all") {
        filteredTemplates = filteredTemplates.filter(template => 
          template.category === activeCategory
        );
      }

      return (
        <>
          <div className="templates-header">
            <div className="search-container">
              <FiSearch className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search cover letter templates..."
                value={searchTerm}
                onChange={this.handleSearchChange}
              />
            </div>
            {this.renderTemplateCategories()}
          </div>
          
          {filteredTemplates.length === 0 ? (
            <div className="no-results">
              <p>No templates found matching your criteria</p>
            </div>
          ) : (
            <div className="templatesList covers-list">
              {filteredTemplates.map((cover) => (
                <motion.div 
                  className="template" 
                  key={cover.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  whileHover={{ y: -5 }}
                >
                  <div className="template-card">
                    <div className="template-header">
                      <span className="template-id">{cover.id}</span>
                      <button 
                        className={`favorite-btn ${favoriteTemplates.includes(cover.id) ? 'active' : ''}`}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          this.toggleFavorite(cover.id); 
                        }}
                      >
                        <FiStar />
                      </button>
                    </div>
                    <div className="template-image">
                      <img
                        src={cover.src}
                        alt={`Cover Letter Template ${cover.id}`}
                        onClick={() => this.handleResumeClick(cover.id)}
                      />
                    </div>
                    <div className="template-actions">
                      <button
                        className="preview-btn"
                        onClick={() => this.showTemplatePreview(cover)}
                      >
                        <FiEye /> Preview
                      </button>
                      <button
                        className="select-btn"
                        onClick={() => this.handleResumeClick(cover.id)}
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {this.renderTemplatePreview()}
        </>
      );
    }

    return null;
  }

  render() {
    const { t } = this.props;
    const { previewTemplate, isLoading } = this.state;
    
    return (
      <div className={`board ${previewTemplate ? 'preview-open' : ''} ${isLoading ? 'is-loading' : ''}`}>
        <CSSTransition appear={true} in={true} classNames="fade" timeout={1000}>
          <div className="templateSelection">
            <h3>
              {this.props.currentStep === "Template Selection" 
                ? t("selectionAction.templates") 
                : t("selectionAction.coverTemplates", "Cover Letter Templates")}
            </h3>
            <p className="template-subheading">
              {this.props.currentStep === "Template Selection"
                ? "Select a template that matches your professional style"
                : "Choose a cover letter template to complement your resume"}
            </p>
            {this.renderTemplates()}
          </div>
        </CSSTransition>
      </div>
    );
  }
}

const MyComponent = withTranslation("common")(BoardSelection);
export default MyComponent;
