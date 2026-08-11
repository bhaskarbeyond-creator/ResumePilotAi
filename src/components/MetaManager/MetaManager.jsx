import { useEffect, useState } from 'react';

/**
 * MetaManager Component
 * 
 * Dynamically updates document title, meta description, and meta keywords
 * based on provided props. This component handles SEO metadata management
 * for the entire application.
 */
const MetaManager = ({ 
    title, 
    description, 
    keywords, 
    language = 'en'
}) => {
    // State for dynamic updates
    const [currentMeta, setCurrentMeta] = useState({
        title,
        description,
        keywords,
        language
    });

    // Listen for global metadata updates
    useEffect(() => {
        const handleMetadataUpdate = (event) => {
            const { title: newTitle, description: newDescription, keywords: newKeywords, language: newLanguage } = event.detail;
            setCurrentMeta({
                title: newTitle || title,
                description: newDescription || description,
                keywords: newKeywords || keywords,
                language: newLanguage || language
            });
        };

        window.addEventListener('websiteMetadataUpdated', handleMetadataUpdate);
        
        // Cleanup event listener
        return () => {
            window.removeEventListener('websiteMetadataUpdated', handleMetadataUpdate);
        };
    }, [title, description, keywords, language]);

    // Update current meta when props change
    useEffect(() => {
        setCurrentMeta({
            title,
            description,
            keywords,
            language
        });
    }, [title, description, keywords, language]);
    useEffect(() => {
        // Update document title
        if (currentMeta.title) {
            document.title = currentMeta.title;
        }
    }, [currentMeta.title]);

    useEffect(() => {
        // Update meta description
        if (currentMeta.description) {
            const metaDescription = document.querySelector('meta[name="description"]');
            if (metaDescription) {
                metaDescription.setAttribute('content', currentMeta.description);
            } else {
                // Create meta description if it doesn't exist
                const meta = document.createElement('meta');
                meta.name = 'description';
                meta.content = currentMeta.description;
                document.head.appendChild(meta);
            }
        }
    }, [currentMeta.description]);

    useEffect(() => {
        // Update meta keywords
        if (currentMeta.keywords) {
            const metaKeywords = document.querySelector('meta[name="keywords"]');
            if (metaKeywords) {
                metaKeywords.setAttribute('content', currentMeta.keywords);
            } else {
                // Create meta keywords if it doesn't exist
                const meta = document.createElement('meta');
                meta.name = 'keywords';
                meta.content = currentMeta.keywords;
                document.head.appendChild(meta);
            }
        }
    }, [currentMeta.keywords]);

    useEffect(() => {
        // Update html lang attribute
        if (currentMeta.language) {
            const languageMap = {
                'Danish': 'da',
                'Swedish': 'sv',
                'Spanish': 'es',
                'English': 'en',
                'Russian': 'ru',
                'French': 'fr',
                'Portuguese': 'pt',
                'German': 'de',
                'Italian': 'it',
                'Greek': 'el',
                'Icelandic': 'is',
                'Norwegian': 'no',
                'Polish': 'pl',
                'Romanian': 'ro',
            };

            const langCode = languageMap[currentMeta.language] || currentMeta.language.toLowerCase() || 'en';
            document.documentElement.lang = langCode;
        }
    }, [currentMeta.language]);

    // This component doesn't render anything
    return null;
};

export default MetaManager;