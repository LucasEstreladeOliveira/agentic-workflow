#!/usr/bin/env node
/**
 * check-data-fetching: data access must go through the API / query layer.
 *
 * Rules
 *   forbidden-import  importing an HTTP client (axios, ky, ofetch…) outside `allowedIn`
 *   forbidden-call    fetch() / axios.get() / new XMLHttpRequest() … outside `allowedIn`
 *   fetch-in-effect   data loading inside useEffect/useLayoutEffect (anywhere) → use a query hook
 *
 * Next.js: server components (files under appDir without "use client") and "use server" files are allowed.
 *
 * Config section: "fetching"
 * Ignore: // fetching-ignore-next-line: <reason>
 */
import { main, isMain, globMatcher, calleeName, calleeText } from './lib/core.mjs';

const toRe = (pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\w$]*') + '$');

export const check = {
  name: 'fetching',
  key: 'fetching',
  extensions: ['.tsx', '.jsx', '.ts', '.js'],
  needsAst: true,
  defaults: {
    exclude: ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/__mocks__/**', '**/mocks/**', '**/*.d.ts'],
    allowedIn: [
      'src/api/**', 'src/**/api/**', 'src/services/**', 'src/**/queries/**', 'src/**/*.api.{ts,tsx}',
      'src/**/*.server.{ts,tsx}', 'src/server/**', 'src/lib/http/**', 'src/app/**/route.{ts,js}', 'src/pages/api/**',
    ],
    forbiddenImports: ['axios', 'ky', 'ofetch', 'ohmyfetch', 'node-fetch', 'cross-fetch', 'isomorphic-fetch', 'graphql-request', 'superagent'],
    forbiddenCalls: ['fetch', 'window.fetch', 'globalThis.fetch', 'axios', 'axios.*', 'ky', 'ky.*', '$fetch', 'ofetch', 'request', 'superagent.*'],
    forbiddenConstructors: ['XMLHttpRequest'],
    effectFetchPattern: '^(fetch|load|get|request|query)[A-Z]',
    allowServerComponents: true,
    appDir: 'src/app',
    hint: 'move it to the API layer (e.g. src/api) and consume it through a query hook (useQuery / SWR / your data hook)',
  },

  analyze(ctx) {
    const { ts, sf, opts, rel, ext } = ctx;
    const hint = opts.hint;
    const allowedFile = globMatcher(opts.allowedIn)(rel);

    // Next.js server components / server actions
    const directives = [];
    for (const st of sf.statements) {
      if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) directives.push(st.expression.text);
      else break;
    }
    const isServerFile = directives.includes('use server') ||
      (opts.allowServerComponents && opts.appDir && rel.startsWith(opts.appDir.replace(/\/$/, '') + '/') &&
        !directives.includes('use client') && ['.tsx', '.ts', '.jsx', '.js'].includes(ext));
    const allowed = allowedFile || isServerFile;

    const callRes = opts.forbiddenCalls.map(toRe);
    const effectRe = opts.effectFetchPattern ? new RegExp(opts.effectFetchPattern) : null;
    const isForbiddenCall = (expr) => {
      const text = calleeText(ts, expr);
      return text && callRes.some((r) => r.test(text)) ? text : undefined;
    };

    // imports
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      if (st.importClause?.isTypeOnly) continue;
      const mod = st.moduleSpecifier.text;
      if (!allowed && opts.forbiddenImports.some((m) => mod === m || mod.startsWith(m + '/'))) {
        ctx.report(st, 'forbidden-import', `"${mod}" imported outside the API layer → ${hint}`);
      }
    }

    const insideEffect = (node) => {
      for (let p = node.parent; p; p = p.parent) {
        if (ts.isCallExpression(p) && ['useEffect', 'useLayoutEffect'].includes(calleeName(ts, p.expression)) &&
            p.arguments[0] && node.pos >= p.arguments[0].pos && node.end <= p.arguments[0].end) return true;
        if (ts.isSourceFile(p)) return false;
      }
      return false;
    };

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const forbidden = isForbiddenCall(node.expression);
        const inEffect = insideEffect(node);
        if (inEffect) {
          const name = calleeName(ts, node.expression);
          if (forbidden || (effectRe && effectRe.test(name))) {
            ctx.report(node, 'fetch-in-effect', `${forbidden ?? name}() inside useEffect → load data with a query hook instead; ${hint}`);
          }
        } else if (forbidden && !allowed) {
          ctx.report(node, 'forbidden-call', `${forbidden}() outside the API layer → ${hint}`);
        }
      }
      if (ts.isNewExpression(node) && !allowed && opts.forbiddenConstructors.includes(calleeText(ts, node.expression))) {
        ctx.report(node, insideEffect(node) ? 'fetch-in-effect' : 'forbidden-call', `new ${calleeText(ts, node.expression)}() outside the API layer → ${hint}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  },
};

if (isMain(import.meta.url)) main([check]);
