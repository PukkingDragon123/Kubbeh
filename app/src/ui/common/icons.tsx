// Voxel icons. Every icon is a sculpted, lit, inked voxel model (src/vox/ui/icons.ts)
// photographed once by the studio at the device's pixel ratio and cached as an image.
// API unchanged from v1 so every caller keeps working: <Icon name size class title />.
import { buildIcon, poseOf } from '../../vox/ui/icons';
import { studioRenderer } from '../../vox/studio';
import { pixelURL } from '../../vox/ui/pixel';

export type IconName =
  | 'terminal' | 'idea' | 'shop' | 'wardrobe' | 'slot' | 'fuel' | 'wrench' | 'gear' | 'sound' | 'mute'
  | 'widget' | 'dna' | 'close' | 'plus' | 'send' | 'stop' | 'trash' | 'chat' | 'folder' | 'file'
  | 'search' | 'code' | 'clip' | 'download' | 'copy' | 'check' | 'star' | 'user' | 'warn' | 'play'
  | 'pin' | 'sparkle' | 'mic' | 'menu' | 'back' | 'pencil' | 'refresh' | 'ufo' | 'alien' | 'trophy'
  | 'eye' | 'brain' | 'arcade' | 'tasks' | 'bolt';

export const iconNames: IconName[] = [
  'terminal', 'idea', 'shop', 'wardrobe', 'slot', 'fuel', 'wrench', 'gear', 'sound', 'mute',
  'widget', 'dna', 'close', 'plus', 'send', 'stop', 'trash', 'chat', 'folder', 'file',
  'search', 'code', 'clip', 'download', 'copy', 'check', 'star', 'user', 'warn', 'play',
  'pin', 'sparkle', 'mic', 'menu', 'back', 'pencil', 'refresh', 'ufo', 'alien', 'trophy',
  'eye', 'brain', 'arcade', 'tasks', 'bolt',
];

/** CSS px per size class (matches .ico rules in styles.css). */
const PX: Record<string, number> = { sm: 18, md: 22, lg: 32, xl: 46 };

const urls = new Map<string, string>();
let gl: boolean | null = null;

/** Art-pixel scale for a CSS size: small icons draw 1 art px per CSS px, big ones are chunkier. */
export const artScale = (cssPx: number) => (cssPx >= 40 ? 2 : 1);

/**
 * Data URL of an icon as pixel art: the voxel model is photographed 4× larger, box-downsampled
 * to exactly cssPx / artScale pixels, posterised, rim-lit and inked (src/vox/ui/pixel.ts).
 * Shown with image-rendering: pixelated at an integer upscale.
 */
export function iconURL(name: string, cssPx: number): string {
  if (gl === null) gl = !!studioRenderer();
  if (!gl) return '';
  const k = artScale(cssPx);
  const w = Math.round(cssPx / k);
  const key = `${name}|${w}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const pose = poseOf(name);
  const url = pixelURL(() => buildIcon(name), w, w, { key: 'icon:' + name, yaw: pose.yaw, pitch: pose.pitch, fill: 1.08 });
  urls.set(key, url);
  return url;
}

/** Pre-render icons during idle time so panels open without a hitch. */
export function warmIcons(names: string[] = iconNames, sizes = [22, 32]) {
  const queue = names.flatMap((n) => sizes.map((s) => [n, s] as const));
  const step = (deadline?: { timeRemaining(): number }) => {
    while (queue.length && (!deadline || deadline.timeRemaining() > 6)) { const [n, s] = queue.shift()!; try { iconURL(n, s); } catch { /* ignore */ } if (!deadline) break; }
    if (queue.length) schedule();
  };
  const schedule = () => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(step, { timeout: 800 }) : setTimeout(() => step(), 30));
  schedule();
}

export function Icon({ name, size, class: cls = '', title }: { name: IconName; size?: 'sm' | 'lg' | 'xl'; class?: string; title?: string }) {
  const px = PX[size ?? 'md'];
  const url = iconURL(name, px);
  if (!url) {
    // no WebGL: a tiny neutral glyph rather than a broken image
    return <span class={`ico ${size ?? ''} ${cls}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}
      style={{ borderRadius: '30%', background: 'linear-gradient(180deg,#5b6977,#2b3540)', boxShadow: 'inset 0 1px 0 #fff4' }} />;
  }
  return (
    <img class={`ico vx ${size ?? ''} ${cls}`} src={url} width={px} height={px} draggable={false} decoding="async"
      alt={title ?? ''} title={title} aria-hidden={title ? undefined : 'true'} />
  );
}
