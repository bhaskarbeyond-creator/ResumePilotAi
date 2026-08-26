import React, { Component } from "react";
import TemplateRenderer from '../../TemplateRenderer';

class Canvas extends Component {
  constructor(props) {
    super(props);
    this.currentHeight = 0;
    this.state = {
      currentPage: 1,
      totalPages: 1,
      pageHeight: 1123, // A4 height in pixels at 96 DPI
      resumeHeight: 0,
      isLoading: true,
    };

    this.resumeRef = React.createRef();
    this.handleNextPage = this.handleNextPage.bind(this);
    this.handlePrevPage = this.handlePrevPage.bind(this);
    this.calculatePages = this.calculatePages.bind(this);
  }

  componentDidMount() {
    // Calculate total pages when component mounts
    window.addEventListener("resize", this.calculatePages);
    // Wait for resume to render before calculating
    setTimeout(this.calculatePages, 500);
  }

  componentDidUpdate(prevProps) {
    // Recalculate when resume template changes
    if (prevProps.currentResumeName !== this.props.currentResumeName) {
      this.setState({ isLoading: true });
      setTimeout(this.calculatePages, 500);
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.calculatePages);
  }

  calculatePages() {
    if (this.resumeRef.current) {
      const resumeHeight = this.resumeRef.current.scrollHeight;
      const { pageHeight } = this.state;
      const totalPages = Math.max(1, Math.ceil(resumeHeight / pageHeight));

      this.setState({
        totalPages,
        resumeHeight,
        isLoading: false,
      });
    }
  }

  handleNextPage() {
    this.setState((prevState) => ({
      currentPage: Math.min(prevState.currentPage + 1, prevState.totalPages),
    }));
  }

  handlePrevPage() {
    this.setState((prevState) => ({
      currentPage: Math.max(prevState.currentPage - 1, 1),
    }));
  }

  renderPagination() {
    const { currentPage, totalPages, isLoading } = this.state;

    if (isLoading || totalPages <= 1) return null;

    return (
      <div className="pagination-controls" style={styles.paginationControls}>
        <button
          onClick={this.handlePrevPage}
          disabled={currentPage === 1}
          style={{
            ...styles.paginationButton,
            opacity: currentPage === 1 ? 0.5 : 1,
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
          }}
        >
          &laquo; Prev
        </button>

        <div style={styles.pageIndicator}>
          Page {currentPage} of {totalPages}
        </div>

        <button
          onClick={this.handleNextPage}
          disabled={currentPage === totalPages}
          style={{
            ...styles.paginationButton,
            opacity: currentPage === totalPages ? 0.5 : 1,
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
          }}
        >
          Next &raquo;
        </button>
      </div>
    );
  }

  renderResumeWithPagination() {
    const { currentPage, pageHeight } = this.state;
    const { _values } = this.props;

    // Style for the container with controlled height and overflow
    const containerStyle = {
      height: `${pageHeight}px`,
      overflow: "",
      position: "relative",
    };

    // Style for the resume content that will be positioned based on current page
    const resumeStyle = {
      position: "absolute",
      top: `-${(currentPage - 1) * pageHeight}px`,
      width: "100%",
    };

    return (
      <div style={{ position: "relative" }}>
        <div style={containerStyle}>
          <div ref={this.resumeRef} style={resumeStyle}>
            {this.renderResumeTemplate()}
          </div>
        </div>
      </div>
    );
  }

  renderResumeTemplate() {
    const { values, currentResumeName, language = 'en' } = this.props;
    return <TemplateRenderer templateId={currentResumeName || 'Cv1'} values={values} language={language} />;
  }

  render() {
    return (
      <div  style={{ color: "black" }}>{this.renderResumeWithPagination()}</div>
    );
  }
}

// Styles for pagination controls
const styles = {
  paginationControls: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "15px 0",
    backgroundColor: "#fff",
    borderTop: "1px solid #eee",
    marginTop: "10px",
  },
  paginationButton: {
    backgroundColor: "#4a6cf7",
    color: "white",
    border: "none",
    borderRadius: "4px",
    padding: "8px 16px",
    margin: "0 10px",
    fontSize: "14px",
    fontWeight: "bold",
    transition: "all 0.3s ease",
    outline: "none",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  },
  pageIndicator: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#333333",
    margin: "0 15px",
  },
};

export default Canvas;
