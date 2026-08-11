import React, { useEffect, useCallback } from 'react';
import { FiBold, FiItalic, FiUnderline, FiList, FiHash, FiChevronLeft, FiMinus, FiCornerDownLeft } from 'react-icons/fi';
import './RichTextEditor.css';

// Lexical imports
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
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
} from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection, $createParagraphNode, $createTextNode } from 'lexical';
import { FORMAT_TEXT_COMMAND, KEY_ENTER_COMMAND, COMMAND_PRIORITY_LOW, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { $getNearestNodeOfType } from '@lexical/utils';

// Lexical theme
const theme = {
    ltr: 'ltr',
    rtl: 'rtl',
    placeholder: 'editor-placeholder',
    paragraph: 'editor-paragraph',
    quote: 'editor-quote',
    heading: {
        h1: 'editor-heading-h1',
        h2: 'editor-heading-h2',
        h3: 'editor-heading-h3',
        h4: 'editor-heading-h4',
        h5: 'editor-heading-h5',
    },
    list: {
        nested: {
            listitem: 'editor-nested-listitem',
        },
        ol: 'editor-list-ol',
        ul: 'editor-list-ul',
        listitem: 'editor-listitem',
    },
    image: 'editor-image',
    link: 'editor-link',
    text: {
        bold: 'editor-text-bold',
        italic: 'editor-text-italic',
        overflowed: 'editor-text-overflowed',
        hashtag: 'editor-text-hashtag',
        underline: 'editor-text-underline',
        strikethrough: 'editor-text-strikethrough',
        underlineStrikethrough: 'editor-text-underlineStrikethrough',
        code: 'editor-text-code',
    },
    code: 'editor-code',
    codeHighlight: {
        atrule: 'editor-tokenAttr',
        attr: 'editor-tokenAttr',
        boolean: 'editor-tokenProperty',
        builtin: 'editor-tokenSelector',
        cdata: 'editor-tokenComment',
        char: 'editor-tokenSelector',
        class: 'editor-tokenFunction',
        'class-name': 'editor-tokenFunction',
        comment: 'editor-tokenComment',
        constant: 'editor-tokenProperty',
        deleted: 'editor-tokenProperty',
        doctype: 'editor-tokenComment',
        entity: 'editor-tokenOperator',
        function: 'editor-tokenFunction',
        important: 'editor-tokenVariable',
        inserted: 'editor-tokenSelector',
        keyword: 'editor-tokenAttr',
        namespace: 'editor-tokenVariable',
        number: 'editor-tokenProperty',
        operator: 'editor-tokenOperator',
        prolog: 'editor-tokenComment',
        property: 'editor-tokenProperty',
        punctuation: 'editor-tokenPunctuation',
        regex: 'editor-tokenVariable',
        selector: 'editor-tokenSelector',
        string: 'editor-tokenSelector',
        symbol: 'editor-tokenProperty',
        tag: 'editor-tokenProperty',
        url: 'editor-tokenOperator',
        variable: 'editor-tokenVariable',
    },
};

// Custom plugin to handle onChange events
function OnChangePlugin({ onChange }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                // Use Lexical's built-in HTML serialization to preserve formatting
                const htmlString = $generateHtmlFromNodes(editor, null);
                onChange(htmlString);
            });
        });
    }, [editor, onChange]);

    return null;
}

// Simplified plugin to handle initial value only
function InitialValuePlugin({ initialValue }) {
    const [editor] = useLexicalComposerContext();
    const [hasInitialized, setHasInitialized] = React.useState(false);

    useEffect(() => {
        if (!hasInitialized && initialValue && initialValue.trim() !== '') {
            editor.update(() => {
                const root = $getRoot();
                
                // Only set initial value if editor is empty
                if (root.getChildren().length === 0 || (root.getChildren().length === 1 && root.getFirstChild().getTextContent() === '')) {
                    // Convert HTML to plain text while preserving line breaks
                    let textContent = initialValue;
                    if (/<[^>]*>/g.test(initialValue)) {
                        const parser = new DOMParser();
                        const htmlWithBreaks = initialValue
                            .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
                            .replace(/<br\s*\/?>/gi, '\n');
                        const dom = parser.parseFromString(htmlWithBreaks, 'text/html');
                        textContent = dom.body.textContent || dom.body.innerText || '';
                    }

                    // Clear existing content
                    root.clear();

                    // Create paragraphs from content
                    const lines = textContent.split('\n').filter(line => line.trim() !== '');
                    
                    if (lines.length === 0) {
                        const paragraph = $createParagraphNode();
                        root.append(paragraph);
                    } else {
                        lines.forEach((line) => {
                            const paragraph = $createParagraphNode();
                            const textNode = $createTextNode(line.trim());
                            paragraph.append(textNode);
                            root.append(paragraph);
                        });
                    }
                }
            });
        }
        setHasInitialized(true);
    }, [editor, initialValue, hasInitialized]);

    return null;
}

// Plugin to handle external updates like AI suggestions
function ExternalUpdatePlugin({ value }) {
    const [editor] = useLexicalComposerContext();
    const [lastValue, setLastValue] = React.useState(value);
    const [isInitialized, setIsInitialized] = React.useState(false);
    const isUpdatingRef = React.useRef(false);

    // Track when we're updating to prevent interference
    const preventUpdate = React.useRef(false);

    // Listen for editor changes to update our tracking
    useEffect(() => {
        const removeUpdateListener = editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
            if (isUpdatingRef.current) return;
            
            // Mark that we're in a user-initiated change
            preventUpdate.current = true;
            setTimeout(() => {
                preventUpdate.current = false;
            }, 100);
        });

        return removeUpdateListener;
    }, [editor]);

    // Handle external value changes (like AI suggestions)
    useEffect(() => {
        if (preventUpdate.current) return;
        
        if (isInitialized && value !== lastValue && !isUpdatingRef.current) {
            const currentContent = lastValue || '';
            const newContent = value || '';

            // Only update for significant changes (AI suggestions, external updates)
            // This prevents interference with normal typing
            const isSignificantChange = 
                (newContent.length > currentContent.length + 20) || // Much longer content
                (newContent.length < currentContent.length - 20) || // Much shorter content
                (newContent !== currentContent && currentContent.trim() === '') || // Setting content in empty field
                (newContent !== currentContent && newContent.includes('\n') && !currentContent.includes('\n')); // Multi-line content

            if (isSignificantChange) {
                isUpdatingRef.current = true;
                
                editor.update(() => {
                    const root = $getRoot();
                    
                    // Convert HTML to plain text while preserving line breaks
                    let textContent = newContent;
                    if (/<[^>]*>/g.test(newContent)) {
                        const parser = new DOMParser();
                        const htmlWithBreaks = newContent
                            .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
                            .replace(/<br\s*\/?>/gi, '\n');
                        const dom = parser.parseFromString(htmlWithBreaks, 'text/html');
                        textContent = dom.body.textContent || dom.body.innerText || '';
                    }

                    // Clear existing content
                    root.clear();

                    // Create paragraphs from content
                    const lines = textContent.split('\n').filter(line => line.trim() !== '');
                    
                    if (lines.length === 0) {
                        const paragraph = $createParagraphNode();
                        root.append(paragraph);
                    } else {
                        lines.forEach((line) => {
                            const paragraph = $createParagraphNode();
                            const textNode = $createTextNode(line.trim());
                            paragraph.append(textNode);
                            root.append(paragraph);
                        });
                    }
                });

                setTimeout(() => {
                    isUpdatingRef.current = false;
                }, 100);
            }
            
            setLastValue(value);
        }
    }, [isInitialized, value, lastValue, editor]);

    // Mark as initialized after first render
    useEffect(() => {
        if (!isInitialized) {
            setIsInitialized(true);
            setLastValue(value);
        }
    }, [isInitialized, value]);

    return null;
}

// Simplified plugin to handle keyboard shortcuts for lists only
function ListKeyboardPlugin() {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        // Handle Enter key ONLY for lists
        const unregisterEnter = editor.registerCommand(
            KEY_ENTER_COMMAND,
            (event) => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    const anchorNode = selection.anchor.getNode();

                    // Only handle Enter key if we're actually in a list
                    if ($isListItemNode(anchorNode) || $getNearestNodeOfType(anchorNode, ListNode)) {
                        const listItemNode = $isListItemNode(anchorNode) ? anchorNode : $getNearestNodeOfType(anchorNode, ListItemNode);

                        // If the list item is empty, exit the list and create a normal paragraph
                        if ($isListItemNode(listItemNode) && listItemNode.getTextContent().trim() === '') {
                            event.preventDefault();

                            editor.update(() => {
                                // Create a new paragraph after the list
                                const newParagraph = $createParagraphNode();
                                const textNode = $createTextNode('');
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
                return false; // Let default Enter behavior handle normal paragraphs
            },
            COMMAND_PRIORITY_LOW
        );

        // Handle Tab and Shift+Tab for indent/outdent in lists only
        const unregisterKeyDown = editor.registerRootListener((rootElement, prevRootElement) => {
            const onKeyDown = (event) => {
                if (event.key === 'Tab') {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        const anchorNode = selection.anchor.getNode();
                        // Only handle Tab in lists
                        if ($isListItemNode(anchorNode) || $getNearestNodeOfType(anchorNode, ListNode)) {
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
                prevRootElement.removeEventListener('keydown', onKeyDown);
            }
            if (rootElement !== null) {
                rootElement.addEventListener('keydown', onKeyDown);
            }
        });

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
                    const textNode = $createTextNode('');
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
                const textNode = $createTextNode('');
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
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));

            // Check for list states
            const anchorNode = selection.anchor.getNode();
            let element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();

            const elementKey = element.getKey();
            const elementDOM = editor.getElementByKey(elementKey);

            if (elementDOM !== null) {
                const listNode = $getNearestNodeOfType(anchorNode, ListNode);
                if ($isListNode(listNode)) {
                    const listType = listNode.getListType();
                    setIsUnorderedList(listType === 'bullet');
                    setIsOrderedList(listType === 'number');
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
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
                }}
                className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${isBold ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                aria-label="Format Bold">
                <FiBold className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
                }}
                className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${isItalic ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                aria-label="Format Italics">
                <FiItalic className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
                }}
                className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${isUnderline ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                aria-label="Format Underline">
                <FiUnderline className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button
                type="button"
                onClick={() => {
                    if (isUnorderedList) {
                        // If already in bullet list, create sub-bullet properly
                        createSubBullet(editor, 'bullet');
                    } else {
                        // If not in bullet list, create new bullet list
                        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
                    }
                }}
                className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${isUnorderedList ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                aria-label={isUnorderedList ? 'Create Sub-bullet' : 'Create Bullet List'}
                title={isUnorderedList ? 'Create Sub-bullet (Tab)' : 'Create Bullet List'}>
                <FiList className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => {
                    if (isOrderedList) {
                        // If already in numbered list, create sub-item properly
                        createSubBullet(editor, 'number');
                    } else {
                        // If not in numbered list, create new numbered list
                        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
                    }
                }}
                className={`toolbar-item p-2 rounded hover:bg-gray-200 transition-colors ${isOrderedList ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                aria-label={isOrderedList ? 'Create Sub-number' : 'Create Numbered List'}
                title={isOrderedList ? 'Create Sub-number (Tab)' : 'Create Numbered List'}>
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
                        title="Outdent (Shift+Tab)">
                        <FiChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            exitListToNormalText(editor);
                        }}
                        className="toolbar-item p-2 rounded hover:bg-gray-200 transition-colors text-gray-600"
                        aria-label="Exit List"
                        title="Exit List (Enter on empty line)">
                        <FiCornerDownLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
                        }}
                        className="toolbar-item p-2 rounded hover:bg-gray-200 transition-colors text-gray-600"
                        aria-label="Remove List"
                        title="Remove List">
                        <FiMinus className="w-4 h-4" />
                    </button>
                </>
            )}
        </div>
    );
}

const RichTextEditor = ({ value = '', onChange, placeholder = 'Enter your text...', rows = 4, className = '' }) => {
    // Remove the problematic editor re-creation logic
    const lastValueRef = React.useRef(value);

    React.useEffect(() => {
        lastValueRef.current = value;
    }, [value]);

    // Lexical editor configuration
    const getInitialConfig = () => {
        return {
            namespace: 'ResumenEditor',
            theme,
            onError: (error) => {
                console.error(error);
            },
            nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, CodeHighlightNode, TableNode, TableCellNode, TableRowNode, AutoLinkNode, LinkNode],
        };
    };

    const onEditorChange = (htmlValue) => {
        onChange(htmlValue);
    };

    return (
        <div className={`relative ${className}`}>
            <LexicalComposer initialConfig={getInitialConfig()}>
                <div className="bg-white border border-slate-300 hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 rounded-md transition-all duration-200 ease-in-out">
                    <ToolbarPlugin />
                    <div className="relative">
                        <RichTextPlugin
                            contentEditable={
                                <ContentEditable
                                    className={`min-h-[100px] px-3 py-2.5 text-sm text-slate-900 outline-none resize-none`}
                                    aria-placeholder={placeholder}
                                    placeholder={<div className={`absolute top-2.5 left-3 text-sm text-slate-400 pointer-events-none`}>{placeholder}</div>}
                                />
                            }
                            ErrorBoundary={LexicalErrorBoundary}
                        />
                        <OnChangePlugin onChange={onEditorChange} />
                        <InitialValuePlugin initialValue={value} />
                        <ExternalUpdatePlugin value={value} />
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
    );
};

export default RichTextEditor;
