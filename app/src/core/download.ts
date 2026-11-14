// Saving files to the user's device. Inside claude.ai artifacts plain <a download> is inert,
// so we use the `downloads` capability there; elsewhere a normal blob link.
import { capability, isArtifact } from './env';
import { toast } from './bus';

export async function saveFile(filename: string, data: Blob | string, mime = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  if (isArtifact()) {
    const dl = await capability<any>('downloads');
    if (!dl) { toast('Downloads are not available in this view', 'warn'); return false; }
    try { await dl.save({ filename, data: blob }); return true; } catch (err: any) {
      if (err?.code !== 'declined' && err?.code !== 'dismissed') toast(`Couldn't save ${filename}`, 'bad');
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
