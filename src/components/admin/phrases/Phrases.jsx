import React, { Component } from 'react';
import './Phrases.scss';
import { addCategoryToData, getAllCategories, removeCategoryByName, removePhraseFromCategory, addPhraseToCategory, getPhrasesOfCategory } from '../../../services/api/platform';
import EnterpriseConfirmModal from '../../../enterprise/components/EnterpriseConfirmModal';

class Settings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            step: 'websiteSettings',
            categoryInput: 'Cat',
            categories: [],
            phrases: [],
            isPhrasesShowed: true,
            // Inline feedback replaces the native alert() calls, which were
            // unstyled, blocking and invisible to the UI test suite.
            feedback: null,
            // Removing a category is destructive and previously had no
            // confirmation step at all.
            pendingCategoryRemoval: null,
            removingCategory: false,
        };
        this.setStep = this.setStep.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleCategoryRemove = this.handleCategoryRemove.bind(this);
        this.handleCategorySubmit = this.handleCategorySubmit.bind(this);
        this.handlePhraseSubmit = this.handlePhraseSubmit.bind(this);
        this.handlePhraseRemove = this.handlePhraseRemove.bind(this);
        this.confirmCategoryRemove = this.confirmCategoryRemove.bind(this);
    }
    setStep(stepName) {
        this.setState({ step: stepName });
    }

    handleChange(event, inputName) {
        switch (inputName) {
            case 'categoryInput':
                this.setState({ categoryInput: event.target.value });
                break;
            case 'phraseInput':
                this.setState({ phraseInput: event.target.value });
                break;
            default:
                break;
        }
    }

    componentDidMount() {
        getAllCategories().then((categories) => {
            this.setState({ categories: categories });
        });
        getPhrasesOfCategory(this.state.categoryInput).then((phrases) => {
            this.setState({ phrases: phrases });
        });
    }
    // handle category submit
    handleCategorySubmit() {
        /// add category to data
        addCategoryToData(this.state.categoryInput).then(() => {
            getAllCategories().then((categories) => {
                this.setState({ categories: categories });
            });
        });
    }
    // handle category remove
    handleCategoryRemove() {
        const name = this.state.categoryInput;
        if (!name) {
            this.setState({ feedback: { tone: 'error', message: 'Select or type a category name first.' } });
            return;
        }
        this.setState({ pendingCategoryRemoval: name, feedback: null });
    }

    confirmCategoryRemove() {
        const name = this.state.pendingCategoryRemoval;
        if (!name) return Promise.resolve();
        this.setState({ removingCategory: true });
        return removeCategoryByName(name).then((response) => {
            if (response === true) {
                this.setState({ feedback: { tone: 'success', message: `Category “${name}” removed.` } });
                return getAllCategories().then((categories) => this.setState({ categories }));
            }
            this.setState({ feedback: { tone: 'error', message: `Category “${name}” was not found.` } });
            return undefined;
        }).catch((error) => {
            this.setState({ feedback: { tone: 'error', message: error?.message || 'The category could not be removed.' } });
        }).finally(() => {
            this.setState({ pendingCategoryRemoval: null, removingCategory: false });
        });
    }

    // sett categoryInput with the clicked category
    handleCategoryClick(category) {
        this.setState({ categoryInput: category.name, phraseInput: '' });

        setTimeout(() => {
            getPhrasesOfCategory(this.state.categoryInput).then((phrases) => {
                this.setState({ phrases: phrases });
            });
        }, 1000);
    }
    // handle phrase submit
    handlePhraseSubmit() {
        /// add phrase to category
        addPhraseToCategory(this.state.categoryInput, this.state.phraseInput).then((response) => {
            if (response === true) {
                getPhrasesOfCategory(this.state.categoryInput).then((phrases) => {
                    this.setState({ phrases: phrases });
                });
            } else {
                this.setState({ feedback: { tone: 'error', message: 'That category was not found, so the phrase was not added.' } });
            }
        });
    }
    /// handle phrase click
    handlePhraseClick(phrase) {
        this.setState({ phraseInput: phrase });
    }

    // handle phrase remove
    handlePhraseRemove() {
        /// remove phrase from category
        removePhraseFromCategory(this.state.categoryInput, this.state.phraseInput).then((response) => {
            if (response === true) {
                this.setState({ feedback: { tone: 'success', message: 'Phrase removed.' } });
                getPhrasesOfCategory(this.state.categoryInput).then((phrases) => {
                    this.setState({ phrases: phrases });
                });
            } else {
                this.setState({ feedback: { tone: 'error', message: 'That category was not found, so the phrase was not removed.' } });
            }
        });
    }

    render() {
        return (
            <div className="settings">
                <div className="container mx-auto px-4">
                    {this.state.feedback && (
                        <div
                            role={this.state.feedback.tone === 'error' ? 'alert' : 'status'}
                            data-testid="phrases-feedback"
                            className={this.state.feedback.tone === 'error'
                                ? 'mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800'
                                : 'mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'}
                        >
                            {this.state.feedback.message}
                        </div>
                    )}
                    {/* Categories */}
                    <div className="settings-categories">
                        <h1 className="text-3xl font-bold mb-6 text-gray-800">Categories</h1>
                        <div className="settings-category-input-wrapper mb-8">
                            <div className="flex items-center space-x-4 mb-4">
                                <input
                                    type="text"
                                    placeholder={this.state.categoryInput}
                                    value={this.state.categoryInput}
                                    onChange={(event) => this.handleChange(event, 'categoryInput')}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button onClick={() => this.handleCategorySubmit()} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition duration-200">
                                    Save
                                </button>
                                <button onClick={() => this.handleCategoryRemove()} className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-lg transition duration-200">
                                    Remove
                                </button>
                            </div>
                        </div>

                        {/* List of current categories */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
                            {this.state.categories.length > 0 &&
                                this.state.categories.map((category, index) => {
                                    return (
                                        <div
                                            key={index}
                                            onClick={() => this.handleCategoryClick(category)}
                                            className="settings-categories__item bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <p className="text-gray-800 font-medium">{category.name}</p>
                                                <i className="fas fa-trash-alt text-red-500 hover:text-red-700"></i>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        <h1 className="text-3xl font-bold mb-6 text-gray-800">Phrases</h1>

                        <div className="settings-category-input-wrapper mb-8">
                            <div className="flex items-center space-x-4 mb-4">
                                <input
                                    type="text"
                                    placeholder={this.state.phraseInput || 'Enter phrase'}
                                    value={this.state.phraseInput || ''}
                                    onChange={(event) => this.handleChange(event, 'phraseInput')}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button onClick={() => this.handlePhraseSubmit()} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition duration-200">
                                    Save
                                </button>
                                <button onClick={() => this.handlePhraseRemove()} className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-lg transition duration-200">
                                    Remove
                                </button>
                            </div>
                        </div>

                        {/* List of phrases */}
                        <div className="settings-categories-phrases">
                            {this.state.phrases && this.state.phrases.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {this.state.phrases.map((phrase, index) => {
                                        return (
                                            <div
                                                key={index}
                                                onClick={() => this.handlePhraseClick(phrase)}
                                                className="settings-categories-phrases__item bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer hover:bg-gray-100">
                                                <p className="text-gray-800">{phrase}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {(!this.state.phrases || this.state.phrases.length === 0) && <div className="text-center py-8 text-gray-500">No phrases found for this category. Add one above!</div>}
                        </div>
                    </div>
                </div>
                <EnterpriseConfirmModal
                    isOpen={Boolean(this.state.pendingCategoryRemoval)}
                    title="Remove category"
                    message={this.state.pendingCategoryRemoval
                        ? `Remove the category “${this.state.pendingCategoryRemoval}” and all phrases filed under it? This cannot be undone.`
                        : ''}
                    confirmLabel="Remove category"
                    variant="danger"
                    busy={this.state.removingCategory}
                    onConfirm={this.confirmCategoryRemove}
                    onClose={() => !this.state.removingCategory && this.setState({ pendingCategoryRemoval: null })}
                />
            </div>
        );
    }
}
export default Settings;
