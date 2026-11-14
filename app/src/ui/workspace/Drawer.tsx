// Right-hand drawer: Files · Artifacts · Tasks · Project for the active project / chat.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { zipSync, strToU8 } from 'fflate';
import type { ProjectFile, ProjectTask } from '../../core/types';
import { activeProjectId, artifacts, createProject, deleteFile, deleteProject, filesByProject, loadFiles, projects, saveChat, setFiles, updateProject, writeFile } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { saveFile } from '../../core/download';
import { fmtAgo, isTextMime, mimeOf, readFileAsDataURL, readFileAsText, uid } from '../../core/util';
import { Btn, Empty, Tabs, Toggle, confirmBox, promptBox } from '../common/kit';
import { Icon } from '../common/icons';
import { highlight } from './Markdown';
import { ArtifactView } from './ArtifactFrame';
import { artifactSel, bump, chatSig, drawer, fileSel, goHome, tick, type DrawerTab } from './ws';

function currentProjectId(): string | null {
  return chatSig.value?.projectId ?? activeProjectId.value ?? null;
}

function NoProject({ what }: { what: string }) {
  return (
    <Empty icon="folder" title="No project yet">
      <div class="dim ws-small">{what} live in projects. When Claude writes a file, a project is created for this chat automatically.</div>
      <Btn tone="glob" size="sm" icon="plus" onClick={() => {
        const c = chatSig.value;
        const p = createProject({ name: c?.title && c.title !== 'New experiment' ? c.title : 'New project' });
        if (c) { c.projectId = p.id; saveChat(c); } else activeProjectId.value = p.id;
        bump();
      }}>Create project</Btn>
    </Empty>
  );
}

// ── files ────────────────────────────────────────────────────────────────────
function FileEditor({ pid, f }: { pid: string; f: ProjectFile }) {
  const [text, setText] = useState(f.content);
  const [preview, setPreview] = useState(true);
  useEffect(() => { setText(f.content); }, [f.id, f.updatedAt]);
  const dirty = text !== f.content;
  const isImg = f.binary && f.mime.startsWith('image/');
  return (
    <div class="ws-editor">
      <div class="row ws-artbar">
        <Btn size="sm" tone="ghost" iconOnly icon="back" title="Back to files" onClick={() => { fileSel.value = null; }} />
        <b class="ellipsis grow mono ws-small">{f.path}</b>
        {!f.binary && <Btn size="sm" tone="ghost" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'View'}</Btn>}
        {dirty && <Btn size="sm" tone="glob" icon="check" onClick={async () => { await writeFile(pid, f.path, text, { source: 'user', mime: f.mime }); sfx('select', .5); toast(`Saved ${f.path}`, 'good'); }}>Save</Btn>}
        <Btn size="sm" tone="ghost" iconOnly icon="download" title="Download" onClick={() => {
          if (f.binary) { const bin = atob(f.content); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); void saveFile(f.path.split('/').pop()!, new Blob([a], { type: f.mime })); }
          else void saveFile(f.path.split('/').pop()!, f.content, f.mime);
        }} />
      </div>
      {isImg ? <div class="center scroll" style={{ flex: 1, padding: '12px' }}><img src={`data:${f.mime};base64,${f.content}`} alt={f.path} style={{ maxWidth: '100%', imageRendering: 'pixelated' }} /></div>
        : f.binary ? <Empty icon="file" title="Binary file">{f.mime} · {f.size} bytes</Empty>
        : preview ? <pre class="ws-artcode scroll"><code class="hljs" dangerouslySetInnerHTML={{ __html: highlight(text, f.path.split('.').pop()) }} /></pre>
        : <textarea class="textarea mono ws-code-edit" spellcheck={false} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void writeFile(pid, f.path, text, { source: 'user', mime: f.mime }).then(() => toast(`Saved ${f.path}`, 'good')); } }} />}
    </div>
  );
}

function FilesTab() {
  const pid = currentProjectId();
  useEffect(() => { if (pid) void loadFiles(pid); }, [pid]);
  if (!pid) return <NoProject what="Files" />;
  const files = (filesByProject.value[pid] ?? []).slice().sort((a, b) => a.path.localeCompare(b.path));
  const sel = files.find((f) => f.path === fileSel.value);
  if (sel) return <FileEditor pid={pid} f={sel} />;
  const proj = projects.value.find((p) => p.id === pid);

  async function upload(list: FileList) {
    for (const file of Array.from(list)) {
      const mime = file.type || mimeOf(file.name);
      if (isTextMime(mime) || /\.(md|txt|ts|tsx|js|py|json|cs|gd|lua|glsl|rs|go|yaml|yml|toml|csv)$/i.test(file.name)) await writeFile(pid!, file.name, await readFileAsText(file), { source: 'user', mime: 'text/plain' });
      else { const d = await readFileAsDataURL(file); await writeFile(pid!, file.name, d.split(',')[1] ?? '', { source: 'user', mime, binary: true }); }
    }
    sfx('paper', .5); toast(`Uploaded ${list.length} file${list.length === 1 ? '' : 's'}`, 'good');
  }

  function zipAll() {
    const tree: Record<string, Uint8Array> = {};
    for (const f of files) {
      if (f.binary) { const bin = atob(f.content); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); tree[f.path] = a; }
      else tree[f.path] = strToU8(f.content);
    }
    const zipped = zipSync(tree, { level: 6 });
    void saveFile(`${(proj?.name ?? 'project').replace(/[^\w-]+/g, '-').toLowerCase()}.zip`, new Blob([zipped as BlobPart], { type: 'application/zip' }));
  }

  let lastDir = '';
  return (
    <div class="col gap-8 ws-tabbody">
      <div class="row wrap">
        <label class="btn sm ghost" style={{ cursor: 'pointer' }}><input type="file" multiple hidden onChange={(e) => { const fl = (e.target as HTMLInputElement).files; if (fl) void upload(fl); (e.target as HTMLInputElement).value = ''; }} />Upload</label>
        <Btn size="sm" tone="ghost" icon="plus" onClick={async () => { const p = await promptBox('New file', 'src/new-file.ts'); if (p) { await writeFile(pid, p, '', { source: 'user' }); fileSel.value = p.replace(/^\.?\/+/, ''); } }}>New</Btn>
        <div class="grow" />
        <Btn size="sm" tone="cyan" icon="download" disabled={!files.length} onClick={zipAll}>Zip</Btn>
      </div>
      <div class="dimmer ws-small"><Icon name="star" size="sm" /> = knowledge: included (cached) in every chat of this project.</div>
      {!files.length && <Empty icon="folder" title="Empty file cabinet">Upload files, or ask Claude to write some.</Empty>}
      <div class="col gap-4 scroll">
        {files.map((f) => {
          const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
          const head = dir !== lastDir ? (lastDir = dir, dir) : null;
          return (
            <div key={f.id}>
              {head !== null && head !== '' && <div class="up dimmer ws-dir"><Icon name="folder" size="sm" /> {head}/</div>}
              <div class="ws-row">
                <button type="button" class="li" onClick={() => { sfx('paper', .3); fileSel.value = f.path; }} style={{ paddingLeft: dir ? '22px' : undefined }}>
                  <Icon name={f.binary ? 'file' : 'code'} size="sm" />
                  <span class="grow ellipsis mono ws-small">{f.path.split('/').pop()}</span>
                  <span class="dimmer ws-small">{f.size > 1024 ? `${(f.size / 1024).toFixed(1)}k` : `${f.size}b`}</span>
                  {f.source === 'claude' && <span class="chip g" style={{ height: '18px' }}>claude</span>}
                </button>
                <div class="ws-row-acts" style={{ opacity: f.knowledge ? 1 : undefined }}>
                  <button type="button" title={f.knowledge ? 'Remove from knowledge' : 'Add to project knowledge'} style={{ color: f.knowledge ? 'var(--amber)' : undefined }}
                    onClick={() => setFiles(pid, files.map((x) => (x.id === f.id ? { ...x, knowledge: !x.knowledge } : x)))}><Icon name="star" size="sm" /></button>
                  <button type="button" title="Delete" onClick={async () => { if (await confirmBox(`Delete ${f.path}?`, undefined, { ok: 'Delete', danger: true })) void deleteFile(pid, f.path); }}><Icon name="trash" size="sm" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── artifacts ────────────────────────────────────────────────────────────────
function ArtifactsTab() {
  const chat = chatSig.value;
  const pid = currentProjectId();
  const list = useMemo(() => {
    const all = artifacts.value;
    const mine = all.filter((a) => (chat && a.chatId === chat.id) || (pid && a.projectId === pid));
    return mine.length ? [...mine, ...all.filter((a) => !mine.includes(a))] : all;
  }, [artifacts.value, chat?.id, pid]);
  const sel = list.find((a) => a.id === artifactSel.value);
  if (sel) return (
    <div class="col ws-tabbody" style={{ flex: 1, minHeight: 0 }}>
      <Btn size="sm" tone="ghost" icon="back" onClick={() => { artifactSel.value = null; }}>All artifacts</Btn>
      <ArtifactView a={sel} />
    </div>
  );
  if (!list.length) return <Empty icon="bolt" title="No artifacts yet">Ask for a playable prototype, an SVG, or a diagram.</Empty>;
  return (
    <div class="col gap-4 ws-tabbody scroll">
      {list.map((a) => (
        <button type="button" class="li" key={a.id} onClick={() => { sfx('panel_open', .3); artifactSel.value = a.id; }}>
          <Icon name="bolt" size="sm" />
          <span class="grow col gap-4" style={{ alignItems: 'flex-start', minWidth: 0 }}><span class="ellipsis" style={{ maxWidth: '100%' }}>{a.title}</span><span class="dimmer ws-small">{a.kind} · v{a.versions.length + 1} · {fmtAgo(a.updatedAt)}</span></span>
          {(chat && a.chatId === chat.id) && <span class="chip g">this chat</span>}
        </button>
      ))}
    </div>
  );
}

// ── tasks ────────────────────────────────────────────────────────────────────
const NEXT: Record<ProjectTask['status'], ProjectTask['status']> = { todo: 'doing', doing: 'done', done: 'todo' };
function TasksTab() {
  const pid = currentProjectId();
  const [title, setTitle] = useState('');
  if (!pid) return <NoProject what="Task boards" />;
  const p = projects.value.find((x) => x.id === pid)!;
  const tasks = p.tasks ?? [];
  const set = (t: ProjectTask[]) => updateProject(pid, { tasks: t });
  const cols: { s: ProjectTask['status']; label: string; tone: string }[] = [{ s: 'doing', label: 'Doing', tone: 'c' }, { s: 'todo', label: 'To do', tone: '' }, { s: 'done', label: 'Done', tone: 'g' }];
  return (
    <div class="col gap-12 ws-tabbody scroll">
      <form class="row" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; set([...tasks, { id: uid('task_'), title: title.trim(), status: 'todo', createdAt: Date.now() }]); setTitle(''); sfx('plop', .4); }}>
        <input class="field" id="ws-new-task" placeholder="Add a task…" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        <Btn type="submit" tone="glob" iconOnly icon="plus" title="Add task" />
      </form>
      {cols.map((c) => {
        const list = tasks.filter((t) => t.status === c.s);
        return (
          <div class="col gap-4" key={c.s}>
            <div class="row"><span class={`chip ${c.tone}`}>{c.label}</span><span class="dimmer ws-small">{list.length}</span></div>
            {list.map((t) => (
              <div class="ws-row ws-task" key={t.id}>
                <button type="button" class="li" title="Click to move along" onClick={() => {
                  const ns = NEXT[t.status]; set(tasks.map((x) => (x.id === t.id ? { ...x, status: ns, doneAt: ns === 'done' ? Date.now() : undefined } : x)));
                  sfx(ns === 'done' ? 'coin' : 'tick', .5);
                }}>
                  <span class={`ws-check ${t.status}`}>{t.status === 'done' ? <Icon name="check" size="sm" /> : t.status === 'doing' ? <i class="ws-spin" /> : null}</span>
                  <span class="grow" style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined, opacity: t.status === 'done' ? 0.6 : 1 }}>{t.title}</span>
                </button>
                <div class="ws-row-acts"><button type="button" title="Delete" onClick={() => set(tasks.filter((x) => x.id !== t.id))}><Icon name="trash" size="sm" /></button></div>
              </div>
            ))}
          </div>
        );
      })}
      {!tasks.length && <div class="dimmer ws-small">Claude keeps this board current on multi-step work (update_tasks).</div>}
    </div>
  );
}

// ── project ──────────────────────────────────────────────────────────────────
const COLORS = ['#7be35f', '#ff6fd6', '#52f2ff', '#ffbe3d', '#b48cff', '#ff5a5a', '#3dd6a0', '#e8ffe6'];
function ProjectTab() {
  const pid = currentProjectId();
  if (!pid) return <NoProject what="Project settings" />;
  const p = projects.value.find((x) => x.id === pid);
  if (!p) return null;
  return (
    <div class="col gap-12 ws-tabbody scroll">
      <label class="col gap-4"><span class="label">Name</span><input class="field" id="ws-proj-name" value={p.name} onChange={(e) => updateProject(pid, { name: (e.target as HTMLInputElement).value })} /></label>
      <div class="row gap-12 wrap">
        <label class="col gap-4"><span class="label">Glyph</span><input class="field" id="ws-proj-glyph" style={{ width: '72px', textAlign: 'center' }} maxLength={2} value={p.glyph} onChange={(e) => updateProject(pid, { glyph: (e.target as HTMLInputElement).value || p.glyph })} /></label>
        <div class="col gap-4"><span class="label">Color</span><div class="row gap-4">{COLORS.map((c) => <button type="button" key={c} aria-label={c} class="ws-swatch" style={{ background: c, outline: p.color === c ? '2px solid #fff' : undefined }} onClick={() => updateProject(pid, { color: c })} />)}</div></div>
      </div>
      <div class="row between"><span class="label">Game project</span><Toggle value={p.kind === 'game'} onChange={(v) => updateProject(pid, { kind: v ? 'game' : 'general' })} label="Game project" /></div>
      <label class="col gap-4"><span class="label">Description</span><textarea class="textarea" id="ws-proj-desc" rows={2} value={p.description} onChange={(e) => updateProject(pid, { description: (e.target as HTMLTextAreaElement).value })} /></label>
      <label class="col gap-4"><span class="label">Custom instructions</span><span class="dimmer ws-small">Added to every chat in this project (cached, so they're cheap after the first message).</span>
        <textarea class="textarea" id="ws-proj-instr" rows={7} value={p.instructions} placeholder="e.g. Use TypeScript + Phaser 3. Pixel art at 16px. Keep files under 300 lines." onChange={(e) => updateProject(pid, { instructions: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <div class="divider" />
      <div class="row wrap">
        <Btn size="sm" tone="ghost" onClick={() => updateProject(pid, { archived: !p.archived })}>{p.archived ? 'Unarchive' : 'Archive'}</Btn>
        <Btn size="sm" tone="danger" icon="trash" onClick={async () => {
          if (await confirmBox(`Delete “${p.name}”?`, 'Its files are deleted. Chats stay, detached from the project.', { ok: 'Delete project', danger: true })) {
            await deleteProject(pid); setFiles(pid, []); drawer.value = null; goHome(null);
          }
        }}>Delete project</Btn>
      </div>
    </div>
  );
}

export function Drawer() {
  void tick.value;
  const tab = drawer.value ?? 'files';
  const pid = currentProjectId();
  const nFiles = pid ? (filesByProject.value[pid]?.length ?? 0) : 0;
  return (
    <div class="ws-drawer-in">
      <div class="row">
        <Tabs<DrawerTab> value={tab} onChange={(t) => { drawer.value = t; }} tabs={[
          { id: 'files', label: 'Files', icon: 'folder', badge: nFiles || undefined },
          { id: 'artifacts', label: 'Artifacts', icon: 'bolt' },
          { id: 'tasks', label: 'Tasks', icon: 'tasks' },
          { id: 'project', label: 'Project', icon: 'gear' },
        ]} />
        <div class="grow" />
        <Btn size="sm" tone="ghost" iconOnly icon="close" title="Close drawer (Esc)" onClick={() => { drawer.value = null; }} />
      </div>
      <div class="ws-drawer-body">
        {tab === 'files' && <FilesTab />}
        {tab === 'artifacts' && <ArtifactsTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'project' && <ProjectTab />}
      </div>
    </div>
  );
}
