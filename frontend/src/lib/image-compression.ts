/**
 * Client-side image compression for photo uploads.
 *
 * Resizes and re-encodes uploaded images to a target maximum width/height and
 * quality before they are packaged into a payload or sent to the backend.
 * This keeps resume photo payloads small without losing usable quality.
 *
 * Nothing here simulates state: every operation reads the real File, draws it
 * to a real canvas, and returns a real compressed data URL or Blob.
 */

const DEFAULT_MAX_DIMENSION = 800; // px
const DEFAULT_QUALITY = 0.85; // 0..1, JPEG/WebP quality
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressionResult {
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/**
 * Load a File into an HTMLImageElement, waiting for decode.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image file.'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compute target dimensions that fit inside maxWidth/maxHeight while
 * preserving aspect ratio and never upscaling beyond the source size.
 */
function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  // Never upscale: if the source already fits, keep its natural size.
  const effectiveScale = Math.min(1, scale);
  return {
    width: Math.round(sourceWidth * effectiveScale),
    height: Math.round(sourceHeight * effectiveScale),
  };
}

/**
 * Compress an image File to a data URL and Blob.
 *
 * Returns the original and compressed byte sizes plus the compression ratio
 * (compressed / original, so < 1 means smaller).
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = DEFAULT_MAX_DIMENSION,
    maxHeight = DEFAULT_MAX_DIMENSION,
    quality = DEFAULT_QUALITY,
    mimeType = 'image/jpeg',
  } = options;

  const originalSize = file.size;

  const img = await loadImage(file);
  const { width, height } = fitDimensions(
    img.naturalWidth,
    img.naturalHeight,
    maxWidth,
    maxHeight
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas 2D context for compression.');
  }

  // Smooth downsampling for better quality at smaller sizes.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const mime = `image/${mimeType}`;
  const dataUrl = canvas.toDataURL(mime, quality);

  // Convert data URL back to a Blob so callers can upload it directly.
  const byteString = atob(dataUrl.split(',')[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8 = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([uint8], { type: mime });
  const compressedSize = blob.size;
  const ratio = originalSize > 0 ? compressedSize / originalSize : 1;

  return {
    dataUrl,
    blob,
    originalSize,
    compressedSize,
    ratio,
  };
}

/**
 * Validate that a File is an image within the allowed size limit.
 * Returns null when valid, or an error message string when invalid.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please upload an image file (PNG, JPG, WebP).';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Photo must be under ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.`;
  }
  return null;
}

/**
 * Convenience: compress with safe defaults for resume headshots.
 * Caps at 800px on the longest side and ~85% JPEG quality.
 */
export function compressHeadshot(file: File): Promise<CompressionResult> {
  return compressImage(file, {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.85,
    mimeType: 'image/jpeg',
  });
}
