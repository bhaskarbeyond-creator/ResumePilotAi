import React from 'react';
import { FiGrid, FiTag } from 'react-icons/fi';

const CategoryFilter = ({ categories, selectedCategory, onCategoryChange }) => {
    return (
        <div>
            <div className="flex items-center mb-4">
                <FiTag className="w-5 h-5 text-gray-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
            </div>
            
            <div className="space-y-2">
                {/* All Categories */}
                <button
                    onClick={() => onCategoryChange('all')}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors duration-200 flex items-center justify-between ${
                        selectedCategory === 'all'
                            ? 'bg-blue-100 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <div className="flex items-center">
                        <FiGrid className="w-4 h-4 mr-3" />
                        <span>All Categories</span>
                    </div>
                </button>

                {/* Individual Categories */}
                {categories.map((category) => (
                    <button
                        key={category.id}
                        onClick={() => onCategoryChange(category.id)}
                        className={`w-full text-left px-4 py-3 rounded-lg transition-colors duration-200 flex items-center justify-between ${
                            selectedCategory === category.id
                                ? 'bg-blue-100 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <div className="flex items-center">
                            <div 
                                className="w-4 h-4 rounded mr-3 flex-shrink-0"
                                style={{ backgroundColor: category.color || '#6366f1' }}
                            />
                            <span className="truncate">{category.name}</span>
                        </div>
                        
                        {category.postCount && category.postCount > 0 && (
                            <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                {category.postCount}
                            </span>
                        )}
                    </button>
                ))}
                
                {/* No Categories Message */}
                {categories.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        <FiTag className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm">No categories available</p>
                    </div>
                )}
            </div>

            {/* Category Description */}
            {selectedCategory !== 'all' && (
                <>
                    {(() => {
                        const category = categories.find(c => c.id === selectedCategory);
                        if (category && category.description) {
                            return (
                                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                                    <p className="text-sm text-gray-600">{category.description}</p>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </>
            )}
        </div>
    );
};

export default CategoryFilter;