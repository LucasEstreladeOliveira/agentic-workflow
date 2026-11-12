#!/usr/bin/env node
/**
 * check-all: runs every enabled React guard in one pass (files are parsed once).
 *
 *   node scripts/react/check-all.mjs                      # full scan (CI)
 *   node scripts/react/check-all.mjs --changed            # vs main (local / agents)
 *   node scripts/react/check-all.mjs --hook               # Claude Code PostToolUse hook
 *   node scripts/react/check-all.mjs --only=tokens,size   # subset
 *
 * Disable a check with `"<section>": { "enabled": false }` in react-guards.config.json.
 */
import { main } from './lib/core.mjs';
import { check as primitives } from './check-primitives.mjs';
import { check as tokens } from './check-design-tokens.mjs';
import { check as naming } from './check-naming.mjs';
import { check as size } from './check-component-size.mjs';
import { check as fetching } from './check-data-fetching.mjs';

main([primitives, tokens, naming, size, fetching]);
