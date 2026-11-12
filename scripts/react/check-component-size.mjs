#!/usr/bin/env node
/**
 * check-component-size: catches "god components" and oversized hooks/files early.
 *
 * Rules (per component = PascalCase function returning JSX; per hook = use* function)
 *   component-lines   > maxComponentLines
 *   hook-lines        > maxHookLines
 *   state             > maxState      (useState + useReducer calls)
 *   effects           > maxEffects    (useEffect + useLayoutEffect + useInsertionEffect)
 *   props             > maxProps      (destructured props or the props type's members)
 *   jsx-depth         > maxJsxDepth   (nesting of JSX elements)
 *   file-lines        > maxFileLines
 *
 * Config section: "size"
 * Ignore: // size-ignore-next-line: <reason>   (on the line above the component)
 */
import { main, isMain, functionName, calleeName, containsJsx } from './lib/core.mjs';

const STATE_HOOKS = new Set(['useState', 'useReducer']);
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

export const check = {
  name: 'size',
  key: 'size',
  extensions: ['.tsx', '.jsx', '.ts', '.js'],
  needsAst: true,
  defaults: {
    exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/*.d.ts'],
    maxComponentLines: 200,
    maxHookLines: 120,
    maxState: 5,
    maxEffects: 3,
    maxProps: 10,
    maxJsxDepth: 8,
    maxFileLines: 400,
    hint: 'split it: extract sub-components, move logic into a custom hook, or group related state',
  },

  analyze(ctx) {
    const { ts, sf, opts, lines } = ctx;
    const hint = opts.hint;
    const span = (node) => {
      const a = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const b = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      return b - a + 1;
    };

    if (opts.maxFileLines && lines.length > opts.maxFileLines) {
      ctx.report({ line: 1, col: 1 }, 'file-lines', `file has ${lines.length} lines (max ${opts.maxFileLines}) → split it into smaller modules`);
    }

    // local type lookup for props counting
    const typeMembers = new Map();
    const visitTypes = (n) => {
      if (ts.isInterfaceDeclaration(n)) typeMembers.set(n.name.text, n.members.length);
      if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)) typeMembers.set(n.name.text, n.type.members.length);
      ts.forEachChild(n, visitTypes);
    };
    visitTypes(sf);
    const countFromType = (t) => {
      if (!t) return undefined;
      if (ts.isTypeLiteralNode(t)) return t.members.length;
      if (ts.isTypeReferenceNode(t)) {
        const n = t.typeName.getText(sf);
        if (typeMembers.has(n)) return typeMembers.get(n);
        // React.FC<Props>, FC<Props>, PropsWithChildren<Props>
        if (t.typeArguments?.length) return countFromType(t.typeArguments[0]);
      }
      if (ts.isIntersectionTypeNode(t)) {
        const parts = t.types.map(countFromType).filter((x) => x !== undefined);
        return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
      }
      return undefined;
    };
    const propsCount = (fn) => {
      const p = fn.parameters[0];
      if (p) {
        if (ts.isObjectBindingPattern(p.name)) {
          const els = p.name.elements.filter((e) => !e.dotDotDotToken);
          const fromType = countFromType(p.type);
          return Math.max(els.length, fromType ?? 0);
        }
        const fromType = countFromType(p.type);
        if (fromType !== undefined) return fromType;
      }
      // const X: React.FC<Props> = (props) => …
      let decl = fn.parent;
      while (decl && ts.isCallExpression(decl)) decl = decl.parent;
      if (decl && ts.isVariableDeclaration(decl)) return countFromType(decl.type);
      return undefined;
    };

    const measure = (fn) => {
      let state = 0, effects = 0, depth = 0;
      const walk = (n, d) => {
        if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) {
          const nested = functionName(ts, n);
          if (nested && /^[A-Z]/.test(nested)) return; // nested component measured on its own
        }
        if (ts.isCallExpression(n)) {
          const c = calleeName(ts, n.expression);
          if (STATE_HOOKS.has(c)) state++;
          if (EFFECT_HOOKS.has(c)) effects++;
        }
        let nd = d;
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { nd = d + 1; depth = Math.max(depth, nd); }
        ts.forEachChild(n, (c) => walk(c, nd));
      };
      walk(fn, 0);
      return { state, effects, depth };
    };

    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const name = functionName(ts, node);
        const reportAt = ts.isFunctionDeclaration(node) ? node : (node.parent && ts.isVariableDeclaration(node.parent) ? node.parent.parent?.parent ?? node : node);
        const anchor = (() => { // the statement line, so ignore comments go above the declaration
          let p = node;
          while (p.parent && !ts.isSourceFile(p.parent)) p = p.parent;
          return ts.isSourceFile(p.parent) ? p : reportAt;
        })();
        if (name && /^[A-Z]/.test(name) && node.body && containsJsx(ts, node.body)) {
          const lines = span(node);
          const m = measure(node);
          const props = propsCount(node);
          const tag = `<${name}>`;
          if (lines > opts.maxComponentLines) ctx.report(anchor, 'component-lines', `${tag} is ${lines} lines (max ${opts.maxComponentLines}) → ${hint}`);
          if (m.state > opts.maxState) ctx.report(anchor, 'state', `${tag} has ${m.state} useState/useReducer (max ${opts.maxState}) → group state with useReducer or extract a hook`);
          if (m.effects > opts.maxEffects) ctx.report(anchor, 'effects', `${tag} has ${m.effects} effects (max ${opts.maxEffects}) → move side effects into custom hooks`);
          if (props !== undefined && props > opts.maxProps) ctx.report(anchor, 'props', `${tag} takes ${props} props (max ${opts.maxProps}) → split the component or group props into objects`);
          if (m.depth > opts.maxJsxDepth) ctx.report(anchor, 'jsx-depth', `${tag} nests JSX ${m.depth} levels deep (max ${opts.maxJsxDepth}) → extract sub-components`);
        } else if (name && /^use[A-Z0-9]/.test(name) && node.body) {
          const lines = span(node);
          const m = measure(node);
          if (lines > opts.maxHookLines) ctx.report(anchor, 'hook-lines', `${name}() is ${lines} lines (max ${opts.maxHookLines}) → split into smaller hooks`);
          if (m.effects > opts.maxEffects) ctx.report(anchor, 'effects', `${name}() has ${m.effects} effects (max ${opts.maxEffects}) → split into smaller hooks`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  },
};

if (isMain(import.meta.url)) main([check]);
