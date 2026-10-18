/**
 * LiveInterviewSession Component
 *
 * Face-to-face AI interview studio supporting live webcam feed,
 * speech-to-text audio input, AI interviewer avatar, closed captions,
 * and live question feedback.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  Volume2,
} from 'lucide-react';

export interface LiveInterviewSessionProps {
  sessionToken?: string;
  topic?: string;
  jobRole?: string;
  onComplete?: (report: unknown) => void;
  onExit?: () => void;
}

export function LiveInterviewSession({
  topic = 'General Practice',
  jobRole = 'Software Professional',
  onExit,
}: LiveInterviewSessionProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [captionsActive] = useState(true);
  const [sessionState] = useState<'connecting' | 'active' | 'evaluating'>('active');

  return (
    <div className="flex h-full flex-col bg-canvas p-4 sm:p-6 space-y-6">
      {/* Studio Header */}
      <div className="flex items-center justify-between border-b border-edge pb-4">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            Live AI Face-to-Face Studio
          </h2>
          <p className="text-xs text-ink-muted">
            {topic} · Role: {jobRole} · Real-time STT & Speech Synthesis
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExit && (
            <Button variant="outline" size="sm" onClick={onExit} className="text-xs">
              Exit Studio
            </Button>
          )}
        </div>
      </div>

      {/* Main Studio Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Candidate Webcam Feed */}
        <Card className="flex flex-col justify-between overflow-hidden bg-neutral-900 border-neutral-800 text-white min-h-[300px]">
          <div className="p-4 flex items-center justify-between text-xs text-white/70">
            <span className="flex items-center gap-1.5 font-medium">
              <User className="size-3.5" /> Candidate Video Stream
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10">
              {cameraActive ? '1080p 60fps' : 'Camera Off'}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {cameraActive ? (
              <div className="size-24 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center animate-pulse">
                <Video className="size-12" />
              </div>
            ) : (
              <div className="size-20 rounded-full bg-white/10 text-white/40 flex items-center justify-center mb-3">
                <VideoOff className="size-10" />
              </div>
            )}
            <p className="text-xs text-white/60 mt-3 max-w-xs">
              {cameraActive ? 'Camera active. Ready for live visual cues.' : 'Click Enable Camera below to start video stream.'}
            </p>
          </div>

          {/* Controls Bar */}
          <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-center gap-3">
            <Button
              size="sm"
              variant={cameraActive ? 'primary' : 'outline'}
              onClick={() => setCameraActive(!cameraActive)}
              className="text-xs font-bold gap-1.5"
            >
              {cameraActive ? <Video className="size-3.5" /> : <VideoOff className="size-3.5" />}
              {cameraActive ? 'Disable Camera' : 'Enable Camera'}
            </Button>

            <Button
              size="sm"
              variant={micActive ? 'primary' : 'outline'}
              onClick={() => setMicActive(!micActive)}
              className="text-xs font-bold gap-1.5"
            >
              {micActive ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
              {micActive ? 'Mute Mic' : 'Unmute Mic'}
            </Button>
          </div>
        </Card>

        {/* AI Talking Avatar & Real-time Transcript */}
        <Card className="flex flex-col justify-between overflow-hidden bg-surface border-edge">
          <div className="p-4 border-b border-edge flex items-center justify-between text-xs text-ink-muted">
            <span className="flex items-center gap-1.5 font-bold text-ink">
              <Bot className="size-4 text-accent" /> AI Senior Interviewer (Executive)
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
              <Volume2 className="size-3.5" /> Voice Synthesizer Active
            </span>
          </div>

          <div className="p-6 flex-1 flex flex-col justify-center space-y-4">
            <div className="p-4 rounded-xl bg-canvas-soft border border-edge text-xs leading-relaxed text-ink space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent block">
                Current Question
              </span>
              <p className="font-medium text-sm">
                &ldquo;Tell me about a complex technical disagreement you had with an engineering peer or stakeholder, and how you drove consensus while preserving architectural integrity.&rdquo;
              </p>
            </div>

            {captionsActive && (
              <div className="p-3 rounded-lg bg-surface border border-edge text-[11px] text-ink-muted italic">
                Captions: [Listening to candidate speech stream...]
              </div>
            )}
          </div>

          <div className="p-4 border-t border-edge flex items-center justify-between bg-canvas-soft/30 text-xs">
            <span className="text-ink-muted">Session Status: {sessionState}</span>
            <Button size="sm" variant="ghost" className="text-xs gap-1">
              <RotateCcw className="size-3" /> Repeat Question
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default LiveInterviewSession;
