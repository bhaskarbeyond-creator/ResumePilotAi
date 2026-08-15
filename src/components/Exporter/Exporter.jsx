import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getJsonById } from '../../firestore/dbOperations';
import { isKnownTemplate } from '../../utils/templateRegistry';
import TemplateRenderer from '../TemplateRenderer';
import { readRenderToken } from './exportAccess';

const EMPTY_RESUME = Object.freeze({
    firstname: '', lastname: '', photo: '', phone: '', address: '', email: '',
    country: '', city: '', postalcode: '', languages: [], employments: [],
    skills: [], educations: [], summary: '', components: [],
    colors: { primary: '#1E40AF', secondary: '#F8FAFC' },
});

export default function Exporter({ resumeName }) {
    const { resumeId, language = 'en' } = useParams();
    const templateId = isKnownTemplate(resumeName) ? resumeName : 'Cv1';
    const [values, setValues] = useState(EMPTY_RESUME);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let active = true;
        document.documentElement.removeAttribute('data-export-ready');
        document.documentElement.removeAttribute('data-export-error');
        const renderToken = readRenderToken(window.location.hash);
        const dataRequest = renderToken
            ? fetch(`/api/export-render-data?token=${encodeURIComponent(renderToken)}`, { cache: 'no-store' })
                .then(async response => response.ok ? (await response.json()).data : null)
            : getJsonById(resumeId);
        dataRequest
            .then((data) => {
                if (!active) return;
                if (!data) {
                    setStatus('error');
                    document.documentElement.setAttribute('data-export-error', 'not-found');
                    return;
                }
                setValues(data);
                setStatus('rendering');
            })
            .catch(() => {
                if (!active) return;
                setStatus('error');
                document.documentElement.setAttribute('data-export-error', 'load-failed');
            });
        return () => {
            active = false;
            document.documentElement.removeAttribute('data-export-ready');
            document.documentElement.removeAttribute('data-export-error');
        };
    }, [resumeId]);

    const markReady = useCallback(async () => {
        try { await document.fonts?.ready; } catch (_) { /* browser font API is optional */ }
        requestAnimationFrame(() => {
            document.documentElement.setAttribute('data-export-ready', 'true');
            setStatus('ready');
        });
    }, []);

    if (status === 'error') {
        return (
            <main role="alert" className="flex min-h-screen items-center justify-center bg-white p-8 text-slate-700">
                The resume could not be loaded for export.
            </main>
        );
    }

    if (status === 'loading') {
        return <main role="status" className="flex min-h-screen items-center justify-center bg-white text-slate-500">Loading resume…</main>;
    }

    return (
        <main className="export-document bg-white" data-export-status={status}>
            <TemplateRenderer
                templateId={templateId}
                values={values}
                language={language}
                onReady={markReady}
                onError={() => {
                    setStatus('error');
                    document.documentElement.setAttribute('data-export-error', 'render-failed');
                }}
            />
        </main>
    );
}
