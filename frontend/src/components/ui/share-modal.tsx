/**
 * ShareModal — DIR-008
 *
 * Turns a resume into a real, revocable public link:
 *   - reads the server publication state when the dialog opens;
 *   - publishes/unpublishes through `/resumes/:id/publish|unpublish`;
 *   - shows a tokenized `/shared/<token>` URL only while the resume is published;
 *   - surfaces conflicts, offline and unconfigured-secret errors honestly.
 *
 * It never displays a "public" link whose server state is unpublished: the
 * toggle reflects the persisted publication, not local UI state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { get, post } from '@/lib/api-client';
import {
  fetchPublicationState,
  publishResume,
  revokeResume,
  describeShareError,
  buildShareUrl,
  type ApiClientLike,
} from '@/lib/share-publication';
import {
  Share2,
  Copy,
  Check,
  Globe,
  Mail,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
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
  const [isPublic, setIsPublic] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [publicationRevision, setPublicationRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The publication API is injected through the shared client module so the
  // dialog stays presentational and the state machine is unit-testable.
  const api: ApiClientLike = useMemo(() => ({ get, post }), []);

  const sharePath = shareToken ? `/shared/${shareToken}` : null;
  const shareUrl = sharePath && typeof window !== 'undefined'
    ? buildShareUrl(window.location.origin, sharePath)
    : '';

  const loadPublication = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      const state = await fetchPublicationState(api, resumeId);
      setIsPublic(state.isPublished);
      setShareToken(state.shareToken ?? null);
      setPublicationRevision(typeof state.publicationRevision === 'number' ? state.publicationRevision : null);
    } catch (err) {
      // A failed read must not present an unpublished-looking switch as truth.
      setError(describeShareError(err));
      setIsPublic(false);
      setShareToken(null);
    } finally {
      setLoading(false);
    }
  }, [resumeId, api]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    void loadPublication();
  }, [open, loadPublication]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const togglePublication = async () => {
    if (!resumeId || pending) return;
    setPending(true);
    setError(null);
    try {
      if (isPublic) {
        const result = await revokeResume(api, resumeId, publicationRevision);
        setIsPublic(false);
        setShareToken(null);
        setPublicationRevision(typeof result.publicationRevision === 'number' ? result.publicationRevision : null);
      } else {
        const result = await publishResume(api, resumeId);
        setIsPublic(true);
        setShareToken(result.shareToken ?? null);
        setPublicationRevision(typeof result.publicationRevision === 'number' ? result.publicationRevision : null);
      }
    } catch (err) {
      setError(describeShareError(err));
      await loadPublication();
    } finally {
      setPending(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setError('Your browser blocked clipboard access. Select the link and copy it manually.');
    }
  };

  const canShare = isPublic && Boolean(shareUrl);
  const actionText = resumeName || 'Untitled Resume';

  const openExternal = (url: string) => {
    if (!canShare) return;
    window.open(url, '_blank', 'noopener,noreferrer');
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
              <DialogTitle className="text-lg font-bold text-ink">Share Resume</DialogTitle>
              <DialogDescription className="text-xs text-ink-muted">
                {actionText} · {templateId}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 p-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex size-7 items-center justify-center rounded-lg ${isPublic ? 'bg-success-50 text-success-600' : 'bg-canvas-soft text-ink-muted'}`}>
                <Globe className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink">Public Web Link</p>
                <p className="text-xs text-ink-muted">
                  {loading
                    ? 'Checking the current share status…'
                    : isPublic
                      ? 'Anyone with the link can view this resume'
                      : 'Only you can view this resume'}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              aria-label="Publish this resume to a public link"
              aria-describedby="share-public-help"
              disabled={loading || pending || !resumeId}
              onClick={() => void togglePublication()}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                isPublic ? 'bg-brand-600' : 'bg-neutral-300'
              }`}
              data-testid="share-public-toggle"
            >
              {pending && (
                <Loader2 className="absolute -left-6 size-4 animate-spin text-ink-muted" aria-hidden="true" />
              )}
              <span
                className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isPublic ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p id="share-public-help" className="sr-only">
            Turning this on publishes the last saved version of this resume at a private,
            unguessable link. Turning it off revokes the link immediately.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700"
              data-testid="share-error"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="share-url" className="text-xs font-medium text-ink">
              Shareable URL
            </label>
            <div className="flex gap-2">
              <Input
                id="share-url"
                readOnly
                value={canShare ? shareUrl : ''}
                placeholder={isPublic ? 'Preparing link…' : 'Publish the resume to create a link'}
                aria-describedby="share-url-state"
                className="font-mono text-xs text-ink-secondary selection:bg-brand-100"
                data-testid="share-url"
              />
              <Button
                type="button"
                variant={copied ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => void handleCopy()}
                disabled={!canShare}
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
            <p id="share-url-state" className="text-xs text-ink-muted" data-testid="share-state">
              {isPublic
                ? 'Published · the link stays valid until you turn sharing off.'
                : 'Not published · no public link exists.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-ink">Quick Share</span>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canShare}
                onClick={() => openExternal(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Here is my professional resume: ${actionText} — ${shareUrl}`)}`)}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-emerald-500 hover:text-emerald-600"
              >
                <MessageCircle className="size-3.5 text-emerald-600" />
                WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canShare}
                onClick={() => openExternal(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`)}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-blue-500 hover:text-blue-600"
              >
                <LinkedinIcon className="size-3.5 text-blue-600" />
                LinkedIn
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canShare}
                onClick={() => {
                  if (!canShare) return;
                  window.location.href = `mailto:?subject=${encodeURIComponent(`Professional Resume — ${actionText}`)}&body=${encodeURIComponent(`Hello,\n\nPlease review my resume:\n${shareUrl}\n\nBest regards,\n${actionText}`)}`;
                }}
                className="flex items-center justify-center gap-1.5 text-xs hover:border-brand-500 hover:text-brand-600"
              >
                <Mail className="size-3.5 text-brand-600" />
                Email
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-canvas-soft p-2.5 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success-600" />
              Private token · revocable at any time
            </span>
            {canShare ? (
              <a
                href={sharePath || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-medium text-brand-600 hover:underline"
              >
                Open Live <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="font-medium text-ink-muted">Open Live (disabled)</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
