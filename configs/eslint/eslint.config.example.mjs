// eslint.config.mjs: example wiring. Keep your existing configs and append the architecture rules.
import { reactArchitecture } from './configs/eslint/react-architecture.mjs';
// import tseslint from 'typescript-eslint';
// import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // ...tseslint.configs.recommended,
  // reactHooks.configs['recommended-latest'],

  ...reactArchitecture({
    root: import.meta.dirname,
    srcDir: 'src',
    alias: '@/',

    // 1. UI libraries: only the primitives folder may import them
    uiDirs: ['src/components/ui'],
    // uiLibraries: [...defaults.uiLibraries, 'lucide-react'],
    restrictedModules: [
      { name: 'next/link', message: 'Use <Link /> from @/components/ui/link.' },
      { name: 'next/image', message: 'Use <Image /> from @/components/ui/image.' },
    ],

    // 2. Boundaries: adjust to your folder structure
    featuresDir: 'src/features',
    // layers: [ ... ]        // see defaults in react-architecture.mjs
    maxRelativeDepth: 2,

    // With typescript-eslint installed, this lets `import type { X } from '@radix-ui/…'` through:
    // ruleName: '@typescript-eslint/no-restricted-imports',
  }),
];
