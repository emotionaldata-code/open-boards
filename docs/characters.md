# Characters and decks

Medusa is playable with her corrected printed 30-card deck across eleven designs and three Harpies. Her [import notes](characters/medusa.md) record source corrections, reusable rules and original artwork.

The Genie is playable with his full 30-card deck across twelve designs, Infinite Power and all three wishes. His [import notes](characters/the-genie.md) document the shared rule hooks, source inventory and original artwork.

Each character owns one JSON bundle in `packages/content/src/characters/`: stats, passive hooks, card rules, copy counts, flavor and artwork recipes. Allies share their owner’s deck, hand and two-action budget, with independent health, counters, statuses and passive usage. MAIN/ALLY/BOTH tags restrict which fighters can use a card.

## Author a fighter

For a deck URL, use the repository-local [import-character skill](../.agents/skills/import-character/SKILL.md). It includes a source fetch helper, field mapping, JSON examples, artwork guidance and compatibility checks. Supported mechanics need no new engine behavior, but complete characters still require the registration and presentation edits below. A source import can use a deck within the engine's 5–100-card bounds, with tests checking that source’s exact quantities.

1. Copy an existing JSON file. Use unique character and card IDs across bundles; ability IDs must be unique within each source. Preserve the intended source quantities.
2. Set `hp`, `movement`, `attackType`, optional passive `abilities`/`counters`, optional repeated `ally` definition, and `cards`. Omit `ally` for a solo character. Each card defines `id`, `name`, `category`, `usableBy`, `value`, `count`, readable `description`, `art` and `flavor`. Actions use `effects`; combat cards use timed `abilities`. [engine.md](engine.md) defines the precise supported hooks, conditions, effects and card lifetime.
3. Import the bundle in `packages/content/src/characters.ts`. `compileRoster` builds `characters`, `cards` and the separate `cardPresentation` registry. Only rules reach engine Definitions; quantities are written once.
4. Register client-only character flavor in `apps/client/src/characters/profiles.ts`, its portrait/miniature in `art.ts`, and its confirmed ability cue in `marks.ts`. New cards require no renderer or hand-control changes.
5. Add a fixed-deck rules test. Run typecheck, lint, tests and browser checks; verify effects, hidden information, reconnect choices and phone layouts.

## Lightweight artwork

The bundle’s `palette` has three six-digit hex colors: `ground`, `ink`, `accent`. Each card’s `art` selects a reusable scene and optional `variant` (integer 0–6). Scenes: `shield`, `blade`, `bastion`, `lantern`, `trail`, `fire`, `embers`, `ward`, `bolt`, `map`. Original vector scenes live in `apps/client/src/cards/art.ts`. Recipes produce crisp local SVGs without dependencies or network calls.

```json
"palette": { "ground": "#26363e", "ink": "#bfd0d3", "accent": "#d8b77d" }
```

```json
"art": { "scene": "shield", "variant": 3 }
```

For custom illustrations, add a trusted static file under `apps/client/public/cards/` and use `"art": { "scene": "shield", "image": "/cards/my-shield.webp" }`. Only local absolute paths ending in `.svg`, `.webp`, `.png` or `.jpg` are accepted. SVG files must be trusted, authored assets. This is an artwork reference, never executable content.

`CardPrint` is shared by hand cards, the deck gallery and the full inspector. The hand’s separate **i** button works on disabled cards and never selects or plays them. The inspector reads the same description, hook timing, passive rules and copy counts as the playable definitions. Login and waiting-room explorers show every printed card without revealing an actual shuffled hand or deck order.

## Extension boundary

The engine interprets a shared declarative vocabulary, including combat-card suppression, fighter groups and revival. A future visual editor can generate the same JSON. New mechanics outside the documented vocabulary require reusable engine operations and tests. Never execute marketplace-supplied JavaScript. Publishing/versioning, untrusted uploads and a character editor remain future work.

## Medusa

Medusa has 16 HP, movement 3 and ranged attacks, with three 1-HP melee Harpies. Petrifying gaze optionally damages an enemy in her zone at turn start. Her eleven designs preserve all printed values, explicit BOOST values, quantities and MAIN/ALLY/BOTH restrictions. See [the complete printed inventory](characters/drafts/medusa/inventory.json) and [source/import notes](characters/medusa.md).

Feint suppresses the opposing card’s effects immediately. Second Shot uses the existing optional attack BOOST. Hounds moves each living owned Harpy up to 3 in the owner’s chosen order. Winged Frenzy moves every living owned fighter through enemies, then optionally restores one defeated Harpy in Medusa’s zone after her movement. Group movement and revival use ordinary private choices and reconnect recovery. Owner colors and stable numbered Harpy identities remain visible.

## King Arthur

King Arthur is playable with **30 cards across 16 designs** and one **7-HP ranged Merlin**. Arthur has 18 HP, melee attacks and movement 2. His private attack BOOST can combine with Noble Sacrifice’s second payment; cancellation removes the special’s bonus only when an attack-card effect is cancelled, preserving Excalibur’s exception.

Merlin provides private deck inspection, area damage, damage prevention and movement of every fighter. The complete [source inventory](characters/drafts/king-arthur/inventory.json) and [import notes](characters/king-arthur.md) record every printed clause, the reusable operations and original artwork.

## Sherlock Holmes

Sherlock Holmes is playable with **30 cards across 13 designs** and one **8-HP ranged Dr. Watson**. Holmes has 16 HP, movement 2 and melee attacks. Deductive Reasoning protects named-fighter card effects; Elementary predicts a hidden attack before reveal. His schemes inspect and dismantle opposing hands, swap heroes, and bring Watson beside Holmes for aid. The [source inventory](characters/drafts/sherlock-holmes/inventory.json) and [import notes](characters/sherlock-holmes.md) document all printed clauses, reusable rules and original artwork.

## Achilles

Achilles is playable with **30 cards across 12 designs**, 18 HP, movement 2 and one **6-HP melee Patroclus**. Patroclus's defeat forces two random discards, then fuels Achilles's attacks and victory draws. Test For Weakness resolves a separate Relentless Assault, while Under Achilles' Helm can exchange positions and transfer defense to Patroclus. All printed BOOST values, fighter restrictions and timed effects are preserved. The [source inventory](characters/achilles/inventory.json) and [import notes](characters/achilles.md) document the rule mapping, timing and twelve original card illustrations.

## Dracula

Dracula is playable with **30 cards across 13 designs**, 13 HP, movement 2 and **three 1-HP melee Sisters**. Bloodthirsty can feed on an adjacent friendly or enemy fighter before drawing. His deck preserves every printed BOOST, restriction and timed clause, including private attack replacement, Beastform’s hand payment, Sister-based bonuses, feeding, revival and exact fighter placement. The [source inventory](characters/dracula/inventory.json) and [import notes](characters/dracula.md) document reusable rules, shared game conventions and thirteen original illustrations plus distinct owner-colored figures.

## Bigfoot

Bigfoot is playable with **30 cards across 11 designs**, 16 HP, movement 3 and one **6-HP melee Jackalope**. Loner by Nature optionally draws at the end of his turn when his zone has no opposing fighters. The deck combines powerful attacks, cancellation, movement through enemies, placement and adjacent damage that can also hit friendly fighters. All printed BOOSTs, restrictions and timed rules are preserved using existing capabilities. The [source inventory](characters/bigfoot/inventory.json) and [import notes](characters/bigfoot.md) document every clause and eleven original illustrations plus distinct owner-colored figures.

## Robin Hood

Robin Hood is playable with **30 cards across 11 designs**, 13 HP, movement 2, ranged attacks and **four 1-HP melee Outlaws**. Each attacking fighter can retreat up to 2 spaces after its card effects finish. His deck includes delegated opponent discard decisions, damage-based draws, immediate defense ignoring and numbered Outlaw revival in Robin's zone. The [source inventory](characters/robin-hood/inventory.json) and [import notes](characters/robin-hood.md) record every printed clause, shared game conventions and original artwork.

## Bruce Lee

Bruce Lee is playable with **30 cards across 17 designs**, 14 HP, movement 3 and melee attacks, without allies. His optional end step moves him one space; six Jeet Kune Do techniques refund actions, and his recovery cards select only those techniques. Nunchaku bonuses stack for the current turn, and One-Inch Punch returns its exact played instance only when its own damage defeats a fighter. The [source inventory](characters/bruce-lee/inventory.json) and [import notes](characters/bruce-lee.md) record every printed clause, shared rule semantics and seventeen original illustrations plus the owner-colored figure.
