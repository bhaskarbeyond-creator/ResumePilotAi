/**
 * Voice Interview Engine (DISC-038)
 *
 * Provides real-time speech capture, audio activity visualization, and
 * text-to-speech question playback for the AI Interview Coach.
 *
 * Built on standard browser Web APIs:
 * - Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * - Web Audio API (AudioContext, AnalyserNode) for microphone waveform
 * - SpeechSynthesis API for spoken interviewer question playback
 */

export interface VoiceCapabilities {
  speechRecognition: boolean;
  speechSynthesis: boolean;
  audioCapture: boolean;
}

export function getVoiceCapabilities(): VoiceCapabilities {
  const hasRecognition = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const hasSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const hasMedia = typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  return {
    speechRecognition: Boolean(hasRecognition),
    speechSynthesis: Boolean(hasSynthesis),
    audioCapture: Boolean(hasMedia),
  };
}

export class VoiceInterviewRecorder {
  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;

  public isListening = false;
  public isSpeaking = false;

  constructor(
    private onTranscript: (text: string, isFinal: boolean) => void,
    private onVolumeChange: (volume: number) => void,
    private onError: (error: string) => void
  ) {}

  /**
   * Start microphone capture and speech recognition.
   */
  public async startListening(): Promise<boolean> {
    if (this.isListening) return true;

    const capabilities = getVoiceCapabilities();
    if (!capabilities.speechRecognition) {
      this.onError('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return false;
    }

    try {
      // 1. Initialize microphone stream for audio visualizer
      if (capabilities.audioCapture) {
        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            source.connect(this.analyser);
            this.startVolumeMonitoring();
          }
        } catch (mediaErr: any) {
          console.warn('[VoiceInterview] Microphone audio visualizer could not start:', mediaErr?.message);
        }
      }

      // 2. Initialize Speech Recognition
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const combined = (final || interim).trim();
        if (combined) {
          this.onTranscript(combined, Boolean(final));
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed') {
          this.onError('Microphone permission denied. Please allow microphone access in browser settings.');
        } else {
          this.onError(`Speech recognition notice: ${event.error}`);
        }
        this.stopListening();
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          // Restart if still marked as listening (browsers auto-stop on silence)
          try {
            this.recognition.start();
          } catch {
            this.isListening = false;
          }
        }
      };

      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (err: any) {
      this.onError(err?.message || 'Failed to start speech recognition.');
      this.stopListening();
      return false;
    }
  }

  /**
   * Stop listening and release microphone resources.
   */
  public stopListening(): void {
    this.isListening = false;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }

    this.onVolumeChange(0);
  }

  /**
   * Monitor RMS volume level from Web Audio AnalyserNode.
   */
  private startVolumeMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.analyser || !this.isListening) {
        this.onVolumeChange(0);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(100, Math.round((avg / 128) * 100));
      this.onVolumeChange(normalized);

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  /**
   * Speak interviewer question using SpeechSynthesis.
   */
  public speakQuestion(text: string, onEnd?: () => void): boolean {
    const capabilities = getVoiceCapabilities();
    if (!capabilities.speechSynthesis) return false;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    this.isSpeaking = true;

    utterance.onend = () => {
      this.isSpeaking = false;
      onEnd?.();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  /**
   * Cancel any active spoken speech.
   */
  public stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }
}
