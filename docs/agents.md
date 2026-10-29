# Agents and headless games

`@open-boards/agents` exposes the same authoritative game engine through detached,
player-filtered observations. A policy implements `Agent.decide(observation, signal?)`
and returns a game `Command`. It receives public rules/card definitions, its own hand,
public board state, the actual pending actor, and structured legal actions. It never
receives opponents' hands, decks, the random generator state, or ability continuations.

```ts
import { simulate, replaySimulation } from '@open-boards/agents';
import { basic } from '@open-boards/content';

const result = await simulate({
  definitions: basic,
  players: [
    { id: 'a', name: 'Alice', character: 'alice' },
    { id: 'b', name: 'Bigfoot', character: 'bigfoot' },
  ],
  seed: 42,
  maxSteps: 10000,
});
if (result.status === 'finished') console.log(result.winner);
else console.log(result.reason, result.message);
const finalState = replaySimulation(result.replay);
```

Simulation needs no account, connection, rendering, or animation timers. Deck shuffles,
engine effects, and default policy decisions are seeded independently. Replays include
seed, exact initial decks, definitions, and accepted commands. `state` and `replay` are
full-information offline artifacts: do not send them to live policies or players.
Custom agents can be provided by player ID through `agents`. A step limit produces
`stopped`, never an invented winner. Abort signals are cooperative; a custom policy
that never returns requires its own timeout/process termination.

`pendingActor(game)` accounts for setup, defense, discard, movement, and nested ability
choices, including choices controlled by someone other than the turn owner.
`legalActions(game, definitions, player)` uses existing engine helpers without probing
hidden state. `legal.commands` lists atomic commands; movement supplies one shortest
path per reachable endpoint. `legal.selection` describes distinct choice/discard IDs
and minimum/maximum counts, avoiding exponential subset enumeration. The server still
validates every command. Definitions must match the server's rules/content version.

`createRandomAgent(seed)` is a bounded baseline for smoke tests and live demonstrations,
not a strong opponent. Only the registered `random` policy runs in server rooms.
Expensive, untrusted, or arbitrary user policies should run in a separate process or
worker and communicate observations/commands; the interface deliberately contains
only serializable inputs and outputs. Do not execute those policies on the server
message loop.

`BotDriver` accepts `agent`, `observe`, `submit(command, revision, signal)`, and optional
`onError` callbacks. Call `update()` on new snapshots and `stop()` on disposal. It makes
one attempt per revision, aborts superseded work, and rechecks actor/revision before
submission. It never automatically retries a rejected command on unchanged state.
Supply presentation pacing outside the driver. `submit` must preserve the observed
revision when making the authoritative command envelope.

## Existing accounts and remote rooms

The separate `@open-boards/agents/client` export imports Colyseus; the headless root
export has no network dependency at runtime. `RemoteClient` uses `/api/auth/*`, the
existing HttpOnly session cookie, and the existing `arena` room protocol.

```ts
import { RemoteClient } from '@open-boards/agents/client';
import { BotDriver, createRandomAgent } from '@open-boards/agents';

const client = new RemoteClient({
  endpoint: 'http://localhost:2567',
  origin: 'http://localhost:5173', // APP_ORIGIN in the local development configuration
});
const user = await client.login('existing_account', process.env.BOARDS_PASSWORD!);
const definitions = await client.rules();
let driver: BotDriver | undefined;
const room = await client.join('room-id', {
  snapshot: () => driver?.update(),
  error: (error) => console.error(error.message),
});
driver = new BotDriver({
  agent: createRandomAgent(42),
  observe: () => room.observation(user.id, definitions),
  submit: (command, revision) => room.command(command, revision),
});
driver.update();
room.character('alice');
room.ready();
// The host calls room.start() once seats are ready.
```

Fetch public card, character, map, and status definitions with `client.rules()` after
authentication. Offline consumers can import matching `@open-boards/content` instead.
Pass the authenticated session user ID to `room.observation`; the caller must not
substitute another player ID. This method returns null for spectator snapshots.
Register accounts with `register`, inspect `session`, list `rooms`, create a room with
`create(2, handlers)`, or join/watch with `join(id, handlers, 'spectator')`. Spectator
observations have no hand and must not be used as player policy input. A spectator
host can add bots and start a room. Save `room.reconnectionToken` if reconnecting across
process restarts; keep it private like a session credential.

Node clients retain the session cookie from auth responses and pass it to Colyseus.
Browsers use their existing cookie jar. Configure `origin` to the server's allowed
origin when it differs from the endpoint. An injected `fetch` and `createTransport`
can handle custom networking. Commands are sent without a synthetic acknowledgement:
acceptance appears in a newer snapshot; failures arrive through `handlers.error`.
Stop your driver and call `room.leave()` during shutdown.

Live bot rooms are viewer-driven: bots suspend when no players or spectators are
connected, and in-flight work is cancelled. Colyseus disposes the room when its last
connection/reservation disappears; a disconnected human seat retains its normal
reconnection grace period. Use `simulate` for unattended runs rather than relying on
an empty live room to keep playing.
