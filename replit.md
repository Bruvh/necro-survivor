# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### NECRO SURVIVOR (`artifacts/necro-survivor`)
- **Kind**: react-vite web app
- **Preview path**: `/`
- **Description**: A gothic canvas-based survival game. Player is a necromancer who commands skeleton minions that auto-attack enemies. Features: 3 enemy types (zombie, bat, ghost), XP orbs, leveling system, 9 upgrade options, difficulty scaling every minute, high score persistence via localStorage.
- **No backend** — pure frontend canvas game using React + requestAnimationFrame loop
- **Key files**: `src/App.tsx` (entire game logic), `src/game.css` (gothic styling)
