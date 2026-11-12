#!/usr/bin/env node
/**
 * scaffold-component: creates a component that already follows the project conventions.
 *
 *   node .claude/skills/new-component/scripts/scaffold-component.mjs <Name> --dir <folder> [options]
 *
 * Options
 *   --framework react|vue     default: detected from package.json
 *   --folder                  put files in <dir>/<Name>/ (with an index re-export)
 *   --case PascalCase|kebab-case   file name case (default: react-guards.config.json naming.componentFileCase, else PascalCase)
 *   --no-test / --no-story    skip test / story (stories are only created if Storybook is installed)
 *   --index <path>            also add `export { Name } from '…'` to this index file (e.g. the feature's public API)
 *   --props "label:string,count?:number"   initial props
 *   --dry-run                 print what would be created
 *
 * Never overwrites existing files. Prints the created paths (one per line).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const fail = (m) => { console.error(`scaffold-component: ${m}`); process.exit(2); };

const rawName = argv[0];
if (!rawName || rawName.startsWith('--')) fail('usage: scaffold-component.mjs <Name> --dir <folder> [options]');
const Name = rawName.replace(/(^|[-_\s]+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase());
if (!/^[A-Z][A-Za-z0-9]*$/.test(Name)) fail(`"${rawName}" is not a valid component name`);
const dir = arg('dir');
if (!dir) fail('--dir is required');

// project detection
const pkg = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { return {}; } })();
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const framework = arg('framework', deps.vue ? 'vue' : 'react');
const testRunner = deps.vitest ? 'vitest' : deps.jest ? 'jest' : 'vitest';
const hasStorybook = Object.keys(deps).some((d) => d.startsWith('@storybook/') || d === 'storybook');
const ts = existsSync(join(ROOT, 'tsconfig.json')) || !!deps.typescript;
const guards = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'react-guards.config.json'), 'utf8')); } catch { return {}; } })();
const fileCase = arg('case', guards.naming?.componentFileCase ?? 'PascalCase');
const kebab = Name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const base = fileCase === 'kebab-case' ? kebab : Name;

const props = (arg('props', '') || '').split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
  const [k, t = 'string'] = p.split(':');
  return { name: k.replace('?', ''), optional: k.endsWith('?'), type: t };
});

const targetDir = resolve(ROOT, dir, flag('folder') ? (fileCase === 'kebab-case' ? kebab : Name) : '');
const ext = framework === 'vue' ? 'vue' : ts ? 'tsx' : 'jsx';
const testExt = ts ? 'ts' : 'js';
const files = [];

// ── component ──
const propsType = props.length
  ? props.map((p) => `  ${p.name}${p.optional ? '?' : ''}: ${p.type};`).join('\n')
  : '  // TODO: props';
const destructure = props.length ? `{ ${props.map((p) => p.name).join(', ')} }` : '{}';

if (framework === 'react') {
  files.push([`${base}.${ext}`, ts
    ? `export interface ${Name}Props {\n${propsType}\n}\n\nexport function ${Name}(${destructure}: ${Name}Props) {\n  return (\n    <div>\n      {/* TODO: compose from design-system primitives (see design-system skill) */}\n    </div>\n  );\n}\n`
    : `export function ${Name}(${destructure}) {\n  return <div>{/* TODO */}</div>;\n}\n`]);
} else {
  files.push([`${base}.vue`,
    `<script setup lang="ts">\nexport interface ${Name}Props {\n${propsType}\n}\n\ndefineProps<${Name}Props>();\n</script>\n\n<template>\n  <div>\n    <!-- TODO: compose from design-system primitives (see design-system skill) -->\n  </div>\n</template>\n`]);
}

// ── test ──
if (!flag('no-test')) {
  const vi = testRunner === 'vitest' ? `import { describe, it, expect } from 'vitest';\n` : '';
  const sampleProps = props.filter((p) => !p.optional).map((p) => `${p.name}={${p.type === 'number' ? '1' : p.type === 'boolean' ? 'true' : `'${p.name}'`}}`).join(' ');
  const importPath = `./${base}${framework === 'vue' ? '.vue' : ''}`;
  if (framework === 'react') {
    files.push([`${base}.test.${testExt}x`,
      `${vi}import { render, screen } from '@testing-library/react';\nimport { ${Name} } from '${importPath}';\n\ndescribe('${Name}', () => {\n  it('renders', () => {\n    render(<${Name} ${sampleProps} />);\n    // TODO: assert on user-visible output, e.g. screen.getByRole(...)\n    expect(document.body).toBeTruthy();\n  });\n});\n`]);
  } else {
    const vueProps = props.filter((p) => !p.optional).map((p) => `${p.name}: ${p.type === 'number' ? '1' : p.type === 'boolean' ? 'true' : `'${p.name}'`}`).join(', ');
    files.push([`${base}.test.${testExt}`,
      `${vi}import { render, screen } from '@testing-library/vue';\nimport ${Name} from '${importPath}';\n\ndescribe('${Name}', () => {\n  it('renders', () => {\n    render(${Name}, { props: { ${vueProps} } });\n    // TODO: assert on user-visible output, e.g. screen.getByRole(...)\n    expect(document.body).toBeTruthy();\n  });\n});\n`]);
  }
}

// ── story ──
if (!flag('no-story') && hasStorybook) {
  const sbPkg = framework === 'vue' ? '@storybook/vue3' : '@storybook/react';
  const imp = framework === 'vue' ? `import ${Name} from './${base}.vue';` : `import { ${Name} } from './${base}';`;
  const args = props.filter((p) => !p.optional).map((p) => `${p.name}: ${p.type === 'number' ? '1' : p.type === 'boolean' ? 'true' : `'${p.name}'`}`).join(', ');
  files.push([`${base}.stories.${ts ? 'ts' : 'js'}${framework === 'react' ? 'x' : ''}`,
    `import type { Meta, StoryObj } from '${sbPkg}';\n${imp}\n\nconst meta = { component: ${Name}, args: { ${args} } } satisfies Meta<typeof ${Name}>;\nexport default meta;\ntype Story = StoryObj<typeof meta>;\n\nexport const Default: Story = {};\n`]);
}

// ── folder index ──
if (flag('folder') && framework === 'react') {
  files.push([`index.${ts ? 'ts' : 'js'}`, `export { ${Name} } from './${base}';\n${ts ? `export type { ${Name}Props } from './${base}';\n` : ''}`]);
}

// write
const created = [];
for (const [file, content] of files) {
  const abs = join(targetDir, file);
  if (existsSync(abs)) fail(`${relative(ROOT, abs)} already exists, refusing to overwrite`);
}
for (const [file, content] of files) {
  const abs = join(targetDir, file);
  if (!flag('dry-run')) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, content); }
  created.push(relative(ROOT, abs));
}

// public API export
const indexArg = arg('index');
if (indexArg) {
  const indexAbs = resolve(ROOT, indexArg);
  const fromPath = './' + relative(dirname(indexAbs), flag('folder') ? targetDir : join(targetDir, base)).split('\\').join('/');
  const line = framework === 'vue'
    ? `export { default as ${Name} } from '${fromPath}${flag('folder') ? `/${base}` : ''}.vue';\n`
    : `export { ${Name} } from '${fromPath}';\n`;
  const current = existsSync(indexAbs) ? readFileSync(indexAbs, 'utf8') : '';
  if (!current.includes(line.trim())) {
    if (!flag('dry-run')) appendFileSync(indexAbs, (current && !current.endsWith('\n') ? '\n' : '') + line);
    created.push(`${relative(ROOT, indexAbs)} (+ export ${Name})`);
  }
}

console.log(created.join('\n'));
