import { ToLibrary, LibBook } from '../types';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(s: unknown): void;
};

const vscode = acquireVsCodeApi();

const newBtn = document.getElementById('lib-new') as HTMLButtonElement;
const searchEl = document.getElementById('lib-search') as HTMLInputElement;
const listEl = document.getElementById('lib-list') as HTMLElement;
const emptyEl = document.getElementById('lib-empty') as HTMLElement;

let books: LibBook[] = [];
let filter = '';

function send(msg: unknown) {
  vscode.postMessage(msg);
}

function relTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return `${Math.floor(day / 30)} 个月前`;
}

function render() {
  const q = filter.trim().toLowerCase();
  const shown = q ? books.filter((b) => b.title.toLowerCase().includes(q)) : books;

  listEl.textContent = '';
  emptyEl.classList.toggle('hidden', books.length > 0);

  for (const b of shown) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'lib-title';
    title.textContent = b.title;

    const meta = document.createElement('div');
    meta.className = 'lib-meta';
    meta.textContent = `${b.totalChapters} 章 · 进度 ${b.progressPct}%${b.lastReadAt ? ' · ' + relTime(b.lastReadAt) : ''}`;

    const bar = document.createElement('div');
    bar.className = 'lib-bar';
    const fill = document.createElement('div');
    fill.className = 'lib-bar-fill';
    fill.style.width = `${b.progressPct}%`;
    bar.appendChild(fill);

    const del = document.createElement('button');
    del.className = 'lib-del';
    del.textContent = '×';
    del.title = '删除阅读记录';
    del.setAttribute('aria-label', `删除 ${b.title}`);
    del.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      send({ type: 'lib-delete', id: b.id });
    });

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(bar);
    item.appendChild(del);

    const open = () => send({ type: 'lib-open', id: b.id });
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') open();
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        send({ type: 'lib-delete', id: b.id });
      }
    });

    listEl.appendChild(item);
  }
}

window.addEventListener('message', (ev: MessageEvent<ToLibrary>) => {
  const msg = ev.data;
  if (msg.type === 'books') {
    books = msg.books;
    render();
  }
});

newBtn.addEventListener('click', () => send({ type: 'lib-new' }));
searchEl.addEventListener('input', () => {
  filter = searchEl.value;
  render();
});

// ---- GitHub 仓库入口 ----
document.getElementById('promo-github')?.addEventListener('click', () => send({ type: 'lib-star' }));

send({ type: 'lib-ready' });
