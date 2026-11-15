// GLOB LABS — boot sequence.
import './ui/styles.css';
import { render } from 'preact';
import { loadState } from './core/state';
import { startCrewDirector } from './core/crew';
import { startSfx } from './audio/sfx';
import { App } from './ui/App';

// Feature modules register their panels / listeners on import.
import './claude';
import './ui/idea';
import './ui/shop';
import './economy';
import './widget';

async function boot() {
  startSfx();
  await loadState();
  startCrewDirector();
  render(<App />, document.getElementById('app')!);

  const canvas = document.getElementById('world') as HTMLCanvasElement;
  try {
    const { startWorld } = await import('./world');
    await startWorld(canvas);
  } catch (err) {
    console.error('[world] failed to start — running in flat mode', err);
    canvas.style.background = 'radial-gradient(circle at 50% 60%, #16301f, #0a0f0c 70%)';
  }
  const bootEl = document.getElementById('boot');
  bootEl?.classList.add('gone');
  setTimeout(() => bootEl?.remove(), 600);
}

const voxlab = new URLSearchParams(location.search).get('voxlab');
if (voxlab) {
  import('./dev/voxlab').then((m) => m.runVoxLab(voxlab));
} else boot().catch((err) => {
  console.error(err);
  const el = document.querySelector('#boot .boot-text');
  if (el) el.textContent = 'THE LAB FAILED TO BOOT — ' + String(err?.message ?? err);
});
