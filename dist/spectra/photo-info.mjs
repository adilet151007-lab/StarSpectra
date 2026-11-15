function exifTags(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 8) return {};
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return {};
  const little = order === 0x4949;
  const u16 = offset => view.getUint16(offset, little);
  const u32 = offset => view.getUint32(offset, little);
  if (u16(2) !== 42) return {};
  const tags = {};
  const names = {
    0x010f: 'make', 0x0110: 'model', 0x0132: 'modified', 0x829a: 'exposure', 0x8827: 'iso',
    0x8833: 'isoStandard', 0x9003: 'date', 0x9011: 'timezone', 0x920a: 'focal', 0xa001: 'color',
    0xa403: 'wb', 0xa434: 'lens',
  };
  const widths = { 2: 1, 3: 2, 4: 4, 5: 8 };
  function directory(offset) {
    if (offset < 8 || offset + 2 > view.byteLength) return;
    const count = Math.min(u16(offset), 1024);
    for (let i = 0; i < count; i++) {
      const pos = offset + 2 + 12 * i;
      if (pos + 12 > view.byteLength) break;
      const tag = u16(pos), type = u16(pos + 2), quantity = u32(pos + 4);
      if (tag === 0x8769) { tags.exif = u32(pos + 8); continue; }
      if (!names[tag] || !widths[type] || !quantity) continue;
      const size = widths[type] * quantity;
      const coord = size <= 4 ? pos + 8 : u32(pos + 8);
      if (coord + size > view.byteLength) continue;
      if (type === 2) tags[names[tag]] = new TextDecoder().decode(bytes.subarray(coord, coord + Math.min(size, 512)))
        .split('\0', 1)[0].trim();
      if (type === 3) tags[names[tag]] = String(u16(coord));
      if (type === 4) tags[names[tag]] = String(u32(coord));
      if (type === 5 && u32(coord + 4)) tags[names[tag]] = tag === 0x829a ?
        String(Number((u32(coord) / u32(coord + 4)).toPrecision(9))) : u32(coord) + '/' + u32(coord + 4);
    }
  }
  directory(u32(4));
  if (tags.exif) directory(tags.exif);
  return tags;
}

export function photoInfo(photo, file) {
  const bytes = photo.header;
  const text = (start, stop) => String.fromCharCode(...bytes.subarray(start, stop));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let tags = {};
  let profile = 'assumed';
  let format = 'IMAGE';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = 'JPEG';
    for (let i = 2; i + 4 < bytes.length && bytes[i] === 0xff;) {
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { i++; continue; }
      const size = view.getUint16(i + 2);
      const end = i + size + 2;
      if (size < 2 || end > bytes.length) break;
      if (marker === 0xe1 && text(i + 4, i + 10) === 'Exif\0\0') tags = exifTags(bytes.subarray(i + 10, end));
      if (marker === 0xe2 && text(i + 4, i + 16) === 'ICC_PROFILE\0') profile = 'embedded';
      i = end;
    }
  } else if (bytes[0] === 0x89 && text(1, 4) === 'PNG') {
    format = 'PNG';
    for (let i = 8; i + 12 <= bytes.length;) {
      const size = view.getUint32(i);
      const type = text(i + 4, i + 8);
      if (i + size + 12 > bytes.length) break;
      if (type === 'sRGB') profile = 'srgb';
      if (type === 'iCCP') profile = 'embedded';
      if (type === 'eXIf') tags = exifTags(bytes.subarray(i + 8, i + 8 + size));
      i += size + 12;
    }
  } else if (photo.format === 'heif') {
    format = 'HEIC';
    if (photo.fallback) profile = 'heif-assumed';
  } else if (text(8, 12) === 'WEBP') {
    format = 'WebP';
  } else if (text(4, 8) === 'ftyp' && file.type === 'image/avif') {
    format = 'AVIF';
  } else if (file.type.startsWith('image/')) {
    format = file.type.slice(6).toUpperCase();
  }
  if (profile === 'assumed' && tags.color === '1') profile = 'srgb';
  const model = tags.model || '';
  const make = tags.make || '';
  const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ');
  return {
    format, profile, camera, lens: tags.lens || tags.focal || '', exposure: tags.exposure || '',
    iso: tags.isoStandard || tags.iso || '', wb: tags.wb || '', time: tags.date || tags.modified || '',
    timezone: tags.timezone || '',
  };
}
