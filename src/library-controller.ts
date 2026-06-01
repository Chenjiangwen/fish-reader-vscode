import { ToLibrary, FromLibrary, LibBook } from './types';
import { StateStore } from './engine/state';

/** Drives the sidebar library list (Claude-Code-style conversation list). */
export class LibraryController {
  constructor(
    private post: (msg: ToLibrary) => void,
    private state: StateStore,
    private onOpen: (id: string) => void,
    private onNew: () => void,
    private onCopy: (text: string) => void,
    private onStar: () => void,
    private onDelete: (id: string) => Promise<boolean>
  ) {}

  handle(msg: FromLibrary) {
    switch (msg.type) {
      case 'lib-ready':
        this.refresh();
        break;
      case 'lib-open':
        this.onOpen(msg.id);
        break;
      case 'lib-new':
        this.onNew();
        break;
      case 'lib-delete':
        void this.onDelete(msg.id).then((deleted) => {
          if (deleted) this.refresh();
        });
        break;
      case 'lib-copy':
        this.onCopy(msg.text);
        break;
      case 'lib-star':
        this.onStar();
        break;
    }
  }

  /** Push the current book list to the sidebar. */
  refresh() {
    const books: LibBook[] = this.state
      .getBooks()
      .slice()
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
      .map((b) => ({
        id: b.id,
        title: b.title,
        progressPct: b.totalChars > 0 ? Math.min(100, Math.round((b.position / b.totalChars) * 100)) : 0,
        totalChapters: b.totalChapters,
        lastReadAt: b.lastReadAt,
      }));
    this.post({ type: 'books', books });
  }
}
