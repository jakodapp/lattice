import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const define = { __PKG_VERSION__: JSON.stringify(pkg.version) };

// Extension bundle (Node.js, CommonJS)
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: isWatch,
  minify: !isWatch,
};

// CLI bundle (Node.js, CommonJS, with shebang)
const cliConfig = {
  entryPoints: ['src/cli/index.ts'],
  bundle: true,
  outfile: 'dist/cli.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: isWatch,
  minify: !isWatch,
  banner: { js: '#!/usr/bin/env node' },
  define,
};

// Webview bundle (Browser, ESM)
const webviewConfig = {
  entryPoints: ['src/webview/index.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: isWatch,
  minify: !isWatch,
};

if (isWatch) {
  const [extCtx, webCtx, cliCtx] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
    esbuild.context(cliConfig),
  ]);
  await Promise.all([extCtx.watch(), webCtx.watch(), cliCtx.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
    esbuild.build(cliConfig),
  ]);
  console.log('Build complete.');
}
