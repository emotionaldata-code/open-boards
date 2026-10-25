# Open Boards

A small, authoritative multiplayer card-and-board game for **2 or 4 players**. React + Vite provide the interface, PixiJS draws the arena with WebGL, Colyseus carries private snapshots and commands, and Postgres stores accounts. Node 24 and pnpm workspaces; no monorepo framework.

## Run locally

Requires Node 24, pnpm 11.14 (`corepack enable`), and Docker Compose.

```bash
cp .env.example .env
# Replace JWT_SECRET in .env with a random secret of at least 32 characters.
pnpm install
pnpm db:up
pnpm dev
```

Open **http://localhost:5173**. Register an account, create a two- or four-seat room, and copy its invite link. Other players need separate browser profiles or private windows so each has their own account cookie. Everyone readies up; the creator starts the match. Reloading an active match restores the saved seat from that tab's session storage.

Play in portrait or landscape. On portrait phones, swipe the map to pan; use the map controls to fit the whole board or expand it. Landscape keeps your hand beside the map, with cards below it on larger screens. Swipe your hand to browse cards; their special effects are printed in full. Use the fullscreen button when your browser supports it. Tap player badges for health, abilities, counters, statuses and discards. How to play is available on the login page.

Vite proxies HTTP and WebSockets to port 2567, preserving the browser's same origin. Keep `APP_ORIGIN` equal to the exact browser origin. LAN play needs this set to the LAN URL, then a server restart. Never commit `.env`.

## Commands

| Command                                   | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm db:up` / `pnpm db:down`             | Start / stop Postgres; keep its named volume                             |
| `pnpm db:generate --name=describe_change` | Generate a named SQL migration from the typed schema, without a database |
| `pnpm db:migrate`                         | Apply versioned Drizzle SQL migrations                                   |
| `pnpm dev`                                | Run Vite and the server in watch mode                                    |
| `pnpm typecheck`                          | Check every package, app, and test                                       |
| `pnpm lint`                               | Run ESLint                                                               |
| `pnpm test`                               | Engine, lifecycle, and real Postgres/Colyseus integration tests          |
| `pnpm test:e2e`                           | Full browser matches, combat, reload recovery, desktop and phone layouts |
| `pnpm build`                              | Build both applications                                                  |
| `pnpm start`                              | Serve the production client and WebSocket/API server                     |

Server startup in both development and production automatically applies pending migrations before creating listeners. `pnpm db:migrate` remains available for explicit migrations. Both paths hold the same PostgreSQL advisory lock on a dedicated connection, so concurrent migration attempts wait for one another. A migration failure closes database connections and stops startup with an unsuccessful exit; the server accepts no traffic.

For a schema change, edit `apps/server/src/db/schema.ts`, run `pnpm db:generate --name=describe_change`, and review and commit the generated SQL, snapshots, and journal in `apps/server/drizzle` together with the schema. Keep applied migrations unchanged; generate a new migration for each subsequent change. Generation uses only the typed definitions and saved snapshots; it needs neither `.env` nor a database. See [Drizzle's migration workflow](https://orm.drizzle.team/docs/migrations). Start locally or deploy to apply the reviewed files. Use additive, compatible changes whenever application versions may overlap. Rolling back application code does not undo database migrations.

Tests require a running Postgres instance. They use `DATABASE_URL` from the process environment, defaulting to the local Compose database. Account/transport integration tests migrate before running, create unique accounts and remove their own accounts afterward. Migration tests use disposable databases and require a role with `CREATEDB` (the local Compose role has it). Browser tests create uniquely named test accounts. Install Chromium once with `pnpm exec playwright install chromium` if it is missing. Playwright starts the development servers or reuses an existing development instance. Avoid repeatedly running browser tests against a shared public server: auth attempts are intentionally rate-limited.

After building, run `TEST_SERVER_BUNDLE=1 pnpm exec vitest run apps/server/src/db/migrations.test.ts` to repeat startup migration checks using the production bundle with plain Node instead of the TypeScript entrypoint.

For production, run `pnpm build`, then `pnpm start` with `NODE_ENV=production`, `APP_ORIGIN=https://your-host`, `PORT`, `DATABASE_URL`, and a strong `JWT_SECRET` of at least 32 characters. The optional root `.env` supplies local defaults; deployment may inject all variables directly. `DATABASE_URL` is required and the migration role needs schema/table creation and alteration permissions. Builds never connect to Postgres or generate migrations. Ship `apps/server/dist` **and** `apps/server/drizzle` (including `meta`) alongside `apps/client/dist`, keeping that directory layout. The server package's production file list includes both its bundle and migration directory. The bundled explicit migration CLI can also run as `node apps/server/dist/migrate.js` with deployment variables set.

Put a TLS reverse proxy in front of port 2567 and forward WebSocket upgrades. The production process serves the Vite build on the same origin. Secure cookies require HTTPS. This milestone runs **one server process**: accounts persist, rooms and matches live in memory and disappear on restart. It does not provide distributed matchmaking or durable matches.

## Deploy with Dokploy

Production uses [`docker-compose.yaml`](docker-compose.yaml). The multi-stage Dockerfile builds the entire pnpm workspace and ships the production server dependencies, bundled server, committed Drizzle migrations and Vite output. The `app` service serves frontend, API and WebSockets on port 2567; `db` runs PostgreSQL 17 on a private Compose network with a persistent `boards-data` volume. No host ports are published. `compose.yaml` remains the local development database; local commands select it explicitly.

The Dokploy project is `open-board`, environment `production`, sourced from `emotionaldata-code/open-boards`, branch `deploy/open-board`, Compose path `./docker-compose.yaml`. Set these variables in the Compose service environment in Dokploy, never in Git:

```dotenv
APP_ORIGIN=https://open-board.edia-company.com
POSTGRES_PASSWORD=<random URL-safe value, for example 32 random bytes in hex>
JWT_SECRET=<independent random value of at least 32 characters>
```

Keep both secrets stable across redeployments. The database password is embedded in `DATABASE_URL`, so use URL-safe characters. Configure the Compose domain `open-board.edia-company.com`, path `/`, service `app`, port `2567`, HTTPS with Let's Encrypt. Dokploy attaches Traefik routing to the external `dokploy-network`; only `app` joins it. Express trusts the nearest proxy in production so its request rate limits use the forwarded client address. Keep this service behind Traefik without publishing a host port.

Each deployment waits for PostgreSQL health, then the existing server startup applies versioned Drizzle migrations under its advisory lock before listening. The image build neither connects to a database nor generates migrations. Application health is checked at `/api/health`. To run the packaged migration CLI explicitly, use `docker compose -f docker-compose.yaml run --rm app node apps/server/dist/migrate.js` with the same deployment environment.

Push changes to `deploy/open-board`, then deploy that branch from Dokploy. Redeployments preserve the named database volume; do not use `down -v`, fresh volumes, or isolated deployment volumes for ordinary updates. Application restarts end in-memory rooms and matches. Application rollbacks do not reverse schema migrations.

## Rules

Choose **Medusa** in the illustrated roster. She has thirty cards across eleven designs and three Harpies, with artwork, passive abilities and card effects. Browse every deck before signing in or in the waiting room. Cards show their special effects and timing directly, including while waiting for your turn. Core gameplay rules are explained once in How to play. [The character guide](docs/characters.md) explains the JSON bundles and artwork recipes. Changing character clears readiness.

The Genie is also playable: a solo ranged hero with all thirty printed cards across twelve designs. Trade cards for actions, choose among Three Wishes, inspect an opponent’s hand and place the Genie anywhere empty. [His import notes](docs/characters/the-genie.md) describe the reusable hooks and verification.

Start with five cards and your character’s health; keep at most seven cards at turn end.

King Solomon’s Mine, from Unmatched: Houdini vs. The Genie, has 29 spaces and seven colored zones: Gold, Yellow, Red, Blue, Brown, Gray and Green. Its paths, zones, secret passages and two-player starts follow the [printed board](https://www.the-unmatched.club/maps/king-solomons-mine). Four-player matches use two additional custom starting positions. Melee characters attack adjacent rivals. Ranged characters also attack rivals sharing any color with its space. Multicolor spaces belong to every shown color; sharing is direct, never chained through other spaces. Adjacent attacks work across zone boundaries. Occupied spaces block movement, but never ranged attacks.

Six diamond-marked portals represent the board’s secret passages and connect to one another for movement only. Enter a portal normally, then spend one movement point to reach any other unoccupied portal; continue moving if points remain. Portals never extend attack range and cannot be used by pushes or pulls. Fit view shows the entire board; detail view allows panning for larger spaces on phones.

Each turn has two actions. Maneuver spends one action, draws one card, then lets you move up to your character’s movement in unoccupied edges or stay. Attack with an attack or versatile card; the defender may use a defense or versatile card for free, or decline. The attack remains hidden until the defense decision. Reveal, deal `max(0, attack − defense)` damage, and discard the committed cards. Action cards spend one action and resolve their printed effects in order. You may end your turn early. Resolve movement, defense, abilities and required discards before anything else.

No turn-start draws and no reshuffling: each missing draw deals two damage. Zero health eliminates immediately; the last survivor wins. Four seats means free-for-all. A disconnected survivor pauses the match and reserves their seat for 120 seconds. Reconnection restores pending choices. Explicit departure or timeout forfeits; unresolved combat involving that player is canceled. Lobby host departure transfers ownership to the earliest remaining seat. Rematches use new rooms.

## Modules and privacy

- `packages/game`: pure state transitions, per-character targeting, graph validation, and ordered outcomes. No framework, storage, networking, browser, or hardcoded content imports.
- `packages/content`: separate serializable character, card and colored graph definitions, plus independent visual coordinates and zone styling.
- `packages/protocol`: runtime validation for requests and explicit public/private transport contracts.
- `apps/server/src/auth`, `db`: Argon2id hashes, 24-hour signed HttpOnly JWT cookies, rate limiting, user queries and migrations.
- `apps/server/src/rooms`: admission, duplicate-seat protection, readiness, shuffling, synchronous command processing and reconnect lifecycle.
- `apps/server/src/transport`: whitelist projection per viewer; no deck order, other hands, or hidden attacks in opponent snapshots or outcomes.
- `apps/client/src`: account/lobby/game controls, networking adapters, PixiJS board and local animation queue. Confirmed state always wins over animation. Node controls also support keyboard input and WebGL failure.

Colyseus transports explicit per-player `snapshot` messages rather than synchronizing the engine object with Schema. Each snapshot combines public information with only that viewer's hand. Commands include UUIDs and expected revisions. Repeated and stale commands are rejected without mutation. This keeps the privacy boundary visible and testable; the small POC sends full snapshots rather than incremental patches.

Authentication intentionally has no email, recovery, sessions table, or refresh tokens. Logout clears the cookie and closes the account's active game connection. Previously issued JWTs expire naturally, so logout does not revoke a copied JWT.

See [character authoring and the ability vocabulary](docs/engine.md), [future character definitions](docs/characters.md) and [verification and interface notes](docs/verification.md). Repository boundaries are summarized in [AGENT.md](AGENT.md).

Allied fighters now share their owner’s deck, hand and two-action budget. Medusa leads three independently tracked Harpies; deploy them before turn one, select each fighter during Maneuver, and use MAIN/ALLY/BOTH card tags when attacking, defending or playing actions. See [character authoring](docs/characters.md) and [engine rules](docs/engine.md) for the JSON model and exact command vocabulary.

To add a character from a deck URL, ask the agent: `Use .agents/skills/import-character/SKILL.md to import https://unmatched.cards/umdb/decks/<slug>`. This [repository-local skill](.agents/skills/import-character/SKILL.md) covers source retrieval, cards, allies, JSON authoring, original artwork and verification. Supported rules are declarative; roster/presentation registration still requires small code edits, and unsupported mechanics require reusable engine capabilities or an explicitly agreed adaptation. The skill is an agent workflow, not an in-app URL import feature.
