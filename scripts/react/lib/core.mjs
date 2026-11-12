/**
 * Shared runner for the React guard scripts.
 *
 * Every check is an object:
 *   {
 *     name: 'tokens',                 // CLI name, ignore-comment prefix, output tag
 *     key: 'tokens',                  // section in react-guards.config.json
 *     extensions: ['.tsx', ...],
 *     needsAst: true,                 // parse TS/JSX with the project's `typescript`
 *     requiresConfig: false,          // true = refuse to run without a config section
 *     defaults: { ... },              // merged with the config section
 *     analyze(ctx) { ctx.report(node, 'rule', 'message') },
 *   }
 *
 * CLI (shared by every script):
 *   [files...]            check only these files
 *   --changed[=base]      files changed vs base branch (default main) + untracked
 *   --hook                Claude Code PostToolUse hook mode (stdin JSON, exit 2 on errors)
 *   --json                machine-readable output
 *   --strict              warnings fail too
 *   --only=a,b            (check-all) run a subset of checks
 *   --update-baseline     record current violations as accepted, exit 0
 *   --no-baseline         ignore the baseline file
 *   --config <path>       default: react-guards.config.json
 *   --quiet               no output when clean
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CONFIG_FILE = 'react-guards.config.json';
export const DEFAULT_BASELINE = '.react-guards-baseline.json';

// ───────────────────────────── small utils ─────────────────────────────
export const isMain = (url) => !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === url;

export const CASES = {
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  'kebab-case': /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  snake_case: /^[a-z0-9]+(?:_[a-z0-9]+)*$/,
};
export const matchesCase = (name, cases) =>
  [].concat(cases).some((c) => {
    if (!CASES[c]) throw new Error(`unknown case "${c}" (use ${Object.keys(CASES).join(', ')})`);
    return CASES[c].test(name);
  });

export const toPascal = (s) =>
  s.replace(/(^|[-_.\s]+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase());
export const toCamel = (s) => {
  const p = toPascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
};
export const toKebab = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

const SECONDARY_SUFFIXES = /\.(test|spec|stories|story|module|styles|styled|d|server|client|api)$/;
/** "Button.test.tsx" → "Button" */
export const stem = (file) => {
  let s = basename(file, extname(file));
  while (SECONDARY_SUFFIXES.test(s)) s = s.replace(SECONDARY_SUFFIXES, '');
  return s;
};

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')';
      i = end;
    } else if ('\\^$+.()|[]'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}
export const globMatcher = (globs = []) => {
  const res = [].concat(globs).map(globToRegExp);
  return (rel) => res.some((r) => r.test(rel));
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(defaults, overrides) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(overrides ?? {})) {
    out[k] = isPlainObject(v) && isPlainObject(defaults?.[k]) ? { ...defaults[k], ...v } : v;
  }
  return out;
}

// ───────────────────────────── args ─────────────────────────────
function parseArgs(argv) {
  const has = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  const val = (n) => {
    const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
    if (i === -1) return undefined;
    if (argv[i].includes('=')) return argv[i].split('=').slice(1).join('=');
    const next = argv[i + 1];
    return next && !next.startsWith('--') ? next : undefined;
  };
  const valued = new Set(['--config', '--only']);
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]) && !(argv[i - 1] === '--changed'));
  return {
    hook: has('hook'),
    json: has('json'),
    quiet: has('quiet'),
    strict: has('strict'),
    updateBaseline: has('update-baseline'),
    noBaseline: has('no-baseline'),
    changed: has('changed') ? (val('changed') ?? 'main') : undefined,
    only: val('only')?.split(',').map((s) => s.trim()),
    config: val('config'),
    positional,
  };
}

// ───────────────────────────── file discovery ─────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', 'coverage', 'out', 'storybook-static', '.turbo', '.vercel']);
function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), exts, out); }
    else if (exts.has(extname(e.name))) out.push(join(dir, e.name));
  }
  return out;
}

function changedFiles(root, base) {
  const run = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  try { out += run(`git diff --name-only --diff-filter=ACMR ${base}`); } catch {
    fatal(`git diff against "${base}" failed (does the branch exist?)`);
  }
  try { out += '\n' + run('git ls-files --others --exclude-standard'); } catch {}
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
}

async function readHookFile() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const ti = JSON.parse(raw || '{}').tool_input ?? {};
    return ti.file_path ?? ti.path;
  } catch { return undefined; }
}

function fatal(msg) {
  console.error(`react-guards: ${msg}`);
  process.exit(2);
}

// ───────────────────────────── main ─────────────────────────────
export async function main(checks) {
  const args = parseArgs(process.argv.slice(2));
  const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rel = (p) => relative(ROOT, resolve(ROOT, p)).split('\\').join('/');

  // config
  const cfgPath = resolve(ROOT, args.config ?? CONFIG_FILE);
  const hasConfig = existsSync(cfgPath);
  if (!hasConfig && args.hook) process.exit(0); // repo not opted in → never block agents
  let config = {};
  if (hasConfig) {
    try { config = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch (e) { fatal(`invalid JSON in ${rel(cfgPath)}: ${e.message}`); }
  }
  const globalOpts = {
    include: config.include ?? ['src'],
    exclude: config.exclude ?? [],
    requireIgnoreReason: config.requireIgnoreReason ?? true,
    baseline: config.baseline ?? DEFAULT_BASELINE,
  };

  let active = checks
    .filter((c) => !args.only || args.only.includes(c.name))
    .map((c) => ({ ...c, opts: merge(c.defaults, config[c.key]) }))
    .filter((c) => c.opts.enabled !== false);

  for (const c of active.filter((c) => c.requiresConfig && !config[c.key])) {
    if (checks.length === 1) fatal(`"${c.key}" section missing in ${rel(cfgPath)}. See scripts/react/react-guards.config.example.json.`);
    if (!args.hook && !args.json && !args.quiet) console.error(`(skipping ${c.name}: no "${c.key}" section in config)`);
  }
  active = active.filter((c) => !c.requiresConfig || config[c.key]);
  if (!active.length) process.exit(0);

  // typescript (lazy)
  let ts;
  const loadTs = () => {
    if (ts) return ts;
    try { ts = createRequire(join(ROOT, 'package.json'))('typescript'); } catch {
      try { ts = createRequire(import.meta.url)('typescript'); } catch { fatal('could not load "typescript". Install it as a devDependency.'); }
    }
    return ts;
  };

  // files
  const allExts = new Set(active.flatMap((c) => c.extensions));
  let files;
  if (args.hook) { const f = await readHookFile(); files = f ? [f] : []; }
  else if (args.changed) files = changedFiles(ROOT, args.changed);
  else if (args.positional.length) files = args.positional;
  else files = globalOpts.include.flatMap((d) => walk(resolve(ROOT, d), allExts));

  const globalExcluded = globMatcher(globalOpts.exclude);
  const inInclude = (r) => globalOpts.include.some((d) => {
    const dir = d.replace(/^\.\//, '').replace(/\/$/, '');
    return dir === '' || dir === '.' || r === dir || r.startsWith(dir + '/');
  });
  files = [...new Set(files.map((f) => resolve(ROOT, f)))]
    .filter((f) => allExts.has(extname(f)) && existsSync(f) && statSync(f).isFile())
    .map((abs) => ({ abs, rel: rel(abs) }))
    .filter((f) => !f.rel.startsWith('..') && !globalExcluded(f.rel))
    // explicit file lists (lint-staged, hook) still respect `include`
    .filter((f) => inInclude(f.rel));

  // analysis
  const astCache = new Map();
  const violations = [];
  for (const check of active) {
    const exclude = globMatcher(check.opts.exclude);
    const state = {};
    const ignoreNext = new RegExp(`(?:${check.name}|react-guards)-ignore-next-line(?::\\s*(\\S.*))?`);
    const ignoreFile = new RegExp(`(?:${check.name}|react-guards)-ignore-file(?::\\s*(\\S.*))?`);

    for (const f of files) {
      if (!check.extensions.includes(extname(f.abs)) || exclude(f.rel)) continue;
      const text = readFileSync(f.abs, 'utf8');
      const fileIgnore = text.match(ignoreFile);
      if (fileIgnore && (!globalOpts.requireIgnoreReason || fileIgnore[1])) continue;
      const lines = text.split('\n');
      const ext = extname(f.abs);
      const isScript = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext);

      const ctx = {
        file: f.abs, rel: f.rel, text, lines, ext, opts: check.opts, state, root: ROOT,
        get ts() { return loadTs(); },
        get sf() {
          if (!isScript) return undefined;
          if (!astCache.has(f.abs)) {
            const t = loadTs();
            const kind = ext === '.tsx' ? t.ScriptKind.TSX : ext === '.ts' ? t.ScriptKind.TS : t.ScriptKind.JSX;
            astCache.set(f.abs, t.createSourceFile(f.abs, text, t.ScriptTarget.Latest, true, kind));
          }
          return astCache.get(f.abs);
        },
        /** report(node | {line, col} (1-based), rule, message) */
        report(at, rule, message) {
          let line, col;
          if (at && typeof at.getStart === 'function') {
            const sf = ctx.sf;
            const lc = sf.getLineAndCharacterOfPosition(at.getStart(sf));
            line = lc.line + 1; col = lc.character + 1;
          } else { line = at?.line ?? 1; col = at?.col ?? 1; }
          const severity = check.opts.severity?.[rule] ?? 'error';
          if (severity === 'off') return;
          const prev = lines[line - 2] ?? '';
          const m = prev.match(ignoreNext);
          if (m) {
            if (!globalOpts.requireIgnoreReason || m[1]) return;
            violations.push({ file: f.rel, line, col, check: check.name, rule: 'ignore-reason', severity: 'error', message: `${check.name}-ignore-next-line needs a reason (": why")` });
            return;
          }
          violations.push({ file: f.rel, line, col, check: check.name, rule, severity, message });
        },
        /** report against a path without a position (e.g. a folder) */
        reportPath(path, rule, message) {
          const severity = check.opts.severity?.[rule] ?? 'error';
          if (severity !== 'off') violations.push({ file: path, line: 0, col: 0, check: check.name, rule, severity, message });
        },
      };
      check.analyze(ctx);
    }
  }

  // baseline
  const baselinePath = resolve(ROOT, globalOpts.baseline);
  const keyOf = (v) => `${v.file}::${v.check}/${v.rule}::${v.message.replace(/\d+/g, '#')}`;
  if (args.updateBaseline) {
    const counts = {};
    for (const v of violations) counts[keyOf(v)] = (counts[keyOf(v)] ?? 0) + 1;
    writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n');
    console.log(`baseline written: ${rel(baselinePath)} (${violations.length} accepted violation(s))`);
    process.exit(0);
  }
  let result = violations;
  let baselined = 0;
  if (!args.noBaseline && existsSync(baselinePath)) {
    const remaining = JSON.parse(readFileSync(baselinePath, 'utf8'));
    result = violations.filter((v) => {
      const k = keyOf(v);
      if (remaining[k] > 0) { remaining[k]--; baselined++; return false; }
      return true;
    });
  }

  const isError = (v) => v.severity === 'error' || args.strict;
  const errors = result.filter(isError);
  const warnings = result.filter((v) => !isError(v));
  result.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);

  if (args.json) {
    console.log(JSON.stringify({ files: files.length, errors: errors.length, warnings: warnings.length, baselined, violations: result }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  const fmt = (v) => `${v.file}${v.line ? `:${v.line}:${v.col}` : ''}  ${isError(v) ? '' : 'warn '}[${v.check}/${v.rule}] ${v.message}`;
  const names = active.map((c) => c.name).join(', ');

  if (args.hook) {
    if (!errors.length) process.exit(0);
    console.error(
      errors.map(fmt).join('\n') +
      `\n✗ react-guards (${names}): ${errors.length} problem(s) in the file you just edited. Fix them before moving on. ` +
      'If one is a genuine exception, add `// <check>-ignore-next-line: <reason>` on the line above (e.g. `// tokens-ignore-next-line: …`).',
    );
    process.exit(2);
  }

  if (!result.length) {
    if (!args.quiet) console.log(`✓ react-guards (${names}): ${files.length} file(s) clean${baselined ? `, ${baselined} baselined` : ''}.`);
    process.exit(0);
  }
  console.log(result.map(fmt).join('\n'));
  console.log(`\n${errors.length ? '✗' : '!'} react-guards (${names}): ${errors.length} error(s), ${warnings.length} warning(s)${baselined ? `, ${baselined} baselined` : ''}.`);
  process.exit(errors.length ? 1 : 0);
}

// ───────────────────────────── AST helpers ─────────────────────────────
/** name of a function-like declaration: function Foo(){}, const Foo = () => {}, const Foo = memo(() => {}) */
export function functionName(ts, node) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
    let p = node.parent;
    while (p && ts.isCallExpression(p)) p = p.parent; // memo(forwardRef(() => …))
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  }
  return undefined;
}

export const WRAPPERS = new Set(['memo', 'forwardRef', 'observer', 'lazy', 'withRouter', 'styled']);
export function calleeName(ts, expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return '';
}
export function calleeText(ts, expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = calleeText(ts, expr.expression);
    return left ? `${left}.${expr.name.text}` : '';
  }
  return '';
}

export function containsJsx(ts, node) {
  let found = false;
  const v = (n) => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { found = true; return; }
    ts.forEachChild(n, v);
  };
  v(node);
  return found;
}
