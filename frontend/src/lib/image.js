// Browser-side image helpers: crop to a square, then compress so photos look fine but stay small and load fast.
const load = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not read image')); img.src = src; });
const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** Cuts the chosen square (pixels in the original image, optionally rotated) out of the file. High quality; compression happens on save. */
export async function cropToBlob(file, area, rotation = 0, max = 1024) {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    // draw the (rotated) image on a canvas big enough to hold it, then copy out the crop rectangle
    const rad = (rotation * Math.PI) / 180;
    const w = Math.abs(Math.cos(rad) * img.width) + Math.abs(Math.sin(rad) * img.height);
    const h = Math.abs(Math.sin(rad) * img.width) + Math.abs(Math.cos(rad) * img.height);
    const full = document.createElement('canvas');
    full.width = Math.round(w); full.height = Math.round(h);
    const fctx = full.getContext('2d');
    fctx.translate(full.width / 2, full.height / 2);
    fctx.rotate(rad);
    fctx.drawImage(img, -img.width / 2, -img.height / 2);
    const side = Math.max(1, Math.min(max, Math.round(Math.min(area.width, area.height))));
    const out = document.createElement('canvas');
    out.width = side; out.height = side;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, side, side);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, area.x, area.y, area.width, area.height, 0, 0, side, side);
    const blob = await toBlob(out, 'image/jpeg', 0.95);
    if (!blob) throw new Error('Could not process image');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

/**
 * Shrinks a photo to at most `max` px and lowers the quality step by step until it is under `targetKB`
 * (WebP where the browser supports it, JPEG otherwise). Never goes below quality 0.5, so it never looks "very low quality".
 */
export async function compressImage(blob, { max = 512, targetKB = 60 } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await load(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let best = null;
    for (const type of ['image/webp', 'image/jpeg']) {
      for (let q = 0.85; q >= 0.5; q -= 0.07) {
        const out = await toBlob(canvas, type, q);
        if (!out || out.type !== type) break; // browser does not support this encoder
        if (!best || out.size < best.size) best = out;
        if (out.size <= targetKB * 1024) return out;
      }
      if (best && best.size <= targetKB * 1024) break;
    }
    return best && best.size < blob.size ? best : blob;
  } finally { URL.revokeObjectURL(url); }
}
