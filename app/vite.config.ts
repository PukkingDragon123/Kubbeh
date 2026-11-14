import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` inlines everything (JS, CSS, sounds) into one index.html,
// which is what gets published as a claude.ai artifact. The default build is a normal
// static site you can host anywhere (GitHub Pages, Netlify, a USB stick...).
export default defineConfig(({ mode }) => ({
  plugins: [preact(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000,
    target: 'es2022',
  },
  server: { host: true, port: 5173 },
}));
