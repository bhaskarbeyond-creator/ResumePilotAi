import { useCallback, useEffect, useRef, useState } from 'react';

function getActiveHost() {
    if (typeof window === 'undefined') return 'localhost:3000';
    return window.location.host || window.location.hostname || 'localhost:3000';
}

function mediaFailure(error) {
    const host = getActiveHost();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return {
            status: 'unavailable',
            message: 'This browser cannot access a camera or microphone. You can continue in text mode.',
            solution: 'Use a modern browser like Chrome, Edge, Safari, or Firefox on HTTPS or localhost.',
        };
    }
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError' || error?.name === 'PermissionDeniedError') {
        return {
            status: 'denied',
            message: 'Camera or microphone access was denied. You can continue in text mode or change browser permissions.',
            solution: `In your browser address bar next to ${host}, click the 🔒 icon, set Microphone and Camera to "Allow", and click Refresh. On Windows, also verify Windows Settings → Privacy & Security → Microphone → "Let desktop apps access your microphone" is ON.`,
        };
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        return {
            status: 'unavailable',
            message: 'No usable camera or microphone was found. You can continue in text mode.',
            solution: 'Plug in a headset or webcam, or continue in Text Mode with full AI interview feedback.',
        };
    }
    if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
        return {
            status: 'busy',
            message: 'Your camera or microphone is being used by another application. Close it and try again.',
            solution: 'Close Zoom, Microsoft Teams, Slack, Discord, or any other browser tab currently using media.',
        };
    }
    return {
        status: 'error',
        message: 'We could not start your camera and microphone. You can continue in text mode.',
        solution: 'Click "Continue in Text Mode" below or verify your audio/video hardware connections.',
    };
}

export function useInterviewMedia() {
    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const [solution, setSolution] = useState('');
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [activeMode, setActiveMode] = useState('none'); // 'both' | 'audio-only' | 'video-only' | 'text-mode' | 'none'
    const [hasCompanionExtension, setHasCompanionExtension] = useState(() => {
        if (typeof window === 'undefined') return false;
        return Boolean(window.__RESUMEPILOT_COMPANION__);
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const check = () => {
            if (window.__RESUMEPILOT_COMPANION__) setHasCompanionExtension(true);
        };
        check();
        window.addEventListener('resumepilot_companion_ready', check);
        return () => window.removeEventListener('resumepilot_companion_ready', check);
    }, []);

    const attachVideo = useCallback((element) => {
        videoRef.current = element;
        if (element && streamRef.current) {
            element.srcObject = streamRef.current;
            element.play?.().catch(() => {});
        }
    }, []);

    const stop = useCallback(() => {
        const activeStream = streamRef.current;
        streamRef.current = null;
        setStream(null);
        if (activeStream) activeStream.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setStatus(previous => (previous === 'idle' || previous === 'text-mode') ? previous : 'stopped');
        setActiveMode(previous => previous === 'text-mode' ? 'text-mode' : 'none');
    }, []);

    const enterTextMode = useCallback(() => {
        stop();
        setStatus('text-mode');
        setActiveMode('text-mode');
        setMessage('Text Mode active: Answer all questions comfortably using your keyboard. Full AI evaluation and instant scoring enabled.');
        setSolution('');
    }, [stop]);

    const request = useCallback(async (preferredMode = 'auto') => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            const failure = mediaFailure();
            setStatus(failure.status);
            setMessage(failure.message);
            setSolution(failure.solution);
            return null;
        }
        stop();
        setStatus('requesting');
        setMessage('Detecting and connecting camera & microphone…');
        setSolution('');

        let activeStream = null;
        let hasAudio = false;
        let hasVideo = false;

        // Mode: Explicit Audio-Only
        if (preferredMode === 'audio-only') {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                hasAudio = true;
            } catch (err) {
                const failure = mediaFailure(err);
                setStatus(failure.status);
                setMessage(failure.message);
                setSolution(failure.solution);
                return null;
            }
        }
        // Mode: Explicit Video-Only
        else if (preferredMode === 'video-only') {
            try {
                activeStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                });
                hasVideo = true;
            } catch (err) {
                const failure = mediaFailure(err);
                setStatus(failure.status);
                setMessage(failure.message);
                setSolution(failure.solution);
                return null;
            }
        }
        // Mode: Auto / Adaptive Multi-Stage Negotiation
        else {
            try {
                // Step 1: Attempt dual camera + microphone
                activeStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                hasAudio = true;
                hasVideo = true;
            } catch (primaryError) {
                // Step 2: Gracefully fallback to audio-only if camera is blocked or not connected
                try {
                    activeStream = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    });
                    hasAudio = true;
                } catch (audioError) {
                    // Step 3: Gracefully fallback to video-only if microphone is blocked or not connected
                    try {
                        activeStream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                        });
                        hasVideo = true;
                    } catch (videoError) {
                        // All physical capture modes failed: construct helpful diagnostic
                        const failure = mediaFailure(primaryError);
                        setStatus(failure.status);
                        setMessage(failure.message);
                        setSolution(failure.solution);
                        return null;
                    }
                }
            }
        }

        streamRef.current = activeStream;
        setStream(activeStream);

        if (videoRef.current && hasVideo) {
            videoRef.current.srcObject = activeStream;
            await videoRef.current.play?.().catch(() => {});
        }

        setAudioEnabled(hasAudio);
        setVideoEnabled(hasVideo);
        setStatus('ready');

        if (hasAudio && hasVideo) {
            setActiveMode('both');
            setMessage('Camera and microphone are ready. Nothing is recorded or uploaded.');
        } else if (hasAudio) {
            setActiveMode('audio-only');
            setMessage('Microphone is ready (Audio Mode). Camera is off. Nothing is recorded or uploaded.');
        } else {
            setActiveMode('video-only');
            setMessage('Camera is ready (Video Mode). Answer questions by typing below.');
        }
        setSolution('');
        return activeStream;
    }, [stop]);

    const requestAudioOnly = useCallback(() => request('audio-only'), [request]);
    const requestVideoOnly = useCallback(() => request('video-only'), [request]);

    const toggleAudio = useCallback(() => {
        const tracks = streamRef.current?.getAudioTracks() || [];
        if (!tracks.length) return false;
        const enabled = !tracks.some(track => track.enabled);
        tracks.forEach(track => { track.enabled = enabled; });
        setAudioEnabled(enabled);
        return enabled;
    }, []);

    const toggleVideo = useCallback(() => {
        const tracks = streamRef.current?.getVideoTracks() || [];
        if (!tracks.length) return false;
        const enabled = !tracks.some(track => track.enabled);
        tracks.forEach(track => { track.enabled = enabled; });
        setVideoEnabled(enabled);
        return enabled;
    }, []);

    useEffect(() => () => {
        const activeStream = streamRef.current;
        if (activeStream) activeStream.getTracks().forEach(track => track.stop());
    }, []);

    return {
        attachVideo,
        request,
        requestAudioOnly,
        requestVideoOnly,
        enterTextMode,
        stop,
        status,
        message,
        solution,
        audioEnabled,
        videoEnabled,
        activeMode,
        stream,
        toggleAudio,
        toggleVideo,
        hasStream: Boolean(streamRef.current),
        hasCompanionExtension,
    };
}
