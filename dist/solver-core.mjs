const radians = Math.PI / 180;

export function vector(ra, dec) {
  const longitude = ra * radians;
  const latitude = dec * radians;
  const radius = Math.cos(latitude);
  return [radius * Math.cos(longitude), radius * Math.sin(longitude), Math.sin(latitude)];
}

export function skyCoordinates(x, y, z) {
  return [((Math.atan2(y, x) / radians) + 360) % 360, Math.atan2(z, Math.hypot(x, y)) / radians];
}

function normalize(x, y, z) {
  const scale = 1 / Math.hypot(x, y, z);
  return [x * scale, y * scale, z * scale];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function findStars(pixels, width, height) {
  const size = width * height;
  const light = new Float32Array(size);
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const p = i * 4;
      const value = 0.29 * pixels[p] + 0.53 * pixels[p + 1] + 0.18 * pixels[p + 2];
      light[i] = value;
      sum += value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
    }
  }

  const blur = new Float32Array(size);
  const contrast = new Float32Array(size);
  const radius = 13;
  const side = 2 * radius + 1;
  const areaScale = 1 / (side * side);
  const samples = [];

  for (let y = radius; y < height - radius; y++) {
    const top = (y - radius) * stride;
    const bottom = (y + radius + 1) * stride;
    for (let x = radius; x < width - radius; x++) {
      const i = y * width + x;
      const left = x - radius;
      const right = x + radius + 1;
      const background = (integral[bottom + right] - integral[bottom + left] -
        integral[top + right] + integral[top + left]) * areaScale;
      blur[i] = (
        light[i] * 4 +
        (light[i - 1] + light[i + 1] + light[i - width] + light[i + width]) * 2 +
        light[i - width - 1] + light[i - width + 1] +
        light[i + width - 1] + light[i + width + 1]
      ) / 16;
      contrast[i] = blur[i] - background;
      if (y % 7 === 0 && x % 13 === 0) samples.push(Math.abs(contrast[i]));
    }
  }

  const margin = radius + 3;
  const noiseFloor = Math.max(2.25, 5 * median(samples));
  const candidates = [];
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const i = y * width + x;
      const peak = contrast[i];
      if (peak < noiseFloor || blur[i] - peak > 162) continue;
      if (contrast[i - 1] >= peak || contrast[i + 1] > peak ||
          contrast[i - width] >= peak || contrast[i + width] > peak ||
          contrast[i - width - 1] >= peak || contrast[i - width + 1] >= peak ||
          contrast[i + width - 1] > peak || contrast[i + width + 1] > peak) continue;

      // Stars are locally compact peaks. Reject edges, broad patches and trails.
      const floor = peak * 0.34;
      let flux = 0;
      let sx = 0;
      let sy = 0;
      let xx = 0;
      let yy = 0;
      let xy = 0;
      let rim = 0;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const weight = Math.max(0, contrast[i + dy * width + dx] - floor);
          flux += weight;
          sx += dx * weight;
          sy += dy * weight;
          xx += dx * dx * weight;
          yy += dy * dy * weight;
          xy += dx * dy * weight;
          if (Math.abs(dx) === 5 || Math.abs(dy) === 5) rim += weight;
        }
      }
      if (rim > flux * 0.24) continue;
      const shape = Math.hypot(xx - yy, 2 * xy) / (xx + yy);
      if (shape > 0.68 || Math.hypot(sx, sy) > 2.5 * flux) continue;
      const weight = (peak + Math.sqrt(peak * flux) * 0.12) * (1 - shape * 0.42);
      candidates.push([x + sx / flux, y + sy / flux, weight]);
    }
  }

  candidates.sort((a, b) => b[2] - a[2]);
  const limit = 180;
  const points = [];
  const cellSize = Math.min(width, height) / 6;
  const tiles = new Map();
  for (const candidate of candidates) {
    const [x, y] = candidate;
    const key = Math.floor(x / cellSize) + 100 * Math.floor(y / cellSize);
    const count = tiles.get(key) || 0;
    if (count >= 12 || points.some(point => Math.abs(point[0] - x) < 6 && Math.abs(point[1] - y) < 6)) continue;
    points.push(candidate);
    tiles.set(key, count + 1);
    if (points.length === limit) break;
  }
  return points;
}

export function prepareCatalog(data, buffer) {
  const stars = data.stars;
  const xs = new Float64Array(stars.length);
  const ys = new Float64Array(stars.length);
  const zs = new Float64Array(stars.length);
  for (let i = 0; i < stars.length; i++) {
    [xs[i], ys[i], zs[i]] = vector(stars[i][0], stars[i][1]);
  }

  const offsetCount = data.bins * data.bins + 1;
  const offsets = new Uint32Array(buffer, 0, offsetCount);
  const triangleCount = offsets[offsetCount - 1] * 3;
  return {
    ...data, xs, ys, zs, offsets,
    triangles: new Uint16Array(buffer, offsetCount * 4, triangleCount),
    neighbors: new Uint16Array(buffer, offsetCount * 4 + triangleCount * 2),
  };
}

function inputTriangles(points, width, height, camera = false) {
  const reference = Math.min(width, height);
  const end = Math.min(points.length, camera ? 33 : 23);
  const distances = points.slice(0, end).map(a =>
    points.slice(0, end).map(b => Math.hypot(a[0] - b[0], a[1] - b[1])));
  const ranked = [];
  for (let a = 0; a < end - 2; a++) {
    for (let b = a + 1; b < end - 1; b++) {
      for (let c = b + 1; c < end; c++) {
        const sides = [[distances[b][c], a], [distances[a][c], b], [distances[a][b], c]];
        sides.sort((left, right) => left[0] - right[0]);
        const length = sides[2][0];
        if (length < reference * 0.14 || length > reference * (camera ? 1.15 : 0.92)) continue;
        const u = sides[1][0] / length;
        const v = sides[0][0] / length;
        if (v < 0.25) continue;
        const altitude = Math.sqrt(Math.max(0, u * u - ((1 + u * u - v * v) / 2) ** 2));
        if (altitude < 0.18) continue;
        const vertices = sides.map(side => side[1]);
        const [p, q, r] = vertices.map(index => points[index]);

        const ax = q[0] - p[0];
        const ay = q[1] - p[1];
        const bx = r[0] - p[0];
        const by = r[1] - p[1];
        const cx = (p[0] + q[0] + r[0]) / 3;
        const cy = (p[1] + q[1] + r[1]) / 3;
        const area = ax * by - ay * bx;
        const centerPenalty = Math.hypot((cx - width / 2) / width, (cy - height / 2) / height);
        const score = 1.9 * altitude - (camera ? 0.024 : 0.034) * (a + b + c) -
          1.15 * centerPenalty - 1.35 * Math.abs(length / reference - 0.55);
        ranked.push({ vertices, u, v, cx, cy, ax, ay, bx, by, area, length, score });
      }
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function pointGrid(points, width, height) {
  const step = Math.max(6, Math.max(width, height) * 0.008);
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const bins = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    bins[Math.floor(y / step) * cols + Math.floor(x / step)].push(i);
  }
  return { points, step, cols, rows, bins };
}

function nearbyPoint(grid, x, y, tolerance) {
  const { cols, rows, step, bins, points } = grid;
  const left = Math.max(0, Math.floor((x - tolerance) / step));
  const right = Math.min(cols - 1, Math.floor((x + tolerance) / step));
  const top = Math.max(0, Math.floor((y - tolerance) / step));
  const bottom = Math.min(rows - 1, Math.floor((y + tolerance) / step));
  let best = tolerance * tolerance;
  let index = -1;
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      for (const i of bins[row * cols + col]) {
        const point = points[i];
        const error = (x - point[0]) ** 2 + (y - point[1]) ** 2;
        if (error < best) {
          best = error;
          index = i;
        }
      }
    }
  }
  return index;
}

function trialTransform(catalog, triangle, p, a, b, c, matrix) {
  const { xs, ys, zs } = catalog;
  // Use the first star as the tangent point and the A–B arc as its x axis.
  const ox = xs[a], oy = ys[a], oz = zs[a];
  const cosB = ox * xs[b] + oy * ys[b] + oz * zs[b];
  const cosC = ox * xs[c] + oy * ys[c] + oz * zs[c];
  if (cosB < 0.43 || cosC < 0.43 || cosB >= 1) return false;
  const sinB = Math.sqrt(1 - cosB * cosB);
  const pixPerUnit = triangle.length / sinB;
  if (pixPerUnit < 260 || pixPerUnit > 21000) return false;

  const ex = (xs[b] - cosB * ox) / sinB;
  const ey = (ys[b] - cosB * oy) / sinB;
  const ez = (zs[b] - cosB * oz) / sinB;
  const nx = oy * ez - oz * ey;
  const ny = oz * ex - ox * ez;
  const nz = ox * ey - oy * ex;
  const tangentB = sinB / cosB;
  const tangentX = (ex * xs[c] + ey * ys[c] + ez * zs[c]) / cosC;
  const tangentY = (nx * xs[c] + ny * ys[c] + nz * zs[c]) / cosC;
  if (Math.abs(tangentY) < 1e-6) return false;

  const sx = triangle.ax / tangentB, sy = triangle.ay / tangentB;
  const tx = (triangle.bx - sx * tangentX) / tangentY;
  const ty = (triangle.by - sy * tangentX) / tangentY;
  const ratio = (sx * sx + sy * sy + tx * tx + ty * ty) / Math.abs(sx * ty - sy * tx);
  if (ratio > 2.63) return false;

  matrix[0] = (p[0] * ox + sx * ex + tx * nx);
  matrix[1] = (p[0] * oy + sx * ey + tx * ny);
  matrix[2] = (p[0] * oz + sx * ez + tx * nz);
  matrix[3] = (p[1] * ox + sy * ex + ty * nx);
  matrix[4] = (p[1] * oy + sy * ey + ty * ny);
  matrix[5] = (p[1] * oz + sy * ez + ty * nz);
  matrix[6] = ox;
  matrix[7] = oy;
  matrix[8] = oz;
  return true;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function orthogonal(a, b, cosine) {
  return normalize(b[0] - cosine * a[0], b[1] - cosine * a[1], b[2] - cosine * a[2]);
}

function cameraTrial(catalog, shape, a, b, c, midX, midY, base, matrix, tolerance) {
  const { xs, ys, zs } = catalog;
  const cos = xs[a] * xs[b] + ys[a] * ys[b] + zs[a] * zs[b];
  if (cos < .36 || cos > .9995) return false;

  // Recover focal length from the angle between the first two rays.
  const { ax, ay, bx, by, cx, cy, pp, qq, rr, pq, pr, qr } = shape;
  const a2 = 1 - cos * cos;
  const b2 = 2 * pq - cos * cos * (pp + qq);
  const c2 = pq * pq - cos * cos * pp * qq;
  const discriminant = b2 * b2 - 4 * a2 * c2;
  if (discriminant < 0) return false;
  const square = (-b2 + Math.sqrt(discriminant)) / (2 * a2);
  if (square < base * base * .19 || square > base * base * 70) return false;
  const f = Math.sqrt(square);
  const normA = Math.sqrt(pp + square);
  const normB = Math.sqrt(qq + square);
  const normC = Math.sqrt(rr + square);
  const angleAC = xs[a] * xs[c] + ys[a] * ys[c] + zs[a] * zs[c];
  const angleBC = xs[b] * xs[c] + ys[b] * ys[c] + zs[b] * zs[c];
  const toleranceAC = tolerance / f * .8 * Math.sqrt(Math.max(.005, 1 - angleAC * angleAC));
  const toleranceBC = tolerance / f * 1.6 * Math.sqrt(Math.max(.005, 1 - angleBC * angleBC));
  if (Math.abs((pr + square) / (normA * normC) - angleAC) > toleranceAC ||
      Math.abs((qr + square) / (normB * normC) - angleBC) > toleranceBC) return false;

  const av = [ax / normA, ay / normA, f / normA];
  const bv = [bx / normB, by / normB, f / normB];
  const cv = [cx / normC, cy / normC, f / normC];
  const A = [xs[a], ys[a], zs[a]], B = [xs[b], ys[b], zs[b]], C = [xs[c], ys[c], zs[c]];

  const e = orthogonal(av, bv, dot(av, bv)), n = cross(av, e);
  const E = orthogonal(A, B, cos), N = cross(A, E);
  const mirror = dot(n, cv) * dot(N, C) < 0 ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    const x = av[0] * A[i] + e[0] * E[i] + mirror * n[0] * N[i];
    const y = av[1] * A[i] + e[1] * E[i] + mirror * n[1] * N[i];
    const z = av[2] * A[i] + e[2] * E[i] + mirror * n[2] * N[i];
    matrix[i] = midX * z + f * x;
    matrix[i + 3] = midY * z + f * y;
    matrix[i + 6] = z;
  }
  const third = project(matrix, ...C);
  return third && Math.hypot(third[0] - midX - cx, third[1] - midY - cy) < tolerance * 1.2;
}

function cameraShape(p, q, r, mx, my) {
  const ax = p[0] - mx, ay = p[1] - my;
  const bx = q[0] - mx, by = q[1] - my;
  const cx = r[0] - mx, cy = r[1] - my;
  return {
    ax, ay, bx, by, cx, cy,
    pp: ax * ax + ay * ay, qq: bx * bx + by * by, rr: cx * cx + cy * cy,
    pq: ax * bx + ay * by, pr: ax * cx + ay * cy, qr: bx * cx + by * cy,
  };
}

function cameraTriangleLookup(points, width, height, focal, bins) {
  const mx = width / 2, my = height / 2;
  const rays = points.map(p => normalize(p[0] - mx, p[1] - my, focal));
  const distances = [[0, 1, 2], [1, 0, 2], [2, 0, 1]].map(([i, j, k]) => [
    2 - 2 * dot(rays[j], rays[k]), i,
  ]);
  distances.sort((a, b) => a[0] - b[0]);
  const longest = distances[2][0];
  return [
    Math.floor(bins * Math.sqrt(distances[1][0] / longest)),
    Math.floor(bins * Math.sqrt(distances[0][0] / longest)),
    ...distances.map(item => item[1]),
  ];
}

function verifyNear(catalog, grid, matrix, anchor, a, b, c, tolerance, minX, minY, maxX, maxY) {
  const { xs, ys, zs, neighbors, neighborCount } = catalog;
  let brightHits = 0;
  let hits = 0;
  for (let k = anchor * neighborCount; k < (anchor + 1) * neighborCount; k++) {
    const j = neighbors[k];
    if (j === 65535 || j === a || j === b || j === c) continue;
    const vx = xs[j], vy = ys[j], vz = zs[j];
    const depth = matrix[6] * vx + matrix[7] * vy + matrix[8] * vz;
    if (depth <= 0.45) continue;
    const x = (matrix[0] * vx + matrix[1] * vy + matrix[2] * vz) / depth;
    if (x < minX || x > maxX) continue;
    const y = (matrix[3] * vx + matrix[4] * vy + matrix[5] * vz) / depth;
    if (y < minY || y > maxY) continue;
    const pixel = nearbyPoint(grid, x, y, tolerance);
    if (pixel === -1) continue;
    hits++;
    if (pixel < 28) brightHits++;
    if (hits >= 4 && brightHits >= 2) return true;
  }
  return hits >= 3 && brightHits >= 1 && grid.points.length < 45;
}

export function project(matrix, x, y, z) {
  const depth = matrix[6] * x + matrix[7] * y + matrix[8] * z;
  if (depth <= 0.05) return null;
  return [
    (matrix[0] * x + matrix[1] * y + matrix[2] * z) / depth,
    (matrix[3] * x + matrix[4] * y + matrix[5] * z) / depth,
  ];
}

function matchField(catalog, grid, matrix, width, height, tolerance) {
  const pixels = new Map();
  const { xs, ys, zs } = catalog;
  let predicted = 0;
  for (let i = 0; i < xs.length; i++) {
    const point = project(matrix, xs[i], ys[i], zs[i]);
    if (!point) continue;
    const [x, y] = point;
    if (x < 12 || y < 12 || x > width - 12 || y > height - 12) continue;
    predicted++;
    const pixel = nearbyPoint(grid, x, y, tolerance);
    if (pixel < 0) continue;
    const observed = grid.points[pixel];
    const error = Math.hypot(x - observed[0], y - observed[1]);
    if (!pixels.has(pixel) || pixels.get(pixel).error > error) {
      pixels.set(pixel, { star: i, pixel, x: observed[0], y: observed[1], error });
    }
  }
  return { matches: [...pixels.values()], predicted };
}

function solveLinear(matrix, values) {
  const size = values.length;
  for (let c = 0; c < size; c++) {
    let pivot = c;
    for (let r = c + 1; r < size; r++) {
      if (Math.abs(matrix[r][c]) > Math.abs(matrix[pivot][c])) pivot = r;
    }
    if (Math.abs(matrix[pivot][c]) < 1e-10) return null;
    [matrix[c], matrix[pivot]] = [matrix[pivot], matrix[c]];
    [values[c], values[pivot]] = [values[pivot], values[c]];
    const divisor = matrix[c][c];
    for (let j = c; j < size; j++) matrix[c][j] /= divisor;
    values[c] /= divisor;

    for (let r = 0; r < size; r++) {
      if (r === c) continue;
      const factor = matrix[r][c];
      for (let j = c; j < size; j++) matrix[r][j] -= factor * matrix[c][j];
      values[r] -= factor * values[c];
    }
  }
  return values;
}

function refit(catalog, matches, estimate, width, height, tolerance) {
  // Use a local sky basis and normalized image coordinates for a stable fit.
  const pole = normalize(estimate[6], estimate[7], estimate[8]);
  const [ox, oy, oz] = pole;
  const east = Math.abs(oz) > 0.92 ? normalize(0, oz, -oy) : normalize(-oy, ox, 0);
  const [ex, ey, ez] = east;
  const north = [oy * ez - oz * ey, oz * ex - ox * ez, ox * ey - oy * ex];
  const [nx, ny, nz] = north;
  const scale = Math.max(width, height);
  const normal = Array.from({ length: 8 }, () => new Float64Array(8));
  const rhs = new Float64Array(8);
  const { xs, ys, zs } = catalog;
  for (const match of matches) {
    const j = match.star;
    const vx = xs[j], vy = ys[j], vz = zs[j];
    const depth = ox * vx + oy * vy + oz * vz;
    const u = (ex * vx + ey * vy + ez * vz) / depth;
    const v = (nx * vx + ny * vy + nz * vz) / depth;
    const x = (match.x - width / 2) / scale;
    const y = (match.y - height / 2) / scale;
    const weight = 1 / (1 + (match.error / (tolerance * 0.5)) ** 2);
    const rowX = [u, v, 1, 0, 0, 0, -x * u, -x * v];
    const rowY = [0, 0, 0, u, v, 1, -y * u, -y * v];
    for (let a = 0; a < 8; a++) {
      rhs[a] += weight * (rowX[a] * x + rowY[a] * y);
      for (let b = 0; b <= a; b++) {
        normal[a][b] += weight * (rowX[a] * rowX[b] + rowY[a] * rowY[b]);
      }
    }
  }
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) normal[a][b] = normal[b][a];
  }
  normal[6][6] += .014;
  normal[7][7] += .014;
  const solution = solveLinear(normal, rhs);
  if (!solution || Math.hypot(solution[6], solution[7]) > 1.35) return estimate;

  const result = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    result[i + 6] = pole[i] + solution[6] * east[i] + solution[7] * north[i];
    result[i] = scale * (solution[0] * east[i] + solution[1] * north[i] + solution[2] * pole[i]) +
      width / 2 * result[i + 6];
    result[i + 3] = scale * (solution[3] * east[i] + solution[4] * north[i] + solution[5] * pole[i]) +
      height / 2 * result[i + 6];
  }
  return result;
}

export function unproject(matrix, x, y) {
  const ax = matrix[0] - x * matrix[6];
  const ay = matrix[1] - x * matrix[7];
  const az = matrix[2] - x * matrix[8];
  const bx = matrix[3] - y * matrix[6];
  const by = matrix[4] - y * matrix[7];
  const bz = matrix[5] - y * matrix[8];
  const rx = ay * bz - az * by;
  const ry = az * bx - ax * bz;
  const rz = ax * by - ay * bx;
  const side = rx * matrix[6] + ry * matrix[7] + rz * matrix[8] < 0 ? -1 : 1;
  return normalize(side * rx, side * ry, side * rz);
}

function angularDistance(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / radians;
}

function validated(catalog, grid, original, w, h, tolerance) {
  const base = Math.max(w, h);
  let matrix = original;
  let field = matchField(catalog, grid, matrix, w, h, tolerance);
  if (field.matches.length < 7) return null;
  for (const limit of [tolerance, base * 0.008, base * 0.0052]) {
    matrix = refit(catalog, field.matches, matrix, w, h, limit);
    field = matchField(catalog, grid, matrix, w, h, limit);
    if (field.matches.length < 7) return null;
  }
  const { matches, predicted } = field;
  const error = median(matches.map(match => match.error));
  const bright = matches.filter(match => match.pixel < 35).length;
  const high = matches.filter(match => match.pixel < 18).length;
  const strong = matches.filter(match => match.pixel < 24 && match.error < base * .0028).length;
  const xs = matches.map(match => match.x);
  const ys = matches.map(match => match.y);
  const spanX = (Math.max(...xs) - Math.min(...xs)) / w;
  const spanY = (Math.max(...ys) - Math.min(...ys)) / h;
  const randomHits = grid.points.length * predicted * Math.PI * (base * 0.0052) ** 2 / (w * h);
  if (bright < 5 || high < 4 || strong < 5 || spanX < 0.25 || spanY < 0.25 ||
      error > base * 0.0034 || matches.length < 7 + 3.3 * randomHits) return null;
  const view = angularDistance(unproject(matrix, 0, h / 2), unproject(matrix, w, h / 2));
  const height = angularDistance(unproject(matrix, w / 2, 0), unproject(matrix, w / 2, h));
  if (!Number.isFinite(view) || view < 2.6 || height < 2.6 || view > 113 || height > 113) return null;
  return {
    matrix: Array.from(matrix),
    matches,
    error,
    view,
    height,
    score: bright * 2 + matches.length + strong - 5 * randomHits,
  };
}

function solvePlanar(points, width, height, catalog) {
  if (points.length < 7) return null;
  const { bins, offsets, triangles } = catalog;
  const grid = pointGrid(points, width, height);
  const ranked = inputTriangles(points, width, height);
  const base = Math.max(width, height);
  const matrix = new Float64Array(9);
  const end = Math.min(ranked.length, 270);
  let best = null;
  const deadline = performance.now() + 3300;

  for (const pass of [{ tol: 1, count: Math.min(end, 140) }, { tol: 2, count: end }]) {
    for (let i = 0; i < pass.count; i++) {
      if (performance.now() >= deadline) return best;
      const triangle = ranked[i];
      const p = points[triangle.vertices[0]];
      const uBin = Math.floor(triangle.u * bins);
      const vBin = Math.floor(triangle.v * bins);
      const tolerance = base * (pass.tol === 1 ? 0.011 : 0.016);
      const range = Math.max(base * 0.37, triangle.length * 0.81);
      const minX = Math.max(10, triangle.cx - range);
      const minY = Math.max(10, triangle.cy - range);
      const maxX = Math.min(width - 10, triangle.cx + range);
      const maxY = Math.min(height - 10, triangle.cy + range);
      for (let du = -pass.tol; du <= pass.tol; du++) {
        if (uBin + du >= bins) continue;
        for (let dv = -pass.tol; dv <= pass.tol; dv++) {
          const bucket = (uBin + du) * bins + vBin + dv;
          const start = offsets[bucket] * 3;
          const stop = offsets[bucket + 1] * 3;
          for (let j = start; j < stop; j += 3) {
            const a = triangles[j], b = triangles[j + 1], c = triangles[j + 2];
            if (!trialTransform(catalog, triangle, p, a, b, c, matrix)) continue;
            if (!verifyNear(catalog, grid, matrix, a, a, b, c, tolerance, minX, minY, maxX, maxY) &&
                !verifyNear(catalog, grid, matrix, b, a, b, c, tolerance, minX, minY, maxX, maxY)) continue;
            const solution = validated(catalog, grid, matrix, width, height, tolerance);
            if (solution && (!best || solution.score > best.score)) best = solution;
            if (solution && clearMatch(solution)) return solution;
          }
        }
      }
      if (best?.score >= 35 && i > 65) return best;
    }
    if (best?.score >= 35) return best;
  }
  return best;
}

function solveCamera(points, width, height, catalog, milliseconds, triangleLimit) {
  const { bins, offsets, triangles } = catalog;
  const grid = pointGrid(points, width, height);
  const base = Math.max(width, height);
  const matrix = new Float64Array(9);
  const ranked = inputTriangles(points, width, height, true);
  const tolerance = base * .009;
  let best = null;
  const midX = width / 2;
  const midY = height / 2;
  const evaluated = new Int32Array(triangles.length / 3 * 6);
  const permutation = [[-1, 0, 1], [2, -1, 3], [4, 5, -1]];
  let ordinal = 0;
  const deadline = performance.now() + milliseconds;
  for (const tri of ranked.slice(0, triangleLimit)) {
    if (performance.now() >= deadline) return best;
    ordinal++;
    const input = tri.vertices.map(j => points[j]);
    const tried = new Set();
    for (const scale of [.68, .82, 1.05, .56, 1.4, .46, 1.95, 2.8, 4.5]) {
      const [u, v, pa, pb, pc] = cameraTriangleLookup(input, width, height, base * scale, bins);
      const p = input[pa], q = input[pb], r = input[pc];
      const key = u * bins + v + pa * bins * bins + pb * 3 * bins * bins;
      if (tried.has(key)) continue;
      tried.add(key);
      const shape = cameraShape(p, q, r, midX, midY);
      const offset = permutation[pa][pb] * evaluated.length / 6;
      for (let row = Math.max(0, u - 1); row <= Math.min(bins - 1, u + 1); row++) {
        for (let col = Math.max(0, v - 1); col <= Math.min(bins - 1, v + 1); col++) {
          const bucket = row * bins + col;
          for (let j = offsets[bucket]; j < offsets[bucket + 1]; j++) {
            if (evaluated[offset + j] === ordinal) continue;
            evaluated[offset + j] = ordinal;
            const a = triangles[j * 3], b = triangles[j * 3 + 1], c = triangles[j * 3 + 2];
            if (!cameraTrial(catalog, shape, a, b, c, midX, midY, base, matrix, tolerance)) continue;
            if (!verifyNear(catalog, grid, matrix, a, a, b, c, tolerance, 10, 10, width - 10, height - 10) &&
                !verifyNear(catalog, grid, matrix, b, a, b, c, tolerance, 10, 10, width - 10, height - 10)) continue;
            const candidate = validated(catalog, grid, matrix, width, height, tolerance);
            if (!candidate) continue;
            if (!best || candidate.score > best.score) best = candidate;
            if (clearMatch(candidate)) return candidate;
          }
        }
      }
    }
  }
  return best;
}

function clearMatch(solution) {
  return solution && solution.matches.length >= 20 && solution.score >= 38;
}

export function solveStars(points, width, height, catalog) {
  if (points.length < 7) return null;
  const direct = solveCamera(points, width, height, catalog, 450, 22);
  if (clearMatch(direct)) return direct;
  const planar = solvePlanar(points, width, height, catalog);
  if (clearMatch(planar)) return planar;
  const camera = solveCamera(points, width, height, catalog, 4600, 530);
  const ranked = [direct, planar, camera].filter(Boolean).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return clearMatch(best) || (best?.score >= 27 && best.error < Math.max(width, height) * .0019) ? best : null;
}

// IAU boundary positions are tabulated in B1875 coordinates (Roman 1987).
function regionFor(direction, table) {
  const [ra, dec] = skyCoordinates(...direction);
  const t = -1.25;
  const arcsec = radians / 3600;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * arcsec;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * arcsec;
  const a = ra * radians + zeta;
  const d = dec * radians;
  const x = Math.cos(theta) * Math.cos(d) * Math.cos(a) - Math.sin(theta) * Math.sin(d);
  const y = Math.cos(d) * Math.sin(a);
  const b1875Dec = Math.asin(Math.sin(theta) * Math.cos(d) * Math.cos(a) + Math.cos(theta) * Math.sin(d)) / radians;
  const b1875Ra = ((Math.atan2(y, x) + z) / radians + 360) % 360 / 15;
  return table.find(([left, right, lower]) => b1875Ra >= left && b1875Ra < right && b1875Dec >= lower)?.[3];
}

function clipLine(a, b, width, height) {
  let start = 0;
  let end = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const edges = [[-dx, a[0]], [dx, width - a[0]], [-dy, a[1]], [dy, height - a[1]]];
  for (const [movement, offset] of edges) {
    if (movement === 0 && offset < 0) return null;
    if (movement < 0) start = Math.max(start, offset / movement);
    if (movement > 0) end = Math.min(end, offset / movement);
    if (start > end) return null;
  }
  return [[a[0] + dx * start, a[1] + dy * start], [a[0] + dx * end, a[1] + dy * end]];
}

export function annotate(solution, catalog, width, height) {
  const { matrix } = solution;
  const center = unproject(matrix, width / 2, height / 2);
  const centerRegion = regionFor(center, catalog.regions);
  const counts = new Map();
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 17; col++) {
      const id = regionFor(unproject(matrix, (col + 0.5) * width / 17, (row + 0.5) * height / 13), catalog.regions);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  const populated = new Map();
  for (const entry of catalog.figures) {
    const [rawId, name, latin, label, lines] = entry;
    const id = rawId.startsWith('Ser') ? 'Ser' : rawId;
    if (!counts.has(id)) continue;
    if (!populated.has(id)) populated.set(id, { id, name, latin, segments: [], label: null, nodes: [], area: counts.get(id) / 221 });
    const item = populated.get(id);
    const vertices = new Set();
    for (const line of lines) {
      let previous = null;
      for (const [ra, dec] of line) {
        const point = project(matrix, ...vector(ra, dec));
        if (point && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height) {
          const key = ra + ' ' + dec;
          if (!vertices.has(key)) item.nodes.push(point);
          vertices.add(key);
        }
        if (previous && point) {
          const segment = clipLine(previous, point, width, height);
          if (segment && Math.hypot(segment[0][0] - segment[1][0], segment[0][1] - segment[1][1]) > 4) {
            item.segments.push(segment);
          }
        }
        previous = point;
      }
    }
    const position = project(matrix, ...vector(...label));
    if (position && position[0] > width * 0.08 && position[0] < width * 0.92 &&
        position[1] > height * 0.09 && position[1] < height * 0.91) item.label = position;
  }
  const found = [...populated.values()].filter(item => item.area >= 0.032 || item.id === centerRegion || item.nodes.length >= 2);
  found.sort((a, b) => (b.id === centerRegion) - (a.id === centerRegion) || b.area - a.area);
  for (const item of found) {
    if (!item.label && item.nodes.length) {
      const total = item.nodes.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
      item.label = total.map(value => value / item.nodes.length);
    }
  }

  const namesRu = {
    Polaris: 'Полярная', Betelgeuse: 'Бетельгейзе', Rigel: 'Ригель', Bellatrix: 'Беллатрикс',
    Alnitak: 'Альнитак', Alnilam: 'Альнилам', Mintaka: 'Минтака', Saiph: 'Саиф', Sirius: 'Сириус',
    Vega: 'Вега', Deneb: 'Денеб', Sadr: 'Садр', Albireo: 'Альбирео', Dubhe: 'Дубхе',
    Merak: 'Мерак', Alkaid: 'Алькаид', Mizar: 'Мицар', Alioth: 'Алиот', Schedar: 'Шедар',
    Caph: 'Каф', Ruchbah: 'Рукбах', Segin: 'Сегин', Capella: 'Капелла', Arcturus: 'Арктур',
    Aldebaran: 'Альдебаран', Altair: 'Альтаир', Antares: 'Антарес', Spica: 'Спика',
  };
  const named = [...solution.matches].sort((a, b) => a.star - b.star).flatMap(match => {
    const star = catalog.stars[match.star];
    const name = catalog.names[star[3]];
    return name && star[2] < 4.1 ? [{ name: namesRu[name] || name, x: match.x, y: match.y }] : [];
  }).slice(0, 10);
  return { ...solution, found, named, coordinates: skyCoordinates(...center) };
}
