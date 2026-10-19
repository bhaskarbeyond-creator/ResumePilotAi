/**
 * ShareModal Component
 *
 * Cuba Modern Executive Glassmorphic Share Dialog built on Radix UI Dialog.
 * Allows candidates to share their resume via public link, WhatsApp, LinkedIn, or Email.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Share2,
  Copy,
  Check,
  Globe,
  Mail,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
  </svg>
);

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
  resumeName: string;
  templateId?: string;
}

export function ShareModal({
  open,
  onOpenChange,
  resumeId,
  resumeName,
  templateId = 'Cv1',
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // Derive canonical preview URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://ime365.local';
  const shareUrl = `${origin}/export/${templateId}/${resumeId}/en`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(`Here is my professional resume: ${resumeName} — ${shareUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleLinkedInShare = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Professional Resume — ${resumeName}`);
    const body = encodeURIComponent(`Hello,\n\nPlease review my resume:\n${shareUrl}\n\nBest regards,\n${resumeName}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-border bg-surface shadow-2xl sm:rounded-2xl"
        data-testid="cuba-share-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Share2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-ink">
                Share Resume
              </DialogTitle>
              <DialogDescription className="text-xs text-ink-muted">
                {resumeName || 'Untitled Resume'} · {templateId}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Public Access Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-success-50 text-success-600">
                <Globe className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink">Public Web Link</p>
                <p className="text-[11px] text-ink-muted">Anyone with this link can view this resume</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                isPublic ? 'bg-brand-600' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isPublic ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Share Link Copy Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Shareable URL</label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="font-mono text-xs text-ink-secondary selection:bg-brand-100"
              />
              <Button
                type="button"
                variant={copied ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleCopy}
                className="shrink-0 gap-1.5 px-3"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-success-600" />
                    <span className="text-xs text-success-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span className="text-xs">Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Social Channels */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Quick Share</label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleWhatsAppShare}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-emerald-500 hover:text-emerald-600"
              >
                <MessageCircle className="size-3.5 text-emerald-600" />
                WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLinkedInShare}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-blue-500 hover:text-blue-600"
              >
                <LinkedinIcon className="size-3.5 text-blue-600" />
                LinkedIn
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEmailShare}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-brand-500 hover:text-brand-600"
              >
                <Mail className="size-3.5 text-brand-600" />
                Email
              </Button>
            </div>
          </div>

          {/* Security & Direct Preview notice */}
          <div className="flex items-center justify-between rounded-lg bg-canvas-soft p-2.5 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success-600" />
              Authenticated SSL & ATS-safe view
            </span>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-medium text-brand-600 hover:underline"
            >
              Open Live <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
