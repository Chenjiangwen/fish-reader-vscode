import * as vscode from 'vscode';
import { FishReaderViewProvider, EditorPanelManager } from './panel';
import { StateStore } from './engine/state';
import { WorkspaceScanner } from './disguise/workspace-scanner';
import { HostRegistry } from './hosts';

export function activate(context: vscode.ExtensionContext) {
  const state = new StateStore(context.globalState);
  const scanner = new WorkspaceScanner();
  const registry = new HostRegistry();

  // Forward refs so panel/library can call each other.
  let provider: FishReaderViewProvider;
  let editorPanels: EditorPanelManager;

  const refreshLibrary = () => provider?.refresh();

  editorPanels = new EditorPanelManager(context.extensionUri, state, scanner, registry, refreshLibrary);

  const rawRepo: string =
    (context.extension.packageJSON?.repository?.url as string) ?? 'https://github.com';
  const repoUrl = rawRepo.replace(/^git\+/, '').replace(/\.git$/, '');

  provider = new FishReaderViewProvider(
    context.extensionUri,
    state,
    (id) => editorPanels.open(vscode.ViewColumn.Active, { bookId: id }),
    () => editorPanels.open(vscode.ViewColumn.Active, { newSession: true }),
    repoUrl
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FishReaderViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Background workspace scan (non-blocking) when enabled.
  if (vscode.workspace.getConfiguration('fishReader').get<boolean>('bossMode.scanWorkspace', true)) {
    void scanner.scan();
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('fishReader.openPanel', () => {
      void vscode.commands.executeCommand('fishReader.view.focus');
      provider.reveal();
    }),
    vscode.commands.registerCommand('fishReader.newSession', () => {
      editorPanels.open(vscode.ViewColumn.Active, { newSession: true });
    }),
    vscode.commands.registerCommand('fishReader.openInEditor', () => {
      editorPanels.open(vscode.ViewColumn.Active, {});
    }),
    vscode.commands.registerCommand('fishReader.bossToggle', () => {
      registry.get()?.toggleBoss('hotkey');
    }),
    vscode.commands.registerCommand('fishReader.nextPage', () => {
      registry.get()?.handle({ type: 'request-next' });
    }),
    vscode.commands.registerCommand('fishReader.prevPage', () => {
      registry.get()?.handle({ type: 'request-prev' });
    }),
    vscode.commands.registerCommand('fishReader.initFromActiveFile', () => {
      const file = vscode.window.activeTextEditor?.document.fileName;
      if (file) {
        editorPanels.open(vscode.ViewColumn.Active, { newSession: true });
        // Give the panel a tick to come up, then init.
        setTimeout(() => registry.get()?.handle({ type: 'command', raw: `/init ${file}` }), 300);
      } else {
        vscode.window.showInformationMessage('没有打开的文件。');
      }
    })
  );

  // Keep every composer's file-chip in sync with the active editor, and let the
  // "switched to a code tab" passive trigger fire boss mode (if enabled).
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      registry.broadcastActiveFile();
      if (editor && editor.document.uri.scheme === 'file') {
        registry.get()?.onEditorFocus();
      }
    })
  );

  // Window focus / blur auto-trigger for boss mode (with blurDelay debounce).
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      const ctrl = registry.get();
      if (!ctrl) return;
      if (!s.focused) {
        const delay = vscode.workspace.getConfiguration('fishReader').get<number>('bossMode.blurDelay', 5000);
        if (delay > 0) {
          if (blurTimer) clearTimeout(blurTimer);
          blurTimer = setTimeout(() => ctrl.onWindowBlur(), delay);
        }
      } else {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = undefined;
        }
        ctrl.onWindowFocus();
      }
    })
  );
}

export function deactivate() {}
