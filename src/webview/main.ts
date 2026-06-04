import { ToWebview, CommandSpec } from '../types';
import { UI } from './dom';
import { setSpeed, bumpEpoch } from './streaming';
import { matchCommands } from '../commands/registry';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(s: unknown): void;
};

const vscode = acquireVsCodeApi();

const logEl = document.getElementById('log') as HTMLElement;
const inputEl = document.getElementById('input') as HTMLTextAreaElement;
const slashMenu = document.getElementById('slash-menu') as HTMLElement;
const bossBtn = document.getElementById('boss-btn') as HTMLButtonElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const plusBtn = document.getElementById('plus-btn') as HTMLButtonElement;
const tbHint = document.getElementById('tb-hint') as HTMLElement;
const appEl = document.getElementById('app') as HTMLElement;

let commands: CommandSpec[] = [];
let bossMode = false;
let pageAnchor = 0;

// ---- 目录(TOC)键盘导航状态 ----
// tocItems 为最近一次 /目录 渲染出的条目;tocMode 为 true 时方向键移动选中项。
let tocItems: HTMLElement[] = [];
let tocSel = -1;
let tocMode = false;

function send(msg: unknown) {
  vscode.postMessage(msg);
}

const ui = new UI(logEl, (raw: string) => {
  send({ type: 'command', raw });
});

// ---------- sequential animation queue ----------
const queue: Array<() => Promise<void>> = [];
let running = false;
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const task = queue.shift()!;
    try {
      await task();
    } catch (e) {
      console.error(e);
    }
  }
  running = false;
}
function enqueue(task: () => Promise<void>) {
  queue.push(task);
  void pump();
}

/** Instantly drop pending work + abort in-flight streams (boss switch). */
function hardReset() {
  bumpEpoch();
  queue.length = 0;
  ui.clear();
}

// ---------- incoming messages ----------
window.addEventListener('message', (ev: MessageEvent<ToWebview>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'config':
      commands = msg.commands;
      setSpeed(msg.speed);
      break;
    case 'book-loaded':
      ui.setBookTitle(msg.book.title);
      break;
    case 'user-echo':
      enqueue(async () => ui.user(msg.text));
      break;
    case 'thinking':
      enqueue(() => ui.thinking(msg.lines));
      break;
    case 'page-begin':
      // Remember where this page's content starts so we can pin the scrollbar there.
      enqueue(async () => {
        pageAnchor = logEl.scrollHeight;
      });
      break;
    case 'paragraph':
      enqueue(async () => ui.paragraph(msg.text, msg.meta, msg.diffs));
      break;
    case 'disguise':
      enqueue(async () => ui.disguiseTurn(msg.analysis, msg.diff));
      break;
    case 'page-end':
      // Pin viewport to the start of the freshly-rendered page; user scrolls down.
      enqueue(async () => {
        logEl.scrollTop = Math.min(pageAnchor, logEl.scrollHeight - logEl.clientHeight);
      });
      break;
    case 'assistant-text':
      exitTocMode(); // 正文/提示出现 → 离开目录导航态
      if (msg.markdown) enqueue(async () => ui.staticText(msg.label, msg.text, true));
      else enqueue(() => ui.streamText(msg.label, msg.text));
      break;
    case 'toc':
      enqueue(async () => {
        const r = ui.toc(msg.chapters, msg.current);
        enterTocMode(r.items, r.current);
      });
      break;
    case 'search-results':
      enqueue(async () => ui.search(msg.query, msg.results));
      break;
    case 'status':
      // status bar removed; disguise numbers are tracked server-side only.
      break;
    case 'active-file':
      ui.setActiveFile(msg.name);
      break;
    case 'clear':
      // Switching book / new session: drop everything and reset boss chrome.
      exitTocMode();
      hardReset();
      bossMode = false;
      ui.setBrand(false);
      bossBtn.classList.remove('boss-active');
      tbHint.textContent = 'Ask before edits';
      break;
    case 'error':
      enqueue(async () => ui.staticText('error', msg.message, false));
      break;
    case 'set-input':
      inputEl.value = msg.text;
      inputEl.focus();
      break;
    case 'boss-enter':
      bossMode = true;
      hardReset();
      ui.setBrand(true);
      bossBtn.classList.add('boss-active');
      tbHint.textContent = 'Edit automatically';
      for (const t of msg.turns) {
        enqueue(async () => ui.user(t.prompt));
        enqueue(() => ui.thinking(t.thinking));
        enqueue(() => ui.streamText(undefined, t.analysis));
        if (t.diff) {
          enqueue(async () => {
            const { turn } = ui.beginAssistant(`edited ${t.diff!.fileName}`);
            await ui.diff(turn, t.diff!);
          });
        }
      }
      break;
    case 'boss-exit':
      // Reset chrome + clear the boss conversation. The restored chapter then
      // arrives as the usual assistant-text + page-begin/paragraph/page-end stream.
      bossMode = false;
      hardReset();
      ui.setBrand(false);
      bossBtn.classList.remove('boss-active');
      tbHint.textContent = 'Ask before edits';
      break;
  }
});

// ---------- input + slash menu ----------
let menuItems: CommandSpec[] = [];
let menuIndex = 0;

// ---------- command history (shell-style ↑ / ↓ recall) ----------
const persisted = (vscode.getState() as { history?: string[] } | undefined) ?? {};
let history: string[] = Array.isArray(persisted.history) ? persisted.history : [];
let histIndex = history.length; // points one past the newest entry (= empty input)

function pushHistory(raw: string) {
  if (history[history.length - 1] !== raw) {
    history.push(raw);
    if (history.length > 100) history = history.slice(-100);
    vscode.setState({ ...(vscode.getState() as object), history });
  }
  histIndex = history.length;
}

function recall(dir: -1 | 1) {
  // In boss mode the only allowed command is /resume, so ↑ always recalls it.
  if (bossMode) {
    inputEl.value = '/resume';
    hideMenu();
    autoSize();
    const e = inputEl.value.length;
    inputEl.setSelectionRange(e, e);
    return;
  }
  if (!history.length) return;
  histIndex = Math.max(0, Math.min(history.length, histIndex + dir));
  const value = histIndex >= history.length ? '' : history[histIndex];
  inputEl.value = value;
  hideMenu();
  autoSize();
  const end = inputEl.value.length;
  inputEl.setSelectionRange(end, end);
}

/** The resume/恢复 command spec (the only one allowed in boss mode). */
function resumeSpec(): CommandSpec[] {
  const r = commands.find((c) => c.name === '/恢复' || c.display === '/resume');
  return r ? [r] : [];
}

function showMenu() {
  const val = inputEl.value;
  if (!val.startsWith('/') || val.includes(' ')) {
    hideMenu();
    return;
  }
  // Boss mode: only /resume is offered — every other command is hidden.
  menuItems = bossMode ? resumeSpec() : matchCommands(val);
  if (!menuItems.length) {
    hideMenu();
    return;
  }
  menuIndex = 0;
  renderMenu();
  slashMenu.classList.remove('hidden');
}

function renderMenu() {
  slashMenu.textContent = '';
  const head = document.createElement('div');
  head.className = 'slash-menu-head';
  head.textContent = 'Slash Commands';
  slashMenu.appendChild(head);
  menuItems.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'slash-item' + (i === menuIndex ? ' selected' : '');
    const name = document.createElement('span');
    name.className = 'slash-name';
    name.textContent = (c.display ?? c.name) + (c.paramHint ? ' ' + c.paramHint : '');
    const desc = document.createElement('span');
    desc.className = 'slash-desc';
    desc.textContent = c.description;
    row.appendChild(name);
    row.appendChild(desc);
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      acceptMenu(i);
    });
    slashMenu.appendChild(row);
  });
  // Keep the highlighted row visible as the user arrows up/down.
  const sel = slashMenu.querySelector('.slash-item.selected') as HTMLElement | null;
  sel?.scrollIntoView({ block: 'nearest' });
}

function hideMenu() {
  slashMenu.classList.add('hidden');
  menuItems = [];
}

function acceptMenu(i: number) {
  const c = menuItems[i];
  if (!c) return;
  inputEl.value = (c.display ?? c.name) + (c.paramHint ? ' ' : '');
  hideMenu();
  inputEl.focus();
  autoSize();
}

function submit() {
  const raw = inputEl.value.trim();
  if (!raw) return;
  send({ type: 'command', raw });
  pushHistory(raw);
  inputEl.value = '';
  hideMenu();
  autoSize();
}

function autoSize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(120, inputEl.scrollHeight) + 'px';
}

inputEl.addEventListener('input', () => {
  histIndex = history.length; // typing detaches from history navigation
  showMenu();
  autoSize();
});

// 斜杠菜单打开时的按键(↑↓ 选项 / Tab|Enter 采用 / Esc 关闭)。返回是否已处理。
function handleMenuKey(e: KeyboardEvent): boolean {
  if (e.key === 'ArrowDown') {
    menuIndex = (menuIndex + 1) % menuItems.length;
    renderMenu();
  } else if (e.key === 'ArrowUp') {
    menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
    renderMenu();
  } else if (e.key === 'Tab' || (e.key === 'Enter' && menuItems.length)) {
    acceptMenu(menuIndex);
  } else if (e.key === 'Escape') {
    hideMenu();
  } else {
    return false;
  }
  e.preventDefault();
  return true;
}

// 菜单关闭时的按键:↑↓ 回溯历史;输入框为空时 ←/→ 直接翻章。返回是否已处理。
function handleComposerKey(e: KeyboardEvent): boolean {
  if (e.key === 'ArrowUp') {
    recall(-1);
  } else if (e.key === 'ArrowDown') {
    recall(1);
  } else if (!bossMode && inputEl.value === '' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // 加载后无需先点正文区即可用方向键翻页;有内容时保留为光标移动。
    send({ type: e.key === 'ArrowLeft' ? 'request-prev' : 'request-next' });
  } else {
    return false;
  }
  e.preventDefault();
  return true;
}

inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
  const menuOpen = !slashMenu.classList.contains('hidden');
  if (menuOpen ? handleMenuKey(e) : handleComposerKey(e)) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});

bossBtn.addEventListener('click', () => {
  send({ type: 'toggle-boss' });
});

sendBtn.addEventListener('click', () => {
  submit();
  inputEl.focus();
});

// `+` opens a native file picker on the extension side to load a book.
plusBtn.addEventListener('click', () => {
  send({ type: 'pick-file' });
});

// ---------- mouse-leave auto boss ----------
appEl.addEventListener('mouseleave', () => {
  send({ type: 'mouse-leave' });
});
appEl.addEventListener('mouseenter', () => {
  send({ type: 'mouse-enter' });
});

// ---------- 阅读区 / 目录 方向键导航 ----------
// 只在阅读面板(#log)获得焦点时生效 —— 点一下正文区即进入。输入框聚焦时不抢键。
function setTocSel(i: number) {
  if (!tocItems.length) return;
  tocSel = Math.max(0, Math.min(tocItems.length - 1, i));
  tocItems.forEach((it, idx) => it.classList.toggle('toc-selected', idx === tocSel));
  tocItems[tocSel].scrollIntoView({ block: 'nearest' });
}
function enterTocMode(items: HTMLElement[], current: number) {
  tocItems = items;
  tocMode = items.length > 0;
  if (!tocMode) return;
  setTocSel(current);
  logEl.focus(); // 打开目录即可直接用方向键选择,无需先点一下
}
function exitTocMode() {
  if (!tocMode) return;
  tocMode = false;
  tocItems.forEach((it) => it.classList.remove('toc-selected'));
  tocItems = [];
  tocSel = -1;
}

logEl.addEventListener('keydown', (e: KeyboardEvent) => {
  const k = e.key;

  if (tocMode && tocItems.length) {
    if (k === 'ArrowUp' || k === 'ArrowLeft') {
      e.preventDefault();
      setTocSel(tocSel - 1);
    } else if (k === 'ArrowDown' || k === 'ArrowRight') {
      e.preventDefault();
      setTocSel(tocSel + 1);
    } else if (k === 'Enter') {
      e.preventDefault();
      const idx = tocItems[tocSel]?.dataset.idx;
      if (idx != null) {
        exitTocMode();
        send({ type: 'command', raw: `/跳转 ${Number(idx) + 1}` });
      }
    } else if (k === 'Escape') {
      e.preventDefault();
      exitTocMode();
      inputEl.focus();
    }
    return;
  }

  // 阅读态:左右翻章;上下保留原生滚动(不拦截)。
  if (k === 'ArrowLeft') {
    e.preventDefault();
    send({ type: 'request-prev' });
  } else if (k === 'ArrowRight') {
    e.preventDefault();
    send({ type: 'request-next' });
  } else if (k === 'Escape') {
    e.preventDefault();
    inputEl.focus();
  } else if (k === '/') {
    // 回到输入框并唤起斜杠命令面板
    e.preventDefault();
    inputEl.focus();
    inputEl.value = '/';
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// ---------- boot ----------
send({ type: 'ready' });
inputEl.focus();
