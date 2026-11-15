const maxPhotoPixels = 50_000_000;
const maxFileBytes = 50 * 1024 * 1024;
const heifBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

export class PhotoImportError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function cameraFormat(bytes, name, type) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image';
  const string = (start, stop) => String.fromCharCode(...bytes.subarray(start, stop));
  if (bytes.length >= 16 && string(4, 8) === 'ftyp') {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const brands = [string(8, 12)];
    for (let offset = 16; offset + 4 <= Math.min(size, bytes.length); offset += 4) {
      brands.push(string(offset, offset + 4));
    }
    if (brands.includes('avif') || brands.includes('avis')) return 'image';
    if (brands.some(brand => heifBrands.has(brand))) return 'heif';
    if (brands.includes('qt  ') || brands.includes('isom') || brands.includes('mp42')) return 'video';
  }
  if (/\.dng$/i.test(name) || /(?:\/|-)dng$/i.test(type)) return 'raw';
  if (/\.(?:heic|heif|hif|heics|heifs)$/i.test(name) || /^image\/hei[cf]/i.test(type)) return 'heif';
  if (/^video\//.test(type)) return 'video';
  return 'image';
}

function loadImage(url, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const picture = new Image();
    const finish = (error) => {
      signal.removeEventListener('abort', cancel);
      picture.onload = picture.onerror = null;
      if (error) reject(error);
      else resolve(picture);
    };
    const cancel = () => {
      finish(signal.reason);
      picture.removeAttribute('src');
    };
    picture.onload = () => finish();
    picture.onerror = () => finish(new PhotoImportError('unreadable'));
    signal.addEventListener('abort', cancel, { once: true });
    picture.src = url;
  });
}

function frameSize(width, height) {
  if (Math.min(width, height) < 96) throw new PhotoImportError('too-small');
  if (width * height > maxPhotoPixels) throw new PhotoImportError('resolution');
  const scale = Math.min(1, 1080 / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  if (Math.min(w, h) < 64) throw new PhotoImportError('panorama');
  return [w, h];
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasFromImage(source, width, height, readback = false) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: readback });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return { canvas, ctx };
}

function prepareFrame(source, originalWidth, originalHeight) {
  const [width, height] = frameSize(originalWidth, originalHeight);
  const { canvas, ctx } = canvasFromImage(source, width, height, true);
  try {
    return {
      width,
      height,
      aspect: originalWidth / originalHeight,
      pixels: ctx.getImageData(0, 0, width, height).data.buffer,
    };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

async function previewPicture(source, width, height) {
  const scale = Math.min(1, 1800 / Math.max(width, height));
  const { canvas } = canvasFromImage(source, Math.round(width * scale), Math.round(height * scale));
  try {
    return await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new PhotoImportError('unreadable')), 'image/jpeg', 0.94);
    });
  } finally {
    canvas.width = canvas.height = 1;
  }
}

function readHeif(file, signal, fullResolution = false) {
  signal.throwIfAborted();
  let worker;
  try {
    worker = new Worker(new URL('./heif-worker.js', import.meta.url));
  } catch {
    throw new PhotoImportError('heif-unavailable');
  }
  return new Promise((resolve, reject) => {
    const finish = (error, frame) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(frame);
    };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new PhotoImportError('heif-timeout')), 35_000);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.error) finish(new PhotoImportError(data.error));
      else finish(null, data);
    };
    worker.onerror = () => finish(new PhotoImportError('heif-unavailable'));
    worker.postMessage(fullResolution ? { file, fullResolution } : file);
  });
}

export async function importPhoto(input, signal, onHeifFallback) {
  if (typeof input === 'string') {
    const picture = await loadImage(input, signal);
    return prepareFrame(picture, picture.naturalWidth, picture.naturalHeight);
  }

  if (!input.size) throw new PhotoImportError('empty');
  const header = new Uint8Array(await input.slice(0, 128).arrayBuffer());
  signal.throwIfAborted();
  const format = cameraFormat(header, input.name, input.type);
  if (format === 'raw' || format === 'video') throw new PhotoImportError(format);
  if (input.size > maxFileBytes) throw new PhotoImportError('file-size');

  const blob = format === 'heif' ? new Blob([input], { type: 'image/heic' }) : input;
  const url = URL.createObjectURL(blob);
  try {
    const picture = await loadImage(url, signal);
    const { naturalWidth, naturalHeight } = picture;
    const frame = prepareFrame(picture, naturalWidth, naturalHeight);
    const preview = await previewPicture(picture, naturalWidth, naturalHeight);
    return { ...frame, preview };
  } catch (error) {
    signal.throwIfAborted();
    if (format !== 'heif' || (error instanceof PhotoImportError && error.code !== 'unreadable')) throw error;
  } finally {
    URL.revokeObjectURL(url);
  }

  onHeifFallback();
  const decoded = await readHeif(input, signal);
  const canvas = makeCanvas(decoded.width, decoded.height);
  const ctx = canvas.getContext('2d');
  const pixels = new Uint8ClampedArray(decoded.pixels);
  ctx.putImageData(new ImageData(pixels, decoded.width, decoded.height), 0, 0);
  try {
    const frame = prepareFrame(canvas, decoded.width, decoded.height);
    const preview = await previewPicture(canvas, decoded.width, decoded.height);
    return { ...frame, aspect: decoded.aspect, preview };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

// The displayed preview and the photometry region have independent resolutions.
export async function importMeasurementPhoto(file, signal, onHeifFallback) {
  if (!file.size) throw new PhotoImportError('empty');
  if (file.size > maxFileBytes) throw new PhotoImportError('file-size');
  const header = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  signal.throwIfAborted();
  const format = cameraFormat(header.subarray(0, 128), file.name, file.type);
  if (format === 'raw' || format === 'video') throw new PhotoImportError(format);
  const blob = format === 'heif' ? new Blob([file], { type: 'image/heic' }) : file;
  const url = URL.createObjectURL(blob);
  const patchCanvas = makeCanvas(1, 1);
  const patchContext = patchCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  try {
    const picture = await loadImage(url, signal);
    const width = picture.naturalWidth, height = picture.naturalHeight;
    if (width * height > maxPhotoPixels) throw new PhotoImportError('resolution');
    return {
      width, height, header, format, picture, fallback: false,
      patch(x, y, radius) {
        const size = 2 * radius + 1;
        patchCanvas.width = patchCanvas.height = size;
        patchContext.drawImage(picture, x - radius, y - radius, size, size, 0, 0, size, size);
        return patchContext.getImageData(0, 0, size, size).data;
      },
    };
  } catch (error) {
    signal.throwIfAborted();
    if (format !== 'heif' || !(error instanceof PhotoImportError) || error.code !== 'unreadable') throw error;
  } finally {
    URL.revokeObjectURL(url);
  }

  onHeifFallback();
  const { width, height, pixels, preview } = await readHeif(file, signal, true);
  signal.throwIfAborted();
  const original = new Uint8ClampedArray(pixels);
  const picture = makeCanvas(preview.width, preview.height);
  picture.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(preview.pixels),
    preview.width, preview.height), 0, 0);
  return {
    width, height, header, format, picture, fallback: true,
    patch(x, y, radius) {
      const size = 2 * radius + 1;
      const patch = new Uint8ClampedArray(size * size * 4);
      for (let row = 0; row < size; row++) {
        const begin = ((y - radius + row) * width + x - radius) * 4;
        patch.set(original.subarray(begin, begin + size * 4), row * size * 4);
      }
      return patch;
    },
  };
}
