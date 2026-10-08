# UNO Arena

A shareable browser game where 2–10 friends meet by room code and play a polished, rule-checked game of UNO.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/uno-arena run typecheck` — typecheck the game frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/uno-arena/src/App.tsx` — create/join flow, room UI, client polling, and audio controls
- `artifacts/uno-arena/src/index.css` — game theme, card styling, responsive layout, and motion
- `artifacts/api-server/src/lib/uno-game.ts` — authoritative deck, turn, and play rules
- `artifacts/api-server/src/routes/games.ts` — validated room and game actions
- `lib/api-spec/openapi.yaml` — API source of truth

## Architecture decisions

- The API server is the source of truth for legal plays, turn order, and private hands; clients poll room state about once per second.
- Game rooms are intentionally transient and held in the API process; an API restart clears active games.
- The supplied 108-card total implies two copies per color for Skip, Reverse, and Draw Two, despite the brief's conflicting “one per color” wording.

## Product

- Create or join a private room with a six-character code; start with 2–10 players.
- Play with a 108-card deck, personal hands, special-card effects, Wild color choice, UNO declaration, and automatic turn checks.
- Optional ambient sound, volume control, responsive table, animated cards, and reconnecting from saved room identity.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Room codes are six characters; active rooms do not survive an API process restart.
- Wild Draw Four is rejected whenever the player still holds a card matching the current color.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
