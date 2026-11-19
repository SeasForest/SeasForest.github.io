const svg = (w: number, h: number, body: string) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true">${body}</svg>`;

function cut() {
  const outer = 'M62 40H152a28 28 0 0 1 28 28V112H100V84H62Z';
  return svg(240, 150, `
    <rect class="s thin" x="14" y="12" width="212" height="126" rx="2"/>
    <path class="s thin dash" d="M56 34H152a34 34 0 0 1 34 34V118H94V90H56Z"/>
    <circle class="s a draw" pathLength="1" cx="152" cy="68" r="11"/>
    <path class="s a draw" pathLength="1" style="transition-delay:.9s" d="${outer}"/>
    <path class="s a" d="M152 68l-7 -8"/>
    <path class="s a" d="M62 40l-10 -10"/>
    <circle class="fa" cx="52" cy="30" r="3.2"/>
    <text x="149.5" y="71">1</text><text x="118" y="36">2</text>
    <text x="20" y="132">割缝补偿</text>
    <path class="s thin" d="M52 127H58M58 127L84 106"/>
  `);
}

function engrave() {
  let dots = '';
  const cx = 120, cy = 75, R = 52, scan = 92;
  for (let j = 0; j < 19; j++) for (let i = 0; i < 19; i++) {
    const x = cx - R + (i + 0.5) * (2 * R / 19), y = cy - R + (j + 0.5) * (2 * R / 19);
    if (Math.hypot(x - cx, y - cy) > R - 1.5 || y > scan) continue;
    const tone = 0.15 + 0.85 * Math.pow((i / 18) * 0.75 + (1 - j / 18) * 0.25, 1.2);
    dots += `<circle class="fi" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + tone * 2.3).toFixed(2)}"/>`;
  }
  return svg(240, 150, `
    <rect class="s thin" x="14" y="12" width="212" height="126" rx="2"/>
    <circle class="s thin dash" cx="${cx}" cy="${cy}" r="${R}"/>
    <g class="pop" style="transition-delay:.2s">${dots}</g>
    <path class="s a draw" pathLength="1" d="M40 ${scan + 3}H200"/>
    <path class="s a" d="M194 ${scan - 1}l6 4l-6 4"/>
    <circle class="fa" cx="140" cy="${scan + 3}" r="3.2"/>
    <path class="s thin" d="M40 ${scan + 9}H200M40 ${scan + 15}H200"/>
    <text x="204" y="${scan + 5.5}">→</text><text x="204" y="${scan + 11.5}">←</text>
    <text x="20" y="132">浅 → 深</text>
  `);
}

function relief() {
  const top = 56, step = 11, n = 5;
  let d = `M16 ${top}H65`;
  for (let i = 0; i < n; i++) d += `v${step}h11`;
  d += 'h0';
  for (let i = 0; i < n; i++) d += `h11v${-step}`;
  d += `H224V134H16Z`;
  let passes = '';
  for (let i = 1; i <= n; i++) passes += `<path class="s thin dash" d="M${65 + i * 11} ${top + i * step}H${175 - i * 11}"/><text x="186" y="${top + i * step + 2.5}" style="opacity:${i <= 3 ? 0.7 : 0.3}">第 ${i} 遍</text>`;
  return svg(240, 150, `
    <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V6" stroke="currentColor" stroke-width="1" opacity=".22"/></pattern></defs>
    <path d="${d}" fill="url(#hatch)"/>
    <path class="s draw" pathLength="1" d="${d}"/>
    ${passes}
    <path d="M100 8H124L113 ${top + 3 * step}Z" fill="var(--accent)" opacity=".16"/>
    <path class="s a" d="M100 8L113 ${top + 3 * step}L124 8"/>
    <circle class="fa" cx="113" cy="${top + 3 * step}" r="3.2"/>
    <path class="s h" d="M30 ${top + 6}V${top + n * step}m-3 -5l3 5l3 -5"/><text x="36" y="${top + n * step - 12}">Z−</text>
  `);
}

function print() {
  const base = 132, lh = 8.5;
  const widths = [118, 126, 130, 128, 120, 106, 88, 66];
  let layers = '';
  widths.forEach((w, i) => {
    const y = base - (i + 1) * lh;
    const last = i === widths.length - 1;
    const x = 120 - w / 2;
    layers += `<rect class="s ${last ? 'h' : ''}" x="${x}" y="${y}" width="${last ? w * 0.55 : w}" height="${lh}" rx="${lh / 2}" ${last ? 'fill="var(--hot)" fill-opacity=".9"' : 'fill="var(--hot)" fill-opacity=".14"'} style="transition:opacity .4s ${0.15 + i * 0.12}s" />`;
  });
  const ty = base - widths.length * lh;
  const nx = 120 - 33 + 66 * 0.55;
  return svg(240, 150, `
    <path class="s" style="stroke-width:2.2" d="M20 ${base}H220"/>
    <path class="s thin dash" d="M61 ${base}C52 100 70 ${ty - 26} 120 ${ty - 30}C170 ${ty - 26} 188 100 179 ${base}"/>
    <g class="pop" style="transition-delay:.1s">${layers}</g>
    <path class="s" d="M${nx - 13} ${ty - 30}h26v12l-9 12h-8l-9 -12Z" fill="var(--bg)"/>
    <circle class="fh" cx="${nx}" cy="${ty - 3}" r="2.6"/>
    <path class="s h" d="M30 ${base - 6}V${base - 62}m-3 5l3 -5l3 5"/><text x="36" y="${base - 52}">Z+</text>
    <text x="186" y="${base - 6}">层 1</text><text x="186" y="${ty + 6}">层 ${widths.length}</text>
  `);
}

function geo() {
  const p = 'M58 118C30 82 62 34 112 40S190 46 190 86S150 138 118 124S78 140 58 118Z';
  const nodes = [[58, 118], [112, 40], [190, 86], [118, 124]];
  return svg(240, 170, `
    <path class="s thin dash" d="M58 118L30 82M112 40L62 34M112 40L162 46M190 86V46M190 86V126M118 124L150 138M118 124L86 110"/>
    <path class="s draw" pathLength="1" d="${p}"/>
    <circle class="s a" cx="128" cy="84" r="17"/>
    <path class="s thin" d="M128 84h17"/><text x="131" y="80">R</text>
    ${nodes.map(([x, y]) => `<rect class="fi" x="${x - 3}" y="${y - 3}" width="6" height="6"/>`).join('')}
    ${[[30, 82], [62, 34], [162, 46], [190, 46], [190, 126], [150, 138], [86, 110]].map(([x, y]) => `<circle class="s h" cx="${x}" cy="${y}" r="2.6"/>`).join('')}
  `);
}

function nest() {
  return svg(240, 170, `
    <rect class="s" x="14" y="16" width="212" height="138" rx="2"/>
    <g class="pop" style="transition-delay:.2s">
      <path class="s a" d="M22 24H92V52H50V94H22Z"/>
      <path class="s a" d="M56 58H98V30H126V100H56Z"/>
      <circle class="s a" cx="152" cy="50" r="22"/>
      <circle class="s a" cx="152" cy="50" r="8"/>
      <path class="s a" d="M180 24H218V86L180 60Z"/>
      <path class="s a" d="M22 100H50V146H22Z"/>
      <path class="s a" d="M56 106H118L138 146H56Z"/>
      <path class="s a" d="M132 80H176L196 100V146H146L124 104Z"/>
      <circle class="s a" cx="210" cy="104" r="10"/>
      <circle class="s a" cx="210" cy="132" r="10"/>
    </g>
    <path class="s thin dash" d="M14 154H226"/>
  `);
}

function gcode() {
  const lines = ['G0 X12.0 Y8.5', 'M4 S800', 'G1 X64.0 F1200', 'G1 Y42.0', 'G2 X52.0 Y54.0 R12', 'G1 X12.0', 'G1 Y8.5', 'M5'];
  return svg(240, 170, `
    <path class="s thin dash" d="M18 146L34 128"/>
    <path class="s a draw" pathLength="1" d="M34 128H112V72a16 16 0 0 0 -16 -16H34Z"/>
    <path class="s a" d="M70 124l7 4l-7 4M108 96l4 -7l4 7M66 60l-7 -4l7 -4M30 92l4 7l4 -7"/>
    <circle class="fh" cx="34" cy="128" r="3.4"/>
    <circle class="s thin" cx="18" cy="146" r="3"/>
    <text x="10" y="160">原点</text>
    <path class="s thin" d="M132 20V150"/>
    ${lines.map((l, i) => `<text x="142" y="${36 + i * 14}" style="opacity:${i === 4 ? 1 : 0.6};font-size:8px">${l}</text>`).join('')}
    <path class="s h" d="M136 89h3"/>
  `);
}

function desktop() {
  return svg(240, 170, `
    <rect class="s" x="14" y="16" width="212" height="138" rx="4"/>
    <path class="s" d="M14 34H226M74 34V154"/>
    <circle class="fh" cx="25" cy="25" r="2.6"/><circle class="s thin" cx="35" cy="25" r="2.6"/><circle class="s thin" cx="45" cy="25" r="2.6"/>
    <path class="s thin" d="M24 48H62M30 60H58M30 72H64M24 84H56M30 96H62M30 108H52"/>
    <path class="s thin dash" d="M86 124H216M86 100H216M86 76H216M86 52H216M110 40V148M140 40V148M170 40V148M200 40V148"/>
    <path class="s a draw" pathLength="1" d="M104 126V70L140 52L186 70V126Z"/>
    <path class="s a" d="M104 70L150 88L186 70M150 88V142L104 126M150 142L186 126"/>
    <path class="s thin" d="M82 142H222"/>
  `);
}

const all: Record<string, () => string> = { cut, engrave, relief, print, geo, nest, gcode, desktop };

export function mountDiagrams() {
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
    { threshold: 0.35 },
  );
  document.querySelectorAll<HTMLElement>('[data-diagram]').forEach((el) => {
    el.innerHTML = all[el.dataset.diagram!]();
    io.observe(el);
  });
}
