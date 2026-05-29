import * as vscode from 'vscode';
import { Controller } from './controller';
import { LibraryController } from './library-controller';
import { StateStore } from './engine/state';
import { WorkspaceScanner } from './disguise/workspace-scanner';
import { FromWebview, ToWebview, FromLibrary, ToLibrary } from './types';
import { getHtml, getLibraryHtml } from './webviewHtml';
import { HostRegistry } from './hosts';

export interface OpenIntent {
  bookId?: string;
  newSession?: boolean;
}

/** Sidebar (activity-bar) webview: the Claude-Code-style library list. */
export class FishReaderViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'fishReader.view';

  private view?: vscode.WebviewView;
  public library?: LibraryController;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: StateStore,
    private readonly onOpenBook: (id: string) => void,
    private readonly onNewSession: () => void,
    private readonly repoUrl: string
  ) {}

  private copyText(text: string) {
    void vscode.env.clipboard.writeText(text);
    void vscode.window.showInformationMessage(`已复制抖音号:${text}`);
  }

  private openGithub() {
    void vscode.env.openExternal(vscode.Uri.parse(this.repoUrl));
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };

    const post = (msg: ToLibrary) => this.view?.webview.postMessage(msg);
    const library = new LibraryController(
      post,
      this.state,
      this.onOpenBook,
      this.onNewSession,
      (text) => this.copyText(text),
      () => this.openGithub()
    );
    this.library = library;

    webviewView.webview.html = getLibraryHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((msg: FromLibrary) => library.handle(msg));
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) library.refresh();
    });
  }

  refresh() {
    this.library?.refresh();
  }

  reveal() {
    this.view?.show?.(true);
  }
}

/** Editor-area webview tab (Claude-Code-style reading panel). Draggable. */
export class EditorPanelManager {
  private panel?: vscode.WebviewPanel;
  public controller?: Controller;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: StateStore,
    private readonly scanner: WorkspaceScanner,
    private readonly registry: HostRegistry,
    private readonly onBooksChanged: () => void
  ) {}

  open(column: vscode.ViewColumn, intent: OpenIntent = {}) {
    if (this.panel && this.controller) {
      this.panel.reveal(column);
      this.registry.markActive(this.controller);
      void this.controller.applyIntent(intent);
      return;
    }

    const panel = vscode.window.createWebviewPanel('fishReader.editor', 'Claude', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    });
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');

    const post = (msg: ToWebview) => panel.webview.postMessage(msg);
    const controller = new Controller(post, this.state, this.scanner);
    controller.pendingIntent = intent;
    controller.onBooksChanged = this.onBooksChanged;
    controller.onTitleChange = (title: string) => {
      panel.title = title || 'Claude';
    };
    this.controller = controller;
    this.registry.add(controller);

    panel.webview.html = getHtml(panel.webview, this.extensionUri);

    panel.webview.onDidReceiveMessage((msg: FromWebview) => {
      this.registry.markActive(controller);
      controller.handle(msg);
    });
    panel.onDidChangeViewState(() => {
      if (panel.active) this.registry.markActive(controller);
    });
    panel.onDidDispose(() => {
      this.registry.remove(controller);
      this.controller = undefined;
      this.panel = undefined;
    });
  }
}
