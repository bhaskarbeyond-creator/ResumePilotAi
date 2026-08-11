import { useState, useEffect } from 'react';
import { FaPlus, FaTrash, FaPen, FaSave, FaTimes, FaImage, FaBuilding, FaEye, FaInfoCircle, FaSpinner, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { addTrustedBy, getTrustedBy, removeTrustedBy, updateTrustedBy } from '../../../firestore/dbOperations';
const TrustedBy = () => {
    const [trustedCompanies, setTrustedCompanies] = useState([
      
    ]);
    const [newCompanyUrl, setNewCompanyUrl] = useState('');
    const [newCompanyName, setNewCompanyName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editUrl, setEditUrl] = useState('');
    const [editName, setEditName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [deletingIds, setDeletingIds] = useState([]);
    const [addingCompany, setAddingCompany] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    const addTrustedCompany = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!newCompanyUrl.trim()) {
            setError('Image URL is required');
            return;
        }

        try {
            setAddingCompany(true);
            
            const newCompany = {
                id: Date.now().toString(),
                imageUrl: newCompanyUrl.trim(),
                name: newCompanyName.trim() || 'Trusted Company',
                createdAt: new Date(),
            };

            // Optimistic UI update
            setTrustedCompanies([newCompany, ...trustedCompanies]);
            setNewCompanyUrl('');
            setNewCompanyName('');
            
            // Execute the database operation in the background
            await addTrustedBy(newCompany);
            
            setSuccessMessage('Company added successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            console.error('Error adding company:', error);
            setError('Failed to add company. Please try again.');
            // Refresh the list to ensure consistency with the database
            getTrustedCompanies();
        } finally {
            setAddingCompany(false);
        }
    };

    const startEditing = (company) => {
        setEditingId(company.id);
        setEditUrl(company.imageUrl);
        setEditName(company.name);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditUrl('');
        setEditName('');
    };

    const saveEdit = async (id) => {
        if (!editUrl.trim()) {
            setError('Image URL is required');
            return;
        }

        try {
            setUpdatingId(id);
            
            // Prepare updated company data
            const updatedCompanyData = { 
                imageUrl: editUrl.trim(), 
                name: editName.trim() || 'Trusted Company' 
            };
            
            // Update local state first (optimistic update)
            const updatedCompanies = trustedCompanies.map(company => {
                if (company.id === id) {
                    return { ...company, ...updatedCompanyData };
                }
                return company;
            });
            
            setTrustedCompanies(updatedCompanies);
            setEditingId(null);
            setEditUrl('');
            setEditName('');
            
            // Then update in Firebase
            await updateTrustedBy(id, updatedCompanyData);
            
            setSuccessMessage('Company updated successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            console.error('Error updating company:', error);
            setError('Failed to update company. Please try again.');
            // Refresh the list to ensure consistency with the database
            getTrustedCompanies();
        } finally {
            setUpdatingId(null);
        }
    };

    const removeCompany = async (id) => {
      
            try {
                setLoading(true);
                // Optimistic UI update - remove from UI immediately
        
                // Then perform the actual deletion in the background
                await removeTrustedBy(id).then(() => {
                    setDeletingIds(prev => [...prev, id]);
                    setSuccessMessage('Company removed successfully');
                    setTimeout(() => setSuccessMessage(''), 3000);
                    setTrustedCompanies(trustedCompanies.filter(company => company.id !== id));
                    setLoading(false);
                });
            } catch (error) {
                console.error('Error removing company:', error);
                // If the deletion fails, restore the company to the list
                getTrustedCompanies();
                setError('Failed to remove company. Please try again.');
            } finally {
                setDeletingIds(prev => prev.filter(itemId => itemId !== id));
            }
        
    };

    const getTrustedCompanies = async () => {
        await getTrustedBy().then((res) => {
            console.log(res);
            setTrustedCompanies(res);
        });
    };

    useEffect(() => {
        getTrustedCompanies();
    }, []);
    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            {/* Header Section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <FaBuilding className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Trusted Companies</h1>
                        <p className="text-sm text-slate-500">Manage company logos displayed on your homepage</p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaBuilding className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-600">Total Companies</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">{trustedCompanies.length}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaImage className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-600">Display Status</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">{trustedCompanies.length > 0 ? 'Active' : 'Inactive'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm text-slate-600">System Status</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">Ready</p>
                    </div>
                </div>
            </div>

            {/* Success Message */}
            {successMessage && (
                <div className="bg-white border border-emerald-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <FaCheck className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-emerald-900">Success</h4>
                            <p className="text-sm text-emerald-700">{successMessage}</p>
                        </div>
                        <button
                            onClick={() => setSuccessMessage('')}
                            className="w-6 h-6 flex items-center justify-center text-emerald-400 hover:text-emerald-600 transition-colors"
                        >
                            <FaTimes className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-white border border-red-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                            <FaExclamationTriangle className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-red-900">Error</h4>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                        <button
                            onClick={() => setError('')}
                            className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
                        >
                            <FaTimes className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}
            
            {/* Add New Company Form */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                        <FaPlus className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-slate-900">Add New Company</h3>
                    </div>
                    <p className="text-sm text-slate-500">Add a trusted company logo to display on your homepage</p>
                </div>
                <div className="p-6">
                    <form onSubmit={addTrustedCompany} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaImage className="w-4 h-4 text-slate-600" />
                                        <span>Logo Image URL</span>
                                        <span className="text-red-500 text-xs">*</span>
                                    </div>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/logo.png"
                                    value={newCompanyUrl}
                                    onChange={(e) => setNewCompanyUrl(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    required
                                />
                                <p className="text-xs text-slate-500 mt-1">Direct link to company logo image</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaBuilding className="w-4 h-4 text-slate-600" />
                                        <span>Company Name</span>
                                    </div>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Company Name"
                                    value={newCompanyName}
                                    onChange={(e) => setNewCompanyName(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                                <p className="text-xs text-slate-500 mt-1">Optional - defaults to "Trusted Company"</p>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={addingCompany || !newCompanyUrl.trim()}
                            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
                        >
                            {addingCompany ? (
                                <>
                                    <FaSpinner className="w-4 h-4 animate-spin" />
                                    <span>Adding Company...</span>
                                </>
                            ) : (
                                <>
                                    <FaPlus className="w-4 h-4" />
                                    <span>Add Company</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
            
            {/* Companies List */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Company Logos</h3>
                    <p className="text-sm text-slate-500">Manage and organize your trusted company logos</p>
                </div>
                
                {trustedCompanies.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaBuilding className="w-8 h-8 text-slate-400" />
                        </div>
                        <h4 className="text-lg font-medium text-slate-900 mb-2">No Companies Added</h4>
                        <p className="text-sm text-slate-500">Start by adding your first trusted company logo</p>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {trustedCompanies.map((company) => (
                                <div
                                    key={company.id}
                                    className={`border border-slate-200 rounded-lg overflow-hidden transition-all duration-200 ${
                                        editingId === company.id
                                            ? 'ring-2 ring-blue-500 border-blue-500'
                                            : 'hover:shadow-md hover:border-slate-300'
                                    }`}
                                >
                                    {editingId === company.id ? (
                                        <div className="p-4">
                                            <div className="flex items-center space-x-2 mb-4">
                                                <FaPen className="w-4 h-4 text-blue-600" />
                                                <h4 className="font-medium text-slate-900">Edit Company</h4>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                                        <div className="flex items-center space-x-2">
                                                            <FaImage className="w-3 h-3 text-slate-600" />
                                                            <span>Image URL</span>
                                                        </div>
                                                    </label>
                                                    <input
                                                        type="url"
                                                        value={editUrl}
                                                        onChange={(e) => setEditUrl(e.target.value)}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                                        <div className="flex items-center space-x-2">
                                                            <FaBuilding className="w-3 h-3 text-slate-600" />
                                                            <span>Company Name</span>
                                                        </div>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                                                        placeholder="Company Name"
                                                    />
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => saveEdit(company.id)}
                                                        disabled={updatingId === company.id || !editUrl.trim()}
                                                        className="flex-1 flex items-center justify-center space-x-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        {updatingId === company.id ? (
                                                            <>
                                                                <FaSpinner className="w-3 h-3 animate-spin" />
                                                                <span>Saving...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <FaSave className="w-3 h-3" />
                                                                <span>Save</span>
                                                            </>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={cancelEditing}
                                                        disabled={updatingId === company.id}
                                                        className="flex-1 flex items-center justify-center space-x-1 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                                                    >
                                                        <FaTimes className="w-3 h-3" />
                                                        <span>Cancel</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-slate-50 h-32 flex items-center justify-center p-4">
                                                <img
                                                    src={company.imageUrl}
                                                    alt={company.name || 'Company Logo'}
                                                    className="max-h-full max-w-full object-contain"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="w-full h-24 bg-slate-200 hidden items-center justify-center text-slate-400">
                                                    <FaImage className="w-8 h-8" />
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <h4 className="text-center text-slate-900 font-medium mb-3 truncate">
                                                    {company.name || 'Trusted Company'}
                                                </h4>
                                                <div className="flex justify-center space-x-2">
                                                    <button
                                                        onClick={() => startEditing(company)}
                                                        className="flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                                                        title="Edit company details"
                                                    >
                                                        <FaPen className="w-3 h-3" />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => window.open(company.imageUrl, '_blank')}
                                                        className="flex items-center space-x-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                                                        title="Preview image"
                                                    >
                                                        <FaEye className="w-3 h-3" />
                                                        <span>Preview</span>
                                                    </button>
                                                    <button
                                                        onClick={() => removeCompany(company.id)}
                                                        disabled={deletingIds.includes(company.id)}
                                                        className="flex items-center space-x-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Remove company"
                                                    >
                                                        {deletingIds.includes(company.id) ? (
                                                            <FaSpinner className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <FaTrash className="w-3 h-3" />
                                                        )}
                                                        <span>{deletingIds.includes(company.id) ? 'Removing...' : 'Remove'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Information Section */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center space-x-2">
                        <FaInfoCircle className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-slate-900">Display Guidelines</h3>
                    </div>
                    <p className="text-sm text-slate-500">Best practices for company logo display</p>
                </div>
                <div className="p-6">
                    <div className="space-y-4">
                        <div className="flex items-start space-x-3">
                            <div className="w-5 h-5 bg-blue-50 rounded flex items-center justify-center mt-0.5">
                                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-slate-900 mb-1">Homepage Display</h4>
                                <p className="text-sm text-slate-600">Company logos will be displayed in the "Trusted By" section of your homepage</p>
                            </div>
                        </div>
                        <div className="flex items-start space-x-3">
                            <div className="w-5 h-5 bg-emerald-50 rounded flex items-center justify-center mt-0.5">
                                <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-slate-900 mb-1">Image Requirements</h4>
                                <p className="text-sm text-slate-600">Use transparent PNG logos with consistent dimensions for best results</p>
                            </div>
                        </div>
                        <div className="flex items-start space-x-3">
                            <div className="w-5 h-5 bg-amber-50 rounded flex items-center justify-center mt-0.5">
                                <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-slate-900 mb-1">Recommended Size</h4>
                                <p className="text-sm text-slate-600">Optimal image dimensions are 200x80 pixels for consistent appearance</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrustedBy;
