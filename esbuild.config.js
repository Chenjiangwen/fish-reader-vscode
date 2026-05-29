// @ts-check
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Copy static webview assets (CSS / HTML are inlined separately, only CSS needed) */
function copyAssets() {
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
  const css = path.join(__dirname, 'src', 'webview', 'styles.css');
  if (fs.existsSync(css)) {
    fs.copyFileSync(css, path.join(distDir, 'styles.css'));
  }
}

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const libraryConfig = {
  entryPoints: ['src/webview/library.ts'],
  bundle: true,
  outfile: 'dist/library.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function main() {
  copyAssets();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    const ctxLib = await esbuild.context(libraryConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch(), ctxLib.watch()]);
    // re-copy css on a simple interval during watch
    fs.watchFile(path.join(__dirname, 'src', 'webview', 'styles.css'), copyAssets);
    console.log('[fishreader] watching…');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
      esbuild.build(libraryConfig),
    ]);
    copyAssets();
    console.log('[fishreader] build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
