import React from 'react';

/**
 * High-fidelity Resume Watermark Overlay for Free / Basic accounts.
 *
 * Governed by administrative system settings (`public_config.watermark`) and
 * resolved entitlements (`removesWatermark: false`).
 * Automatically omitted for Pro, Premium, Enterprise, and Admin users.
 */
export default function ResumeWatermarkOverlay({ watermark }) {
    if (!watermark || watermark.enableFreeWatermark === false) {
        return null;
    }

    const text = watermark.watermarkText || 'Created with IME365 (Free Plan)';
    const opacity = typeof watermark.opacity === 'number'
        ? Math.max(0.04, Math.min(watermark.opacity, 0.6))
        : 0.18;
    const position = watermark.position || 'diagonal';

    if (position === 'bottom-center') {
        return (
            <div
                className="resume-watermark-overlay resume-watermark-bottom"
                data-testid="resume-watermark-overlay"
                data-watermark-position="bottom-center"
                style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 40,
                    opacity,
                }}
            >
                <div
                    style={{
                        padding: '4px 14px',
                        border: '1.5px solid currentColor',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#1e293b',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    }}
                >
                    {text}
                </div>
            </div>
        );
    }

    if (position === 'header') {
        return (
            <div
                className="resume-watermark-overlay resume-watermark-header"
                data-testid="resume-watermark-overlay"
                data-watermark-position="header"
                style={{
                    position: 'absolute',
                    top: '10px',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    zIndex: 40,
                    opacity,
                }}
            >
                <div
                    style={{
                        padding: '4px 14px',
                        border: '1.5px solid currentColor',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#1e293b',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    }}
                >
                    {text}
                </div>
            </div>
        );
    }

    // Default: 'diagonal' across the canvas
    return (
        <div
            className="resume-watermark-overlay resume-watermark-diagonal"
            data-testid="resume-watermark-overlay"
            data-watermark-position="diagonal"
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 40,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    transform: 'rotate(-35deg)',
                    padding: '12px 28px',
                    border: '3px dashed currentColor',
                    borderRadius: '8px',
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: '#0f172a',
                    opacity,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    maxWidth: '90%',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.4)',
                }}
            >
                {text}
            </div>
        </div>
    );
}
