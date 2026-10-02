import { useState, useEffect, useRef } from 'react';
import { FaChevronDown, FaGlobe, FaCheck } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

// Import flag images
import UsFlag from '../../../assets/countries/united-states.png';
import DenmarkFlag from '../../../assets/countries/denmark.png';
import SwedenFlag from '../../../assets/countries/sweden.png';
import SpainFlag from '../../../assets/countries/spain.png';
import RussianFlag from '../../../assets/countries/russia.png';
import FranceFlag from '../../../assets/countries/france.png';
import PortugalFlag from '../../../assets/countries/portugal.png';
import GermanyFlag from '../../../assets/countries/germany.png';
import ItalyFlag from '../../../assets/countries/italy.png';
import GreeceFlag from '../../../assets/countries/greece.png';
import IcelandFlag from '../../../assets/countries/iceland.png';
import NorwayFlag from '../../../assets/countries/norway.png';
import PolandFlag from '../../../assets/countries/poland.png';
import RomaniaFlag from '../../../assets/countries/romania.png';
import NetherlandFlag from '../../../assets/countries/netherlands.png';
import IndiaFlag from '../../../assets/countries/india.png';

import { getWebsiteData } from '../../../services/api/platform';

const HomepageLanguages = () => {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [disabledLanguages, setDisabledLanguages] = useState([]);
    const dropdownRef = useRef(null);
    const timeoutRef = useRef(null);
    const [currentLang, setCurrentLang] = useState(i18n.language || 'en');

    useEffect(() => {
        const loadDisabledLangs = () => {
            getWebsiteData().then((data) => {
                if (data && Array.isArray(data.disabledLanguages)) {
                    setDisabledLanguages(data.disabledLanguages);
                }
            });
        };
        loadDisabledLangs();

        const handleMetaUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail.disabledLanguages)) {
                setDisabledLanguages(e.detail.disabledLanguages);
            }
        };

        window.addEventListener('websiteMetadataUpdated', handleMetaUpdate);
        return () => window.removeEventListener('websiteMetadataUpdated', handleMetaUpdate);
    }, []);

    const languages = [
        { code: 'en', name: 'English', flag: UsFlag },
        { code: 'hi', name: 'हिंदी (Hindi)', flag: IndiaFlag },
        { code: 'es', name: 'Español', flag: SpainFlag },
        { code: 'fr', name: 'Français', flag: FranceFlag },
        { code: 'de', name: 'Deutsch', flag: GermanyFlag },
        { code: 'it', name: 'Italiano', flag: ItalyFlag },
        { code: 'pt', name: 'Português', flag: PortugalFlag },
        { code: 'ru', name: 'Русский', flag: RussianFlag },
        { code: 'nl', name: 'Nederlands', flag: NetherlandFlag },
        { code: 'pl', name: 'Polski', flag: PolandFlag },
        { code: 'se', name: 'Svenska', flag: SwedenFlag },
        { code: 'no', name: 'Norsk', flag: NorwayFlag },
        { code: 'dk', name: 'Dansk', flag: DenmarkFlag },
        { code: 'is', name: 'Íslenska', flag: IcelandFlag },
        { code: 'gk', name: 'Ελληνικά', flag: GreeceFlag },
        { code: 'ro', name: 'Română', flag: RomaniaFlag },
    ];

    const isLangDisabled = (langCode, langName) => {
        if (!disabledLanguages || disabledLanguages.length === 0) return false;
        const normCode = (langCode || '').toLowerCase().trim();
        const normName = (langName || '').toLowerCase().trim();
        
        const isoToNameMap = {
            en: 'english',
            hi: 'hindi',
            es: 'spanish',
            fr: 'french',
            de: 'german',
            it: 'italian',
            pt: 'portuguese',
            ru: 'russian',
            nl: 'dutch',
            pl: 'polish',
            se: 'swedish',
            no: 'norwegian',
            dk: 'danish',
            is: 'icelandic',
            gk: 'greek',
            ro: 'romanian',
        };

        return disabledLanguages.some(item => {
            const normItem = String(item).toLowerCase().trim();
            if (normItem === normCode || normItem === normName) return true;
            if (isoToNameMap[normCode] && normItem === isoToNameMap[normCode]) return true;
            return false;
        });
    };

    const visibleLanguages = languages.filter(l => !isLangDisabled(l.code, l.name));

    const currentLanguage = visibleLanguages.find(lang => lang.code === currentLang) || visibleLanguages[0] || languages[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keep track of language changes
    useEffect(() => {
        setCurrentLang(i18n.language || 'en');
    }, [i18n.language]);

    // Handle dropdown hover with delay
    const handleDropdownEnter = () => {
        clearTimeout(timeoutRef.current);
        setIsOpen(true);
    };

    const handleDropdownLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 150);
    };

    const handleLanguageChange = (languageCode) => {
        // Save the preference to localStorage similar to LanguagePicker.js
        localStorage.setItem('preferredLanguage', languageCode);

        // Change the language in i18n
        i18n.changeLanguage(languageCode);

        // Update the current language in state
        setCurrentLang(languageCode);

        // Close the dropdown
        setIsOpen(false);
    };

    return (
        <div 
            className="relative"
            ref={dropdownRef}
            onMouseEnter={handleDropdownEnter}
            onMouseLeave={handleDropdownLeave}
        >
            {/* Language Selector Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center px-3 py-2 rounded-lg text-gray-700 hover:text-purple-600 hover:bg-purple-50/70 transition-all duration-300 font-medium group"
                aria-label="Select Language"
            >
                <FaGlobe className="w-4 h-4 mr-2 group-hover:text-purple-600 transition-colors duration-300" />
                <img 
                    src={currentLanguage.flag} 
                    alt={`${currentLanguage.name} flag`} 
                    className="w-5 h-5 mr-1 rounded-sm object-cover border border-gray-100" 
                />
                <span className="hidden sm:inline text-sm font-medium">{currentLanguage.code.toUpperCase()}</span>
                <FaChevronDown 
                    className={`ml-2 w-3 h-3 transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                    }`} 
                />
            </button>

            {/* Language Dropdown */}
            <div
                className={`absolute top-full right-0 mt-2 transition-all duration-300 z-50 ${
                    isOpen 
                        ? 'opacity-100 visible translate-y-0 scale-100' 
                        : 'opacity-0 invisible translate-y-2 scale-95'
                }`}
            >
                <div className="w-64 bg-white backdrop-blur-xl rounded-2xl shadow-2xl shadow-purple-500/10 border border-gray-200/50 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-3 border-b border-gray-100">
                        <div className="flex items-center">
                            <FaGlobe className="text-purple-500 mr-2 w-4 h-4" />
                            <h3 className="text-sm font-bold text-gray-900">Choose Language</h3>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">Select your preferred language</p>
                    </div>

                    {/* Language List */}
                    <div className="max-h-80 overflow-y-auto py-2">
                        {visibleLanguages.map((language) => {
                            const isSelected = language.code === i18n.language;
                            
                            return (
                                <button
                                    key={language.code}
                                    onClick={() => handleLanguageChange(language.code)}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-50/70 transition-all duration-200 group ${
                                        isSelected 
                                            ? 'bg-purple-50/50 text-purple-700' 
                                            : 'text-gray-700 hover:text-purple-600'
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <img 
                                            src={language.flag} 
                                            alt={`${language.name} flag`} 
                                            className="w-6 h-6 mr-3 rounded-sm object-cover border border-gray-100 shadow-sm" 
                                        />
                                        <div>
                                            <span className={`font-medium text-sm ${
                                                isSelected ? 'text-purple-700' : 'text-gray-900'
                                            }`}>
                                                {language.name}
                                            </span>
                                            <div className={`text-xs ${
                                                isSelected ? 'text-purple-600' : 'text-gray-500'
                                            }`}>
                                                {language.code.toUpperCase()}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {isSelected && (
                                        <div className="flex items-center">
                                            <FaCheck className="w-3 h-3 text-purple-600" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 text-center">
                            More languages coming soon
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomepageLanguages;