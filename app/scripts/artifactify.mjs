// Turns the single-file build (dist-single/index.html) into a claude.ai artifact page body:
// the artifact host wraps pages in its own <!doctype><html><head><body> skeleton, so we emit
// the <title>, metas, font link and <style> first, then the body markup, then the module script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>GLOB LABS</title>';
const metas = [...head.matchAll(/<meta\s+name="(?:claude:viewport-fit-sides|description)"[^>]*>/gi)].map((m) => m[0]);
const links = [...head.matchAll(/<link[^>]+fonts\.(?:googleapis|gstatic)[^>]*>/gi)].map((m) => m[0]);
const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0]);
const scripts = [...src.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map((m) => m[0]).filter((s) => !/src=/.test(s.slice(0, s.indexOf('>'))));
const bodyMarkup = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').trim();

const out = [title, ...metas, ...links, ...styles, bodyMarkup, ...scripts].join('\n');
mkdirSync(new URL('../dist-artifact/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-artifact/glob-labs.html', import.meta.url), out);
console.log(`dist-artifact/glob-labs.html  ${(out.length / 1024 / 1024).toFixed(2)} MB  (${scripts.length} script, ${styles.length} style)`);
