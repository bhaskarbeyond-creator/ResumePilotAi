/**
 * Photo Crop Modal — Executive Profile Headshot Cropper
 *
 * Provides candidate photo cropping, panning, scaling (zoom), rotation,
 * and circular/square preview before committing to the resume document.
 * Pure HTML5 Canvas implementation with Cuba M3 executive glassmorphic styling.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Crop,
  Check,
  X,
  Sparkles,
  Move,
  Circle,
  Square,
} from 'lucide-react';

interface PhotoCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

export function PhotoCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}: PhotoCropModalProps) {
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [cropShape, setCropShape] = useState<'circle' | 'square'>('circle');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reset parameters whenever a new image is loaded
  useEffect(() => {
    if (imageSrc && isOpen) {
      setZoom(1.0);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
      img.src = imageSrc;
    }
  }, [imageSrc, isOpen]);

  // Update live preview thumbnail whenever crop transform changes
  const generatePreview = useCallback(() => {
    if (!imageRef.current || !imageLoaded) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const size = 120;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    // Clip to circle if circular shape
    if (cropShape === 'circle') {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Calculate aspect scale to cover the 240px container
    const baseScale = Math.max(240 / img.naturalWidth, 240 / img.naturalHeight);
    const scaledWidth = img.naturalWidth * baseScale * (size / 240);
    const scaledHeight = img.naturalHeight * baseScale * (size / 240);

    const mappedPanX = pan.x * (size / 240);
    const mappedPanY = pan.y * (size / 240);

    ctx.drawImage(
      img,
      -scaledWidth / 2 + mappedPanX / zoom,
      -scaledHeight / 2 + mappedPanY / zoom,
      scaledWidth,
      scaledHeight
    );
    ctx.restore();

    setPreviewUrl(canvas.toDataURL('image/jpeg', 0.85));
  }, [imageLoaded, zoom, rotation, pan, cropShape]);

  useEffect(() => {
    if (imageLoaded) {
      generatePreview();
    }
  }, [imageLoaded, zoom, rotation, pan, cropShape, generatePreview]);

  // Handle Drag / Pan events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile / tablet
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1 || !e.touches[0]) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Rotate 90 degrees clockwise
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Commit crop: export high-res 480x480 headshot
  const handleApplyCrop = () => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const OUTPUT_SIZE = 480;
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill white background for clean transparency handling
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Map the 240px container coordinates to the 480px output
    const baseScale = Math.max(240 / img.naturalWidth, 240 / img.naturalHeight);
    const scaledWidth = img.naturalWidth * baseScale * (OUTPUT_SIZE / 240);
    const scaledHeight = img.naturalHeight * baseScale * (OUTPUT_SIZE / 240);

    const mappedPanX = pan.x * (OUTPUT_SIZE / 240);
    const mappedPanY = pan.y * (OUTPUT_SIZE / 240);

    ctx.drawImage(
      img,
      -scaledWidth / 2 + mappedPanX / zoom,
      -scaledHeight / 2 + mappedPanY / zoom,
      scaledWidth,
      scaledHeight
    );
    ctx.restore();

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onCropComplete(croppedDataUrl);
    onClose();
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md w-full p-0 overflow-hidden border border-slate-200 bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl"
        data-testid="photo-crop-modal"
      >
        <DialogHeader className="p-4 sm:p-5 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Crop className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Crop &amp; Position Photo
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Drag to center your face in the frame. Adjust zoom and rotation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-6 space-y-4">
          {/* Main Interactive Crop Workspace */}
          <div className="flex flex-col items-center justify-center">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="relative size-60 rounded-xl overflow-hidden bg-slate-950 border border-slate-300 shadow-inner select-none cursor-grab active:cursor-grabbing flex items-center justify-center"
              style={{ touchAction: 'none' }}
              title="Click and drag to pan the photo"
            >
              {/* Image transform layer */}
              {imageLoaded && imageRef.current && (
                <div
                  className="absolute pointer-events-none transition-transform duration-75"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <img
                    src={imageSrc}
                    alt="Source"
                    className="max-w-none pointer-events-none"
                    style={{
                      width: `${imageRef.current.naturalWidth * Math.max(240 / imageRef.current.naturalWidth, 240 / imageRef.current.naturalHeight)}px`,
                      height: `${imageRef.current.naturalHeight * Math.max(240 / imageRef.current.naturalWidth, 240 / imageRef.current.naturalHeight)}px`,
                    }}
                  />
                </div>
              )}

              {/* Crop Mask Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {cropShape === 'circle' ? (
                  <svg className="size-full" viewBox="0 0 240 240">
                    <defs>
                      <mask id="circle-crop-mask">
                        <rect width="240" height="240" fill="white" />
                        <circle cx="120" cy="120" r="100" fill="black" />
                      </mask>
                    </defs>
                    {/* Semi-opaque darkened backdrop outside circular frame */}
                    <rect
                      width="240"
                      height="240"
                      fill="rgba(15, 23, 42, 0.65)"
                      mask="url(#circle-crop-mask)"
                    />
                    {/* Glowing circular guide ring */}
                    <circle
                      cx="120"
                      cy="120"
                      r="100"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                    {/* Subtle Rule-of-Thirds Guides */}
                    <line x1="86" y1="20" x2="86" y2="220" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    <line x1="154" y1="20" x2="154" y2="220" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    <line x1="20" y1="86" x2="220" y2="86" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    <line x1="20" y1="154" x2="220" y2="154" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  </svg>
                ) : (
                  <div className="size-full border-2 border-dashed border-sky-400 p-2.5 box-border bg-slate-900/30">
                    <div className="size-full border border-white/20 grid grid-cols-3 grid-rows-3 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Pan Drag Indicator Hint */}
              <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/80 bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur-xs">
                  <Move className="size-2.5" /> Drag to position
                </span>
              </div>
            </div>
          </div>

          {/* Controls: Zoom, Rotate, Crop Shape, Live Preview */}
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.1).toFixed(1))))}
                className="p-1 rounded-md text-slate-500 hover:bg-slate-200 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="size-4" />
              </button>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                aria-label="Zoom photo"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.1).toFixed(1))))}
                className="p-1 rounded-md text-slate-500 hover:bg-slate-200 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="size-4" />
              </button>
              <span className="text-xs font-mono font-medium text-slate-600 w-9 text-right">
                {zoom.toFixed(1)}x
              </span>
            </div>

            {/* Quick action strip: Rotate, Shape Toggle, and Live Mini Avatar Preview */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {/* Rotate 90 Deg */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRotate}
                  className="h-8 gap-1.5 text-xs text-slate-700 font-medium"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="size-3.5" />
                  <span>{rotation}°</span>
                </Button>

                {/* Shape Toggle: Circle / Square */}
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setCropShape('circle')}
                    className={`p-1.5 rounded-md transition-colors ${cropShape === 'circle' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`}
                    title="Circular avatar crop"
                  >
                    <Circle className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropShape('square')}
                    className={`p-1.5 rounded-md transition-colors ${cropShape === 'square' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900'}`}
                    title="Square avatar crop"
                  >
                    <Square className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Live Preview Avatar */}
              {previewUrl && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-500">Preview:</span>
                  <div className={`size-8 overflow-hidden border border-indigo-300 shadow-xs ${cropShape === 'circle' ? 'rounded-full' : 'rounded-md'}`}>
                    <img src={previewUrl} alt="Preview" className="size-full object-cover" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApplyCrop}
            className="gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <Check className="size-3.5" />
            <span>Apply Crop</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
