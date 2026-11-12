#!/usr/bin/env node
/**
 * check-design-tokens: hardcoded design values that should come from tokens.
 *
 * Rules
 *   color         hex / rgb() / hsl() literals in code strings, styled/css templates and CSS files
 *   raw-unit      px/rem/em literals (and bare numbers in style={{}}) for spacing/typography/radius props
 *   arbitrary     Tailwind arbitrary values: p-[13px], bg-[#fff], text-[15px]
 *   inline-style  any style={{…}} attribute (only when inlineStyle: "forbid")
 *
 * Config section: "tokens"
 * Ignore: // tokens-ignore-next-line: <reason>
 */
import { main, isMain } from './lib/core.mjs';

const COLOR_RE = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g;
const UNIT_RE = /(?<![\w.#-])(\d*\.?\d+)(px|rem|em)\b/g;
const ARBITRARY_RE = /(?:^|[\s"'`])((?:[\w-]+:)*!?-?[a-z][\w-]*-\[[^\]\s]+\])/g;

const CSS_PROPS = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block',
  'margin-inline-start', 'margin-inline-end', 'margin-block-start', 'margin-block-end',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block',
  'padding-inline-start', 'padding-inline-end', 'padding-block-start', 'padding-block-end',
  'gap', 'row-gap', 'column-gap', 'font-size', 'line-height', 'letter-spacing', 'border-radius',
];
const toCamelProp = (p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const check = {
  name: 'tokens',
  key: 'tokens',
  extensions: ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.less'],
  needsAst: true,
  defaults: {
    exclude: ['**/tokens.*', '**/theme.*', '**/theme/**', '**/tokens/**', '**/*.stories.*', '**/*.test.*', '**/*.spec.*', 'tailwind.config.*'],
    hint: 'use a design token (theme value, CSS variable or Tailwind theme class)',
    colors: true,
    units: true,
    unitProperties: CSS_PROPS,
    allowUnitValues: ['0', '0px', '1px'],
    tailwindArbitrary: true,
    allowArbitrary: ['^grid-(cols|rows)-', '^[\\w-]+-\\[var\\(--', '^[\\w-]+-\\[calc\\(', '^(content|supports|data|aria|group|peer)-'],
    inlineStyle: 'values', // "values" = check values in style={{}} · "forbid" = flag every style attr · "off"
    ignoreAttributes: ['href', 'src', 'to', 'id', 'key', 'data-testid', 'alt', 'title', 'aria-label', 'name', 'htmlFor', 'placeholder'],
  },

  analyze(ctx) {
    const { opts, ext } = ctx;
    const unitProps = new Set(opts.unitProperties);
    const unitPropsCamel = new Set(opts.unitProperties.map(toCamelProp));
    const allowUnits = new Set(opts.allowUnitValues);
    const allowArb = opts.allowArbitrary.map((r) => new RegExp(r));
    const hint = opts.hint;

    const badUnits = (value) => {
      const out = [];
      for (const m of value.matchAll(UNIT_RE)) {
        if (Number(m[1]) === 0 || allowUnits.has(m[0])) continue;
        out.push(m[0]);
      }
      return out;
    };

    /** scan one chunk of text at an absolute offset (strings, templates) */
    const scanText = (text, posOf, { arbitrary = opts.tailwindArbitrary } = {}) => {
      let rest = text;
      if (arbitrary) {
        for (const m of text.matchAll(ARBITRARY_RE)) {
          const cls = m[1];
          const utility = cls.replace(/^(?:[\w-]+:)*!?-?/, '');
          if (allowArb.some((r) => r.test(utility))) continue;
          ctx.report(posOf(m.index + m[0].indexOf(cls)), 'arbitrary', `Tailwind arbitrary value "${cls}" → ${hint}`);
          rest = rest.replace(cls, ' '.repeat(cls.length)); // don't double-report the color inside
        }
      }
      if (opts.colors) {
        for (const m of rest.matchAll(COLOR_RE)) {
          ctx.report(posOf(m.index), 'color', `hardcoded color "${m[0].replace(/\(\s*[\d.]+$/, '(…)')}" → ${hint}`);
        }
      }
    };

    /** css-like text: "padding: 13px; color: #fff" */
    const scanCssDeclarations = (text, posOf) => {
      if (!opts.units) return;
      const re = /(?<![\w-])([a-z-]+)\s*:\s*([^;{}\n]+)/g;
      for (const m of text.matchAll(re)) {
        if (!unitProps.has(m[1])) continue;
        const bad = badUnits(m[2]);
        if (bad.length) ctx.report(posOf(m.index), 'raw-unit', `${m[1]}: ${bad.join(' ')} → ${hint}`);
      }
    };

    // ── CSS / SCSS / LESS files ──
    if (['.css', '.scss', '.less'].includes(ext)) {
      let inComment = false;
      ctx.lines.forEach((raw, i) => {
        let line = raw;
        if (inComment) { const end = line.indexOf('*/'); if (end === -1) return; line = ' '.repeat(end + 2) + line.slice(end + 2); inComment = false; }
        line = line.replace(/\/\*.*?\*\//g, (s) => ' '.repeat(s.length));
        const start = line.indexOf('/*');
        if (start !== -1) { line = line.slice(0, start); inComment = true; }
        line = line.replace(/\/\/.*$/, '');
        // custom property definitions are tokens: blank them out (also when inline: ":root { --brand: #f00; }")
        line = line.replace(/--[\w-]+\s*:[^;}]*/g, (s) => ' '.repeat(s.length));
        if (/^\s*\$[\w-]+\s*:/.test(line) || /^\s*@[\w-]+\s*:/.test(line)) return; // scss/less variables
        const posOf = (offset) => ({ line: i + 1, col: offset + 1 });
        scanText(line, posOf, { arbitrary: false });
        scanCssDeclarations(line, posOf);
      });
      return;
    }

    // ── TS / JS ──
    const { ts, sf } = ctx;
    const posAt = (abs) => {
      const lc = sf.getLineAndCharacterOfPosition(abs);
      return { line: lc.line + 1, col: lc.character + 1 };
    };
    const ignoredAttr = new Set(opts.ignoreAttributes);
    const insideIgnoredContext = (node) => {
      for (let p = node.parent; p; p = p.parent) {
        if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode?.(p) || ts.isExternalModuleReference(p)) return true;
        if (ts.isJsxAttribute(p)) return ignoredAttr.has(p.name.getText());
        if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['require', 'import'].includes(p.expression.text)) return true;
        if (ts.isLiteralTypeNode(p)) return true;
      }
      return false;
    };
    const isStyledTag = (tag) => /^(styled\b|css$|keyframes$|createGlobalStyle$|injectGlobal$)/.test(tag.getText().replace(/\s+/g, ''));

    const visit = (node) => {
      // string-like literals
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        if (!insideIgnoredContext(node)) {
          const start = node.getStart(sf) + 1; // skip quote / backtick / }
          scanText(node.text, (off) => posAt(start + off));
        }
      }

      // styled.div`padding: 13px`
      if (ts.isTaggedTemplateExpression(node) && isStyledTag(node.tag)) {
        const tpl = node.template;
        const start = tpl.getStart(sf);
        const raw = tpl.getText(sf).replace(/\$\{[^}]*\}/g, (s) => ' '.repeat(s.length)); // blank interpolations
        scanCssDeclarations(raw, (off) => posAt(start + off));
      }

      // style={{ padding: 13, color: '#fff' }}
      if (ts.isJsxAttribute(node) && node.name.getText() === 'style' && opts.inlineStyle !== 'off') {
        if (opts.inlineStyle === 'forbid') {
          ctx.report(node, 'inline-style', `inline style attribute → use classes / primitives props; ${hint}`);
        } else if (opts.units) {
          const expr = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
          if (expr && ts.isObjectLiteralExpression(expr)) {
            for (const prop of expr.properties) {
              if (!ts.isPropertyAssignment(prop)) continue;
              const name = prop.name.getText(sf).replace(/['"]/g, '');
              if (!unitPropsCamel.has(name) && !unitProps.has(name)) continue;
              const v = prop.initializer;
              if (ts.isNumericLiteral(v) && Number(v.text) !== 0 && name !== 'lineHeight') {
                ctx.report(v, 'raw-unit', `${name}: ${v.text} (px) → ${hint}`);
              } else if (ts.isStringLiteralLike(v)) {
                const bad = badUnits(v.text);
                if (bad.length) ctx.report(v, 'raw-unit', `${name}: ${bad.join(' ')} → ${hint}`);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  },
};

if (isMain(import.meta.url)) main([check]);
