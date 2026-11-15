import { MODEL_MIN, MODEL_MAX, MODEL_POINTS, planckRatio, modelTemperature, modelSample } from './photometry.mjs';
import { t, numeric } from './language.mjs';

export function setupModel() {
  const element = id => document.getElementById(id);
  const canvas = element('planck-chart');
  const ctx = canvas.getContext('2d');
  const ratioInput = element('model-ratio');
  const slider = element('model-range');
  let selected = Number(slider.value);
  let activeRatio = planckRatio(selected);
  const minRatio = planckRatio(MODEL_MIN);
  const maxRatio = planckRatio(MODEL_MAX);
  const kelvin = value => value === null ? '—' : numeric(value) + ' K';

  function chart() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const left = 38, right = width - 12, top = 16, bottom = height - 32;
    const px = value => left + (value - MODEL_MIN) * (right - left) / (MODEL_MAX - MODEL_MIN);
    const py = value => bottom - value * (bottom - top) / 4;
    const line = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ctx.font = '11px system-ui, sans-serif';
    ctx.strokeStyle = '#2b394c';
    ctx.fillStyle = '#a4b7ce';
    ctx.textAlign = 'right';
    for (let q = 0; q <= 4; q++) {
      line(left, py(q), right, py(q));
      ctx.fillText(String(q), left - 7, py(q) + 4);
    }
    ctx.textAlign = 'center';
    for (const value of width > 410 ? [2500, 5000, 10000, 15000, 20000] : [2500, 10000, 20000]) {
      line(px(value), top, px(value), bottom);
      ctx.fillText(numeric(value), px(value) - (value === MODEL_MAX ? 13 : 0), bottom + 17);
    }
    ctx.textAlign = 'left';
    ctx.fillText('q', 8, top);
    ctx.fillText('K', right - 4, height - 1);

    const temps = Array.from({ length: 121 }, (_, i) => MODEL_MIN + (MODEL_MAX - MODEL_MIN) * i / 120);
    ctx.beginPath();
    for (const value of temps) ctx.lineTo(px(value), py(1.05 * planckRatio(value)));
    for (const value of temps.slice().reverse()) ctx.lineTo(px(value), py(.95 * planckRatio(value)));
    ctx.closePath();
    ctx.fillStyle = '#8ac4e721';
    ctx.fill();

    ctx.beginPath();
    temps.forEach((value, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(value), py(planckRatio(value))));
    ctx.strokeStyle = '#99d8f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#8cbbd4';
    for (const value of MODEL_POINTS) {
      ctx.beginPath();
      ctx.arc(px(value), py(planckRatio(value)), 2.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (selected !== null) {
      ctx.fillStyle = '#f4cf94';
      ctx.strokeStyle = '#e7c48a73';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      line(px(selected), py(activeRatio), px(selected), bottom);
      line(left, py(activeRatio), px(selected), py(activeRatio));
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px(selected), py(activeRatio), 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  function render() {
    element('model-slider-value').textContent = kelvin(selected);
    element('model-result').textContent = kelvin(selected);
    element('model-note').textContent = selected === null ?
      t('modelOutside') + ' ' + numeric(minRatio, 4) + '–' + numeric(maxRatio, 4) + '.' : t('modelNote');
    element('model-sensitivity').hidden = selected === null;
    if (selected !== null) {
      const below = modelTemperature(.95 * activeRatio);
      const above = modelTemperature(1.05 * activeRatio);
      element('model-minus').textContent = below === null ? '< ' + kelvin(MODEL_MIN) : kelvin(below);
      element('model-plus').textContent = above === null ? '> ' + kelvin(MODEL_MAX) : kelvin(above);
    }
    chart();
  }

  slider.addEventListener('input', () => {
    selected = Number(slider.value);
    activeRatio = planckRatio(selected);
    ratioInput.value = numeric(activeRatio, 4);
    render();
  });
  ratioInput.addEventListener('input', () => {
    const raw = ratioInput.value.trim().replace(',', '.');
    activeRatio = raw && /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(raw) ? Number(raw) : NaN;
    selected = modelTemperature(activeRatio);
    if (selected !== null) slider.value = String(Math.round(selected));
    render();
  });

  function refresh() {
    const body = element('experiment-rows');
    body.replaceChildren();
    for (const value of MODEL_POINTS) {
      const sample = modelSample(value);
      const row = document.createElement('tr');
      for (const cell of [numeric(value), numeric(sample.q, 4), numeric(sample.below), numeric(sample.above)]) {
        const td = document.createElement('td');
        td.textContent = cell;
        row.append(td);
      }
      body.append(row);
    }
    render();
  }
  new ResizeObserver(chart).observe(canvas);
  return refresh;
}
