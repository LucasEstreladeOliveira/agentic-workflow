/**
 * react-architecture: ESLint flat-config factory for import rules.
 *
 *  1. UI-library imports only inside the primitives folder
 *     (features use <Input /> from @/components/ui, never @radix-ui/* or @mui/* directly)
 *  2. Architecture boundaries
 *     a. layers: lower layers can't import higher ones (e.g. components ✗→ features, lib ✗→ components)
 *     b. features: a feature imports another feature only through its public API (@/features/orders),
 *        never its internals (@/features/orders/components/…), and never through relative paths
 *     c. (optional) deep relative imports (../../../) must use the alias instead
 *
 * Zero dependencies: everything is the core `no-restricted-imports` rule, generated per folder.
 * Use '@typescript-eslint/no-restricted-imports' (ruleName option) to get `allowTypeImports`.
 *
 * Usage (eslint.config.mjs):
 *   import { reactArchitecture } from './configs/eslint/react-architecture.mjs';
 *   export default [ ...otherConfigs, ...reactArchitecture({ /* overrides *\/ }) ];
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const defaults = {
  /** project root used to discover feature folders */
  root: process.cwd(),
  srcDir: 'src',
  /** import alias that maps to srcDir ("@/features/x" → "src/features/x") */
  alias: '@/',
  extensions: '{js,jsx,ts,tsx,mjs,cjs}',
  ruleName: 'no-restricted-imports', // or '@typescript-eslint/no-restricted-imports'
  allowTypeImports: true,            // only used with the typescript-eslint rule

  // ── 1. UI libraries ──────────────────────────────────────────────
  /** folders allowed to import the raw UI libraries */
  uiDirs: ['src/components/ui'],
  uiLibraries: [
    '@radix-ui/*',
    '@headlessui/*',
    '@mui/*',
    '@chakra-ui/*',
    '@mantine/*',
    'antd', 'antd/*',
    'react-select', 'react-select/*',
    'react-day-picker',
    'cmdk',
    'vaul',
    'sonner',
    // 'lucide-react',   // uncomment if icons go through an <Icon /> primitive
  ],
  uiLibrariesMessage: 'Use the design-system primitive from @/components/ui instead of importing the UI library directly.',
  /** specific modules / named imports that have a primitive replacement */
  restrictedModules: [
    { name: 'next/link', message: 'Use <Link /> from @/components/ui/link.' },
    { name: 'next/image', message: 'Use <Image /> from @/components/ui/image.' },
    // { name: 'react-router-dom', importNames: ['Link', 'NavLink'], message: 'Use <Link /> from @/components/ui/link.' },
  ],

  // ── 2a. Layers ───────────────────────────────────────────────────
  /** each layer lists what it may import (besides itself). Order doesn't matter. */
  layers: [
    { name: 'app',        dir: 'src/app',           canImport: ['features', 'components', 'ui', 'hooks', 'api', 'lib', 'styles', 'types', 'config'] },
    { name: 'features',   dir: 'src/features',      canImport: ['components', 'ui', 'hooks', 'api', 'lib', 'styles', 'types', 'config'] },
    { name: 'components', dir: 'src/components',    canImport: ['ui', 'hooks', 'lib', 'styles', 'types', 'config'] },
    { name: 'ui',         dir: 'src/components/ui', canImport: ['lib', 'styles', 'types'] },
    { name: 'hooks',      dir: 'src/hooks',         canImport: ['api', 'lib', 'types', 'config'] },
    { name: 'api',        dir: 'src/api',           canImport: ['lib', 'types', 'config'] },
    { name: 'lib',        dir: 'src/lib',           canImport: ['types', 'config'] },
    { name: 'styles',     dir: 'src/styles',        canImport: [] },
    { name: 'types',      dir: 'src/types',         canImport: [] },
    { name: 'config',     dir: 'src/config',        canImport: ['types'] },
  ],

  // ── 2b. Features ─────────────────────────────────────────────────
  featuresDir: 'src/features',
  /** relative-path depth to guard against sibling-feature imports (../orders, ../../orders/…) */
  relativeFeatureDepth: 5,

  // ── 2c. Relative depth ───────────────────────────────────────────
  /** ban relative imports climbing more than N levels (null = off). 2 bans ../../../x */
  maxRelativeDepth: 2,
};

const trim = (s) => s.replace(/^\.\//, '').replace(/\/+$/, '');

export function reactArchitecture(options = {}) {
  const o = { ...defaults, ...options };
  const src = trim(o.srcDir);
  const aliasOf = (dir) => o.alias + trim(dir).replace(new RegExp(`^${src}/?`), '');
  const filesIn = (dir) => [`${trim(dir)}/**/*.${o.extensions}`];
  const layers = o.layers.map((l) => ({ ...l, dir: trim(l.dir) }));
  const byName = new Map(layers.map((l) => [l.name, l]));
  const isUiDir = (dir) => o.uiDirs.map(trim).some((u) => dir === u || dir.startsWith(u + '/'));

  // features on disk (read at lint time)
  let features = [];
  try {
    features = readdirSync(resolve(o.root, o.featuresDir), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
      .map((d) => d.name);
  } catch { /* no features folder */ }
  const featuresAlias = aliasOf(o.featuresDir);

  // ── pattern builders ──
  const uiLibGroup = () => ({ group: o.uiLibraries, message: o.uiLibrariesMessage });

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** layer `layer` (or null for "anywhere in src"). Uses `regex` so allowed sub-folders can be carved out. */
  const layerGroups = (layer) => {
    if (!layer) return [];
    const allowed = new Set([layer.name, ...layer.canImport]);
    const banned = layers.filter((l) => !allowed.has(l.name));
    return banned
      // a banned folder nested in another banned folder is already covered by the parent
      .filter((b) => !banned.some((p) => p !== b && b.dir.startsWith(p.dir + '/')))
      .map((b) => {
        const carveOuts = [...allowed]
          .map((n) => byName.get(n))
          .filter((a) => a && a.dir.startsWith(b.dir + '/'))
          .map((a) => esc(a.dir.slice(b.dir.length + 1)));
        const lookahead = carveOuts.length ? `(?!/(?:${carveOuts.join('|')})(?:/|$))` : '';
        return {
          regex: `^${esc(aliasOf(b.dir))}${lookahead}(?:/.*)?$`,
          message: `Layer "${layer.name}" (${layer.dir}) must not import from "${b.name}" (${b.dir}). Allowed: ${layer.canImport.join(', ') || 'nothing'}.`,
        };
      });
  };

  const featureInternalsGroup = (ownFeature) => {
    const own = ownFeature ? `(?!${esc(ownFeature)}(?:/|$))` : '';
    const folder = esc(trim(o.featuresDir).split('/').pop());
    return {
      regex: `^(?:${esc(featuresAlias)}|\\.{1,2}/(?:.*/)?${folder})/${own}[^/]+/.+$`,
      message: `Import other features only through their public API: "${featuresAlias}/<feature>" (its index file).`,
    };
  };

  const siblingFeatureGroup = (ownFeature) => {
    const others = features.filter((f) => f !== ownFeature);
    if (!others.length) return [];
    const group = [];
    for (let n = 1; n <= o.relativeFeatureDepth; n++) {
      for (const f of others) group.push(`${'../'.repeat(n)}${f}`, `${'../'.repeat(n)}${f}/**`);
    }
    return [{ group, message: `Don't reach into another feature with a relative path. Use "${featuresAlias}/<feature>".` }];
  };

  const deepRelativeGroup = () =>
    o.maxRelativeDepth == null ? [] : [{
      group: [`${'../'.repeat(o.maxRelativeDepth + 1)}**`],
      message: `Relative import climbs more than ${o.maxRelativeDepth} levels. Use the "${o.alias}" alias.`,
    }];

  const ruleFor = ({ layer = null, ownFeature = null, ui = false }) => {
    const patterns = [
      ...(ui ? [] : [uiLibGroup()]),
      ...layerGroups(layer),
      featureInternalsGroup(ownFeature),
      ...siblingFeatureGroup(ownFeature),
      ...deepRelativeGroup(),
    ];
    if (o.ruleName.startsWith('@typescript-eslint/')) for (const p of patterns) p.allowTypeImports = o.allowTypeImports;
    const paths = ui ? [] : o.restrictedModules.map((m) => ({ ...m }));
    return { [o.ruleName]: ['error', { paths, patterns }] };
  };

  // ── blocks: generic → layers (shallow → deep) → each feature ──
  const blocks = [
    { name: 'react-architecture/src', files: filesIn(src), rules: ruleFor({}) },
  ];
  for (const layer of [...layers].sort((a, b) => a.dir.split('/').length - b.dir.split('/').length)) {
    if (trim(layer.dir) === trim(o.featuresDir)) continue; // handled per feature below
    blocks.push({ name: `react-architecture/layer:${layer.name}`, files: filesIn(layer.dir), rules: ruleFor({ layer, ui: isUiDir(layer.dir) }) });
  }
  const featuresLayer = layers.find((l) => l.dir === trim(o.featuresDir));
  blocks.push({ name: 'react-architecture/features', files: filesIn(o.featuresDir), rules: ruleFor({ layer: featuresLayer }) });
  for (const f of features) {
    blocks.push({
      name: `react-architecture/feature:${f}`,
      files: filesIn(`${trim(o.featuresDir)}/${f}`),
      rules: ruleFor({ layer: featuresLayer, ownFeature: f }),
    });
  }
  return blocks;
}

export default reactArchitecture;
