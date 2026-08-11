import React, { Component } from "react";
import {
  FiArrowLeft,
  FiUser,
  FiBriefcase,
  FiAward,
  FiTarget,
  FiChevronRight,
  FiX,
  FiRefreshCw,
  FiZap,
  FiCheck,
  FiBold,
  FiItalic,
  FiUnderline,
  FiList,
  FiHash,
  FiChevronLeft,
  FiMinus,
  FiCornerDownLeft,
  FiChevronDown,
  FiEdit3,
} from "react-icons/fi";
import config from "../../../conf/configuration";
import "./LexicalStyles.css";

// Lexical imports
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import {
  ListItemNode,
  ListNode,
  $isListNode,
  $isListItemNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $createListItemNode,
  $createListNode,
} from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  createEditor,
} from "lexical";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import {
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  KEY_ENTER_COMMAND,
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from "lexical";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $getNearestNodeOfType } from "@lexical/utils";
import { useEffect, useCallback, useState, useRef } from "react";

// Lexical theme
const theme = {
  ltr: "ltr",
  rtl: "rtl",
  placeholder: "editor-placeholder",
  paragraph: "editor-paragraph",
  quote: "editor-quote",
  heading: {
    h1: "editor-heading-h1",
    h2: "editor-heading-h2",
    h3: "editor-heading-h3",
    h4: "editor-heading-h4",
    h5: "editor-heading-h5",
  },
  list: {
    nested: {
      listitem: "editor-nested-listitem",
    },
    ol: "editor-list-ol",
    ul: "editor-list-ul",
    listitem: "editor-listitem",
  },
  image: "editor-image",
  link: "editor-link",
  text: {
    bold: "editor-text-bold",
    italic: "editor-text-italic",
    overflowed: "editor-text-overflowed",
    hashtag: "editor-text-hashtag",
    underline: "editor-text-underline",
    strikethrough: "editor-text-strikethrough",
    underlineStrikethrough: "editor-text-underlineStrikethrough",
    code: "editor-text-code",
  },
  code: "editor-code",
  codeHighlight: {
    atrule: "editor-tokenAttr",
    attr: "editor-tokenAttr",
    boolean: "editor-tokenProperty",
    builtin: "editor-tokenSelector",
    cdata: "editor-tokenComment",
    char: "editor-tokenSelector",
    class: "editor-tokenFunction",
    "class-name": "editor-tokenFunction",
    comment: "editor-tokenComment",
    constant: "editor-tokenProperty",
    deleted: "editor-tokenProperty",
    doctype: "editor-tokenComment",
    entity: "editor-tokenOperator",
    function: "editor-tokenFunction",
    important: "editor-tokenVariable",
    inserted: "editor-tokenSelector",
    keyword: "editor-tokenAttr",
    namespace: "editor-tokenVariable",
    number: "editor-tokenProperty",
    operator: "editor-tokenOperator",
    prolog: "editor-tokenComment",
    property: "editor-tokenProperty",
    punctuation: "editor-tokenPunctuation",
    regex: "editor-tokenVariable",
    selector: "editor-tokenSelector",
    string: "editor-tokenSelector",
    symbol: "editor-tokenProperty",
    tag: "editor-tokenProperty",
    url: "editor-tokenOperator",
    variable: "editor-tokenVariable",
  },
};

// Custom plugin to handle onChange events
function OnChangePlugin({ onChange, isExternalUpdate }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      // Only call onChange if this is not an external update
      if (!isExternalUpdate.current) {
        editorState.read(() => {
          // Use Lexical's built-in HTML serialization to preserve formatting
          const htmlString = $generateHtmlFromNodes(editor, null);
          onChange(htmlString);
        });
      }
    });
  }, [editor, onChange, isExternalUpdate]);

  return null;
}

// Plugin to expose editor instance to parent component
function EditorRefPlugin({ onEditorReady }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  return null;
}

// Plugin to initialize editor with HTML content and handle updates
function InitialContentPlugin({ htmlContent, isExternalUpdate }) {
  const [editor] = useLexicalComposerContext();
  const [hasInitialized, setHasInitialized] = useState(false);
  const lastSetContentRef = useRef("");

  useEffect(() => {
    // Only update in these cases:
    // 1. Initial load when editor is empty and we have content
    // 2. When we receive significantly different content (like from AI)

    if (!hasInitialized && htmlContent && htmlContent.trim()) {
      console.log("Initializing editor with HTML content:", htmlContent);

      isExternalUpdate.current = true;

      editor.update(() => {
        try {
          const parser = new DOMParser();
          const dom = parser.parseFromString(htmlContent, "text/html");
          const nodes = $generateNodesFromDOM(editor, dom);

          const root = $getRoot();
          root.clear();
          root.append(...nodes);

          console.log("Successfully initialized editor content");
          setHasInitialized(true);
          lastSetContentRef.current = htmlContent;
        } catch (error) {
          console.error("Error initializing editor content:", error);
          setHasInitialized(true);
        } finally {
          // Reset the flag after the update
          setTimeout(() => {
            isExternalUpdate.current = false;
          }, 100);
        }
      });
    } else if (hasInitialized && htmlContent !== lastSetContentRef.current) {
      // Only update if this is a major external content change (not just user typing)
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const currentText = root.getTextContent().trim();
        const newText = htmlContent?.replace(/<[^>]*>/g, "").trim() || "";

        // Only update if:
        // 1. Editor is completely empty and we have content to add
        // 2. The new content is significantly different (like AI-generated content)
        // 3. Content was cleared externally
        const shouldUpdate =
          (!currentText && newText) || // Empty editor, new content
          (!newText && currentText) || // Content was cleared
          (newText &&
            currentText &&
            newText.length > currentText.length + 50) || // Significant addition (like AI)
          (newText &&
            currentText &&
            Math.abs(newText.length - currentText.length) >
              Math.max(newText.length, currentText.length) * 0.5); // Major content change

        if (shouldUpdate) {
          console.log("Updating editor with external content:", htmlContent);

          isExternalUpdate.current = true;

          editor.update(() => {
            try {
              if (!htmlContent || !htmlContent.trim()) {
                root.clear();
                const paragraph = $createParagraphNode();
                root.append(paragraph);
                console.log("Cleared editor content");
              } else {
                const parser = new DOMParser();
                const dom = parser.parseFromString(htmlContent, "text/html");
                const nodes = $generateNodesFromDOM(editor, dom);

                root.clear();
                root.append(...nodes);
                console.log("Successfully updated editor content");
              }

              lastSetContentRef.current = htmlContent || "";
            } catch (error) {
              console.error("Error updating editor content:", error);
              lastSetContentRef.current = htmlContent || "";
            } finally {
              // Reset the flag after the update
              setTimeout(() => {
                isExternalUpdate.current = false;
              }, 100);
            }
          });
        } else {
          // Just update the reference without changing editor content
          lastSetContentRef.current = htmlContent || "";
        }
      });
    }
  }, [editor, htmlContent, hasInitialized, isExternalUpdate]);

  return null;
}

// Plugin to handle keyboard shortcuts for better list UX
function ListKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Handle Enter key
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();

          // Check if we're in a list item
          if (
            $isListItemNode(anchorNode) ||
            $getNearestNodeOfType(anchorNode, ListNode)
          ) {
            const listItemNode = $isListItemNode(anchorNode)
              ? anchorNode
              : anchorNode.getParent();

            // If the list item is empty, exit the list and create a normal paragraph
            if (
              $isListItemNode(listItemNode) &&
              listItemNode.getTextContent().trim() === ""
            ) {
              event.preventDefault();

              editor.update(() => {
                // Create a new paragraph after the list
                const newParagraph = $createParagraphNode();
                const textNode = $createTextNode("");
                newParagraph.append(textNode);

                // Find the list node
                const listNode = $getNearestNodeOfType(listItemNode, ListNode);
                if (listNode) {
                  // Insert the paragraph after the list
                  listNode.insertAfter(newParagraph);

                  // Remove the empty list item
                  if (listNode.getChildren().length === 1) {
                    // If this is the only item, remove the entire list
                    listNode.remove();
                  } else {
                    // Otherwise just remove this empty item
                    listItemNode.remove();
                  }

                  // Focus the new paragraph
                  newParagraph.selectEnd();
                }
              });

              return true;
            }
          }
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Handle Tab and Shift+Tab for indent/outdent
    const unregisterKeyDown = editor.registerRootListener(
      (rootElement, prevRootElement) => {
        const onKeyDown = (event) => {
          if (event.key === "Tab") {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchorNode = selection.anchor.getNode();
              if (
                $isListItemNode(anchorNode) ||
                $getNearestNodeOfType(anchorNode, ListNode)
              ) {
                event.preventDefault();

                if (event.shiftKey) {
                  // Shift+Tab = Outdent
                  editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
                } else {
                  // Tab = Indent
                  editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
                }
                return true;
              }
            }
          }
          return false;
        };

        if (prevRootElement !== null) {
          prevRootElement.removeEventListener("keydown", onKeyDown);
        }
        if (rootElement !== null) {
          rootElement.addEventListener("keydown", onKeyDown);
        }
      }
    );

    return () => {
      unregisterEnter();
      unregisterKeyDown();
    };
  }, [editor]);

  return null;
}

// Custom function to exit list and create normal paragraph
function exitListToNormalText(editor) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();

      // Find the current list item or list
      let listItemNode = null;
      if ($isListItemNode(anchorNode)) {
        listItemNode = anchorNode;
      } else {
        listItemNode = $getNearestNodeOfType(anchorNode, ListItemNode);
      }

      if (listItemNode) {
        // Find the list node
        const listNode = $getNearestNodeOfType(listItemNode, ListNode);
        if (listNode) {
          // Create a new paragraph after the list
          const newParagraph = $createParagraphNode();
          const textNode = $createTextNode("");
          newParagraph.append(textNode);

          // Insert the paragraph after the list
          listNode.insertAfter(newParagraph);

          // Focus the new paragraph
          newParagraph.selectEnd();
        }
      }
    }
  });
}

// Custom function to create sub-bullets properly
function createSubBullet(editor, listType) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();

      // Find the current list item
      let listItemNode = null;
      if ($isListItemNode(anchorNode)) {
        listItemNode = anchorNode;
      } else {
        listItemNode = anchorNode.getParent();
        while (listItemNode && !$isListItemNode(listItemNode)) {
          listItemNode = listItemNode.getParent();
        }
      }

      if (listItemNode && $isListItemNode(listItemNode)) {
        // Create a new nested list
        const nestedList = $createListNode(listType);
        const newListItem = $createListItemNode();

        // Add some text content to the new list item
        const textNode = $createTextNode("");
        newListItem.append(textNode);
        nestedList.append(newListItem);

        // Append the nested list to the current list item
        listItemNode.append(nestedList);

        // Focus the new list item
        newListItem.selectEnd();
      }
    }
  });
}

// Toolbar component
function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = React.useState(false);
  const [isItalic, setIsItalic] = React.useState(false);
  const [isUnderline, setIsUnderline] = React.useState(false);
  const [isUnorderedList, setIsUnorderedList] = React.useState(false);
  const [isOrderedList, setIsOrderedList] = React.useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update formatting states
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));

      // Check for list states
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        const listNode = $getNearestNodeOfType(anchorNode, ListNode);
        if ($isListNode(listNode)) {
          const listType = listNode.getListType();
          setIsUnorderedList(listType === "bullet");
          setIsOrderedList(listType === "number");
        } else {
          setIsUnorderedList(false);
          setIsOrderedList(false);
        }
      }
    }
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  return (
    <div className="toolbar flex items-center space-x-1 mb-2 p-2 bg-gray-50 rounded-t-[3px] border-b border-gray-200">
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        }}
        className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${
          isBold ? "bg-blue-100 text-blue-600" : "text-gray-600"
        }`}
        aria-label="Format Bold"
      >
        <FiBold className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        }}
        className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${
          isItalic ? "bg-blue-100 text-blue-600" : "text-gray-600"
        }`}
        aria-label="Format Italics"
      >
        <FiItalic className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
        }}
        className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${
          isUnderline ? "bg-blue-100 text-blue-600" : "text-gray-600"
        }`}
        aria-label="Format Underline"
      >
        <FiUnderline className="w-4 h-4" />
      </button>
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      <button
        type="button"
        onClick={() => {
          if (isUnorderedList) {
            // If already in bullet list, create sub-bullet properly
            createSubBullet(editor, "bullet");
          } else {
            // If not in bullet list, create new bullet list
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
          }
        }}
        className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${
          isUnorderedList ? "bg-blue-100 text-blue-600" : "text-gray-600"
        }`}
        aria-label={
          isUnorderedList ? "Create Sub-bullet" : "Create Bullet List"
        }
        title={
          isUnorderedList ? "Create Sub-bullet (Tab)" : "Create Bullet List"
        }
      >
        <FiList className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (isOrderedList) {
            // If already in numbered list, create sub-item properly
            createSubBullet(editor, "number");
          } else {
            // If not in numbered list, create new numbered list
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
          }
        }}
        className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${
          isOrderedList ? "bg-blue-100 text-blue-600" : "text-gray-600"
        }`}
        aria-label={
          isOrderedList ? "Create Sub-number" : "Create Numbered List"
        }
        title={
          isOrderedList ? "Create Sub-number (Tab)" : "Create Numbered List"
        }
      >
        <FiHash className="w-4 h-4" />
      </button>
      {/* Show outdent and remove list buttons only when in a list */}
      {(isUnorderedList || isOrderedList) && (
        <>
          <button
            type="button"
            onClick={() => {
              editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
            }}
            className="toolbar-item p-2 rounded hover:bg-gray-200 transition-colors text-gray-600"
            aria-label="Outdent (Move Left)"
            title="Outdent (Shift+Tab)"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              exitListToNormalText(editor);
            }}
            className="toolbar-item p-2 rounded hover:bg-gray-200 transition-colors text-gray-600"
            aria-label="Exit List"
            title="Exit List (Enter on empty line)"
          >
            <FiCornerDownLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
            }}
            className="toolbar-item p-2 rounded hover:bg-gray-200 transition-colors text-gray-600"
            aria-label="Remove List"
            title="Remove List"
          >
            <FiMinus className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}

class SimpleTextarea extends Component {
  constructor(props) {
    super(props);
    this.state = {
      suggestionShowed: false,
      categories: this.props.categories,
      phrases: [],
      // AI Helper states
      aiHelperOpen: false,
      aiToolsDropdownOpen: false,
      currentStep: 0,
      aiAnswers: {
        name: "",
        jobTitle: "",
        experience: "",
        skills: "",
        achievement: "",
        summaryType: "professional",
      },
      generatedSummary: "",
      isGenerating: false,
      generationError: null,
      // Grammar checker states
      isCheckingGrammar: false,
      grammarResults: null,
      grammarError: null,
      showGrammarPanel: false,
      currentCorrectionIndex: 0,
      // Lexical editor value
      editorValue: this.props.value || "",
    };

    // Ref to track external updates to prevent onChange feedback loop
    this.isExternalUpdate = React.createRef();
    this.isExternalUpdate.current = false;

    // Ref to store the Lexical editor instance
    this.editorInstance = null;
    this.handleInputChange = this.handleInputChange.bind(this);
    this.adjustTextarea = this.adjustTextarea.bind(this);
    this.addParagraph = this.addParagraph.bind(this);
    this.handleAiAnswerChange = this.handleAiAnswerChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.nextStep = this.nextStep.bind(this);
    this.prevStep = this.prevStep.bind(this);
    this.generateSummary = this.generateSummary.bind(this);
    this.resetAiHelper = this.resetAiHelper.bind(this);
    this.addGeneratedSummary = this.addGeneratedSummary.bind(this);
    this.onEditorChange = this.onEditorChange.bind(this);
    this.toggleAiToolsDropdown = this.toggleAiToolsDropdown.bind(this);
    this.handleGrammarCheck = this.handleGrammarCheck.bind(this);
    this.closeGrammarPanel = this.closeGrammarPanel.bind(this);
    this.applySuggestion = this.applySuggestion.bind(this);
    this.dismissSuggestion = this.dismissSuggestion.bind(this);
    this.nextCorrection = this.nextCorrection.bind(this);
    this.prevCorrection = this.prevCorrection.bind(this);
    this.onEditorReady = this.onEditorReady.bind(this);

    // Cache AI questions for easier access
    this.aiQuestions = this.getAiQuestions();
  }

  // Lexical editor configuration
  getInitialConfig() {
    return {
      namespace: "ResumenEditor",
      theme,
      onError: (error) => {
        console.error(error);
      },
      nodes: [
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        TableNode,
        TableCellNode,
        TableRowNode,
        AutoLinkNode,
        LinkNode,
      ],
    };
  }

  // AI Helper Questions Configuration
  getAiQuestions() {
    return [
      {
        id: "name",
        title: "What's your full name?",
        placeholder: "Enter your full name",
        icon: <FiUser className="w-4 h-4" />,
        type: "text",
      },
      {
        id: "jobTitle",
        title: "What's your current job title or desired position?",
        placeholder: "e.g., Senior Software Engineer, Marketing Manager",
        icon: <FiBriefcase className="w-4 h-4" />,
        type: "text",
      },
      {
        id: "experience",
        title: "How many years of experience do you have?",
        placeholder: "e.g., 5 years, Entry level, 10+ years",
        icon: <FiTarget className="w-4 h-4" />,
        type: "text",
      },
      {
        id: "skills",
        title: "What are your key skills? (separate with commas)",
        placeholder: "e.g., JavaScript, Project Management, Data Analysis",
        icon: <FiAward className="w-4 h-4" />,
        type: "textarea",
      },
      {
        id: "achievement",
        title: "What's your biggest professional achievement?",
        placeholder: "Describe a key accomplishment or project you're proud of",
        icon: <FiAward className="w-4 h-4" />,
        type: "textarea",
      },
    ];
  }

  handleInputChange(e) {
    this.props.handleInputs(this.props.name, e.target.value);
  }

  adjustTextarea(event) {
    var windowHeight = window.innerHeight;
    var elementHeight = event.target.getBoundingClientRect().top;
    if (elementHeight + 100 > windowHeight) {
      document.getElementById("introd").scrollBy(0, 150);
    }
  }

  // AI Helper Methods
  toggleAiHelper(e) {
    e.preventDefault();
    this.setState((prevState) => ({
      aiHelperOpen: !prevState.aiHelperOpen,
      currentStep: 0,
      generatedSummary: "",
      // Reset aiAnswers only when opening the helper
      aiAnswers: !prevState.aiHelperOpen
        ? {
            name: "",
            jobTitle: "",
            experience: "",
            skills: "",
            achievement: "",
            summaryType: "professional",
          }
        : prevState.aiAnswers,
    }));
  }

  toggleAiToolsDropdown(e) {
    e.preventDefault();
    this.setState((prevState) => ({
      aiToolsDropdownOpen: !prevState.aiToolsDropdownOpen,
    }));
  }

  async handleGrammarCheck(e) {
    e.preventDefault();
    // Close the dropdown
    this.setState({ aiToolsDropdownOpen: false });

    // Get current text and HTML content from editor
    let currentText = "";
    let currentHtml = "";
    if (this.editorInstance) {
      this.editorInstance.getEditorState().read(() => {
        const root = $getRoot();
        currentText = root.getTextContent();
        currentHtml = $generateHtmlFromNodes(this.editorInstance, null);
      });
    } else {
      // Fallback to editorValue if editor instance is not available
      currentText = this.state.editorValue;
      currentHtml = this.state.editorValue;
    }

    // Check if the text is empty or only contains whitespace
    if (!currentText || currentText.trim().length === 0) {
      this.setState({
        grammarResults: {
          hasErrors: false,
          corrections: [],
          overallSuggestion:
            "No text to analyze. Please enter some text to check for grammar errors.",
          isEmpty: true,
        },
        grammarError: null,
        showGrammarPanel: true,
      });
      return;
    }

    // Set loading state
    this.setState({
      isCheckingGrammar: true,
      grammarError: null,
      grammarResults: null,
      showGrammarPanel: true,
      currentCorrectionIndex: 0,
    });

    try {
      // Call the backend API
      const response = await fetch(
        config.provider + "://" + config.backendUrl + "/api/check-grammar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: currentText,
            language: "en", // You can make this dynamic based on user settings
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      this.setState({
        isCheckingGrammar: false,
        grammarResults: data,
        grammarError: null,
      });
    } catch (error) {
      console.error("Error checking grammar:", error);
      this.setState({
        isCheckingGrammar: false,
        grammarError: "Failed to check grammar. Please try again.",
        grammarResults: null,
      });
    }
  }

  closeGrammarPanel() {
    this.setState({
      showGrammarPanel: false,
      grammarResults: null,
      grammarError: null,
      currentCorrectionIndex: 0,
    });
  }

  nextCorrection() {
    const { grammarResults, currentCorrectionIndex } = this.state;
    if (
      grammarResults &&
      grammarResults.corrections &&
      currentCorrectionIndex < grammarResults.corrections.length - 1
    ) {
      this.setState({
        currentCorrectionIndex: currentCorrectionIndex + 1,
      });
    }
  }

  prevCorrection() {
    const { currentCorrectionIndex } = this.state;
    if (currentCorrectionIndex > 0) {
      this.setState({
        currentCorrectionIndex: currentCorrectionIndex - 1,
      });
    }
  }

  applySuggestion(e, correction) {
    e.preventDefault();
    e.stopPropagation();
    const { original, suggestion } = correction;

    // Set the external update flag to prevent onChange from firing
    this.isExternalUpdate.current = true;

    let appliedSuccessfully = false;

    // Update the Lexical editor content directly while preserving all formatting and structures
    if (this.editorInstance) {
      this.editorInstance.update(() => {
        const root = $getRoot();
        
        // Function to recursively search and replace text in Lexical nodes while preserving formatting
        const replaceTextInNodes = (node) => {
          if (node.getTextContent && node.getTextContent().includes(original)) {
            // Check if this is a text node that we can directly modify
            if (node.getType() === 'text') {
              const textContent = node.getTextContent();
              if (textContent.includes(original)) {
                const newText = textContent.replace(original, suggestion);
                
                // Preserve the formatting by getting current format and applying it to new text
                const currentFormat = node.getFormat();
                const currentStyle = node.getStyle();
                
                // Replace the text content while preserving formatting
                node.setTextContent(newText);
                
                // Reapply the formatting if it exists
                if (currentFormat) {
                  node.setFormat(currentFormat);
                }
                if (currentStyle) {
                  node.setStyle(currentStyle);
                }
                
                return true;
              }
            }
            // For other node types, check children
            else {
              const children = node.getChildren();
              for (let child of children) {
                if (replaceTextInNodes(child)) {
                  return true; // Stop after first replacement
                }
              }
            }
          }
          return false;
        };

        // Start the replacement from the root
        const children = root.getChildren();
        for (let child of children) {
          if (replaceTextInNodes(child)) {
            appliedSuccessfully = true;
            break; // Stop after first replacement
          }
        }

        // If the above method didn't work, try a more comprehensive approach
        if (!appliedSuccessfully) {
          // Get all text nodes in the editor
          const textNodes = [];
          const collectTextNodes = (node) => {
            if (node.getType() === 'text') {
              textNodes.push(node);
            } else if (node.getChildren) {
              const children = node.getChildren();
              for (let child of children) {
                collectTextNodes(child);
              }
            }
          };

          const children = root.getChildren();
          for (let child of children) {
            collectTextNodes(child);
          }

          // Find and replace in text nodes while preserving formatting
          for (let textNode of textNodes) {
            const content = textNode.getTextContent();
            if (content.includes(original)) {
              const newContent = content.replace(original, suggestion);
              
              // Preserve the formatting
              const currentFormat = textNode.getFormat();
              const currentStyle = textNode.getStyle();
              
              // Replace text content
              textNode.setTextContent(newContent);
              
              // Reapply formatting
              if (currentFormat) {
                textNode.setFormat(currentFormat);
              }
              if (currentStyle) {
                textNode.setStyle(currentStyle);
              }
              
              appliedSuccessfully = true;
              break; // Stop after first replacement
            }
          }
        }

        if (!appliedSuccessfully) {
          console.warn("Could not find and replace text:", original);
        }
      });

      // Get the updated HTML content after the replacement
      let updatedHtmlContent = "";
      this.editorInstance.getEditorState().read(() => {
        updatedHtmlContent = $generateHtmlFromNodes(this.editorInstance, null);
      });

      // Update the component state with the new HTML content (outside of editor update)
      this.setState({
        editorValue: updatedHtmlContent,
      });

      // Trigger the change handler to update parent component (outside of editor update)
      this.props.handleInputs(this.props.name, updatedHtmlContent);
    }

    // Reset the external update flag after a short delay
    setTimeout(() => {
      this.isExternalUpdate.current = false;
    }, 100);

    // Remove this correction from the results by matching the original text and suggestion
    if (this.state.grammarResults) {
      const updatedResults = {
        ...this.state.grammarResults,
        corrections: this.state.grammarResults.corrections.filter(
          (c) => c.original !== original || c.suggestion !== suggestion
        ),
      };
      updatedResults.hasErrors = updatedResults.corrections.length > 0;

      // Adjust current correction index if needed
      let newIndex = this.state.currentCorrectionIndex;
      if (
        newIndex >= updatedResults.corrections.length &&
        updatedResults.corrections.length > 0
      ) {
        newIndex = updatedResults.corrections.length - 1;
      } else if (updatedResults.corrections.length === 0) {
        newIndex = 0;
      }

      this.setState({
        grammarResults: updatedResults,
        currentCorrectionIndex: newIndex,
      });
    }
  }

  dismissSuggestion(e, correction) {
    e.preventDefault();
    e.stopPropagation();
    const { startIndex, endIndex } = correction;

    // Remove this correction from the results
    if (this.state.grammarResults) {
      const updatedResults = {
        ...this.state.grammarResults,
        corrections: this.state.grammarResults.corrections.filter(
          (c) => c.startIndex !== startIndex || c.endIndex !== endIndex
        ),
      };
      updatedResults.hasErrors = updatedResults.corrections.length > 0;

      // Adjust current correction index if needed
      let newIndex = this.state.currentCorrectionIndex;
      if (
        newIndex >= updatedResults.corrections.length &&
        updatedResults.corrections.length > 0
      ) {
        newIndex = updatedResults.corrections.length - 1;
      } else if (updatedResults.corrections.length === 0) {
        newIndex = 0;
      }

      this.setState({
        grammarResults: updatedResults,
        currentCorrectionIndex: newIndex,
      });
    }
  }

  handleAiAnswerChange(field, value) {
    this.setState({
      aiAnswers: {
        ...this.state.aiAnswers,
        [field]: value,
      },
    });
  }

  handleKeyDown(e, isTextarea = false) {
    // For textareas, use Ctrl+Enter to advance
    // For inputs, use Enter to advance
    const shouldAdvance = isTextarea
      ? e.key === "Enter" && e.ctrlKey
      : e.key === "Enter";

    if (shouldAdvance) {
      e.preventDefault();

      const currentAnswer =
        this.state.aiAnswers[this.aiQuestions[this.state.currentStep].id];
      if (currentAnswer && currentAnswer.trim()) {
        if (this.state.currentStep === this.aiQuestions.length - 1) {
          this.generateSummary(e);
        } else {
          this.nextStep(e);
        }
      }
    }
  }

  nextStep(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this.state.currentStep < this.aiQuestions.length - 1) {
      this.setState({ currentStep: this.state.currentStep + 1 });
    } else {
      this.generateSummary(e);
    }
  }

  prevStep(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this.state.currentStep > 0) {
      this.setState({ currentStep: this.state.currentStep - 1 });
    }
  }

  generateSummary(e) {
    if (e) e.preventDefault();
    this.setState({ isGenerating: true, generationError: null }); // Reset error on new attempt

    const { aiAnswers } = this.state;

    // Get current language
    const currentLanguage =
      localStorage.getItem("preferredLanguage") ||
      localStorage.getItem("language") ||
      "en";

    // Call the backend API to generate the summary
    fetch(
      config.provider + "://" + config.backendUrl + "/api/generate-summary",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: aiAnswers.name,
          jobTitle: aiAnswers.jobTitle,
          experience: aiAnswers.experience,
          skills: aiAnswers.skills,
          achievement: aiAnswers.achievement,
          summaryType: aiAnswers.summaryType,
          language: currentLanguage,
        }),
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to generate summary");
        }
        return response.json();
      })
      .then((data) => {
        this.setState({
          generatedSummary: data.summary,
          isGenerating: false,
          currentStep: this.aiQuestions.length,
        });
      })
      .catch((error) => {
        console.error("Error generating summary:", error);

        // Show error message and allow retry
        this.setState({
          isGenerating: false,
          generationError: "Failed to generate summary. Please try again.",
          // currentStep remains at aiQuestions.length to show the error and retry button
        });
      });
  }

  addGeneratedSummary() {
    this.props.handleInputs(this.props.name, this.state.generatedSummary);
    this.setState({ aiHelperOpen: false });
  }

  resetAiHelper() {
    this.setState({
      currentStep: 0,
      aiAnswers: {
        name: "",
        jobTitle: "",
        experience: "",
        skills: "",
        achievement: "",
        summaryType: "professional",
      },
      generatedSummary: "",
      isGenerating: false,
      generationError: null,
    });
  }

  renderGrammarPanel() {
    const {
      showGrammarPanel,
      isCheckingGrammar,
      grammarResults,
      grammarError,
    } = this.state;

    if (!showGrammarPanel) return null;

    return (
      <div className="mb-4 bg-[#f8fffe] border-2 border-[#10b981] border-opacity-20 rounded-[5px] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#10b981] text-white px-5 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <FiEdit3 className="w-4 h-4 text-[#10b981]" />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">Grammar Checker</h3>
              <p className="text-xs text-white text-opacity-80">
                AI-powered grammar and writing suggestions
              </p>
            </div>
          </div>
          <button
            onClick={this.closeGrammarPanel}
            className="group cursor-pointer hover:bg-white hover:bg-opacity-20 p-2 rounded-[3px] transition-colors duration-200"
          >
            <FiX className="w-4 h-4 text-white group-hover:text-[#10b981]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 bg-white">
          {isCheckingGrammar ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-[#10b981] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <FiRefreshCw className="w-8 h-8 text-white animate-spin" />
              </div>
              <p className="text-[#98a1b3] text-[14px] font-medium">
                Checking grammar...
              </p>
              <p className="text-[#98a1b3] text-xs mt-1">
                Please wait while we analyze your text
              </p>
            </div>
          ) : grammarError ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FiX className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-red-600 text-[14px] font-medium mb-2">Error</p>
              <p className="text-gray-600 text-xs">{grammarError}</p>
            </div>
          ) : grammarResults ? (
            <div className="space-y-4">
              {/* Handle empty text case */}
              {grammarResults.isEmpty ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FiEdit3 className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-[14px] font-medium mb-2">
                    No Text to Analyze
                  </p>
                  <p className="text-gray-400 text-xs">
                    Please enter some text to check for grammar errors.
                  </p>
                </div>
              ) : (
                <>
                  {/* Overall feedback */}
                  <div
                    className={`border rounded-[3px] p-4 ${
                      grammarResults.hasErrors
                        ? "bg-orange-50 border-orange-200"
                        : "bg-[#f8fffe] border-[#10b981] border-opacity-20"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                          grammarResults.hasErrors
                            ? "bg-orange-100"
                            : "bg-[#10b981] bg-opacity-10"
                        }`}
                      >
                        {grammarResults.hasErrors ? (
                          <FiEdit3 className="w-3 h-3 text-orange-600" />
                        ) : (
                          <FiCheck className="w-3 h-3 text-[#10b981]" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-[14px] font-semibold text-gray-800 mb-1">
                          {grammarResults.hasErrors
                            ? "Issues Found"
                            : "Analysis Complete"}
                        </h4>
                        <p className="text-[13px] text-gray-600">
                          {grammarResults.overallSuggestion}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Grammar corrections */}
                  {grammarResults.corrections &&
                  grammarResults.corrections.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[14px] font-semibold text-gray-800 flex items-center">
                          <FiEdit3 className="w-4 h-4 mr-2 text-[#10b981]" />
                          Suggestions ({grammarResults.corrections.length})
                        </h4>
                        {grammarResults.corrections.length > 1 && (
                          <div className="flex items-center space-x-2">
                            <span className="text-[13px] text-gray-500">
                              {this.state.currentCorrectionIndex + 1} of{" "}
                              {grammarResults.corrections.length}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={this.prevCorrection}
                                disabled={
                                  this.state.currentCorrectionIndex === 0
                                }
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                              >
                                <FiChevronLeft className="w-4 h-4 text-gray-600" />
                              </button>
                              <button
                                onClick={this.nextCorrection}
                                disabled={
                                  this.state.currentCorrectionIndex ===
                                  grammarResults.corrections.length - 1
                                }
                                className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                              >
                                <FiChevronRight className="w-4 h-4 text-gray-600" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {(() => {
                        const correction =
                          grammarResults.corrections[
                            this.state.currentCorrectionIndex
                          ];
                        return (
                          <div className="bg-gray-50 border border-gray-200 rounded-[3px] p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-3">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      correction.type === "grammar"
                                        ? "bg-blue-100 text-blue-700"
                                        : correction.type === "spelling"
                                        ? "bg-red-100 text-red-700"
                                        : correction.type === "punctuation"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-purple-100 text-purple-700"
                                    }`}
                                  >
                                    {correction.type}
                                  </span>
                                </div>
                                <p className="text-[13px] text-gray-600 mb-3">
                                  {correction.explanation}
                                </p>

                                {/* Improved replacement visual with arrow */}
                                <div className="bg-white border border-gray-200 rounded-[3px] p-3">
                                  <div className="flex items-center space-x-3">
                                    <div className="flex-1">
                                      <div className="text-[11px] font-medium text-gray-500 mb-1">
                                        Original
                                      </div>
                                      <div className="text-[13px] bg-red-50 text-red-700 px-3 py-2 rounded border border-red-200">
                                        "{correction.original}"
                                      </div>
                                    </div>
                                    <div className="flex-shrink-0">
                                      <FiChevronRight className="w-4 h-4 text-gray-400" />
                                    </div>
                                    <div className="flex-1">
                                      <div className="text-[11px] font-medium text-gray-500 mb-1">
                                        Suggested
                                      </div>
                                      <div className="text-[13px] bg-green-50 text-green-700 px-3 py-2 rounded border border-green-200">
                                        "{correction.suggestion}"
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex space-x-2 mt-3">
                              <button
                                onClick={(e) =>
                                  this.applySuggestion(e, correction)
                                }
                                className="px-4 py-2 bg-[#10b981] text-white rounded-[3px] hover:bg-[#059669] transition-colors duration-200 text-[13px] font-medium flex items-center space-x-2"
                              >
                                <FiCheck className="w-3 h-3" />
                                <span>Apply</span>
                              </button>
                              <button
                                onClick={(e) =>
                                  this.dismissSuggestion(e, correction)
                                }
                                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-[3px] hover:bg-gray-400 transition-colors duration-200 text-[13px] font-medium flex items-center space-x-2"
                              >
                                <FiX className="w-3 h-3" />
                                <span>Dismiss</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-16 h-16 bg-[#10b981] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <FiCheck className="w-8 h-8 text-white" />
                      </div>
                      <p className="text-[#10b981] text-[16px] font-semibold mb-2">
                        Excellent!
                      </p>
                      <p className="text-gray-600 text-[14px]">
                        No grammar errors found in your text.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  renderAiHelper() {
    const {
      aiHelperOpen,
      currentStep,
      aiAnswers,
      generatedSummary,
      isGenerating,
    } = this.state;

    if (!aiHelperOpen) return null;

    return (
      <div className="mb-4 bg-[#f9f6fe] border-2 border-[#4a6cf7] border-opacity-20 rounded-[5px] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#4a6cf7] text-white px-5 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <FiZap className="w-4 h-4 text-[#4a6cf7]" />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">
                AI Summary Assistant
              </h3>
              <p className="text-xs text-white text-opacity-80">
                Let AI create your professional summary
              </p>
            </div>
          </div>
          <button
            onClick={(e) => this.toggleAiHelper(e)}
            className="group cursor-pointer hover:bg-white hover:bg-opacity-20 p-2 rounded-[3px] transition-colors duration-200"
          >
            <FiX className="w-4 h-4 text-white group-hover:text-[#4a6cf7]" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-5 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-[#98a1b3] mb-2">
            <span className="font-medium">
              Step {Math.min(currentStep + 1, this.aiQuestions.length)} of{" "}
              {this.aiQuestions.length}
            </span>
            <span>
              {Math.min(
                Math.round(((currentStep + 1) / this.aiQuestions.length) * 100),
                100
              )}
              % Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-[#4a6cf7] h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(
                  ((currentStep + 1) / this.aiQuestions.length) * 100,
                  100
                )}%`,
              }}
            ></div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 bg-white">
          {currentStep < this.aiQuestions.length ? (
            // Question Step
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-[#4a6cf7] bg-opacity-10 rounded-full flex items-center justify-center mt-1 flex-shrink-0">
                  {this.aiQuestions[currentStep].icon}
                </div>
                <div className="flex-1">
                  <h4 className="text-[16px] font-semibold text-gray-800 mb-2">
                    {this.aiQuestions[currentStep].title}
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">
                    {this.aiQuestions[currentStep].type === "textarea"
                      ? "Press Ctrl+Enter to continue"
                      : "Press Enter to continue"}
                  </p>

                  {this.aiQuestions[currentStep].type === "textarea" ? (
                    <textarea
                      value={aiAnswers[this.aiQuestions[currentStep].id]}
                      onChange={(e) =>
                        this.handleAiAnswerChange(
                          this.aiQuestions[currentStep].id,
                          e.target.value
                        )
                      }
                      onKeyDown={(e) => this.handleKeyDown(e, true)}
                      placeholder={this.aiQuestions[currentStep].placeholder}
                      className="w-full px-3 py-3 bg-[#f9f6fe] border border-transparent rounded-[3px] focus:border focus:border-[#4a6cf7] focus:bg-[#f9f6fe] hover:bg-[#f1f0f3c6] outline-none transition-all duration-200 resize-none text-[14px] font-sans"
                      rows="3"
                    />
                  ) : (
                    <input
                      type="text"
                      value={aiAnswers[this.aiQuestions[currentStep].id]}
                      onChange={(e) =>
                        this.handleAiAnswerChange(
                          this.aiQuestions[currentStep].id,
                          e.target.value
                        )
                      }
                      onKeyDown={(e) => this.handleKeyDown(e, false)}
                      placeholder={this.aiQuestions[currentStep].placeholder}
                      className="w-full px-3 py-3 bg-[#f9f6fe] border border-transparent rounded-[3px] focus:border focus:border-[#4a6cf7] focus:bg-[#f9f6fe] hover:bg-[#f1f0f3c6] outline-none transition-all duration-200 text-[14px] font-sans h-[45px]"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={(e) => this.prevStep(e)}
                  disabled={currentStep === 0}
                  className="px-4 py-2 text-[#98a1b3] hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 text-[14px] font-medium"
                >
                  <FiArrowLeft className="w-4 h-4 inline mr-1" />
                  Previous
                </button>
                <button
                  onClick={
                    currentStep === this.aiQuestions.length - 1
                      ? (e) => this.generateSummary(e)
                      : (e) => this.nextStep(e)
                  }
                  disabled={!aiAnswers[this.aiQuestions[currentStep].id].trim()}
                  className="px-6 py-2 bg-[#4a6cf7] text-white rounded-[3px] hover:bg-[#3b5ce6] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 text-[14px] font-medium"
                >
                  <span>
                    {currentStep === this.aiQuestions.length - 1
                      ? "Generate Summary"
                      : "Next"}
                  </span>
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            // Generated Summary Step
            <div className="space-y-4">
              {isGenerating ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-[#4a6cf7] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FiRefreshCw className="w-8 h-8 text-[#4a6cf7] animate-spin" />
                  </div>
                  <h4 className="text-[16px] font-semibold text-gray-800 mb-2">
                    Generating Your Professional Summary
                  </h4>
                  <p className="text-[#98a1b3] text-[14px]">
                    Please wait while our AI crafts your personalized summary...
                  </p>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <h4 className="font-semibold text-[15px] mb-3">
                    Generated Summary
                  </h4>

                  {this.state.generationError && (
                    <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 text-red-700">
                      <p>{this.state.generationError}</p>
                      <button
                        onClick={(e) => this.generateSummary(e)}
                        className="mt-2 bg-red-100 hover:bg-red-200 text-red-700 py-1 px-3 rounded text-sm flex items-center"
                        disabled={this.state.isGenerating}
                      >
                        {this.state.isGenerating ? (
                          <>
                            <FiRefreshCw className="w-3 h-3 mr-1 animate-spin" />{" "}
                            Retrying...
                          </>
                        ) : (
                          <>
                            <FiRefreshCw className="w-3 h-3 mr-1" /> Try Again
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!this.state.generationError &&
                    this.state.generatedSummary && (
                      <div className="mb-4">
                        <div className="bg-gray-50 border rounded-md p-3 text-gray-700 text-sm">
                          {this.state.generatedSummary}
                        </div>
                      </div>
                    )}

                  <div className="flex space-x-3">
                    <button
                      onClick={this.resetAiHelper}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-[3px] flex items-center justify-center"
                      disabled={this.state.isGenerating}
                    >
                      <FiRefreshCw className="w-4 h-4 mr-2" /> Try Different
                      Answers
                    </button>
                    <button
                      onClick={this.addGeneratedSummary} // Corrected: No arrow function needed if bound or simple call
                      className={`flex-1 bg-[#4a6cf7] hover:bg-[#3a5ce7] text-white py-2 px-4 rounded-[3px] flex items-center justify-center ${
                        !!this.state.generationError
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                      }`}
                      disabled={
                        this.state.isGenerating || !!this.state.generationError
                      }
                    >
                      <FiCheck className="w-4 h-4 mr-2" /> Use This Summary
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  componentDidMount() {
    document.addEventListener("mouseover", (event) => {
      document.querySelectorAll(".suggestionParagraph").forEach((element) => {
        element.classList.remove("active");
      });

      if (event.target.classList.contains("suggestionParagraph")) {
        event.target.classList.add("active");
      }
    });

    // Close AI Tools dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (
        !event.target.closest(".ai-tools-dropdown") &&
        this.state.aiToolsDropdownOpen
      ) {
        this.setState({ aiToolsDropdownOpen: false });
      }
    });

    setTimeout(() => {
      this.props.categories !== undefined &&
        this.props.categories.length > 0 &&
        this.setState({ phrases: this.props.categories[0].phrases });
    }, 2000);
  }

  componentWillUnmount() {
    document.removeEventListener("mouseover", (event) => {});
  }

  convertParagraphToPhrases(paragraph) {
    let phrases = [];
    let phrase = "";
    for (let i = 0; i < paragraph.length; i++) {
      if (
        paragraph[i] === "." ||
        paragraph[i] === "!" ||
        paragraph[i] === "?"
      ) {
        phrases.push(
          <span
            onClick={(event) => this.clickedOnSuggestionParagraph(event)}
            className="suggestionParagraph cursor-pointer hover:text-[#4a6cf7] hover:underline transition-colors duration-200 inline-block mr-1"
            key={i}
          >
            {phrase + paragraph[i]}
          </span>
        );
        phrase = "";
      } else {
        phrase += paragraph[i];
      }
    }
    return phrases;
  }

  clickedOnSuggestionParagraph(event) {
    this.props.addSummary(event.target.textContent);
  }

  addParagraph(paragraph) {
    this.props.addSummary(paragraph);
  }

  handleCategoryClick(category) {
    this.setState({ phrases: category.phrases });
  }

  onEditorChange(value) {
    this.setState({ editorValue: value });
    this.props.handleInputs(this.props.name, value);
  }

  onEditorReady(editor) {
    this.editorInstance = editor;
  }

  render() {
    return (
      <div className="flex flex-col w-full">
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-[5px]">
            <span className="my-[5px] text-[#98a1b3] text-[0.9em]">
              {this.props.title}
            </span>
            {this.props.suggestions && (
              <div className="flex items-center space-x-3">
                <div className="relative ai-tools-dropdown">
                  <button
                    onClick={(e) => this.toggleAiToolsDropdown(e)}
                    className="bg-[#4a6cf7] text-white px-4 py-2 rounded-[3px] text-[14px] hover:bg-[#3b5ce6] transition-all duration-200 flex items-center space-x-2 font-medium shadow-sm"
                  >
                    <FiZap className="w-4 h-4" />
                    <span>AI Tools</span>
                    <FiChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        this.state.aiToolsDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {this.state.aiToolsDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg min-w-[160px] z-10">
                      <div className="py-1">
                        <button
                          onClick={(e) => {
                            this.setState({ aiToolsDropdownOpen: false });
                            this.toggleAiHelper(e);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                        >
                          <FiZap className="w-4 h-4" />
                          <span>AI Assistant</span>
                        </button>
                        <button
                          onClick={(e) => this.handleGrammarCheck(e)}
                          className="group bg-white w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                        >
                          <FiEdit3 className="w-4 h-4" />
                          <span>Grammar Checker</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* AI Helper Component */}
          {this.renderAiHelper()}

          {/* Grammar Checker Component */}
          {this.renderGrammarPanel()}

          {/* Lexical Rich Text Editor */}
          <div className="relative">
            <LexicalComposer initialConfig={this.getInitialConfig()}>
              <div className="bg-[#f9f6fe] border border-transparent rounded-[3px] transition-all duration-200 ease-in-out focus-within:border-[#4a6cf7] hover:bg-[#f1f0f3c6]">
                <ToolbarPlugin />
                <div className="relative">
                  <RichTextPlugin
                    contentEditable={
                      <ContentEditable
                        className="min-h-[100px] px-[10px] py-2 text-[14px] font-sans outline-none resize-none"
                        aria-placeholder="Enter your text..."
                        placeholder={
                          <div className="absolute top-2 left-[10px] text-[14px] text-gray-400 pointer-events-none">
                            Enter your text...
                          </div>
                        }
                      />
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                  />
                  <OnChangePlugin
                    onChange={this.onEditorChange}
                    isExternalUpdate={this.isExternalUpdate}
                  />
                  <InitialContentPlugin
                    htmlContent={this.props.value}
                    isExternalUpdate={this.isExternalUpdate}
                  />
                  <EditorRefPlugin onEditorReady={this.onEditorReady} />
                  <HistoryPlugin />
                  <AutoFocusPlugin />
                  <ListPlugin />
                  <LinkPlugin />
                  <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                  <ListKeyboardPlugin />
                </div>
              </div>
            </LexicalComposer>
          </div>
        </div>
      </div>
    );
  }
}

export default SimpleTextarea;
