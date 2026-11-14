import { economy } from '../../core/state';
import { fmtAgo } from '../../core/util';
import { Meter, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { ACHIEVEMENTS } from '../../economy/achievements';

export function AchievementsPanel({ close }: { arg: unknown; close: () => void }) {
  const got = economy.value.achievements;
  const n = Object.keys(got).length;
  const list = [...ACHIEVEMENTS].sort((a, b) => (got[b.id] ? 1 : 0) - (got[a.id] ? 1 : 0));
  return (
    <Win title="Badges" icon="trophy" onClose={close} actions={<span class="chip a tnum">{n}/{ACHIEVEMENTS.length}</span>}>
      <div style={{ padding: '0 6px 10px' }}><Meter value={n / ACHIEVEMENTS.length} /></div>
      <div class="badges">
        {list.map((a) => {
          const ts = got[a.id];
          const hidden = a.secret && !ts;
          const p = a.progress?.();
          return (
            <div key={a.id} class={`badge-card ${ts ? 'got' : ''}`}>
              <div class="badge-ico"><Icon name={hidden ? 'warn' : a.icon} size="lg" /></div>
              <div class="col gap-4" style={{ minWidth: 0 }}>
                <b style={{ color: ts ? 'var(--text)' : 'var(--text-2)' }}>{hidden ? '???' : a.name}</b>
                <span class="dim" style={{ fontSize: '12px' }}>{hidden ? 'A secret badge. Keep experimenting.' : a.desc}</span>
                <div class="row" style={{ fontSize: '11px' }}>
                  <span class="chip g" style={{ height: '18px', padding: '0 6px' }}><Icon name="dna" size="sm" />{a.reward}</span>
                  {ts ? <span class="dimmer">{fmtAgo(ts)}</span> : p && !hidden ? <span class="grow"><Meter value={p[0] / p[1]} /></span> : null}
                  {!ts && p && !hidden && <span class="dimmer tnum">{p[0]}/{p[1]}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Win>
  );
}
