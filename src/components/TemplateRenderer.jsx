import React, { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTemplateComponent, isKnownTemplate } from '../utils/templateRegistry';
import ResumeExtras from '../cv-templates/shared/ResumeExtras';

class TemplateErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        this.props.onError?.(error);
    }

    componentDidUpdate(previousProps) {
        if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null });
        }
    }

    render() {
        if (this.state.error) return this.props.errorFallback || (
            <div role="alert" className="flex min-h-48 items-center justify-center bg-slate-50 p-6 text-center text-sm text-slate-600">
                This template could not be rendered. Try another template or review the resume data.
            </div>
        );
        return this.props.children;
    }
}

function TemplateCommit({ onReady, children }) {
    useEffect(() => { onReady?.(); }, [onReady]);
    return children;
}

/**
 * Content Engine bridge: resumes carry Projects / Certifications / Achievements /
 * References in the canonical data model, but the 51 template boards predate
 * those sections. This portal appends a design-neutral extras block at the end
 * of the board so the data is never silently invisible. Resume Builder
 * templates only — the frozen cover-letter module is excluded by the caller.
 */
function ResumeExtrasPortal({ enabled, values }) {
    const [board, setBoard] = useState(null);
    useEffect(() => {
        if (!enabled) return undefined;
        const node = document.querySelector('#resumen') || document.querySelector('[class*="board"], [class*="Board"]');
        setBoard(node);
        return () => setBoard(null);
    }, [enabled]);
    if (!enabled || !board) return null;
    return createPortal(<ResumeExtras values={values} />, board);
}

export default function TemplateRenderer({ templateId = 'Cv1', values, language = 'en', loadingFallback, errorFallback, onError, onReady }) {
    const safeTemplateId = isKnownTemplate(templateId) ? templateId : 'Cv1';
    const TemplateComponent = getTemplateComponent(safeTemplateId);
    const isResumeTemplate = /^Cv\d+$/.test(safeTemplateId);
    return (
        <TemplateErrorBoundary resetKey={`${safeTemplateId}:${language}`} errorFallback={errorFallback} onError={onError}>
            <Suspense fallback={loadingFallback || (
                <div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
                    Loading template…
                </div>
            )}>
                <TemplateCommit key={`${safeTemplateId}:${language}`} onReady={onReady}>
                    <TemplateComponent values={values} language={language} />
                    <ResumeExtrasPortal enabled={isResumeTemplate} values={values} />
                </TemplateCommit>
            </Suspense>
        </TemplateErrorBoundary>
    );
}
