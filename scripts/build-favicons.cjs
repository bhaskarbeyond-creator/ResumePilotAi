const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_IMAGE = path.join(ROOT, 'src', 'assets', 'favicons', 'favicon.png');

// Multi-size ICO buffer builder
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // number of images

  let offset = 6 + count * 16;
  const entries = [];

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)]);
}

async function buildAllFavicons() {
  console.log('🚀 Loading master user favicon from:', SOURCE_IMAGE);
  const { data, info } = await sharp(SOURCE_IMAGE)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log(`Source resolution: ${width}x${height}, channels: ${channels}`);

  // 1. Exterior flood-fill to make the outer 4 white corners transparent
  // without touching the interior white person head, body, or dots.
  const visited = new Uint8Array(width * height);
  const queue = [];

  function isExtWhite(x, y) {
    const idx = (y * width + x) * channels;
    return data[idx] > 242 && data[idx + 1] > 242 && data[idx + 2] > 242;
  }

  for (let x = 0; x < width; x++) {
    if (isExtWhite(x, 0)) { visited[x] = 1; queue.push(x, 0); }
    if (isExtWhite(x, height - 1)) { visited[(height - 1) * width + x] = 1; queue.push(x, height - 1); }
  }
  for (let y = 0; y < height; y++) {
    if (isExtWhite(0, y) && !visited[y * width]) { visited[y * width] = 1; queue.push(0, y); }
    if (isExtWhite(width - 1, y) && !visited[y * width + (width - 1)]) { visited[y * width + (width - 1)] = 1; queue.push(width - 1, y); }
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    const nbs = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const [nx, ny] of nbs) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const pos = ny * width + nx;
        if (!visited[pos] && isExtWhite(nx, ny)) {
          visited[pos] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  console.log(`Exterior transparent pixels identified: ${queue.length / 2}`);

  // Build 4-channel RGBA buffer
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      const srcIdx = pos * channels;
      const dstIdx = pos * 4;

      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];

      if (visited[pos]) {
        rgba[dstIdx] = 0;
        rgba[dstIdx + 1] = 0;
        rgba[dstIdx + 2] = 0;
        rgba[dstIdx + 3] = 0; // pure transparent
      } else {
        rgba[dstIdx] = r;
        rgba[dstIdx + 1] = g;
        rgba[dstIdx + 2] = b;
        rgba[dstIdx + 3] = 255;
      }
    }
  }

  // Create trimmed master with slight 2% margin
  const transparentMasterBuffer = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();

  const trimmed = await sharp(transparentMasterBuffer)
    .trim()
    .toBuffer();

  const trimMeta = await sharp(trimmed).metadata();
  console.log(`Trimmed squircle bounds: ${trimMeta.width}x${trimMeta.height}`);

  const maxDim = Math.max(trimMeta.width, trimMeta.height);
  const targetSize = Math.round(maxDim * 1.04); // 2% padding per side for breathing room

  const masterSquare = await sharp(trimmed)
    .resize(targetSize, targetSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  console.log(`Master icon ready: ${targetSize}x${targetSize}`);

  // Define all destination targets and sizes
  const targets = [
    // Standard Favicons
    { size: 16, files: ['public/favicon-16x16.png', 'public/favicons/favicon-16x16.png', 'src/assets/favicons/favicon-16x16.png'] },
    { size: 32, files: ['public/favicon-32x32.png', 'public/favicons/favicon-32x32.png', 'src/assets/favicons/favicon-32x32.png'] },
    { size: 96, files: ['public/favicon-96x96.png', 'public/favicons/favicon-96x96.png', 'src/assets/favicons/favicon-96x96.png'] },

    // Apple Touch Icons
    { size: 57, files: ['public/apple-icon-57x57.png', 'public/favicons/apple-icon-57x57.png'] },
    { size: 60, files: ['public/apple-icon-60x60.png', 'public/favicons/apple-icon-60x60.png'] },
    { size: 72, files: ['public/apple-icon-72x72.png', 'public/favicons/apple-icon-72x72.png'] },
    { size: 76, files: ['public/apple-icon-76x76.png', 'public/favicons/apple-icon-76x76.png'] },
    { size: 114, files: ['public/apple-icon-114x114.png', 'public/favicons/apple-icon-114x114.png'] },
    { size: 120, files: ['public/apple-icon-120x120.png', 'public/favicons/apple-icon-120x120.png'] },
    { size: 144, files: ['public/apple-icon-144x144.png', 'public/favicons/apple-icon-144x144.png'] },
    { size: 152, files: ['public/apple-icon-152x152.png', 'public/favicons/apple-icon-152x152.png'] },
    { size: 180, files: [
      'public/apple-icon-180x180.png',
      'public/apple-icon.png',
      'public/apple-icon-precomposed.png',
      'public/favicons/apple-icon-180x180.png',
      'public/favicons/apple-icon.png',
      'public/favicons/apple-icon-precomposed.png',
      'src/assets/favicons/apple-icon-180x180.png'
    ]},

    // Android / PWA Icons
    { size: 36, files: ['public/android-icon-36x36.png', 'public/favicons/android-icon-36x36.png'] },
    { size: 48, files: ['public/android-icon-48x48.png', 'public/favicons/android-icon-48x48.png'] },
    { size: 72, files: ['public/android-icon-72x72.png', 'public/favicons/android-icon-72x72.png'] },
    { size: 96, files: ['public/android-icon-96x96.png', 'public/favicons/android-icon-96x96.png'] },
    { size: 144, files: ['public/android-icon-144x144.png', 'public/favicons/android-icon-144x144.png'] },
    { size: 192, files: ['public/android-icon-192x192.png', 'public/favicons/android-icon-192x192.png', 'src/assets/favicons/android-icon-192x192.png'] },
    { size: 512, files: ['public/android-icon-512x512.png', 'src/assets/favicons/android-icon-512x512.png'] },

    // Microsoft Tiles
    { size: 70, files: ['public/ms-icon-70x70.png', 'public/favicons/ms-icon-70x70.png'] },
    { size: 144, files: ['public/ms-icon-144x144.png', 'public/favicons/ms-icon-144x144.png'] },
    { size: 150, files: ['public/ms-icon-150x150.png', 'public/favicons/ms-icon-150x150.png'] },
    { size: 310, files: ['public/ms-icon-310x310.png', 'public/favicons/ms-icon-310x310.png'] }
  ];

  const icoFrames = [];

  for (const { size, files } of targets) {
    let pipeline = sharp(masterSquare).resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    });

    if (size <= 32) {
      pipeline = pipeline.sharpen(1.2);
    } else if (size <= 64) {
      pipeline = pipeline.sharpen(0.7);
    }

    const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();

    if ([16, 32, 48].includes(size)) {
      icoFrames.push({ size, buffer: buf });
    }

    for (const relPath of files) {
      const fullPath = path.join(ROOT, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, buf);
    }
    console.log(`  ✓ Generated size ${size}x${size} -> ${files.length} destination(s)`);
  }

  // Ensure 48px is in ICO if not yet rendered
  if (!icoFrames.some(f => f.size === 48)) {
    const buf48 = await sharp(masterSquare)
      .resize(48, 48, { fit: 'contain', kernel: 'lanczos3' })
      .sharpen(0.8)
      .png({ compressionLevel: 9 })
      .toBuffer();
    icoFrames.push({ size: 48, buffer: buf48 });
  }

  // Build multi-res favicon.ico (16, 32, 48)
  const icoBuffer = createIco(icoFrames);
  const icoPaths = [
    'public/favicon.ico',
    'public/favicons/favicon.ico',
    'src/assets/favicons/favicon.ico'
  ];
  for (const relPath of icoPaths) {
    const fullPath = path.join(ROOT, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, icoBuffer);
    console.log(`  ✓ Written multi-resolution ICO (${icoBuffer.length} bytes): ${relPath}`);
  }

  console.log('\n✨ All favicons, touch icons, Android/PWA, and Microsoft tiles successfully generated from master favicon!');
}

buildAllFavicons().catch(err => {
  console.error('Failed building favicons:', err);
  process.exit(1);
});
