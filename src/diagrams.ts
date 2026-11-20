// Every figure on the page is a small simulation: a tick(t) function redraws it for t in 0..1.
type Tick = (t: number) => void;
interface Def { vb: [number, number]; dur: number; still: number; build(svg: SVGSVGElement, code: HTMLElement | null): Tick }

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;
function h<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
const ease = (x: number) => x * x * (3 - 2 * x);
const f1 = (n: number) => n.toFixed(1);
function writer(el: HTMLElement | null) {
  let last = '';
  return (s: string) => { if (el && s !== last) el.textContent = last = s; };
}
const head = (svg: Element, cls = 'fa') => {
  const g = h('g', {}, svg);
  if (cls === 'fa') h('circle', { class: 'glow', r: 8 }, g);
  h('circle', { class: cls, r: 3.2 }, g);
  return g;
};
const at = (el: Element, x: number, y: number) => el.setAttribute('transform', `translate(${f1(x)} ${f1(y)})`);

// ---------------------------------------------------------------- 2D cut
const cut: Def = {
  vb: [240, 150], dur: 7, still: 0.92,
  build(svg, code) {
    const outer = 'M62 40H152a28 28 0 0 1 28 28V112H100V84H62Z';
    const hole = 'M163 68a11 11 0 1 0 -22 0a11 11 0 1 0 22 0';
    h('rect', { class: 's thin', x: 14, y: 12, width: 212, height: 126, rx: 2 }, svg);
    h('path', { class: 's thin dash', d: 'M56 34H152a34 34 0 0 1 34 34V118H94V90H56Z' }, svg);
    const fill = h('path', { d: `${outer}${hole}`, fill: 'var(--accent)', 'fill-rule': 'evenodd', opacity: 0 }, svg);
    const travel = h('path', { class: 's thin dash' }, svg);
    const pH = h('path', { class: 's a', d: hole }, svg);
    const pO = h('path', { class: 's a', d: outer }, svg);
    const LH = pH.getTotalLength(), LO = pO.getTotalLength();
    pH.style.strokeDasharray = String(LH);
    pO.style.strokeDasharray = String(LO);
    const hd = head(svg);
    const say = writer(code);
    const home = { x: 26, y: 126 }, hs = pH.getPointAtLength(0), os = pO.getPointAtLength(0);
    return (t) => {
      const a = seg(0.03, 0.09, t), b = seg(0.09, 0.27, t), c = seg(0.27, 0.33, t), d = seg(0.33, 0.86, t), e = seg(0.88, 0.96, t);
      pH.style.strokeDashoffset = String(LH * (1 - b));
      pO.style.strokeDashoffset = String(LO * (1 - d));
      fill.setAttribute('opacity', String(0.14 * e));
      let p = home, line = 'G0 X0.0 Y0.0', tr = '';
      if (d > 0) { p = pO.getPointAtLength(LO * d); line = d < 1 ? `G1 X${f1(p.x - 26)} Y${f1(126 - p.y)} S1000 F900  ; 外轮廓` : 'M5  ; 完成'; }
      else if (c > 0) { p = { x: hs.x + (os.x - hs.x) * ease(c), y: hs.y + (os.y - hs.y) * ease(c) }; tr = `M${hs.x} ${hs.y}L${f1(p.x)} ${f1(p.y)}`; line = `G0 X${f1(p.x - 26)} Y${f1(126 - p.y)}`; }
      else if (b > 0) { p = pH.getPointAtLength(LH * b); line = `G1 X${f1(p.x - 26)} Y${f1(126 - p.y)} S1000 F900  ; 内孔先切`; }
      else if (a > 0) { p = { x: home.x + (hs.x - home.x) * ease(a), y: home.y + (hs.y - home.y) * ease(a) }; tr = `M${home.x} ${home.y}L${f1(p.x)} ${f1(p.y)}`; line = `G0 X${f1(p.x - 26)} Y${f1(126 - p.y)}`; }
      travel.setAttribute('d', tr);
      at(hd, p.x, p.y);
      hd.style.opacity = d >= 1 ? '0.35' : '1';
      say(line);
    };
  },
};

// ---------------------------------------------------------------- 2D raster engrave
const engrave: Def = {
  vb: [240, 150], dur: 9, still: 0.95,
  build(svg, code) {
    const cx = 120, cy = 75, R = 54, N = 23, pitch = (2 * R) / N;
    h('rect', { class: 's thin', x: 14, y: 12, width: 212, height: 126, rx: 2 }, svg);
    h('circle', { class: 's thin dash', cx, cy, r: R }, svg);
    const g = h('g', {}, svg);
    const dots: { el: SVGCircleElement; when: number; tone: number }[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = cx - R + (i + 0.5) * pitch, y = cy - R + (j + 0.5) * pitch;
      const dx = (x - cx) / R, dy = (y - cy) / R, rr = dx * dx + dy * dy;
      if (rr > 0.93) continue;
      const nz = Math.sqrt(1 - rr);
      const tone = clamp(1 - (dx * -0.5 + dy * -0.55 + nz * 0.67), 0.06, 1);
      const el = h('circle', { class: 'fi', cx: f1(x), cy: f1(y), r: (0.35 + tone * 2.05).toFixed(2), opacity: 0 }, g);
      const u = (i + 0.5) / N;
      dots.push({ el, tone, when: (j + (j % 2 ? 1 - u : u)) / N });
    }
    dots.sort((a, b) => a.when - b.when);
    const scan = h('path', { class: 's a' }, svg);
    const hd = head(svg);
    const say = writer(code);
    let shown = 0;
    return (t) => {
      const p = seg(0.02, 0.9, t);
      let target = 0;
      while (target < dots.length && dots[target].when <= p) target++;
      if (target < shown) { for (let k = target; k < shown; k++) dots[k].el.setAttribute('opacity', '0'); }
      else for (let k = shown; k < target; k++) dots[k].el.setAttribute('opacity', '1');
      shown = target;
      const row = Math.min(N - 1, Math.floor(p * N)), u = p * N - row;
      const back = row % 2 === 1;
      const x0 = cx - R, x = x0 + (back ? 1 - u : u) * 2 * R, y = cy - R + (row + 0.5) * pitch;
      const done = p >= 1;
      scan.setAttribute('d', done ? '' : `M${back ? x0 + 2 * R : x0} ${f1(y)}H${f1(x)}`);
      at(hd, done ? cx + R + 14 : x, done ? cy + R : y);
      hd.style.opacity = done ? '0.35' : '1';
      const near = dots[Math.max(0, target - 1)];
      const on = Math.hypot(x - cx, y - cy) < R * 0.96;
      say(done ? 'M5  ; 完成' : `G1 X${f1(x - x0)} Y${f1(row * 0.1)} S${on && near ? Math.round(near.tone * 1000) : 0} F6000  ; ${back ? '←' : '→'} 行 ${row + 1}/${N}`);
    };
  },
};

// ---------------------------------------------------------------- 3D relief (section view)
const relief: Def = {
  vb: [240, 150], dur: 9, still: 0.95,
  build(svg, code) {
    const top = 52, step = 12, n = 5, X0 = 16, X1 = 224, B = 134;
    const xl = (k: number) => 58 + k * 12, xr = (k: number) => 182 - k * 12, yy = (k: number) => top + k * step;
    const defs = h('defs', {}, svg);
    const pat = h('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    h('path', { d: 'M0 0V6', stroke: 'currentColor', 'stroke-width': 1, opacity: 0.22 }, pat);
    h('rect', { x: X0, y: top, width: X1 - X0, height: B - top, fill: 'url(#hatch)' }, svg);
    const pocketFill = h('path', { class: 'bgf' }, svg);
    h('path', { class: 's', d: `M${xl(0)} ${top}H${X0}V${B}H${X1}V${top}H${xr(0)}` }, svg);
    const pocket = h('path', { class: 's' }, svg);
    const labels = Array.from({ length: n }, (_, i) => h('text', { x: 196, y: yy(i) + step - 2.5 }, svg, `${i + 1}`));
    h('path', { class: 's h', d: `M30 ${top + 8}V${yy(n) - 2}m-3 -5l3 5l3 -5` }, svg);
    h('text', { x: 36, y: yy(n) - 6 }, svg, 'Z−');
    const beam = h('path', { fill: 'var(--accent)', opacity: 0.18 }, svg);
    const beamLine = h('path', { class: 's a' }, svg);
    const hd = head(svg);
    const say = writer(code);
    return (t) => {
      const p = seg(0.02, 0.9, t) * n;
      const full = Math.min(n, Math.floor(p)), u = p - full, live = full < n;
      const pts: number[][] = [];
      for (let k = 0; k < full; k++) pts.push([xl(k), yy(k)], [xl(k), yy(k + 1)]);
      let bx = xr(n - 1) + 20, by = top - 30;
      if (live) {
        bx = xl(full) + (xr(full) - xl(full)) * u; by = yy(full + 1);
        pts.push([xl(full), yy(full)], [xl(full), by], [bx, by], [bx, yy(full)]);
      }
      for (let k = full - 1; k >= 0; k--) pts.push([xr(k), yy(k + 1)], [xr(k), yy(k)]);
      const d = pts.length ? 'M' + pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join('L') : '';
      pocket.setAttribute('d', d);
      pocketFill.setAttribute('d', d ? d + 'Z' : '');
      labels.forEach((l, i) => (l.style.opacity = i < full ? '0.75' : i === full ? '1' : '0.25'));
      beam.setAttribute('d', live ? `M${f1(bx - 9)} 6H${f1(bx + 9)}L${f1(bx)} ${by}Z` : '');
      beamLine.setAttribute('d', live ? `M${f1(bx - 9)} 6L${f1(bx)} ${by}L${f1(bx + 9)} 6` : '');
      at(hd, bx, by);
      hd.style.opacity = live ? '1' : '0';
      say(live ? `G1 X${f1(bx - xl(0))} Z-${((full + 1) * 0.4).toFixed(2)} S800 F3000  ; 第 ${full + 1}/${n} 遍` : 'M5  ; 完成');
    };
  },
};

// ---------------------------------------------------------------- 3D print (section view)
const print: Def = {
  vb: [240, 150], dur: 10, still: 0.95,
  build(svg, code) {
    const base = 134, lh = 8.5, widths = [118, 126, 130, 128, 120, 106, 88, 66], n = widths.length;
    const total = widths.reduce((a, b) => a + b, 0);
    const ty = base - n * lh;
    h('path', { class: 's', style: 'stroke-width:2.2', d: `M20 ${base}H220` }, svg);
    h('path', { class: 's thin dash', d: `M61 ${base}C52 104 70 ${ty - 4} 120 ${ty - 6}C170 ${ty - 4} 188 104 179 ${base}` }, svg);
    const layers = widths.map((_, i) => h('rect', { class: 's', y: base - (i + 1) * lh, height: lh, rx: lh / 2, width: 0, fill: 'var(--hot)' }, svg));
    h('path', { class: 's h', d: `M30 ${base - 6}V${base - 62}m-3 5l3 -5l3 5` }, svg);
    h('text', { x: 36, y: base - 52 }, svg, 'Z+');
    const count = h('text', { x: 190, y: base - 6 }, svg, '');
    const nozzle = h('g', {}, svg);
    h('path', { class: 's bgf', d: 'M-13 -29h26v12l-9 12h-8l-9 -12Z' }, nozzle);
    h('circle', { class: 'fh', cx: 0, cy: -2, r: 2.6 }, nozzle);
    const say = writer(code);
    return (t) => {
      let len = seg(0.02, 0.9, t) * total, cur = n, u = 1;
      for (let i = 0, acc = 0; i < n; i++) { if (len < acc + widths[i]) { cur = i; u = (len - acc) / widths[i]; break; } acc += widths[i]; }
      let nx = 120 + widths[n - 1] / 2 + 22, ny = ty - 16;
      layers.forEach((r, i) => {
        const w = widths[i], x0 = 120 - w / 2, back = i % 2 === 1;
        const f = i < cur ? 1 : i === cur ? u : 0, cw = Math.max(0, w * f);
        r.setAttribute('width', f1(cw));
        r.setAttribute('x', f1(back ? x0 + w - cw : x0));
        r.style.display = cw < lh ? 'none' : '';
        r.setAttribute('fill-opacity', i === cur ? '0.92' : '0.16');
        r.classList.toggle('h', i === cur);
        if (i === cur) { nx = back ? x0 + w - cw : x0 + cw; ny = base - (i + 1) * lh; }
      });
      at(nozzle, nx, ny);
      const live = cur < n;
      count.textContent = `层 ${Math.min(cur + 1, n)}/${n}`;
      say(live ? `G1 X${f1(nx - 55)} Z${((cur + 1) * 0.2).toFixed(2)} E${(len * 0.033).toFixed(2)} F1800  ; LAYER ${cur + 1}` : 'M104 S0  ; 完成');
    };
  },
};

// ---------------------------------------------------------------- pipeline 1: geometry kernel
const geo: Def = {
  vb: [240, 170], dur: 8, still: 0.1,
  build(svg) {
    const A = [[60, 116], [112, 40], [190, 84], [120, 128]];
    const lines = h('path', { class: 's thin dash' }, svg);
    const curve = h('path', { class: 's' }, svg);
    const circ = h('circle', { class: 's a', cx: 126, cy: 84 }, svg);
    const rad = h('path', { class: 's thin' }, svg);
    const label = h('text', { x: 113, y: 112 }, svg, '');
    const hs = A.flatMap(() => [h('circle', { class: 's h', r: 2.6 }, svg), h('circle', { class: 's h', r: 2.6 }, svg)]);
    A.forEach(([x, y]) => h('rect', { class: 'fi', x: x - 3, y: y - 3, width: 6, height: 6 }, svg));
    return (t) => {
      const w = t * Math.PI * 2;
      const T = A.map((_, i) => {
        const p = A[(i + 3) % 4], q = A[(i + 1) % 4];
        const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + 0.42 * Math.sin(w + i * 1.7);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]) * (0.2 + 0.05 * Math.sin(w * 2 + i));
        return [Math.cos(ang) * len, Math.sin(ang) * len];
      });
      let d = `M${A[0][0]} ${A[0][1]}`, l = '';
      A.forEach((a, i) => {
        const j = (i + 1) % 4, b = A[j];
        d += `C${f1(a[0] + T[i][0])} ${f1(a[1] + T[i][1])} ${f1(b[0] - T[j][0])} ${f1(b[1] - T[j][1])} ${b[0]} ${b[1]}`;
        l += `M${f1(a[0] - T[i][0])} ${f1(a[1] - T[i][1])}L${f1(a[0] + T[i][0])} ${f1(a[1] + T[i][1])}`;
        hs[i * 2].setAttribute('cx', f1(a[0] - T[i][0])); hs[i * 2].setAttribute('cy', f1(a[1] - T[i][1]));
        hs[i * 2 + 1].setAttribute('cx', f1(a[0] + T[i][0])); hs[i * 2 + 1].setAttribute('cy', f1(a[1] + T[i][1]));
      });
      curve.setAttribute('d', d + 'Z');
      lines.setAttribute('d', l);
      const r = 15 + 4 * Math.sin(w);
      circ.setAttribute('r', f1(r));
      rad.setAttribute('d', `M126 84h${f1(r)}`);
      label.textContent = `R${f1(r)}`;
    };
  },
};

// ---------------------------------------------------------------- pipeline 2: nesting
const nest: Def = {
  vb: [240, 170], dur: 8, still: 0.85,
  build(svg) {
    h('rect', { class: 's', x: 14, y: 16, width: 212, height: 132, rx: 2 }, svg);
    const parts = [
      'M22 24H92V52H50V92H22Z', 'M56 58H98V30H126V98H56Z', 'M174 48a22 22 0 1 0 -44 0a22 22 0 1 0 44 0M160 48a8 8 0 1 0 -16 0a8 8 0 1 0 16 0',
      'M180 24H218V86L180 60Z', 'M22 98H50V140H22Z', 'M56 104H118L136 140H56Z', 'M132 78H176L196 98V140H144L124 102Z',
      'M220 104a10 10 0 1 0 -20 0a10 10 0 1 0 20 0', 'M220 128a10 10 0 1 0 -20 0a10 10 0 1 0 20 0',
    ].map((d) => h('path', { class: 's a', d, fill: 'var(--accent)', 'fill-opacity': 0.1 }, svg));
    const boxes = parts.map((p) => p.getBBox());
    h('path', { class: 's thin', d: 'M14 160H226' }, svg);
    const bar = h('path', { class: 's h', style: 'stroke-width:2.4' }, svg);
    const n = parts.length;
    return (t) => {
      const out = 1 - seg(0.94, 1, t);
      let placed = 0;
      parts.forEach((p, i) => {
        const s = (i / n) * 0.72, f = ease(seg(s, s + 0.16, t)), b = boxes[i];
        const cxp = b.x + b.width / 2, cyp = b.y + b.height / 2;
        const rot = (1 - f) * (i % 2 ? 70 : -55), dy = (1 - f) * -(60 + b.y);
        p.setAttribute('transform', `translate(0 ${f1(dy)}) rotate(${f1(rot)} ${f1(cxp)} ${f1(cyp)})`);
        p.style.opacity = String(Math.min(1, f * 3) * out);
        placed += f;
      });
      bar.setAttribute('d', `M14 160H${f1(14 + 212 * 0.86 * (placed / n) * out)}`);
    };
  },
};

// ---------------------------------------------------------------- pipeline 3: toolpath + G-code
const gcode: Def = {
  vb: [240, 170], dur: 7, still: 0.6,
  build(svg) {
    const lines = ['G0 X12 Y8', 'M4 S800', 'G1 X64 F1200', 'G1 Y42', 'G2 X52 Y54 R12', 'G1 X12', 'G1 Y8', 'M5'];
    h('path', { class: 's thin dash', d: 'M34 128H112V72a16 16 0 0 0 -16 -16H34Z' }, svg);
    const trav = h('path', { class: 's thin dash' }, svg);
    const path = h('path', { class: 's a', d: 'M34 128H112V72a16 16 0 0 0 -16 -16H34Z' }, svg);
    const L = path.getTotalLength();
    path.style.strokeDasharray = String(L);
    h('circle', { class: 's thin', cx: 18, cy: 146, r: 3 }, svg);
    h('path', { class: 's thin', d: 'M132 20V150' }, svg);
    const txt = lines.map((l, i) => h('text', { x: 144, y: 38 + i * 14, style: 'font-size:8px' }, svg, l));
    const mark = h('path', { class: 's h', style: 'stroke-width:2' }, svg);
    const hd = head(svg, 'fh');
    const cuts = [78, 56, Math.PI * 8, 62, 72], bounds: number[] = [];
    cuts.reduce((a, c) => (bounds.push((a + c) / 293.13), a + c), 0);
    return (t) => {
      const a = seg(0.03, 0.12, t), c = seg(0.17, 0.88, t);
      let x = 18 + 16 * ease(a), y = 146 - 18 * ease(a), act = 0;
      if (t > 0.12) act = 1;
      if (c > 0) { const p = path.getPointAtLength(L * c); x = p.x; y = p.y; act = 2 + bounds.findIndex((b) => c <= b + 1e-6); }
      if (c >= 1) act = 7;
      path.style.strokeDashoffset = String(L * (1 - c));
      trav.setAttribute('d', `M18 146L${f1(18 + 16 * ease(a))} ${f1(146 - 18 * ease(a))}`);
      at(hd, x, y);
      txt.forEach((el, i) => (el.style.opacity = i === act ? '1' : i < act ? '0.55' : '0.3'));
      mark.setAttribute('d', `M136 ${35.5 + act * 14}h4`);
    };
  },
};

// ---------------------------------------------------------------- pipeline 4: desktop software
const desktop: Def = {
  vb: [240, 170], dur: 12, still: 0.07,
  build(svg) {
    h('rect', { class: 's', x: 14, y: 16, width: 212, height: 138, rx: 4 }, svg);
    h('path', { class: 's', d: 'M14 34H226M74 34V154' }, svg);
    h('circle', { class: 'fh', cx: 25, cy: 25, r: 2.6 }, svg);
    h('circle', { class: 's thin', cx: 35, cy: 25, r: 2.6 }, svg);
    h('circle', { class: 's thin', cx: 45, cy: 25, r: 2.6 }, svg);
    const rows = [38, 28, 34, 32, 32, 22].map((w, i) => h('path', { class: 's', d: `M${i % 3 ? 30 : 24} ${48 + i * 12}h${w}` }, svg));
    h('path', { class: 's thin dash', d: 'M86 124H216M86 100H216M86 76H216M86 52H216M110 40V148M140 40V148M170 40V148M200 40V148' }, svg);
    const backE = h('path', { class: 's a thin' }, svg);
    const cube = h('path', { class: 's a' }, svg);
    const V = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])));
    const E: number[][] = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (V[i].filter((v, k) => v !== V[j][k]).length === 1) E.push([i, j]);
    const tilt = 0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
    return (t) => {
      const a = t * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const P = V.map(([x, y, z]) => {
        const X = x * ca + z * sa, Z = -x * sa + z * ca;
        return [150 + X * 30, 94 + (y * ct - Z * st) * 30, y * st + Z * ct];
      });
      const far = P.reduce((m, p, i) => (p[2] < P[m][2] ? i : m), 0);
      let front = '', back = '';
      for (const [i, j] of E) {
        const s = `M${f1(P[i][0])} ${f1(P[i][1])}L${f1(P[j][0])} ${f1(P[j][1])}`;
        if (i === far || j === far) back += s; else front += s;
      }
      cube.setAttribute('d', front);
      backE.setAttribute('d', back);
      const act = Math.floor(t * 12) % 6;
      rows.forEach((r, i) => { r.style.opacity = i === act ? '1' : '0.4'; r.classList.toggle('h', i === act); });
    };
  },
};

// ---------------------------------------------------------------- approach: three small marks
const chain: Def = {
  vb: [96, 56], dur: 4, still: 0.6,
  build(svg) {
    const xs = [8, 34.7, 61.3, 88];
    h('path', { class: 's thin', d: 'M8 28H88' }, svg);
    const done = h('path', { class: 's h', style: 'stroke-width:2' }, svg);
    const nodes = xs.map((x) => h('rect', { class: 's bgf', x: x - 5, y: 23, width: 10, height: 10 }, svg));
    const hd = head(svg, 'fh');
    return (t) => {
      const x = 8 + 80 * ease(seg(0.05, 0.85, t));
      done.setAttribute('d', `M8 28H${f1(x)}`);
      at(hd, x, 28);
      nodes.forEach((n, i) => n.classList.toggle('h', x >= xs[i] - 0.5));
    };
  },
};
const trade: Def = {
  vb: [96, 56], dur: 9, still: 0.2,
  build(svg) {
    const T = [[48, 5], [14, 51], [82, 51]];
    h('path', { class: 's', d: `M${T[0]}L${T[1]}L${T[2]}Z`.replace(/,/g, ' ') }, svg);
    const spokes = h('path', { class: 's thin dash' }, svg);
    const hd = head(svg, 'fh');
    return (t) => {
      const w = t * Math.PI * 2;
      const b = [1.2 + Math.sin(w), 1.2 + Math.sin(w + 2.1), 1.2 + Math.sin(w + 4.2)], s = b[0] + b[1] + b[2];
      const x = (T[0][0] * b[0] + T[1][0] * b[1] + T[2][0] * b[2]) / s, y = (T[0][1] * b[0] + T[1][1] * b[1] + T[2][1] * b[2]) / s;
      spokes.setAttribute('d', T.map((p) => `M${p[0]} ${p[1]}L${f1(x)} ${f1(y)}`).join(''));
      at(hd, x, y);
    };
  },
};
const reuse: Def = {
  vb: [96, 56], dur: 5, still: 0.7,
  build(svg) {
    const sheets = [2, 1, 0].map((i) => {
      const g = h('g', {}, svg);
      h('rect', { class: `s bgf${i ? ' a' : ''}`, x: 6, y: 8, width: 30, height: 40, rx: 2 }, g);
      h('path', { class: `s thin${i ? ' a' : ''}`, d: 'M12 18h18M12 26h18M12 34h11' }, g);
      return { g, i };
    });
    return (t) => {
      const f = ease(seg(0.1, 0.6, t)) * (1 - ease(seg(0.9, 1, t)));
      sheets.forEach(({ g, i }) => at(g, i * 26 * f, 0));
    };
  },
};

const craft: Def = {
  vb: [96, 56], dur: 6, still: 0.7,
  build(svg) {
    const rows = [14, 26, 38].map((y) => h('path', { class: 's a', d: `M6 ${y}H40`, 'stroke-dasharray': 34 }, svg));
    const layers = [0, 1, 2, 3].map((i) => h('path', { class: 's h', style: 'stroke-width:5', d: `M${58 + i * 2} ${46 - i * 9}H${90 - i * 2}` }, svg));
    const hd = head(svg);
    return (t) => {
      const r = Math.min(2.999, t * 3.4), i = Math.floor(r), f = r - i;
      rows.forEach((el, k) => el.setAttribute('stroke-dashoffset', String(34 * (1 - (k < i ? 1 : k === i ? f : 0)))));
      at(hd, i % 2 ? 40 - 34 * f : 6 + 34 * f, 14 + i * 12);
      layers.forEach((el, k) => (el.style.opacity = String(clamp(t * 5 - k))));
    };
  },
};

// ---------------------------------------------------------------- scope: one continuous production chain
const production: Def = {
  vb: [1000, 330], dur: 15, still: 0.5,
  build(svg) {
    const V = matchMedia('(max-width: 700px)').matches;
    if (V) svg.setAttribute('viewBox', '0 0 360 800');
    const S = [
      ['几何输入', '轮廓 / 网格 / 图像'],
      ['工艺规划', '排样 / 参数 / 约束'],
      ['路径生成', '路径 / G-code'],
      ['设备执行', '运动 / 激光 / 挤出'],
      ['结果验证', '精度 / 质量 / 反馈'],
    ];
    const L = S.map((_, i) => (V
      ? { nx: 16, ny: 36 + i * 150, tx: 40, ty: 20 + i * 150, ix: 214, iy: 6 + i * 150 }
      : { nx: 100 + i * 200, ny: 104, tx: 35 + i * 200, ty: 22, ix: 35 + i * 200, iy: 162 }));
    const N = L.length - 1;
    h('path', { class: 's thin', d: `M${L[0].nx} ${L[0].ny}L${L[N].nx} ${L[N].ny}` }, svg);
    const done = h('path', { class: 's h', style: 'stroke-width:2' }, svg);
    const fb = h('path', { class: 's thin dash', d: V
      ? `M${L[N].ix + 65} ${L[N].iy + 96}V786H4V${L[1].ny}H${L[1].nx - 8}`
      : `M${L[N].nx} ${L[N].iy + 96}V300H${L[1].nx}V${L[1].iy + 100}` }, svg);
    const fbL = fb.getTotalLength();
    h('text', V ? { x: 180, y: 778, style: 'text-anchor:middle;font-size:10px' } : { x: (L[1].nx + L[N].nx) / 2, y: 320, style: 'text-anchor:middle;font-size:11px' }, svg, '结果反馈 → 修正工艺规划');
    const ui = S.map(([title, sub], i) => {
      const l = L[i], g = h('g', {}, svg);
      h('text', { x: l.tx, y: l.ty, style: 'font-size:11px;fill:var(--hot);opacity:1' }, g, `0${i + 1}`);
      h('text', { x: l.tx, y: l.ty + 32, style: `font-family:var(--font);font-size:${V ? 19 : 21}px;font-weight:800;opacity:1` }, g, title);
      h('text', { x: l.tx, y: l.ty + (V ? 54 : 118), style: `font-family:var(--font);font-size:${V ? 11 : 12}px` }, g, sub);
      const node = h('circle', { class: 's bgf', cx: l.nx, cy: l.ny, r: 6 }, svg);
      const d = h('g', { transform: `translate(${l.ix} ${l.iy})` }, g);
      let up: Tick = () => {};
      if (i === 0) {
        const o = h('path', { class: 's a', d: 'M8 78V34H48V14H98A24 24 0 0 1 122 38V78Z' }, d), len = o.getTotalLength();
        o.setAttribute('stroke-dasharray', String(len));
        const hole = h('circle', { class: 's a', cx: 94, cy: 46, r: 10 }, d);
        const pts = [[8, 78], [8, 34], [48, 14], [122, 38], [122, 78]].map(([x, y]) => h('rect', { class: 's bgf', x: x - 3, y: y - 3, width: 6, height: 6 }, d));
        up = (q) => {
          o.setAttribute('stroke-dashoffset', String(len * (1 - q)));
          hole.style.opacity = String(seg(0.7, 1, q));
          pts.forEach((el, k) => (el.style.opacity = String(seg(k / 6, k / 6 + 0.15, q))));
        };
      } else if (i === 1) {
        h('rect', { class: 's thin', x: 2, y: 8, width: 126, height: 76 }, d);
        const parts = [
          h('path', { class: 's a', d: 'M8 14H50V44H30V78H8Z' }, d),
          h('path', { class: 's a', d: 'M56 14H122V40H56Z' }, d),
          h('circle', { class: 's a', cx: 52, cy: 62, r: 14 }, d),
          h('path', { class: 's a', d: 'M74 48H122V78H74Z' }, d),
        ];
        up = (q) => parts.forEach((el, k) => {
          const e = 1 - ease(seg(k * 0.2, k * 0.2 + 0.4, q));
          el.setAttribute('transform', `translate(${f1((k % 2 ? 26 : -18) * e)} ${f1(-30 * e)}) rotate(${f1((k % 2 ? 24 : -18) * e)} 65 46)`);
          el.style.opacity = String(1 - e * 0.85);
        });
      } else if (i === 2) {
        const o = h('path', { class: 's a', d: 'M6 12H124V26H6V40H124V54H6V68H124' }, d), len = o.getTotalLength();
        o.setAttribute('stroke-dasharray', String(len));
        const code = h('text', { x: 6, y: 88, style: 'font-size:9px;opacity:1' }, d, '');
        up = (q) => {
          o.setAttribute('stroke-dashoffset', String(len * (1 - q)));
          const pt = o.getPointAtLength(len * q);
          code.textContent = `G1 X${f1(pt.x)} Y${f1(pt.y)} F900`;
        };
      } else if (i === 3) {
        h('path', { class: 's thin', d: 'M4 84H126' }, d);
        const rows = [0, 1, 2, 3, 4].map((k) => h('path', { class: 's h', style: 'stroke-width:6', d: `M${22 + k * 3} ${76 - k * 9}H${108 - k * 3}`, 'stroke-dasharray': 90 }, d));
        const noz = h('path', { class: 's bgf', d: 'M-9 -22H9V-8L0 0L-9 -8Z' }, d);
        up = (q) => {
          const r = Math.min(4.999, q * 5), k = Math.floor(r), f = r - k, w = 86 - k * 6;
          rows.forEach((el, j) => el.setAttribute('stroke-dashoffset', String(90 - (j < k ? 90 : j === k ? w * f : 0))));
          at(noz, 22 + k * 3 + w * f, 72 - k * 9);
        };
      } else {
        h('path', { class: 's', d: 'M14 80V44H50V28H94A22 22 0 0 1 116 50V80Z' }, d);
        h('path', { class: 's thin', d: 'M14 14V22M116 14V22M14 18H116' }, d);
        const ok = h('path', { class: 's h', style: 'stroke-width:3', d: 'M50 58L62 70L86 44', 'stroke-dasharray': 54 }, d);
        const scan = h('path', { class: 's a thin', d: 'M0 24V84' }, d);
        up = (q) => {
          at(scan, 14 + 102 * ease(seg(0, 0.6, q)), 0);
          scan.style.opacity = q >= 1 ? '0' : '0.8';
          ok.setAttribute('stroke-dashoffset', String(54 * (1 - seg(0.6, 0.95, q))));
        };
      }
      return { g, node, up };
    });
    const pulse = head(svg, 'fh');
    return (t) => {
      const W = 0.17, r = Math.min(4.999, t / W), act = Math.floor(r), u = r - act;
      let x = L[act].nx, y = L[act].ny;
      if (act > 0 && u < 0.2) { const e = ease(u / 0.2); x = L[act - 1].nx + (x - L[act - 1].nx) * e; y = L[act - 1].ny + (y - L[act - 1].ny) * e; }
      done.setAttribute('d', `M${L[0].nx} ${L[0].ny}L${f1(x)} ${f1(y)}`);
      const back = seg(0.87, 0.99, t);
      if (back > 0) { const pt = fb.getPointAtLength(fbL * ease(back)); x = pt.x; y = pt.y; }
      at(pulse, x, y);
      ui.forEach((s, i) => {
        const q = i < act ? 1 : i === act ? seg(0.2, 0.92, u) : 0;
        s.up(q);
        s.g.style.opacity = i === act && back === 0 ? '1' : i < act || back > 0 ? '0.72' : '0.34';
        s.node.classList.toggle('h', i <= act);
      });
    };
  },
};

// ---------------------------------------------------------------- product: camera-aligned multi-process job
const suite: Def = {
  vb: [240, 170], dur: 10, still: 0.9,
  build(svg) {
    h('rect', { class: 's', x: 14, y: 16, width: 212, height: 138, rx: 3 }, svg);
    h('path', { class: 's thin dash', d: 'M58 40H172L196 66V132H74L58 114Z' }, svg);
    const finder = h('path', { class: 's h', d: 'M50 46V32H64M182 32H204V52M204 124V140H186M70 140H50V124' }, svg);
    const scan = h('path', { class: 's h thin', d: 'M0 22V148' }, svg);
    const job = h('g', {}, svg);
    const rows = [0, 1, 2, 3, 4, 5].map((i) => h('path', { class: 's a thin', d: `M12 ${14 + i * 6}H${i % 2 ? 50 : 58}`, 'stroke-dasharray': 46 }, job));
    const pen = h('path', { class: 's', d: 'M12 58q8 -10 16 0t16 0t16 0' }, job), penLen = pen.getTotalLength();
    pen.setAttribute('stroke-dasharray', String(penLen));
    const outline = h('path', { class: 's a', d: 'M0 0H72A10 10 0 0 1 82 10V70H0Z' }, job), len = outline.getTotalLength();
    outline.setAttribute('stroke-dasharray', String(len));
    const hd = head(job);
    return (t) => {
      const seen = seg(0.02, 0.2, t), put = ease(seg(0.22, 0.4, t)), eng = seg(0.42, 0.62, t), draw = seg(0.64, 0.74, t), cutp = seg(0.76, 0.95, t);
      at(scan, 14 + 212 * seen, 0);
      scan.style.opacity = seen > 0 && seen < 1 ? '0.9' : '0';
      finder.style.opacity = String(seen);
      job.setAttribute('transform', `translate(${f1(30 + 54 * put)} ${f1(66 - 16 * put)}) rotate(${f1(-10 * (1 - put))} 41 35)`);
      job.style.opacity = String(0.35 + 0.65 * put);
      rows.forEach((el, i) => el.setAttribute('stroke-dashoffset', String(46 * (1 - clamp(eng * 6 - i)))));
      pen.setAttribute('stroke-dashoffset', String(penLen * (1 - draw)));
      outline.setAttribute('stroke-dashoffset', String(cutp > 0 ? len * (1 - cutp) : 0));
      outline.classList.toggle('dash', cutp === 0);
      outline.setAttribute('stroke-dasharray', cutp > 0 ? String(len) : '3 4');
      let x = 12, y = 14, on = true;
      if (cutp > 0) { const pt = outline.getPointAtLength(len * cutp); x = pt.x; y = pt.y; }
      else if (draw > 0) { const pt = pen.getPointAtLength(penLen * draw); x = pt.x; y = pt.y; }
      else if (eng > 0) { const r = Math.min(5.999, eng * 6), i = Math.floor(r), f = r - i, w = i % 2 ? 38 : 46; x = i % 2 ? 12 + w * (1 - f) : 12 + w * f; y = 14 + i * 6; }
      else on = false;
      at(hd, x, y);
      hd.style.opacity = on && cutp < 1 ? '1' : '0';
    };
  },
};

const all: Record<string, Def> = { cut, engrave, relief, print, geo, nest, gcode, desktop, chain, trade, reuse, craft, production, suite };

export function mountDiagrams(reduced: boolean) {
  const live = new Map<Element, { def: Def; tick: Tick; t0: number; on: boolean }>();
  let raf = 0;
  const frame = (now: number) => {
    raf = 0;
    let any = false;
    live.forEach((a) => {
      if (!a.on) return;
      any = true;
      if (a.t0 < 0) a.t0 = now;
      a.tick((((now - a.t0) / 1000) % a.def.dur) / a.def.dur);
    });
    if (any && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { const a = live.get(e.target); if (a) a.on = e.isIntersecting; });
    kick();
  }, { threshold: 0.15 });
  document.querySelectorAll<HTMLElement>('[data-diagram]').forEach((el) => {
    const def = all[el.dataset.diagram!];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${def.vb[0]} ${def.vb[1]}`);
    svg.setAttribute('aria-hidden', 'true');
    el.appendChild(svg);
    const tick = def.build(svg, el.parentElement!.querySelector<HTMLElement>('[data-code]'));
    tick(def.still);
    live.set(el, { def, tick, t0: -1, on: false });
    if (!reduced) io.observe(el);
  });
  document.addEventListener('visibilitychange', kick);
}
