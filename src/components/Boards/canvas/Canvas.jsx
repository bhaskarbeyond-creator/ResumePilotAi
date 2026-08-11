import React, { Component } from "react";
import Cv1New from "../../../cv-templates/cv1/Cv1";
import Cv2New from "../../../cv-templates/cv2/Cv2";
import Cv3New from "../../../cv-templates/cv3/Cv3";
import Cv4New from "../../../cv-templates/cv4/Cv4";
import Cv5New from "../../../cv-templates/cv5/Cv5";
import Cv6New from "../../../cv-templates/cv6/Cv6";
import Cv7New from "../../../cv-templates/cv7/Cv7";
import Cv11 from "../../../cv-templates/cv11/Cv11";
import Cv12 from "../../../cv-templates/cv12/Cv12";
import Cv13 from "../../../cv-templates/cv13/Cv13";
import Cv14 from "../../../cv-templates/cv14/Cv14";
import Cv15 from "../../../cv-templates/cv15/Cv15";
import Cv16 from "../../../cv-templates/cv16/Cv16";
import Cv17 from "../../../cv-templates/cv17/Cv17";
import Cv18 from "../../../cv-templates/cv18/Cv18";
import Cv19 from "../../../cv-templates/cv19/Cv19";
import Cv8 from "../../../cv-templates/cv8/Cv8";
import Cv9 from "../../../cv-templates/cv9/Cv9";
import Cv10 from "../../../cv-templates/cv10/Cv10";
import Cover1 from "../../../cv-templates/cover1/Cover1";
import Cover2 from "../../../cv-templates/cover2/Cover2";
import Cover3 from "../../../cv-templates/cover3/Cover3";
import Cover4 from "../../../cv-templates/cover4/Cover4";
import Cv20 from "../../../cv-templates/cv20/Cv20";
import Cv21 from "../../../cv-templates/cv21/Cv21";
import Cv22 from "../../../cv-templates/cv22/Cv22";
import Cv23 from "../../../cv-templates/cv23/Cv23";
import Cv24 from "../../../cv-templates/cv24/Cv24";
import Cv25 from "../../../cv-templates/cv25/Cv25";
import Cv26 from "../../../cv-templates/cv26/Cv26";
import Cv27 from "../../../cv-templates/cv27/Cv27";
import Cv28 from "../../../cv-templates/cv28/Cv28";
import Cv29 from "../../../cv-templates/cv29/Cv29";
import Cv30 from "../../../cv-templates/cv30/Cv30";
import Cv31 from "../../../cv-templates/cv31/Cv31";
import Cv32 from "../../../cv-templates/cv32/Cv32";
import Cv33 from "../../../cv-templates/cv33/Cv33";
import Cv34 from "../../../cv-templates/cv34/Cv34";
import Cv35 from "../../../cv-templates/cv35/Cv35";
import Cv36 from "../../../cv-templates/cv36/Cv36";
import Cv37 from "../../../cv-templates/cv37/Cv37";
import Cv38 from "../../../cv-templates/cv38/Cv38";
import Cv39 from "../../../cv-templates/cv39/Cv39";
import Cv40 from "../../../cv-templates/cv40/Cv40";
import Cv41 from "../../../cv-templates/cv41/Cv41";
import Cv42 from "../../../cv-templates/cv42/Cv42";
import Cv43 from "../../../cv-templates/cv43/Cv43";
import Cv44 from "../../../cv-templates/cv44/Cv44";
import Cv45 from "../../../cv-templates/cv45/Cv45";
import Cv46 from "../../../cv-templates/cv46/Cv46";
import Cv47 from "../../../cv-templates/cv47/Cv47";
import Cv48 from "../../../cv-templates/cv48/Cv48";
import Cv49 from "../../../cv-templates/cv49/Cv49";
import Cv50 from "../../../cv-templates/cv50/Cv50";
import Cv51 from "../../../cv-templates/cv51/Cv51";

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
    const { currentPage, pageHeight, isLoading } = this.state;
    const { values, currentResumeName } = this.props;

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
    const { values, currentResumeName } = this.props;

    switch (currentResumeName) {
      case "Cv1":
        return <Cv1New values={values} />;
      case "Cv2":
        return <Cv2New values={values} />;
      case "Cv3":
        return <Cv3New values={values} />;
      case "Cv4":
        return <Cv4New values={values} />;
      case "Cv5":
        return <Cv5New values={values} />;
      case "Cv6":
        return <Cv6New values={values} />;
      case "Cv7":
        return <Cv7New values={values} />;
      case "Cv8":
        return <Cv8 values={values} />;
      case "Cv9":
        return <Cv9 values={values} />;
      case "Cv10":
        return <Cv10 values={values} />;
      case "Cv11":
        return <Cv11 values={values} />;
      case "Cv12":
        return <Cv12 values={values} />;
      case "Cv13":
        return <Cv13 values={values} />;
      case "Cv14":
        return <Cv14 values={values} />;
      case "Cv15":
        return <Cv15 values={values} />;
      case "Cv16":
        return <Cv16 values={values} />;
      case "Cv17":
        return <Cv17 values={values} />;
      case "Cv18":
        return <Cv18 values={values} />;
      case "Cv19":
        return <Cv19 values={values} />;
      case "Cv20":
        return <Cv20 values={values} />;
      case "Cv21":
        return <Cv21 values={values} />;
      case "Cv22":
        return <Cv22 values={values} />;
      case "Cv23":
        return <Cv23 values={values} />;
      case "Cv24":
        return <Cv24 values={values} />;
      case "Cv25":
        return <Cv25 values={values} />;
      case "Cv26":
        return <Cv26 values={values} />;
      case "Cv27":
        return <Cv27 values={values} />;
      case "Cv28":
        return <Cv28 values={values} />;
      case "Cv29":
        return <Cv29 values={values} />;
      case "Cv30":
        return <Cv30 values={values} />;
      case "Cv31":
        return <Cv31 values={values} />;
      case "Cv32":
        return <Cv32 values={values} />;
      case "Cv33":
        return <Cv33 values={values} />;
      case "Cv34":
        return <Cv34 values={values} />;
      case "Cv35":
        return <Cv35 values={values} />;
      case "Cv36":
        return <Cv36 values={values} />;
      case "Cv37":
        return <Cv37 values={values} />;
      case "Cv38":
        return <Cv38 values={values} />;
      case "Cv39":
        return <Cv39 values={values} />;
      case "Cv40":
        return <Cv40 values={values} />;
      case "Cv41":
        return <Cv41 values={values} />;
      case "Cv42":
        return <Cv42 values={values} />;
      case "Cv43":
        return <Cv43 values={values} />;
      case "Cv44":
        return <Cv44 values={values} />;
      case "Cv45":
        return <Cv45 values={values} />;
      case "Cv46":
        return <Cv46 values={values} />;
      case "Cv47":
        return <Cv47 values={values} />;
      case "Cv48":
        return <Cv48 values={values} />;
      case "Cv49":
        return <Cv49 values={values} />;
      case "Cv50":
        return <Cv50 values={values} />;
      case "Cv51":
        return <Cv51 values={values} />;
      case "Cover1":
        return <Cover1 values={values} />;
      case "Cover2":
        return <Cover2 values={values} />;
      case "Cover3":
        return <Cover3 values={values} />;
      case "Cover4":
        return <Cover4 values={values} />;
      default:
        return null;
    }
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
