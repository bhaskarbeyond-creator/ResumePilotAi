import React, { Component } from 'react';
import { addPages, getPages, removePageByName, getAds, addAds, removeAd } from '../../../firestore/dbOperations';
import { FaCheck, FaTimes, FaBullhorn, FaTrash, FaPlus, FaImage, FaLink, FaEye, FaExternalLinkAlt } from 'react-icons/fa';
import { m } from 'framer-motion';

class AdsSettings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            bannerName: '',
            imageLink: '',
            destinationLink: '',
            isSuccesShowed: false,
            pages: null,
            // ads
            ads: null,
        };
        this.handleChange = this.handleChange.bind(this);
        this.saveNewPage = this.saveNewPage.bind(this);
        this.handleTextChange = this.handleTextChange.bind(this);
        this.removeAddHandler = this.removeAddHandler.bind(this);
        this.getAllAds = this.getAllAds.bind(this);
    }
    componentDidMount() {
        this.getAllAds();
    }
    // Handling changes of inputs
    handleChange(event, inputName) {
        switch (inputName) {
            case 'Banner Name':
                this.setState({ bannerName: event.target.value });
                break;
            case 'Image Url':
                this.setState({ imageLink: event.target.value });
                break;
            case 'Destination Link':
                this.setState({ destinationLink: event.target.value });
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
        addAds(this.state.imageLink, this.state.bannerName, this.state.destinationLink).then((value) => {
            this.setState({ isSuccesShowed: true });
            this.getAllAds();
            // Auto-hide success message after 3 seconds
            setTimeout(() => {
                this.setState({ isSuccesShowed: false });
            }, 3000);
        });
    }
    // getPages
    getAllAds() {
        getAds().then((value) => {
            value !== null ? this.setState({ ads: value }) : this.setState({ ads: null });
        });
    }
    // handling removal of page
    removeAddHandler(id) {
        removeAd(id).then((value) => {
            this.getAllAds();
        });
    }
    render() {
        const totalAds = this.state.ads ? this.state.ads.length : 0;
        const isFormValid = this.state.bannerName.trim() && this.state.imageLink.trim() && this.state.destinationLink.trim();
        
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
                                <p className="text-sm font-medium text-emerald-800">Ad created!</p>
                                <p className="text-xs text-emerald-600 mt-1">New advertising banner has been added to your website.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => this.setState({ isSuccesShowed: false })}
                            className="text-emerald-400 hover:text-emerald-600 transition-colors p-1 rounded">
                            <FaTimes className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Ads Overview */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                                <FaBullhorn className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Advertisement Manager</h3>
                                <p className="text-sm text-slate-500">Manage banner ads displayed on your website</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-slate-900">{totalAds}</p>
                                <p className="text-xs text-slate-500">Active Ads</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Current Ads List */}
                    <div className="pt-4 border-t border-slate-100">
                        {this.state.ads === null || this.state.ads.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                <FaBullhorn className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                                <p className="text-slate-600 font-medium mb-1">No advertisements created yet</p>
                                <p className="text-sm text-slate-500">Create your first banner ad below</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {this.state.ads.map((ad, index) => (
                                    <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-12 h-8 bg-white rounded border border-slate-200 flex items-center justify-center overflow-hidden">
                                                {ad.imageLink ? (
                                                    <img 
                                                        src={ad.imageLink} 
                                                        alt={ad.name}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.nextSibling.style.display = 'block';
                                                        }}
                                                    />
                                                ) : null}
                                                <FaImage className="w-3 h-3 text-slate-400" style={{display: ad.imageLink ? 'none' : 'block'}} />
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-900">{ad.name}</p>
                                                <p className="text-xs text-slate-500 flex items-center">
                                                    <FaExternalLinkAlt className="w-2 h-2 mr-1" />
                                                    {ad.destinationLink ? new URL(ad.destinationLink).hostname : 'No link'}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center space-x-2">
                                            {ad.imageLink && (
                                                <a 
                                                    href={ad.imageLink} 
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="View image"
                                                >
                                                    <FaEye className="w-4 h-4" />
                                                </a>
                                            )}
                                            <button 
                                                onClick={() => this.removeAddHandler(ad.id)}
                                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete ad"
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

                {/* Add New Ad */}
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <FaPlus className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Create Advertisement</h3>
                            <p className="text-sm text-slate-500">Add a new banner ad to your website</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Form Fields */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-3">
                                    <div className="flex items-center space-x-2">
                                        <FaBullhorn className="w-4 h-4 text-slate-600" />
                                        <span>Banner Name</span>
                                    </div>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., Summer Sale Banner, Product Promotion"
                                    value={this.state.bannerName}
                                    onChange={(event) => this.handleChange(event, 'Banner Name')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-3">
                                    <div className="flex items-center space-x-2">
                                        <FaImage className="w-4 h-4 text-slate-600" />
                                        <span>Image URL</span>
                                    </div>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/banner-image.jpg"
                                    value={this.state.imageLink}
                                    onChange={(event) => this.handleChange(event, 'Image Url')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400"
                                />
                                <p className="text-xs text-slate-500 mt-2">Link to the banner image file (JPG, PNG, GIF)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-3">
                                    <div className="flex items-center space-x-2">
                                        <FaLink className="w-4 h-4 text-slate-600" />
                                        <span>Destination URL</span>
                                    </div>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/landing-page"
                                    value={this.state.destinationLink}
                                    onChange={(event) => this.handleChange(event, 'Destination Link')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white text-slate-900 placeholder-slate-400"
                                />
                                <p className="text-xs text-slate-500 mt-2">Where users will go when they click the banner</p>
                            </div>
                        </div>
                        
                        {/* Preview Section */}
                        <div>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <div className="flex items-center space-x-2 mb-3">
                                    <FaEye className="w-4 h-4 text-slate-600" />
                                    <span className="text-sm font-medium text-slate-700">Preview</span>
                                </div>
                                
                                {this.state.imageLink ? (
                                    <div className="space-y-3">
                                        <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <img 
                                                src={this.state.imageLink} 
                                                alt={this.state.bannerName || 'Banner preview'}
                                                className="w-full h-24 object-cover rounded border border-slate-200"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                    e.target.nextSibling.style.display = 'flex';
                                                }}
                                            />
                                            <div 
                                                className="w-full h-24 border border-dashed border-slate-300 rounded bg-slate-100 flex items-center justify-center"
                                                style={{display: 'none'}}
                                            >
                                                <div className="text-center">
                                                    <FaImage className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                                                    <p className="text-xs text-slate-500">Invalid image URL</p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-xs space-y-1">
                                            <p className="text-slate-600">
                                                <strong>Name:</strong> {this.state.bannerName || 'Untitled Banner'}
                                            </p>
                                            <p className="text-slate-600 break-all">
                                                <strong>Links to:</strong> {this.state.destinationLink || 'No destination'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-32 border border-dashed border-slate-300 rounded bg-slate-100 flex items-center justify-center">
                                        <div className="text-center">
                                            <FaImage className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500 mb-1">Banner Preview</p>
                                            <p className="text-xs text-slate-400">Add an image URL to see preview</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-200">
                    <div className="flex items-center text-sm text-slate-500">
                        <div className="w-2 h-2 bg-slate-400 rounded-full mr-2"></div>
                        <span>Ads will be displayed throughout your website</span>
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                            onClick={() => this.setState({ bannerName: '', imageLink: '', destinationLink: '' })}
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={() => this.saveNewPage()}
                            disabled={!isFormValid}
                            className={`px-6 py-2 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2 ${
                                isFormValid
                                    ? 'text-white bg-slate-800 hover:bg-slate-700'
                                    : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                            }`}
                        >
                            <FaPlus className="w-4 h-4" />
                            <span>Create Ad</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
export default AdsSettings;
