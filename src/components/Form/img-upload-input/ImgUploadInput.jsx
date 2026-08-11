import React, { Component } from 'react';
import manPicture from '../../../assets/young.png';
// import ImageUploader from "react-images-upload";

class ImgUploadInput extends Component {
    constructor(props) {
        super(props);
        this.state = {
            picture: this.props.value || '',
            isDragging: false,
            isLoading: false,
            error: null,
        };

        this.fileInputRef = React.createRef();
        this.dropAreaRef = React.createRef();

        this.resizeImage = this.resizeImage.bind(this);
        this.handleFileChange = this.handleFileChange.bind(this);
        this.handleDragEnter = this.handleDragEnter.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        this.handleRemoveImage = this.handleRemoveImage.bind(this);
        this.triggerFileInput = this.triggerFileInput.bind(this);
    }

    componentDidMount() {
        // Set up drag and drop event listeners
        const dropArea = this.dropAreaRef.current;
        if (dropArea) {
            dropArea.addEventListener('dragenter', this.handleDragEnter);
            dropArea.addEventListener('dragleave', this.handleDragLeave);
            dropArea.addEventListener('dragover', this.handleDragOver);
            dropArea.addEventListener('drop', this.handleDrop);
        }
    }

    componentWillUnmount() {
        // Clean up event listeners
        const dropArea = this.dropAreaRef.current;
        if (dropArea) {
            dropArea.removeEventListener('dragenter', this.handleDragEnter);
            dropArea.removeEventListener('dragleave', this.handleDragLeave);
            dropArea.removeEventListener('dragover', this.handleDragOver);
            dropArea.removeEventListener('drop', this.handleDrop);
        }
    }

    resizeImage(base64Str, maxWidth = 200, maxHeight = 200) {
        return new Promise((resolve) => {
            let img = new Image();
            img.src = base64Str;
            img.onload = () => {
                let canvas = document.createElement('canvas');
                const MAX_WIDTH = maxWidth;
                const MAX_HEIGHT = maxHeight;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
        });
    }

    async handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            this.setState({ error: 'Image exceeds 5MB limit' });
            return;
        }

        this.setState({ isLoading: true, error: null });
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const img = await this.resizeImage(event.target.result);
                this.setState({ picture: img, isLoading: false });
                this.props.handleInputs(this.props.name, img);
            } catch (err) {
                this.setState({
                    isLoading: false,
                    error: 'Error processing image',
                });
            }
        };

        reader.onerror = () => {
            this.setState({
                isLoading: false,
                error: 'Error reading file',
            });
        };

        reader.readAsDataURL(file);
    }

    handleDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ isDragging: true });
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ isDragging: false });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        this.setState({ isDragging: true });
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.setState({ isDragging: false });

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];

            if (file.size > 5 * 1024 * 1024) {
                this.setState({ error: 'Image exceeds 5MB limit' });
                return;
            }

            this.setState({ isLoading: true, error: null });
            const reader = new FileReader();

            reader.onload = async (event) => {
                try {
                    const img = await this.resizeImage(event.target.result);
                    this.setState({ picture: img, isLoading: false });
                    this.props.handleInputs(this.props.name, img);
                } catch (err) {
                    this.setState({
                        isLoading: false,
                        error: 'Error processing image',
                    });
                }
            };

            reader.readAsDataURL(file);
        }
    }

    handleRemoveImage() {
        this.setState({ picture: '', error: null });
        this.props.handleInputs(this.props.name, '');
        if (this.fileInputRef.current) {
            this.fileInputRef.current.value = '';
        }
    }

    triggerFileInput() {
        if (this.fileInputRef.current) {
            this.fileInputRef.current.click();
        }
    }

    renderUploadIcon() {
        return (
            <svg className="w-12 h-12 text-[#4a6cf7] opacity-80 mb-2 transition-transform duration-300 ease-in-out group-hover:scale-110" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15V3M12 3L8 7M12 3L16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12V15C2 18.3137 4.68629 21 8 21H16C19.3137 21 22 18.3137 22 15V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    
    renderImageIcon() {
        return (
            <svg className="w-6 h-6 text-[#4a6cf7]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 16L7.22222 12L11.4444 16L14.5556 13L21 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="16.5" cy="7.5" r="1.5" fill="currentColor" />
            </svg>
        );
    }

    render() {
        const { picture, isDragging, isLoading, error } = this.state;

        return (
            <div className="flex flex-col">
                <span className="my-[5px] text-[#98a1b3] text-[0.9em]">{this.props.title || 'Photo'}</span>

                {picture ? (
                    <div className="bg-white border border-gray-200 rounded-md overflow-hidden transition-all duration-200 flex flex-col">
                        <div className="flex">
                            <div className="flex-grow">
                                <img 
                                    src={picture} 
                                    alt="Preview" 
                                    className="w-full h-auto max-h-[130px] object-cover" 
                                />
                            </div>
                            <div className="bg-gray-50 border-l border-gray-100 flex flex-col items-center justify-center px-2 py-2 space-y-2">
                                <button 
                                    onClick={this.triggerFileInput} 
                                    className="text-[#4a6cf7] p-1.5 rounded hover:bg-gray-100 transition-colors duration-200"
                                    title="Change image"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M11 4H7.2C6.0799 4 5.51984 4 5.09202 4.21799C4.71569 4.40973 4.40973 4.71569 4.21799 5.09202C4 5.51984 4 6.0799 4 7.2V16.8C4 17.9201 4 18.4802 4.21799 18.908C4.40973 19.2843 4.71569 19.5903 5.09202 19.782C5.51984 20 6.0799 20 7.2 20H16.8C17.9201 20 18.4802 20 18.908 19.782C19.2843 19.5903 19.5903 19.2843 19.782 18.908C20 18.4802 20 17.9201 20 16.8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M9 15L15 9M15 9H11M15 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                                <button 
                                    onClick={this.handleRemoveImage} 
                                    className="text-[#ff3b30] p-1.5 rounded hover:bg-gray-100 transition-colors duration-200"
                                    title="Remove image"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                            <div className="flex items-center">
                                {this.renderImageIcon()}
                                <span className="text-[#333333] text-xs ml-2">Image uploaded</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div 
                        ref={this.dropAreaRef} 
                        className={`group relative overflow-hidden font-sans bg-white border-2 border-dashed border-gray-200 rounded-md min-h-[100px] flex flex-col items-center justify-center cursor-pointer p-3 transition-all duration-300 ease-in-out hover:border-[#4a6cf7]/50 ${
                            isDragging ? 'border-[#4a6cf7] bg-[#4a6cf7]/5' : ''
                        } ${isLoading ? 'pointer-events-none' : ''}
                        `} 
                        onClick={this.triggerFileInput}
                    >
                        {isLoading ? (
                            <div className="flex flex-col items-center">
                                <div className="w-6 h-6 border-2 border-t-transparent border-[#4a6cf7] rounded-full animate-spin mb-1"></div>
                                <span className="text-[#666666] text-xs">Processing...</span>
                            </div>
                        ) : (
                            <>
                                <svg className="w-8 h-8 text-[#4a6cf7] opacity-80 mb-1 transition-transform duration-300 ease-in-out group-hover:scale-110" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 15V3M12 3L8 7M12 3L16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M2 12V15C2 18.3137 4.68629 21 8 21H16C19.3137 21 22 18.3137 22 15V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span className="text-[#333333] font-medium text-sm">{isDragging ? 'Drop image here' : 'Upload photo'}</span>
                                <span className="text-[#666666] text-xs">{isDragging ? '' : 'or drag and drop'}</span>
                                <span className="text-[#98a1b3] text-xs mt-1 bg-gray-50 px-2 py-0.5 rounded-full">Max: 5MB</span>
                            </>
                        )}
                        
                        {/* Ripple effect on click */}
                        <span className="absolute inset-0 bg-[#4a6cf7]/10 scale-0 group-active:scale-100 rounded-full opacity-0 group-active:opacity-100 origin-center transition-all duration-500 ease-out pointer-events-none"></span>
                        
                        <input 
                            ref={this.fileInputRef} 
                            type="file" 
                            accept="image/*" 
                            onChange={this.handleFileChange} 
                            className="hidden" 
                        />
                    </div>
                )}

                {error && (
                    <div className="flex items-center text-[#ff3b30] text-xs mt-2">
                        <svg className="w-3.5 h-3.5 mr-1 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M12 8V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="12" cy="16" r="1" fill="currentColor" />
                        </svg>
                        {error}
                    </div>
                )}
            </div>
        );
    }
}

export default ImgUploadInput;
