import * as vscode from 'vscode';

export interface CodeSnippet {
  fileName: string;
  lang: string;
  lines: string[];
}

export interface WorkspaceCache {
  files: string[];
  classes: string[];
  functions: string[];
  imports: string[];
  primaryLang: string;
  snippets: CodeSnippet[];
}

const EMPTY: WorkspaceCache = {
  files: [],
  classes: [],
  functions: [],
  imports: [],
  primaryLang: 'typescript',
  snippets: [],
};

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  java: 'java',
  rs: 'rust',
};

export function extToLang(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'typescript';
}

const CLASS_RE = /\b(?:class|interface|struct|enum)\s+([A-Z]\w+)/g;
const FUNC_RE = /(?:function\s+([a-zA-Z_]\w*)|(?:def|func|fn)\s+([a-zA-Z_]\w*)|\b([a-zA-Z_]\w*)\s*(?:=\s*)?\([^)]*\)\s*(?:=>|\{))/g;
const IMPORT_RE = /(?:import\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'".][^'"]*)['"]|require\(['"]([^'"]+)['"]\)|from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;

export class WorkspaceScanner {
  private cache: WorkspaceCache = EMPTY;
  private scanned = false;

  get(): WorkspaceCache {
    return this.cache;
  }

  hasData(): boolean {
    return this.scanned && this.cache.files.length > 0;
  }

  async scan(): Promise<WorkspaceCache> {
    try {
      const uris = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,py,go,java,rs}',
        '**/{node_modules,dist,out,build,.git,vendor,target}/**',
        400
      );

      const files = new Set<string>();
      const classes = new Set<string>();
      const functions = new Set<string>();
      const imports = new Set<string>();
      const langCount: Record<string, number> = {};
      const snippets: CodeSnippet[] = [];

      // Limit how many files we actually read for content.
      const toRead = uris.slice(0, 60);

      for (const uri of uris) {
        const base = uri.path.split('/').pop() ?? '';
        files.add(base);
        const lang = extToLang(base);
        langCount[lang] = (langCount[lang] ?? 0) + 1;
      }

      for (const uri of toRead) {
        let text: string;
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          if (bytes.length > 200 * 1024) continue;
          text = Buffer.from(bytes).toString('utf8');
        } catch {
          continue;
        }
        this.extract(text, classes, functions, imports);

        if (snippets.length < 20) {
          const snip = this.sampleSnippet(uri.path.split('/').pop() ?? 'file', text);
          if (snip) snippets.push(snip);
        }
      }

      const primaryLang =
        Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'typescript';

      this.cache = {
        files: [...files],
        classes: [...classes].slice(0, 100),
        functions: [...functions].slice(0, 200),
        imports: [...imports].slice(0, 100),
        primaryLang,
        snippets,
      };
      this.scanned = true;
    } catch {
      this.cache = EMPTY;
      this.scanned = true;
    }
    return this.cache;
  }

  private extract(text: string, classes: Set<string>, functions: Set<string>, imports: Set<string>) {
    let m: RegExpExecArray | null;
    CLASS_RE.lastIndex = 0;
    while ((m = CLASS_RE.exec(text)) && classes.size < 200) {
      if (m[1]) classes.add(m[1]);
    }
    FUNC_RE.lastIndex = 0;
    while ((m = FUNC_RE.exec(text)) && functions.size < 400) {
      const name = m[1] || m[2] || m[3];
      if (name && name.length > 1 && !RESERVED.has(name)) functions.add(name);
    }
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(text)) && imports.size < 200) {
      const lib = m[1] || m[2] || m[3] || m[4];
      if (lib && !lib.startsWith('.')) {
        imports.add(lib.split('/')[0]);
      }
    }
  }

  private sampleSnippet(fileName: string, text: string): CodeSnippet | undefined {
    const lines = text.split('\n');
    if (lines.length < 8) return undefined;
    const lang = extToLang(fileName);
    const span = 5 + Math.floor(Math.random() * 6); // 5-10
    const maxStart = Math.max(1, lines.length - span - 1);
    const start = Math.floor(lines.length / 4 + Math.random() * (maxStart - lines.length / 4));
    const s = Math.max(0, Math.min(maxStart, Math.floor(start)));
    const picked = lines.slice(s, s + span).map((l) => l.replace(/\t/g, '  '));
    return { fileName, lang, lines: picked };
  }
}

const RESERVED = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'await', 'async',
  'def', 'func', 'fn', 'class', 'new', 'typeof', 'super', 'this', 'and', 'or', 'not',
]);
