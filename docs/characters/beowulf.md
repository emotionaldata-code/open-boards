# Beowulf

Beowulf preserves the printed **30-card deck across twelve designs**, 17 HP, movement 2, melee attacks and one **9-HP melee Wiglaf**. He begins with 1 Rage, gains one per positive damage event dealt to him, and holds at most 3.

Source: [UmDb Beowulf](https://unmatched.cards/umdb/decks/beowulf), retrieved 2026-10-29 at 17:17:28 UTC through the public JSON API. The unmodified [source snapshot](beowulf/source.json) retains provenance and the [inventory](beowulf/inventory.json) records every quantity, printed value, BOOST, fighter restriction and source clause. Set: Little Red Riding Hood vs. Beowulf. No source notes or card notes were supplied. English printed identity and rules are preserved, with Italian presentation translations.

## Printed mapping

| Design               | Copies | User    |       Value | BOOST | Mapping                                                                                                                                       |
| -------------------- | -----: | ------- | ----------: | ----: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Remnant of Valor     |      2 | Wiglaf  |      Scheme |     2 | Every adjacent fighter receives 1 damage; exact positive damage to Beowulf grants one action.                                                 |
| Feint                |      3 | Both    | Versatile 2 |     1 | Immediate opposing-card suppression.                                                                                                          |
| Epic Poem            |      2 | Beowulf |    Attack 2 |     2 | Immediate Rage gain; during-combat live Rage adds to attack without payment.                                                                  |
| The Ancient Heirloom |      2 | Beowulf |    Attack 3 |     1 | Uncancellable; independently pay 2 Rage to replace printed value with 5 and/or 1 Rage for a mandatory BOOST card.                             |
| No Contest Expecteth |      2 | Beowulf |    Attack 3 |     3 | Only a combat win against an opposing sidekick permits the 3-Rage defeat.                                                                     |
| The War-King         |      3 | Beowulf | Versatile 1 |     3 | Choose an affordable payment from zero to three; each Rage adds 2 on the acting attack or defense.                                            |
| The Equal of Grendel |      3 | Beowulf |   Defense 3 |     1 | Immediate optional 2-Rage payment deals the opposing card’s printed value as damage.                                                          |
| Vigor and Courage    |      3 | Beowulf |      Scheme |     2 | Choose any opposing owner, randomly discard one exact card, then gain its BOOST as Rage.                                                      |
| Golden Drinking Horn |      2 | Beowulf |      Scheme |     3 | Pay zero to three Rage, then choose that many distinct effects in submitted resolution order: draw 2, move Beowulf up to 4, recover 2 health. |
| Hot for the Battle   |      2 | Wiglaf  |    Attack 3 |     3 | Optional post-combat exchange with the exact owning Beowulf.                                                                                  |
| Fatal Struggle       |      3 | Both    |    Attack 4 |     2 | The winning combatant’s owner draws 2; ties are defender wins.                                                                                |
| Skirmish             |      3 | Both    | Versatile 4 |     1 | A winner selects either living combatant and moves that fighter up to 2.                                                                      |

## Rules and shared conventions

Rage belongs only to Beowulf. Wiglaf damage does not generate it. Fully prevented damage is not dealt damage; one multi-point damage event grants one Rage. Repeated damage events each generate one, with clamping at three. Physical card effects bind to the actual playing fighter, so Wiglaf’s adjacent sweep and swap never silently originate at Beowulf.

Affordable resource choices are built from the live public counter. Optional spending always includes a zero-payment choice. Heirloom’s two during-combat clauses resolve in printed order; choosing the value replacement first still allows its independent BOOST payment when Rage remains. The printed-value replacement preserves the additional BOOST. The card’s static cancellation protection covers both clauses. No hand means the BOOST offer is omitted, so Rage cannot be paid for a nonexistent card selection.

Golden Drinking Horn selects distinct effects using the shared exact-count choice. The submitted order is retained across JSON reconnects, including suspension for movement. It pays Rage once before the chosen effects execute. Unspent Rage remains. Vigor’s exact random-discard receipt is private to the affected hand owner; the selected opposing owner and public discard remain observable. Empty opposing hands generate no Rage.

Remnant uses the shared owner-ordered adjacent-fighter group, including friendly and opposing fighters. A damage receipt tests the exact Beowulf instance before granting its one action. Ordinary damage reactions, defeat and game completion follow the existing engine rules. Source punctuation and the source’s `hot-for--the-battle` slug are normalized only in the internal card ID (`beowulf-hot-for-the-battle`). There are no omitted rules or balance adaptations.

The small reusable extension permits `counter.amount` to evaluate the existing typed Value expressions, including selected-card BOOST receipts, before clamping. A second correction honors explicit `boost-combat.optional: false` for a single payment card through the existing multiple-card payment machinery. Neither operation names Beowulf. Schema, runtime, neutral tests and engine/authoring documentation cover both.

## Original artwork

Sixteen original integrated Imagegen assets cover Beowulf and Wiglaf portraits, two genuinely transparent complete figures and all twelve card scenes. The original identity uses a weathered auburn-bearded Geatish king in bronze and iron mail with a forest-green cloak, and a young dark-curled Wiglaf in blue mail and cloak with spear and round shield. Source publisher illustrations are not copied or redistributed.

Masters, exact prompts, identity references, source hashes, generation paths and attribution are retained under `artwork/characters/beowulf/`. Public assets are prepared locally as hashed WebPs, with canonical card URLs. All crucial action is kept in the central card crop and owner colors/numbering remain separate from figure pixels. The procedural card scenes remain available as fallbacks.

## Verification

Final focused rules pass **82 tests**: 36 fixed-deck Beowulf cases, three neutral computed-counter/mandatory-BOOST cases and 43 existing BOOST regressions. The dedicated artwork test passes. Localization passed all three checks before the concurrent Hamlet registration; a later aggregate localization attempt flags only Hamlet’s still-being-authored strings. Scoped ESLint, Prettier and whitespace checks pass. Typecheck passed during this import; the final current-source attempt reports the concurrent `tests/e2e/hamlet.spec.ts:158` counter-union type error and no Beowulf error. Aggregate full suites and builds are recorded by the overall import audit.

All **five relevant real-browser scenarios are verified**: one complete twelve-design desktop/landscape-phone gallery and inspector audit, plus Horn’s distinct-effect selection and reconnect and the two shared figure textures in all four owner colors, each with normal/reduced motion. Keyboard activation, private persisted choices, numbered Wiglaf, all twelve responsive illustrations and both transparent figures were inspected. No Beowulf asset or page errors were observed. A combined browser batch passed four cases and hit one Vite navigation-context interruption during concurrent edits; the clean four-case Beowulf retry passes completely. The final gallery remains separately passing.

All sixteen originals match their saved generator files and recorded SHA-256 hashes. The **44 hashed WebP derivatives total 4,743,158 bytes**; dimensions, byte lengths, hash filenames, real alpha and fully transparent figure borders pass. Repeat preparation preserves all sixteen manifest entries and all forty-four derivative hashes. Portraits, figures, the twelve-scene contact sheet and real desktop/phone captures were visually reviewed.

Evidence: `/tmp/beowulf-rules-final.log`, `/tmp/beowulf-assets-final.log`, `/tmp/beowulf-browser-verified.log`, `/tmp/beowulf-browser-final.log`, `/tmp/beowulf-typecheck-final.log`; screenshots under `/tmp/beowulf-browser-verified/` and `/tmp/beowulf-browser-final/`, contact sheet `/tmp/beowulf-art-review.png`. No deployment was performed.
