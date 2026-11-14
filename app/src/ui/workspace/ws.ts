// Workspace (Terminal) state and actions.
import { signal } from '@preact/signals';
import type { Chat, MsgBlock } from '../../core/types';
import { activeChatId, activeProjectId, chatIndex, loadChat, newChat, saveChat, settings } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { runTurn } from '../../claude/agent';
import { EngineError } from '../../claude/engine';
import { emptyOverride } from '../../claude/fuel';

export type DrawerTab = 'files' | 'artifacts' | 'tasks' | 'project';

/** The open chat object (mutated in place by the agent; bump `tick` to re-render). */
export const chatSig = signal<Chat | null>(null);
export const tick = signal(0);
export const running = signal<Record<string, AbortController>>({});
export const drawer = signal<DrawerTab | null>(null);
export const sidebarOpen = signal(typeof window !== 'undefined' ? window.innerWidth > 860 : true);
export const paletteOpen = signal(false);
export const artifactSel = signal<string | null>(null);
export const fileSel = signal<string | null>(null);
/** Text queued to be placed in the composer (sendToTerminal / "Build it"). */
export const composerSeed = signal<{ text: string; send?: boolean } | null>(null);
/** Shown when a send was blocked by an empty tank. */
export const fuelBlocked = signal<{ text: string; atts: MsgBlock[] } | null>(null);

export const bump = () => { tick.value++; };
export const isMobile = () => window.innerWidth <= 860;

export async function openChat(id: string) {
  const c = await loadChat(id);
  if (!c) { toast('That chat could not be loaded', 'bad'); return; }
  chatSig.value = c;
  activeChatId.value = c.id;
  activeProjectId.value = c.projectId ?? null;
  if (isMobile()) sidebarOpen.value = false;
  bump();
}

export function goHome(projectId: string | null = null) {
  chatSig.value = null;
  activeChatId.value = null;
  activeProjectId.value = projectId;
  if (isMobile()) sidebarOpen.value = false;
  bump();
}

export function isRunning(chatId?: string) { return !!(chatId && running.value[chatId]); }

export function stop(chatId: string) {
  running.value[chatId]?.abort();
  sfx('panel_close', 0.4);
}

/** Send a message in the open chat (or a fresh one in the active project). */
export async function send(text: string, attachments: MsgBlock[] = [], polishedFrom?: string): Promise<void> {
  let chat = chatSig.value;
  if (!chat) {
    chat = newChat({ projectId: activeProjectId.value ?? undefined, model: settings.value.model });
    chatSig.value = chat;
    activeChatId.value = chat.id;
  }
  if (isRunning(chat.id)) { toast('This chat is still working — stop it or wait.', 'warn'); return; }
  const ctl = new AbortController();
  running.value = { ...running.value, [chat.id]: ctl };
  sfx('send', 0.55);
  const c = chat;
  const p = runTurn({ chat: c, userText: text, attachments, signal: ctl.signal, onUpdate: () => bump() });
  // runTurn pushes the user message synchronously before its first await
  if (polishedFrom) { const u = c.messages[c.messages.length - 2]; if (u?.role === 'user') { u.polishedFrom = polishedFrom; saveChat(c); } }
  bump();
  try {
    await p;
    emptyOverride.value = false;
  } catch (err) {
    if (err instanceof EngineError && err.code === 'fuel') {
      // undo the optimistic messages, keep the draft
      c.messages.splice(-2, 2);
      saveChat(c);
      fuelBlocked.value = { text, atts: attachments };
      sfx('alarm', 0.5);
    } else if (err instanceof EngineError) {
      if (err.code === 'auth' || err.code === 'unavailable') toast(err.message, 'bad');
    } else toast(String((err as Error)?.message ?? err), 'bad');
  } finally {
    const r = { ...running.value }; delete r[c.id]; running.value = r;
    bump();
  }
}

/** Re-run the reply at assistant index `i` (drops it and its prompt, then resends). */
export function retry(i: number) {
  const c = chatSig.value; if (!c) return;
  const userIdx = i - 1;
  const u = c.messages[userIdx];
  if (!u || u.role !== 'user') return;
  const text = u.blocks.find((b) => b.type === 'text')?.type === 'text' ? (u.blocks.find((b) => b.type === 'text') as any).text : '';
  const atts = u.blocks.filter((b) => b.type === 'attachment');
  c.messages.splice(userIdx);
  if ((c.compactedUpTo ?? 0) > c.messages.length) c.compactedUpTo = c.messages.length;
  saveChat(c);
  void send(text, atts);
}

/** Edit the user message at index `i` and resend from there. */
export function editAndResend(i: number, text: string) {
  const c = chatSig.value; if (!c) return;
  const u = c.messages[i]; if (!u || u.role !== 'user') return;
  const atts = u.blocks.filter((b) => b.type === 'attachment');
  c.messages.splice(i);
  if ((c.compactedUpTo ?? 0) > c.messages.length) { c.compactedUpTo = Math.max(0, c.messages.length); }
  saveChat(c);
  void send(text, atts);
}

export function chatsForProject(pid: string | null) {
  return chatIndex.value.filter((c) => (pid ? c.projectId === pid : true));
}
