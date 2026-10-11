// Bundles the plugin into dist/ — load it in Chrome via chrome://extensions → Load unpacked.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const common = {
  bundle: true,
  target: 'chrome120',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
};
const builds = [
  // Content scripts run as classic scripts: one self-contained IIFE.
  { ...common, entryPoints: ['src/content.ts'], outfile: 'dist/content.js', format: 'iife' },
  { ...common, entryPoints: ['src/paste.ts'], outfile: 'dist/paste.js', format: 'iife' },
  { ...common, entryPoints: ['src/background.ts'], outfile: 'dist/background.js', format: 'esm' },
  {
    ...common,
    entryPoints: ['src/sidepanel/main.tsx'],
    outfile: 'dist/sidepanel.js',
    format: 'esm',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
    minify: !watch,
  },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
