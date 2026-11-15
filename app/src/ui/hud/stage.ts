// Glue between Preact components and the 3D HUD stage.
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';
import type * as THREE from 'three';
import type { HudStage, StageOpts, StageItem } from '../../vox/ui/stage';

export const stageSig = signal<HudStage | null>(null);

/** Float a voxel object over the element in `ref` while the component is mounted. */
export function useStageObject(ref: RefObject<HTMLElement | null>, build: () => { obj: THREE.Object3D; opts?: StageOpts; onItem?: (it: StageItem) => void } | null, deps: unknown[]) {
  const st = stageSig.value;
  useEffect(() => {
    if (!st || !ref.current) return;
    const b = build();
    if (!b) return;
    const it = st.add(ref.current, b.obj, b.opts);
    b.onItem?.(it);
    return () => it.remove();
  }, [st, ...deps]);
}
