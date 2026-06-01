import * as vscode from 'vscode';

export function makeNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

/** Sidebar library list (Claude-Code-style: new / search / conversation list). */
export function getLibraryHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'library.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'styles.css'));
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>FishReader</title>
</head>
<body>
  <div id="lib">
    <button id="lib-new" class="lib-new">＋ 新建会话</button>
    <div class="lib-search">
      <input id="lib-search" type="text" placeholder="搜索小说…" />
    </div>
    <div id="lib-list" class="lib-list"></div>
    <div id="lib-empty" class="lib-empty hidden">还没有阅读记录。<br/>点「新建会话」打开一本小说(txt / epub / fb2)。</div>
    <div class="lib-promo" id="lib-promo">
      <button class="promo-close" id="promo-close" title="不再显示">×</button>
      <div class="promo-dy">
        <span class="promo-ask">🙏 麻烦抖音点个关注</span>
        <span class="promo-num">抖音号 <b>1642834098</b></span>
        <button id="promo-copy" class="promo-copy" title="复制抖音号">复制</button>
      </div>
      <div class="promo-or">或</div>
      <button class="promo-btn" id="promo-star">⭐ 给个 GitHub Star</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/** Shared HTML for the editor-tab reading panel (and legacy view). */
export function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'styles.css'));
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>FishReader</title>
</head>
<body>
  <div id="app">
    <header id="titlebar">
      <span id="brand-icon">✳</span>
      <span id="brand-name">Claude</span>
      <span id="brand-sub" class="muted"></span>
    </header>
    <main id="log" tabindex="0"></main>
    <footer id="composer">
      <div id="slash-menu" class="hidden"></div>
      <div class="composer-box">
        <textarea id="input" rows="1" placeholder="输入消息…  / 唤起命令"></textarea>
        <div class="composer-toolbar">
          <div class="tb-left">
            <button class="tb-btn" id="plus-btn" title="Add context">+</button>
            <button class="tb-btn" id="boss-btn" title="Boss mode ⌘B">&lt;/&gt;</button>
            <span class="file-chip" id="file-chip"></span>
          </div>
          <div class="tb-right">
            <span class="tb-hint" id="tb-hint">Ask before edits</span>
            <button class="send-btn" id="send-btn" title="Send (Enter)">↑</button>
          </div>
        </div>
      </div>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
