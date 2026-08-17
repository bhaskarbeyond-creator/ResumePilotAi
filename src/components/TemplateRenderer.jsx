import React, { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTemplateComponent, isKnownTemplate } from '../utils/templateRegistry';
import SmartResumeComposer from '../engine/hybrid/SmartResumeComposer';

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

export default function TemplateRenderer({ templateId = 'Cv1', values, language = 'en', loadingFallback, errorFallback, onError, onReady }) {
    const safeTemplateId = isKnownTemplate(templateId) ? templateId : 'Cv1';
    const isResumeTemplate = /^Cv\d+$/.test(safeTemplateId);
    const TemplateComponent = getTemplateComponent(safeTemplateId);

    return (
        <TemplateErrorBoundary resetKey={`${safeTemplateId}:${language}`} errorFallback={errorFallback} onError={onError}>
            <Suspense fallback={loadingFallback || (
                <div role="status" aria-live="polite" className="flex min-h-48 items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
                    Loading template…
                </div>
            )}>
                <TemplateCommit key={`${safeTemplateId}:${language}`} onReady={onReady}>
                    {isResumeTemplate ? (
                        <SmartResumeComposer templateId={safeTemplateId} language={language} values={values} />
                    ) : (
                        <TemplateComponent values={values} language={language} />
                    )}
                </TemplateCommit>
            </Suspense>
        </TemplateErrorBoundary>
    );
}
