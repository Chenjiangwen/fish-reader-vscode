import { DiffLine } from '../types';

export interface SnippetTemplate {
  category: 'refactor' | 'feature' | 'fix' | 'chore';
  lines: DiffLine[];
}

const add = (text: string): DiffLine => ({ type: 'add', text });
const del = (text: string): DiffLine => ({ type: 'del', text });
const ctx = (text: string): DiffLine => ({ type: 'ctx', text });

type Pool = Record<string, SnippetTemplate[]>;

const typescript: SnippetTemplate[] = [
  {
    category: 'refactor',
    lines: [del('const timeout = 5000;'), add('const DEFAULT_TIMEOUT_MS = 5000;'), del('setTimeout(fn, 5000);'), add('setTimeout(fn, DEFAULT_TIMEOUT_MS);')],
  },
  {
    category: 'refactor',
    lines: [add('const cache = new Map<string, number>();'), ctx('function compute(x: string) {'), add('  if (cache.has(x)) return cache.get(x)!;'), ctx('  const result = expensive(x);'), add('  cache.set(x, result);'), ctx('  return result;'), ctx('}')],
  },
  {
    category: 'feature',
    lines: [add('async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {'), add('  for (let i = 0; i < max; i++) {'), add('    try { return await fn(); }'), add('    catch (e) { if (i === max - 1) throw e; }'), add('  }'), add('  throw new Error("unreachable");'), add('}')],
  },
  {
    category: 'fix',
    lines: [del('return user.profile.name;'), add("return user?.profile?.name ?? 'Anonymous';")],
  },
  {
    category: 'fix',
    lines: [ctx('export function parse(input: string) {'), add('  if (!input) return [];'), ctx('  return input.split(",").map((s) => s.trim());'), ctx('}')],
  },
  {
    category: 'chore',
    lines: [del('// TODO: refactor later'), add('// Memoized lookup keyed by normalized path.'), ctx('const index = buildIndex(entries);')],
  },
];

const javascript: SnippetTemplate[] = [
  {
    category: 'refactor',
    lines: [del('var data = getData();'), add('const data = getData();'), del('for (var i = 0; i < data.length; i++) {'), add('for (let i = 0; i < data.length; i++) {')],
  },
  {
    category: 'feature',
    lines: [add('function debounce(fn, wait) {'), add('  let t;'), add('  return (...args) => {'), add('    clearTimeout(t);'), add('    t = setTimeout(() => fn(...args), wait);'), add('  };'), add('}')],
  },
  {
    category: 'fix',
    lines: [del('if (value == null) {'), add('if (value === null || value === undefined) {'), ctx('  return fallback;'), ctx('}')],
  },
];

const python: SnippetTemplate[] = [
  {
    category: 'refactor',
    lines: [del('result = []'), del('for item in items:'), del('    result.append(item * 2)'), add('result = [item * 2 for item in items]')],
  },
  {
    category: 'feature',
    lines: [add('@lru_cache(maxsize=128)'), ctx('def compute(n: int) -> int:'), ctx('    return sum(range(n))')],
  },
  {
    category: 'fix',
    lines: [del('value = config["timeout"]'), add('value = config.get("timeout", 30)')],
  },
];

const go: SnippetTemplate[] = [
  {
    category: 'fix',
    lines: [ctx('func fetch(ctx context.Context) error {'), add('\tif err != nil {'), add('\t\treturn fmt.Errorf("fetch: %w", err)'), add('\t}'), ctx('\treturn nil'), ctx('}')],
  },
  {
    category: 'refactor',
    lines: [del('var buf bytes.Buffer'), del('buf.WriteString(s)'), add('var sb strings.Builder'), add('sb.WriteString(s)')],
  },
];

const java: SnippetTemplate[] = [
  {
    category: 'refactor',
    lines: [del('List<String> out = new ArrayList<>();'), del('for (String s : in) { out.add(s.trim()); }'), add('List<String> out = in.stream().map(String::trim).collect(toList());')],
  },
  {
    category: 'fix',
    lines: [del('return map.get(key);'), add('return map.getOrDefault(key, DEFAULT);')],
  },
];

const rust: SnippetTemplate[] = [
  {
    category: 'fix',
    lines: [del('let val = map.get(&key).unwrap();'), add('let val = map.get(&key).copied().unwrap_or_default();')],
  },
  {
    category: 'refactor',
    lines: [del('let mut total = 0;'), del('for x in &items { total += x; }'), add('let total: i64 = items.iter().sum();')],
  },
];

const POOLS: Pool = { typescript, javascript, python, go, java, rust };

const FILE_NAME_POOL: Record<string, string[]> = {
  typescript: ['utils.ts', 'helpers.ts', 'api.ts', 'parser.ts', 'index.ts', 'config.ts', 'service.ts', 'handler.ts', 'middleware.ts'],
  javascript: ['utils.js', 'helpers.js', 'api.js', 'index.js', 'config.js', 'router.js'],
  python: ['utils.py', 'parser.py', 'service.py', 'models.py', 'handlers.py', '__init__.py'],
  go: ['main.go', 'handler.go', 'server.go', 'client.go', 'util.go'],
  java: ['Service.java', 'Handler.java', 'Utils.java', 'Repository.java'],
  rust: ['lib.rs', 'main.rs', 'parser.rs', 'utils.rs'],
};

const CATEGORY_WEIGHTS: [string, number][] = [
  ['refactor', 60],
  ['feature', 20],
  ['fix', 15],
  ['chore', 5],
];

export function normalizeLang(lang: string): string {
  const l = lang.toLowerCase();
  if (l === 'ts' || l === 'tsx' || l === 'typescript' || l === 'typescriptreact') return 'typescript';
  if (l === 'js' || l === 'jsx' || l === 'javascript' || l === 'javascriptreact') return 'javascript';
  if (l === 'py' || l === 'python') return 'python';
  if (l === 'go' || l === 'golang') return 'go';
  if (l === 'java') return 'java';
  if (l === 'rs' || l === 'rust') return 'rust';
  return 'typescript';
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickCategory(): string {
  const total = CATEGORY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [cat, w] of CATEGORY_WEIGHTS) {
    if (r < w) return cat;
    r -= w;
  }
  return 'refactor';
}

export function getSnippet(lang: string): { snippet: SnippetTemplate; lang: string } {
  const norm = normalizeLang(lang);
  const pool = POOLS[norm] || typescript;
  const cat = pickCategory();
  const ofCat = pool.filter((s) => s.category === cat);
  const snippet = ofCat.length ? pick(ofCat) : pick(pool);
  return { snippet, lang: norm };
}

export function builtinFileName(lang: string): string {
  const norm = normalizeLang(lang);
  return pick(FILE_NAME_POOL[norm] || FILE_NAME_POOL.typescript);
}
