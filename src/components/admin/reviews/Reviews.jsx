import React, { useState } from 'react';
import { addReview, getAllReviews, deleteReview, addGlobalRating } from '../../../firestore/dbOperations';
import { FaStar, FaUser, FaBriefcase, FaImage, FaTrash, FaPlus, FaCheck, FaTimes, FaQuoteLeft, FaStarHalfAlt } from 'react-icons/fa';

const Reviews = () => {
    const [review, setReview] = useState({
        imageUrl: '',
        name: '',
        occupation: '',
        review: '',
        rating: '',
        ratingOf: 0,
    });

    const [reviews, setReviews] = useState([]);
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    React.useEffect(() => {
        getAllReviews().then((result) => {
            setReviews(result);
        });
    }, []);

    const handleDelete = (id) => {
        setIsLoading(true);
        deleteReview(id).then((result) => {
            if (result) {
                getAllReviews().then((result) => {
                    setReviews(result);
                    setSuccessMessage('Review deleted successfully');
                    setTimeout(() => setSuccessMessage(''), 3000);
                    setIsLoading(false);
                });
            } else {
                setIsLoading(false);
            }
        });
    };

    const handleChange = (event, inputName) => {
        switch (inputName) {
            case 'imageUrl':
                setReview({ ...review, imageUrl: event.target.value });
                break;
            case 'name':
                setReview({ ...review, name: event.target.value });
                break;
            case 'occupation':
                setReview({ ...review, occupation: event.target.value });
                break;
            case 'ratingOf':
                setReview({ ...review, ratingOf: event.target.value });
                break;
            case 'review':
                setReview({ ...review, review: event.target.value });
                break;
            case 'rating':
                setReview({ ...review, rating: event.target.value });
                break;
            default:
                break;
        }
    };

    const handleReviewSubmit = () => {
        setIsLoading(true);
        addReview(review).then((result) => {
            if (result) {
                getAllReviews().then((result) => {
                    setReviews(result);
                    setReview({ imageUrl: '', name: '', occupation: '', review: '', rating: '', ratingOf: 0 });
                    setSuccessMessage('Review added successfully');
                    setTimeout(() => setSuccessMessage(''), 3000);
                    setIsLoading(false);
                });
            } else {
                setIsLoading(false);
            }
        });
    };

    const handleRatingSubmit = () => {
        if (review.ratingOf === 0 || review.ratingOf > 5) {
            setSuccessMessage('');
            return;
        }

        setIsLoading(true);
        addGlobalRating(review.ratingOf).then((result) => {
            if (result) {
                setReview({ ...review, ratingOf: 0 });
                setSuccessMessage('Global rating added successfully');
                setTimeout(() => setSuccessMessage(''), 3000);
                setIsLoading(false);
            } else {
                setIsLoading(false);
            }
        });
    };

    const renderStars = (rating) => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;
        
        for (let i = 0; i < fullStars; i++) {
            stars.push(<FaStar key={i} className="w-3 h-3 text-yellow-500" />);
        }
        
        if (hasHalfStar) {
            stars.push(<FaStarHalfAlt key="half" className="w-3 h-3 text-yellow-500" />);
        }
        
        const emptyStars = 5 - Math.ceil(rating);
        for (let i = 0; i < emptyStars; i++) {
            stars.push(<FaStar key={`empty-${i}`} className="w-3 h-3 text-slate-300" />);
        }
        
        return stars;
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            {/* Header Section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
                <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                        <FaStar className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Reviews & Ratings</h1>
                        <p className="text-sm text-slate-500">Manage customer reviews and global rating system</p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaQuoteLeft className="w-4 h-4 text-slate-600" />
                            <span className="text-sm text-slate-600">Total Reviews</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">{reviews.length}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaStar className="w-4 h-4 text-amber-500" />
                            <span className="text-sm text-slate-600">Avg Rating</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">
                            {reviews.length > 0 
                                ? (reviews.reduce((acc, rev) => acc + parseInt(rev.rating), 0) / reviews.length).toFixed(1)
                                : '—'
                            }
                        </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <FaCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm text-slate-600">Status</span>
                        </div>
                        <p className="text-lg font-semibold text-slate-900">Active</p>
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                {/* Global Rating Section */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                        <div className="flex items-center space-x-2">
                            <FaStar className="w-5 h-5 text-amber-500" />
                            <h3 className="text-lg font-semibold text-slate-900">Global Rating</h3>
                        </div>
                        <p className="text-sm text-slate-500">Set overall website rating</p>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaStar className="w-4 h-4 text-slate-600" />
                                        <span>Rating (1-5)</span>
                                    </div>
                                </label>
                                <input
                                    type="number"
                                    placeholder="Enter rating from 1 to 5"
                                    value={review.ratingOf || ''}
                                    onChange={(event) => handleChange(event, 'ratingOf')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    min="1"
                                    max="5"
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={handleRatingSubmit}
                                disabled={isLoading || !review.ratingOf || review.ratingOf < 1 || review.ratingOf > 5}
                                className="w-full flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
                            >
                                <FaStar className="w-4 h-4" />
                                <span>{isLoading ? 'Adding...' : 'Set Global Rating'}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Add Review Section */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200">
                        <div className="flex items-center space-x-2">
                            <FaPlus className="w-5 h-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-slate-900">Add New Review</h3>
                        </div>
                        <p className="text-sm text-slate-500">Create a new customer review</p>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaImage className="w-4 h-4 text-slate-600" />
                                        <span>Profile Image URL</span>
                                    </div>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/image.jpg"
                                    value={review.imageUrl}
                                    onChange={(event) => handleChange(event, 'imageUrl')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        <div className="flex items-center space-x-2">
                                            <FaUser className="w-4 h-4 text-slate-600" />
                                            <span>Full Name</span>
                                        </div>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={review.name}
                                        onChange={(event) => handleChange(event, 'name')}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        <div className="flex items-center space-x-2">
                                            <FaBriefcase className="w-4 h-4 text-slate-600" />
                                            <span>Occupation</span>
                                        </div>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Software Engineer"
                                        value={review.occupation}
                                        onChange={(event) => handleChange(event, 'occupation')}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaQuoteLeft className="w-4 h-4 text-slate-600" />
                                        <span>Review Text</span>
                                    </div>
                                </label>
                                <textarea
                                    placeholder="Write the customer review..."
                                    value={review.review}
                                    onChange={(event) => handleChange(event, 'review')}
                                    rows="4"
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-vertical"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <div className="flex items-center space-x-2">
                                        <FaStar className="w-4 h-4 text-slate-600" />
                                        <span>Star Rating (1-5)</span>
                                    </div>
                                </label>
                                <input
                                    type="number"
                                    placeholder="5"
                                    value={review.rating}
                                    onChange={(event) => handleChange(event, 'rating')}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    min="1"
                                    max="5"
                                />
                            </div>
                            <button 
                                type="button" 
                                onClick={handleReviewSubmit}
                                disabled={isLoading || !review.name || !review.review || !review.rating}
                                className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
                            >
                                <FaPlus className="w-4 h-4" />
                                <span>{isLoading ? 'Adding Review...' : 'Add Review'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reviews List */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">All Reviews</h3>
                    <p className="text-sm text-slate-500">Manage and view all customer reviews</p>
                </div>
                
                {reviews.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaQuoteLeft className="w-8 h-8 text-slate-400" />
                        </div>
                        <h4 className="text-lg font-medium text-slate-900 mb-2">No Reviews Yet</h4>
                        <p className="text-sm text-slate-500">Customer reviews will appear here once you add them</p>
                    </div>
                ) : (
                    <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {reviews.map((reviewItem, index) => (
                                <div key={index} className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="aspect-w-16 aspect-h-9 bg-slate-100">
                                        <img 
                                            src={reviewItem.imageUrl} 
                                            alt={reviewItem.name || 'Review'} 
                                            className="w-full h-48 object-cover" 
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.nextSibling.style.display = 'flex';
                                            }}
                                        />
                                        <div className="w-full h-48 bg-slate-200 hidden items-center justify-center">
                                            <FaUser className="w-12 h-12 text-slate-400" />
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <h4 className="text-lg font-semibold text-slate-900">{reviewItem.name}</h4>
                                                <p className="text-sm text-slate-600">{reviewItem.occupation}</p>
                                            </div>
                                            <div className="flex items-center space-x-1">
                                                {renderStars(parseInt(reviewItem.rating))}
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="flex items-start space-x-2">
                                                <FaQuoteLeft className="w-3 h-3 text-slate-400 mt-1 flex-shrink-0" />
                                                <p className="text-sm text-slate-700 leading-relaxed">{reviewItem.review}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                                            <div className="flex items-center space-x-2 text-xs text-slate-500">
                                                <FaStar className="w-3 h-3 text-amber-500" />
                                                <span>{reviewItem.rating}/5 Stars</span>
                                            </div>
                                            <button
                                                onClick={() => handleDelete(reviewItem.id)}
                                                disabled={isLoading}
                                                className="flex items-center space-x-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium px-3 py-1 rounded-lg transition-colors duration-200 disabled:opacity-50"
                                            >
                                                <FaTrash className="w-3 h-3" />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reviews;
