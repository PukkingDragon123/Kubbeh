// Voxel icons. Every icon is a sculpted, lit, inked voxel model (src/vox/ui/icons.ts)
// photographed once by the studio at the device's pixel ratio and cached as an image.
// API unchanged from v1 so every caller keeps working: <Icon name size class title />.
import { buildIcon, poseOf } from '../../vox/ui/icons';
import { photoURL, studioRenderer } from '../../vox/studio';

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

/** Data URL of an icon rendered for `cssPx` at the current device pixel ratio. */
export function iconURL(name: string, cssPx: number): string {
  const dpr = Math.min(3, Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 2) / 2));
  // render at a few fixed buckets so icons of similar size share one image
  const bucket = cssPx <= 18 ? 18 : cssPx <= 24 ? 24 : cssPx <= 34 ? 34 : cssPx <= 48 ? 48 : cssPx <= 72 ? 72 : 128;
  const w = Math.round(bucket * dpr);
  const key = `${name}|${w}`;
  const hit = urls.get(key);
  if (hit) return hit;
  if (gl === null) gl = !!studioRenderer();
  if (!gl) return '';
  const pose = poseOf(name);
  const url = photoURL(buildIcon(name), w, w, { key: 'icon:' + name, yaw: pose.yaw, pitch: pose.pitch, fill: 0.94, ss: 2 });
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
