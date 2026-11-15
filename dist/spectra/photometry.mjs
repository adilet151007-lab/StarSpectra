const HC_OVER_K = 0.01438776877;
const BLUE = 450e-9;
const RED = 650e-9;
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const value = i / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
});
export const MODEL_MIN = 2500;
export const MODEL_MAX = 20000;
export const MODEL_POINTS = [3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000];

export function planckRatio(temperature) {
  return (RED / BLUE) ** 5 * Math.expm1(HC_OVER_K / (RED * temperature)) /
    Math.expm1(HC_OVER_K / (BLUE * temperature));
}

export function modelTemperature(ratio) {
  if (!Number.isFinite(ratio) || ratio < planckRatio(MODEL_MIN) || ratio > planckRatio(MODEL_MAX)) return null;
  let low = MODEL_MIN;
  let high = MODEL_MAX;
  for (let i = 0; i < 70; i++) {
    const middle = (low + high) / 2;
    if (planckRatio(middle) > ratio) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

export function modelSample(temperature) {
  const q = planckRatio(temperature);
  return { temperature, q, below: modelTemperature(.95 * q), above: modelTemperature(1.05 * q) };
}

function median(histogram, count) {
  const halfway = Math.floor(count / 2);
  let seen = 0;
  let lower = null;
  for (let i = 0; i < 256; i++) {
    seen += histogram[i];
    if (lower === null && seen > Math.floor((count - 1) / 2)) lower = LINEAR[i];
    if (seen > halfway) return (lower + LINEAR[i]) / 2;
  }
  return 0;
}

function aperture(data, stride, center, radius, background) {
  const flux = [0, 0, 0];
  let saturated = false;
  let count = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y > radius * radius) continue;
      const i = ((y + center) * stride + x + center) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = data[i + channel];
        if (value >= 250) saturated = true;
        flux[channel] += LINEAR[value] - background[channel];
      }
      count++;
    }
  }
  const valid = flux.every(f => f > 0);
  return { flux, count, saturated, q: valid ? flux[2] / flux[0] : null,
    redShare: valid ? flux[0] / (flux[0] + flux[1] + flux[2]) : null };
}

// The patch is a square of original pixels centered on the selected star.
export function measure(data, { radius, inner, outer }) {
  const side = 2 * outer + 1;
  const histogram = [0, 1, 2].map(() => new Uint32Array(256));
  const sectors = Array.from({ length: 8 }, () => ({ count: 0, flux: [0, 0, 0] }));
  const inner2 = inner * inner;
  const outer2 = outer * outer;
  let count = 0;
  for (let y = -outer; y <= outer; y++) {
    for (let x = -outer; x <= outer; x++) {
      const distance = x * x + y * y;
      if (distance < inner2 || distance > outer2) continue;
      const offset = ((y + outer) * side + x + outer) * 4;
      const sector = sectors[Math.floor(4 * (Math.atan2(y, x) + Math.PI) / Math.PI) % 8];
      for (let c = 0; c < 3; c++) {
        const value = data[offset + c];
        histogram[c][value]++;
        sector.flux[c] += LINEAR[value];
      }
      sector.count++;
      count++;
    }
  }
  const background = histogram.map(channel => median(channel, count));
  const primary = aperture(data, side, outer, radius, background);
  const step = Math.max(1, Math.round(radius * .15));
  const smaller = aperture(data, side, outer, Math.max(1, radius - step), background);
  const larger = aperture(data, side, outer, Math.min(inner - 1, radius + step), background);
  const radiusShift = [primary.q, smaller.q, larger.q].every(q => q !== null)
    ? Math.max(Math.abs(smaller.q / primary.q - 1), Math.abs(larger.q / primary.q - 1))
    : null;
  const uneven = primary.flux.some((f, c) => {
    const averages = sectors.filter(sector => sector.count).map(sector => sector.flux[c] / sector.count);
    return (Math.max(...averages) - Math.min(...averages)) * primary.count > Math.max(.06, .14 * Math.abs(f));
  });
  const warnings = [];
  if (primary.saturated) warnings.push('saturated');
  if (primary.q === null) warnings.push('weak');
  if (uneven) warnings.push('background');
  if (primary.q !== null && (radiusShift === null || radiusShift > .05)) warnings.push('unstable');
  return { ...primary, background, backgroundCount: count, radiusShift, warnings };
}

export function linearToSrgb(value) {
  return value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;
}

const rank = Object.freeze([
  { type: 'O', minimum: 30000, range: '≥ 30 000', color: '#8dafff' },
  { type: 'B', minimum: 10000, range: '10 000–30 000', color: '#b4cbff' },
  { type: 'A', minimum: 7500, range: '7 500–10 000', color: '#e3eaff' },
  { type: 'F', minimum: 6000, range: '6 000–7 500', color: '#fff1d7' },
  { type: 'G', minimum: 5200, range: '5 200–6 000', color: '#ffd793' },
  { type: 'K', minimum: 3700, range: '3 700–5 200', color: '#ffad7f' },
  { type: 'M', minimum: 2400, range: '2 400–3 700', color: '#ff8f88' },
]);
export const SPECTRAL_CLASSES = rank;

export function spectralClass(temperature) {
  return Number.isFinite(temperature) && rank.find(group => temperature >= group.minimum)?.type || '';
}

function required(object, field) {
  if (typeof object?.[field] !== 'string' || !object[field].trim()) throw new Error('profile-fields');
  return object[field].trim();
}

export function interpolate(points, ratio) {
  if (!Number.isFinite(ratio) || ratio < points[0].q || ratio > points.at(-1).q) return null;
  const upper = points.findIndex(point => point.q >= ratio);
  if (upper === 0) return points[0].temperature;
  const low = points[upper - 1];
  const high = points[upper];
  return low.temperature + (high.temperature - low.temperature) * (ratio - low.q) / (high.q - low.q);
}

export function validateProfile(data) {
  if (data?.schema !== 1) throw new Error('profile-schema');
  const profile = Object.fromEntries(['id', 'camera', 'lens', 'format', 'settings'].map(field => [field, required(data, field)]));
  const seen = new Set();
  function readRows(rows, minimum) {
    if (!Array.isArray(rows) || rows.length < minimum) throw new Error('profile-minimum');
    return rows.map(row => {
      const star = required(row, 'star');
      const key = star.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) throw new Error('profile-duplicate');
      seen.add(key);
      const source = required(row, 'source');
      const { qcam: q, temperature_K: temperature } = row;
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(temperature) || temperature <= 0) throw new Error('profile-values');
      return { star, source, q, temperature };
    });
  }
  const fit = readRows(data.calibration, 6).sort((a, b) => a.q - b.q);
  if (fit.some((point, i) => i > 0 && (point.q <= fit[i - 1].q || point.temperature <= fit[i - 1].temperature))) {
    throw new Error('profile-monotone');
  }

  const validation = readRows(data.validation, 3).map(point => {
    const estimate = interpolate(fit, point.q);
    if (estimate === null) throw new Error('profile-range');
    return { ...point, estimate, error: estimate - point.temperature };
  });
  const mae = validation.reduce((sum, point) => sum + Math.abs(point.error), 0) / validation.length;
  const bias = validation.reduce((sum, point) => sum + point.error, 0) / validation.length;
  return { ...profile, fit, validation, mae, bias };
}

export function captureSettings(meta) {
  return [meta.iso, meta.exposure, meta.wb].join(' / ');
}

export function cameraMatches(profile, meta) {
  const normalized = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const same = (a, b) => Boolean(a && b && normalized(a) === normalized(b));
  return Boolean(profile && meta.iso && meta.exposure && meta.wb && same(profile.camera, meta.camera) &&
    same(profile.format, meta.format) && same(profile.lens, meta.lens) && same(profile.settings, captureSettings(meta)));
}

export function csv(rows, columns) {
  const safe = value => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const text = String(value);
    const escaped = /^\s*[=+@\-\t\r]/.test(text) ? "'" + text : text;
    return '"' + escaped.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [columns.join(','), ...rows.map(row => columns.map(column => safe(row[column])).join(','))].join('\r\n') + '\r\n';
}
