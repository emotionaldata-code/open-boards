# Golden Bat

Golden Bat preserves the **30-card, 12-design** deck from [UmDb](https://unmatched.cards/umdb/decks/golden-bat), retrieved from its [public JSON endpoint](https://unmatched.cards/api/db/decks/golden-bat) on **2026-10-29 at 17:17:28 UTC**. The source identifies _Unmatched Adventures — Tales to Amaze_. No card or deck clarification notes were supplied. The [source inventory](golden-bat/inventory.json) records every quantity, printed value, BOOST, fighter restriction and rule clause.

Golden Bat is a solo melee fighter with **18 HP and movement 3**. All cards retain their GOLDEN BAT restriction as MAIN. There is no ally. The First Superhero adds +2 to his attacks while his owner has not taken a Maneuver action during the current turn. Moving through a scheme or after combat does not count as Maneuver; completing a Maneuver without moving does. The passive is a fighter ability and survives opposing card cancellation.

| Design                       | Copies |       Value | BOOST | Rule mapping                                                                                                                                                                     |
| ---------------------------- | -----: | ----------: | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Punch to Shake the Earth   |      3 |    1 attack |     1 | After combat, iterate all enemies sharing any current Golden Bat zone; deal 1 each, or 2 on a win.                                                                               |
| Alpine Fortress              |      3 |      scheme |     3 | Privately recover an exact prior discard into the deck and shuffle, draw 2 normally, then move up to 4. The resolving scheme is unavailable for recovery.                        |
| Arrive Just in Time          |      2 |      scheme |     2 | Mandatory any-space placement, including the current space. Occupied opposing spaces remain illegal.                                                                             |
| He Laughs at Your Feebleness |      2 |   5 defense |     3 | Printed defense without additional effects.                                                                                                                                      |
| Imposing Presence            |      2 |   3 defense |     2 | Immediate opposing combat-card suppression.                                                                                                                                      |
| Insight of the Ancients      |      2 | 3 versatile |     2 | On a win, recover one exact settled random discard through the private deterministic seed. Committed cards, including itself, are excluded.                                      |
| Like a Flash of Golden Light |      3 | 2 versatile |     2 | During combat, replace the printed value with 4 only if every current zone differs from every recorded turn-start zone; after combat move up to 5. Fighter bonuses are retained. |
| Sight Beyond Sight           |      3 | 2 versatile |     1 | After combat, Golden Bat’s owner privately inspects and orders the opponent’s exact top 3. The remainder is untouched.                                                           |
| Skirmish                     |      2 | 4 versatile |     1 | On a win, choose one living combat participant and move it up to 2.                                                                                                              |
| Super Strength               |      2 |    5 attack |     1 | Printed attack without additional effects.                                                                                                                                       |
| Terrifying Roar              |      3 | 3 versatile |     1 | Immediate atomic global movement lock through the current turn, including fighters later revived or summoned. Immediate cancellation can prevent the lock.                       |
| Vaporizing Eyebeams          |      3 |    2 attack |     2 | After combat, discard one random opposing hand card through the ordinary seeded discard operation.                                                                               |

## Shared capabilities and conventions

`recover-card.random` chooses uniformly from eligible exact settled instances and advances the existing serialized private seed once for selection when a card exists. A deck destination retains its ordinary additional shuffle. Empty recovery consumes no seed and causes no draw/exhaustion hooks. Ordinary recovery and discard counting now exclude unfinished schemes as well as combat commitments. Explicit named-card search/recycling capabilities retain their separate intentional behavior.

`inspect-deck.target` separates the affected deck owner from the inspecting chooser. Exact selected IDs and the affected player survive JSON reconnects. Only the chooser receives the inspected identities, and cards beyond the requested prefix never become options. A singleton deck still receives a private acknowledgment view. Empty inspection is a no-op.

`lock-movement.all` locks the fixed roster’s exact fighter IDs, including defeated/reserve instances. Arrival from reserve or revival remains legal; after arrival those fighters cannot leave their spaces. Normal movement, forced movement, placement, swaps and removal all respect the existing lock. The ordinary next-seat boundary clears it. No character-specific runtime branch or new global state is required.

No printed clause is omitted or intentionally adapted. Scheme values normalize to the engine’s existing zero. The project’s shared rules remain two actions, an opening hand of five, hand limit seven, exhaustion and no automatic deck reshuffle. Source damage affecting every fighter in a zone uses the union of shared zones; it is distinct from the engine operation that selects one space within a zone.

## Original artwork

Portrait, a true-alpha full-body board figure and twelve separate narrative card illustrations are original integrated Imagegen artwork generated on 2026-10-29. The original interpretation uses an antique golden skeletal hero, red eyes, crimson cape with dark exterior lining and pale staff. No source image was redistributed. Exact prompts, generation provenance, untouched PNG masters and responsive crop recipes are maintained under `artwork/characters/golden-bat/`; prepared local WebPs live under `apps/client/public/artwork/golden-bat/`. The portrait is reused as an identity reference for the token and scenes. Owner colors and selection remain separate from the transparent figure.

## Verification

Focused source/behavior and neutral operation tests cover the inventory, no-Maneuver attack bonus, both combat roles, all twelve designs, cancellation, multi-target zone damage, exact prior recovery, deterministic random continuation, empty piles, private top-three ordering, immutable forged/wrong-owner rejection, JSON reconnects, reserve/revival movement locking, turn-boundary expiry and two/four-seat solo deployment. **120 focused tests across ten files pass**, including 20 printed-deck cases and eight neutral operation cases, plus shared discard/reveal/receipt, Sinbad, localization, roster and artwork regressions. Typecheck, focused ESLint, scoped formatting and whitespace checks pass.

**All five focused browser scenarios pass**: the complete twelve-design gallery on desktop/landscape phone, private opponent-deck ordering across keyboard/reload with reduced and full motion, and one transparent figure texture reused across all four owner colors in both motion modes. The initial run had one navigation-context interruption during concurrent source formatting; the clean rerun passes 5/5. Screenshots were visually inspected and copied to `/tmp/golden-bat-browser/`; the original-asset contact sheet is `/tmp/golden-bat-contact-sheet.png`. All fourteen entries have checked hashes, dimensions, bytes and real token alpha. Repeated preparation leaves the manifest entries and derivative filenames identical (5,062,906 bytes across all variants).

The coordinating parent owns the integrated full test suite and production build. No deployment was requested or performed.
