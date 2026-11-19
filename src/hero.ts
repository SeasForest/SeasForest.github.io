import * as THREE from 'three';
import fontUrl from '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url';
import { buildWord, loadFont, pointAt, sampleDist, type WordGeo } from './geometry';
import { fragmentShader, vertexShader } from './shaders';

export const MODES = ['cut', 'engrave', 'relief', 'print'] as const;
export type Mode = (typeof MODES)[number];

export interface HudState {
  mode: number;
  progress: number;
  x: number;
  y: number;
  z: number;
  line: string | null; // new g-code line, if any
  status: string;
}

const DUR = [7.5, 7, 9, 10];
const HOLD = 2.6;
const TILT = [0.06, 0.06, 0.62, 0.98];
const MM = 20; // mm per world unit
const hex = (h: number) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

export class Hero {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  private mesh?: THREE.Mesh;
  private mat?: THREE.ShaderMaterial;
  private geo?: WordGeo;
  private font: any;
  private nozzle = new THREE.Group();
  private beam: THREE.Mesh;
  private rulers = new THREE.Group();
  private mode = 0;
  private p = [0, 0, 0, 0];
  private a = [1, 0, 0, 0];
  private hold = 0;
  private delay = 0.5;
  private tilt = TILT[0];
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();
  private last = 0;
  private time = 0;
  private running = false;
  private visible = true;
  private twoLine = false;
  private lastLineAt = 0;
  private lastKey = '';
  private extr = 0;
  private fixed: number | null = null;
  auto = true;
  onHud: (s: HudState) => void = () => {};
  onMode: (m: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, private stage: HTMLElement, private reduced: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.camera.up.set(0, 1, 0);

    // nozzle
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.85, roughness: 0.35 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.5 });
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 6), brass);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = 0.1;
    const hexn = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 6), brass);
    hexn.rotation.x = Math.PI / 2;
    hexn.position.z = 0.25;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.26), steel);
    block.position.z = 0.43;
    this.nozzle.add(tip, hexn, block);
    this.nozzle.visible = false;
    this.scene.add(this.nozzle);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dl = new THREE.DirectionalLight(0xffffff, 2.6);
    dl.position.set(-3, -4, 6);
    this.scene.add(dl);

    // laser beam
    const bg = new THREE.CylinderGeometry(0.012, 0.03, 3, 8, 1, true);
    bg.rotateX(Math.PI / 2);
    bg.translate(0, 0, 1.5);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x1d4dff, transparent: true, opacity: 0.55, depthWrite: false }));
    this.beam.visible = false;
    this.scene.add(this.beam);
    this.scene.add(this.rulers);

    const q = new URLSearchParams(location.search);
    if (q.has('mode')) {
      this.mode = Math.max(0, Math.min(3, Number(q.get('mode'))));
      this.a = [0, 0, 0, 0];
      this.a[this.mode] = 1;
      this.tilt = TILT[this.mode];
    }
    if (q.has('p')) {
      this.fixed = Number(q.get('p'));
      this.auto = false;
    }

    window.addEventListener('pointermove', (e) => {
      const r = this.stage.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    });
    new ResizeObserver(() => this.resize()).observe(this.stage);
    new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
      if (this.visible) this.kick();
    }).observe(this.stage);
    document.addEventListener('visibilitychange', () => this.kick());
  }

  async init() {
    this.font = await loadFont(fontUrl);
    this.resize(true);
    if (this.reduced && this.fixed === null) {
      this.p = [1, 1, 1, 1];
      this.auto = false;
    }
    this.onMode(this.mode);
    this.kick();
  }

  setMode(m: number, user = false) {
    if (m === this.mode && !user) return;
    this.mode = m;
    this.p[m] = this.reduced ? 1 : 0;
    this.hold = 0;
    this.delay = 0.45;
    this.lastKey = '';
    this.extr = 0;
    this.onMode(m);
    this.kick();
  }

  private build() {
    const w = this.stage.clientWidth;
    const small = w < 760;
    const lines = this.twoLine ? ['SEAS', 'FOREST'] : ['SEAS FOREST'];
    const texW = small ? 1024 : 2048;
    const geo = (this.geo = buildWord(this.font, lines, texW, this.twoLine ? 7.4 : 10));
    const N = geo.texW * geo.texH;
    const data = new Uint16Array(N * 2);
    for (let i = 0; i < N; i++) {
      data[i * 2] = THREE.DataUtils.toHalfFloat(geo.dist[i]);
      data[i * 2 + 1] = THREE.DataUtils.toHalfFloat(geo.time[i]);
    }
    const tex = new THREE.DataTexture(data, geo.texW, geo.texH, THREE.RGFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    const segX = small ? 620 : 1150;
    const segY = Math.round((segX * geo.rect.h) / geo.rect.w);
    const pg = new THREE.PlaneGeometry(geo.rect.w, geo.rect.h, segX, segY);
    pg.translate(geo.rect.x + geo.rect.w / 2, geo.rect.y + geo.rect.h / 2, 0);

    let maxIn = 0;
    for (let i = 0; i < N; i += 7) maxIn = Math.max(maxIn, -geo.dist[i]);

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mat!.uniforms.uField.value as THREE.Texture).dispose();
      this.mat!.dispose();
    }
    this.mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uField: { value: tex },
        uRect: { value: new THREE.Vector4(geo.rect.x, geo.rect.y, geo.rect.w, geo.rect.h) },
        uBox: { value: new THREE.Vector4(geo.bbox.x0, geo.bbox.y0, geo.bbox.x1, geo.bbox.y1) },
        uA: { value: new THREE.Vector4(...this.a) },
        uP: { value: new THREE.Vector4(...this.p) },
        uScan: { value: new THREE.Vector4(0, 0, 0.1, 1) },
        uCell: { value: geo.rect.w / segX },
        uTexel: { value: geo.rect.w / geo.texW },
        uDepth: { value: Math.min(0.2, maxIn * 1.0) },
        uBg: { value: hex(0xe2e3e0) },
        uInk: { value: hex(0x16181b) },
        uLaser: { value: hex(0x1d4dff) },
        uHot: { value: hex(0xff5310) },
        uLight: { value: new THREE.Vector3(-0.5, 0.5, 0.7) },
        uHead: { value: new THREE.Vector3() },
        uHeadOn: { value: 0 },
        uNozzle: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(pg, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.buildRulers();
  }

  private buildRulers() {
    const g = this.geo!;
    this.rulers.clear();
    const pts: number[] = [];
    const ox = g.bbox.x0 - 0.35;
    const oy = g.bbox.y0 - 0.35;
    const xe = g.bbox.x1 + 0.2;
    const ye = g.bbox.y1 + 0.2;
    pts.push(ox, oy, 0, xe, oy, 0, ox, oy, 0, ox, ye, 0);
    const step = 10 / MM; // every 10 mm
    for (let x = ox, i = 0; x <= xe; x += step / 2, i++) pts.push(x, oy, 0, x, oy - (i % 2 ? 0.05 : 0.1), 0);
    for (let y = oy, i = 0; y <= ye; y += step / 2, i++) pts.push(ox, y, 0, ox - (i % 2 ? 0.05 : 0.1), y, 0);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.rulers.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x16181b, transparent: true, opacity: 0.38 })));
    const zg = new THREE.BufferGeometry();
    const zp = [ox, oy, 0, ox, oy, 0.9];
    for (let z = 0.25; z <= 0.9; z += 0.25) zp.push(ox, oy, z, ox - 0.07, oy, z);
    zg.setAttribute('position', new THREE.Float32BufferAttribute(zp, 3));
    const zl = new THREE.LineSegments(zg, new THREE.LineBasicMaterial({ color: 0xff5310, transparent: true, opacity: 0.9 }));
    zl.name = 'z';
    this.rulers.add(zl);
  }

  private resize(force = false) {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h || !this.font) return;
    const two = w / h < 1.75;
    if (force || two !== this.twoLine || !this.mesh) {
      this.twoLine = two;
      this.build();
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  private kick() {
    if (this.running || document.hidden || !this.visible || !this.mat) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (document.hidden || !this.visible) {
      this.running = false;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    const g = this.geo!;
    const u = this.mat!.uniforms;
    const m = this.mode;

    // presence + progress
    const k = 1 - Math.exp(-dt / 0.28);
    for (let i = 0; i < 4; i++) {
      this.a[i] += ((i === m ? 1 : 0) - this.a[i]) * k;
      if (i !== m && this.a[i] < 0.004) { this.a[i] = 0; this.p[i] = 0; }
    }
    if (this.fixed !== null) {
      this.p[m] = this.fixed;
    } else if (this.delay > 0) {
      this.delay -= dt;
    } else if (this.p[m] < 1) {
      this.p[m] = Math.min(1, this.p[m] + dt / DUR[m]);
    } else if (this.auto) {
      this.hold += dt;
      if (this.hold > HOLD) this.setMode((m + 1) % 4);
    }
    const p = this.p[m];
    const busy = p > 0 && p < 1;

    // tool head
    let hx = 0, hy = 0, hz = 0, on = 0, key = '', status = '';
    let line: string | null = null;
    const bx0 = g.bbox.x0, bx1 = g.bbox.x1, by0 = g.bbox.y0, by1 = g.bbox.y1;
    const mm = (v: number, o: number) => ((v - o) * MM).toFixed(2);
    if (m === 0) {
      const r = pointAt(g, p * g.totalLen);
      hx = r.p[0]; hy = r.p[1]; on = busy ? 1 : 0;
      key = 'c' + r.ci;
      status = `轮廓 ${Math.min(r.ci + 1, g.contours.length)}/${g.contours.length}${g.contours[r.ci].hole ? ' · 内孔先切' : ''}`;
      if (busy) line = key !== this.lastKey ? `G0 X${mm(hx, bx0)} Y${mm(hy, by0)}  ; ${g.contours[r.ci].hole ? 'inner' : 'outer'}` : `G1 X${mm(hx, bx0)} Y${mm(hy, by0)} S1000 F900`;
    } else if (m === 1 || m === 2) {
      const passes = m === 2 ? 6 : 1;
      const rows = m === 2 ? 34 : 64;
      const pp = Math.min(p, 0.99999) * passes;
      const pass = Math.floor(pp);
      const fr = (pp - pass) * rows;
      const row = Math.floor(fr);
      const f = fr - row;
      const lh = (by1 - by0 + 0.1) / rows;
      const dir = row % 2 === 0 ? 1 : -1;
      hy = by1 + 0.05 - (row + 0.5) * lh;
      hx = dir > 0 ? bx0 - 0.1 + f * (bx1 - bx0 + 0.2) : bx1 + 0.1 - f * (bx1 - bx0 + 0.2);
      u.uScan.value.set(hx, hy, lh, dir);
      const d = sampleDist(g, hx, hy);
      on = busy && d < 0 ? 1 : 0;
      const depth = (u.uDepth.value as number) * MM;
      hz = m === 2 ? -(depth * (pass + 1)) / passes / MM : 0;
      key = (m === 1 ? 'e' : 'r') + pass + '.' + row;
      const s = on ? Math.round(m === 1 ? 300 + 650 * ((hx - bx0) / (bx1 - bx0)) : 1000) : 0;
      status = m === 1 ? `行 ${row + 1}/${rows} · ${dir > 0 ? '→' : '←'} 双向` : `第 ${pass + 1}/${passes} 遍 · Z ${(hz * MM).toFixed(2)}`;
      if (busy) {
        if (key !== this.lastKey) line = m === 2 && row === 0 ? `; pass ${pass + 1}/${passes}  Z${(hz * MM).toFixed(2)}` : `G0 X${mm(hx, bx0)} Y${mm(hy, by0)}`;
        else line = `G1 X${mm(hx, bx0)} S${s}${m === 2 ? ' F3000' : ' F6000'}`;
      }
    } else {
      const layers = 12;
      const lh = 0.036;
      const pp = Math.min(p, 0.99999) * layers;
      const layer = Math.floor(pp);
      const f = pp - layer;
      hx = bx0 - 0.05 + f * (bx1 - bx0 + 0.1);
      const tri = Math.abs(((f * 46) % 2) - 1);
      hy = by0 + tri * (by1 - by0);
      hz = (layer + 1) * lh;
      const d = sampleDist(g, hx, hy);
      on = busy && d < 0 ? 1 : 0;
      if (on) this.extr += dt * 2.4;
      key = 'p' + layer;
      status = `层 ${layer + 1}/${layers} · 层高 ${(lh * MM).toFixed(2)}`;
      if (busy) line = key !== this.lastKey ? `;LAYER:${layer + 1}  Z${(hz * MM).toFixed(2)}` : on ? `G1 X${mm(hx, bx0)} Y${mm(hy, by0)} E${this.extr.toFixed(3)}` : `G0 X${mm(hx, bx0)} Y${mm(hy, by0)}`;
    }
    if (!busy) { hz = 0; status = p >= 1 ? '完成' : '就绪'; }

    u.uA.value.set(this.a[0], this.a[1], this.a[2], this.a[3]);
    u.uP.value.set(this.p[0], this.p[1], this.p[2], this.p[3]);
    u.uHead.value.set(hx, hy, hz);
    u.uHeadOn.value = m < 3 ? on : 0;
    u.uNozzle.value = m === 3 && busy ? 1 : 0;
    u.uTime.value = this.time;

    this.beam.visible = m < 3 && on > 0;
    this.beam.position.set(hx, hy, hz);
    this.nozzle.visible = m === 3 && busy;
    this.nozzle.position.set(hx, hy, hz);
    const zr = this.rulers.getObjectByName('z') as THREE.LineSegments | undefined;
    if (zr) (zr.material as THREE.LineBasicMaterial).opacity = Math.min(1, (this.a[2] + this.a[3]) * 1.2) * 0.9;

    // camera: plan view for 2D, swings down to show depth for 3D
    this.pointerS.lerp(this.pointer, 1 - Math.exp(-dt / 0.25));
    this.tilt += (TILT[m] - this.tilt) * (1 - Math.exp(-dt / 0.55));
    const tilt = Math.max(0, this.tilt - this.pointerS.y * 0.07);
    const az = this.pointerS.x * 0.1 * Math.min(1, this.tilt * 2 + 0.3);
    const fov = (this.camera.fov * Math.PI) / 180;
    const tw = (bx1 - bx0) / 2 + 0.75;
    const th = (by1 - by0) / 2 + 0.6;
    const dist = Math.max(tw / (Math.tan(fov / 2) * this.camera.aspect), th / Math.tan(fov / 2));
    const lift = 0.16 * Math.min(1, this.tilt);
    this.camera.position.set(dist * Math.sin(tilt) * Math.sin(az), -dist * Math.sin(tilt) * Math.cos(az), dist * Math.cos(tilt) + lift);
    this.camera.lookAt(0, 0, lift);
    u.uLight.value.set(-0.5 + this.pointerS.x * 0.35, 0.5 + this.pointerS.y * 0.3, 0.7);

    // hud
    let out: string | null = null;
    if (line && (key !== this.lastKey || this.time - this.lastLineAt > 0.13)) {
      out = line;
      this.lastLineAt = this.time;
    }
    this.lastKey = key;
    this.onHud({ mode: m, progress: p, x: (hx - bx0) * MM, y: (hy - by0) * MM, z: hz * MM, line: out, status });
  }
}
