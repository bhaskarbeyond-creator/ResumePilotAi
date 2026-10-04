// LiveAudioWaveform.jsx - Real-Time Audio Reactive Waveform & Visualizer
// High-performance HTML5 Canvas component providing:
// 1. Fluid multi-harmonic sine waves when the interviewer is speaking (Siri/Gemini Live style)
// 2. Real-time FFT audio spectrum frequency bars when candidate's microphone is active
//
// DIR-013 tokenisation: every colour is read from the Cuba design tokens
// (`src/styles/cuba-tokens.css`) via the computed-style bridge below. A 2D
// canvas cannot consume `var(--cuba-*)` directly, so the tokens are resolved
// once through getComputedStyle and cached per mount. Hard-coded hex values
// are deliberately absent from this file.
import React, { useEffect, useMemo, useRef } from 'react';

/** Families the `color` prop accepts, mapped to their token triples. */
const WAVE_FAMILIES = {
    indigo: ['--cuba-wave-indigo-1', '--cuba-wave-indigo-2', '--cuba-wave-indigo-3'],
    emerald: ['--cuba-wave-emerald-1', '--cuba-wave-emerald-2', '--cuba-wave-emerald-3'],
    cyan: ['--cuba-wave-cyan-1', '--cuba-wave-cyan-2', '--cuba-wave-cyan-3'],
    rose: ['--cuba-wave-rose-1', '--cuba-wave-rose-2', '--cuba-wave-rose-3'],
};

/**
 * Resolve the wave palette from the active document's computed styles.
 * Returns null while there is no DOM (SSR/JSDOM) so the caller can fall back
 * to an inert render rather than painting invented colours.
 */
function resolveWavePalette(el, color) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    const cs = window.getComputedStyle(el || document.documentElement);
    const read = (name) => cs.getPropertyValue(name).trim();
    const family = WAVE_FAMILIES[color] || WAVE_FAMILIES.indigo;

    const palette = {
        idle: read('--cuba-wave-idle'),
        barFrom: read('--cuba-wave-bar-from'),
        barTo: read('--cuba-wave-bar-to'),
        waves: family.map(read),
    };

    // A missing token means the stylesheet is not loaded; refuse to paint
    // rather than silently substituting a hard-coded colour.
    const complete =
        palette.idle && palette.barFrom && palette.barTo &&
        palette.waves.every(Boolean);
    return complete ? palette : null;
}

export default function LiveAudioWaveform({
    active = false,
    mode = 'wave', // 'wave' (smooth sine waves) or 'bars' (frequency spectrum)
    mediaStream = null,
    color = 'indigo', // 'indigo', 'emerald', 'cyan', 'rose'
    height = 48,
    className = '',
}) {
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const stepRef = useRef(0);
    const paletteRef = useRef(null);

    const isJSDOM = typeof window !== 'undefined' &&
        (/jsdom/i.test(window.navigator?.userAgent || '') ||
            typeof window.HTMLCanvasElement === 'undefined');

    // Reduced motion is honoured by freezing the wave rather than animating it.
    const reducedMotion = useMemo(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }, []);

    // Setup live Web Audio Analyser if mediaStream is provided
    useEffect(() => {
        if (!mediaStream || typeof window === 'undefined') return;

        let isCleanedUp = false;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                const ctx = new AudioContextClass();
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 64;
                analyser.smoothingTimeConstant = 0.8;

                const source = ctx.createMediaStreamSource(mediaStream);
                source.connect(analyser);

                audioContextRef.current = ctx;
                analyserRef.current = analyser;
                sourceRef.current = source;
            }
        } catch (_) {
            // Audio context initialization fallback
        }

        return () => {
            isCleanedUp = true;
            try {
                sourceRef.current?.disconnect?.();
                audioContextRef.current?.close?.();
            } catch (_) {}
            sourceRef.current = null;
            analyserRef.current = null;
            audioContextRef.current = null;
        };
    }, [mediaStream]);

    // Render loop
    useEffect(() => {
        if (isJSDOM) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        let ctx = null;
        try {
            ctx = canvas.getContext ? canvas.getContext('2d') : null;
        } catch (_) {
            return;
        }
        if (!ctx) return;

        const palette = resolveWavePalette(canvas, color);
        paletteRef.current = palette;

        let running = true;

        const render = () => {
            if (!running) return;

            const width = canvas.width;
            const h = canvas.height;
            const centerY = h / 2;

            ctx.clearRect(0, 0, width, h);

            let realAmplitude = 0.1;
            let freqData = null;

            // Extract live microphone volume if available
            if (analyserRef.current) {
                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteFrequencyData(dataArray);
                freqData = dataArray;

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / bufferLength;
                realAmplitude = Math.max(0.08, Math.min(1.2, avg / 45));
            }

            if (!active && !mediaStream) {
                // Subtle flat idle line
                if (palette) {
                    ctx.beginPath();
                    ctx.moveTo(0, centerY);
                    ctx.lineTo(width, centerY);
                    ctx.strokeStyle = palette.idle;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
                animationFrameRef.current = requestAnimationFrame(render);
                return;
            }

            if (reducedMotion) {
                // INV-5: reduced motion gets a static level bar, not a
                // suppressed-but-still-running rAF loop.
                if (palette) {
                    const level = active ? Math.max(4, h * 0.34) : 4;
                    ctx.fillStyle = palette.barFrom;
                    ctx.beginPath();
                    ctx.roundRect(0, centerY - level / 2, width, level, level / 2);
                    ctx.fill();
                }
                return;
            }

            stepRef.current += 0.05;
            const step = stepRef.current;

            if (mode === 'bars' && freqData) {
                // Live frequency spectrum bars
                const barCount = 20;
                const barWidth = (width / barCount) - 3;
                for (let i = 0; i < barCount; i++) {
                    const value = freqData[i % freqData.length] || 0;
                    const barHeight = Math.max(4, (value / 255) * (h - 6));
                    const x = i * (barWidth + 3);
                    const y = centerY - (barHeight / 2);

                    if (palette) {
                        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
                        grad.addColorStop(0, palette.barFrom);
                        grad.addColorStop(1, palette.barTo);

                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.roundRect(x, y, barWidth, barHeight, 3);
                        ctx.fill();
                    }
                }
            } else {
                // Fluid multi-sine waves (Siri/Gemini style)
                const waves = [
                    { amplitude: active ? 16 * realAmplitude : 3, frequency: 0.025, speed: 1.0, tone: 0, width: 2.5 },
                    { amplitude: active ? 12 * realAmplitude : 2, frequency: 0.035, speed: -1.2, tone: 1, width: 2 },
                    { amplitude: active ? 8 * realAmplitude : 1.5, frequency: 0.02, speed: 0.8, tone: 2, width: 1.5 },
                ];

                waves.forEach(wave => {
                    ctx.beginPath();
                    ctx.lineWidth = wave.width;
                    ctx.strokeStyle = palette ? palette.waves[wave.tone] : null;
                    if (!ctx.strokeStyle) return;

                    for (let x = 0; x < width; x += 3) {
                        // Taper edges to zero at both sides
                        const progress = x / width;
                        const envelope = Math.sin(progress * Math.PI);
                        const y = centerY + Math.sin(x * wave.frequency + step * wave.speed) * wave.amplitude * envelope;

                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                });
            }

            animationFrameRef.current = requestAnimationFrame(render);
        };

        // Retina resolution handling
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = (rect.width || 300) * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        render();

        return () => {
            running = false;
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [active, color, height, isJSDOM, mediaStream, mode, reducedMotion]);

    return (
        <div className={`relative overflow-hidden w-full flex items-center justify-center ${className}`} style={{ height: `${height}px` }}>
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    );
}
