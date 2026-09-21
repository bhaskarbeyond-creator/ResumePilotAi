import { useCallback, useEffect, useRef, useState } from 'react';

function mediaFailure(error) {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return { status: 'unavailable', message: 'This browser cannot access a camera or microphone.' };
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return { status: 'denied', message: 'Camera or microphone access was denied. You can continue in text mode or change browser permissions.' };
    if (error?.name === 'NotFoundError') return { status: 'unavailable', message: 'No usable camera or microphone was found. You can continue in text mode.' };
    if (error?.name === 'NotReadableError') return { status: 'busy', message: 'Your camera or microphone is being used by another application. Close it and try again.' };
    return { status: 'error', message: 'We could not start your camera and microphone. You can continue in text mode.' };
}

export function useInterviewMedia() {
    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);

    const attachVideo = useCallback((element) => {
        videoRef.current = element;
        if (element && streamRef.current) {
            element.srcObject = streamRef.current;
            element.play?.().catch(() => {});
        }
    }, []);

    const stop = useCallback(() => {
        const stream = streamRef.current;
        streamRef.current = null;
        if (stream) stream.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setStatus(previous => previous === 'idle' ? previous : 'stopped');
    }, []);

    const request = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            const failure = mediaFailure();
            setStatus(failure.status);
            setMessage(failure.message);
            return null;
        }
        stop();
        setStatus('requesting');
        setMessage('Waiting for camera and microphone permission…');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play?.().catch(() => {});
            }
            setAudioEnabled(stream.getAudioTracks().some(track => track.enabled));
            setVideoEnabled(stream.getVideoTracks().some(track => track.enabled));
            setStatus('ready');
            setMessage('Camera and microphone are ready. Nothing is recorded or uploaded.');
            return stream;
        } catch (error) {
            const failure = mediaFailure(error);
            setStatus(failure.status);
            setMessage(failure.message);
            return null;
        }
    }, [stop]);

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
        const stream = streamRef.current;
        if (stream) stream.getTracks().forEach(track => track.stop());
    }, []);

    return {
        attachVideo,
        request,
        stop,
        status,
        message,
        audioEnabled,
        videoEnabled,
        toggleAudio,
        toggleVideo,
        hasStream: Boolean(streamRef.current),
    };
}
