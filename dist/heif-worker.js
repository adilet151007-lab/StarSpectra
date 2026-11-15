/* global libheif */
const decoderPath = './vendor/libheif-1.23.5';
const maxPixels = 50_000_000;
const maxPreviewSide = 1800;

function readPlane(plane, originalWidth, originalHeight, maxSide = maxPreviewSide) {
  const ratio = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
  const width = Math.round(originalWidth * ratio);
  const height = Math.round(originalHeight * ratio);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const { data, stride } = plane;

  if (ratio === 1) {
    for (let y = 0; y < height; y++) {
      rgba.set(data.subarray(y * stride, y * stride + width * 4), y * width * 4);
    }
    return { width, height, pixels: rgba.buffer };
  }

  // Average the source pixels so a faint star can survive the downsampling.
  for (let y = 0; y < height; y++) {
    const top = Math.floor(y * originalHeight / height);
    const bottom = Math.floor((y + 1) * originalHeight / height);
    for (let x = 0; x < width; x++) {
      const left = Math.floor(x * originalWidth / width);
      const right = Math.floor((x + 1) * originalWidth / width);
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let row = top; row < bottom; row++) {
        for (let col = left; col < right; col++) {
          const offset = row * stride + col * 4;
          red += data[offset];
          green += data[offset + 1];
          blue += data[offset + 2];
          alpha += data[offset + 3];
        }
      }
      const count = (right - left) * (bottom - top);
      const position = (y * width + x) * 4;
      rgba[position] = red / count;
      rgba[position + 1] = green / count;
      rgba[position + 2] = blue / count;
      rgba[position + 3] = alpha / count;
    }
  }
  return { width, height, pixels: rgba.buffer };
}

self.onmessage = async ({ data }) => {
  const file = data.file || data;
  const fullResolution = Boolean(data.fullResolution);
  let heif;
  try {
    importScripts(decoderPath + '.js');
    heif = await libheif({ locateFile: () => decoderPath + '.wasm' });
  } catch {
    self.postMessage({ error: 'heif-unavailable' });
    return;
  }

  const decoder = new heif.HeifDecoder();
  let frames = [];
  let decoded;
  try {
    frames = decoder.decode(new Uint8Array(await file.arrayBuffer()));
    const primary = frames.find(frame => frame.is_primary()) || frames[0];
    if (!primary) throw new Error('Missing HEIF image');
    const width = primary.get_width();
    const height = primary.get_height();
    if (width * height > maxPixels) {
      self.postMessage({ error: 'resolution' });
      return;
    }
    if (Math.min(width, height) < 96) {
      self.postMessage({ error: 'too-small' });
      return;
    }
    if (!fullResolution && Math.min(width, height) * 1080 / Math.max(width, height) < 64) {
      self.postMessage({ error: 'panorama' });
      return;
    }
    decoded = await heif.heif_js_decode_image2(primary.handle, heif.heif_colorspace_RGB, heif.heif_chroma_interleaved_RGBA);
    if (!decoded?.channels) throw new Error('HEIF decode failed');
    const plane = decoded.channels.find(channel => channel.id === heif.heif_channel_interleaved);
    if (!plane) throw new Error('Missing color plane');
    const frame = readPlane(plane, decoded.width, decoded.height);
    if (fullResolution) {
      const original = readPlane(plane, decoded.width, decoded.height, Infinity);
      self.postMessage({ ...original, preview: frame }, [original.pixels, frame.pixels]);
    } else {
      self.postMessage({ ...frame, aspect: decoded.width / decoded.height }, [frame.pixels]);
    }
  } catch {
    self.postMessage({ error: 'heif-invalid' });
  } finally {
    if (decoded?.image) heif.heif_image_release(decoded.image);
    for (const frame of frames) frame.free();
    if (decoder.decoder) heif.heif_context_free(decoder.decoder);
  }
};
