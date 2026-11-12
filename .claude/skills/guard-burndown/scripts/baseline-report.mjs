#!/usr/bin/env node
/**
 * baseline-report: shows what's left in .react-guards-baseline.json and picks the next slice to fix.
 *
 *   node .claude/skills/guard-burndown/scripts/baseline-report.mjs                 # summary by rule and folder
 *   node .claude/skills/guard-burndown/scripts/baseline-report.mjs --depth 3       # folder grouping depth
 *   node .claude/skills/guard-burndown/scripts/baseline-report.mjs --next [--max 15]   # suggest the next slice
 *   node .claude/skills/guard-burndown/scripts/baseline-report.mjs --slice "rule=tokens/color" --slice "path=src/features/cart"
 *   [--baseline .react-guards-baseline.json] [--json]
 *
 * Slices: rule=<check>/<rule> (or rule=<check>), path=<prefix>. A slice lists files + counts to fix.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const args = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, 'react-guards.config.json'), 'utf8')); } catch { return {}; } })();
const FILE = resolve(ROOT, arg('baseline', cfg.baseline ?? '.react-guards-baseline.json'));
const DEPTH = Number(arg('depth', 3));
const MAX = Number(arg('max', 15));
const JSON_OUT = argv.includes('--json');

if (!existsSync(FILE)) { console.error(`baseline-report: ${FILE} not found. Nothing baselined (or run check-all --update-baseline).`); process.exit(2); }
const raw = JSON.parse(readFileSync(FILE, 'utf8'));
const entries = Object.entries(raw).map(([key, count]) => {
  const [file, rule, message] = key.split('::');
  return { file, rule, check: rule.split('/')[0], message, count };
}).filter((e) => e.count > 0);
const total = entries.reduce((s, e) => s + e.count, 0);

const groupBy = (items, fn) => {
  const m = new Map();
  for (const e of items) { const k = fn(e); m.set(k, (m.get(k) ?? 0) + e.count); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const folder = (f) => f.split('/').slice(0, DEPTH).join('/');

// ── slice ──
const sliceFilters = args('slice');
if (sliceFilters.length) {
  const match = (e) => sliceFilters.every((s) => {
    const [k, v] = s.split('=');
    if (k === 'rule') return v.includes('/') ? e.rule === v : e.check === v;
    if (k === 'path') return e.file.startsWith(v);
    return true;
  });
  const items = entries.filter(match);
  const files = groupBy(items, (e) => e.file);
  const n = items.reduce((s, e) => s + e.count, 0);
  if (JSON_OUT) { console.log(JSON.stringify({ slice: sliceFilters, total: n, files: files.map(([f, c]) => ({ file: f, count: c, items: items.filter((e) => e.file === f) })) }, null, 2)); process.exit(0); }
  console.log(`Slice ${sliceFilters.join(' & ')}: ${n} violation(s) in ${files.length} file(s)\n`);
  for (const [f, c] of files) {
    console.log(`${f} (${c})`);
    for (const e of items.filter((x) => x.file === f)) console.log(`  ${e.count}× [${e.rule}] ${e.message}`);
  }
  const ruleOnly = sliceFilters.find((s) => s.startsWith('rule='))?.split('=')[1]?.split('/')[0];
  console.log(`\nVerify with: node scripts/react/check-all.mjs --no-baseline ${ruleOnly ? `--only=${ruleOnly} ` : ''}${files.map(([f]) => f).join(' ')}`);
  process.exit(0);
}

// ── next: smallest coherent slice (one rule × one folder) ≤ MAX, preferring mechanical rules ──
const EFFORT = {
  'primitives/raw-element': 1, 'tokens/color': 1, 'tokens/raw-unit': 1, 'tokens/arbitrary': 1,
  'naming/folder-case': 2, 'naming/component-file-case': 2, 'naming/hook-file-name': 2, 'naming/export-matches-file': 2,
  'fetching/forbidden-import': 3, 'fetching/forbidden-call': 3, 'naming/one-component-per-file': 3, 'naming/hook-in-component-file': 3,
  'fetching/fetch-in-effect': 4, 'size/props': 4, 'size/state': 4, 'size/effects': 4, 'size/jsx-depth': 4,
  'size/component-lines': 5, 'size/hook-lines': 5, 'size/file-lines': 5,
};
if (argv.includes('--next')) {
  const toCombo = ([k, n]) => { const [rule, f] = k.split('::'); return { rule, folder: f, count: n, effort: EFFORT[rule] ?? 3 }; };
  const pick = groupBy(entries, (e) => `${e.rule}::${folder(e.file)}`).map(toCombo)
    .filter((c) => c.count <= MAX).sort((a, b) => a.effort - b.effort || b.count - a.count)[0]
    ?? groupBy(entries, (e) => `${e.rule}::${e.file}`).map(toCombo).sort((a, b) => a.count - b.count)[0];
  if (!pick) { console.log('Baseline is empty. 🎉'); process.exit(0); }
  if (JSON_OUT) { console.log(JSON.stringify(pick)); process.exit(0); }
  console.log(`Next slice: ${pick.count} × ${pick.rule} in ${pick.folder} (effort ${pick.effort}/5)`);
  console.log(`  node .claude/skills/guard-burndown/scripts/baseline-report.mjs --slice "rule=${pick.rule}" --slice "path=${pick.folder}"`);
  process.exit(0);
}

// ── summary ──
if (JSON_OUT) { console.log(JSON.stringify({ total, byRule: Object.fromEntries(groupBy(entries, (e) => e.rule)), byFolder: Object.fromEntries(groupBy(entries, (e) => folder(e.file))) }, null, 2)); process.exit(0); }
const bar = (n) => '█'.repeat(Math.max(1, Math.round((n / total) * 30)));
console.log(`Baseline: ${total} accepted violation(s) in ${new Set(entries.map((e) => e.file)).size} file(s)\n\nBy rule`);
for (const [r, n] of groupBy(entries, (e) => e.rule)) console.log(`  ${String(n).padStart(4)}  ${r.padEnd(30)} ${bar(n)}`);
console.log(`\nBy folder (depth ${DEPTH})`);
for (const [f, n] of groupBy(entries, (e) => folder(e.file)).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log('\nPick a slice: --next, or --slice "rule=<check>/<rule>" --slice "path=<folder>"');
