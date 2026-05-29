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

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(bar);

    const open = () => send({ type: 'lib-open', id: b.id });
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') open();
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

// ---- author promo (tracks copy / star, dismissible with a guilt-trip) ----
interface Promo {
  copied?: boolean;
  starred?: boolean;
  dismissed?: boolean;
}
const promoEl = document.getElementById('lib-promo') as HTMLElement | null;

function fullState(): Record<string, unknown> {
  return (vscode.getState() as Record<string, unknown>) ?? {};
}
// New key `promoV2` — supersedes the old `promoDismissed`, so prior closes reset.
let promo: Promo = (fullState().promoV2 as Promo) ?? {};
function savePromo() {
  vscode.setState({ ...fullState(), promoV2: promo });
}
function hidePromo() {
  promoEl?.classList.add('hidden');
}

function showThanks() {
  if (!promoEl) return;
  promoEl.innerHTML =
    '<button class="promo-close" id="promo-thx-close" title="关闭">×</button>' +
    '<div class="promo-thx">🙏 感谢支持!<br/>祝你摸鱼愉快~</div>';
  document.getElementById('promo-thx-close')?.addEventListener('click', () => {
    promo.dismissed = true;
    savePromo();
    hidePromo();
  });
}

/** If both actions are done, swap the block for a thank-you panel. */
function maybeThanks(): boolean {
  if (promo.copied && promo.starred) {
    savePromo();
    showThanks();
    return true;
  }
  return false;
}

/** Reflect already-done actions on the buttons. */
function reflectMarks() {
  if (promo.copied) {
    const b = document.getElementById('promo-copy');
    if (b) b.textContent = '已复制';
  }
  if (promo.starred) {
    const b = document.getElementById('promo-star');
    if (b) b.textContent = '⭐ 已 Star,谢谢!';
  }
}

/** Clicked × with neither action done → a small "reconsider?" popover. */
function showReconsider() {
  if (!promoEl || promoEl.querySelector('.promo-pop')) return;
  const pop = document.createElement('div');
  pop.className = 'promo-pop';
  pop.innerHTML =
    '<div class="promo-pop-text">😭 要不…再考虑一下嘛~</div>' +
    '<div class="promo-pop-actions">' +
    '<button class="promo-pop-keep" id="pop-keep">好吧再看看</button>' +
    '<button class="promo-pop-close" id="pop-close">直接关闭</button>' +
    '</div>';
  promoEl.appendChild(pop);
  document.getElementById('pop-keep')?.addEventListener('click', () => pop.remove());
  document.getElementById('pop-close')?.addEventListener('click', () => {
    promo.dismissed = true;
    savePromo();
    hidePromo();
  });
}

// init
if (promo.dismissed) {
  hidePromo();
} else if (!maybeThanks()) {
  reflectMarks();
}

document.getElementById('promo-copy')?.addEventListener('click', () => {
  send({ type: 'lib-copy', text: '1642834098' });
  promo.copied = true;
  savePromo();
  const b = document.getElementById('promo-copy');
  if (b) b.textContent = '已复制';
  maybeThanks();
});
document.getElementById('promo-star')?.addEventListener('click', () => {
  send({ type: 'lib-star' });
  promo.starred = true;
  savePromo();
  const b = document.getElementById('promo-star');
  if (b) b.textContent = '⭐ 已 Star,谢谢!';
  maybeThanks();
});
document.getElementById('promo-close')?.addEventListener('click', () => {
  if (!promo.copied && !promo.starred) {
    showReconsider();
    return;
  }
  promo.dismissed = true;
  savePromo();
  hidePromo();
});

send({ type: 'lib-ready' });
