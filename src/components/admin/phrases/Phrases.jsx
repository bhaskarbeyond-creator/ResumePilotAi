import React, { Component } from 'react';
import './Phrases.scss';
import { addCategoryToData, getAllCategories, removeCategoryByName, removePhraseFromCategory, addPhraseToCategory, getPhrasesOfCategory } from '../../../firestore/dbOperations';

class Settings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            step: 'websiteSettings',
            categoryInput: 'Cat',
            categories: [],
            phrases: [],
            isPhrasesShowed: true,
        };
        this.setStep = this.setStep.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleCategoryRemove = this.handleCategoryRemove.bind(this);
        this.handleCategorySubmit = this.handleCategorySubmit.bind(this);
        this.handlePhraseSubmit = this.handlePhraseSubmit.bind(this);
        this.handlePhraseRemove = this.handlePhraseRemove.bind(this);
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
        /// remove category from data
        removeCategoryByName(this.state.categoryInput).then((response) => {
            if (response === true) {
                alert('Category removed');
                getAllCategories().then((categories) => {
                    this.setState({ categories: categories });
                });
            } else {
                alert('Category not found');
            }
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
                alert('Category not found');
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
                alert('Phrase removed');
                getPhrasesOfCategory(this.state.categoryInput).then((phrases) => {
                    this.setState({ phrases: phrases });
                });
            } else {
                alert('Category not found');
            }
        });
    }

    render() {
        return (
            <div className="settings">
                <div className="container mx-auto px-4">
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
            </div>
        );
    }
}
export default Settings;
