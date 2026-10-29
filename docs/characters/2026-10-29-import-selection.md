# UmDb import selection — 2026-10-29

Compared the [UmDb catalog](https://unmatched.cards/umdb/decks) and its public `/api/db/decks` response with the 18 registered characters before this batch. Of 74 catalog entries, 17 were already registered (Darth Vader is a separate Maker import), leaving 57 missing entries. Of those, 42 returned nonempty card and hero lists; 15 lacked one or both. Presence of those lists is an availability check, not a complete rules audit.

## Selected imports

All eight selected source decks contain 30 copies. Each import is assigned its own `gpt-6.1-sol` agent with high reasoning and the repository-local import-character skill. The runtime permits three child agents concurrently, so the assignments run in waves.

| Source                                                                  | Printed designs | Selection reason                                                              |
| ----------------------------------------------------------------------- | --------------: | ----------------------------------------------------------------------------- |
| [Nikola Tesla](https://unmatched.cards/umdb/decks/nikola-tesla)         |              11 | Spend charged coils for stronger effects; electrical laboratory imagery.      |
| [Harry Houdini](https://unmatched.cards/umdb/decks/harry-houdini)       |              13 | BOOST tricks, escapes and fighter swaps; stage magic and an active partner.   |
| [Beowulf](https://unmatched.cards/umdb/decks/beowulf)                   |              12 | Take damage to fuel Rage; resource spending and durable companion play.       |
| [Little Red Riding Hood](https://unmatched.cards/umdb/decks/little-red) |              12 | Sequence basket symbols into conditional combos; dark fairy-tale identity.    |
| [Hamlet](https://unmatched.cards/umdb/decks/hamlet)                     |              12 | Choose card economy or damage at a health cost each turn; theatrical tragedy. |
| [Bloody Mary](https://unmatched.cards/umdb/decks/bloody-mary)           |              13 | Plan a third-action burst and manage a three-card hand; mirror horror.        |
| [Jekyll & Hyde](https://unmatched.cards/umdb/decks/jekyll-hyde)         |              13 | Switch between defensive recovery and destructive attacks; dual identity.     |
| [Golden Bat](https://unmatched.cards/umdb/decks/golden-bat)             |              12 | Attack without Maneuver, reposition through cards; golden skeletal superhero. |

Little Red has 12 printed designs, including three Into the Woods copies with different symbols. The playable representation uses distinct symbol variants and shared artwork, preserving all 30 copies.

## Other missing entries with source cards and heroes

- [Ms. Marvel](https://unmatched.cards/umdb/decks/ms-marvel)
- [Daredevil](https://unmatched.cards/umdb/decks/daredevil)
- [Buffy](https://unmatched.cards/umdb/decks/buffy)
- [Black Widow](https://unmatched.cards/umdb/decks/black-widow)
- [Angel](https://unmatched.cards/umdb/decks/angel)
- [Spike](https://unmatched.cards/umdb/decks/spike)
- [Dr. Ellie Sattler](https://unmatched.cards/umdb/decks/dr-ellie-sattler)
- [Titania](https://unmatched.cards/umdb/decks/titania)
- [Willow](https://unmatched.cards/umdb/decks/willow)
- [Luke Cage](https://unmatched.cards/umdb/decks/luke-cage)
- [Black Panther](https://unmatched.cards/umdb/decks/black-panther)
- [The Wayward Sisters](https://unmatched.cards/umdb/decks/the-wayward-sisters)
- [Deadpool](https://unmatched.cards/umdb/decks/deadpool)
- [InGen](https://unmatched.cards/umdb/decks/ingen)
- [Yennenga](https://unmatched.cards/umdb/decks/yennenga)
- [Bullseye](https://unmatched.cards/umdb/decks/bullseye)
- [Moon Knight](https://unmatched.cards/umdb/decks/moon-knight)
- [Raptors](https://unmatched.cards/umdb/decks/raptors)
- [Squirrel Girl](https://unmatched.cards/umdb/decks/squirrel-girl)
- [Ghost Rider](https://unmatched.cards/umdb/decks/ghost-rider)
- [Ciri](https://unmatched.cards/umdb/decks/ciri)
- [Ancient Leshen](https://unmatched.cards/umdb/decks/ancient-leshen)
- [Elektra](https://unmatched.cards/umdb/decks/elektra)
- [T. Rex](https://unmatched.cards/umdb/decks/t-rex)
- [Cloak and Dagger](https://unmatched.cards/umdb/decks/cloak-and-dagger)
- [Winter Soldier](https://unmatched.cards/umdb/decks/winter-soldier)
- [William Shakespeare](https://unmatched.cards/umdb/decks/william-shakespeare)
- [Dr. Jill Trent](https://unmatched.cards/umdb/decks/dr-jill-trent)
- [Annie Christmas](https://unmatched.cards/umdb/decks/annie-christmas)
- [Spider-Man](https://unmatched.cards/umdb/decks/spider_man)
- [She-Hulk](https://unmatched.cards/umdb/decks/she_hulk)
- [Doctor Strange](https://unmatched.cards/umdb/decks/doctor_strange)
- [Tomoe Gozen](https://unmatched.cards/umdb/decks/tomoe-gozen)
- [Oda Nobunaga](https://unmatched.cards/umdb/decks/oda-nobunaga)

## Entries with incomplete source data

- [John Henry](https://unmatched.cards/umdb/decks/john-henry)
- [George Washington](https://unmatched.cards/umdb/decks/george-washington)
- [Wyatt Earp](https://unmatched.cards/umdb/decks/wyatt-earp)
- [Chupacabra](https://unmatched.cards/umdb/decks/chupacabra)
- [Muhammad Ali](https://unmatched.cards/umdb/decks/muhammad-ali)
- [Loki](https://unmatched.cards/umdb/decks/loki)
- [Leonardo](https://unmatched.cards/umdb/decks/leonardo)
- [Raphael](https://unmatched.cards/umdb/decks/raphael)
- [Rosie the Riveter](https://unmatched.cards/umdb/decks/rosie-the-riveter)
- [Shredder](https://unmatched.cards/umdb/decks/shredder)
- [Krang](https://unmatched.cards/umdb/decks/krang)
- [Donatello](https://unmatched.cards/umdb/decks/donatello)
- [Michelangelo](https://unmatched.cards/umdb/decks/michelangelo)
- [Pandora](https://unmatched.cards/umdb/decks/pandora)
- [Blackbeard](https://unmatched.cards/umdb/decks/blackbeard)
