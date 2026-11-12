#!/usr/bin/env node
/**
 * nearest-token: maps raw design values (from Figma, a screenshot, a ticket) to the closest design tokens.
 *
 *   node .claude/skills/figma-to-code/scripts/nearest-token.mjs "#1F2937" 14px 0.75rem "rgb(59 130 246)"
 *     [--tokens src/styles/globals.css,src/styles/tokens.json] [--top 3] [--json]
 *
 * Token sources
 *   CSS/SCSS: custom properties (`--color-primary: …;`, incl. Tailwind v4 `@theme { … }`), var() refs resolved
 *   JSON:     nested objects; leaves or `{ "$value" | "value": … }` (W3C / Style Dictionary)
 *   Default:  every .css/.scss/.json under src/styles plus src/{app,}/globals.css, src/index.css, tokens.json
 *
 * Colors are compared in OKLab (perceptual; handles hex, rgb(), hsl(), oklch()). Sizes in px (rem/em = 16px).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TOP = Number(arg('top', 3));
const JSON_OUT = argv.includes('--json');
const values = argv.filter((a, i) => !a.startsWith('--') && !['--tokens', '--top'].includes(argv[i - 1]));
if (!values.length) { console.error('usage: nearest-token.mjs <value...> [--tokens a.css,b.json]'); process.exit(2); }

// ── sources ──
const walk = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(d, e.name), out);
    else if (['.css', '.scss', '.json'].includes(extname(e.name))) out.push(join(d, e.name));
  }
  return out;
};
let sources = arg('tokens')?.split(',').map((p) => resolve(ROOT, p.trim()));
if (!sources) {
  sources = [...walk(join(ROOT, 'src/styles')),
    ...['src/app/globals.css', 'src/globals.css', 'src/index.css', 'src/styles.css', 'tokens.json', 'src/tokens.json'].map((p) => join(ROOT, p))]
    .filter((p) => existsSync(p) && statSync(p).isFile());
}
if (!sources.length) { console.error('nearest-token: no token files found (use --tokens)'); process.exit(2); }

const tokens = new Map(); // name → { raw, source, usage }
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  const src = relative(ROOT, file);
  if (extname(file) === '.json') {
    const flat = (obj, path = []) => {
      if (obj && typeof obj === 'object' && ('$value' in obj || 'value' in obj)) {
        const v = obj.$value ?? obj.value;
        if (typeof v === 'string' || typeof v === 'number') tokens.set(path.join('.'), { raw: String(v), source: src, usage: `token ${path.join('.')}` });
        return;
      }
      if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { if (!k.startsWith('$')) flat(v, [...path, k]); }
      else if (typeof obj === 'string' || typeof obj === 'number') tokens.set(path.join('.'), { raw: String(obj), source: src, usage: `token ${path.join('.')}` });
    };
    try { flat(JSON.parse(text)); } catch { /* not a token file */ }
  } else {
    for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      if (!tokens.has(m[1])) tokens.set(m[1], { raw: m[2].trim(), source: src, usage: `var(${m[1]})` });
    }
  }
}
// resolve var(--x) and {json.refs}
const resolveRaw = (raw, depth = 0) => {
  if (depth > 10) return raw;
  return raw
    .replace(/var\((--[\w-]+)(?:\s*,[^)]*)?\)/g, (s, n) => (tokens.has(n) ? resolveRaw(tokens.get(n).raw, depth + 1) : s))
    .replace(/\{([\w.-]+)\}/g, (s, n) => (tokens.has(n) ? resolveRaw(tokens.get(n).raw, depth + 1) : s));
};

// ── parsing ──
const clamp = (x) => Math.min(1, Math.max(0, x));
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgbToOklab = ([r, g, b]) => {
  const [lr, lg, lb] = [r, g, b].map((c) => srgbToLinear(c / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const hslToRgb = (h, s, l) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const nums = (s) => s.split(/[\s,/]+/).filter(Boolean);
const pct = (v, scale) => (v.endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v));

function parseColor(v) {
  v = v.trim().toLowerCase();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return rgbToOklab([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  }
  if ((m = v.match(/^rgba?\(([^)]+)\)$/))) { const p = nums(m[1]); return rgbToOklab(p.slice(0, 3).map((x) => pct(x, 255))); }
  if ((m = v.match(/^hsla?\(([^)]+)\)$/))) { const p = nums(m[1]); return rgbToOklab(hslToRgb(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]))); }
  if ((m = v.match(/^oklch\(([^)]+)\)$/))) {
    const p = nums(m[1]);
    const L = pct(p[0], 1), C = pct(p[1], 0.4), H = (parseFloat(p[2]) * Math.PI) / 180;
    return [L, C * Math.cos(H), C * Math.sin(H)];
  }
  if ((m = v.match(/^oklab\(([^)]+)\)$/))) { const p = nums(m[1]); return [pct(p[0], 1), pct(p[1], 0.4), pct(p[2], 0.4)]; }
  // bare "H S% L%" (shadcn v3 style: --primary: 222 47% 11%)
  if ((m = v.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/))) return rgbToOklab(hslToRgb(+m[1], +m[2], +m[3]));
  return null;
}
function parseSize(v) {
  const m = v.trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

// ── index tokens ──
const colorTokens = [], sizeTokens = [];
for (const [name, t] of tokens) {
  const r = resolveRaw(t.raw);
  const c = parseColor(r);
  if (c) { colorTokens.push({ name, ...t, resolved: r, lab: c }); continue; }
  const s = parseSize(r);
  if (s !== null) sizeTokens.push({ name, ...t, resolved: r, px: s });
}

// Tailwind v4 class hint from theme variable names
const twHint = (name) => {
  let m;
  if ((m = name.match(/^--color-(.+)$/))) return `bg-${m[1]} / text-${m[1]} / border-${m[1]}`;
  if ((m = name.match(/^--(?:text|font-size)-(.+)$/))) return `text-${m[1]}`;
  if ((m = name.match(/^--radius-(.+)$/))) return `rounded-${m[1]}`;
  if ((m = name.match(/^--spacing-(.+)$/))) return `p-${m[1]} / gap-${m[1]}`;
  return '';
};

const results = values.map((input) => {
  const lab = parseColor(input);
  if (lab) {
    const ranked = colorTokens
      .map((t) => ({ ...t, distance: Math.hypot(lab[0] - t.lab[0], lab[1] - t.lab[1], lab[2] - t.lab[2]) }))
      .sort((a, b) => a.distance - b.distance).slice(0, TOP);
    return { input, kind: 'color', matches: ranked.map((t) => ({ token: t.name, usage: t.usage, tailwind: twHint(t.name), value: t.resolved, distance: +t.distance.toFixed(4), verdict: t.distance < 0.005 ? 'exact' : t.distance < 0.04 ? 'close' : 'far', source: t.source })) };
  }
  const px = parseSize(input);
  if (px !== null) {
    const ranked = sizeTokens.map((t) => ({ ...t, distance: Math.abs(px - t.px) })).sort((a, b) => a.distance - b.distance).slice(0, TOP);
    return { input, kind: 'size', px, matches: ranked.map((t) => ({ token: t.name, usage: t.usage, tailwind: twHint(t.name), value: t.resolved, distance: t.distance, verdict: t.distance === 0 ? 'exact' : t.distance <= 2 ? 'close' : 'far', source: t.source })) };
  }
  return { input, kind: 'unknown', matches: [] };
});

if (JSON_OUT) { console.log(JSON.stringify({ tokens: tokens.size, results }, null, 2)); process.exit(0); }
console.log(`${tokens.size} tokens from ${sources.map((s) => relative(ROOT, s)).join(', ')}\n`);
for (const r of results) {
  console.log(`${r.input}${r.kind === 'size' ? ` (${r.px}px)` : ''}`);
  if (!r.matches.length) { console.log(`  no ${r.kind === 'unknown' ? 'parseable value' : r.kind + ' tokens'} found\n`); continue; }
  for (const m of r.matches) console.log(`  ${m.verdict.padEnd(5)}  ${m.usage.padEnd(28)} ${String(m.value).padEnd(26)} Δ ${m.distance}${m.tailwind ? `   tw: ${m.tailwind}` : ''}`);
  console.log('');
}
