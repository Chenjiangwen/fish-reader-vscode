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
      if (msg.markdown) enqueue(async () => ui.staticText(msg.label, msg.text, true));
      else enqueue(() => ui.streamText(msg.label, msg.text));
      break;
    case 'toc':
      enqueue(async () => ui.toc(msg.chapters, msg.current));
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

inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
  const menuOpen = !slashMenu.classList.contains('hidden');
  if (menuOpen) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      menuIndex = (menuIndex + 1) % menuItems.length;
      renderMenu();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
      renderMenu();
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && menuItems.length)) {
      e.preventDefault();
      acceptMenu(menuIndex);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideMenu();
      return;
    }
  } else {
    // Menu closed: ↑ / ↓ walk command history (one Up + Enter to repeat /n).
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      recall(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      recall(1);
      return;
    }
  }
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

// `+` is decorative (matches Claude Code's add-context affordance); focus input.
plusBtn.addEventListener('click', () => {
  inputEl.focus();
});

// ---------- mouse-leave auto boss ----------
appEl.addEventListener('mouseleave', () => {
  send({ type: 'mouse-leave' });
});
appEl.addEventListener('mouseenter', () => {
  send({ type: 'mouse-enter' });
});

// ---------- drag & drop -> /init ----------
appEl.addEventListener('dragover', (e) => {
  e.preventDefault();
});
appEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  if (!dt) return;
  // VSCode provides the resource path in 'text/uri-list' or plain text.
  const uri = dt.getData('text/uri-list') || dt.getData('text');
  if (uri) {
    let path = uri.trim().split('\n')[0];
    path = path.replace(/^file:\/\//, '');
    try {
      path = decodeURIComponent(path);
    } catch {
      /* ignore */
    }
    inputEl.value = `/init ${path}`;
    inputEl.focus();
    autoSize();
  }
});

// ---------- boot ----------
send({ type: 'ready' });
inputEl.focus();
