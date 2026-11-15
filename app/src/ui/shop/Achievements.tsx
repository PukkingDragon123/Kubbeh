// Badges: every achievement is a real voxel medal on a ribbon (locked ones are dark
// silhouettes). Hover a medal and it spins; the description lives in its tooltip.
import { economy } from '../../core/state';
import { fmtAgo } from '../../core/util';
import { Meter, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { ACHIEVEMENTS } from '../../economy/achievements';
import { VoxView } from './vox/VoxView';
import { medal } from './vox/models';
import type { GlyphName } from './vox/glyphs';

const TINTS = [0x8cf56b, 0x52f2ff, 0xff6fd6, 0xffbe3d, 0xb48cff, 0xff8a5a];
const tintFor = (id: string) => TINTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

export function AchievementsPanel({ close }: { arg: unknown; close: () => void }) {
  const got = economy.value.achievements;
  const n = Object.keys(got).length;
  const list = [...ACHIEVEMENTS].sort((a, b) => (got[b.id] ? 1 : 0) - (got[a.id] ? 1 : 0));
  return (
    <Win title="Badges" icon="trophy" onClose={close} actions={<span class="chip a tnum">{n}/{ACHIEVEMENTS.length}</span>}>
      <div style={{ padding: '0 6px 10px' }}><Meter value={n / ACHIEVEMENTS.length} /></div>
      <div class="medals">
        {list.map((a) => {
          const ts = got[a.id];
          const hidden = a.secret && !ts;
          const p = a.progress?.();
          const glyph = (hidden ? 'warn' : a.icon) as GlyphName;
          return (
            <div key={a.id} class={`medal-card ${ts ? 'got' : ''}`} title={hidden ? 'A secret badge. Keep experimenting.' : a.desc}>
              <VoxView size={92} spin="hover" cacheKey={`medal:${a.id}:${!!ts}`} make={() => medal(glyph, tintFor(a.id), !!ts)} pitch={0.08} yaw={-0.25} />
              <b class="medal-name">{hidden ? '???' : a.name}</b>
              <div class="medal-foot">
                <span class="medal-reward"><Icon name="dna" size="sm" />{a.reward}</span>
                {ts ? <span class="dimmer">{fmtAgo(ts)}</span> : p && !hidden ? <span class="grow"><Meter value={p[0] / p[1]} /></span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Win>
  );
}
