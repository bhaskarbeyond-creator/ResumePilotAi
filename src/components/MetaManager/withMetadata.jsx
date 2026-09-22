import React, { Component } from 'react';
import { getWebsiteData } from '../../services/api/platform';
import MetaManager from './MetaManager';

/**
 * Higher-Order Component that adds automatic metadata management to any component
 * 
 * @param {React.Component} WrappedComponent - Component to wrap with metadata
 * @param {Object} defaultMeta - Default metadata to use as fallback
 * @returns {React.Component} Enhanced component with metadata management
 */
const withMetadata = (WrappedComponent, defaultMeta = {}) => {
    class WithMetadataComponent extends Component {
        constructor(props) {
            super(props);
            this.state = {
                websiteTitle: defaultMeta.title || 'IME365 — Resume Builder & CV Maker',
                websiteDescription: defaultMeta.description || 'Professional Resume Builder - Create stunning resumes and cover letters',
                websiteKeywords: defaultMeta.keywords || 'IME365, resume, cv, cover letter, job application, professional',
                websiteLanguage: defaultMeta.language || 'English',
                metaDataLoaded: false,
            };
        }

        async componentDidMount() {
            try {
                const websiteData = await getWebsiteData();
                if (websiteData) {
                    this.setState({
                        websiteTitle: websiteData.title || this.state.websiteTitle,
                        websiteDescription: websiteData.description || this.state.websiteDescription,
                        websiteKeywords: websiteData.keywords || this.state.websiteKeywords,
                        websiteLanguage: websiteData.language || this.state.websiteLanguage,
                        metaDataLoaded: true,
                    });
                } else {
                    this.setState({ metaDataLoaded: true });
                }
            } catch (error) {
                console.warn('Error loading website metadata:', error);
                this.setState({ metaDataLoaded: true });
            }
        }

        render() {
            const { websiteTitle, websiteDescription, websiteKeywords, websiteLanguage } = this.state;
            
            return (
                <>
                    <MetaManager 
                        title={websiteTitle}
                        description={websiteDescription}
                        keywords={websiteKeywords}
                        language={websiteLanguage}
                    />
                    <WrappedComponent {...this.props} />
                </>
            );
        }
    }

    // Set display name for debugging
    WithMetadataComponent.displayName = `withMetadata(${WrappedComponent.displayName || WrappedComponent.name})`;

    return WithMetadataComponent;
};

export default withMetadata;