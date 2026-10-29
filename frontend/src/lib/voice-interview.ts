/**
 * Voice Interview Engine (DISC-038)
 *
 * Real browser speech for the Interview Coach, with no simulated audio:
 * - Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) for capture
 * - Web Audio API (`AudioContext` + `AnalyserNode`) for microphone activity
 * - Speech Synthesis (`speechSynthesis` + `SpeechSynthesisUtterance`) for playback
 *
 * Everything is feature-detected. When a capability is missing the UI is told
 * exactly why, and the interview keeps working through its text path — nothing
 * here reports a capability the browser does not have, and no audio is
 * synthesized or measured outside the real APIs.
 *
 * Recognition never outlives the component that started it: `stopListening()`
 * (and `dispose()`) abort the session, stop the media tracks, cancel the
 * animation frame and close the AudioContext.
 */

/** A user-facing reason why a capability is unavailable, or null when it is available. */
export interface VoiceCapabilities {
  /** `SpeechRecognition`/`webkitSpeechRecognition` is implemented by this browser. */
  speechRecognition: boolean;
  /** `window.speechSynthesis` and `SpeechSynthesisUtterance` exist. */
  speechSynthesis: boolean;
  /** A microphone stream can be requested (`navigator.mediaDevices.getUserMedia`). */
  audioCapture: boolean;
  /** A secure context is required for microphone access; localhost counts as secure. */
  secureContext: boolean;
  /** `AudioContext` (or `webkitAudioContext`) exists for real level metering. */
  audioContext: boolean;
  /** Why dictation is unavailable, or null when it is available. */
  speechRecognitionReason: string | null;
  /** Why playback is unavailable, or null when it is available. */
  speechSynthesisReason: string | null;
  /** Why level metering is unavailable, or null when it is available. */
  audioActivityReason: string | null;
}

export type MicrophonePermission = 'granted' | 'denied' | 'prompt' | 'unknown';

const RECOGNITION_UNSUPPORTED =
  'This browser does not support speech recognition (Web Speech API). Type your answer instead, or use Chrome, Edge or Safari.';
const SYNTHESIS_UNSUPPORTED = 'This browser cannot read questions aloud. Read the question on screen instead.';
const METER_UNSUPPORTED = 'Microphone activity cannot be measured in this browser.';

const isBrowser = (): boolean => typeof window !== 'undefined';

function secureContextAvailable(): boolean {
  // `isSecureContext` is undefined in a few older engines; treat that as unknown
  // and let the real permission failure speak for itself.
  return !isBrowser() || window.isSecureContext !== false;
}

/** The recognition constructor, or null when the browser does not implement it. */
export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (!isBrowser()) return null;
  const scope = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function getAudioContextConstructor(): (new () => AudioContext) | null {
  if (!isBrowser()) return null;
  const scope = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function hasMediaDevices(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/**
 * Report the real capability set of the current browser. Reusable and
 * side-effect free: it never asks for a permission, so "supported" here means
 * "the API exists", not "the microphone will be granted".
 */
export function getVoiceCapabilities(): VoiceCapabilities {
  const speechRecognition = getSpeechRecognitionConstructor() !== null;
  const speechSynthesis = isBrowser()
    && typeof window.speechSynthesis !== 'undefined'
    && typeof window.SpeechSynthesisUtterance === 'function';
  const audioContext = getAudioContextConstructor() !== null;
  const secureContext = secureContextAvailable();
  const audioCapture = audioContext && hasMediaDevices() && secureContext;

  let speechRecognitionReason: string | null = null;
  if (!speechRecognition) speechRecognitionReason = RECOGNITION_UNSUPPORTED;
  else if (!secureContext) speechRecognitionReason = 'Voice input needs a secure (https) page. Type your answer instead.';

  const audioActivityReason = !audioContext
    ? METER_UNSUPPORTED
    : !hasMediaDevices()
      ? 'Microphone capture is not available in this browser, so activity cannot be shown.'
      : !secureContext
        ? 'Microphone access needs a secure (https) page.'
        : null;

  return {
    speechRecognition,
    speechSynthesis,
    audioCapture,
    secureContext,
    audioContext,
    speechRecognitionReason,
    speechSynthesisReason: speechSynthesis ? null : SYNTHESIS_UNSUPPORTED,
    audioActivityReason,
  };
}

/** Whether the browser exposes the Permissions API entry for the microphone. */
export async function probeMicrophonePermission(): Promise<MicrophonePermission> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted' || status.state === 'denied' || status.state === 'prompt'
      ? status.state
      : 'unknown';
  } catch {
    // Firefox and Safari do not expose the microphone permission name; an
    // 'unknown' answer is truthful and callers fall back to the getUserMedia result.
    return 'unknown';
  }
}

/* ────────────────────────── Web Speech API typings ────────────────────────── */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}

/** The subset of the Web Speech API `SpeechRecognition` this module drives. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onnomatch?: (() => void) | null;
}

/* ────────────────────────────── Error messages ────────────────────────────── */

export type VoiceErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'microphone-unavailable'
  | 'network'
  | 'recognition-error'
  | 'synthesis-unsupported'
  | 'synthesis-error'
  | 'busy';

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
}

/** Map a Web Speech API error name onto a truthful, actionable message. */
export function describeRecognitionError(error: string): VoiceError {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code: 'permission-denied',
        message: 'Microphone permission was denied. Allow microphone access in your browser settings, or type your answer instead.',
      };
    case 'audio-capture':
      return {
        code: 'microphone-unavailable',
        message: 'No microphone was found. Check that one is connected and not in use by another app, or type your answer instead.',
      };
    case 'network':
      return {
        code: 'network',
        message: 'Speech recognition lost its connection to the recognition service. Check your connection and try again, or type your answer.',
      };
    case 'no-speech':
      return { code: 'recognition-error', message: 'Nothing was heard. Try again and speak a little closer to the microphone.' };
    case 'aborted':
      return { code: 'recognition-error', message: 'Dictation was stopped.' };
    default:
      return {
        code: 'recognition-error',
        message: `Speech recognition stopped (${error}). You can try again or type your answer.`,
      };
  }
}

/* ─────────────────────────────── The recorder ─────────────────────────────── */

export interface VoiceRecorderOptions {
  /** Interim (not yet final) words, for a live caption under the microphone. */
  onInterim?: (text: string) => void;
  /** Called whenever capture starts or stops, including unexpected stops. */
  onListeningChange?: (listening: boolean) => void;
  /** Recognition language, default `en-US`. */
  language?: string;
}

/** 0-100 microphone activity, sampled from real PCM data. */
export type VolumeListener = (level: number) => void;

const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 350;

export class VoiceInterviewRecorder {
  private recognition: SpeechRecognitionLike | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private restartTimer: number | null = null;
  private restarts = 0;
  /** True between a caller-initiated start and stop; gates the automatic restart. */
  private wantListening = false;
  /** Guards re-entrant `startListening()` calls while permission is pending. */
  private starting = false;
  /** Set by `dispose()`; every callback becomes a no-op afterwards. */
  private disposed = false;
  private muted = false;

  public isListening = false;
  public isSpeaking = false;
  /** True while a real microphone signal is being measured (never faked). */
  public hasAudioSignal = false;

  // Declared as fields (not constructor parameter properties) so this module
  // stays importable by tooling that only strips types, e.g. `node --test`
  // against the shared contract suite.
  private readonly onTranscript: (text: string, isFinal: boolean) => void;
  private readonly onVolumeChange: VolumeListener;
  private readonly onError: (message: string, code?: VoiceErrorCode) => void;
  private readonly options: VoiceRecorderOptions;

  constructor(
    onTranscript: (text: string, isFinal: boolean) => void,
    onVolumeChange: VolumeListener,
    onError: (message: string, code?: VoiceErrorCode) => void,
    options: VoiceRecorderOptions = {},
  ) {
    this.onTranscript = onTranscript;
    this.onVolumeChange = onVolumeChange;
    this.onError = onError;
    this.options = options;
  }

  /**
   * Ask for the microphone and start dictation.
   *
   * Resolves true only once capture is actually running. Every failure path
   * reports a specific message through `onError` and resolves false, so the
   * caller can keep the text path usable.
   */
  public async startListening(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.isListening) return true;
    if (this.starting) return false;

    const capabilities = getVoiceCapabilities();
    if (!capabilities.speechRecognition) {
      this.report({ code: 'unsupported', message: capabilities.speechRecognitionReason ?? RECOGNITION_UNSUPPORTED });
      return false;
    }

    this.starting = true;
    this.wantListening = true;
    this.restarts = 0;

    try {
      // Microphone level metering is optional: dictation itself does not need
      // it, so a refused stream is reported but does not end the session.
      if (capabilities.audioCapture) await this.openAudioMeter();
      else if (capabilities.audioActivityReason) this.setAudioSignal(false);

      const Recognition = getSpeechRecognitionConstructor();
      if (!Recognition) throw new Error('Speech recognition became unavailable.');

      const recognition = new Recognition();
      recognition.lang = this.options.language ?? 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (this.disposed) return;
        this.restarts = 0;
        this.setListening(true);
      };

      recognition.onresult = (event) => {
        if (this.disposed) return;
        let finalText = '';
        let interimText = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const alternative = result?.[0];
          if (!alternative) continue;
          if (result.isFinal) finalText += alternative.transcript;
          else interimText += alternative.transcript;
        }
        const final = finalText.trim();
        if (final) this.onTranscript(final, true);
        this.options.onInterim?.(interimText.trim());
      };

      recognition.onerror = (event) => {
        if (this.disposed) return;
        const described = describeRecognitionError(event.error);
        if (event.error === 'aborted' && !this.wantListening) return;
        // no-speech is a normal pause, not a failure the candidate must act on.
        if (event.error === 'no-speech') return;
        this.report(described);
        // Fatal errors must not be retried in a loop.
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)) {
          this.stopListening();
        }
      };

      recognition.onend = () => {
        if (this.disposed) return;
        this.setListening(false);
        // Browsers stop on a pause in speech. Restart only while the caller
        // still wants dictation, and only a bounded number of times so an
        // error that keeps ending the session cannot spin forever.
        if (!this.wantListening || this.restarts >= MAX_RESTARTS) {
          if (this.wantListening) {
            this.report({
              code: 'recognition-error',
              message: 'Dictation stopped after several interruptions. Start it again, or type your answer.',
            });
            this.stopListening();
          }
          return;
        }
        this.restarts += 1;
        this.clearRestartTimer();
        this.restartTimer = window.setTimeout(() => {
          this.restartTimer = null;
          if (this.disposed || !this.wantListening || !this.recognition) return;
          try {
            this.recognition.start();
          } catch {
            // Chrome throws InvalidStateError when the previous session has not
            // fully ended. Leaving `wantListening` true lets the next `onend`
            // schedule another bounded attempt instead of spinning here.
            this.report({ code: 'recognition-error', message: 'Dictation could not be restarted. Stop and start it again.' });
            this.stopListening();
          }
        }, RESTART_DELAY_MS);
      };

      this.recognition = recognition;
      recognition.start();
      this.setListening(true);
      return true;
    } catch (error) {
      const described = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
        ? {
          code: 'permission-denied' as const,
          message: 'Microphone permission was denied. Allow microphone access in your browser settings, or type your answer instead.',
        }
        : error instanceof DOMException && error.name === 'NotFoundError'
          ? { code: 'microphone-unavailable' as const, message: 'No microphone was found. Connect one and try again, or type your answer.' }
          : { code: 'recognition-error' as const, message: 'Dictation could not start. Try again, or type your answer.' };
      this.report(described);
      this.stopListening();
      return false;
    } finally {
      this.starting = false;
    }
  }

  /** Stop dictation and release the microphone, the meter and the AudioContext. */
  public stopListening(): void {
    this.wantListening = false;
    this.clearRestartTimer();
    this.setListening(false);

    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch (error) {
        this.noteCleanupError(error);
      }
    }

    this.options.onInterim?.('');
    this.closeAudioMeter();
  }

  /** Hard stop used when a session or the page goes away. */
  public dispose(): void {
    this.disposed = true;
    this.stopListening();
    this.stopSpeaking();
  }

  /* ───────────────────────────── speech synthesis ───────────────────────────── */

  /**
   * Read `text` aloud with the browser's speech synthesis.
   *
   * Returns false when synthesis is unavailable or already speaking. Playback
   * always ends in exactly one of `onEnd`/an error report; nothing pretends an
   * audio file was produced.
   */
  public speak(text: string, onEnd?: () => void): boolean {
    const spoken = String(text ?? '').trim();
    if (this.disposed || !spoken) {
      onEnd?.();
      return false;
    }
    const capabilities = getVoiceCapabilities();
    if (!capabilities.speechSynthesis) {
      this.report({ code: 'synthesis-unsupported', message: capabilities.speechSynthesisReason ?? SYNTHESIS_UNSUPPORTED });
      onEnd?.();
      return false;
    }
    // One utterance at a time: the previous one is cancelled, never layered.
    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = this.options.language ?? 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      this.isSpeaking = false;
      onEnd?.();
    };

    utterance.onend = settle;
    utterance.onerror = (event) => {
      if (!settled) {
        this.report({
          code: 'synthesis-error',
          message: 'Reading the question aloud stopped unexpectedly. Read it on screen instead.',
        });
        if (event.error === 'not-allowed') {
          // Chrome refuses speech before any user gesture; stopping here avoids
          // a queue that would replay later without the candidate asking.
          this.stopSpeaking();
        }
      }
      settle();
    };

    this.isSpeaking = true;
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      this.isSpeaking = false;
      this.noteCleanupError(error);
      this.report({ code: 'synthesis-error', message: 'The browser refused to read the question aloud. Read it on screen instead.' });
      settle();
      return false;
    }
  }

  /** Cancel any utterance in progress. Safe to call when nothing is playing. */
  public stopSpeaking(): void {
    this.isSpeaking = false;
    if (!isBrowser() || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      this.noteCleanupError(error);
    }
  }

  /** Mute the meter without ending dictation (used when speech is played back). */
  public setMeterMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.onVolumeChange(0);
  }

  /* ──────────────────────────── audio activity meter ────────────────────────── */

  private async openAudioMeter(): Promise<void> {
    if (!hasMediaDevices()) {
      this.setAudioSignal(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.mediaStream = stream;
      const AudioContextCtor = getAudioContextConstructor();
      if (!AudioContextCtor) {
        this.setAudioSignal(false);
        return;
      }
      const context = new AudioContextCtor();
      this.audioContext = context;
      if (context.state === 'suspended') await context.resume().catch((error: unknown) => this.noteCleanupError(error));
      this.sourceNode = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      this.sourceNode.connect(analyser);
      this.analyser = analyser;
      this.setAudioSignal(true);
      this.startLevelLoop();
    } catch (error) {
      this.setAudioSignal(false);
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      const missing = error instanceof DOMException && error.name === 'NotFoundError';
      if (denied || missing) {
        this.report({
          code: denied ? 'permission-denied' : 'microphone-unavailable',
          message: denied
            ? 'Microphone permission was denied, so your voice cannot be captured. Type your answer instead.'
            : 'No microphone was found, so your voice cannot be captured. Type your answer instead.',
        });
        // A refused stream means dictation cannot work either.
        this.wantListening = false;
      } else {
        this.report({ code: 'microphone-unavailable', message: 'The microphone could not be opened. Type your answer instead.' });
      }
    }
  }

  /** Sample real time-domain PCM and report a 0-100 RMS level. */
  private startLevelLoop(): void {
    const analyser = this.analyser;
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);

    const update = () => {
      if (this.disposed || !this.analyser) return;
      if (this.muted) {
        this.animFrameId = requestAnimationFrame(update);
        return;
      }
      this.analyser.getFloatTimeDomainData(samples);
      let sumSquares = 0;
      for (let index = 0; index < samples.length; index += 1) sumSquares += samples[index] * samples[index];
      const rms = Math.sqrt(sumSquares / samples.length);
      // RMS of normal speech sits near 0.02-0.2; map it onto a readable 0-100.
      const level = Math.min(100, Math.round((rms / 0.25) * 100));
      this.onVolumeChange(level);
      this.animFrameId = requestAnimationFrame(update);
    };

    this.animFrameId = requestAnimationFrame(update);
  }

  private closeAudioMeter(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (error) {
        this.noteCleanupError(error);
      }
      this.sourceNode = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (error) {
        this.noteCleanupError(error);
      }
      this.analyser = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      const context = this.audioContext;
      this.audioContext = null;
      void context.close().catch((error: unknown) => this.noteCleanupError(error));
    }
    this.setAudioSignal(false);
    this.onVolumeChange(0);
  }

  /* ─────────────────────────────── internals ─────────────────────────────── */

  private setListening(listening: boolean): void {
    if (this.isListening === listening) return;
    this.isListening = listening;
    this.options.onListeningChange?.(listening);
  }

  private setAudioSignal(available: boolean): void {
    this.hasAudioSignal = available;
    if (!available) this.onVolumeChange(0);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer === null) return;
    window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private report(error: VoiceError): void {
    if (this.disposed) return;
    this.onError(error.message, error.code);
  }

  /**
   * Cleanup failures are recorded rather than thrown. They are never logged
   * with audio or transcript content, and never interrupt the interview.
   */
  private noteCleanupError(error: unknown): void {
    this.lastCleanupError = error instanceof Error ? error.name : String(error ?? 'unknown');
  }

  public lastCleanupError: string | null = null;
}
