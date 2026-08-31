/**
 * The Live2D runtime files this viewer loads — the one registry shared by
 * the server-side `onInstall` hook (`src/main.ts`) and the iframe runtime
 * loader (`src/render/runtime.ts`), so URLs, mirrors and pins never drift
 * between the two callers.
 *
 * Both files are Live2D proprietary-licensed (Live2D Proprietary Software
 * License Agreement) and can never ship in the plugin package: the
 * install-time hook fetches them once through the user-consented
 * `download` API into the plugin's own vault (`runtime/…`, sha256-pinned);
 * the viewer re-checks at runtime and re-fetches when the vault is empty.
 * Script order matters: `live2d.min.js` registers `PIXI.live2d` before
 * `live2dcubismcore.min.js` defines `Live2DCubismCore`.
 *
 * Each entry lists its URL(s): the primary plus, where a mirror is known
 * to serve byte-identical content, a fallback. Mirrors share the primary's
 * sha256 pin — the pin is content-addressed, so any host serving the same
 * bytes passes the same integrity check.
 */
export const LIVE2D_RUNTIME_FILES: readonly {
	readonly dest: string
	readonly urls: readonly string[]
	readonly sha256: string
}[] = [
	{
		dest: "runtime/live2d.min.js",
		urls: [
			"https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
			// jsDelivr's own Fastly edge — verified to serve the identical
			// bytes (matching sha256) for this pinned file.
			"https://fastly.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
		],
		sha256: "e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08",
	},
	{
		dest: "runtime/live2dcubismcore.min.js",
		urls: [
			"https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
		],
		sha256: "25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f",
	},
]

/** Consent-dialog rationale shared by the install hook and the runtime loader. */
export const LIVE2D_RUNTIME_REASON =
	"Live2D viewer runtime (Live2D Proprietary Software License)."
