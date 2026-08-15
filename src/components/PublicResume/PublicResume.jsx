import React, { useEffect, useState } from 'react';
import './PublicResume.scss';
import { AiFillHome, AiOutlinePlus, AiOutlineMinus } from 'react-icons/ai';
import { TbLetterCase } from 'react-icons/tb';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import download from 'downloadjs';
import { getJsonById } from '../../firestore/dbOperations';
import { isKnownTemplate } from '../../utils/templateRegistry';
import { trackDownload, trackEvent } from '../../utils/ga4';
import { toValidatedPdfBlob } from '../../utils/pdfDownload';
import TemplateRenderer from '../TemplateRenderer';

export default function PublicResume() {
    const { resumeId } = useParams();
    const { i18n } = useTranslation('common');
    const [resume, setResume] = useState(null);
    const [status, setStatus] = useState('loading');
    const [message, setMessage] = useState('');
    const [scale, setScale] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640 ? 0.45 : 0.8);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        let active = true;
        setStatus('loading');
        getJsonById(resumeId)
            .then((data) => {
                if (!active) return;
                if (!data) {
                    setStatus('not-found');
                    return;
                }
                setResume(data);
                setStatus('ready');
            })
            .catch(() => { if (active) setStatus('error'); });
        return () => { active = false; };
    }, [resumeId]);

    const templateId = isKnownTemplate(resume?.resumeName || resume?.template)
        ? (resume.resumeName || resume.template)
        : 'Cv1';

    const handleDownload = async () => {
        if (!resume || isDownloading) return;
        setIsDownloading(true);
        setMessage('');
        try {
            const response = await axios.post('/api/public-export', {
                language: i18n.language || 'en',
                resumeId,
                resumeName: templateId,
            }, { responseType: 'blob' });
            // Reject JSON error bodies delivered through the blob response type.
            const pdfBlob = await toValidatedPdfBlob(response.data);
            download(pdfBlob, 'resume.pdf', 'application/pdf');
            trackDownload(templateId, 'shared-resume');
            trackEvent('shared_resume_download', 'Documents', templateId, 1);
            setMessage('PDF downloaded successfully.');
        } catch (error) {
            const serverMessage = error.response?.data instanceof Blob ? '' : error.response?.data?.error?.message;
            setMessage(serverMessage
                || (error?.code === 'EXPORT_NOT_PDF' ? error.message : '')
                || 'PDF download is unavailable. The owner may need an active subscription.');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <main className="public-resume">
            <header className="head" aria-label="Shared resume controls">
                <div className="head-left">
                    <AiFillHome className="home-icon" aria-hidden="true" />
                    <a href="/">Go to homepage</a>
                </div>
                <div className="head-middle">
                    <div className="font-controller" role="group" aria-label="Resume zoom">
                        <button type="button" onClick={() => setScale(value => Math.min(1.5, Number((value + 0.1).toFixed(1))))} disabled={scale >= 1.5} aria-label="Zoom in">
                            <AiOutlinePlus className="plus-icon" aria-hidden="true" />
                        </button>
                        <TbLetterCase className="letter-case" aria-hidden="true" />
                        <button type="button" onClick={() => setScale(value => Math.max(0.5, Number((value - 0.1).toFixed(1))))} disabled={scale <= 0.5} aria-label="Zoom out">
                            <AiOutlineMinus className="minus-icon" aria-hidden="true" />
                        </button>
                        <output aria-live="polite" className="sr-only">Zoom {Math.round(scale * 100)} percent</output>
                    </div>
                </div>
                <div className="head-right">
                    <button type="button" onClick={handleDownload} disabled={status !== 'ready' || isDownloading} className="download-btn">
                        {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
                    </button>
                </div>
            </header>

            {message && <p role="status" aria-live="polite" className="mx-auto my-2 max-w-xl text-center text-sm text-slate-700">{message}</p>}

            <section className="body" aria-label="Shared resume">
                {status === 'loading' && <p role="status">Loading resume…</p>}
                {status === 'not-found' && <p role="alert">This shared resume was not found or is no longer published.</p>}
                {status === 'error' && <p role="alert">The shared resume could not be loaded. Please try again later.</p>}
                {status === 'ready' && (
                    <div className="resume-frame" style={{ width: `${794 * scale}px`, minHeight: `${1123 * scale}px` }}>
                    <div className="resume" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                        <TemplateRenderer templateId={templateId} values={resume} language={i18n.language || 'en'} />
                    </div>
                    </div>
                )}
            </section>
        </main>
    );
}
