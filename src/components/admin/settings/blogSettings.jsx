import React, { useState, useEffect } from 'react';
import useConfirmDialog from '../../../hooks/useConfirmDialog';
import { getBlogSettings, updateBlogSettings, listBlogCategories, createBlogCategory, updateBlogCategory, deleteBlogCategory } from '../../../firestore/dbOperations';
import { FiSave, FiPlus, FiEdit3, FiTrash2, FiCheck, FiX, FiSettings, FiTag, FiBookOpen } from 'react-icons/fi';

const BlogSettings = () => {
    const { confirm, confirmationDialog } = useConfirmDialog();
    const [settings, setSettings] = useState({
        blogTitle: 'Blog',
        blogDescription: 'Latest news and articles',
        postsPerPage: 10,
        enableComments: false,
        moderateComments: true,
        allowGuestPosts: true,
        featuredImage: '',
        seoTitle: 'Blog',
        seoDescription: 'Read our latest blog posts and articles'
    });
    
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);
    const [activeTab, setActiveTab] = useState('general');
    
    // Category management state
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        description: '',
        color: '#6366f1'
    });

    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [settingsData, categoriesData] = await Promise.all([
                getBlogSettings(),
                listBlogCategories()
            ]);
            
            if (settingsData) {
                setSettings((prev) => ({
                    ...prev,
                    ...settingsData
                }));
            }
            
            setCategories(categoriesData);
        } catch (error) {
            console.error('Error loading blog settings:', error);
            showNotification('Failed to load blog settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleSettingsSave = async () => {
        setSaving(true);
        
        try {
            const result = await updateBlogSettings(settings);
            
            if (result.success) {
                showNotification('Blog settings saved successfully!');
            } else {
                showNotification(result.error || 'Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving blog settings:', error);
            showNotification('Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCategorySubmit = async (e) => {
        e.preventDefault();
        
        if (!categoryForm.name.trim()) {
            showNotification('Category name is required', 'error');
            return;
        }

        setSaving(true);
        
        try {
            let result;
            
            if (editingCategory) {
                result = await updateBlogCategory(editingCategory.id, categoryForm, editingCategory.revision);
            } else {
                result = await createBlogCategory(categoryForm);
            }
            
            if (result.success) {
                showNotification(
                    editingCategory ? 'Category updated successfully!' : 'Category created successfully!'
                );
                
                // Refresh categories
                const categoriesData = await listBlogCategories();
                setCategories(categoriesData);
                
                // Reset form
                setCategoryForm({ name: '', description: '', color: '#6366f1' });
                setEditingCategory(null);
                setShowCategoryForm(false);
            } else {
                showNotification(result.error || 'Failed to save category', 'error');
            }
        } catch (error) {
            console.error('Error saving category:', error);
            showNotification('Failed to save category', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCategoryEdit = (category) => {
        setEditingCategory(category);
        setCategoryForm({
            name: category.name,
            description: category.description || '',
            color: category.color || '#6366f1'
        });
        setShowCategoryForm(true);
    };

    const handleCategoryDelete = async (categoryId, revision) => {
        const accepted = await confirm({
            title: 'Delete category',
            message: 'Delete this blog category? This cannot be undone, and any posts filed under it will lose their category.',
            confirmLabel: 'Delete category',
            variant: 'danger',
        });
        if (!accepted) return;

        setSaving(true);
        
        try {
            const result = await deleteBlogCategory(categoryId, revision);
            
            if (result.success) {
                showNotification('Category deleted successfully!');
                
                // Refresh categories
                const categoriesData = await listBlogCategories();
                setCategories(categoriesData);
            } else {
                showNotification(result.error || 'Failed to delete category', 'error');
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            showNotification('Failed to delete category', 'error');
        } finally {
            setSaving(false);
        }
    };

    const cancelCategoryForm = () => {
        setCategoryForm({ name: '', description: '', color: '#6366f1' });
        setEditingCategory(null);
        setShowCategoryForm(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'general', label: 'General Settings', icon: FiSettings },
        { id: 'categories', label: 'Categories', icon: FiTag },
        { id: 'seo', label: 'SEO Settings', icon: FiBookOpen }
    ];

    return (
        <div className="space-y-6">
            {/* Notification */}
            {notification && (
                <div className={`p-4 rounded-lg ${
                    notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                    <div className="flex items-center">
                        {notification.type === 'success' ? 
                            <FiCheck className="w-5 h-5 mr-2" /> : 
                            <FiX className="w-5 h-5 mr-2" />
                        }
                        {notification.message}
                    </div>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                <Icon className="w-4 h-4 mr-2" />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* General Settings Tab */}
            {activeTab === 'general' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Blog Title
                            </label>
                            <input
                                type="text"
                                value={settings.blogTitle}
                                onChange={(e) => setSettings(prev => ({ ...prev, blogTitle: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Posts Per Page
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={settings.postsPerPage}
                                onChange={(e) => setSettings(prev => ({ ...prev, postsPerPage: parseInt(e.target.value) || 10 }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Blog Description
                        </label>
                        <textarea
                            value={settings.blogDescription}
                            onChange={(e) => setSettings(prev => ({ ...prev, blogDescription: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Featured Image URL
                        </label>
                        <input
                            type="url"
                            value={settings.featuredImage}
                            onChange={(e) => setSettings(prev => ({ ...prev, featuredImage: e.target.value }))}
                            placeholder="https://example.com/blog-header.jpg"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-medium text-gray-900">Content Settings</h4>
                        
                        <div className="space-y-3">
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.enableComments}
                                    onChange={(e) => setSettings(prev => ({ ...prev, enableComments: e.target.checked }))}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Enable comments on blog posts</span>
                            </label>

                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.moderateComments}
                                    onChange={(e) => setSettings(prev => ({ ...prev, moderateComments: e.target.checked }))}
                                    disabled={!settings.enableComments}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                                />
                                <span className="ml-3 text-sm text-gray-700">Moderate comments before publishing</span>
                            </label>

                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.allowGuestPosts}
                                    onChange={(e) => setSettings(prev => ({ ...prev, allowGuestPosts: e.target.checked }))}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Allow members to submit blog posts</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Categories Tab */}
            {activeTab === 'categories' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium text-gray-900">Manage Categories</h3>
                        <button
                            onClick={() => setShowCategoryForm(true)}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
                        >
                            <FiPlus className="w-4 h-4 mr-2" />
                            Add Category
                        </button>
                    </div>

                    {/* Category Form */}
                    {showCategoryForm && (
                        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                            <h4 className="font-medium text-gray-900 mb-4">
                                {editingCategory ? 'Edit Category' : 'Add New Category'}
                            </h4>
                            
                            <form onSubmit={handleCategorySubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Category Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={categoryForm.name}
                                            onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Color
                                        </label>
                                        <div className="flex items-center space-x-3">
                                            <input
                                                type="color"
                                                value={categoryForm.color}
                                                onChange={(e) => setCategoryForm(prev => ({ ...prev, color: e.target.value }))}
                                                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={categoryForm.color}
                                                onChange={(e) => setCategoryForm(prev => ({ ...prev, color: e.target.value }))}
                                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={categoryForm.description}
                                        onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        type="button"
                                        onClick={cancelCategoryForm}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
                                    >
                                        {saving ? 'Saving...' : (editingCategory ? 'Update' : 'Create')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Categories List */}
                    <div className="bg-white rounded-lg border border-gray-200">
                        {categories.length > 0 ? (
                            <div className="divide-y divide-gray-200">
                                {categories.map((category) => (
                                    <div key={category.id} className="p-4 flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div 
                                                className="w-6 h-6 rounded"
                                                style={{ backgroundColor: category.color }}
                                            />
                                            <div>
                                                <h4 className="font-medium text-gray-900">{category.name}</h4>
                                                {category.description && (
                                                    <p className="text-sm text-gray-500">{category.description}</p>
                                                )}
                                                <p className="text-xs text-gray-400">
                                                    {category.postCount || 0} posts
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleCategoryEdit(category)}
                                                className="p-2 text-gray-400 hover:text-blue-600 transition-colors duration-200"
                                            >
                                                <FiEdit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleCategoryDelete(category.id, category.revision)}
                                                className="p-2 text-gray-400 hover:text-red-600 transition-colors duration-200"
                                            >
                                                <FiTrash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-gray-500">
                                <FiTag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <p>No categories created yet.</p>
                                <p className="text-sm">Create your first category to organize blog posts.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SEO Settings Tab */}
            {activeTab === 'seo' && (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            SEO Title
                        </label>
                        <input
                            type="text"
                            value={settings.seoTitle}
                            onChange={(e) => setSettings(prev => ({ ...prev, seoTitle: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            This will appear in search engine results and browser tabs.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            SEO Description
                        </label>
                        <textarea
                            value={settings.seoDescription}
                            onChange={(e) => setSettings(prev => ({ ...prev, seoDescription: e.target.value }))}
                            rows={3}
                            maxLength={160}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {settings.seoDescription.length}/160 characters. This will appear in search engine results.
                        </p>
                    </div>
                </div>
            )}

            {/* Save Button */}
            {(activeTab === 'general' || activeTab === 'seo') && (
                <div className="pt-6 border-t border-gray-200">
                    <button
                        onClick={handleSettingsSave}
                        disabled={saving}
                        className="inline-flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200"
                    >
                        <FiSave className="w-4 h-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            )}
            {confirmationDialog}
        </div>
    );
};

export default BlogSettings;