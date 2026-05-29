import * as vscode from 'vscode';
import { FakeTurn } from '../types';
import { WorkspaceCache } from './workspace-scanner';
import { extToLang } from './workspace-scanner';
import { generateActiveTabDiff, generateFakeDiff } from './diff-generator';
import { bossThinkingLog } from './thinking-animator';

export interface ActiveTabContext {
  fileName: string;
  filePath: string;
  language: string;
  lineCount: number;
  classes: string[];
  functions: string[];
  imports: string[];
  sampledLines: string[];
}

const CLASS_RE = /\b(?:class|interface|struct|enum)\s+([A-Z]\w+)/g;
const FUNC_RE = /(?:function\s+([a-zA-Z_]\w*)|(?:def|func|fn)\s+([a-zA-Z_]\w*)|\b([a-zA-Z_]\w*)\s*(?:=\s*)?\([^)]*\)\s*(?:=>|\{|:))/g;
const IMPORT_RE = /(?:import\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'".][^'"]*)['"]|from\s+([\w.]+)\s+import)/g;

export function readActiveTab(): ActiveTabContext | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const doc = editor.document;
  if (doc.uri.scheme !== 'file') return undefined;

  const text = doc.getText();
  const fileName = doc.fileName.split(/[\\/]/).pop() ?? 'file';
  const classes: string[] = [];
  const functions: string[] = [];
  const imports: string[] = [];

  let m: RegExpExecArray | null;
  CLASS_RE.lastIndex = 0;
  while ((m = CLASS_RE.exec(text)) && classes.length < 30) if (m[1]) classes.push(m[1]);
  FUNC_RE.lastIndex = 0;
  while ((m = FUNC_RE.exec(text)) && functions.length < 50) {
    const n = m[1] || m[2] || m[3];
    if (n && n.length > 1) functions.push(n);
  }
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text)) && imports.length < 30) {
    const lib = m[1] || m[2];
    if (lib) imports.push(lib.split('/')[0]);
  }

  const lines = text.split('\n');
  const mid = Math.floor(lines.length / 2);
  const span = Math.min(10, Math.max(5, Math.floor(lines.length / 6)));
  const sampledLines = lines.slice(mid, mid + span).map((l) => l.replace(/\t/g, '  '));

  return {
    fileName,
    filePath: doc.fileName,
    language: doc.languageId || extToLang(fileName),
    lineCount: doc.lineCount,
    classes,
    functions,
    imports,
    sampledLines,
  };
}

const ANALYSIS_TEMPLATES = [
  'Looking at {fileName}, this module handles {topic}. The {functionName} routine recomputes {something} on every call — that\'s O(n) per access. A few improvements I\'d suggest:',
  'The bottleneck in {fileName} is in {functionName} — it calls into {builtinFn} on the full input every time. For a typical case that\'s roughly {n}ms per operation, which compounds.',
  'I see {fileName} imports both {importA} and {importB} — these overlap in functionality. Consolidating to just {importA} would cut bundle size and drop a dependency.',
  'Looking at {className} in {fileName}, the public surface is fine but the internal state handling has a subtle issue: {functionName} mutates shared state without guarding against re-entry.',
  'The {functionName} in {fileName} returns a value the caller in {otherFile} doesn\'t fully validate. This will throw at runtime when the input is empty.',
];

const USER_PROMPTS = [
  'analyze {fileName} in current tab',
  'why is {fileName} so slow on large inputs?',
  'review the {functionName} logic — feels off',
  'add error handling to {functionName}',
  'extract {className} into its own module',
  'this {functionName} returns inconsistent types, fix it',
  'add types to {fileName}',
];

const TOPICS = ['parsing', 'state management', 'request routing', 'data transformation', 'caching', 'serialization'];
const BUILTINS = ['JSON.parse', 'Array.sort', 'map.get', 'regex.exec', 'Object.keys'];
const SOMETHINGS = ['the index', 'the lookup table', 'the derived view', 'the sort order'];

function pick<T>(arr: T[], fallback: T): T {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, ctx: ActiveTabContext, otherFiles: string[]): string {
  const fn = pick(ctx.functions, 'handle');
  const cls = pick(ctx.classes, 'Handler');
  return template
    .replace(/\{fileName\}/g, ctx.fileName)
    .replace(/\{functionName\}/g, fn)
    .replace(/\{functionA\}/g, fn)
    .replace(/\{functionB\}/g, pick(ctx.functions, 'process'))
    .replace(/\{className\}/g, cls)
    .replace(/\{importA\}/g, pick(ctx.imports, 'lodash'))
    .replace(/\{importB\}/g, pick(ctx.imports.slice(1), 'ramda'))
    .replace(/\{otherFile\}/g, pick(otherFiles, 'index.ts'))
    .replace(/\{topic\}/g, pick(TOPICS, 'parsing'))
    .replace(/\{builtinFn\}/g, pick(BUILTINS, 'JSON.parse'))
    .replace(/\{something\}/g, pick(SOMETHINGS, 'the index'))
    .replace(/\{stateField\}/g, '_state')
    .replace(/\{n\}/g, String(1 + Math.floor(Math.random() * 9)));
}

export interface BossGenOptions {
  turnCount: number;
  cache: WorkspaceCache;
  diffSource: 'workspace' | 'builtin';
}

/**
 * Generate fake "working" conversation turns. Prefers the active tab; falls back
 * to workspace cache, then to generic content.
 */
export function generateBossConversation(opts: BossGenOptions): FakeTurn[] {
  const active = readActiveTab();
  const turns: FakeTurn[] = [];
  const otherFiles = opts.cache.files.length ? opts.cache.files : ['index.ts', 'utils.ts'];

  for (let i = 0; i < opts.turnCount; i++) {
    if (active) {
      const prompt = fill(pick(USER_PROMPTS, 'analyze this'), active, otherFiles);
      const analysis = fill(pick(ANALYSIS_TEMPLATES, 'Reviewing this file…'), active, otherFiles);
      const diff =
        i === 0
          ? generateActiveTabDiff(active.fileName, active.language, active.sampledLines)
          : generateFakeDiff({
              lang: active.language,
              primaryLang: opts.cache.primaryLang,
              fileNamePool: opts.cache.files,
              snippetSource: opts.diffSource,
            });
      turns.push({ prompt, thinking: bossThinkingLog(active.fileName), analysis, diff });
    } else {
      // Fallback to workspace cache / generic.
      const fileName = opts.cache.files[i % Math.max(1, opts.cache.files.length)] || 'utils.ts';
      const fakeCtx: ActiveTabContext = {
        fileName,
        filePath: fileName,
        language: opts.cache.primaryLang,
        lineCount: 120,
        classes: opts.cache.classes,
        functions: opts.cache.functions,
        imports: opts.cache.imports,
        sampledLines: [],
      };
      const prompt = fill(pick(USER_PROMPTS, 'analyze this'), fakeCtx, otherFiles);
      const analysis = fill(pick(ANALYSIS_TEMPLATES, 'Reviewing this file…'), fakeCtx, otherFiles);
      const diff = generateFakeDiff({
        lang: opts.cache.primaryLang,
        primaryLang: opts.cache.primaryLang,
        fileNamePool: opts.cache.files,
        snippetSource: opts.diffSource,
      });
      turns.push({ prompt, thinking: bossThinkingLog(fileName), analysis, diff });
    }
  }

  return turns;
}
