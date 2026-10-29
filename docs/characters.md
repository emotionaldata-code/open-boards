# Characters and decks

The [2026-10-29 UmDb selection audit](characters/2026-10-29-import-selection.md) compares the previous roster with the public catalog and records the eight selected imports and remaining source links.

The completed eight-character batch adds Tesla, Houdini, Little Red, Beowulf, Hamlet, Bloody Mary, Jekyll & Hyde and Golden Bat. Its [integrated verification report](characters/2026-10-29-import-verification.md) records the 26-hero roster, original artwork, passing checks and remaining broader-suite failures.

Medusa is playable with her corrected printed 30-card deck across eleven designs and three Harpies. Her [import notes](characters/medusa.md) record source corrections, reusable rules and original artwork.

The Genie is playable with his full 30-card deck across twelve designs, Infinite Power and all three wishes. His [import notes](characters/the-genie.md) document the shared rule hooks, source inventory and original artwork.

Each character owns one JSON bundle in `packages/content/src/characters/`: stats, passive hooks, card rules, copy counts, flavor and artwork recipes. Allies share their owner’s deck, hand and two-action budget, with independent health, counters, statuses and passive usage. MAIN/ALLY/BOTH tags restrict which fighters can use a card.

Sinbad is playable with **30 cards across 16 designs**, 15 HP, movement 2, melee attacks and one **6-HP melee Porter**. Seven Voyages increase both fighters’ Maneuver allowance and Sinbad’s Voyage attacks; Voyage Home recovers earlier Voyages. His [import notes](characters/sinbad.md) record the complete source inventory, rule mapping and original artwork.

## Author a fighter

For a deck URL, use the repository-local [import-character skill](../.agents/skills/import-character/SKILL.md). It includes a source fetch helper, field mapping, JSON examples, artwork guidance and compatibility checks. Supported mechanics need no new engine behavior, but complete characters still require the registration and presentation edits below. A source import can use a deck within the engine's 5–100-card bounds, with tests checking that source’s exact quantities.

1. Copy an existing JSON file. Use unique character and card IDs across bundles; ability IDs must be unique within each source. Preserve the intended source quantities.
2. Set `hp`, `movement`, `attackType`, optional passive `abilities`/`counters`, optional repeated `ally` definition, and `cards`. Omit `ally` for a solo character. Each card defines `id`, `name`, `category`, `usableBy`, `value`, `count`, readable `description`, `art` and `flavor`. Actions use `effects`; combat cards use timed `abilities`. [engine.md](engine.md) defines the precise supported hooks, conditions, effects and card lifetime.
3. Import the bundle in `packages/content/src/characters.ts`. `compileRoster` builds `characters`, `cards` and the separate `cardPresentation` registry. Only rules reach engine Definitions; quantities are written once.
4. Register client-only character flavor in `apps/client/src/characters/profiles.ts`, its portrait/miniature in `art.ts`, and its confirmed ability cue in `marks.ts`. New cards require no renderer or hand-control changes.
5. Add a fixed-deck rules test. Run typecheck, lint, tests and browser checks; verify effects, hidden information, reconnect choices and phone layouts.

## Lightweight artwork

Original raster sources use Git LFS; [source artwork storage](artwork-storage.md) explains how to fetch them for editing. Prompts, recipes and browser-ready derivatives remain in regular Git.

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

## Invisible Man

Invisible Man is playable with **30 cards across 14 designs**, 15 HP, movement 2, melee attacks, no allies and **three numbered fog tokens**. Fog grants defense cover and movement links exclusively to its owner. Cards move and delegate fog, manipulate the top of the deck, and temporarily remove the living hero before his next-turn return. Every printed timing, BOOST and restriction is preserved. The [source inventory](characters/invisible-man/inventory.json) and [import notes](characters/invisible-man.md) document the reusable operations, multiplayer conventions and fourteen original illustrations plus the owner-colored hero and fog markers.

## Geralt of Rivia

Geralt is playable with a **36-card pool across 15 designs**, selecting a **30-card deck across 12 designs** before each match. He has 16 HP, movement 2, melee attacks, and one **5-HP ranged Dandelion**. Eight loadouts combine swords, armor and ongoing potions. Signs control movement, Rend can BOOST attacks or defenses, and Witcher Senses recovers selected gear. The [source inventory](characters/geralt-of-rivia/inventory.json) and [import notes](characters/geralt-of-rivia.md) record every printed clause, publisher setup/ongoing clarifications and fifteen original illustrations plus distinct owner-colored figures.

## Darth Vader

Darth Vader preserves **30 cards across 12 designs**, 20 HP, movement 2, melee attacks and no allies from TedWatson’s linked Star Wars reskin. Force Grip trades a card for its BOOST in damage to any fighter in Vader’s zone. His deck adds delegated draw/discard decisions, turn-long movement locks, action-paid attacks, top-deck BOOST defense and starting-space recovery. The [exact source inventory](characters/darth-vader/inventory.json) and [import notes](characters/darth-vader.md) document every printed clause, reusable rule extensions, shared game conventions and twelve original illustrations plus an owner-colored figure.

## Alice

Alice is playable with **30 cards across 15 designs**, 13 HP, movement 2, melee attacks and one **8-HP melee Jabberwock**. She chooses BIG or SMALL before opening hands are dealt, then changes size through her printed card effects. BIG increases her attack cards by 2; SMALL increases her defense cards by 1. Looking Glass selects two distinct effects in the owner’s chosen order. The [source inventory](characters/alice/inventory.json) and [import notes](characters/alice.md) document every printed clause, reusable setup/choice operations and original portraits, transparent figures and fifteen card scenes.

## Philippa

Philippa is playable with **30 cards across 13 designs**, 12 HP, movement 2, ranged attacks and one **6-HP melee Dijkstra**. Two Steps Ahead optionally refills her hand to four at turn end. Her deck combines private opponent-selected reveals, paid discard dilemmas, exact printed-value locking, selected-zone lightning and Polymorphy’s ongoing movement. All source counts, BOOSTs, restrictions and timed clauses are retained. The [source inventory](characters/philippa/inventory.json) and [import notes](characters/philippa.md) document every mapping, publisher clarifications and original portraits, transparent figures and thirteen card scenes.

## Yennefer & Triss

Yennefer & Triss are playable with **30 cards across eleven designs**. Choose either ranged sorceress as the **14-HP hero** before opening hands; the other becomes a **6-HP ranged sidekick**, with movement 2 shared by both. Named cards follow identity, while only the chosen hero’s special applies. Their deck includes immediate attack BOOSTs, scheme retaliation, ongoing BOOST bonuses, exact optional payments, portals and sealed simultaneous card reveals. The [source inventory](characters/yennefer-triss/inventory.json) and [import notes](characters/yennefer-triss.md) document every printed clause and fifteen original illustrations/portraits/figures.

## Eredin

Eredin is playable with **30 cards across 11 designs**, 14 HP, movement 2, melee attacks and **four 1-HP melee Red Riders**. When every Rider is defeated, his continuous ENRAGED state raises movement to 3 and combat-card values by 1. His deck sacrifices and revives Riders, declares face-up attacks across the battlefield, transfers defense through portals and maintains an ongoing damage ward. The [source inventory](characters/eredin/inventory.json) and [import notes](characters/eredin.md) record every printed clause, reusable operations and fifteen original artwork assets.

## Sun Wukong

Sun Wukong is playable with **30 cards across 12 designs**, 17 HP, movement 2 and **three 1-HP melee Clones that begin off the board**. He summons or relocates Clones, transforms, redirects combat damage and tricks defended attacks into Tricked You. Every printed BOOST, quantity, fighter restriction and timed clause is preserved. His [source inventory](characters/sun-wukong/inventory.json) and [import notes](characters/sun-wukong.md) document publisher clarifications, reusable rules and sixteen original Imagegen assets.

## Nikola Tesla

Nikola Tesla is playable with **30 cards across 11 designs**, 14 HP, movement 2 and ranged attacks, without allies. His two coils charge at turn end, threaten nearby enemies at turn start and power optional card effects. X-Ray Radiation publicly reveals an exact opposing top-deck card before its discharge decision. The [printed inventory](characters/nikola-tesla/inventory.json) and [import notes](characters/nikola-tesla.md) document every clause, reusable reveal/discard operations and original artwork.

## Little Red Riding Hood

Little Red Riding Hood is playable with **30 cards across 12 printed designs**, represented by **14 entries** to preserve Into the Woods’ three distinct basket symbols. She has 14 HP, movement 2, melee attacks and one 9-HP ranged Huntsman. Her live discard basket, wild starting marker, conditional defense and exact top-card recovery retain their printed timing. The [source inventory](characters/little-red/inventory.json) and [import notes](characters/little-red.md) document every clause and sixteen original Imagegen assets.

## Beowulf

Beowulf is playable with **30 cards across twelve designs**, 17 HP, movement 2 and one **9-HP melee Wiglaf**. Damage fuels his capped Rage, which powers combat values, immediate retaliation, sidekick defeat and the Golden Drinking Horn’s distinct ordered effects. Every printed BOOST, restriction and timed clause is retained. The [source inventory](characters/beowulf/inventory.json) and [import notes](characters/beowulf.md) record the complete mapping, reusable computed counter operation and sixteen original Imagegen assets.

## Hamlet

Hamlet is playable with **30 cards across 12 designs**, 15 HP, movement 2, melee attacks and one **6-HP melee Rosencrantz & Guildenstern**. The Question chooses additional Maneuver draws or stronger Hamlet attacks at a friendly fighter’s expense. His deck preserves exact discarded-card recovery, current-turn damage, combat-based movement and optional private hand cycling. The [source inventory](characters/hamlet/inventory.json) and [import notes](characters/hamlet.md) document every printed clause, reusable operations and original artwork.

## Harry Houdini

Harry Houdini is playable with **30 cards across 13 designs**, 14 HP, movement 2, melee attacks and one **5-HP melee Bess**. Escape Artist replaces Houdini's boosted Maneuver movement with placement while Bess moves normally. Printed BOOST bonuses, simultaneous two-card BOOST, exact card recovery, combat exchanges, hand-inspection protection and All Part of the Show's survival are represented by shared rules. The [source inventory](characters/harry-houdini/inventory.json) and [import notes](characters/harry-houdini.md) document every clause, publisher rulings and seventeen original Imagegen assets.

## Bloody Mary

Bloody Mary is playable with **30 cards across 13 designs**, 16 HP, movement 3, melee attacks and no allies. Exactly three cards at turn start grants an action; her third actual action powers several cards independently of action gains. Bloody Reprise retains the first defense's printed value while allowing a fresh, independently cancellable defense. Mirror movement, exact private hand dilemmas and final-value comparisons use reusable rules. The [source inventory](characters/bloody-mary/inventory.json) and [import notes](characters/bloody-mary.md) document every clause and fifteen original Imagegen assets.

## Jekyll & Hyde

Jekyll & Hyde are playable with **30 cards across thirteen designs**, one 16-HP melee fighter, movement 2 and no allies. The Serum starts as Jekyll and optionally changes form each turn; every form-specific card is enforced before play, and Hyde pays health after each Maneuver. Private drawn-card research, exact revealed-card transfers and all transformations retain their printed timing. The [source inventory](characters/jekyll-hyde/inventory.json) and [import notes](characters/jekyll-hyde.md) document all clauses, reusable operations and original artwork.

## Golden Bat

Golden Bat is playable with **30 cards across 12 designs**, 18 HP, movement 3, melee attacks and no allies. The First Superhero rewards attacks before a Maneuver; schemes and after-combat movement prepare positional combinations without spending that bonus. His complete deck includes exact shuffled recovery, seeded random recovery, private opponent-deck ordering and a global current-turn movement lock. The [source inventory](characters/golden-bat/inventory.json) and [import notes](characters/golden-bat.md) record every printed clause and the original portrait, transparent figure and twelve card scenes.
