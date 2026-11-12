#!/usr/bin/env node
/**
 * check-naming: file, folder, component and hook naming conventions.
 *
 * Rules
 *   component-file-case    component files use componentFileCase (default PascalCase: Button.tsx)
 *   export-matches-file    main exported component name matches the file (or folder, for index.tsx)
 *   one-component-per-file at most maxComponentsPerFile exported components (compound Card/CardHeader allowed)
 *   hook-in-component-file hooks exported from a component file → move to their own file
 *   hook-file-name         use*.ts files export a hook with the same name, cased per hookFileCase
 *   hook-location          (optional) hook files must live under hooksLocation globs
 *   folder-case            folder names under `include` use folderCase
 *   file-case              (optional) other files use otherFileCase
 *
 * Config section: "naming"
 * Ignore: // naming-ignore-file: <reason>
 */
import { dirname, basename, extname } from 'node:path';
import { main, isMain, matchesCase, toPascal, toCamel, toKebab, stem, globMatcher, WRAPPERS, calleeName, containsJsx } from './lib/core.mjs';

// Next.js / Remix / Vite special files that don't follow component naming
const RESERVED = ['index', 'page', 'layout', 'template', 'loading', 'error', 'global-error', 'not-found', 'default', 'route',
  'middleware', 'instrumentation', 'head', 'opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'sitemap', 'robots', 'manifest',
  '_app', '_document', '_error', 'root', 'main', 'App', 'vite-env', 'setupTests', 'global'];

export const check = {
  name: 'naming',
  key: 'naming',
  extensions: ['.tsx', '.jsx', '.ts', '.js'],
  needsAst: true,
  defaults: {
    exclude: ['**/*.d.ts', '**/*.config.*', '**/*.stories.*', '**/*.test.*', '**/*.spec.*'],
    componentFileCase: 'PascalCase',        // or "kebab-case" (shadcn style: button.tsx)
    matchExportToFile: true,
    maxComponentsPerFile: 1,
    allowCompoundComponents: true,          // Card.tsx may export Card, CardHeader, CardBody
    hookFileCase: 'camelCase',              // useCart.ts · or "kebab-case": use-cart.ts
    hooksLocation: [],                      // e.g. ["src/hooks/**", "src/features/*/hooks/**"]
    folderCase: ['kebab-case'],             // add "PascalCase" if component folders are PascalCase
    folderIgnore: ['^__.*__$', '^\\.', '^(\\[.*\\]|\\(.*\\)|@.*|_.*)$'], // __tests__, [id], (group), @slot, _private
    otherFileCase: null,                    // e.g. ["camelCase", "kebab-case"]; null = off
    reservedFiles: RESERVED,
  },

  analyze(ctx) {
    const { ts, sf, opts, rel, ext } = ctx;
    const reserved = new Set(opts.reservedFiles);
    const name = stem(rel);
    const isJsxFile = ext === '.tsx' || ext === '.jsx';

    // ── folders (once per folder) ──
    ctx.state.seenDirs ??= new Set();
    const folderIgnore = opts.folderIgnore.map((r) => new RegExp(r));
    const segments = dirname(rel).split('/');
    for (let i = 1; i < segments.length; i++) { // skip the include root itself (src)
      const seg = segments[i];
      const path = segments.slice(0, i + 1).join('/');
      if (ctx.state.seenDirs.has(path)) continue;
      ctx.state.seenDirs.add(path);
      if (folderIgnore.some((r) => r.test(seg))) continue;
      if (opts.folderCase && !matchesCase(seg, opts.folderCase)) {
        ctx.reportPath(path + '/', 'folder-case', `folder "${seg}" should be ${[].concat(opts.folderCase).join(' or ')}`);
      }
    }

    // ── collect top-level declarations & exports ──
    const locals = new Map(); // name → kind: 'function' | 'class' | 'other'
    const exported = [];      // { name, kind, node, isDefault }
    const kindOfInit = (init) => {
      if (!init) return 'other';
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return 'function';
      if (ts.isCallExpression(init) && WRAPPERS.has(calleeName(ts, init.expression)) && calleeName(ts, init.expression) !== 'styled') return 'function';
      if (ts.isClassExpression(init)) return 'class';
      return 'other';
    };
    const hasMod = (n, k) => n.modifiers?.some((m) => m.kind === k);

    for (const st of sf.statements) {
      const isExport = hasMod(st, ts.SyntaxKind.ExportKeyword);
      const isDefault = hasMod(st, ts.SyntaxKind.DefaultKeyword);
      if (ts.isFunctionDeclaration(st) && st.name) {
        locals.set(st.name.text, 'function');
        if (isExport) exported.push({ name: st.name.text, kind: 'function', node: st, isDefault });
      } else if (ts.isClassDeclaration(st) && st.name) {
        locals.set(st.name.text, 'class');
        if (isExport) exported.push({ name: st.name.text, kind: 'class', node: st, isDefault });
      } else if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          const kind = kindOfInit(d.initializer);
          locals.set(d.name.text, kind);
          if (isExport) exported.push({ name: d.name.text, kind, node: d, isDefault: false });
        }
      } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
        const n = st.expression.text;
        const prev = exported.find((e) => e.name === n);
        if (prev) prev.isDefault = true;
        else exported.push({ name: n, kind: locals.get(n) ?? 'other', node: st, isDefault: true });
      } else if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          exported.push({ name: el.name.text, kind: locals.get(local) ?? 'other', node: el, isDefault: el.name.text === 'default' });
        }
      }
    }
    // export default function() {} without a name → treat as main component named after the file
    const isComponent = (e) => isJsxFile && /^[A-Z]/.test(e.name) && !/^[A-Z0-9_]+$/.test(e.name) && (e.kind === 'function' || e.kind === 'class');
    const isHook = (e) => /^use[A-Z0-9]/.test(e.name) && e.kind === 'function';
    const components = exported.filter(isComponent);
    const hooks = exported.filter(isHook);
    const isReserved = reserved.has(name);
    const isComponentFile = components.length > 0 && containsJsx(ts, sf);

    // ── component files ──
    if (isComponentFile && !isReserved) {
      if (opts.componentFileCase && !matchesCase(name, opts.componentFileCase)) {
        const suggestion = opts.componentFileCase === 'kebab-case' ? toKebab(name) : toPascal(name);
        ctx.report({ line: 1, col: 1 }, 'component-file-case', `component file "${basename(rel)}" should be ${opts.componentFileCase} (e.g. "${suggestion}${extname(rel)}")`);
      }
    }
    if (isComponentFile) {
      const expectedName = toPascal(name === 'index' ? basename(dirname(rel)) : name);
      const main = components.find((c) => c.isDefault) ?? components.find((c) => c.name === expectedName) ?? components[0];
      if (opts.matchExportToFile && !(isReserved && name !== 'index') && main.name !== expectedName) {
        ctx.report(main.node, 'export-matches-file', `component "${main.name}" should be named "${expectedName}" to match its ${name === 'index' ? 'folder' : 'file'} (or rename the file)`);
      }
      const extra = components.filter((c) => c !== main && !(opts.allowCompoundComponents && c.name.startsWith(main.name)));
      if (opts.maxComponentsPerFile && 1 + extra.length > opts.maxComponentsPerFile) {
        for (const c of extra) ctx.report(c.node, 'one-component-per-file', `"${c.name}" is a second exported component in ${basename(rel)} → move it to ${c.name}${extname(rel)}`);
      }
      for (const h of hooks) {
        ctx.report(h.node, 'hook-in-component-file', `hook "${h.name}" is exported from a component file → move it to ${h.name}.ts`);
      }
    }

    // ── hook files ──
    const isHookFile = /^use[A-Z0-9-]/.test(name) || /^use-/.test(name);
    if (isHookFile) {
      const expectedFile = opts.hookFileCase === 'kebab-case' ? toKebab(toCamel(name)) : toCamel(name);
      if (name !== expectedFile) {
        ctx.report({ line: 1, col: 1 }, 'hook-file-name', `hook file "${basename(rel)}" should be "${expectedFile}${extname(rel)}"`);
      }
      const hookName = toCamel(name);
      if (hooks.length && !hooks.some((h) => h.name === hookName)) {
        ctx.report(hooks[0].node, 'hook-file-name', `${basename(rel)} should export "${hookName}" (found ${hooks.map((h) => h.name).join(', ')})`);
      }
    }
    if (hooks.length && !isComponentFile && opts.hooksLocation?.length && !globMatcher(opts.hooksLocation)(rel)) {
      ctx.report(hooks[0].node, 'hook-location', `hooks should live in ${opts.hooksLocation.join(' or ')}`);
    }

    // ── other files ──
    if (opts.otherFileCase && !isComponentFile && !isHookFile && !isReserved && !matchesCase(name, opts.otherFileCase)) {
      ctx.report({ line: 1, col: 1 }, 'file-case', `file "${basename(rel)}" should be ${[].concat(opts.otherFileCase).join(' or ')}`);
    }
  },
};

if (isMain(import.meta.url)) main([check]);
