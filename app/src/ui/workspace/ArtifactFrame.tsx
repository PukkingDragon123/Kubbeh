// Artifact viewer: sandboxed iframe (scripts allowed, no same-origin) for HTML/SVG/React/Mermaid,
// rendered Markdown, highlighted code. Versions, copy, download, pop-out.
import { useState } from 'preact/hooks';
import type { Artifact } from '../../core/types';
import { artifacts, setPanel } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { saveFile } from '../../core/download';
import { Btn, Empty, Seg, Win, copyText } from '../common/kit';
import { Markdown, highlight } from './Markdown';
import { artifactSel } from './ws';

const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const BABEL = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.4/babel.min.js';
const MERMAID = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js';
const BASE_CSS = 'html,body{margin:0;background:#0b130e;color:#e8ffe6;font-family:system-ui,sans-serif}';

export function srcdocFor(a: Pick<Artifact, 'kind' | 'content'>): string | null {
  switch (a.kind) {
    case 'html': return /<html|<!doctype/i.test(a.content) ? a.content : `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${a.content}</body></html>`;
    case 'svg': return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}body{display:grid;place-items:center;min-height:100vh}svg{max-width:100%;height:auto}</style></head><body>${a.content}</body></html>`;
    case 'mermaid': return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}body{padding:16px}</style><script src="${MERMAID}"></script></head><body><pre class="mermaid">${a.content.replace(/</g, '&lt;')}</pre><script>mermaid.initialize({startOnLoad:true,theme:'dark'})</script></body></html>`;
    case 'react': {
      const code = a.content.replace(/export\s+default\s+function\s+(\w+)/, 'function $1').replace(/export\s+default\s+(\w+);?/, '').replace(/^\s*import[^\n]*\n/gm, '');
      const name = /export\s+default\s+function\s+(\w+)/.exec(a.content)?.[1] ?? /export\s+default\s+(\w+)/.exec(a.content)?.[1] ?? 'App';
      return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style><script src="${REACT}"></script><script src="${REACT_DOM}"></script><script src="${BABEL}"></script></head><body><div id="root"></div><script type="text/babel" data-presets="react">const {useState,useEffect,useRef,useMemo,useCallback,useReducer}=React;\n${code}\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${name}));</script></body></html>`;
    }
    default: return null;
  }
}

const EXT: Record<string, string> = { html: 'html', svg: 'svg', markdown: 'md', mermaid: 'mmd', react: 'jsx', code: 'txt' };

export function ArtifactView({ a, tall }: { a: Artifact; tall?: boolean }) {
  const [mode, setMode] = useState<'preview' | 'code'>(a.kind === 'code' ? 'code' : 'preview');
  const [ver, setVer] = useState<number>(-1); // -1 = latest
  const content = ver < 0 ? a.content : a.versions[ver]?.content ?? a.content;
  const doc = srcdocFor({ kind: a.kind, content });
  const [key, setKey] = useState(0);
  return (
    <div class={`ws-artview ${tall ? 'tall' : ''}`}>
      <div class="row wrap ws-artbar">
        <b class="ellipsis grow">{a.title}</b>
        {a.kind !== 'code' && <Seg value={mode} onChange={setMode} options={[{ value: 'preview', label: 'Preview' }, { value: 'code', label: 'Code' }]} />}
        {a.versions.length > 0 && (
          <select class="select ws-mini" aria-label="Version" value={ver} onChange={(e) => setVer(Number((e.target as HTMLSelectElement).value))}>
            <option value={-1}>v{a.versions.length + 1} (latest)</option>
            {a.versions.map((_, i) => <option key={i} value={i}>v{i + 1}</option>).reverse()}
          </select>
        )}
        {doc && mode === 'preview' && <Btn size="sm" tone="ghost" iconOnly icon="refresh" title="Reload" onClick={() => setKey(key + 1)} />}
        <Btn size="sm" tone="ghost" iconOnly icon="copy" title="Copy source" onClick={async () => { if (await copyText(content)) toast('Copied', 'good'); }} />
        <Btn size="sm" tone="ghost" iconOnly icon="download" title="Download" onClick={() => void saveFile(`${a.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'artifact'}.${a.kind === 'code' ? (a.language ?? 'txt') : EXT[a.kind]}`, content, a.kind === 'html' ? 'text/html' : 'text/plain')} />
        {!tall && <Btn size="sm" tone="ghost" iconOnly icon="widget" title="Open large" onClick={() => setPanel('artifact', a.id)} />}
      </div>
      <div class="ws-artbody">
        {mode === 'preview' && doc ? (
          <iframe key={key} class="ws-frame" title={a.title} sandbox="allow-scripts allow-pointer-lock allow-popups" srcdoc={doc} />
        ) : mode === 'preview' && a.kind === 'markdown' ? (
          <div class="scroll ws-artmd"><Markdown text={content} /></div>
        ) : (
          <pre class="ws-artcode scroll"><code class="hljs" dangerouslySetInnerHTML={{ __html: highlight(content, a.kind === 'code' ? a.language : a.kind === 'react' ? 'javascript' : a.kind === 'svg' || a.kind === 'html' ? 'xml' : 'markdown') }} /></pre>
        )}
      </div>
    </div>
  );
}

/** Large artifact panel (opened with arg = artifact id). */
export function ArtifactPanel({ arg, close }: { arg: unknown; close: () => void }) {
  const id = typeof arg === 'string' ? arg : artifactSel.value;
  const a = artifacts.value.find((x) => x.id === id);
  return (
    <Win title={a ? a.title : 'Artifact'} icon="bolt" onClose={close}>
      {a ? <ArtifactView a={a} tall /> : <Empty title="Artifact not found">It may belong to another account.</Empty>}
    </Win>
  );
}

void sfx;
