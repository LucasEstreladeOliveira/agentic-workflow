<!-- Paste into the repo's CLAUDE.md and fill in the real values -->

## Agent workflow

This repo uses the feature workflow in `.claude/` (see WORKFLOW.md). Feature records live in `docs/features/<slug>/`; the project map is `docs/architecture/system-map.md`.

### Commands (all agents use these; keep them accurate)
- Install: `pnpm install`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Unit/integration tests: `pnpm test` · single file: `pnpm test path/to/file`
- Integration DB: `pnpm db:test:reset` (uses `DATABASE_URL` from `.env.test`)
- E2E: `pnpm e2e` (Playwright, needs `pnpm dev` or uses `webServer` config)
- Build: `pnpm build`
- Prisma: `pnpm prisma migrate dev --name <name>` · generate: `pnpm prisma generate`

### Conventions
- Base branch: `main` · feature branches: `feat/<slug>`
- Commits: Conventional Commits, `<type>(<scope>): <summary> [<slug> P#]`
- Tests live: `src/**/*.test.ts` (unit), `tests/integration/**`, `e2e/**`
- Test naming: `[T#][R#] behaviour`
- Stack notes: <Vue 3 + Pinia / React + Next.js, Node API, Prisma, design system location…>
