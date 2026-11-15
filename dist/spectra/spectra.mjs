import { checkPhotoAbort, importMeasurementPhoto } from '../photo-loader.mjs';
import { photoInfo } from './photo-info.mjs';
import { cameraMatches, captureSettings, csv, interpolate, linearToSrgb, measure,
  SPECTRAL_CLASSES, spectralClass, validateProfile } from './photometry.mjs';
import { setupModel } from './model-view.mjs';
import { t, numeric, translate } from './language.mjs';

const element = id => document.getElementById(id);
const canvas = element('photo-canvas');
const ctx = canvas.getContext('2d');
const photoArea = element('photo-area');
const rgbBars = [...element('rgb-bars').children];
const fieldIds = { object: 'star-name', camera: 'camera-model', lens: 'lens', iso: 'iso',
  exposure: 'exposure', wb: 'wb', time: 'photo-time', timezone: 'timezone' };
const coordinates = { blue: { x: 338, y: 239 }, warm: { x: 576, y: 328 } };
const fields = ['image_id', 'object_name', 'time_local', 'timezone', 'camera', 'lens', 'exposure', 'ISO', 'WB',
  'format', 'width', 'height', 'original_profile', 'working_profile', 'x', 'y', 'radius', 'annulus_inner', 'annulus_outer',
  'aperture_px', 'background_px', 'FR', 'FG', 'FB', 'qcam', 'red_share', 'background_R', 'background_G', 'background_B',
  'radius_change', 'mode', 'calibration_id', 'calibration_q_min', 'calibration_q_max',
  'validation_MAE_K', 'temperature_K', 'spectral_class_approx', 'status', 'reason', 'measured_at'];
const journal = [];
let request = null, photo = null, selected = null, zoom = 1, focus = null;
let measurement = null, reason = null, photoMessage = null, profile = null, profileError = null;
let result = null, exportMessage = null;
const refreshModel = setupModel();

function geometry() {
  return Object.fromEntries(['radius', 'inner', 'outer'].map(id => [id, Number(element(id).value)]));
}
function metadata() {
  return { ...photo?.metadata, ...Object.fromEntries(Object.entries(fieldIds).map(([name, id]) => [name, element(id).value.trim()])) };
}
function bounded(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
function viewport() {
  const width = photo.width / zoom;
  const height = photo.height / zoom;
  return {
    x: bounded((focus?.x ?? photo.width / 2) - width / 2, 0, photo.width - width),
    y: bounded((focus?.y ?? photo.height / 2) - height / 2, 0, photo.height - height),
    width, height,
  };
}

function drawPhoto() {
  if (!photo || !photoArea.clientWidth) return;
  const aspect = photo.width / photo.height;
  const width = Math.min(photoArea.clientWidth, Math.min(520, innerHeight * .62) * aspect);
  const height = width / aspect;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const view = viewport();
  const { picture } = photo;
  const sx = (picture.naturalWidth || picture.width) / photo.width;
  const sy = (picture.naturalHeight || picture.height) / photo.height;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(picture, view.x * sx, view.y * sy, view.width * sx, view.height * sy, 0, 0, w, h);
  if (!selected) return;
  const scale = w / view.width;
  const dx = (selected.x + .5 - view.x) * scale;
  const dy = (selected.y + .5 - view.y) * h / view.height;
  const { radius, inner, outer } = geometry();
  ctx.lineWidth = 1.15 * dpr;
  ctx.strokeStyle = '#b0e9ff';
  ctx.beginPath();
  ctx.arc(dx, dy, Math.max(2, radius * scale), 0, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = '#f4cd91';
  ctx.setLineDash([3 * dpr, 2 * dpr]);
  for (const r of [inner, outer]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r * scale, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(dx - 4 * dpr, dy);
  ctx.lineTo(dx + 4 * dpr, dy);
  ctx.moveTo(dx, dy - 4 * dpr);
  ctx.lineTo(dx, dy + 4 * dpr);
  ctx.stroke();
}

function renderPhotoHeader() {
  canvas.hidden = !photo;
  element('zoom-photo').hidden = !photo;
  element('zoom-photo').textContent = zoom + '×';
  element('sample-tools').hidden = !photo?.demo;
  element('file-meta').hidden = !photo;
  element('file-meta').textContent = photo ? (photo.demo ? t('exampleTag') : photo.name) +
    ' · ' + photo.width + ' × ' + photo.height + ' · ' + photo.metadata.format : '';
  element('photo-message').textContent = photoMessage ? t(photoMessage) : '';
  element('color-profile').textContent = photo ? t(photo.metadata.profile) : '';
}

function evaluate() {
  const meta = metadata();
  const compatible = !photo?.demo && cameraMatches(profile, meta);
  const confirmed = element('confirm-profile').checked;
  element('confirm-profile').disabled = !compatible;
  result = { temperature: null, type: '', status: 'insufficient', note: 'select', used: null };
  if (!selected) return;
  if (reason || measurement?.warnings.length) { result.note = 'qualityFirst'; return; }
  if (!measurement) return;
  result.status = 'sufficient';
  if (photo.demo) { result.note = 'demoOnly'; return; }
  if (!profile) { result.note = 'calibrationNeeded'; return; }
  if (!compatible) { result.note = 'matchingNeeded'; return; }
  if (!confirmed) { result.note = 'profileConfirmation'; return; }
  const temperature = interpolate(profile.fit, measurement.q);
  if (temperature === null) { result.note = 'outsideProfile'; return; }
  const low = profile.fit[0], high = profile.fit.at(-1);
  const distance = Math.min(measurement.q - low.q, high.q - measurement.q) / (high.q - low.q);
  result = { temperature, type: spectralClass(temperature), status: 'calibrated',
    note: distance < .05 ? 'boundary' : null, used: profile };
}

function renderReading() {
  evaluate();
  const hasPoint = Boolean(photo && selected);
  const quality = element('quality');
  quality.textContent = hasPoint ? t(result.status) : '';
  quality.dataset.tone = !hasPoint ? 'neutral' : result.status === 'insufficient' ? 'warn' : 'ok';
  const warnings = [reason, ...(measurement?.warnings || [])].filter(Boolean);
  const notice = element('reading-notice');
  notice.toggleAttribute('data-warn', warnings.length > 0);
  notice.textContent = warnings.length ? warnings.map(t).join(' ') : photo?.demo ? t('demo') : t(hasPoint ? 'image' : 'select');
  element('ratio').textContent = numeric(measurement?.q, 4);
  const flux = measurement?.flux || [];
  const high = Math.max(0, ...flux);
  rgbBars.forEach((bar, i) => {
    bar.querySelector('output').textContent = numeric(flux[i], 3);
    bar.querySelector('.rgb-track > div').style.width = high ? Math.max(0, flux[i]) / high * 100 + '%' : '0';
  });
  element('color-chip').style.backgroundColor = high ? 'rgb(' + flux.map(v =>
    Math.round(255 * linearToSrgb(Math.max(0, v) / high))).join(', ') + ')' : '';

  const summary = [];
  if (hasPoint) summary.push(t('centering') + ' ' + selected.x + ', ' + selected.y + ' px');
  if (measurement?.redShare != null) summary.push(t('redShare') + ' ' + numeric(measurement.redShare * 100, 1) + '%');
  if (measurement?.radiusShift != null) summary.push(t('radiusChange') + ' ' + numeric(measurement.radiusShift * 100, 2) + '%');
  element('color-summary').textContent = summary.join(' · ');

  element('temperature').textContent = result.temperature === null ? '—' : numeric(result.temperature) + ' K';
  element('temperature-note').textContent = [
    result.used && t('profileReady') + ' ' + result.used.id + ' · MAE ' + numeric(result.used.mae) + ' K',
    result.used && t('fitRange') + ' ' + numeric(result.used.fit[0].temperature) + '–' +
      numeric(result.used.fit.at(-1).temperature) + ' K',
    result.type && t('approximateClass') + ' ' + result.type,
    result.note && t(result.note),
  ].filter(Boolean).join(' · ');
  element('save-row').disabled = !hasPoint;
  element('download-csv').disabled = !hasPoint && journal.length === 0;
  element('export-status').textContent = exportMessage ? t(exportMessage) : '';
}

function sampleStar() {
  measurement = null;
  reason = null;
  exportMessage = null;
  if (photo && selected) {
    const g = geometry();
    const { x, y } = selected;
    if (x - g.outer < 0 || y - g.outer < 0 || x + g.outer >= photo.width || y + g.outer >= photo.height) {
      reason = 'fitRing';
    } else {
      try {
        const pixels = photo.patch(x, y, g.outer);
        const side = 2 * g.outer + 1;
        const alpha = pixels.some((value, i) => {
          if ((i & 3) !== 3 || value === 255) return false;
          const p = (i - 3) / 4;
          return (p % side - g.outer) ** 2 + (Math.floor(p / side) - g.outer) ** 2 <= g.outer ** 2;
        });
        if (alpha) reason = 'transparent';
        else measurement = measure(pixels, g);
      } catch { reason = 'readError'; }
    }
  }
  drawPhoto();
  renderReading();
}

function choose(x, y) {
  selected = { x: bounded(x, 0, photo.width - 1), y: bounded(y, 0, photo.height - 1) };
  sampleStar();
}

async function openPhoto(file, demo = false) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const { signal } = controller;
  photo = measurement = selected = focus = null;
  zoom = 1;
  reason = null;
  exportMessage = null;
  photoMessage = 'opening';
  element('confirm-profile').checked = false;
  for (const id of Object.values(fieldIds)) element(id).value = '';
  for (const [id, value] of Object.entries({ radius: 8, inner: 14, outer: 23 })) element(id).value = value;
  element('inner').min = 10;
  element('outer').min = 18;
  renderPhotoHeader();
  renderReading();
  try {
    if (demo) {
      const response = await fetch('./example.png', { signal });
      if (!response.ok) throw new Error('decoding');
      file = new File([await response.blob()], 'StarSpektra-example.png', { type: 'image/png' });
    }
    const frame = await importMeasurementPhoto(file, signal, () => {
      photoMessage = 'openingHeif';
      renderPhotoHeader();
    });
    checkPhotoAbort(signal);
    photo = { ...frame, demo, name: file.name, metadata: photoInfo(frame, file) };
    for (const [name, id] of Object.entries(fieldIds)) element(id).value = photo.metadata[name] || '';
    if (demo) selected = { ...coordinates.blue };
    photoMessage = null;
  } catch (error) {
    if (signal.aborted) return;
    const known = ['raw', 'video', 'file-size', 'resolution', 'empty', 'heif-timeout'];
    photoMessage = known.includes(error.code) ? error.code : 'decoding';
  }
  renderPhotoHeader();
  sampleStar();
}

function adjustGeometry() {
  const g = geometry();
  g.radius = bounded(Math.round(g.radius), 2, 56);
  g.inner = bounded(Math.round(g.inner), g.radius + 2, 80);
  g.outer = bounded(Math.round(g.outer), g.inner + 4, 120);
  for (const [id, value] of Object.entries(g)) element(id).value = value;
  element('inner').min = g.radius + 2;
  element('outer').min = g.inner + 4;
  sampleStar();
}

function tableRow(values) {
  const tr = document.createElement('tr');
  for (const value of values) {
    const td = document.createElement('td');
    if (value instanceof Node) td.append(value);
    else td.textContent = value;
    tr.append(td);
  }
  return tr;
}

function renderProfile() {
  element('profile-report').hidden = !profile;
  const start = profile?.fit[0], end = profile?.fit.at(-1);
  element('profile-status').textContent = profileError ? t(profileError) : !profile ? t('noProfile') :
    t('profileReady') + ' ' + profile.id + ' · ' + profile.camera + ' · B/R ' + numeric(start.q, 3) +
    '–' + numeric(end.q, 3) + ' · MAE ' + numeric(profile.mae) + ' K · Δ̄ ' + numeric(profile.bias) + ' K';
  element('profile-checks').replaceChildren(...(profile?.validation || []).map(point => tableRow([
    point.star + ' · ' + point.source, numeric(point.temperature), numeric(point.estimate), numeric(point.error),
    numeric(100 * Math.abs(point.error) / point.temperature, 1),
  ])));
}

function record() {
  if (!photo || !selected) return null;
  const meta = metadata();
  const g = geometry();
  const used = result.used;
  return {
    image_id: photo.name, object_name: meta.object, time_local: meta.time, timezone: meta.timezone,
    camera: meta.camera, lens: meta.lens, exposure: meta.exposure, ISO: meta.iso, WB: meta.wb,
    format: meta.format, width: photo.width, height: photo.height, original_profile: meta.profile,
    working_profile: 'linear_sRGB', ...selected, radius: g.radius, annulus_inner: g.inner, annulus_outer: g.outer,
    aperture_px: measurement?.count, background_px: measurement?.backgroundCount,
    FR: measurement?.flux[0], FG: measurement?.flux[1], FB: measurement?.flux[2],
    qcam: measurement?.q, red_share: measurement?.redShare, background_R: measurement?.background[0],
    background_G: measurement?.background[1], background_B: measurement?.background[2],
    radius_change: measurement?.radiusShift, mode: photo.demo ? 'demo_photo' : used ? 'calibrated_photo' : 'photo_color',
    calibration_id: used?.id, calibration_q_min: used?.fit[0].q, calibration_q_max: used?.fit.at(-1).q,
    validation_MAE_K: used?.mae, temperature_K: result.temperature, spectral_class_approx: result.type,
    status: result.status, reason: [reason, ...(measurement?.warnings || []), result.note].filter(Boolean).join(' | '),
    measured_at: new Date().toISOString(),
  };
}

function renderJournal() {
  element('log-count').textContent = journal.length ? '(' + journal.length + ')' : '';
  element('journal-table').hidden = !journal.length;
  const grouped = new Map();
  for (const row of journal) {
    if (row.status === 'insufficient' || row.mode === 'demo_photo' || !Number.isFinite(row.qcam)) continue;
    const conditions = [row.object_name, row.camera, row.lens, row.format, row.ISO, row.exposure, row.WB];
    if (conditions.some(value => !value)) continue;
    const key = JSON.stringify(conditions);
    if (!grouped.has(key)) grouped.set(key, { name: row.object_name, values: [] });
    grouped.get(key).values.push(row.qcam);
  }
  const medians = [...grouped.values()].filter(group => group.values.length >= 2).map(({ name, values }) => {
    values.sort((a, b) => a - b);
    const median = (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
    return name + ' · ' + t('median') + ' ' + numeric(median, 4) + ' (n=' + values.length + ')';
  });
  const summary = element('journal-summary');
  summary.hidden = medians.length === 0;
  summary.textContent = medians.join(' · ');
  element('journal-rows').replaceChildren(...journal.map((row, i) => {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', t('remove') + ' ' + row.image_id);
    remove.addEventListener('click', () => { journal.splice(i, 1); renderJournal(); renderReading(); });
    return tableRow([row.object_name || row.image_id, numeric(row.qcam, 4), numeric(row.temperature_K),
      [t(row.status), ...row.reason.split(' | ').filter(Boolean).map(t)].join(' · '), remove]);
  }));
}

function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

canvas.addEventListener('click', event => {
  if (!photo) return;
  const box = canvas.getBoundingClientRect();
  const view = viewport();
  choose(Math.floor(view.x + (event.clientX - box.left) / box.width * view.width),
    Math.floor(view.y + (event.clientY - box.top) / box.height * view.height));
});
canvas.addEventListener('keydown', event => {
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!photo || !offsets[event.key]) return;
  event.preventDefault();
  const [dx, dy] = offsets[event.key];
  const point = selected || { x: Math.floor(photo.width / 2), y: Math.floor(photo.height / 2) };
  choose(point.x + dx * (event.shiftKey ? 8 : 1), point.y + dy * (event.shiftKey ? 8 : 1));
});
element('zoom-photo').addEventListener('click', () => {
  zoom = zoom === 1 ? 2 : zoom === 2 ? 5 : 1;
  focus = selected;
  renderPhotoHeader();
  drawPhoto();
});
new ResizeObserver(drawPhoto).observe(photoArea);
window.addEventListener('resize', drawPhoto);
for (const id of ['radius', 'inner', 'outer']) element(id).addEventListener('change', adjustGeometry);
for (const id of Object.values(fieldIds)) element(id).addEventListener('input', () => {
  element('confirm-profile').checked = false;
  renderReading();
});
for (const id of ['photo-file', 'capture-file']) element(id).addEventListener('change', event => {
  const file = event.currentTarget.files[0];
  event.currentTarget.value = '';
  if (file) openPhoto(file);
});
element('example-photo').addEventListener('click', () => openPhoto(null, true));
for (const button of document.querySelectorAll('[data-example-star]')) button.addEventListener('click', () => {
  if (photo?.demo) {
    const point = coordinates[button.dataset.exampleStar];
    if (zoom > 1) focus = point;
    choose(point.x, point.y);
  }
});
element('profile-link').addEventListener('click', () => { element('calibration').open = true; });
element('confirm-profile').addEventListener('change', renderReading);
element('profile-input').addEventListener('change', async event => {
  const file = event.currentTarget.files[0];
  event.currentTarget.value = '';
  if (!file) return;
  const profileRequest = Symbol();
  element('profile-input').profileRequest = profileRequest;
  try {
    const valid = validateProfile(JSON.parse(await file.text()));
    if (element('profile-input').profileRequest !== profileRequest) return;
    profile = valid;
    profileError = null;
  } catch (error) {
    if (element('profile-input').profileRequest !== profileRequest) return;
    profile = null;
    profileError = error.message.startsWith('profile-') ? error.message : 'profile-unreadable';
  }
  element('confirm-profile').checked = false;
  renderProfile();
  renderReading();
});
element('template').addEventListener('click', () => {
  const meta = metadata();
  const sample = () => ({ star: '', qcam: null, temperature_K: null, source: '' });
  const data = { schema: 1, id: '', camera: meta.camera, lens: meta.lens, format: meta.format || 'JPEG',
    settings: captureSettings(meta), calibration: Array.from({ length: 6 }, sample), validation: Array.from({ length: 3 }, sample) };
  download(JSON.stringify(data, null, 2), 'application/json', 'StarSpektra-calibration.json');
});
element('save-row').addEventListener('click', () => {
  const row = record();
  if (!row) return;
  journal.push(row);
  exportMessage = 'saved';
  renderJournal();
  renderReading();
});
element('download-csv').addEventListener('click', () => {
  const current = record();
  const rows = journal.length ? journal : current ? [current] : [];
  if (!rows.length) return;
  download(csv(rows, fields), 'text/csv;charset=utf-8', 'StarSpektra-observations.csv');
  exportMessage = 'exported';
  renderReading();
});

function showView() {
  const model = location.hash === '#model';
  element('photo-view').hidden = model;
  element('model-view').hidden = !model;
  element('photo-tab').setAttribute('aria-current', model ? 'false' : 'true');
  element('model-tab').setAttribute('aria-current', model ? 'true' : 'false');
  if (location.hash === '#calibration') element('calibration').open = true;
  if (model) refreshModel();
  else drawPhoto();
}

function setLanguage(value) {
  translate(value);
  try { localStorage.setItem('starspektra-language', value); } catch { /* The language can stay in memory. */ }
  renderPhotoHeader();
  renderProfile();
  renderJournal();
  renderReading();
  refreshModel();
}

const reference = element('spectral-list');
for (const group of SPECTRAL_CLASSES) {
  const card = document.createElement('div');
  card.style.setProperty('--class-color', group.color);
  const type = document.createElement('strong');
  type.textContent = group.type;
  const range = document.createElement('span');
  range.textContent = group.range + ' K';
  card.append(type, range);
  reference.append(card);
}
let language = 'ru';
try { language = localStorage.getItem('starspektra-language') || 'ru'; } catch { /* Keep the default language. */ }
for (const button of document.querySelectorAll('[data-language]')) button.addEventListener('click', () => setLanguage(button.dataset.language));
setLanguage(language);
window.addEventListener('hashchange', showView);
showView();
openPhoto(null, true);
