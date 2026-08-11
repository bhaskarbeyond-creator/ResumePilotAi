import React, { Component } from 'react';
import { addPages, getPages, removePageByName } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaFile, FaTrash, FaPlus, FaEdit, FaEye, FaGlobe } from 'react-icons/fa';
// import ReactQuill from 'react-quill'; // ES6
// import 'react-quill/dist/quill.snow.css'; // ES6

class PagesSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pageName: '',
            text: '',
            isSuccesShowed: false,
            pages: null,
        };
        this.handleChange = this.handleChange.bind(this);
        this.saveNewPage = this.saveNewPage.bind(this);
        this.handleTextChange = this.handleTextChange.bind(this);
        this.removePageHandler = this.removePageHandler.bind(this);
        this.getPages = this.getPages.bind(this);
    }
    componentDidMount() {
        this.getPages();
    }
    // Handling changes of inputs
    handleChange(event, inputName) {
        switch (inputName) {
            case 'Page Name':
                this.setState({ pageName: event.target.value });
                break;
            default:
                break;
        }
    }
    // Handling changes of text fields
    handleTextChange(value) {
        this.setState({ text: value });
    }
    // Handling addition of page
    saveNewPage() {
        addPages(this.state.pageName, this.state.text).then((value) => {
            this.setState({ isSuccesShowed: true });
            // Auto-hide success message after 3 seconds
            setTimeout(() => {
                this.setState({ isSuccesShowed: false });
            }, 3000);
        });
        this.getPages();
    }
    // getPages
    getPages() {
        getPages().then((value) => {
            value !== null && this.setState({ pages: value });
        });
    }
    // handling removal of page
    removePageHandler(name) {
        removePageByName(name).then((value) => {
            this.getPages();
        });
    }
    render() {
        const totalPages = this.state.pages ? this.state.pages.length : 0;
        
        return (
            <div className="space-y-6">
                {/* Success Alert */}
                {this.state.isSuccesShowed && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                <FaCheck className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-emerald-800">Page created!</p>
                                <p className="text-xs text-emerald-600 mt-1">New page has been added to your website.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => this.setState({ isSuccesShowed: false })}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded"
                        >
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Pages Overview */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                <FaGlobe className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Website Pages</h3>
                                <p className="text-sm text-slate-500">Manage your custom website pages</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-slate-900">{totalPages}</p>
                                <p className="text-xs text-slate-500">Total Pages</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Current Pages List */}
                    <div className="pt-4 border-t border-slate-100">
                        {this.state.pages === null || this.state.pages.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                <FaFile className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                                <p className="text-slate-600 font-medium mb-1">No pages created yet</p>
                                <p className="text-sm text-slate-500">Create your first custom page below</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {this.state.pages.map((page, index) => (
                                    <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                                                <FaFile className="w-4 h-4 text-slate-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-900">{page.id}</p>
                                                <p className="text-xs text-slate-500">Custom page</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center space-x-2">
                                            <a 
                                                href={`/p/${page.id}`} 
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="View page"
                                            >
                                                <FaEye className="w-4 h-4" />
                                            </a>
                                            <button 
                                                onClick={() => this.removePageHandler(page.id)}
                                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete page"
                                            >
                                                <FaTrash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Add New Page */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <FaPlus className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Create New Page</h3>
                            <p className="text-sm text-slate-500">Add a custom page to your website</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaFile className="w-4 h-4 text-slate-600" />
                                    <span>Page Name</span>
                                </div>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., about-us, privacy-policy, contact"
                                value={this.state.pageName}
                                onChange={(event) => this.handleChange(event, 'Page Name')}
                                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400"
                            />
                            <p className="text-xs text-slate-500 mt-2">This will be the URL path: yoursite.com/p/your-page-name</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-3">
                                <div className="flex items-center space-x-2">
                                    <FaEdit className="w-4 h-4 text-slate-600" />
                                    <span>Page Content</span>
                                </div>
                            </label>
                            <textarea
                                placeholder="Write your page content here. You can use HTML tags for formatting."
                                value={this.state.text}
                                onChange={(event) => this.setState({ text: event.target.value })}
                                rows="8"
                                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical bg-slate-50 text-slate-900 placeholder-slate-400 font-mono text-sm"
                            />
                            <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-slate-500">Supports basic HTML formatting</p>
                                <p className="text-xs text-slate-500">{this.state.text.length} characters</p>
                            </div>
                        </div>
                        
                        {/* Preview Section */}
                        {(this.state.pageName || this.state.text) && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <div className="flex items-center space-x-2 mb-3">
                                    <FaEye className="w-4 h-4 text-slate-600" />
                                    <span className="text-sm font-medium text-slate-700">Preview</span>
                                </div>
                                 
                                {this.state.pageName && (
                                    <div className="mb-2">
                                        <p className="text-xs text-slate-500 mb-1">URL:</p>
                                        <p className="text-sm font-mono text-blue-600 bg-white px-2 py-1 rounded border">
                                            yoursite.com/p/{this.state.pageName}
                                        </p>
                                    </div>
                                )}
                                 
                                {this.state.text && (
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Content Preview:</p>
                                        <div className="text-sm text-slate-700 bg-white p-3 rounded border max-h-32 overflow-y-auto">
                                            {this.state.text.slice(0, 200)}{this.state.text.length > 200 && '...'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                    <div className="flex items-center text-sm text-slate-500">
                        <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
                        <span>Pages are accessible at yoursite.com/p/page-name</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            onClick={() => this.setState({ pageName: '', text: '' })}
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={() => this.saveNewPage()}
                            disabled={!this.state.pageName.trim() || !this.state.text.trim()}
                            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2 ${
                                this.state.pageName.trim() && this.state.text.trim()
                                    ? 'text-white bg-slate-800 hover:bg-slate-700'
                                    : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                            }`}
                        >
                            <FaPlus className="w-4 h-4" />
                            <span>Create Page</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
export default PagesSettings;
