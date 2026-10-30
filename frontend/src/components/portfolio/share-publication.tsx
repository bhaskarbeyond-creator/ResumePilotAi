/**
 * Share & publication dialog for a Web CV portfolio.
 *
 * It reports what the server said and nothing more:
 * - the public URL is shown only for a portfolio the server reports as published
 *   with an issued slug;
 * - copying reports success only when the clipboard write actually resolved, and
 *   says so through a live region either way;
 * - the QR code is generated locally from the canonical public URL, so it can
 *   never point at a different address than the one displayed;
 * - social links are built with encoded values and carry no private data.
 *
 * Unpublishing and publishing themselves stay in the builder, which owns the
 * revision-checked publication calls.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Clock, Copy, Globe, Link2, Mail, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { publicPortfolioQr, publicPortfolioUrl, qrSvgPath } from '@/lib/portfolio';
import { cn } from '@/lib/utils';

const dialogClass =
  'w-[calc(100%-2rem)] max-w-lg rounded-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto';
const titleClass = 'px-7 sm:pl-0';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};

export interface SocialShareTarget {
  id: string;
  label: string;
  href: string;
}

/**
 * Social destinations for a public URL. Values are encoded, and nothing but the
 * public address and the portfolio's public title is sent.
 */
export function socialShareTargets(url: string, title: string): SocialShareTarget[] {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return [
    {
      id: 'linkedin',
      label: 'Share on LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      id: 'x',
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      id: 'whatsapp',
      label: 'Share on WhatsApp',
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
    },
  ];
}

/** `mailto:` link for sharing by email; subject and body are encoded. */
export function mailShareHref(url: string, title: string): string {
  return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${url}`)}`;
}

export interface SharePublicationDialogProps {
  open: boolean;
  /** Public title used in share text — the portfolio title, nothing private. */
  title: string;
  /** Slug issued by the server; null until the portfolio has been published. */
  slug: string | null;
  isPublished: boolean;
  publishedAt?: string | null;
  /** Opens the publish flow; the builder owns the revision-checked call. */
  onPublish: () => void;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}

type CopyState = { status: 'idle' } | { status: 'copied' } | { status: 'failed'; message: string };

export function SharePublicationDialog({
  open,
  title,
  slug,
  isPublished,
  publishedAt,
  onPublish,
  onClose,
  returnFocusRef,
}: SharePublicationDialogProps) {
  const publicUrl = isPublished && slug ? publicPortfolioUrl(slug) : '';
  const [copyState, setCopyState] = useState<CopyState>({ status: 'idle' });
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const urlInputId = useId();
  const qrHeadingId = useId();
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopyState({ status: 'idle' });
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, [open]);

  const qr = useMemo(() => (publicUrl ? publicPortfolioQr(slug) : null), [publicUrl, slug]);
  const socials = useMemo(() => (publicUrl ? socialShareTargets(publicUrl, title) : []), [publicUrl, title]);

  const copy = async () => {
    if (!publicUrl) return;
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(publicUrl);
      setCopyState({ status: 'copied' });
      resetTimer.current = window.setTimeout(() => setCopyState({ status: 'idle' }), 3000);
    } catch {
      // A failed clipboard write must never look like a success.
      setCopyState({
        status: 'failed',
        message: 'The link could not be copied automatically. Select the address above and copy it.',
      });
      copyButtonRef.current?.focus();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={dialogClass}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <div className="space-y-5">
          <DialogHeader>
            <DialogTitle className={titleClass}>Share your portfolio</DialogTitle>
            <DialogDescription className="break-words">
              {isPublished
                ? 'Anyone with this link can view your published portfolio.'
                : 'This portfolio is still a private draft. Publish it to get a public link you can share.'}
            </DialogDescription>
          </DialogHeader>

          <p
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              isPublished
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-border bg-neutral-100 text-neutral-700',
            )}
          >
            {isPublished ? <Check className="size-3.5" aria-hidden="true" /> : <Clock className="size-3.5" aria-hidden="true" />}
            {isPublished ? 'Published' : 'Draft — not public'}
          </p>
          {isPublished && formatDate(publishedAt) && (
            <p className="-mt-3 text-xs text-ink-muted">Published {formatDate(publishedAt)}</p>
          )}

          {!isPublished && (
            <div className="rounded-xl border border-border bg-neutral-50 p-4 text-sm text-ink-secondary dark:bg-neutral-900/50">
              <p>Publishing issues a permanent public address and makes this page visible to anyone with the link.</p>
              <Button className="mt-3" size="sm" onClick={onPublish}>
                <Globe aria-hidden="true" /> Publish portfolio
              </Button>
            </div>
          )}

          {publicUrl && (
            <>
              <div>
                <label htmlFor={urlInputId} className="mb-1.5 block text-sm font-medium text-ink">
                  Public link
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id={urlInputId}
                    type="text"
                    readOnly
                    value={publicUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-neutral-50 px-3 font-mono text-sm text-ink dark:bg-neutral-900"
                  />
                  <Button ref={copyButtonRef} type="button" onClick={() => void copy()} className="shrink-0">
                    {copyState.status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copyState.status === 'copied' ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
                <p role="status" className="mt-1.5 min-h-4 text-xs text-emerald-700">
                  {copyState.status === 'copied' ? 'Link copied to your clipboard.' : ''}
                </p>
                {copyState.status === 'failed' && (
                  <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-error-700">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{copyState.message}</span>
                  </p>
                )}
              </div>

              <section aria-labelledby={qrHeadingId} className="rounded-xl border border-border p-4">
                <h3 id={qrHeadingId} className="text-sm font-medium text-ink">
                  QR code
                </h3>
                {qr ? (
                  <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:items-start">
                    <svg
                      role="img"
                      aria-label={`QR code linking to ${qr.text}`}
                      viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
                      className="size-40 shrink-0 rounded bg-white p-1"
                      shapeRendering="crispEdges"
                    >
                      <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#ffffff" />
                      <path d={qrSvgPath(qr)} fill="#000000" />
                    </svg>
                    <p className="text-xs text-ink-secondary">
                      Point a phone camera at the code to open the portfolio. The code encodes exactly the link shown
                      above.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-secondary">
                    A QR code can’t be generated for this address. This normally means the public site address is not
                    configured for this deployment.
                  </p>
                )}
              </section>

              <section aria-label="Share on social media">
                <h3 className="text-sm font-medium text-ink">Share</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {socials.map((target) => (
                    <li key={target.id}>
                      <Button asChild size="sm" variant="outline">
                        <a href={target.href} target="_blank" rel="noopener noreferrer">
                          <Share2 aria-hidden="true" /> {target.label}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </Button>
                    </li>
                  ))}
                  <li>
                    <Button asChild size="sm" variant="outline">
                      <a href={mailShareHref(publicUrl, title)}>
                        <Mail aria-hidden="true" /> Share by email
                      </a>
                    </Button>
                  </li>
                </ul>
              </section>
            </>
          )}

          {!publicUrl && isPublished && (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-neutral-50 p-3 text-sm text-ink-secondary dark:bg-neutral-900/50">
              <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                The portfolio is published but the server has not returned a public address for it. Reload the page to
                pick up the latest version.
              </span>
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
