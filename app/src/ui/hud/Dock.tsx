import { editMode, openPanelId, setPanel } from '../../core/state';
import { sfx } from '../../core/bus';
import { panels } from '../panels';
import { Icon } from '../common/icons';

export function Dock() {
  const open = openPanelId.value;
  const items = [...panels.values()].filter((p) => p.dock).sort((a, b) => a.dock!.order - b.dock!.order);
  return (
    <nav class="dock pe" aria-label="Lab stations">
      {items.map((p) => (
        <button type="button" key={p.id} class="dock-btn" aria-pressed={open === p.id} title={`${p.title}${p.dock!.hotkey ? ` (${p.dock!.hotkey})` : ''}`}
          onMouseEnter={() => sfx('hover', .15)}
          onClick={() => { sfx(open === p.id ? 'panel_close' : 'panel_open', .45); setPanel(open === p.id ? null : p.id); }}>
          <Icon name={p.icon} />{p.dock!.label}
        </button>
      ))}
      <button type="button" class="dock-btn" aria-pressed={editMode.value} title="Rearrange your HQ (E)"
        onClick={() => { sfx('toggle', .5); editMode.value = !editMode.value; if (editMode.value) setPanel(null); }}>
        <Icon name="wrench" />{editMode.value ? 'Done' : 'Edit HQ'}
      </button>
    </nav>
  );
}
