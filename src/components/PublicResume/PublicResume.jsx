import React from 'react';
import './PublicResume.scss';
import { AiFillHome, AiOutlinePlus, AiOutlineMinus } from 'react-icons/ai';
import { TbLetterCase } from 'react-icons/tb';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getJsonById } from '../../firestore/dbOperations';
import axios from 'axios';
import config from '../../conf/configuration';

import download from 'downloadjs';
import { trackDownload, trackEvent } from '../../utils/ga4';
function PublicResume(props) {
    // Get resumeId from URL params using React Router v6 hook
    const { resumeId } = useParams();

    // values state
    const [values, setValues] = React.useState({
        gotData: false,
        values: {
            firstname: '',
            lastname: '',
            photo: '',
            phone: '',
            address: '',
            email: '',
            country: '',
            template: '',
            city: '',
            postalcode: '',
            languages: [],
            employments: [],
            skills: [],
            educations: [],
            summary: [],
            components: [],
        },
    });
    // scale state
    const [scale, setScale] = React.useState(1);
    // loaded templates state for caching
    const [loadedTemplates, setLoadedTemplates] = useState({});
    // handle download click
    const handleDownloadClick = () => {
        axios
            .post(
                config.provider + '://' + config.backendUrl + '/api/export',
                {
                    language: 'en',
                    resumeId: resumeId,
                    resumeName: values.values.template,
                },
                {
                    responseType: 'blob', // had to add this one here
                }
            )
            .then(function (response) {
                // handle success
                // const content = response.headers['content-type'];
                // download(response.data, "resume.pdf", content)
                console.log(response);
                const content = response.headers['content-type'];
                download(response.data, 'resume.pdf', content);
                alert('Downloaded');
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
            .then(function () {
                // always executed
            });
    };

    const handleScaleDown = () => {
        if (scale > 0.5) {
            setScale(scale - 0.1);
        }
    };

    const handleScaleUp = () => {
        // set scale state

        if (scale < 1.5) {
            setScale(scale + 0.1);
        }
    };

    // Dynamic template loader - loads templates only when needed
    const loadTemplate = async (templateName) => {
        if (loadedTemplates[templateName]) {
            return loadedTemplates[templateName];
        }

        try {
            const templateModule = await import(`../../cv-templates/${templateName.toLowerCase()}/${templateName}.jsx`);
            const TemplateComponent = templateModule.default;
            
            setLoadedTemplates(prev => ({
                ...prev,
                [templateName]: TemplateComponent
            }));
            
            return TemplateComponent;
        } catch (error) {
            console.warn(`Failed to load template ${templateName}:`, error);
            // Fallback to Cv1 if template fails to load
            if (templateName !== 'Cv1') {
                return loadTemplate('Cv1');
            }
            return null;
        }
    };

    // Template renderer that handles dynamic loading
    const renderTemplate = (templateName) => {
        const TemplateComponent = loadedTemplates[templateName];
        
        if (!TemplateComponent) {
            // Load template if not already loaded
            loadTemplate(templateName);
            return (
                <div className="template-loading">
                    <div className="loading-spinner">Loading template...</div>
                </div>
            );
        }
        
        try {
            return <TemplateComponent values={values.values} />;
        } catch (error) {
            console.error(`Error rendering template ${templateName}:`, error);
            // Fallback to Cv1 if rendering fails
            if (templateName !== 'Cv1') {
                return renderTemplate('Cv1');
            }
            return <div className="template-error">Error loading template</div>;
        }
    };

    useEffect(() => {
        getJsonById(resumeId).then((data) => {
            console.log('datais' + data);
            data !== null &&
                setValues({
                    values: {
                        firstname: data.firstname,
                        lastname: data.lastname,
                        photo: data.photo,
                        phone: data.phone,
                        address: data.address,
                        email: data.email,
                        country: data.country,
                        city: data.city,
                        postalcode: data.postalcode,
                        languages: data.languages,
                        employments: data.employments,
                        skills: data.skills,
                        educations: data.educations,
                        summary: data.summary,
                        components: data.components,
                        template: data.resumeName !== undefined ? data.resumeName : data.template,
                    },

                    gotData: true,
                });
        });
    }, []);

    useEffect(() => {
        console.log(values);
    }, [values]);
    return (
        <div className="public-resume">
            <div className="head">
                <div className="head-left">
                    <AiFillHome className="home-icon" />
                    <a href="/">Go to Homepage</a>
                </div>
                <div className="head-middle">
                    <div className="font-controller">
                        <AiOutlinePlus onClick={() => handleScaleUp()} className="plus-icon" />
                        <TbLetterCase className="letter-case" />
                        <AiOutlineMinus onClick={() => handleScaleDown()} className="minus-icon" />
                    </div>
                </div>
                <div className="head-right">
                    <a
                        onClick={() => {
                            handleDownloadClick();
                        }}
                        className="download-btn">
                        Download PDF
                    </a>
                </div>
            </div>
            <div className="body">
                {values.scale}
                <div className="resume" style={{ transform: `scale(${scale})` }}>
                    {values.gotData && renderTemplate(values.values.template || 'Cv1')}
                </div>
            </div>
        </div>
    );
}

export default PublicResume;
