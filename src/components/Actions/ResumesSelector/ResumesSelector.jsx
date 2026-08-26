import React, { useEffect, useRef } from "react";
import "./ResumesSelector.scss";
import { motion, AnimatePresence } from 'framer-motion';
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
import { TEMPLATE_CATALOG, templateAccessibleLabel } from "../../../utils/templateCatalog";

// Preview artwork keyed by id; every other card attribute comes from the
// authoritative catalog so the picker cannot drift from the render engine.
const RESUME_PREVIEWS = {
  Cv1, Cv2, Cv3, Cv4, Cv5, Cv6, Cv7, Cv8, Cv9, Cv10, Cv11, Cv12, Cv13, Cv14, Cv15, Cv16, Cv17,
  Cv18, Cv19, Cv20, Cv21, Cv22, Cv23, Cv24, Cv25, Cv26, Cv27, Cv28, Cv29, Cv30, Cv31, Cv32,
  Cv33, Cv34, Cv35, Cv36, Cv37, Cv38, Cv39, Cv40, Cv41, Cv42, Cv43, Cv44, Cv45, Cv46, Cv47,
  Cv48, Cv49, Cv50, Cv51,
};

const ResumesSelector = (props) => {
  const modalRef = useRef(null);
  const [searchTerm] = React.useState("");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.handleTemplateShow]);

  // One card per registered template, named and categorised from the render
  // engine's own theme presets. The previous hand-written array listed Cv51
  // twice (52 cards, duplicate React key) and mislabelled the second copy.
  const resumeTemplates = TEMPLATE_CATALOG.map((entry) => ({
    id: entry.id,
    image: RESUME_PREVIEWS[entry.id],
    category: entry.category,
    name: entry.name,
  }));

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
            (template.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
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
              <button
                type="button"
                key={template.id}
                onClick={() => handleResumeClick(template.id)}
                className={`select_resume_item ${
                  selectedTemplate === template.id ? "selected" : ""
                }`}
                data-category={template.category}
                aria-pressed={selectedTemplate === template.id}
                aria-label={
                  template.name
                    ? templateAccessibleLabel(template.id)
                    : `Select ${template.id} template`
                }
              >
                <img
                  src={template.image}
                  alt={
                    template.name
                      ? `${template.name} template preview`
                      : `${template.id} template preview`
                  }
                  loading="lazy"
                />
              </button>
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
