// Markdown → sanitized HTML with phosphor-themed syntax highlighting and code-block toolbars.
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import lua from 'highlight.js/lib/languages/lua';
import glsl from 'highlight.js/lib/languages/glsl';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import { useMemo } from 'preact/hooks';

const LANGS: Record<string, any> = { javascript, typescript, python, json, css, xml, bash, csharp, cpp, rust, go, lua, glsl, yaml, markdown };
for (const [n, l] of Object.entries(LANGS)) hljs.registerLanguage(n, l);
const ALIAS: Record<string, string> = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', html: 'xml', svg: 'xml', sh: 'bash', shell: 'bash', zsh: 'bash', 'c#': 'csharp', cs: 'csharp', 'c++': 'cpp', c: 'cpp', h: 'cpp', rs: 'rust', yml: 'yaml', md: 'markdown', gdscript: 'python', gd: 'python', hlsl: 'glsl', wgsl: 'glsl', shader: 'glsl' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function highlight(code: string, lang?: string): string {
  const l = lang ? (ALIAS[lang.toLowerCase()] ?? lang.toLowerCase()) : '';
  if (l && hljs.getLanguage(l)) { try { return hljs.highlight(code, { language: l, ignoreIllegals: true }).value; } catch { /* fall through */ } }
  return esc(code);
}

const md = new Marked({ gfm: true, breaks: false });
let blockSeq = 0;
md.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang ?? '').split(/\s+/)[0];
      const id = `cb${++blockSeq}`;
      return `<div class="ws-code" data-code-id="${id}"><div class="ws-code-bar"><span class="ws-code-lang">${esc(language || 'text')}</span><button type="button" class="ws-code-btn" data-act="copy">Copy</button><button type="button" class="ws-code-btn" data-act="save" data-lang="${esc(language)}">Save to project</button></div><pre><code class="hljs">${highlight(text, language)}</code></pre></div>`;
    },
    link({ href, title, tokens }: any) {
      const text = (this as any).parser.parseInline(tokens);
      return `<a href="${esc(href ?? '')}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
});

export function renderMarkdown(text: string): string {
  const html = md.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-act', 'data-lang', 'data-code-id'], FORBID_TAGS: ['style', 'iframe', 'form', 'input'] });
}

export function Markdown({ text, class: cls = '' }: { text: string; class?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div class={`md ${cls}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
