// LiveAudioWaveform.jsx - Real-Time Audio Reactive Waveform & Visualizer
// High-performance HTML5 Canvas component providing:
// 1. Fluid multi-harmonic sine waves when the interviewer is speaking (Siri/Gemini Live style)
// 2. Real-time FFT audio spectrum frequency bars when candidate's microphone is active
import React, { useEffect, useRef } from 'react';

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
        const isJSDOM = typeof window !== 'undefined' && (/jsdom/i.test(window.navigator?.userAgent || '') || typeof window.HTMLCanvasElement === 'undefined');
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
                ctx.beginPath();
                ctx.moveTo(0, centerY);
                ctx.lineTo(width, centerY);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
                ctx.lineWidth = 2;
                ctx.stroke();
                animationFrameRef.current = requestAnimationFrame(render);
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

                    const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
                    grad.addColorStop(0, '#818cf8');
                    grad.addColorStop(1, '#4f46e5');

                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.roundRect(x, y, barWidth, barHeight, 3);
                    ctx.fill();
                }
            } else {
                // Fluid multi-sine waves (Siri/Gemini style)
                const waves = [
                    { amplitude: active ? 16 * realAmplitude : 3, frequency: 0.025, speed: 1.0, color: 'rgba(99, 102, 241, 0.85)', width: 2.5 },
                    { amplitude: active ? 12 * realAmplitude : 2, frequency: 0.035, speed: -1.2, color: 'rgba(168, 85, 247, 0.75)', width: 2 },
                    { amplitude: active ? 8 * realAmplitude : 1.5, frequency: 0.02, speed: 0.8, color: 'rgba(56, 189, 248, 0.65)', width: 1.5 },
                ];

                waves.forEach(wave => {
                    ctx.beginPath();
                    ctx.lineWidth = wave.width;
                    ctx.strokeStyle = wave.color;

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
    }, [active, color, height, mediaStream, mode]);

    return (
        <div className={`relative overflow-hidden w-full flex items-center justify-center ${className}`} style={{ height: `${height}px` }}>
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    );
}
