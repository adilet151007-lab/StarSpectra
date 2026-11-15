import { annotate, findStars, prepareCatalog, solveStars } from './solver-core.mjs';

let ready;

async function loadCatalog() {
  const responses = await Promise.all([fetch('./assets/catalog.json'), fetch('./assets/index.bin')]);
  if (responses.some(response => !response.ok)) throw new Error('Каталог недоступен');
  const [data, index] = await Promise.all([responses[0].json(), responses[1].arrayBuffer()]);
  return prepareCatalog(data, index);
}

self.onmessage = async ({ data: { id, pixels, width, height } }) => {
  try {
    self.postMessage({ id, phase: 'detecting' });
    const stars = findStars(new Uint8ClampedArray(pixels), width, height);
    if (stars.length < 7) {
      self.postMessage({ id, phase: 'finished', count: stars.length, result: null });
      return;
    }
    self.postMessage({ id, phase: 'matching' });
    ready ||= loadCatalog().catch(error => {
      ready = undefined;
      throw error;
    });
    const catalog = await ready;
    const solution = solveStars(stars, width, height, catalog);
    const result = solution && annotate(solution, catalog, width, height);
    self.postMessage({ id, phase: 'finished', count: stars.length, width, height, result });
  } catch {
    self.postMessage({ id, phase: 'error' });
  }
};
