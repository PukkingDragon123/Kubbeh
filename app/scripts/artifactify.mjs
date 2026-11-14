// Turns the single-file build (dist-single/index.html) into a claude.ai artifact page body:
// the artifact host wraps pages in its own <!doctype><html><head><body> skeleton, so we emit
// the <title>, metas, font link and <style> first, then the body markup, then the module script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

let src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');

// Cut the inlined bundle out first: it contains HTML-looking strings (<style>, <body>…)
// that would confuse the markup parsing below.
const scripts = [];
for (;;) {
  const start = src.search(/<script\b[^>]*type="module"[^>]*>/i);
  if (start < 0) break;
  const end = src.indexOf('</script>', start) + '</script>'.length;
  scripts.push(src.slice(start, end));
  src = src.slice(0, start) + src.slice(end);
}

const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>GLOB LABS</title>';
const metas = [...head.matchAll(/<meta\s+name="(?:claude:viewport-fit-sides|description)"[^>]*>/gi)].map((m) => m[0]);
const links = [...head.matchAll(/<link[^>]+fonts\.(?:googleapis|gstatic)[^>]*>/gi)].map((m) => m[0]);
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]);

// Library code (e.g. the SDK) contains a literal U+FFFD; escape it so the page has no stray replacement chars.
for (let i = 0; i < scripts.length; i++) scripts[i] = scripts[i].replace(/\uFFFD/g, '\\uFFFD');

const out = [title, ...metas, ...links, ...styles, body.trim(), ...scripts].join('\n');
mkdirSync(new URL('../dist-artifact/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-artifact/glob-labs.html', import.meta.url), out);
console.log(`dist-artifact/glob-labs.html  ${(out.length / 1024 / 1024).toFixed(2)} MB  (${scripts.length} script, ${styles.length} style)`);
