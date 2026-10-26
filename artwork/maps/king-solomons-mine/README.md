# King Solomon's Mine scenery

Original cinematic illustrated raster scenery generated with integrated Codex Imagegen. This replaces only the decorative SVG background: the graph, coordinates, zones, portals, controls and fighter rendering keep their existing owners.

`masters/scenery.png` is the intact selected output. `references/` contains renders of the repository's previous scenery and playable overlay used to preserve geography. Exact instructions and attribution are in `prompts.json` and `provenance.json`. No external reference images were used.

Prepare the checked-in runtime assets with:

```sh
pnpm artwork:prepare --map king-solomons-mine
```

This extends the same Sharp pipeline and typed client manifest used for character artwork. Maps live under `artwork/maps/<id>/`; `sources.json` records `kind: "map"` and the exact presentation `canvas`. Register the asset ID in `mapArtwork` in `apps/client/src/artwork/assets.ts`.

The processor creates variants at half, full and one-and-a-half canvas width when supported by the master, without enlargement. A map's master must match the canvas aspect ratio within 0.5%; the processor normalizes this small generation discrepancy without cropping. This master supplies 950×390 and 1900×780 WebP files (142,598 and 499,090 bytes). Only the hashed derivatives in `apps/client/public/artwork/maps/` are served; masters, references and prompts stay outside the public directory.

`MapScenery` uses the existing responsive `ArtworkImage` component under the vector `Terrain`. It loads eagerly, follows the same arena bounds, and adds no Pixi texture. Existing vector scenery stays underneath for missing registrations, pending loads and failed requests. A dark stroke keeps zone abbreviations readable on textured ground. There is no map-specific renderer branch or generation at build/play time.

Verify registration, files, dimensions, hashes and no enlargement with `apps/client/src/artwork/maps.test.ts`. `tests/e2e/map-readability.spec.ts` checks the real desktop, portrait-phone and landscape-phone board, with and without WebGL, unchanged marker positions and link counts, portal/movement interactions, responsive selection and raster failure recovery.
