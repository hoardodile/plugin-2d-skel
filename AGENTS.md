# hoardodile plugin-2d-skel

2D skeleton content plugin: `detect` → `sourceMeta` → iframe render. Serves Live2D (Cubism Standard/EX), Spine (multiple runtimes) and DragonBones model folders as an interactive animation viewer with engine tabs, hit areas, sound and cover cropping.

## Commands

- `pnpm build` — generate third-party notices, then build `dist/` (client + server bundle + manifest).
- `pnpm dev` — generate notices, then watch-build + serve the workbench at http://127.0.0.1:5199 (data from `testdata/`).
- `pnpm test` — Vitest against the in-memory fixture API; `pnpm run detect:smoke` — sandboxed `detect` against `testdata/` (needs a build first).
- `pnpm notices` / `pnpm notices:check` — generate / verify `public/THIRD-PARTY-NOTICES.txt` + `public/LICENSE` from the bundled engine runtimes.
- `pnpm testdata` — generate synthetic `testdata/`; `pnpm testdata:real` — fetch real model samples into the gitignored `testdata-real/`.
- `pnpm lint` — `biome check .` + `tsc --noEmit`; `pnpm format` — `biome check --write`; `pnpm lint-staged` — the pre-commit biome pass.
- `hoardodile plugin <run|package|dev>` — run hooks through the same worker sandbox the server uses (`run`), zip `dist/` into `release/<id>-<version>.zip` (`package`), or the offline dev workbench (`dev`).
- `pnpm run detect:real` / `detect:real2` — sandboxed `detect` against local real-resource dirs.
- `pnpm readme:check` — gate the marketplace `readme/` folder (flat, ships one `README.md` fallback per locale). `pnpm release <version>` — release-it bumps version, writes `CHANGELOG.md`, tags `v<version>`, and the tag workflow builds/packages/uploads the GitHub release assets.

Git hooks (`lefthook.yml`, installed by `postinstall` when this is a git repo): `commit-msg` enforces the Conventional Commits format that feeds the changelog; `pre-commit` runs biome + `tsc` on staged files.

## Structure

```
src/main.ts               server-side definition (definePlugin): detect + sourceMeta + searchMeta
src/shared.ts             PluginSchema typed once, shared server ↔ client
src/render/hooks.ts       typed plugin API (definePluginAPI) for the client
src/render/EngineViewer.tsx  iframe client (createPluginRoot @hoardodile/sdk-react)
src/core/                 atlas/model-json/spine-format/spine-scenes/dragonbones-* format detection
src/render/               engine hosts (Live2dHost/SpineHost/DragonBonesHost), player hooks, hit areas
public/                   vendored engine runtimes + generated third-party notices
testdata/                 default data root for `hoardodile plugin dev` + detect:smoke
src/__tests__/            unit tests
```

## Architecture

- **Contract:** `manifest.json` + server `main.js` (`definePlugin`) + sandboxed iframe client. `manifest.ui.card`/`.search`/`.message` declare host-rendered `{{...}}` templates; the CLI lints them at build time.
- **Resources as folders:** the plugin reads a directory of model files via `listFileNames` + `readFile` (range reads) and resolves asset URLs through the single `resolveFileUrl`. No archive-container addressing.
- **SDK closure:** plugin code may import only `@hoardodile/{i18n,ui,sdk-*}`; terminal packages (`cli`, `host`, `host-web`, `workbench`) are never imported by a plugin.

## Testing

Vitest unit tests use `createResourceAPIFixture` (in-memory); the sandboxed path is exercised via `hoardodile plugin run detect testdata --plugin-dir dist` — the exact production execution path.
