# Artwork and browser identity

Deliver a hero portrait/board miniature, a distinct figure for the ally type when present, and artwork for every card design. Repeated allies share artwork and receive numbered labels from the board. Rules and artwork registration are separate.

## Existing visual system

Preserve the parchment, muted fantasy palette and original cut-paper SVG style. Reuse the existing renderer and layouts. Read these files before drawing:

- `apps/client/src/characters/art.ts`: figures assembled from explicit paths; `figureSvg(id, seatColor)` is used by both React portraits and Pixi miniatures.
- `apps/client/src/board/figures.ts`: pedestal, owner color and board scale.
- `apps/client/src/cards/art.ts`: local 320×200 card scenes and variant composition.
- `apps/client/src/characters/profiles.ts`: browser flavor/identity, separate from engine rules.
- `apps/client/src/characters/marks.ts`: reusable confirmed ability cues.

Add a recognizable silhouette keyed by the hero ID and another keyed by `ally.id`. The figure viewBox is `-78 -158 156 168`; feet sit near y=0 and the figure should fit within it. Use simple filled paths/strokes supported by Pixi's SVG renderer. Include the supplied seat color as a visible garment, shield or collar detail so repeated characters remain distinguishable by owner. Check all four owner colors. Reusing the Warden fallback is not completed artwork.

`illustratedCharacters` currently derives from artwork keys while excluding Wolf. When adding another ally, update that derivation so it excludes **all** ally-only figures and still lists every playable hero. Add `profiles[heroId]` with `role`, `summary`, `tactic`, `accent`, `ground`; roster/picker code requires this entry. Add appropriate reusable marks for the hero and ally IDs. A new symbol is optional if an existing one communicates the ability clearly.

## Cards

Each bundle supplies a `palette` of six-digit hex colors: `ground`, `ink`, `accent`. Every card needs `art.scene`, even when providing an image. Existing scenes are `shield`, `blade`, `bastion`, `lantern`, `trail`, `fire`, `embers`, `ward`, `bolt`, `map`; `variant` is an integer 0–6. Pick scenes by subject and vary compositions rather than assigning every card the same image.

For a custom illustration, save a trusted static asset under `apps/client/public/cards/<character-id>/` and reference its local URL:

```json
"art": {
  "scene": "blade",
  "variant": 2,
  "image": "/cards/trail-captain/clear-shot.webp"
}
```

Accepted image paths are local absolute paths containing letters, digits, `/`, `_`, `-`, ending in `.svg`, `.webp`, `.png` or `.jpg`. Remote URLs, spaces and `..` segments do not pass bundle validation. Render card illustrations at 8:5 composition; keep text in the card UI rather than baking card rules into the image. Verify gallery, hand crop and inspector rather than only the original asset.

Prefer code-native SVGs for assets matching the existing vector system. If raster illustrations are useful and an image generation tool is available, use it for original imagery, then save the resulting files locally and record provenance. Inspect generated assets before integrating them. Do not claim generated artwork exists when a tool or asset is unavailable.

Use source card images to understand subjects/composition. By default create original illustrations; do not assume a public page gives redistribution permission for its published art. Use user-provided or licensed assets according to the user's instructions and record the origin/license when known. Keep third-party SVGs from introducing scripts, handlers, external references or unsupported rendering features.

Import notes should identify whether each asset is original vector art, generated imagery, user-provided, or reused under a known license, with paths and source links as applicable. No remote hotlinks in the delivered character.
