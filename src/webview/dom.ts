import { DiffHunk, DiffLine, PageMeta, SearchResult } from '../types';
import { typeInto, revealLines } from './streaming';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Minimal markdown: fenced code blocks, **bold**, `inline`, newlines. */
function renderMarkdown(container: HTMLElement, md: string) {
  const parts = md.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const pre = el('pre', 'code-block');
      pre.textContent = part.replace(/^\n/, '').replace(/\n$/, '');
      container.appendChild(pre);
    } else {
      renderInline(container, part);
    }
  });
}

function renderInline(container: HTMLElement, text: string) {
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (idx > 0) container.appendChild(document.createElement('br'));
    const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const tk of tokens) {
      if (!tk) continue;
      if (tk.startsWith('**') && tk.endsWith('**')) {
        container.appendChild(el('strong', undefined, tk.slice(2, -2)));
      } else if (tk.startsWith('`') && tk.endsWith('`')) {
        container.appendChild(el('code', 'inline-code', tk.slice(1, -1)));
      } else {
        container.appendChild(document.createTextNode(tk));
      }
    }
  });
}

export type CommandSink = (raw: string) => void;

export class UI {
  private brandName: HTMLElement;
  private brandIcon: HTMLElement;
  private brandSub: HTMLElement;
  private fileChip: HTMLElement;

  constructor(
    private log: HTMLElement,
    private sink: CommandSink
  ) {
    this.brandName = document.getElementById('brand-name')!;
    this.brandIcon = document.getElementById('brand-icon')!;
    this.brandSub = document.getElementById('brand-sub')!;
    this.fileChip = document.getElementById('file-chip')!;
  }

  scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  clear() {
    this.log.textContent = '';
  }

  system(text: string) {
    const turn = el('div', 'turn system-turn');
    turn.appendChild(el('span', 'prefix system-prefix', 'system'));
    turn.appendChild(el('span', 'system-text', text));
    this.log.appendChild(turn);
    this.scroll();
  }

  // ---- user line ----
  user(text: string) {
    const turn = el('div', 'turn user-turn');
    const prefix = el('span', 'prefix user-prefix', '> user');
    const body = el('span', 'user-text', text);
    turn.appendChild(prefix);
    turn.appendChild(body);
    this.log.appendChild(turn);
    this.scroll();
  }

  // ---- thinking block ----
  async thinking(lines: string[]) {
    const turn = el('div', 'turn');
    const head = el('div', 'thinking-head');
    head.appendChild(el('span', 'thinking-dot', '●'));
    head.appendChild(el('span', 'thinking-label', 'thinking...'));
    turn.appendChild(head);
    const logBox = el('div', 'thinking-log');
    turn.appendChild(logBox);
    this.log.appendChild(turn);

    await revealLines(
      lines,
      (line) => logBox.appendChild(el('div', 'thinking-line', line)),
      () => this.scroll()
    );
  }

  /** Begin an assistant turn; returns the text body element for streaming. */
  beginAssistant(label?: string): { turn: HTMLElement; body: HTMLElement } {
    const turn = el('div', 'turn');
    const head = el('div', 'assistant-head');
    head.appendChild(el('span', 'prefix assistant-prefix', '● assistant'));
    if (label) head.appendChild(el('span', 'assistant-label muted', label));
    turn.appendChild(head);
    const body = el('div', 'assistant-body');
    turn.appendChild(body);
    this.log.appendChild(turn);
    return { turn, body };
  }

  async streamText(label: string | undefined, text: string) {
    const { body } = this.beginAssistant(label);
    const cursor = el('span', 'cursor');
    body.appendChild(cursor);
    const textSpan = el('span');
    body.insertBefore(textSpan, cursor);
    await typeInto(textSpan, text, () => this.scroll());
    cursor.remove();
  }

  /** Render assistant text that may contain markdown (no char streaming). */
  staticText(label: string | undefined, md: string, markdown: boolean) {
    const { body } = this.beginAssistant(label);
    if (markdown) renderMarkdown(body, md);
    else renderInline(body, md);
    this.scroll();
  }

  // ---- paragraph (novel content) — rendered instantly, no streaming ----
  paragraph(text: string, meta: PageMeta, diffs: DiffHunk[]) {
    const { turn, body } = this.beginAssistant(undefined);

    if (meta.atChapterStart) {
      body.appendChild(el('div', 'chapter-enter', `已进入: ${meta.chapterTitle}`));
    } else {
      const textSpan = el('div', 'novel-text');
      textSpan.textContent = text;
      body.appendChild(textSpan);
    }

    for (const d of diffs) this.diff(turn, d, true);
  }

  /** A disguise turn inserted between paragraphs: analysis line + a diff (instant). */
  disguiseTurn(analysis: string, hunk: DiffHunk) {
    const { turn, body } = this.beginAssistant(`edited ${hunk.fileName}`);
    const textSpan = el('div');
    textSpan.textContent = analysis;
    body.appendChild(textSpan);
    this.diff(turn, hunk, true);
  }

  // ---- diff block ----
  async diff(parent: HTMLElement, hunk: DiffHunk, instant = false) {
    const block = el('div', 'diff-block');
    const head = el('div', 'diff-head');
    head.appendChild(el('span', 'diff-file', hunk.fileName));
    head.appendChild(el('span', 'diff-meta muted', hunk.header));
    block.appendChild(head);
    const bodyEl = el('div', 'diff-body');
    block.appendChild(bodyEl);
    parent.appendChild(block);

    const appendLine = (line: DiffLine) => {
      const row = el('div', `diff-line diff-${line.type}`);
      const sign = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
      row.appendChild(el('span', 'diff-sign', sign));
      row.appendChild(el('span', 'diff-code', line.text));
      bodyEl.appendChild(row);
    };

    if (instant) {
      hunk.lines.forEach(appendLine);
    } else {
      await revealLines(hunk.lines, appendLine, () => this.scroll());
    }
  }

  // ---- toc ----
  // Returns the rendered items + the array position of the current chapter,
  // so the caller can wire keyboard navigation / selection highlight.
  toc(
    chapters: { index: number; title: string }[],
    current: number
  ): { items: HTMLElement[]; current: number } {
    const { body } = this.beginAssistant('目录');
    const list = el('div', 'toc-list');
    const items: HTMLElement[] = [];
    let currentPos = -1;
    chapters.forEach((c, pos) => {
      const isCurrent = c.index === current;
      const item = el('div', 'toc-item' + (isCurrent ? ' toc-current' : ''));
      item.dataset.idx = String(c.index); // 0-based chapter index, for /跳转
      item.textContent = `${c.index + 1}. ${c.title}`;
      if (isCurrent) {
        item.appendChild(el('span', 'toc-current-tag', '当前'));
        currentPos = pos;
      }
      item.addEventListener('click', () => this.sink(`/跳转 ${c.index + 1}`));
      list.appendChild(item);
      items.push(item);
    });
    body.appendChild(list);
    // Locate the current chapter so it's visible even in a long book.
    if (currentPos >= 0) items[currentPos].scrollIntoView({ block: 'center' });
    else this.scroll();
    return { items, current: currentPos >= 0 ? currentPos : 0 };
  }

  // ---- search ----
  search(query: string, results: SearchResult[]) {
    const { body } = this.beginAssistant(`search "${query}"`);
    if (!results.length) {
      body.appendChild(el('div', undefined, `没有找到 "${query}"`));
      this.scroll();
      return;
    }
    body.appendChild(el('div', 'muted', `${results.length} 处匹配:`));
    const list = el('div', 'search-list');
    results.forEach((r) => {
      const item = el('div', 'search-item');
      item.appendChild(el('span', 'search-chap muted', `[${r.chapterTitle}] `));
      item.appendChild(el('span', undefined, r.snippet));
      item.addEventListener('click', () => this.sink(`/跳转 ${r.chapterIndex + 1}`));
      list.appendChild(item);
    });
    body.appendChild(list);
    this.scroll();
  }

  // ---- chrome ----
  private bookTitle = '';

  /** Always present as "Claude". The book name shows only outside boss mode. */
  setBrand(boss: boolean) {
    this.brandName.textContent = 'Claude';
    this.brandIcon.textContent = '✳';
    this.brandSub.textContent = boss ? '' : this.bookTitle ? `· ${this.bookTitle}` : '';
  }

  setBookTitle(title: string) {
    this.bookTitle = title || '';
    this.brandSub.textContent = this.bookTitle ? `· ${this.bookTitle}` : '';
  }

  setActiveFile(name: string) {
    this.fileChip.textContent = name || '';
  }
}
