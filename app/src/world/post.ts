// GLOB LABS pixel render pipeline (after the user's own games' post.ts): a clean PS2-style
// image. The world renders at a LOW internal resolution (~440 px tall), then
//
//   scene (HDR + depth) ─┬─ ink mask (aliens only: ink colour + view depth)
//                        └─ tight bloom (only real light sources: threshold 1.6, 3 small mips)
//   → screen-space ink outline (1 low-res px, only where an alien silhouette sits in front)
//   → soft-shoulder tonemap (colours stay saturated) + light grade + light vignette
//   → exact-integer NEAREST upscale to the canvas (every pixel a crisp k×k block)
//
// No film grain, no chromatic aberration, no dither speckle, no halos.
import * as THREE from 'three';

export const POST = {
  uExposure: { value: 1.0 },
  uSaturation: { value: 1.07 },
  uContrast: { value: 1.06 },
  uVignette: { value: 0.24 },
  uBloom: { value: 0.32 },
  uBloomThreshold: { value: 1.6 },
  uSplit: { value: 0.08 },
  uSplitLo: { value: new THREE.Color('#1d3a66') },
  uSplitHi: { value: new THREE.Color('#ffd0a0') },
  /** red alarm wash 0..1 (critical fuel) */
  uAlarm: { value: 0 },
  uInkOn: { value: 1 },
};

const VS = /* glsl */ `out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform float uThreshold;
void main() {
  vec3 c = texture(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold * 1.6, l), 1.0);
}`;
const DOWN_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(tSrc, vUv).rgb * 4.0;
  s += texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture(tSrc, vUv + vec2(t.x, t.y)).rgb;
  fragColor = vec4(s / 8.0, 1.0);
}`;
const UP_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 s = texture(tSrc, vUv).rgb * 4.0;
  s += (texture(tSrc, vUv + vec2(-t.x, 0)).rgb + texture(tSrc, vUv + vec2(t.x, 0)).rgb + texture(tSrc, vUv + vec2(0, -t.y)).rgb + texture(tSrc, vUv + vec2(0, t.y)).rgb) * 2.0;
  s += texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture(tSrc, vUv + vec2(t.x, t.y)).rgb;
  fragColor = vec4(s / 16.0 + texture(tPrev, vUv).rgb, 1.0);
}`;

const FINAL_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform sampler2D tBloom; uniform sampler2D tInk; uniform sampler2D tDepth;
uniform float uBloom; uniform float uExposure; uniform float uSaturation; uniform float uContrast; uniform float uVignette;
uniform float uSplit; uniform vec3 uSplitLo; uniform vec3 uSplitHi; uniform float uAlarm; uniform float uInkOn;
uniform float uNear; uniform float uFar;
float viewDist(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 toneMap(vec3 c) {
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const float k = 0.62;
  float Lt = L < k ? L : k + (L - k) / (1.0 + (L - k) / (1.0 - k));
  c *= Lt / max(L, 1e-5);
  float m = max(c.r, max(c.g, c.b));
  if (m > 1.0) c = Lt + (c - Lt) * ((1.0 - Lt) / max(m - Lt, 1e-4));
  return c;
}
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 col = texelFetch(tSrc, p, 0).rgb + texture(tBloom, vUv).rgb * uBloom;
  // ink outline: an alien silhouette pixel next to us that is visible and in front of what we show
  vec4 best = vec4(0.0);
  if (uInkOn > 0.5 && texelFetch(tInk, p, 0).a <= 0.0) {
    float here = viewDist(texelFetch(tDepth, p, 0).r);
    float bestD = 1e9;
    for (int i = 0; i < 8; i++) {
      int ix = i < 3 ? i - 1 : i < 5 ? (i == 3 ? -1 : 1) : i - 6;
      int iy = i < 3 ? -1 : i < 5 ? 0 : 1;
      ivec2 q = p + ivec2(ix, iy);
      vec4 ink = texelFetch(tInk, q, 0);
      if (ink.a <= 0.0) continue;
      float sceneQ = viewDist(texelFetch(tDepth, q, 0).r);
      if (sceneQ < ink.a - 0.08) continue;          // that alien pixel is hidden behind something
      if (here < ink.a + 0.04) continue;            // we are in front of the alien
      if (ink.a < bestD) { bestD = ink.a; best = ink; }
    }
  }
  col = toSRGB(toneMap(col * uExposure));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  l = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 tone = mix(uSplitLo, uSplitHi, smoothstep(0.1, 0.8, l));
  col = mix(col, col * tone / max(dot(tone, vec3(0.299, 0.587, 0.114)), 1e-3), uSplit * (1.0 - abs(l - 0.45)));
  // ink sits on top of the grade: a crisp, truly dark line in the alien's ink colour
  if (best.a > 0.0) col = uInkOn > 1.5 ? vec3(1.0, 1.0, 0.0) : toSRGB(best.rgb) * 0.62;
  vec2 cc = vUv - 0.5; float r2 = dot(cc, cc);
  col *= mix(1.0, smoothstep(0.95, 0.15, r2 * 1.6), uVignette);
  col = mix(col, col * vec3(1.25, 0.55, 0.5), uAlarm * smoothstep(0.05, 0.45, r2) );
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const BLIT_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform float uK; uniform vec2 uSrcRes;
void main() {
  ivec2 p = ivec2(min(floor(gl_FragCoord.xy / uK), uSrcRes - 1.0));
  fragColor = vec4(texelFetch(tSrc, p, 0).rgb, 1.0);
}`;

const INK_VS = /* glsl */ `
varying float vDist;
#include <common>
void main() {
  vec4 mv = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mv = instanceMatrix * mv;
  #endif
  mv = modelViewMatrix * mv;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const INK_FS = /* glsl */ `
uniform vec3 uInk; varying float vDist;
void main() { gl_FragColor = vec4(uInk, vDist); }`;

function fsMat(fs: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}
const hdrRT = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

/** Layer used for objects that get the screen-space ink outline (aliens). */
export const INK_LAYER = 1;

export class PixelPost {
  lowResH = 440;
  k = 1; w = 1; h = 1;
  private sceneRT: THREE.WebGLRenderTarget;
  private inkRT: THREE.WebGLRenderTarget;
  private outRT: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private brightMat: THREE.ShaderMaterial; private downMat: THREE.ShaderMaterial; private upMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial; private blitMat: THREE.ShaderMaterial;
  readonly inkMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;
  private size: [number, number, number] = [1, 1, 1];

  constructor(private r: THREE.WebGLRenderer) {
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.inkRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.outRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    for (let i = 0; i < 3; i++) { this.down.push(hdrRT()); this.up.push(hdrRT()); }
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.brightMat = fsMat(BRIGHT_FS, { tSrc: { value: null }, uThreshold: POST.uBloomThreshold });
    this.downMat = fsMat(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = fsMat(UP_FS, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.finalMat = fsMat(FINAL_FS, { tSrc: { value: null }, tBloom: { value: null }, tInk: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 400 }, ...POST });
    this.blitMat = fsMat(BLIT_FS, { tSrc: { value: null }, uK: { value: 1 }, uSrcRes: { value: new THREE.Vector2(1, 1) } });
    this.inkMat = new THREE.ShaderMaterial({ vertexShader: INK_VS, fragmentShader: INK_FS, uniforms: { uInk: { value: new THREE.Color(0x14321c) } } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  setLowRes(h: number) { this.lowResH = h; this.setSize(...this.size); }

  setSize(w: number, h: number, pr: number) {
    this.size = [w, h, pr];
    const NW = Math.max(1, Math.floor(w * pr)), NH = Math.max(1, Math.floor(h * pr));
    const k = this.lowResH > 0 && NH > this.lowResH * 1.25 ? Math.max(1, Math.round(NH / this.lowResH)) : 1;
    const W = Math.ceil(NW / k), H = Math.ceil(NH / k);
    this.k = k; this.w = W; this.h = H;
    this.sceneRT.setSize(W, H); this.inkRT.setSize(W, H); this.outRT.setSize(W, H);
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < this.down.length; i++) { this.down[i].setSize(Math.max(1, bw), Math.max(1, bh)); this.up[i].setSize(Math.max(1, bw), Math.max(1, bh)); bw >>= 1; bh >>= 1; }
    this.blitMat.uniforms.uK.value = k;
    this.blitMat.uniforms.uSrcRes.value.set(W, H);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qScene, this.qCam);
  }

  /** debug: count of ink-mask pixels after the last render */
  debugInk(): number { const w = this.inkRT.width, h = this.inkRT.height; const buf = new Uint16Array(w * h * 4); this.r.readRenderTargetPixels(this.inkRT, 0, 0, w, h, buf); let n = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 0) n++; return n; }

  /** Is the ink pass rendering right now? (alien meshes set their ink colour in onBeforeRender) */
  inking = false;

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.r;
    // 1. scene
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    // 2. ink mask: only the INK layer, flat ink colour + view distance
    if (POST.uInkOn.value > 0.5) {
      const mask = camera.layers.mask;
      const bg = scene.background, fog = scene.fog, ov = scene.overrideMaterial;
      camera.layers.set(INK_LAYER);
      scene.background = null; scene.fog = null; scene.overrideMaterial = this.inkMat;
      r.setRenderTarget(this.inkRT);
      r.setClearColor(0x000000, 0);
      r.clear();
      this.inking = true;
      r.render(scene, camera);
      this.inking = false;
      camera.layers.mask = mask;
      scene.background = bg; scene.fog = fog; scene.overrideMaterial = ov;
      r.setClearColor(0x000000, 1);
    }
    // 3. tight bloom
    this.brightMat.uniforms.tSrc.value = this.sceneRT.texture;
    this.pass(this.brightMat, this.down[0]);
    for (let i = 1; i < this.down.length; i++) {
      const src = this.down[i - 1];
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.downMat, this.down[i]);
    }
    let prev: THREE.Texture = this.black;
    for (let i = this.down.length - 1; i >= 0; i--) {
      const src = this.down[i];
      this.upMat.uniforms.tSrc.value = src.texture;
      this.upMat.uniforms.tPrev.value = prev;
      this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.upMat, this.up[i]);
      prev = this.up[i].texture;
    }
    // 4. ink + tonemap + grade at low res
    const f = this.finalMat.uniforms;
    f.tSrc.value = this.sceneRT.texture; f.tBloom.value = this.up[0].texture;
    f.tInk.value = this.inkRT.texture; f.tDepth.value = this.sceneRT.depthTexture;
    f.uNear.value = camera.near; f.uFar.value = camera.far;
    this.pass(this.finalMat, this.outRT);
    // 5. nearest integer upscale
    this.blitMat.uniforms.tSrc.value = this.outRT.texture;
    this.pass(this.blitMat, null);
  }
}

/**
 * Mark an object (an alien) for the ink outline: its meshes join INK_LAYER and push their
 * ink colour into the shared ink material while the ink pass draws them.
 */
export function inkObject(root: THREE.Object3D, ink: number, post: () => PixelPost | null) {
  const c = new THREE.Color(ink);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.outline) return;
    m.layers.enable(INK_LAYER);
    m.onBeforeRender = () => {
      const p = post();
      if (p?.inking) { p.inkMat.uniforms.uInk.value.copy(c); p.inkMat.uniformsNeedUpdate = true; }
    };
  });
}

let active: PixelPost | null = null;
/** The world's live post pipeline (null before boot / in dev labs that don't use it). */
export const getPost = () => active;
export const setPost = (p: PixelPost | null) => { active = p; };
