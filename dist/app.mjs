import { importPhoto } from './photo-loader.mjs';

const element = id => document.getElementById(id);
const image = element('preview-image');
const wrap = element('image-wrap');
const viewer = element('viewer');
const canvas = element('overlay');
const overlay = canvas.getContext('2d');
const results = element('result-content');
const photoInput = element('photo-input');
const cameraInput = element('camera-input');
const toggleLines = element('toggle-lines');
const toggleStars = element('toggle-stars');
const workspace = element('workspace');
const coordinates = element('coordinate-badge');
const expand = element('expand-photo');
const examples = [...document.querySelectorAll('[data-example]')];

let version = 0;
let active = null;
let worker = null;
let solving = false;
let photoRequest = null;
let photoUrl;
let result = null;
let selected = null;
let sourceWidth = 0;
let sourceHeight = 0;
let dragDepth = 0;

function setStatus(text, tone, announcement = text) {
  element('status-text').textContent = text;
  element('status-chip').dataset.tone = tone;
  element('live-status').textContent = announcement;
}

function setLayers(hasLines, hasNames) {
  toggleLines.disabled = !hasLines;
  toggleStars.disabled = !hasNames;
}

function svgIcon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon ' + className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#' + name);
  svg.append(use);
  return svg;
}

function feedback(title, body = '') {
  results.replaceChildren();
  const text = document.createElement('p');
  text.className = 'result-feedback';
  const strong = document.createElement('strong');
  strong.textContent = title;
  text.append(strong, document.createTextNode(body));
  results.append(text);
}

function showResult(data, width, height, initial = false) {
  result = data;
  sourceWidth = width;
  sourceHeight = height;
  selected = null;
  setLayers(data.found.some(item => item.segments.length), Boolean(data.named?.length));
  const [ra, dec] = data.coordinates;
  coordinates.textContent = 'α ' + (ra / 15).toFixed(2).replace('.', ',') + 'h  ·  δ ' +
    (dec < 0 ? '−' : '+') + Math.abs(dec).toFixed(1).replace('.', ',') + '°';
  coordinates.title = 'Прямое восхождение и склонение центра кадра (J2000)';
  coordinates.hidden = false;

  const list = document.createElement('div');
  list.className = 'constellation-list';
  for (const [index, item] of data.found.entries()) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'constellation-entry';
    entry.dataset.id = item.id;
    entry.setAttribute('aria-pressed', 'false');

    const icon = document.createElement('span');
    icon.className = 'result-icon';
    icon.append(svgIcon('i-constellation'));
    const name = document.createElement('span');
    name.className = 'result-name';
    const latin = document.createElement('small');
    latin.lang = 'la';
    latin.textContent = item.latin;
    name.append(document.createTextNode(item.name.replace(/\s+/g, ' ')), latin);
    entry.append(icon, name);
    if (index === 0) {
      const tag = document.createElement('span');
      tag.className = 'result-tag';
      tag.textContent = 'В центре';
      entry.append(tag);
    } else {
      entry.append(svgIcon('i-chevron', 'result-chevron'));
    }
    entry.addEventListener('click', () => {
      selected = selected === item.id ? null : item.id;
      for (const row of list.children) row.setAttribute('aria-pressed', String(row.dataset.id === selected));
      if (selected && item.segments.length) toggleLines.checked = true;
      draw();
    });
    list.append(entry);
  }
  const note = document.createElement('p');
  note.className = 'result-note';
  const count = data.matches;
  const last = count % 10;
  const form = count % 100 >= 11 && count % 100 <= 14 ? 'звёзд' : last === 1 ? 'звезда' : last >= 2 && last <= 4 ? 'звезды' : 'звёзд';
  if (initial) {
    note.textContent = 'Выбери пример внизу или загрузи свой снимок.';
  } else {
    note.textContent = 'Совпадения с каталогом: ' + count + ' ' + form + '.';
  }
  results.replaceChildren(list, note);
  draw();
}

function draw() {
  const { width, height } = wrap.getBoundingClientRect();
  if (!width || !height) return;
  const dpi = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpi);
  canvas.height = Math.round(height * dpi);
  overlay.setTransform(dpi, 0, 0, dpi, 0, 0);
  if (!result) return;
  const sx = width / sourceWidth;
  const sy = height / sourceHeight;

  if (!toggleLines.disabled && toggleLines.checked) {
    const figures = selected ? result.found.filter(item => item.id === selected) : result.found;
    for (const [i, item] of figures.entries()) {
      const main = selected || i === 0;
      overlay.beginPath();
      overlay.strokeStyle = main ? '#efd197' : '#a1bdd888';
      overlay.lineWidth = main ? 1.25 : 0.85;
      overlay.lineJoin = 'round';
      overlay.lineCap = 'round';
      for (const [a, b] of item.segments) {
        overlay.moveTo(a[0] * sx, a[1] * sy);
        overlay.lineTo(b[0] * sx, b[1] * sy);
      }
      overlay.stroke();
      overlay.fillStyle = main ? '#fff0c7' : '#c4d7ebaa';
      for (const [x, y] of item.nodes) {
        overlay.beginPath();
        overlay.arc(x * sx, y * sy, main ? 2.15 : 1.55, 0, 2 * Math.PI);
        overlay.fill();
      }
      if (main && item.label && item.segments.length) {
        const [x, y] = item.label;
        const label = item.name.replace(/\s+/g, ' ').toLocaleUpperCase('ru');
        overlay.font = '600 ' + (width < 500 ? '11' : '12') + 'px Inter, sans-serif';
        overlay.textAlign = 'center';
        overlay.textBaseline = 'middle';
        overlay.strokeStyle = '#090b13';
        overlay.lineWidth = 4.5;
        const margin = overlay.measureText(label).width / 2 + 6;
        const px = Math.max(margin, Math.min(width - margin, x * sx));
        const py = Math.max(14, Math.min(height - 14, y * sy - 15));
        overlay.strokeText(label, px, py);
        overlay.fillStyle = '#ffe3a7';
        overlay.fillText(label, px, py);
      }
    }
  }

  if (!toggleStars.disabled && toggleStars.checked) {
    overlay.font = '500 ' + (width < 500 ? '10' : '11') + 'px Inter, sans-serif';
    overlay.textAlign = 'left';
    overlay.textBaseline = 'middle';
    overlay.lineWidth = 3.5;
    overlay.fillStyle = '#ecf4ff';
    overlay.strokeStyle = '#0a111e';
    const placed = [];
    const occupied = (x, y, length) => placed.some(rect =>
      x < rect.x + rect.length + 4 && x + length + 4 > rect.x && Math.abs(y - rect.y) < 12);
    for (const star of result.named) {
      const px = star.x * sx;
      const py = star.y * sy;
      const length = overlay.measureText(star.name).width;
      const left = px + length + 9 > width ? Math.max(2, px - length - 7) : px + 7;
      const top = Math.max(7, Math.min(height - 7, py + 7));
      overlay.beginPath();
      overlay.arc(px, py, 2, 0, 2 * Math.PI);
      overlay.stroke();
      overlay.fill();
      if (occupied(left, top, length)) continue;
      overlay.strokeText(star.name, left, top);
      overlay.fillText(star.name, left, top);
      placed.push({ x: left, y: top, length });
    }
  }
}

function scrollToWorkspace() {
  const position = workspace.getBoundingClientRect();
  if (position.top < 0 || position.top > innerHeight * 0.48) {
    workspace.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}

function initializeWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./solver-worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== version) return;
    if (data.phase === 'detecting') {
      setStatus('Поиск звёзд…', 'working');
      feedback('Ищу звёзды на фото');
      return;
    }
    if (data.phase === 'matching') {
      setStatus('Сверка с каталогом…', 'working');
      feedback('Сопоставляю рисунок звёзд', 'Ищу тот же участок неба в каталоге.');
      return;
    }
    solving = false;
    if (data.phase === 'error') {
      showFailure('Каталог не загрузился', 'Проверь интернет и выбери снимок ещё раз.');
      return;
    }
    const outcome = data.result;
    if (!outcome?.found.length) {
      if (data.count < 7) {
        showFailure('Видно слишком мало звёзд', 'Попробуй ночной режим. Лучше всего подходят кадры с несколькими яркими и чёткими звёздами.', 'Фото открыто');
      } else {
        showFailure('Не нашёл надёжного совпадения', 'Попробуй более чёткое фото с основной камеры. Оставь в кадре больше неба и меньше фонарей.', 'Фото открыто');
      }
      return;
    }
    const main = outcome.found[0].name.replace(/\s+/g, ' ');
    setStatus('Небо распознано', 'done', 'Небо распознано. В центре ' + main + '.');
    showResult({ ...outcome, matches: outcome.matches.length }, data.width, data.height);
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    solving = false;
    showFailure('Распознавание не запустилось', 'Обнови страницу и выбери снимок ещё раз.');
  };
  return worker;
}

function showFailure(title, body, status = 'Анализ не завершён') {
  setStatus(status, 'error', title);
  feedback(title, body);
}

function displayImage(url, aspect, alt, localUrl = null) {
  const previous = photoUrl;
  wrap.style.setProperty('--image-aspect', aspect);
  image.src = url;
  image.alt = alt;
  photoUrl = localUrl;
  if (previous) URL.revokeObjectURL(previous);
}

const importMessages = {
  empty: ['Файл пустой', 'Скачай оригинал снимка и выбери его ещё раз.'],
  raw: ['Выбран Apple ProRAW (DNG)', 'Экспортируй копию снимка в JPEG или HEIC и загрузи её.'],
  video: ['Выбрано видео', 'Для анализа нужен снимок. Для Live Photo выбери его фотографию, а не файл MOV.'],
  'file-size': ['Файл слишком большой', 'Выбери фото размером до 50 МБ.'],
  'too-small': ['Фото слишком маленькое', 'Выбери кадр, где короткая сторона не меньше 96 пикселей.'],
  resolution: ['Разрешение фото слишком высокое', 'Выбери снимок до 50 Мп или уменьши его разрешение.'],
  panorama: ['Фото слишком вытянутое', 'Обрежь панораму так, чтобы в кадре остался рисунок из нескольких звёзд.'],
  'heif-invalid': ['Не удалось прочитать HEIC', 'Скачай оригинал снимка или экспортируй его копию в JPEG.'],
  'heif-unavailable': ['Декодер HEIC не загрузился', 'Обнови страницу или открой ссылку в Safari или Chrome и выбери фото снова.'],
  'heif-timeout': ['Обработка HEIC заняла слишком много времени', 'Уменьши разрешение снимка или экспортируй копию в JPEG.'],
  unreadable: ['Не удалось открыть фото', 'Выбери оригинал снимка в JPG, PNG, WebP или HEIC.'],
};

async function loadPhoto(input, example = null) {
  const id = ++version;
  photoRequest?.abort();
  const request = new AbortController();
  photoRequest = request;
  if (solving) {
    worker?.terminate();
    worker = null;
    solving = false;
  }
  active = example;
  result = null;
  selected = null;
  setLayers(false, false);
  coordinates.hidden = true;
  draw();
  for (const button of examples) button.setAttribute('aria-pressed', String(button.dataset.example === active));
  scrollToWorkspace();
  setStatus('Открытие снимка…', 'working');
  feedback('Открываю снимок');

  let frame;
  try {
    frame = await importPhoto(input, request.signal, () => {
      setStatus('Открываю HEIC…', 'working');
      feedback('Читаю фото HEIC');
    });
  } catch (error) {
    if (id === version) {
      const [title, detail] = importMessages[error?.code] || importMessages.unreadable;
      showFailure(title, detail, 'Фото не открыто');
    }
    return;
  } finally {
    if (photoRequest === request) photoRequest = null;
  }
  if (id !== version) return;
  const { width, height, aspect, pixels, preview } = frame;
  const localUrl = preview ? URL.createObjectURL(preview) : null;
  const exampleName = examples.find(button => button.dataset.example === example)?.querySelector('span').textContent;
  displayImage(localUrl || input, aspect, exampleName ? 'Фото звёздного неба. ' + exampleName : 'Выбранная фотография', localUrl);
  try {
    initializeWorker().postMessage({ id, width, height, pixels }, [pixels]);
    solving = true;
  } catch {
    showFailure('Распознавание не запустилось', 'Фото открыто. Обнови страницу и выбери снимок ещё раз.');
  }
}

function readInput(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (file) loadPhoto(file);
}

photoInput.addEventListener('change', readInput);
cameraInput.addEventListener('change', readInput);
element('replace-photo-input').addEventListener('change', readInput);
toggleLines.addEventListener('change', draw);
toggleStars.addEventListener('change', draw);
for (const button of examples) {
  button.addEventListener('click', () => loadPhoto('./assets/' + button.dataset.example + '.jpg', button.dataset.example));
}
new ResizeObserver(draw).observe(wrap);

function setExpanded(open) {
  viewer.classList.toggle('expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
  const name = open ? 'Свернуть фото' : 'Развернуть фото';
  expand.setAttribute('aria-label', name);
  expand.title = name;
  expand.replaceChildren(svgIcon(open ? 'i-shrink' : 'i-expand'));
}
expand.addEventListener('click', () => setExpanded(!viewer.classList.contains('expanded')));
addEventListener('keydown', event => {
  if (event.key === 'Escape' && viewer.classList.contains('expanded')) {
    setExpanded(false);
    expand.focus();
  }
});

const drop = element('screen-drop');
function draggingFiles(event) {
  return Array.from(event.dataTransfer.types).includes('Files');
}
addEventListener('dragenter', event => {
  if (!draggingFiles(event)) return;
  event.preventDefault();
  dragDepth++;
  drop.hidden = false;
});
addEventListener('dragleave', event => {
  if (!draggingFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) drop.hidden = true;
});
addEventListener('dragover', event => {
  if (draggingFiles(event)) event.preventDefault();
});
addEventListener('drop', event => {
  if (!draggingFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  const file = event.dataTransfer.files[0];
  if (file) {
    if (viewer.classList.contains('expanded')) setExpanded(false);
    loadPhoto(file);
  }
});

fetch('./assets/preview.json').then(response => {
  if (!response.ok) throw new Error();
  return response.json();
}).then(data => {
  if (version === 0) showResult(data, data.width, data.height, true);
}).catch(() => {});
