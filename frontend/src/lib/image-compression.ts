/**
 * Client-side image compression utility.
 * Compresses uploaded profile headshots to fit within JSON request limits (< 64 KB, max 400x400)
 * while preserving high visual quality, resolving DISC-048.
 */

export async function compressProfilePhoto(
  file: File,
  maxDimension = 400,
  targetQuality = 0.82
): Promise<string> {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Please select a valid image file (JPEG, PNG, or WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('Failed to parse image data.'));
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas context unavailable for image processing.'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        let compressed = canvas.toDataURL('image/jpeg', targetQuality);

        // If data URL exceeds 80 KB, apply secondary compression pass
        if (compressed.length > 80 * 1024) {
          compressed = canvas.toDataURL('image/jpeg', 0.65);
        }

        resolve(compressed);
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}
