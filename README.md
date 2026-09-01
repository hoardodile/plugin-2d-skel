# @hoardodile/plugin-2d-skel

Live2D, Spine and DragonBones animation viewer for hoardodile. One
engine-agnostic viewer that renders, from a single resource, animated
characters in all three formats:

- **Live2D** — official Cubism `*.model3.json` models and Live2DViewerEX
  configs (`model0.json` + `.moc3`/`.moc`, multi-variant): motion groups,
  expressions, EX dialogue/choice menus, sound, hit areas, model variants.
- **Spine** — direct `.json`/`.skel` + `.atlas` exports and Live2DViewerEX
  `type: 9` configs (`model0.json` + `skeleton_N` + `atlases_*`): animation
  /skin/overlay selection, EX hit-testing, dialogue, sound, model variants.
- **DragonBones** — direct `*_ske.json`/`*_dbbin` + `*_tex.json` atlas
  exports and Live2DViewerEX `type: 10` configs: animation, armature, skin
  selection and model variants.

The viewer dispatches on each scene's `engine` through a type-safe adapter
(the shared chrome — scene selector, transport, dialogue, status — is
written once; engine-specific controls live behind per-engine components).

## Dev loop

This plugin is developed entirely through the plugin toolchain — no
hoardodile server, no web app:

```bash
pnpm build          # bundle manifest + client + server hooks into dist/
pnpm dev            # watch-build and serve the workbench (http://127.0.0.1:5199), defaulting to the real renderable testdata-real/
pnpm dev:fixtures   # same, but against the synthetic testdata/ (detection fixtures)
pnpm detect:smoke   # run detect against testdata/ through the real sandbox
pnpm test           # vitest
pnpm testdata       # regenerate synthetic fixtures
```

`pnpm dev` captures the server-side hook results (`detect`, `sourceMeta`,
`searchMeta`, `listFiles`) from the real worker sandbox and feeds them to
the workbench, so the iframe receives the same context the app would push.
By default it serves the real renderable models in `testdata-real/`; use
`pnpm dev:fixtures` to iterate against the synthetic detection fixtures.

## Real test data

`pnpm install` fetches a real renderable model into the gitignored
`testdata-real/` folder (Arch-chan — CC0 1.0, shipped as a Live2D export;
source commit and sha256 pins live in
`scripts/fetch-testdata-real.mjs`). `pnpm dev` uses these by default so a
model renders on open. `pnpm testdata:real` re-fetches it (`--force`).

## Runtime downloads

The viewer loads two proprietary Live2D SDK files — `live2dcubismcore.min.js`
(Live2D Cubism Core, "Redistributable Code" under the
[Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html))
and `live2d.min.js` (Live2D WebGL 2.1 SDK, mirrored at
`cdn.jsdelivr.net/gh/dylanNew/live2d/…`). They are **never shipped in the
plugin package**: the manifest declares the `download` permission and the
first model open fetches both through one batched `download([…])` call —
the host shows a single shared consent dialog listing both URLs, the
bytes are sha256-pinned, and they land in the plugin's own `vault/`
(`runtime/…`, synced with the library, kept across updates, deleted on
uninstall). Later opens answer `cached` with no dialog and no network.

The workbench (`pnpm dev`) runs the same flow with its own consent
dialog, so the viewer behaves identically under development. Declining
the download shows a message with a retry button; environments without a
consent channel (CLI, read-only archives) show an "unavailable" message.

## SDK packages

`@hoardodile/*` dependencies resolve from the npm registry (`^0.1.8`):
`pnpm install` pulls the published SDK directly — no tarballs, no
`pnpm-workspace.yaml` overrides.

## Licensing and trademarks

- The plugin itself is MIT licensed (see `LICENSE`). It is not affiliated
  with, or endorsed by, Live2D Inc.
- The Live2D runtime files are **not** shipped in the plugin package; the
  viewer fetches them on first open through the user-consented download
  API and they remain covered by the
  [Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).
  `live2d.min.js` is taken from a third-party mirror
  (`cdn.jsdelivr.net/gh/dylanNew/live2d`) — the consent dialog shows the
  URLs verbatim and the bytes are sha256-pinned.
- "Live2D" is a trademark of Live2D Inc. Spine runtimes are redistributed
  under the Spine Runtimes License Agreement (see
  `public/vendor/licenses/` and the generated
  `public/THIRD-PARTY-NOTICES.txt`).

## Requirements

- hoardodile **≥ 0.1.8** — the built-in plugin marketplace
  (**Settings → Marketplace**) and the batched asset-download API
  (`download([…])`) when the manifest declares `"download": true`.
  The marketplace's Readme and Release notes tabs and release readme
  assets are read by newer builds; older builds still list and install
  the plugin normally.
- `"minAppVersion"` in `manifest.json` declares the lowest hoardodile
  release this plugin runs on. Hosts below it refuse to install or update
  the plugin (the marketplace gates the install/update entries and zip
  uploads are blocked with an explanation), so bump it only when the
  plugin really needs a newer app. Omit it for plugins that support every
  release.
- This plugin's version is independent of the hoardodile release
  version; bump it on user-visible changes.
- Dev loop: Node ≥ 24, pnpm 11.

## Deploying

Publish to the marketplace with one command:

```bash
# 1. Add the repository address to your registry repo's registry.json:
#    { "version": 1, "plugins": ["https://github.com/<owner>/<repo>"] }

# 2. One-click release — release-it bumps the version in package.json AND
#    manifest.json, writes CHANGELOG.md from Conventional Commits, commits,
#    tags `v<version>` and pushes. The tag-triggered `.github/workflows/
#    release.yml` then builds, packages (`release/<id>-<version>.zip` +
#    `.sha256`) and publishes the GitHub release. No local `gh` CLI or token.
pnpm release <version>
```

On `main`, with a clean working tree. The tag must match the manifest version
(`v<manifest.version>`) — the workflow fails otherwise. Then paste the registry
repo address once in **Settings → Marketplace**. The app reads the registry,
each plugin's manifest and its latest release — names, versions, permissions and
release notes come straight from GitHub, so the list never needs editing again.
The zip asset is `<id>-<version>.zip` (produced by `hoardodile plugin package`);
before the first release the plugin shows up with a "no release" state.

Prefer pushing a tag manually (no release-it)? It still works — the workflow
does the same build/package/publish:

```bash
git tag v<version> && git push origin v<version>
```

Local installs (zip upload in **Settings → Plugins**) still work for
private packages.

## Publishing a readme

The marketplace detail view shows a per-release **Readme** tab. Ship the
readme markdown in the **`readme/` folder** as a bare **`README.md`**
fallback, plus one `README.<locale>.md` file per extra language (e.g.
`readme/README.md`, `readme/README.zh.md`) — `release.yml` uploads the whole
folder alongside the zip, so **each release carries its own readme** and
every version shows independent notes.
`README.md` is the fallback the app shows for any language without a
specific file, so English normally lives there and you do **not** need a
`README.en.md`. Use the app's supported language codes for the extra files
(`zh`, `ja`, `de`, `es`).
