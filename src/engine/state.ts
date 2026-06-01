// Progress persistence on top of a Memento-like store (vscode globalState).

export interface Bookmark {
  offset: number;
  label: string;
  createdAt: number;
}

export interface BookRecord {
  id: string;
  path: string;
  title: string;
  totalChapters: number;
  totalChars: number;
  position: number; // start offset of the last shown segment
  lastReadAt: number;
  bookmarks: Bookmark[];
}

interface StoreShape {
  books: BookRecord[];
  lastBookId?: string;
}

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | void;
}

const KEY = 'fishReader.state';

/** Stable id derived from a file path (FNV-1a hash, hex). */
export function bookId(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export class StateStore {
  constructor(private readonly memento: MementoLike) {}

  private read(): StoreShape {
    return this.memento.get<StoreShape>(KEY) ?? { books: [] };
  }

  private write(s: StoreShape) {
    this.memento.update(KEY, s);
  }

  getBooks(): BookRecord[] {
    return this.read().books;
  }

  getBook(id: string): BookRecord | undefined {
    return this.read().books.find((b) => b.id === id);
  }

  getLastBook(): BookRecord | undefined {
    const s = this.read();
    return s.lastBookId ? s.books.find((b) => b.id === s.lastBookId) : undefined;
  }

  upsertBook(rec: BookRecord): void {
    const s = this.read();
    const i = s.books.findIndex((b) => b.id === rec.id);
    if (i === -1) s.books.push(rec);
    else s.books[i] = { ...s.books[i], ...rec };
    s.lastBookId = rec.id;
    this.write(s);
  }

  deleteBook(id: string): void {
    const s = this.read();
    s.books = s.books.filter((b) => b.id !== id);
    if (s.lastBookId === id) s.lastBookId = undefined;
    this.write(s);
  }

  setPosition(id: string, position: number): void {
    const s = this.read();
    const b = s.books.find((bk) => bk.id === id);
    if (b) {
      b.position = position;
      b.lastReadAt = Date.now();
      s.lastBookId = id;
      this.write(s);
    }
  }

  setLastBook(id: string): void {
    const s = this.read();
    s.lastBookId = id;
    this.write(s);
  }

  addBookmark(id: string, bm: Bookmark): void {
    const s = this.read();
    const b = s.books.find((bk) => bk.id === id);
    if (b) {
      b.bookmarks.push(bm);
      this.write(s);
    }
  }
}
