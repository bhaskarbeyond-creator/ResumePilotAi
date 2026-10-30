/**
 * Project Case Study Media Gallery (FP-C07)
 *
 * Implements interactive drag-and-drop media upload, thumbnail preview,
 * caption editing, and lightbox modal view for project case studies.
 */

import React, { useState, useRef, useId } from 'react';
import { UploadCloud, Trash2, ZoomIn, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PortfolioMediaItem } from '@/lib/portfolio';

interface GalleryProps {
  portfolioId?: string;
  projectId?: string;
  items: PortfolioMediaItem[];
  readOnly?: boolean;
  onUpload?: (item: {
    title: string;
    caption: string;
    mimeType: string;
    fileSize: number;
    url: string;
    projectId?: string;
  }) => Promise<void>;
  onDelete?: (mediaId: string) => Promise<void>;
  className?: string;
}

export function PortfolioGallery({
  portfolioId,
  projectId,
  items,
  readOnly = false,
  onUpload,
  onDelete,
  className,
}: GalleryProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeLightboxItem, setActiveLightboxItem] = useState<PortfolioMediaItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputId = useId();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly || !onUpload) return;
    setUploadError(null);
    setUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
          throw new Error(`File '${file.name}' is not an image. Only PNG, JPEG, WEBP, GIF, and SVG are supported.`);
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File '${file.name}' is larger than 5MB.`);
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file.'));
          reader.readAsDataURL(file);
        });

        await onUpload({
          title: file.name.replace(/\.[^/.]+$/, ''),
          caption: '',
          mimeType: file.type,
          fileSize: file.size,
          url: dataUrl,
          projectId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!readOnly && e.dataTransfer.files) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!readOnly) setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  return (
    <div className={cn('space-y-4', className)} data-portfolio-id={portfolioId}>
      {!readOnly && onUpload && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors',
            dragOver ? 'border-brand-600 bg-brand-50/50' : 'border-border bg-neutral-50/50 hover:bg-neutral-50',
            uploading && 'opacity-60 cursor-not-allowed'
          )}
        >
          <UploadCloud className="size-8 text-ink-muted" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">
            Drag & drop project screenshots or media
          </p>
          <p className="text-xs text-ink-secondary mt-1">
            Supports PNG, JPEG, WEBP, GIF, SVG up to 5MB
          </p>
          <div className="mt-3">
            <input
              id={uploadInputId}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
                  Uploading…
                </>
              ) : (
                'Choose files'
              )}
            </Button>
          </div>
          {uploadError && (
            <p role="alert" className="mt-2 text-xs font-medium text-error-700">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {items.length === 0 && readOnly && (
        <div className="flex items-center gap-2 text-xs text-ink-muted py-2">
          <ImageIcon className="size-4" aria-hidden="true" />
          <span>No gallery media uploaded for this case study.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-surface shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="aspect-video w-full overflow-hidden bg-neutral-100">
                <img
                  src={item.url}
                  alt={item.title || 'Case study screenshot'}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>

              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-8 rounded-full bg-white/90 text-ink shadow-sm hover:bg-white"
                  aria-label={`View ${item.title || 'image'} full size`}
                  onClick={() => setActiveLightboxItem(item)}
                >
                  <ZoomIn className="size-4" aria-hidden="true" />
                </Button>
                {!readOnly && onDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-8 rounded-full shadow-sm"
                    aria-label={`Delete ${item.title || 'image'}`}
                    onClick={() => void onDelete(item.id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              {item.title && (
                <div className="p-2 text-xs font-medium text-ink truncate">
                  {item.title}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeLightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeLightboxItem.title || 'Image Preview'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActiveLightboxItem(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl bg-surface p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-4 top-4 z-10 size-8 rounded-full bg-white/80 shadow-md hover:bg-white"
              aria-label="Close image preview"
              onClick={() => setActiveLightboxItem(null)}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
            <img
              src={activeLightboxItem.url}
              alt={activeLightboxItem.title || 'Full size case study media'}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {activeLightboxItem.title && (
              <p className="mt-2 text-center text-sm font-medium text-ink">
                {activeLightboxItem.title}
              </p>
            )}
            {activeLightboxItem.caption && (
              <p className="mt-1 text-center text-xs text-ink-secondary">
                {activeLightboxItem.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
