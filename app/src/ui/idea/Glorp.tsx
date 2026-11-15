// Prof. Glorp, live: the real voxel alien (with his goggles and lab coat) in a little
// holo-viewport. His face follows what he is actually doing in the crew signal:
// thinking → focused, talking → happy with nods, done → love, question → wink.
import { useRef, useState } from 'preact/hooks';
import type * as THREE from 'three';
import { crew, looks } from '../../core/state';
import { sfx } from '../../core/bus';
import { pick } from '../../core/util';
import type { Expression } from '../../core/types';
import { babble } from '../../audio/sfx';
import { buildAlien, type AlienParts, type Face } from '../../vox/alien';
import { dressAlien } from '../../vox/cosmetics';
import { VoxView } from '../shop/vox/VoxView';
import { framed } from '../shop/vox/models';
import { pixelBurst } from '../shop/vox/pixel';

const POKES = ['Hey! That tickles.', 'I am 94% jelly, please be gentle.', 'Ideas incoming…', 'Blorp.', 'Careful, I bruise purple.'];

export function GlorpPortrait({ onPoke, size = 112 }: { onPoke?: (line: string) => void; size?: number }) {
  const parts = useRef<AlienParts | null>(null);
  const flash = useRef<{ e: Face; until: number } | null>(null);
  const hop = useRef(0);
  const [, force] = useState(0);
  const look = looks.value.find((l) => l.id === 'glorp') ?? looks.value[0];
  const me = crew.value.find((m) => m.id === 'glorp');
  const act = me?.activity ?? 'idle';
  const actRef = useRef(act);
  actRef.current = act;
  const base: Expression = act === 'thinking' || act === 'planning' ? 'focused' : act === 'celebrating' ? 'love' : act === 'question' ? 'wink' : act === 'bugfix' ? 'cry' : act === 'writing' ? 'happy' : look.expression;
  const baseRef = useRef<Face>(base);
  baseRef.current = base;
  const lookKey = [look.skin, look.body, look.belly, look.bulbA, look.bulbB, look.hat, look.outfit, look.accessory].join('|');

  const make = () => {
    const a = buildAlien(look, 0.016);
    try { dressAlien(a, look); } catch { /* cosmetics still loading */ }
    parts.current = a;
    return framed(a.root, 1.02);
  };

  let blinkUntil = 0, nextBlink = 0;
  const animate = (_o: THREE.Object3D, t: number) => {
    const a = parts.current; if (!a) return;
    const now = performance.now();
    if (now > nextBlink) { blinkUntil = now + 130; nextBlink = now + 1800 + Math.random() * 2600; }
    const f = flash.current && flash.current.until > now ? flash.current.e : now < blinkUntil ? 'blink' : baseRef.current;
    a.setFace(f);
    const talking = actRef.current === 'writing';
    const busy = actRef.current !== 'idle';
    const k = (now - hop.current) / 1000;
    const jump = k >= 0 && k < 0.5 ? Math.sin((k / 0.5) * Math.PI) * 0.18 : 0;
    a.root.position.y = jump;
    const sq = 1 + Math.sin(t * (talking ? 9 : busy ? 4 : 2.2)) * (talking ? 0.035 : 0.02) - (k >= 0 && k < 0.15 ? 0.08 : 0);
    a.jelly.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    a.head.rotation.x = talking ? Math.sin(t * 9) * 0.06 : Math.sin(t * 1.3) * 0.03;
    a.head.rotation.z = Math.sin(t * 0.9) * (actRef.current === 'thinking' ? 0.12 : 0.04);
    a.root.rotation.y = -0.35 + Math.sin(t * 0.6) * 0.18;
    if (a.antL) a.antL.rotation.x = Math.sin(t * 3.1) * 0.08;
    if (a.antR) a.antR.rotation.x = Math.sin(t * 2.7 + 1) * 0.08;
    a.armR.rotation.z = talking ? -0.3 - Math.abs(Math.sin(t * 4.5)) * 0.5 : -0.1;
  };

  return (
    <button type="button" class="glorp-port" title="Prof. Glorp — poke him" aria-label="Poke Prof. Glorp"
      onClick={(e) => {
        const line = pick(POKES);
        sfx('boing', .55, 1.1); babble(line, 1.25);
        hop.current = performance.now();
        flash.current = { e: pick<Face>(['shocked', 'derp', 'tongue']), until: performance.now() + 900 };
        force((n) => n + 1);
        onPoke?.(line);
        pixelBurst(e.currentTarget as HTMLElement, 'love', 2);
      }}>
      <VoxView size={size} spin="always" eager cacheKey={`glorp:${lookKey}`} make={make} animate={animate} yaw={0} pitch={0.08} fill={0.98} />
    </button>
  );
}

export function glorpStatus(): string {
  const me = crew.value.find((m) => m.id === 'glorp');
  if (!me || me.activity === 'idle') return '';
  return me.label;
}
