#!/usr/bin/env node
// Interactive release helper.
//
//   pnpm release   (或 npm run release)
//
// 流程:
//   1. 显示当前版本(读 package.json)
//   2. 让你输入新版本(校验 semver,必须 > 当前)
//   3. 写回 package.json 的 version
//   4. 若有 RELEASE_NOTES.md,展示给你确认(它会原样进 vscode.json 的 notes)
//   5. 确认后:git add -A → commit "release: v<x>" → tag -a v<x> → push --follow-tags
//
// 推送 tag 会触发 .github/workflows/release.yml:
//   打包 .vsix → 发布到 VS Code 商店 → 回传 OSS → 更新 vscode.json → 建 Release。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(root, 'package.json');
const NOTES = join(root, 'RELEASE_NOTES.md');

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
};

function die(msg) {
  console.error(C.r(`\n✖ ${msg}\n`));
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

// 比较 "a.b.c" 两个版本 → 1 / 0 / -1
function cmpSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

const rl = createInterface({ input, output });

try {
  // --- 前置:确认是 git 仓库,并展示待提交改动 ---
  let branch;
  try {
    branch = sh('git rev-parse --abbrev-ref HEAD');
  } catch {
    die('当前目录不是 git 仓库。');
  }

  const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
  const current = pkg.version;
  console.log(`\n  当前版本:  ${C.b(C.y('v' + current))}`);
  console.log(C.dim(`  当前分支:  ${branch}`));

  const status = sh('git status --porcelain');
  if (status) {
    console.log(C.dim('\n  检测到未提交的改动(将一并提交):'));
    console.log(
      status
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n')
    );
  }

  // --- 输入新版本 ---
  const answer = (await rl.question(`\n  ${C.b('要发布的新版本')} (例如 ${suggestNext(current)}): `))
    .trim()
    .replace(/^v/, '');
  if (!answer) die('未输入版本号,已取消。');
  if (!/^\d+\.\d+\.\d+$/.test(answer)) die(`版本号格式不对: "${answer}"(应为 x.y.z)。`);
  if (cmpSemver(answer, current) <= 0) die(`新版本 v${answer} 必须大于当前 v${current}。`);

  const tag = `v${answer}`;
  const tags = sh('git tag --list').split('\n');
  if (tags.includes(tag)) die(`tag ${tag} 已存在。`);

  // --- 复核更新说明(RELEASE_NOTES.md → vscode.json 的 notes → 官网展示) ---
  if (existsSync(NOTES)) {
    const notesText = readFileSync(NOTES, 'utf8').trim();
    console.log(`\n  ${C.b('本次更新说明')} ${C.dim('(RELEASE_NOTES.md):')}`);
    console.log(
      (notesText || '(空)')
        .split('\n')
        .map((l) => C.dim('    │ ') + l)
        .join('\n')
    );
    const ok = (await rl.question(`\n  这段就是要展示的更新说明? (${C.b('y')} 继续 / n 先去改): `))
      .trim()
      .toLowerCase();
    if (ok !== 'y' && ok !== 'yes') {
      die('已取消。请编辑 RELEASE_NOTES.md 后重新运行 pnpm release。');
    }
  } else {
    console.log(C.y('\n  ⚠ 未找到 RELEASE_NOTES.md —— 更新说明将回退为本次提交主题。'));
    const ok = (await rl.question(`  继续? (${C.b('y')} / n): `)).trim().toLowerCase();
    if (ok !== 'y' && ok !== 'yes') die('已取消。');
  }

  // --- 写回 package.json version ---
  bumpJsonVersion(PKG, answer);
  console.log(C.g(`\n  ✓ 已更新 package.json → v${answer}`));

  // --- 确认不可逆操作(commit + push + 触发 CI 发布) ---
  console.log(C.dim('\n  接下来将执行:'));
  console.log(C.dim(`    • git add -A`));
  console.log(C.dim(`    • git commit -m "release: ${tag}"`));
  console.log(C.dim(`    • git tag -a ${tag}`));
  console.log(C.dim(`    • git push origin ${branch} --follow-tags`));
  console.log(C.dim(`    → 触发 GitHub Actions:打包 .vsix / 回传 OSS / 更新 vscode.json / 建 Release`));

  const ok = (await rl.question(`\n  确认提交并推送? 这会触发线上发布 (${C.b('y')}/N): `))
    .trim()
    .toLowerCase();
  if (ok !== 'y' && ok !== 'yes') {
    console.log(C.y('\n  已取消。版本号改动保留在工作区(未提交),可手动还原或重跑。\n'));
    process.exit(0);
  }

  // --- commit / tag / push ---
  rl.close();
  console.log('');
  run(`git add -A`);
  run(`git commit -m "release: ${tag}"`);
  // 注释 tag,这样 `git push --follow-tags` 才会推它(轻量 tag 不会被推)
  run(`git tag -a ${tag} -m "release ${tag}"`);
  run(`git push origin ${branch} --follow-tags`);

  console.log(C.g(`\n  ✓ 已推送 ${tag}。前往 GitHub Actions 查看构建进度。`));
  console.log(C.dim(`    完成后 .vsix 与 vscode.json 会上传到 OSS;到 Release 下载 .vsix`));
  console.log(C.dim(`    手动传到 marketplace.visualstudio.com/manage 即可发布到商店。\n`));
} finally {
  rl.close();
}

// ---------------------------------------------------------------------------

function run(cmd) {
  console.log(C.dim(`  $ ${cmd}`));
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function suggestNext(v) {
  const p = v.split('.').map(Number);
  return `${p[0]}.${p[1]}.${(p[2] || 0) + 1}`;
}

// 只替换顶层的 "version": "..."
function bumpJsonVersion(file, version) {
  const raw = readFileSync(file, 'utf8');
  const next = raw.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
  if (next === raw) die(`未能在 ${file} 找到 version 字段。`);
  writeFileSync(file, next);
}
