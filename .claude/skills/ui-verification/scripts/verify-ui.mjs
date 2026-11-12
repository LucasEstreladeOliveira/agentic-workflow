#!/usr/bin/env node
/**
 * verify-ui: fast visual + runtime sanity check of routes in a running app.
 *
 *   node .claude/skills/ui-verification/scripts/verify-ui.mjs --url http://localhost:3000 --routes /,/checkout
 *     [--breakpoints 375,768,1280] [--out .ui-verify] [--storage-state auth.json] [--tab-steps 25]
 *     [--wait-for "main"] [--no-axe] [--fail-on errors|warnings|none] [--json]
 *
 * Per route × breakpoint: full-page screenshot, horizontal overflow (+ offending elements).
 * Per route: console errors, uncaught exceptions, failed requests (4xx/5xx), broken images,
 *            unnamed buttons/links/inputs, images without alt, keyboard focus order + visible focus,
 *            axe-core WCAG 2.x A/AA scan (if `axe-core` is installed in the project).
 * Writes <out>/report.md, report.json and screenshots. Exit 1 when errors (or warnings with --fail-on warnings).
 * Requires `playwright` (or `@playwright/test`) in the project and an installed Chromium.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const BASE = arg('url', 'http://localhost:3000').replace(/\/$/, '');
const ROUTES = arg('routes', '/').split(',').map((r) => r.trim()).filter(Boolean);
const BREAKPOINTS = arg('breakpoints', '375,768,1280').split(',').map(Number);
const OUT = resolve(ROOT, arg('out', '.ui-verify'));
const TAB_STEPS = Number(arg('tab-steps', 25));
const WAIT_FOR = arg('wait-for');
const STORAGE = arg('storage-state');
const FAIL_ON = arg('fail-on', 'errors');
const USE_AXE = !argv.includes('--no-axe');

const req = createRequire(join(ROOT, 'package.json'));
const tryReq = (...names) => { for (const n of names) { try { return req(n); } catch {} try { return createRequire(import.meta.url)(n); } catch {} } return null; };
const pw = tryReq('playwright', '@playwright/test', 'playwright-core');
if (!pw) { console.error('verify-ui: install playwright (or @playwright/test) in the project'); process.exit(2); }
let axePath = null;
if (USE_AXE) { try { axePath = req.resolve('axe-core/axe.min.js'); } catch {} }

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[^\w-]+/g, '_'));
mkdirSync(OUT, { recursive: true });

const browser = await pw.chromium.launch();
const findings = []; // { route, breakpoint?, severity, kind, detail }
const shots = [];
const add = (route, severity, kind, detail, breakpoint) => findings.push({ route, breakpoint, severity, kind, detail });

for (const route of ROUTES) {
  const url = BASE + route;
  for (const [i, width] of BREAKPOINTS.entries()) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(STORAGE ? { storageState: resolve(ROOT, STORAGE) } : {}) });
    const page = await ctx.newPage();
    const first = i === 0;
    const consoleErrors = [], pageErrors = [], failed = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) failed.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
    page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) failed.push(`FAILED ${r.request?.().method?.() ?? ''} ${r.url()} (${r.failure()?.errorText})`); });

    let status;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      status = res?.status();
      if (WAIT_FOR) await page.waitForSelector(WAIT_FOR, { timeout: 10000 });
    } catch (e) {
      add(route, 'error', 'navigation', e.message.split('\n')[0], width);
      await ctx.close();
      continue;
    }
    if (status && status >= 400) add(route, 'error', 'http-status', `page returned ${status}`, width);

    const file = join(OUT, `${slug(route)}@${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    shots.push({ route, width, file: relative(ROOT, file) });

    // horizontal overflow
    const overflow = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= vw + 1) return null;
      const desc = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'; })
        .filter((el, _, all) => !all.some((o) => o !== el && el.contains(o))) // innermost
        .slice(0, 5).map(desc);
      return { scrollWidth: document.documentElement.scrollWidth, vw, offenders };
    });
    if (overflow) add(route, 'error', 'overflow', `page is ${overflow.scrollWidth}px wide in a ${overflow.vw}px viewport. Offenders: ${overflow.offenders.join(', ') || 'unknown'}`, width);

    if (first) {
      // static a11y heuristics + broken images
      const issues = await page.evaluate(() => {
        const out = [];
        const desc = (el) => el.outerHTML.slice(0, 120).replace(/\s+/g, ' ');
        const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || '').trim() ||
          [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim();
        for (const el of document.querySelectorAll('button, a[href], [role="button"]')) if (!name(el)) out.push(['error', 'unnamed-control', desc(el)]);
        for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
          const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
          if (!labelled) out.push(['error', 'unlabelled-field', desc(el)]);
        }
        for (const img of document.querySelectorAll('img')) {
          if (!img.hasAttribute('alt')) out.push(['error', 'img-no-alt', desc(img)]);
          if (img.complete && img.naturalWidth === 0) out.push(['error', 'broken-image', img.currentSrc || img.src]);
        }
        return out;
      });
      for (const [sev, kind, detail] of issues) add(route, sev, kind, detail);

      // axe
      if (axePath) {
        try {
          await page.addScriptTag({ path: axePath });
          const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
            .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })));
          for (const v of violations) add(route, ['serious', 'critical'].includes(v.impact) ? 'error' : 'warning', `axe:${v.id}`, `${v.help} → ${v.nodes.join(' | ')}`);
        } catch (e) { add(route, 'warning', 'axe', `axe failed: ${e.message}`); }
      }
    }

    // keyboard focus order + visible focus (largest breakpoint)
    if (i === BREAKPOINTS.length - 1 && TAB_STEPS > 0) {
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      const order = [];
      for (let s = 0; s < TAB_STEPS; s++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
          const r = el.getBoundingClientRect();
          const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.getAttribute('placeholder') || '').trim().slice(0, 40);
          return { tag: el.tagName.toLowerCase(), label, visible, onScreen: r.width > 0 && r.height > 0 };
        });
        if (!info) break;
        const key = `${info.tag}:${info.label}`;
        if (order.length && order[0].key === key) break; // cycled
        order.push({ ...info, key });
      }
      for (const f of order.filter((o) => !o.visible)) add(route, 'warning', 'focus-not-visible', `<${f.tag}> "${f.label}" has no visible focus indicator (outline/box-shadow)`);
      for (const f of order.filter((o) => !o.onScreen)) add(route, 'warning', 'focus-offscreen', `<${f.tag}> "${f.label}" receives focus but is not visible`);
      writeFileSync(join(OUT, `${slug(route)}.focus-order.txt`), order.map((o, n) => `${n + 1}. <${o.tag}> ${o.label}${o.visible ? '' : '  ⚠ no visible focus'}`).join('\n') + '\n');
    }

    if (first) {
      for (const e of pageErrors) add(route, 'error', 'uncaught-exception', e);
      for (const e of [...new Set(consoleErrors)]) add(route, 'error', 'console-error', e.slice(0, 300));
      for (const e of [...new Set(failed)]) add(route, e.startsWith('5') || e.startsWith('FAILED') ? 'error' : 'warning', 'request', e);
    }
    await ctx.close();
  }
}
await browser.close();

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');
const report = { base: BASE, routes: ROUTES, breakpoints: BREAKPOINTS, axe: !!axePath, errors: errors.length, warnings: warnings.length, findings, screenshots: shots };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const md = [
  `# UI verification: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '',
  `Base: ${BASE} · Breakpoints: ${BREAKPOINTS.join(', ')} · axe: ${axePath ? 'on' : 'not installed (heuristics only)'}`, '',
  `**${errors.length} error(s), ${warnings.length} warning(s)**`, '',
  '| Route | BP | Severity | Kind | Detail |', '|---|---|---|---|---|',
  ...findings.map((f) => `| ${f.route} | ${f.breakpoint ?? ''} | ${f.severity} | ${f.kind} | ${f.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
  '', '## Screenshots', '',
  ...shots.map((s) => `- ${s.route} @ ${s.width}px: \`${s.file}\``), '',
].join('\n');
writeFileSync(join(OUT, 'report.md'), md);

if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const f of findings) console.log(`${f.severity === 'error' ? '✗' : '!'} ${f.route}${f.breakpoint ? ` @${f.breakpoint}` : ''}  [${f.kind}] ${f.detail}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) · ${shots.length} screenshot(s) · report: ${relative(ROOT, join(OUT, 'report.md'))}${axePath ? '' : ' · axe-core not installed (heuristic a11y only)'}`);
}
const fail = FAIL_ON === 'none' ? false : FAIL_ON === 'warnings' ? findings.length > 0 : errors.length > 0;
process.exit(fail ? 1 : 0);
