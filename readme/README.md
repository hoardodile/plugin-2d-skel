# 2D Skeleton Animation

A Live2D, Spine and DragonBones animation viewer for hoardodile. One
engine-agnostic viewer renders, from a single resource, animated characters
in all three formats:

- **Live2D** — official Cubism `*.model3.json` models and Live2DViewerEX
  configs (`model0.json` + `.moc3`/`.moc`, multi-variant): motion groups,
  expressions, EX dialogue/choice menus, sound, hit areas, model variants.
- **Spine** — direct `.json`/`.skel` + `.atlas` exports and Live2DViewerEX
  `type: 9` configs (`model0.json` + `skeleton_N` + `atlases_*`):
  animation/skin/overlay selection, EX hit-testing, dialogue, sound, model
  variants.
- **DragonBones** — direct `*_ske.json`/`*_dbbin` + `*_tex.json` atlas
  exports and Live2DViewerEX `type: 10` configs: animation, armature, skin
  selection and model variants.

The viewer dispatches on each scene's `engine` through a type-safe adapter.
The shared chrome — scene selector, transport, dialogue, status — is written
once; engine-specific controls live behind per-engine components.

## Features

- Detection for Cubism + Live2DViewerEX, Spine (direct + EX) and
  DragonBones (direct + EX); motion groups, expressions, EX
  dialogue/choice menus, sounds, hit areas and model variants per engine.
- Transparent/checker background, loop, interact, screenshot, fullscreen.
- The proprietary Live2D runtimes are **not shipped** — the first Live2D
  model open fetches them through one batched, user-consented download
  (sha256-pinned, stored in the plugin's own vault). Spine and DragonBones
  use bundled runtimes.
- Resources are filterable by model family (Cubism / Standard / EX /
  DragonBones) in the library search filters.

## Requirements

- hoardodile ≥ 0.1.6 (see the repository README for details).
- Trust the repository before installing — plugin code runs server-side in a
  restricted sandbox.
