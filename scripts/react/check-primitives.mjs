#!/usr/bin/env node
/**
 * check-primitives — flags raw HTML elements that must use a design-system primitive.
 *
 *   <input />  →  <Input />  from "@/components/ui/input"
 *
 * Detects: JSX (<input>, <input/>), React.createElement('input'), styled.input / styled('input').
 * Zero extra dependencies: uses the project's own `typescript` package to parse.
 *
 * Usage
 *   node scripts/react/check-primitives.mjs                  # scan `include` dirs from config
 *   node scripts/react/check-primitives.mjs src/a.tsx b.tsx  # only these files (lint-staged)
 *   node scripts/react/check-primitives.mjs --changed[=main] # files changed vs base (default: main)
 *   node scripts/react/check-primitives.mjs --hook           # Claude Code PostToolUse hook mode
 *   Options: --config <path>  --json  --quiet
 *
 * Escape hatches (put a reason after the colon):
 *   // primitives-ignore-next-line: third-party widget needs a native input
 *   {/* primitives-ignore-next-line: … *\/}
 *   // primitives-ignore-file: <reason>      (anywhere in the file)
 *
 * Exit codes: 0 clean · 1 violations · 2 hook-mode violations / config error
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, join, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// ───────────────────────────── args ─────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const flagValue = (name) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  if (argv[i].includes('=')) return argv[i].split('=').slice(1).join('=');
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : undefined;
};
const HOOK = flag('hook');
const JSON_OUT = flag('json');
const QUIET = flag('quiet');
const configArg = flagValue('config');
const positional = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] === '--config'));

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function fail(msg) {
  console.error(`check-primitives: ${msg}`);
  process.exit(2);
}

// ───────────────────────────── config ─────────────────────────────
const configPath = resolve(ROOT, configArg ?? 'primitives.config.json');
if (!existsSync(configPath)) {
  if (HOOK) process.exit(0); // not configured in this repo → never block the agent
  fail(`config not found at ${relative(ROOT, configPath)}. Copy scripts/react/primitives.config.example.json.`);
}
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  fail(`invalid JSON in ${configPath}: ${e.message}`);
}

const {
  include = ['src'],
  exclude = [],
  extensions = ['.tsx', '.jsx'],
  rules = {},
  checkCreateElement = true,
  checkStyled = true,
  requireIgnoreReason = true,
} = config;

if (!Object.keys(rules).length) fail('config has no "rules".');

// ───────────────────────────── typescript ─────────────────────────────
let ts;
try {
  const req = createRequire(join(ROOT, 'package.json'));
  ts = req('typescript');
} catch {
  try {
    ts = createRequire(import.meta.url)('typescript');
  } catch {
    fail('could not load "typescript". Install it as a devDependency.');
  }
}

// ───────────────────────────── globs ─────────────────────────────
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.()|{}[]'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}
const excludeRes = exclude.map(globToRegExp);
const toRel = (p) => relative(ROOT, resolve(ROOT, p)).split('\\').join('/');
const isExcluded = (rel) => excludeRes.some((re) => re.test(rel));
const hasExt = (p) => extensions.includes(extname(p));

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', 'out', 'storybook-static']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); }
    else if (hasExt(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

// ───────────────────────────── file selection ─────────────────────────────
function changedFiles(base) {
  const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  try { out += run(`git diff --name-only --diff-filter=ACMR ${base}`); } catch {
    fail(`git diff against "${base}" failed (does the branch exist?)`);
  }
  try { out += '\n' + run('git ls-files --others --exclude-standard'); } catch {}
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
}

async function readHookFile() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const input = JSON.parse(raw || '{}');
    const ti = input.tool_input ?? {};
    return ti.file_path ?? ti.path;
  } catch { return undefined; }
}

let files;
if (HOOK) {
  const f = await readHookFile();
  files = f ? [f] : [];
} else if (flag('changed')) {
  files = changedFiles(flagValue('changed') ?? 'main');
} else if (positional.length) {
  files = positional;
} else {
  files = include.flatMap((d) => walk(resolve(ROOT, d)));
}

files = files
  .map((f) => resolve(ROOT, f))
  .filter((f) => hasExt(f) && existsSync(f) && statSync(f).isFile())
  .filter((f) => !isExcluded(toRel(f)));

// ───────────────────────────── analysis ─────────────────────────────
const IGNORE_LINE = /primitives-ignore-next-line(?::\s*(\S.*))?/;
const IGNORE_FILE = /primitives-ignore-file(?::\s*(\S.*))?/;

function attrValue(attrs, name) {
  for (const p of attrs.properties) {
    if (!ts.isJsxAttribute(p) || p.name.getText() !== name) continue;
    const init = p.initializer;
    if (!init) return true; // boolean attribute
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
    return null; // dynamic → unknown
  }
  return undefined;
}

/** Rule can declare exceptions: { "allowIf": { "type": ["hidden"] } } */
function isAllowedByAttrs(rule, attrs) {
  if (!rule.allowIf || !attrs) return false;
  return Object.entries(rule.allowIf).some(([name, values]) => {
    const v = attrValue(attrs, name);
    if (v === undefined || v === null) return false;
    return values === true ? true : values.includes(String(v));
  });
}

function checkFile(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const violations = [];
  const ignoreFile = text.match(IGNORE_FILE);
  if (ignoreFile && (!requireIgnoreReason || ignoreFile[1])) return violations;

  const kind = extname(file) === '.jsx' || extname(file) === '.js' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

  const report = (node, tag, via) => {
    const rule = rules[tag];
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const prev = lines[line - 1] ?? '';
    const m = prev.match(IGNORE_LINE);
    if (m) {
      if (!requireIgnoreReason || m[1]) return;
      violations.push({ file: toRel(file), line: line + 1, col: character + 1, tag, via, message: 'primitives-ignore-next-line needs a reason (": why")' });
      return;
    }
    violations.push({
      file: toRel(file), line: line + 1, col: character + 1, tag, via,
      use: rule.use, from: rule.from,
      message: rule.message ?? `use <${rule.use} />${rule.from ? ` from "${rule.from}"` : ''}`,
    });
  };

  const visit = (node) => {
    // <input ...> and <input ... />
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tn = node.tagName;
      if (ts.isIdentifier(tn)) {
        const tag = tn.text;
        if (rules[tag] && !isAllowedByAttrs(rules[tag], node.attributes)) report(node, tag, 'jsx');
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg = node.arguments[0];
      // React.createElement('input') / createElement('input')
      if (checkCreateElement && arg && ts.isStringLiteralLike(arg) && rules[arg.text]) {
        const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
        if (name === 'createElement') report(node, arg.text, 'createElement');
      }
      // styled('input')
      if (checkStyled && arg && ts.isStringLiteralLike(arg) && rules[arg.text] && ts.isIdentifier(callee) && callee.text === 'styled') {
        report(node, arg.text, 'styled');
      }
    }
    // styled.input`…`
    if (checkStyled && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === 'styled' && rules[node.name.text]) {
      report(node, node.name.text, 'styled');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return violations;
}

const all = files.flatMap(checkFile);

// ───────────────────────────── output ─────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, violations: all }, null, 2));
  process.exit(all.length ? 1 : 0);
}

if (!all.length) {
  if (!QUIET && !HOOK) console.log(`✓ check-primitives: ${files.length} file(s), no raw elements.`);
  process.exit(0);
}

const lines = all.map((v) => `${v.file}:${v.line}:${v.col}  <${v.tag}>${v.via !== 'jsx' ? ` (${v.via})` : ''} → ${v.message}`);
const fileCount = new Set(all.map((v) => v.file)).size;
const summary = `✗ check-primitives: ${all.length} violation(s) in ${fileCount} file(s).`;

if (HOOK) {
  console.error(
    `${lines.join('\n')}\n${summary}\n` +
    'Replace the raw elements with the design-system primitives listed above. ' +
    'Only if a native element is truly required, add `// primitives-ignore-next-line: <reason>` on the line above.',
  );
  process.exit(2);
}
console.log(lines.join('\n') + '\n\n' + summary);
process.exit(1);
