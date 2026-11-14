// Client tools Claude can call from GLOB LABS, plus the activity mapping that tells the crew
// which alien acts out each call. Executors run in the browser against project files in
// storage, the artifact shelf, the question bubble, and the clone vat.

import type { ActivityKind, Chat, ChatMessage, MsgBlock, ProjectTask } from '../core/types';
import { bus } from '../core/bus';
import { artifacts, createProject, deleteFile, loadFiles, projects, saveChat, updateProject, upsertArtifact, writeFile } from '../core/state';
import { extOf, fmtTokens, uid } from '../core/util';
import type { ToolRunResult, ToolSpec } from './engine';

export interface ExtraToolLike { name: string; description: string; input_schema: Record<string, unknown>; kind: ActivityKind; label: (input: any) => string; run: (input: any) => Promise<string> }

export interface ToolCtx {
  chat: Chat;
  msg: ChatMessage;
  runId: string;
  agentId?: string;
  signal?: AbortSignal;
  /** Prompt text of this turn (used to tell fixing from building). */
  prompt: string;
  /** Re-render the message. */
  touch: () => void;
  /** Run clones; provided by the agent. */
  spawn?: (tasks: { title: string; instructions: string }[]) => Promise<string>;
  maxClones: number;
  extra: ExtraToolLike[];
  fileTools: boolean;
  /** Clones: no questions, no clones. */
  isClone?: boolean;
}

const CODE_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'py', 'rs', 'go', 'cs', 'cpp', 'c', 'h', 'java', 'lua', 'gd', 'glsl', 'html', 'css', 'json', 'sh', 'kt', 'swift', 'rb', 'php', 'vue', 'svelte', 'shader', 'hlsl', 'wgsl']);
const isFixPrompt = (p: string) => /\b(bug|fix|error|crash|broken|exception|fails?|failing|doesn'?t work|not working|debug)\b/i.test(p);

const S = (props: Record<string, unknown>, required: string[]) => ({ type: 'object', properties: props, required });
const str = (description: string) => ({ type: 'string', description });

export const FILE_TOOLS: ToolSpec[] = [
  { name: 'list_files', description: 'List every file in the current project with its size. Returns one path per line.', input_schema: S({}, []) },
  { name: 'read_file', description: 'Read a project file. Returns its full text (truncated after 60k chars).', input_schema: S({ path: str('Project-relative path, e.g. src/player.ts') }, ['path']) },
  { name: 'write_file', description: 'Create or overwrite a project file with the FULL contents. Use for new files or full rewrites.', input_schema: S({ path: str('Project-relative path'), content: str('Complete file contents') }, ['path', 'content']) },
  { name: 'edit_file', description: 'Edit a project file by replacing an exact string. old_string must match exactly once unless replace_all is true. Read the file first.', input_schema: S({ path: str('Project-relative path'), old_string: str('Exact text to find'), new_string: str('Replacement text'), replace_all: { type: 'boolean', description: 'Replace every occurrence' } }, ['path', 'old_string', 'new_string']) },
  { name: 'delete_file', description: 'Delete a project file.', input_schema: S({ path: str('Project-relative path') }, ['path']) },
];

export const ARTIFACT_TOOLS: ToolSpec[] = [
  { name: 'create_artifact', description: 'Show the user something to look at or play right now in the artifact viewer: a self-contained HTML page or game prototype, an SVG, a Mermaid diagram, a React component (default export), Markdown, or a code snippet. Returns the artifact id.', input_schema: S({ title: str('Short title'), kind: { type: 'string', enum: ['html', 'svg', 'markdown', 'code', 'mermaid', 'react'], description: 'Artifact type' }, content: str('Full content. HTML must be a complete self-contained document.'), language: str('For kind=code: language name') }, ['title', 'kind', 'content']) },
  { name: 'update_artifact', description: 'Replace the content of an existing artifact (keeps version history). Use the id returned by create_artifact.', input_schema: S({ id: str('Artifact id'), content: str('Full new content'), title: str('Optional new title') }, ['id', 'content']) },
];

export const ASK_TOOL: ToolSpec = {
  name: 'ask_user',
  description: 'Ask the user a blocking question. An alien runs over with a speech bubble; the user taps an option or types an answer. Returns their answer. Use sparingly, with 2–4 short options.',
  input_schema: S({ question: str('One clear question'), options: { type: 'array', items: { type: 'string' }, description: '2–4 short answer options' } }, ['question']),
};

export const CLONE_TOOL: ToolSpec = {
  name: 'spawn_clones',
  description: 'Spawn alien clones (sub-agents) that work on independent sub-tasks IN PARALLEL with project file access, then report back. Only for genuinely independent, sizeable parts. Each clone costs credits; the number that can run is limited by the fuel tank. Returns each clone\'s report.',
  input_schema: S({ tasks: { type: 'array', description: 'One entry per clone', items: S({ title: str('Short name of the sub-task'), instructions: str('Complete, self-contained instructions: goal, files to read/write, constraints') }, ['title', 'instructions']) } }, ['tasks']),
};

export const TASK_TOOL: ToolSpec = {
  name: 'update_tasks',
  description: 'Replace the project task board with the given list (keep existing titles to keep their history). Use to plan multi-step work and mark progress.',
  input_schema: S({ tasks: { type: 'array', items: S({ title: str('Task'), status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, ['title', 'status']) } }, ['tasks']),
};

/** Which alien activity + caption a tool call shows. */
export function toolMeta(name: string, input: any, prompt: string, extra: ExtraToolLike[] = []): { kind: ActivityKind; label: string } {
  const p = typeof input?.path === 'string' ? input.path : '';
  const ex = extra.find((e) => e.name === name);
  if (ex) { try { return { kind: ex.kind, label: ex.label(input ?? {}) }; } catch { return { kind: ex.kind, label: name }; } }
  switch (name) {
    case 'list_files': return { kind: 'files', label: 'Checking the file cabinet' };
    case 'read_file': return { kind: 'files', label: p ? `Fetching ${p}` : 'Fetching a file' };
    case 'write_file': return { kind: CODE_EXT.has(extOf(p)) ? 'coding' : 'files', label: p ? `Writing ${p}` : 'Writing a file' };
    case 'edit_file': return isFixPrompt(prompt) ? { kind: 'bugfix', label: p ? `Fixing ${p}` : 'Fixing a bug' } : { kind: 'coding', label: p ? `Editing ${p}` : 'Editing a file' };
    case 'delete_file': return { kind: 'files', label: p ? `Shredding ${p}` : 'Shredding a file' };
    case 'create_artifact': return { kind: 'building', label: input?.title ? `Building “${input.title}”` : 'Building an artifact' };
    case 'update_artifact': return { kind: 'building', label: input?.title ? `Rebuilding “${input.title}”` : 'Upgrading an artifact' };
    case 'ask_user': return { kind: 'question', label: 'Has a question for you' };
    case 'spawn_clones': return { kind: 'cloning', label: Array.isArray(input?.tasks) ? `Cloning ${input.tasks.length} helper${input.tasks.length === 1 ? '' : 's'}` : 'Firing up the clone vat' };
    case 'update_tasks': return { kind: 'planning', label: 'Updating the task board' };
    case 'web_search': return { kind: 'research', label: input?.query ? `Searching: ${input.query}` : 'Searching the web' };
    case 'web_fetch': {
      let host = ''; try { host = new URL(input?.url).host; } catch { /* partial */ }
      return { kind: 'research', label: host ? `Reading ${host}` : 'Reading a web page' };
    }
    case 'code_execution': case 'bash_code_execution': case 'text_editor_code_execution': return { kind: 'coding', label: 'Running code in the sandbox' };
    default: return { kind: 'building', label: name.replace(/_/g, ' ') };
  }
}

async function ensureProject(ctx: ToolCtx): Promise<string> {
  if (ctx.chat.projectId && projects.value.some((p) => p.id === ctx.chat.projectId)) return ctx.chat.projectId;
  const name = ctx.chat.title && ctx.chat.title !== 'New experiment' ? ctx.chat.title : 'Untitled experiment';
  const p = createProject({ name, kind: /game|level|player|sprite|enemy/i.test(ctx.prompt) ? 'game' : 'general' });
  ctx.chat.projectId = p.id;
  saveChat(ctx.chat);
  bus.emit('ui:toast', { text: `New project “${p.name}” created for these files`, tone: 'info', icon: 'folder' });
  return p.id;
}

function addBlock(ctx: ToolCtx, b: MsgBlock) { ctx.msg.blocks.push(b); ctx.touch(); }

export function toolSpecs(ctx: ToolCtx): ToolSpec[] {
  const specs: ToolSpec[] = [];
  if (ctx.fileTools) specs.push(...FILE_TOOLS);
  if (!ctx.isClone) {
    specs.push(...ARTIFACT_TOOLS, ASK_TOOL, TASK_TOOL);
    if (ctx.spawn) specs.push(CLONE_TOOL);
  }
  for (const e of ctx.extra) specs.push({ name: e.name, description: e.description, input_schema: e.input_schema });
  return specs;
}

export async function runTool(ctx: ToolCtx, name: string, input: any): Promise<ToolRunResult> {
  const extra = ctx.extra.find((e) => e.name === name);
  if (extra) {
    try { return { content: await extra.run(input) }; } catch (err: any) { return { content: String(err?.message ?? err), isError: true }; }
  }
  switch (name) {
    case 'list_files': {
      if (!ctx.chat.projectId) return { content: 'No project files yet. Use write_file to create the first one.' };
      const list = await loadFiles(ctx.chat.projectId);
      if (!list.length) return { content: 'The project has no files yet.' };
      return { content: list.slice().sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path} (${f.size} B${f.knowledge ? ', knowledge' : ''})`).join('\n') };
    }
    case 'read_file': {
      if (!ctx.chat.projectId) return { content: `No such file: ${input.path}`, isError: true };
      const f = (await loadFiles(ctx.chat.projectId)).find((x) => x.path === String(input.path).replace(/^\.?\/+/, ''));
      if (!f) return { content: `No such file: ${input.path}`, isError: true };
      if (f.binary) return { content: `${f.path} is a binary file (${f.mime}, ${f.size} B).` };
      return { content: f.content.length > 60_000 ? f.content.slice(0, 60_000) + '\n…[truncated]' : f.content };
    }
    case 'write_file': {
      const pid = await ensureProject(ctx);
      const { file, created } = await writeFile(pid, String(input.path), String(input.content), { source: 'claude' });
      bus.emit('file:written', { projectId: pid, path: file.path, bytes: file.size, created });
      return { content: `${created ? 'Created' : 'Updated'} ${file.path} (${file.size} B, ${String(input.content).split('\n').length} lines).` };
    }
    case 'edit_file': {
      if (!ctx.chat.projectId) return { content: `No such file: ${input.path}`, isError: true };
      const list = await loadFiles(ctx.chat.projectId);
      const path = String(input.path).replace(/^\.?\/+/, '');
      const f = list.find((x) => x.path === path);
      if (!f) return { content: `No such file: ${path}`, isError: true };
      const old = String(input.old_string), neu = String(input.new_string);
      const count = old ? f.content.split(old).length - 1 : 0;
      if (count === 0) return { content: `old_string not found in ${path}. Read the file and copy the exact text.`, isError: true };
      if (count > 1 && !input.replace_all) return { content: `old_string matches ${count} places in ${path}; add more context or set replace_all.`, isError: true };
      const next = input.replace_all ? f.content.split(old).join(neu) : f.content.replace(old, () => neu);
      const { file } = await writeFile(ctx.chat.projectId, path, next, { source: 'claude', mime: f.mime });
      bus.emit('file:written', { projectId: ctx.chat.projectId, path, bytes: file.size, created: false });
      return { content: `Edited ${path} (${count} replacement${count === 1 ? '' : 's'}).` };
    }
    case 'delete_file': {
      if (!ctx.chat.projectId) return { content: `No such file: ${input.path}`, isError: true };
      await deleteFile(ctx.chat.projectId, String(input.path));
      return { content: `Deleted ${input.path}.` };
    }
    case 'create_artifact': {
      const a = upsertArtifact({ id: undefined as unknown as string, title: String(input.title), kind: input.kind, content: String(input.content), language: input.language, chatId: ctx.chat.id, projectId: ctx.chat.projectId } as any);
      addBlock(ctx, { type: 'artifact', artifactId: a.id, title: a.title });
      bus.emit('artifact:created', { artifactId: a.id, title: a.title });
      return { content: `Created artifact ${a.id} (“${a.title}”). The user can see it now.` };
    }
    case 'update_artifact': {
      const ex = artifacts.value.find((a) => a.id === input.id);
      if (!ex) return { content: `No artifact with id ${input.id}.`, isError: true };
      const a = upsertArtifact({ ...ex, id: ex.id, content: String(input.content), title: input.title ? String(input.title) : ex.title });
      if (!ctx.msg.blocks.some((b) => b.type === 'artifact' && b.artifactId === a.id)) addBlock(ctx, { type: 'artifact', artifactId: a.id, title: a.title });
      return { content: `Updated artifact ${a.id} (version ${a.versions.length + 1}).` };
    }
    case 'ask_user': {
      if (ctx.isClone) return { content: 'Clones cannot ask questions; decide and note the assumption.', isError: true };
      const questionId = uid('q_');
      const options = Array.isArray(input.options) ? input.options.map(String).slice(0, 6) : undefined;
      const block: MsgBlock = { type: 'question', id: questionId, question: String(input.question), options };
      addBlock(ctx, block);
      const answer = await new Promise<string>((resolve) => {
        const off = bus.on('question:answered', (a) => { if (a.questionId === questionId) { off(); resolve(a.answer); } });
        ctx.signal?.addEventListener('abort', () => { off(); bus.emit('question:answered', { questionId, answer: '(no answer — the user stopped the turn)' }); resolve('(no answer — the user stopped the turn)'); }, { once: true });
        bus.emit('question:ask', { runId: ctx.runId, questionId, question: String(input.question), options });
      });
      (block as any).answer = answer;
      ctx.touch();
      return { content: `User answered: ${answer}` };
    }
    case 'spawn_clones': {
      if (!ctx.spawn || ctx.isClone) return { content: 'Clones cannot spawn clones.', isError: true };
      const tasks = (Array.isArray(input.tasks) ? input.tasks : []).filter((t: any) => t?.title && t?.instructions);
      if (!tasks.length) return { content: 'No valid tasks given.', isError: true };
      if (ctx.maxClones <= 0) return { content: 'The clone vat is offline: the fuel tank is low, so Auto-Saver disabled sub-agents. Do these tasks yourself, sequentially and concisely.' };
      return { content: await ctx.spawn(tasks) };
    }
    case 'update_tasks': {
      const pid = await ensureProject(ctx);
      const proj = projects.value.find((p) => p.id === pid);
      const old = proj?.tasks ?? [];
      const next: ProjectTask[] = (Array.isArray(input.tasks) ? input.tasks : []).slice(0, 60).map((t: any) => {
        const prev = old.find((o) => o.title === t.title);
        const status = (['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo') as ProjectTask['status'];
        return { id: prev?.id ?? uid('task_'), title: String(t.title), status, createdAt: prev?.createdAt ?? Date.now(), doneAt: status === 'done' ? prev?.doneAt ?? Date.now() : undefined };
      });
      updateProject(pid, { tasks: next });
      const done = next.filter((t) => t.status === 'done').length;
      return { content: `Task board updated: ${done}/${next.length} done.` };
    }
    default:
      return { content: `Unknown tool ${name}`, isError: true };
  }
}

export const describeUsage = (u: { input: number; output: number; cacheRead: number }) =>
  `${fmtTokens(u.input + u.cacheRead)} in · ${fmtTokens(u.output)} out`;
