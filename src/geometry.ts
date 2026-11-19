import { parse } from 'opentype.js';

export type Pt = [number, number];

export interface Contour {
  pts: Pt[]; // uniformly resampled, closed (last connects to first)
  len: number;
  start: number; // cumulative length before this contour
  hole: boolean;
}

export interface WordGeo {
  contours: Contour[];
  totalLen: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  rect: { x: number; y: number; w: number; h: number }; // world rect covered by the field texture
  texW: number;
  texH: number;
  dist: Float32Array; // signed distance, world units, negative inside (row 0 = bottom)
  time: Float32Array; // contour arc parameter 0..1 near contours, 2 elsewhere
}

const INF = 1e20;

function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array, z: Float64Array) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

function edt(data: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(data, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(data, y * w, 1, w, f, v, z);
}

function flatten(cmds: any[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let px = 0;
  let py = 0;
  const close = () => {
    if (cur.length > 2) {
      const a = cur[0];
      const b = cur[cur.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) cur.pop();
      out.push(cur);
    }
    cur = [];
  };
  for (const c of cmds) {
    if (c.type === 'M') {
      close();
      cur.push([c.x, c.y]);
      px = c.x;
      py = c.y;
    } else if (c.type === 'L') {
      cur.push([c.x, c.y]);
      px = c.x;
      py = c.y;
    } else if (c.type === 'Q') {
      const N = 14;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        cur.push([u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y]);
      }
      px = c.x;
      py = c.y;
    } else if (c.type === 'C') {
      const N = 18;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        cur.push([
          u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ]);
      }
      px = c.x;
      py = c.y;
    } else if (c.type === 'Z') {
      close();
    }
  }
  close();
  return out;
}

function area(p: Pt[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

function resample(p: Pt[], ds: number): { pts: Pt[]; len: number } {
  const n = p.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const q = p[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]));
  }
  const len = cum[n];
  const m = Math.max(8, Math.round(len / ds));
  const pts: Pt[] = [];
  let j = 0;
  for (let i = 0; i < m; i++) {
    const s = (i / m) * len;
    while (cum[j + 1] < s) j++;
    const a = p[j];
    const b = p[(j + 1) % n];
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (s - cum[j]) / seg;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { pts, len };
}

let fontPromise: Promise<any> | null = null;
export function loadFont(url: string) {
  if (!fontPromise) fontPromise = fetch(url).then((r) => r.arrayBuffer()).then((b) => parse(b));
  return fontPromise;
}

export function buildWord(font: any, lines: string[], texW: number, targetW = 10): WordGeo {
  const size = 100;
  const lineGap = size * 0.86;
  // per glyph raw contours, ordered: glyph by glyph, holes before outers (inner-first cutting order)
  const groups: { pts: Pt[]; hole: boolean }[] = [];
  lines.forEach((line, li) => {
    const adv = font.getAdvanceWidth(line, size, { kerning: true });
    const paths = font.getPaths(line, -adv / 2, li * lineGap, size, { kerning: true });
    for (const path of paths) {
      const cs = flatten(path.commands).map((pts) => ({ pts: pts.map((q) => [q[0], -q[1]] as Pt), a: 0 }));
      if (!cs.length) continue;
      cs.forEach((c) => (c.a = area(c.pts)));
      const big = cs.reduce((m, c) => (Math.abs(c.a) > Math.abs(m.a) ? c : m), cs[0]);
      const holes = cs.filter((c) => Math.sign(c.a) !== Math.sign(big.a));
      const outers = cs.filter((c) => Math.sign(c.a) === Math.sign(big.a));
      for (const c of holes) groups.push({ pts: c.pts, hole: true });
      for (const c of outers) groups.push({ pts: c.pts, hole: false });
    }
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of groups) for (const p of g.pts) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  const s = targetW / (x1 - x0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const bbox = { x0: (x0 - cx) * s, x1: (x1 - cx) * s, y0: (y0 - cy) * s, y1: (y1 - cy) * s };
  const pad = 1.0;
  const rect = { x: bbox.x0 - pad, y: bbox.y0 - pad, w: bbox.x1 - bbox.x0 + 2 * pad, h: bbox.y1 - bbox.y0 + 2 * pad };
  const texH = Math.round((texW * rect.h) / rect.w);
  const pxPerUnit = texW / rect.w;

  const contours: Contour[] = [];
  let total = 0;
  for (const g of groups) {
    const world = g.pts.map((p) => [(p[0] - cx) * s, (p[1] - cy) * s] as Pt);
    const r = resample(world, 0.4 / pxPerUnit);
    contours.push({ pts: r.pts, len: r.len, start: total, hole: g.hole });
    total += r.len;
  }

  // coverage mask
  const cv = document.createElement('canvas');
  cv.width = texW;
  cv.height = texH;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const c of contours) {
    c.pts.forEach((p, i) => {
      const X = (p[0] - rect.x) * pxPerUnit;
      const Y = texH - (p[1] - rect.y) * pxPerUnit;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
  }
  ctx.fill('nonzero');
  const img = ctx.getImageData(0, 0, texW, texH).data;
  const N = texW * texH;
  const outer = new Float64Array(N);
  const inner = new Float64Array(N);
  for (let y = 0; y < texH; y++) {
    const src = (texH - 1 - y) * texW; // flip so row 0 = bottom
    for (let x = 0; x < texW; x++) {
      const a = img[(src + x) * 4 + 3] / 255;
      const i = y * texW + x;
      if (a >= 1) { outer[i] = 0; inner[i] = INF; }
      else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
      else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
    }
  }
  edt(outer, texW, texH);
  edt(inner, texW, texH);
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / pxPerUnit;

  // contour arc parameter, stamped around each contour sample
  const time = new Float32Array(N).fill(2);
  const best = new Float32Array(N).fill(1e9);
  const R = Math.max(6, Math.round(0.07 * pxPerUnit));
  for (const c of contours) {
    const n = c.pts.length;
    for (let i = 0; i < n; i++) {
      const p = c.pts[i];
      const t = (c.start + (i / n) * c.len) / total;
      const X = (p[0] - rect.x) * pxPerUnit - 0.5;
      const Y = (p[1] - rect.y) * pxPerUnit - 0.5;
      const xa = Math.max(0, Math.floor(X - R)), xb = Math.min(texW - 1, Math.ceil(X + R));
      const ya = Math.max(0, Math.floor(Y - R)), yb = Math.min(texH - 1, Math.ceil(Y + R));
      for (let yy = ya; yy <= yb; yy++) {
        const dy = yy - Y;
        for (let xx = xa; xx <= xb; xx++) {
          const dx = xx - X;
          const d2 = dx * dx + dy * dy;
          const k = yy * texW + xx;
          if (d2 < best[k]) { best[k] = d2; time[k] = t; }
        }
      }
    }
  }
  return { contours, totalLen: total, bbox, rect, texW, texH, dist, time };
}

export function pointAt(geo: WordGeo, s: number): { p: Pt; ci: number } {
  const cs = geo.contours;
  let lo = 0, hi = cs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cs[mid].start <= s) lo = mid; else hi = mid - 1;
  }
  const c = cs[lo];
  const n = c.pts.length;
  const f = Math.min(0.999999, Math.max(0, (s - c.start) / c.len)) * n;
  const i = Math.floor(f);
  const a = c.pts[i];
  const b = c.pts[(i + 1) % n];
  const t = f - i;
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ci: lo };
}

export function sampleDist(geo: WordGeo, x: number, y: number) {
  const u = Math.round(((x - geo.rect.x) / geo.rect.w) * geo.texW - 0.5);
  const v = Math.round(((y - geo.rect.y) / geo.rect.h) * geo.texH - 0.5);
  if (u < 0 || v < 0 || u >= geo.texW || v >= geo.texH) return 1;
  return geo.dist[v * geo.texW + u];
}
