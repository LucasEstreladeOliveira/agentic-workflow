#!/usr/bin/env node
// PreToolUse guard: limits which files an agent may write/edit.
// Usage (from agent frontmatter): node restrict-writes.mjs <profile>
// Exit 0 = allow, exit 2 = block (stderr is fed back to the agent).

import { relative, isAbsolute, resolve } from 'node:path';

const PROFILES = {
  // PM + Staff: documentation only
  docs: [/^docs\//],
  // QA: tests, fixtures, mocks, test config and feature docs
  qa: [
    /^docs\/features\//,
    /\.(test|spec)\.[cm]?[jt]sx?$/,
    /\.(test|spec)\.vue$/,
    /(^|\/)__tests__\//,
    /(^|\/)__mocks__\//,
    /(^|\/)__fixtures__\//,
    /(^|\/)(tests?|e2e|cypress|playwright)\//,
    /(^|\/)fixtures?\//,
    /(^|\/)test-utils?\//,
    /(^|\/)(vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s$/,
  ],
};

const profile = process.argv[2];
const allowed = PROFILES[profile];
if (!allowed) {
  console.error(`restrict-writes: unknown profile "${profile}"`);
  process.exit(2);
}

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw || '{}');
} catch {
  process.exit(0); // don't block on malformed hook input
}

const toolInput = input.tool_input ?? {};
const file = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const abs = isAbsolute(file) ? file : resolve(root, file);
const rel = relative(root, abs).split('\\').join('/');

if (rel.startsWith('..')) {
  console.error(`Blocked: ${file} is outside the project.`);
  process.exit(2);
}

if (allowed.some((re) => re.test(rel))) process.exit(0);

const hint =
  profile === 'qa'
    ? 'You are the QA agent: you may only write tests, fixtures/mocks and docs/features/**. ' +
      'If the implementation is wrong, write a findings file for the senior-engineer instead.'
    : 'This agent may only write inside docs/. Describe code changes in the plan/design instead.';

console.error(`Blocked write to "${rel}". ${hint}`);
process.exit(2);
