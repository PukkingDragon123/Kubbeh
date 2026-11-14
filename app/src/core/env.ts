// Runtime detection: are we a published claude.ai artifact (window.claude.use available),
// or a standalone web app (localhost, GitHub Pages, file://)?
//
// In an artifact, fetch() to other hosts is blocked by CSP, so the `api` engine can't run;
// the `claudeai` engine uses claude.use('sample') with the viewer's own Claude account.

type ClaudeRuntime = { use: (name: string) => Promise<any> };

declare global {
  interface Window {
    claude?: ClaudeRuntime & { hot?: any };
    documentPictureInPicture?: { requestWindow(opts?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>; window: Window | null };
  }
}

export const isArtifact = (): boolean => typeof window !== 'undefined' && !!window.claude?.use;

const capCache = new Map<string, Promise<any | null>>();

/** Resolve a claude.ai capability namespace, or null (not an artifact / not granted / timed out). */
export function capability<T = any>(name: string, timeoutMs = 10_000): Promise<T | null> {
  if (!isArtifact()) return Promise.resolve(null);
  let p = capCache.get(name);
  if (!p) {
    p = Promise.race([
      window.claude!.use(name).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    capCache.set(name, p);
  }
  return p as Promise<T | null>;
}

export const supportsPiP = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window;
export const isTouch = () => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const prefersReducedMotion = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
