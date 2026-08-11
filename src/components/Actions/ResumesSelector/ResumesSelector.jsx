import React, { useEffect, useRef } from "react";
import "./ResumesSelector.scss";
import { motion, AnimatePresence } from "framer-motion";
import { GrClose } from "react-icons/gr";
import { BiSearchAlt } from "react-icons/bi";
// Resume Templates
import Cv1 from "../../../assets/resumesNew/Cv1.JPG";
import Cv3 from "../../../assets/resumesNew/Cv3.JPG";
import Cv2 from "../../../assets/resumesNew/Cv2.JPG";
import Cv4 from "../../../assets/resumesNew/Cv4.JPG";
import Cv5 from "../../../assets/resumesNew/Cv5.JPG";
import Cv6 from "../../../assets/resumesNew/Cv6.JPG";
import Cv7 from "../../../assets/resumesNew/Cv7.JPG";
import Cv8 from "../../../assets/resumesNew/Cv8.JPG";
import Cv9 from "../../../assets/resumesNew/Cv9.JPG";
import Cv10 from "../../../assets/resumesNew/Cv10.JPG";
import Cv11 from "../../../assets/resumesNew/Cv11.JPG";
import Cv12 from "../../../assets/resumesNew/Cv12.JPG";
import Cv13 from "../../../assets/resumesNew/Cv13.JPG";
import Cv14 from "../../../assets/resumesNew/Cv14.JPG";
import Cv15 from "../../../assets/resumesNew/Cv15.JPG";
import Cv16 from "../../../assets/resumesNew/Cv16.JPG";
import Cv17 from "../../../assets/resumesNew/Cv17.JPG";
import Cv18 from "../../../assets/resumesNew/Cv18.JPG";
import Cv19 from "../../../assets/resumesNew/Cv19.JPG";
import Cv20 from "../../../assets/resumesNew/Cv20.JPG";
import Cv21 from "../../../assets/resumesNew/Cv21.JPG";
import Cv22 from "../../../assets/resumesNew/Cv22.JPG";
import Cv23 from "../../../assets/resumesNew/Cv23.JPG";
import Cv24 from "../../../assets/resumesNew/Cv24.JPG";
import Cv25 from "../../../assets/resumesNew/Cv25.JPG";
import Cv26 from "../../../assets/resumesNew/Cv26.JPG";
import Cv27 from "../../../assets/resumesNew/Cv27.JPG";
import Cv28 from "../../../assets/resumesNew/Cv28.JPG";
import Cv29 from "../../../assets/resumesNew/Cv29.JPG";
import Cv30 from "../../../assets/resumesNew/Cv30.JPG";
import Cv31 from "../../../assets/resumesNew/Cv31.JPG";
import Cv32 from "../../../assets/resumesNew/Cv32.JPG";
import Cv33 from "../../../assets/resumesNew/Cv33.JPG";
import Cv34 from "../../../assets/resumesNew/Cv34.JPG";
import Cv35 from "../../../assets/resumesNew/Cv35.JPG";
import Cv36 from "../../../assets/resumesNew/Cv36.JPG";
import Cv37 from "../../../assets/resumesNew/Cv37.JPG";
import Cv38 from "../../../assets/resumesNew/Cv38.JPG";
import Cv39 from "../../../assets/resumesNew/Cv39.JPG";
import Cv40 from "../../../assets/resumesNew/Cv40.JPG";
import Cv41 from "../../../assets/resumesNew/Cv41.JPG";
import Cv42 from "../../../assets/resumesNew/Cv42.JPG";
import Cv43 from "../../../assets/resumesNew/Cv43.JPG";
import Cv44 from "../../../assets/resumesNew/Cv44.JPG";
import Cv45 from "../../../assets/resumesNew/Cv45.JPG";
import Cv46 from "../../../assets/resumesNew/Cv46.JPG";
import Cv47 from "../../../assets/resumesNew/Cv47.JPG";
import Cv48 from "../../../assets/resumesNew/Cv48.JPG";
import Cv49 from "../../../assets/resumesNew/Cv49.JPG";
import Cv50 from "../../../assets/resumesNew/Cv50.JPG";
import Cv51 from "../../../assets/resumesNew/Cv51.JPG";
// Cover Templates
import Cover1 from "../../../assets/coversNew/Cover1.JPG";
import Cover2 from "../../../assets/coversNew/Cover2.JPG";
import Cover3 from "../../../assets/coversNew/Cover3.JPG";
import Cover4 from "../../../assets/coversNew/Cover4.JPG";

const ResumesSelector = (props) => {
  const modalRef = useRef(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedTemplate, setSelectedTemplate] = React.useState("");

  const handleResumeClick = (template) => {
    setSelectedTemplate(template);
    setTimeout(() => {
      props.changeResumeName(template);
      props.handleTemplateShow();
    }, 300);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        props.handleTemplateShow();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [props.handleTemplateShow]);

  // Organize templates into categories for better UX
  const resumeTemplates = [
    { id: "Cv1", image: Cv1, category: "Professional" },
    { id: "Cv51", image: Cv51, category: "Professional" },
    { id: "Cv2", image: Cv2, category: "Professional" },
    { id: "Cv3", image: Cv3, category: "Creative" },
    { id: "Cv4", image: Cv4, category: "Simple" },
    { id: "Cv5", image: Cv5, category: "Modern" },
    { id: "Cv6", image: Cv6, category: "Modern" },
    { id: "Cv7", image: Cv7, category: "Simple" },
    { id: "Cv8", image: Cv8, category: "Professional" },
    { id: "Cv9", image: Cv9, category: "Creative" },
    { id: "Cv10", image: Cv10, category: "Modern" },
    { id: "Cv11", image: Cv11, category: "Professional" },
    { id: "Cv12", image: Cv12, category: "Creative" },
    { id: "Cv13", image: Cv13, category: "Simple" },
    { id: "Cv14", image: Cv14, category: "Modern" },
    { id: "Cv15", image: Cv15, category: "Professional" },
    { id: "Cv16", image: Cv16, category: "Professional" },
    { id: "Cv17", image: Cv17, category: "Professional" },
    { id: "Cv18", image: Cv18, category: "Professional" },
    { id: "Cv19", image: Cv19, category: "Professional" },
    { id: "Cv20", image: Cv20, category: "Professional" },
    { id: "Cv21", image: Cv21, category: "Professional" },
    { id: "Cv22", image: Cv22, category: "Professional" },
    { id: "Cv23", image: Cv23, category: "Professional" },
    { id: "Cv24", image: Cv24, category: "Professional" },
    { id: "Cv25", image: Cv25, category: "Professional" },
    { id: "Cv26", image: Cv26, category: "Professional" },
    { id: "Cv27", image: Cv27, category: "Professional" },
    { id: "Cv28", image: Cv28, category: "Professional" },
    { id: "Cv29", image: Cv29, category: "Professional" },
    { id: "Cv30", image: Cv30, category: "Professional" },
    { id: "Cv31", image: Cv31, category: "Professional" },
    { id: "Cv32", image: Cv32, category: "Professional" },
    { id: "Cv33", image: Cv33, category: "Professional" },
    { id: "Cv34", image: Cv34, category: "Professional" },
    { id: "Cv35", image: Cv35, category: "Professional" },
    { id: "Cv36", image: Cv36, category: "Professional" },
    { id: "Cv37", image: Cv37, category: "Professional" },
    { id: "Cv38", image: Cv38, category: "Professional" },
    { id: "Cv39", image: Cv39, category: "Professional" },
    { id: "Cv40", image: Cv40, category: "Professional" },
    { id: "Cv41", image: Cv41, category: "Professional" },
    { id: "Cv42", image: Cv42, category: "Professional" },
    { id: "Cv43", image: Cv43, category: "Professional" },
    { id: "Cv44", image: Cv44, category: "Professional" },
    { id: "Cv45", image: Cv45, category: "Professional" },
    { id: "Cv46", image: Cv46, category: "Professional" },
    { id: "Cv47", image: Cv47, category: "Professional" },
    { id: "Cv48", image: Cv48, category: "Professional" },
    { id: "Cv49", image: Cv49, category: "Professional" },
    { id: "Cv50", image: Cv50, category: "Professional" },
    { id: "Cv51", image: Cv51, category: "Professional" },
  ];

  const coverTemplates = [
    { id: "Cover1", image: Cover1, category: "Professional" },
    { id: "Cover2", image: Cover2, category: "Modern" },
    { id: "Cover3", image: Cover3, category: "Simple" },
    { id: "Cover4", image: Cover4, category: "Creative" },
  ];

  const filteredTemplates =
    props.currentStep === "Adding Data"
      ? resumeTemplates.filter(
          (template) =>
            template.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : coverTemplates.filter(
          (template) =>
            template.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.category.toLowerCase().includes(searchTerm.toLowerCase())
        );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="welcome_select_template"
    >
      <motion.div
        ref={modalRef}
        initial={{ translateX: 700 }}
        animate={{ translateX: 0 }}
        exit={{ translateX: 400 }}
        transition={{ duration: 0.3 }}
        className="select_body"
      >
        <div className="select_header">
          <h2>
            {props.currentStep === "Adding Data"
              ? "Select Resume Template"
              : "Select Cover Letter Template"}
          </h2>
          <button
            onClick={props.handleTemplateShow}
            className="select_close_button"
            aria-label="Close"
          >
            <GrClose className="select_close_icon" />
          </button>
        </div>

        <p className="select_desc">
          {props.currentStep === "Adding Data"
            ? "Choose a resume template that best showcases your skills and experience. Each design is professionally crafted to help you stand out and make a strong impression."
            : "Select a cover letter template that complements your resume. A well-designed cover letter helps you tell your story and explain why you're the perfect candidate."}
        </p>

        <div className="select_resumes">
          {filteredTemplates.length > 0 ? (
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleResumeClick(template.id)}
                className={`select_resume_item ${
                  selectedTemplate === template.id ? "selected" : ""
                }`}
                data-category={template.category}
              >
                <img src={template.image} alt={template.id} />
              </div>
            ))
          ) : (
            <div className="no-results">
              <p>No templates match your search. Try different keywords.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ResumesSelector;
