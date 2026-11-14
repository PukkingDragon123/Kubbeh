// Prof. Glorp's live portrait: expression follows what he is actually doing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { crew, looks } from '../../core/state';
import { sfx } from '../../core/bus';
import { pick } from '../../core/util';
import type { Expression } from '../../core/types';
import { portraitPainter } from '../../economy/pixelart';
import { babble } from '../../audio/sfx';

const POKES = ['Hey! That tickles.', 'I am 94% jelly, please be gentle.', 'Ideas incoming…', 'Blorp.', 'Careful, I bruise purple.'];

export function GlorpPortrait({ onPoke }: { onPoke?: (line: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);
  const [talk, setTalk] = useState(false);
  const [hop, setHop] = useState(0);
  const [flash, setFlash] = useState<Expression | null>(null);
  const look = looks.value.find((l) => l.id === 'glorp') ?? looks.value[0];
  const me = crew.value.find((m) => m.id === 'glorp');
  const act = me?.activity ?? 'idle';
  const expr: Expression = flash ?? (act === 'thinking' || act === 'planning' ? 'focused' : act === 'celebrating' ? 'love' : act === 'question' ? 'wink' : act === 'bugfix' ? 'cry' : look.expression);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 130); loop(); }, 1800 + Math.random() * 2400); };
    loop();
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (act !== 'writing') { setTalk(false); return; }
    const i = setInterval(() => setTalk((v) => !v), 150);
    return () => clearInterval(i);
  }, [act]);
  useEffect(() => { if (ref.current) portraitPainter(look, { blink, talk, expression: expr }).blit(ref.current); }, [look, blink, talk, expr]);

  return (
    <canvas key={hop} ref={ref} width={40} height={40} class={`pixelated ${hop ? 'hop' : ''}`} title="Prof. Glorp — poke him"
      onClick={() => {
        const line = pick(POKES);
        sfx('boing', .55, 1.1); babble(line, 1.25);
        setHop((h) => h + 1); setFlash(pick<Expression>(['shocked', 'derp', 'tongue']));
        setTimeout(() => setFlash(null), 900);
        onPoke?.(line);
      }} />
  );
}

export function glorpStatus(): string {
  const me = crew.value.find((m) => m.id === 'glorp');
  if (!me || me.activity === 'idle') return '';
  return me.label;
}
