/**
 * Client-side image compression utility for profile photos and resume headshots.
 *
 * Compresses uploaded profile photos and headshots to fit within request limits
 * while preserving high visual quality, resolving DISC-028 / DISC-048.
 *
 * Real browser canvas downsampling with configurable dimensions and quality.
 */

const DEFAULT_MAX_DIMENSION = 800; // px
const DEFAULT_QUALITY = 0.85; // 0..1, JPEG/WebP quality
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'jpeg' | 'png' | 'webp';
}

export interface CompressionResult {
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

/**
 * Validate that a File is an image within the allowed size limit.
 * Returns null when valid, or an error message string when invalid.
 */
export function validateImageFile(file: File, maxBytes = MAX_FILE_SIZE): string | null {
  if (!file?.type?.startsWith('image/')) {
    return 'Please upload an image file (PNG, JPG, WebP).';
  }
  if (file.size > maxBytes) {
    return `Photo must be under ${Math.round(maxBytes / 1024 / 1024)}MB.`;
  }
  return null;
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
  const effectiveScale = Math.min(1, scale);
  return {
    width: Math.round(sourceWidth * effectiveScale),
    height: Math.round(sourceHeight * effectiveScale),
  };
}

/**
 * Normalize MIME type to a valid canvas-supported image/* type string.
 */
function normalizeMimeType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return mimeType;
  return `image/${mimeType === 'jpg' ? 'jpeg' : mimeType}`;
}

/**
 * Compress an image File to a data URL and Blob.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

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
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create canvas 2D context for compression.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const mime = normalizeMimeType(mimeType);
  const dataUrl = canvas.toDataURL(mime, quality);

  // Convert data URL back to a Blob
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

/**
 * Legacy/Primary profile photo compressor targeting < 80 KB for fast sync.
 */
export async function compressProfilePhoto(
  file: File,
  maxDimension = 400,
  targetQuality = 0.82
): Promise<string> {
  const result = await compressImage(file, {
    maxWidth: maxDimension,
    maxHeight: maxDimension,
    quality: targetQuality,
    mimeType: 'image/jpeg',
  });

  // Secondary compression pass if data URL exceeds 80 KB
  if (result.dataUrl.length > 80 * 1024) {
    const secondPass = await compressImage(file, {
      maxWidth: Math.round(maxDimension * 0.8),
      maxHeight: Math.round(maxDimension * 0.8),
      quality: 0.65,
      mimeType: 'image/jpeg',
    });
    return secondPass.dataUrl;
  }

  return result.dataUrl;
}
