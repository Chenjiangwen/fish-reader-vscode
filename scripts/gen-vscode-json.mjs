#!/usr/bin/env node
// Generate the VS Code extension manifest (vscode.json) consumed by the
// official website (https://moyulao.cn). It always points at the latest
// published version: the Marketplace page + a direct .vsix download on OSS.
//
// Usage (see .github/workflows/release.yml):
//   node scripts/gen-vscode-json.mjs \
//     --version 0.1.1 \
//     --vsix-url https://moyulao.oss-cn-beijing.aliyuncs.com/updates/vscode/v0.1.1/fish-reader-0.1.1.vsix \
//     --marketplace https://marketplace.visualstudio.com/items?itemName=fishreader.fish-reader \
//     --out vscode.json \
//     --notes "本次更新内容…"

import { writeFileSync } from 'node:fs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const version = (arg('version', '') || '').replace(/^v/, '');
const vsix = arg('vsix-url', '');
const marketplace = arg('marketplace', '');
const out = arg('out', 'vscode.json');
const notes = arg('notes', '本次更新包含若干改进与修复。');

if (!version) throw new Error('missing --version');
if (!vsix) throw new Error('missing --vsix-url (OSS public URL)');

const manifest = {
  version: `v${version}`,
  pub_date: new Date().toISOString(),
  notes,
  // 商店页(在线安装)与 .vsix 直链(离线安装)
  marketplace: marketplace || null,
  vsix,
};

writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`wrote ${out}:`);
console.log(JSON.stringify(manifest, null, 2));
