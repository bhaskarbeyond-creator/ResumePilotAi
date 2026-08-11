import { useEffect } from 'react';

/**
 * Custom hook for managing document meta tags
 * 
 * @param {string} title - Document title
 * @param {string} description - Meta description
 * @param {string} keywords - Meta keywords
 * @param {string} language - Document language (full name like 'English' or code like 'en')
 */
const useMetaManager = ({ 
    title, 
    description, 
    keywords, 
    language = 'en'
}) => {
    // Language mapping for full names to codes
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

    useEffect(() => {
        // Update document title
        if (title) {
            document.title = title;
        }
    }, [title]);

    useEffect(() => {
        // Update meta description
        if (description) {
            let metaDescription = document.querySelector('meta[name="description"]');
            if (metaDescription) {
                metaDescription.setAttribute('content', description);
            } else {
                metaDescription = document.createElement('meta');
                metaDescription.name = 'description';
                metaDescription.content = description;
                document.head.appendChild(metaDescription);
            }
        }
    }, [description]);

    useEffect(() => {
        // Update meta keywords
        if (keywords) {
            let metaKeywords = document.querySelector('meta[name="keywords"]');
            if (metaKeywords) {
                metaKeywords.setAttribute('content', keywords);
            } else {
                metaKeywords = document.createElement('meta');
                metaKeywords.name = 'keywords';
                metaKeywords.content = keywords;
                document.head.appendChild(metaKeywords);
            }
        }
    }, [keywords]);

    useEffect(() => {
        // Update html lang attribute
        if (language) {
            const langCode = languageMap[language] || language.toLowerCase() || 'en';
            document.documentElement.lang = langCode;
        }
    }, [language, languageMap]);
};

export default useMetaManager;