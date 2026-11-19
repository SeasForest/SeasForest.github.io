// Height field shared by the vertex and fragment stage.
// uA = presence of each process (cut, engrave, relief, print), uP = its progress 0..1.
const common = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uRect;      // x, y, w, h of the field in world units
uniform vec4 uBox;       // text bbox: left, bottom, right, top
uniform vec4 uA;
uniform vec4 uP;
uniform vec4 uScan;      // head x, line y, line height, direction
uniform float uCell;     // world size of one mesh cell

const float R_SLOPE = 1.15;
const float R_PASSES = 6.0;
const float P_LAYERS = 12.0;
const float P_LH = 0.036;
const float P_BASE = 0.25;
const float P_CHAMFER = 1.6;

vec2 wuv(vec2 w) { return (w - uRect.xy) / uRect.zw; }

float rasterDone(vec2 w) {
  float above = step(uScan.y + uScan.z * 0.5, w.y);
  float inLine = step(uScan.y - uScan.z * 0.5, w.y) * (1.0 - above);
  float passed = uScan.w > 0.0 ? step(w.x, uScan.x) : step(uScan.x, w.x);
  return above + inLine * passed;
}

float hRelief(float d, vec2 w, float depth) {
  float target = -min(max(-d, 0.0) * R_SLOPE, depth);
  float pp = min(uP.z, 0.99999) * R_PASSES;
  float k = floor(pp);
  float done = uP.z >= 1.0 ? R_PASSES : k + rasterDone(w);
  return max(target, -depth * done / R_PASSES);
}

float hPrint(float d, vec2 w) {
  float inside = smoothstep(uCell * 0.6, -uCell * 0.6, d);
  float tgt = min(P_LAYERS * P_LH, P_BASE + max(-d, 0.0) * P_CHAMFER);
  float q = floor(tgt / P_LH + 0.001) * P_LH;
  float pp = min(uP.w, 0.99999) * P_LAYERS;
  float k = floor(pp);
  float f = pp - k;
  float sweep = mix(uBox.x - 0.05, uBox.z + 0.05, f);
  float done = uP.w >= 1.0 ? P_LAYERS : k + step(w.x, sweep);
  return inside * min(q, done * P_LH);
}

uniform float uDepth;

float heightAt(vec2 w) {
  float d = texture(uField, wuv(w)).r;
  float h = 0.0;
  if (uA.z > 0.001) h += uA.z * hRelief(d, w, uDepth);
  if (uA.w > 0.001) h += uA.w * hPrint(d, w);
  return h;
}
`;

export const vertexShader = /* glsl */ `
${common}
varying vec3 vWorld;
void main() {
  vec3 p = position;
  p.z = heightAt(p.xy);
  vWorld = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
${common}
varying vec3 vWorld;
uniform vec3 uBg;
uniform vec3 uInk;
uniform vec3 uLaser;
uniform vec3 uHot;
uniform vec3 uLight;
uniform vec3 uHead;
uniform float uHeadOn;   // laser firing
uniform float uNozzle;   // nozzle extruding
uniform float uTexel;    // world size of one texel
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 w = vWorld.xy;
  vec2 f = texture(uField, wuv(w)).rg;
  float d = f.r;
  float t = f.g;
  float aa = fwidth(d) * 0.75 + 1e-5;
  vec3 col = uBg;
  float z = vWorld.z;

  // ---------- relief / print geometry terms
  float e = uTexel * 1.5;
  vec3 n = vec3(0.0, 0.0, 1.0);
  float lit = 1.0;
  float spec = 0.0;
  if (uA.z + uA.w > 0.001) {
    float hx = heightAt(w + vec2(e, 0.0)) - heightAt(w - vec2(e, 0.0));
    float hy = heightAt(w + vec2(0.0, e)) - heightAt(w - vec2(0.0, e));
    vec3 nG = normalize(vec3(-hx, -hy, 2.0 * e));
    vec3 nF = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (nF.z < 0.0) nF = -nF;
    float printed = step(0.0005, z) * step(0.5, uA.w);
    n = normalize(mix(nG, nF, printed));
    vec3 L = normalize(uLight);
    float ndl = max(dot(n, L), 0.0) / L.z;
    // height-field shadow marched towards the light
    float sh = 0.0;
    vec2 ldir = normalize(L.xy);
    float rise = L.z / length(L.xy);
    for (int i = 1; i <= 8; i++) {
      float s = float(i) * 0.028;
      float hh = heightAt(w + ldir * s);
      sh = max(sh, smoothstep(0.0, 0.03, hh - (z + s * rise)) * (1.0 - float(i) / 11.0));
    }
    lit = (0.45 + 0.55 * min(ndl, 1.3)) * mix(1.0, 0.55, sh);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(L + V);
    spec = pow(max(dot(n, H), 0.0), 48.0) * smoothstep(0.0, 0.06, 1.0 - n.z) * (1.0 - sh);
  }

  // ---------- 01 cut: kerf follows the real contour order
  if (uA.x > 0.001) {
    float rev = step(t, uP.x);
    float kerf = smoothstep(0.017 + aa, 0.017 - aa, abs(d)) * rev;
    float heat = exp(-abs(d) / 0.035) * rev;
    vec3 tint = mix(vec3(0.62, 0.56, 0.44), vec3(0.30, 0.36, 0.60), smoothstep(0.25, 0.9, heat));
    col = mix(col, tint, heat * 0.34 * uA.x);
    col = mix(col, uInk, kerf * uA.x);
  }

  // ---------- 02 engrave: bidirectional raster, halftone carries the grey levels
  if (uA.y > 0.001) {
    float inside = smoothstep(aa, -aa, d);
    float done = uP.y >= 1.0 ? 1.0 : rasterDone(w);
    float tone = clamp(0.30 + 0.62 * ((w.x - uBox.x) / (uBox.z - uBox.x)) + 0.16 * sin(w.y * 2.2 + w.x * 0.9), 0.12, 0.96);
    mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
    vec2 g = rot * w * 26.0;
    float r = length(fract(g) - 0.5);
    float rad = sqrt(tone) * 0.66;
    float aw = fwidth(g.x) * 0.9;
    float dotm = smoothstep(rad + aw, rad - aw, r);
    float line = 0.9 + 0.1 * sin(w.y * 420.0);
    col = mix(col, uInk * 1.15, inside * done * dotm * line * 0.94 * uA.y);
  }

  // ---------- 03 relief: carved surface
  if (uA.z > 0.001 && z < -0.0005) {
    float depth = clamp(-z / max(uDepth, 1e-4), 0.0, 1.0);
    vec3 carved = uBg * (1.0 - 0.20 * depth) * vec3(1.0, 0.985, 0.95);
    carved *= 0.97 + 0.03 * sin(w.y * 300.0);
    col = mix(col, carved, uA.z);
  }

  // ---------- 04 print: filament
  if (uA.w > 0.001 && z > 0.0005) {
    vec3 fil = uHot;
    float wall = smoothstep(0.92, 0.6, n.z);
    float lines = 0.5 + 0.5 * cos(6.28318 * z / P_LH);
    fil *= 1.0 - 0.22 * wall * smoothstep(0.35, 1.0, lines);
    float parity = mod(floor(z / P_LH + 0.5), 2.0);
    float stripe = 0.5 + 0.5 * sin((w.x + (parity > 0.5 ? w.y : -w.y)) * 150.0);
    fil *= 1.0 - 0.10 * (1.0 - wall) * stripe;
    float hotness = uNozzle * exp(-length(w - uHead.xy) / 0.22);
    fil = mix(fil, vec3(1.0, 0.80, 0.36), hotness * 0.75);
    col = mix(col, fil, smoothstep(0.0005, 0.006, z) * uA.w);
  } else if (uA.w > 0.001) {
    // contact shadow on the plate
    float grown = clamp(uP.w * 1.4, 0.0, 1.0);
    col *= 1.0 - 0.20 * uA.w * grown * exp(-max(d, 0.0) / 0.05);
  }

  col *= lit;
  col += spec * (z > 0.0005 ? vec3(0.55, 0.4, 0.3) : vec3(0.22));

  // ---------- laser spot
  if (uHeadOn > 0.001) {
    float r = length(w - uHead.xy);
    float flick = 0.85 + 0.15 * hash(vec2(uTime * 60.0, 1.0));
    float bloom = exp(-r / 0.11) * uHeadOn * flick;
    float core = exp(-r * r / 0.0011) * uHeadOn;
    col = mix(col, uLaser, clamp(bloom * 0.85, 0.0, 1.0));
    col = mix(col, vec3(1.0), clamp(core * 1.2, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
