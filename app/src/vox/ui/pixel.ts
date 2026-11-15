// Pixel finish for photographed voxel models — after the user's Fishtop (src/ui/obj/studio.ts
// modelIcon): render 4× larger, box-downsample to the target pixel grid, posterise a little,
// add a 1 px ink outline taken from the edge colour (deeper on the shadow side) and a warm
// top-left rim. Shown with `image-rendering: pixelated` at an exact integer upscale, so UI
// objects read as crisp pixel art that matches the pixel-rendered world.
//
// Also: matteify() — the UI's material rule (matte painted hardware; only eyes & glass shine).
import * as THREE from 'three';
import { photo, studioRenderer, type PhotoOpts } from '../studio';
import { M } from '../core';

const SS = 4;

/** Swap shiny materials for matte ones (roughness ≥ 0.6); gloss eyes, glass and glow untouched. */
const matteCache = new WeakMap<THREE.Material, THREE.Material>();
export function matteify(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || n.userData.outline) return;
    const kind = n.userData.voxMat as number | undefined;
    if (kind === M.gloss || kind === M.glass || kind === M.glow) return;
    const src = m.material as THREE.Material;
    if (Array.isArray(src)) return;
    let mm = matteCache.get(src);
    if (!mm) {
      const s = src as THREE.MeshStandardMaterial;
      if (!(s as any).isMeshStandardMaterial) return;
      const metal = kind === M.metal;
      mm = new THREE.MeshStandardMaterial({
        vertexColors: s.vertexColors, color: s.color, map: s.map ?? null,
        roughness: metal ? 0.6 : 0.82, metalness: metal ? 0.22 : 0.0, envMapIntensity: metal ? 0.7 : 0.35,
        transparent: s.transparent, opacity: s.opacity, emissive: s.emissive, emissiveIntensity: s.emissiveIntensity,
      });
      matteCache.set(src, mm);
    }
    m.material = mm;
  });
  return o;
}

function finish(src: HTMLCanvasElement, W: number, H: number, ss: number): HTMLCanvasElement {
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(W, H), D = img.data;
  const A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let yy = 0; yy < ss; yy++) for (let xx = 0; xx < ss; xx++) {
      const i = ((y * ss + yy) * src.width + x * ss + xx) * 4;
      const al = sd[i + 3] / 255; r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al; a += al;
    }
    if (a / (ss * ss) < 0.45) continue;
    const j = (y * W + x) * 4;
    const q = (v: number) => Math.min(255, Math.round(v / a / 10) * 10);
    D[j] = q(r); D[j + 1] = q(g); D[j + 2] = q(b); D[j + 3] = 255; A[y * W + x] = 1;
  }
  // warm rim on the lit (top-left) edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!A[y * W + x]) continue;
    const up = y === 0 || !A[(y - 1) * W + x], left = x === 0 || !A[y * W + x - 1];
    if (!up && !left) continue;
    const j = (y * W + x) * 4;
    const lum = D[j] * 0.3 + D[j + 1] * 0.59 + D[j + 2] * 0.11;
    if (lum < 46) continue; // already-inked edge
    D[j] = Math.min(255, D[j] * 0.72 + 255 * 0.28); D[j + 1] = Math.min(255, D[j + 1] * 0.72 + 236 * 0.28); D[j + 2] = Math.min(255, D[j + 2] * 0.72 + 196 * 0.28);
  }
  // 1 px ink outline from the neighbouring colour; skipped where the model already has its ink
  const put: [number, number, number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A[y * W + x]) continue;
    let srcI = -1, deep = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !A[yy * W + xx]) continue;
      srcI = yy * W + xx; if (dx < 0 || dy < 0) deep = true;
    }
    if (srcI < 0) continue;
    const r = D[srcI * 4], g = D[srcI * 4 + 1], b = D[srcI * 4 + 2];
    if (r * 0.3 + g * 0.59 + b * 0.11 < 46) continue;
    const k = deep ? 0.2 : 0.32;
    put.push([y * W + x, r * k + 5, g * k + 6, b * k + 12]);
  }
  for (const [i, r, g, b] of put) { D[i * 4] = r; D[i * 4 + 1] = g; D[i * 4 + 2] = b; D[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return out;
}

const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();

/** A pixel-finished photo of `obj` at W×H art pixels. */
export function pixelPhoto(obj: THREE.Object3D, W: number, H: number, o: PhotoOpts & { key?: string } = {}): HTMLCanvasElement {
  const k = o.key ? `${o.key}|${W}x${H}` : '';
  if (k && cache.has(k)) return cache.get(k)!;
  if (!studioRenderer()) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  matteify(obj);
  const big = photo(obj, W * SS, H * SS, { ...o, key: undefined, ss: 1 });
  const out = finish(big, W, H, SS);
  if (k) cache.set(k, out);
  return out;
}

export function pixelURL(obj: () => THREE.Object3D, W: number, H: number, o: PhotoOpts & { key: string }): string {
  const k = `${o.key}|${W}x${H}`;
  const hit = urls.get(k);
  if (hit) return hit;
  const u = pixelPhoto(obj(), W, H, o).toDataURL('image/png');
  urls.set(k, u);
  return u;
}
