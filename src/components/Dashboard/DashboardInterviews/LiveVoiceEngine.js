// LiveVoiceEngine.js - Confident, Studio-Grade Voice Synthesis Engine
// Prioritizes free built-in Natural / Neural voices (Edge Natural, Chrome Google Neural, Safari Premium)
// and handles natural conversational pacing with micro-pauses between clauses.

export const INTERVIEWER_PERSONAS = [
    {
        id: 'alex',
        name: 'Alex Vance',
        title: 'Executive Hiring Director',
        gender: 'male',
        avatarInitial: 'AV',
        description: 'Strategic, confident, and direct with deep leadership acumen.',
        accent: 'en-US',
        pitch: 0.95,
        rate: 0.98,
        theme: 'from-blue-600 via-indigo-700 to-slate-900',
    },
    {
        id: 'sarah',
        name: 'Sarah Jenkins',
        title: 'VP of Engineering',
        gender: 'female',
        avatarInitial: 'SJ',
        description: 'Rigorous, articulate, and insightful with architectural depth.',
        accent: 'en-US',
        pitch: 1.0,
        rate: 0.97,
        theme: 'from-violet-600 via-purple-700 to-slate-900',
    },
    {
        id: 'marcus',
        name: 'Marcus Sterling',
        title: 'Principal Technical Fellow',
        gender: 'male',
        avatarInitial: 'MS',
        description: 'Analytical, calm, and methodical, probing deep technical nuances.',
        accent: 'en-GB',
        pitch: 0.94,
        rate: 0.96,
        theme: 'from-emerald-600 via-teal-700 to-slate-900',
    },
];

class VoiceEngine {
    constructor() {
        this.voices = [];
        this.isLoaded = false;
        this.currentUtterance = null;
        this.subscribers = new Set();
        this.init();
    }

    init() {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;

        const loadVoices = () => {
            try {
                const available = window.speechSynthesis.getVoices() || [];
                if (available.length > 0) {
                    this.voices = available;
                    this.isLoaded = true;
                    this.notifySubscribers();
                }
            } catch (_) {
                // Ignore voice load errors
            }
        };

        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        if (this.isLoaded) callback(this.voices);
        return () => this.subscribers.delete(callback);
    }

    notifySubscribers() {
        this.subscribers.forEach(cb => {
            try { cb(this.voices); } catch (_) {}
        });
    }

    getVoices() {
        return this.voices;
    }

    scoreVoice(voice, preferredGender = 'male', preferredLang = 'en') {
        let score = 0;
        const name = (voice.name || '').toLowerCase();
        const lang = (voice.lang || '').toLowerCase();

        if (lang.startsWith(preferredLang)) score += 30;
        if (lang.includes('us') || lang.includes('en-us') || lang.includes('en_us')) score += 15;

        // Neural & Natural voices in Edge/Chrome (Free, remarkably human)
        if (name.includes('natural') || name.includes('online (natural)')) score += 100;
        if (name.includes('neural')) score += 90;
        if (name.includes('google') && (lang.includes('en-us') || lang.includes('en-gb'))) score += 70;
        if (name.includes('premium') || name.includes('enhanced')) score += 60;

        // Specific high-confidence executive voices in Edge / Windows / Mac
        if (preferredGender === 'male') {
            if (name.includes('christopher') || name.includes('guy')) score += 80;
            if (name.includes('david') && name.includes('natural')) score += 40;
            if (name.includes('male') || name.includes('george') || name.includes('daniel')) score += 30;
        } else {
            if (name.includes('jenny') || name.includes('aria') || name.includes('michelle')) score += 80;
            if (name.includes('zira') && name.includes('natural')) score += 40;
            if (name.includes('female') || name.includes('samantha') || name.includes('victoria')) score += 30;
        }

        // Demote robotic legacy system synth voices
        if (name.includes('desktop') && !name.includes('natural')) score -= 40;
        if (name.includes('espeak') || name.includes('microsoft sam')) score -= 80;

        return score;
    }

    getBestVoice(personaId = 'alex') {
        const persona = INTERVIEWER_PERSONAS.find(p => p.id === personaId) || INTERVIEWER_PERSONAS[0];
        if (!this.voices.length) {
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                this.voices = window.speechSynthesis.getVoices() || [];
            }
        }
        if (!this.voices.length) return null;

        const scored = this.voices.map(v => ({
            voice: v,
            score: this.scoreVoice(v, persona.gender, 'en'),
        }));

        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.voice || this.voices[0];
    }

    prepareSpeechChunks(text) {
        if (!text) return [];
        const clean = text.replace(/\[[^\]]*\]/g, '').replace(/[*_#`]/g, '').trim();
        const sentences = clean.split(/(?<=[.?!;:])\s+/).filter(Boolean);
        return sentences.map(s => s.trim()).filter(s => s.length > 0);
    }

    speak(text, { personaId = 'alex', onStart, onEnd, onError, onBoundary } = {}) {
        this.cancel();

        if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            if (onError) onError(new Error('Speech synthesis not available in this browser.'));
            return;
        }

        const persona = INTERVIEWER_PERSONAS.find(p => p.id === personaId) || INTERVIEWER_PERSONAS[0];
        const selectedVoice = this.getBestVoice(personaId);
        const chunks = this.prepareSpeechChunks(text);

        if (chunks.length === 0) {
            if (onEnd) onEnd();
            return;
        }

        let chunkIndex = 0;
        let isCancelled = false;

        const speakNextChunk = () => {
            if (isCancelled || chunkIndex >= chunks.length) {
                this.currentUtterance = null;
                if (onEnd && !isCancelled) onEnd();
                return;
            }

            const chunkText = chunks[chunkIndex];
            const utterance = new SpeechSynthesisUtterance(chunkText);

            if (selectedVoice) utterance.voice = selectedVoice;
            utterance.rate = persona.rate || 0.98;
            utterance.pitch = persona.pitch || 0.96;
            utterance.volume = 1.0;

            if (chunkIndex === 0 && onStart) {
                utterance.onstart = () => onStart({ persona, voice: selectedVoice });
            }

            if (onBoundary) {
                utterance.onboundary = (e) => onBoundary(e, chunkIndex);
            }

            utterance.onend = () => {
                chunkIndex++;
                setTimeout(() => {
                    if (!isCancelled) speakNextChunk();
                }, 140);
            };

            utterance.onerror = (e) => {
                if (e.error === 'interrupted' || e.error === 'canceled') {
                    isCancelled = true;
                    return;
                }
                if (onError) onError(e);
                if (onEnd) onEnd();
            };

            this.currentUtterance = utterance;
            try {
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                if (onError) onError(err);
            }
        };

        speakNextChunk();

        return () => {
            isCancelled = true;
            this.cancel();
        };
    }

    cancel() {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            try {
                window.speechSynthesis.cancel();
            } catch (_) {}
        }
        this.currentUtterance = null;
    }
}

export const liveVoiceEngine = new VoiceEngine();
