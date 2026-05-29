// Shared data contracts between extension host and webview.

export interface BookMeta {
  id: string;
  path: string;
  title: string;
  totalChapters: number;
  totalChars: number;
}

export interface Chapter {
  index: number; // 0-based
  title: string;
  startOffset: number;
  endOffset: number;
}

export interface PageMeta {
  chapterIndex: number;
  chapterTitle: string;
  pageInChapter: number;
  pagesInChapter: number;
  charOffset: number;
  atChapterStart: boolean;
}

export type DiffLineType = 'add' | 'del' | 'ctx';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffHunk {
  fileName: string;
  lang: string;
  header: string; // e.g. "@@ -10,6 +10,8 @@"
  category: string;
  lines: DiffLine[];
}

export interface FakeTurn {
  prompt: string;
  thinking: string[];
  analysis: string;
  diff?: DiffHunk;
}

export interface StatusData {
  tokens: number;
  contextPct: number;
  filesChanged: number;
}

export interface CommandSpec {
  name: string; // canonical, e.g. "/下一页"
  aliases: string[]; // e.g. ["/n", "/next"]
  description: string;
  paramHint?: string; // e.g. "<章节号>"
  display?: string; // short command shown in the slash menu, e.g. "/next"
}

export interface SearchResult {
  chapterIndex: number;
  chapterTitle: string;
  offset: number;
  snippet: string;
}

// ---- messages: extension -> webview ----
export type ToWebview =
  | { type: 'config'; commands: CommandSpec[]; speed: string }
  | { type: 'book-loaded'; book: BookMeta; position: number }
  | { type: 'user-echo'; text: string }
  | { type: 'thinking'; lines: string[] }
  | { type: 'paragraph'; text: string; meta: PageMeta; diffs: DiffHunk[]; done?: boolean }
  | { type: 'disguise'; analysis: string; diff: DiffHunk }
  | { type: 'page-begin' }
  | { type: 'page-end' }
  | { type: 'assistant-text'; text: string; label?: string; markdown?: boolean }
  | { type: 'toc'; chapters: { index: number; title: string }[]; current: number }
  | { type: 'search-results'; query: string; results: SearchResult[] }
  | { type: 'status'; status: StatusData }
  | { type: 'active-file'; name: string }
  | { type: 'clear' }
  | { type: 'boss-enter'; turns: FakeTurn[] }
  | { type: 'boss-exit' }
  | { type: 'error'; message: string }
  | { type: 'set-input'; text: string };

// ---- messages: webview -> extension ----
export type FromWebview =
  | { type: 'ready' }
  | { type: 'command'; raw: string }
  | { type: 'request-next' }
  | { type: 'request-prev' }
  | { type: 'toggle-boss' }
  | { type: 'mouse-leave' }
  | { type: 'mouse-enter' }
  | { type: 'boss-fake-turn' }; // user pressed enter while in boss mode

// ---- library (sidebar) ----
export interface LibBook {
  id: string;
  title: string;
  progressPct: number;
  totalChapters: number;
  lastReadAt: number;
}

export type ToLibrary = { type: 'books'; books: LibBook[] };

export type FromLibrary =
  | { type: 'lib-ready' }
  | { type: 'lib-open'; id: string }
  | { type: 'lib-new' }
  | { type: 'lib-copy'; text: string }
  | { type: 'lib-star' };
