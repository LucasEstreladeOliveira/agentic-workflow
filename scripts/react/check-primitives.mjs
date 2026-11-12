#!/usr/bin/env node
/**
 * check-primitives: raw HTML elements that must be design-system primitives.
 *
 *   <input />  →  <Input /> from "@/components/ui/input"
 *
 * Catches JSX tags, React.createElement('input'), styled.input`` and styled('input').
 * Config section: "primitives" in react-guards.config.json
 *   rules: { tag: { use, from?, message?, allowIf?: { attr: [values] } } }
 * Ignore: // primitives-ignore-next-line: <reason>
 */
import { main, isMain } from './lib/core.mjs';

export const check = {
  name: 'primitives',
  key: 'primitives',
  extensions: ['.tsx', '.jsx'],
  needsAst: true,
  requiresConfig: true,
  defaults: { rules: {}, checkCreateElement: true, checkStyled: true, exclude: [] },

  analyze(ctx) {
    const { ts, sf, opts } = ctx;
    const rules = opts.rules;

    const attrValue = (attrs, name) => {
      for (const p of attrs.properties) {
        if (!ts.isJsxAttribute(p) || p.name.getText() !== name) continue;
        const init = p.initializer;
        if (!init) return true;
        if (ts.isStringLiteral(init)) return init.text;
        if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) return init.expression.text;
        return null; // dynamic → unknown → not allowed
      }
      return undefined;
    };
    const allowed = (rule, attrs) =>
      !!rule.allowIf && !!attrs &&
      Object.entries(rule.allowIf).some(([name, values]) => {
        const v = attrValue(attrs, name);
        if (v === undefined || v === null) return false;
        return values === true || values.includes(String(v));
      });
    const msg = (tag, via) => {
      const r = rules[tag];
      const base = r.message ?? `use <${r.use} />${r.from ? ` from "${r.from}"` : ''}`;
      return `<${tag}>${via ? ` (${via})` : ''} → ${base}`;
    };

    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tn = node.tagName;
        if (ts.isIdentifier(tn) && rules[tn.text] && !allowed(rules[tn.text], node.attributes)) {
          ctx.report(node, 'raw-element', msg(tn.text));
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg) && rules[arg.text]) {
          const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
          if (opts.checkCreateElement && name === 'createElement') ctx.report(node, 'raw-element', msg(arg.text, 'createElement'));
          if (opts.checkStyled && ts.isIdentifier(callee) && callee.text === 'styled') ctx.report(node, 'raw-element', msg(arg.text, 'styled'));
        }
      }
      if (opts.checkStyled && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === 'styled' && rules[node.name.text]) {
        ctx.report(node, 'raw-element', msg(node.name.text, 'styled'));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  },
};

if (isMain(import.meta.url)) main([check]);
