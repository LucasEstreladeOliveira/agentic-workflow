#!/usr/bin/env node
/**
 * build-catalog: generates a markdown catalog of the design-system primitives.
 *
 *   node .claude/skills/design-system/scripts/build-catalog.mjs \
 *     [--dir src/components/ui] [--alias @/=src/] [--out .claude/skills/design-system/catalog.md] [--check]
 *
 * Reads React (.tsx/.jsx) and Vue (.vue <script setup lang="ts">) files and extracts per component:
 *   import line · JSDoc description · props (name, type, optional, default, doc) · extends (native props)
 *   cva() variants + defaults · Vue withDefaults() defaults
 * --check  exits 1 if the catalog on disk is out of date (use in CI / pre-commit).
 * Uses the project's own `typescript` package.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, extname, basename, dirname } from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DIR = arg('dir', 'src/components/ui');
const [ALIAS_PREFIX, ALIAS_TARGET] = arg('alias', '@/=src/').split('=');
const OUT = arg('out', '.claude/skills/design-system/catalog.md');
const CHECK = argv.includes('--check');

let ts;
try { ts = createRequire(join(ROOT, 'package.json'))('typescript'); } catch {
  try { ts = createRequire(import.meta.url)('typescript'); } catch { console.error('build-catalog: install "typescript"'); process.exit(2); }
}

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(join(d, e.name), out); }
    else if (/\.(tsx|jsx|vue)$/.test(e.name) && !/\.(test|spec|stories)\./.test(e.name)) out.push(join(d, e.name));
  }
  return out;
};

const importPath = (file) => {
  const rel = relative(ROOT, file).split('\\').join('/').replace(/\.(tsx|jsx|ts|js)$/, '').replace(/\/index$/, '');
  return rel.startsWith(ALIAS_TARGET) ? ALIAS_PREFIX + rel.slice(ALIAS_TARGET.length) : './' + rel;
};

const jsDoc = (node) => {
  const docs = node.jsDoc ?? ts.getJSDocCommentsAndTags?.(node) ?? [];
  const d = docs.find((x) => x.comment);
  const c = d?.comment;
  return typeof c === 'string' ? c.trim() : Array.isArray(c) ? c.map((p) => p.text).join('').trim() : '';
};
const clean = (s) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

function analyze(file) {
  const raw = readFileSync(file, 'utf8');
  const isVue = extname(file) === '.vue';
  let code = raw;
  if (isVue) {
    const m = raw.match(/<script\b[^>]*setup[^>]*>([\s\S]*?)<\/script>/) ?? raw.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);
    code = m ? m[1] : '';
  }
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, isVue ? ts.ScriptKind.TS : ts.ScriptKind.TSX);

  // type declarations in file
  const types = new Map();
  const variants = new Map(); // cva name → { variants: {k:[...]}, defaults }
  const visit = (n) => {
    if (ts.isInterfaceDeclaration(n)) types.set(n.name.text, { members: n.members, heritage: (n.heritageClauses ?? []).flatMap((h) => h.types.map((t) => t.getText(sf))) });
    if (ts.isTypeAliasDeclaration(n)) {
      if (ts.isTypeLiteralNode(n.type)) types.set(n.name.text, { members: n.type.members, heritage: [] });
      else if (ts.isIntersectionTypeNode(n.type)) {
        const lit = n.type.types.filter(ts.isTypeLiteralNode).flatMap((t) => [...t.members]);
        const other = n.type.types.filter((t) => !ts.isTypeLiteralNode(t)).map((t) => t.getText(sf));
        types.set(n.name.text, { members: lit, heritage: other });
      }
    }
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(sf) === 'cva' && ts.isIdentifier(n.name)) {
      const cfg = n.initializer.arguments[1];
      const out = { variants: {}, defaults: {} };
      if (cfg && ts.isObjectLiteralExpression(cfg)) {
        for (const p of cfg.properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
          const key = p.name.getText(sf);
          if (key === 'variants') for (const v of p.initializer.properties) {
            if (ts.isPropertyAssignment(v) && ts.isObjectLiteralExpression(v.initializer)) {
              out.variants[v.name.getText(sf).replace(/['"]/g, '')] = v.initializer.properties.map((o) => o.name?.getText(sf).replace(/['"]/g, '')).filter(Boolean);
            }
          }
          if (key === 'defaultVariants') for (const v of p.initializer.properties) {
            if (ts.isPropertyAssignment(v)) out.defaults[v.name.getText(sf)] = v.initializer.getText(sf).replace(/['"]/g, '');
          }
        }
      }
      variants.set(n.name.text, out);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  const propsFromType = (t) => {
    if (!t) return null;
    if (ts.isTypeLiteralNode(t)) return { members: t.members, heritage: [] };
    if (ts.isTypeReferenceNode(t)) {
      const name = t.typeName.getText(sf);
      if (types.has(name)) return types.get(name);
      if (t.typeArguments?.length) return propsFromType(t.typeArguments.at(-1));
      return { members: [], heritage: [t.getText(sf)] };
    }
    if (ts.isIntersectionTypeNode(t)) {
      const parts = t.types.map(propsFromType).filter(Boolean);
      return { members: parts.flatMap((p) => [...p.members]), heritage: parts.flatMap((p) => p.heritage) };
    }
    return null;
  };
  const describeMembers = (members, defaults = {}) => members.filter(ts.isPropertySignature).map((m) => ({
    name: m.name.getText(sf),
    type: clean(m.type?.getText(sf) ?? 'unknown'),
    optional: !!m.questionToken,
    def: defaults[m.name.getText(sf)],
    doc: clean(jsDoc(m)),
  }));

  const components = [];
  if (isVue) {
    let props = null; let defaults = {};
    const findDefine = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(sf);
        if (callee === 'withDefaults' && n.arguments[1] && ts.isObjectLiteralExpression(n.arguments[1])) {
          for (const p of n.arguments[1].properties) if (ts.isPropertyAssignment(p)) defaults[p.name.getText(sf)] = clean(p.initializer.getText(sf));
        }
        if (callee === 'defineProps' && n.typeArguments?.[0]) props = propsFromType(n.typeArguments[0]);
      }
      ts.forEachChild(n, findDefine);
    };
    findDefine(sf);
    const emits = [];
    const findEmits = (n) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf) === 'defineEmits' && n.typeArguments?.[0]) emits.push(clean(n.typeArguments[0].getText(sf)));
      ts.forEachChild(n, findEmits);
    };
    findEmits(sf);
    const name = basename(file, '.vue');
    const slots = [...raw.matchAll(/<slot(?:\s+name="([^"]+)")?/g)].map((m) => m[1] ?? 'default');
    components.push({ name, doc: '', props: props ? describeMembers(props.members, defaults) : [], heritage: props?.heritage ?? [], variants: null, emits, slots: [...new Set(slots)] });
  } else {
    const isExported = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const exportedNames = new Set();
    for (const st of sf.statements) {
      if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.moduleSpecifier) {
        for (const el of st.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text);
      }
    }
    for (const st of sf.statements) {
      const candidates = [];
      if (ts.isFunctionDeclaration(st) && st.name) candidates.push({ name: st.name.text, fn: st, node: st, exported: isExported(st) });
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        let init = d.initializer; let fnType = null;
        while (ts.isCallExpression(init)) { // forwardRef<El, Props>(fn), memo(fn)
          if (init.expression.getText(sf).endsWith('forwardRef') && init.typeArguments?.[1]) fnType = init.typeArguments[1];
          init = init.arguments[0];
          if (!init) break;
        }
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          candidates.push({ name: d.name.text, fn: init, node: st, exported: isExported(st), fnType: fnType ?? d.type });
        }
      }
      for (const c of candidates) {
        if (!/^[A-Z]/.test(c.name) || !(c.exported || exportedNames.has(c.name))) continue;
        const p = c.fn.parameters[0];
        const props = propsFromType(p?.type) ?? propsFromType(c.fnType) ?? { members: [], heritage: [] };
        // defaults from destructuring: ({ size = 'md' })
        const defaults = {};
        if (p && ts.isObjectBindingPattern(p.name)) for (const el of p.name.elements) {
          if (el.initializer && ts.isIdentifier(el.name)) defaults[el.name.text] = clean(el.initializer.getText(sf));
        }
        // cva VariantProps<typeof buttonVariants>
        let variant = null;
        for (const h of props.heritage) {
          const m = h.match(/VariantProps<typeof (\w+)>/);
          if (m && variants.has(m[1])) variant = variants.get(m[1]);
        }
        if (!variant && variants.size === 1 && candidates.length === 1) variant = [...variants.values()][0];
        components.push({
          name: c.name,
          doc: clean(jsDoc(c.node)),
          props: describeMembers(props.members, defaults),
          heritage: props.heritage.filter((h) => !/VariantProps/.test(h)),
          variants: variant,
        });
      }
    }
  }
  return components.map((c) => ({ ...c, file: relative(ROOT, file).split('\\').join('/'), importFrom: importPath(file), isVue }));
}

const dirAbs = resolve(ROOT, DIR);
if (!existsSync(dirAbs)) { console.error(`build-catalog: ${DIR} not found (use --dir)`); process.exit(2); }
const all = walk(dirAbs).sort().flatMap(analyze);

const lines = [
  '# Design-system catalog',
  '',
  `> Generated by \`build-catalog.mjs\` from \`${DIR}\`. Do not edit by hand; re-run the script.`,
  '',
  '| Component | Import |',
  '|---|---|',
  ...all.map((c) => `| [${c.name}](#${c.name.toLowerCase()}) | \`${c.importFrom}\` |`),
  '',
];
for (const c of all) {
  lines.push(`## ${c.name}`, '');
  if (c.doc) lines.push(c.doc, '');
  lines.push('```ts', c.isVue ? `import ${c.name} from '${c.importFrom}';` : `import { ${c.name} } from '${c.importFrom}';`, '```', '');
  if (c.heritage.length) lines.push(`Also accepts: ${c.heritage.map((h) => `\`${h}\``).join(', ')}`, '');
  if (c.variants && Object.keys(c.variants.variants).length) {
    lines.push('**Variants**', '');
    for (const [k, vals] of Object.entries(c.variants.variants)) {
      lines.push(`- \`${k}\`: ${vals.map((v) => (v === c.variants.defaults[k] ? `**${v}** (default)` : v)).join(' · ')}`);
    }
    lines.push('');
  }
  if (c.props.length) {
    lines.push('| Prop | Type | Required | Default | Notes |', '|---|---|---|---|---|');
    for (const p of c.props) lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.optional ? '' : 'yes'} | ${p.def ? `\`${p.def}\`` : ''} | ${p.doc} |`);
    lines.push('');
  }
  if (c.emits?.length) lines.push(`**Emits:** \`${c.emits.join(' ')}\``, '');
  if (c.slots?.length) lines.push(`**Slots:** ${c.slots.map((s) => `\`${s}\``).join(', ')}`, '');
  lines.push(`<sub>${c.file}</sub>`, '');
}
const md = lines.join('\n');
const outAbs = resolve(ROOT, OUT);

if (CHECK) {
  const current = existsSync(outAbs) ? readFileSync(outAbs, 'utf8') : '';
  if (current !== md) { console.error(`build-catalog: ${OUT} is out of date. Run build-catalog.mjs`); process.exit(1); }
  console.log(`✓ ${OUT} up to date (${all.length} components)`);
  process.exit(0);
}
mkdirSync(dirname(outAbs), { recursive: true });
writeFileSync(outAbs, md);
console.log(`✓ wrote ${OUT}: ${all.length} components from ${DIR}`);
