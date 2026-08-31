/**
 * Cover capture for the animation viewer.
 *
 * The viewer can capture a PNG of the current model frame and set it as the
 * resource cover. The crop UI is handled by the shared `@hoardodile/ui`
 * `ImageCropper`; this module only holds the **reserved** cover-write
 * boundary, because the hoardodile host SDK (0.1.2) does not yet expose a
 * cover setter on the plugin client API (`@hoardodile/sdk-web` has no
 * `setCover`/cover-write request).
 */

/** The payload handed to the reserved cover-write interface. */
export type CoverCrop = {
	/** The cropped PNG data URL to persist as the resource cover. */
	readonly dataUrl: string
	/** The scene (model) the crop was captured from, for context. */
	readonly sceneIndex: number
}

export type CoverResult = {
	readonly ok: boolean
	readonly reason?: string
}

/**
 * RESERVED — the host SDK has no cover-write interface yet.
 *
 * TODO(user): when `@hoardodile/sdk-web` ships a way to set a resource
 * cover (e.g. a `setCover` request on the plugin host bridge), replace the
 * body below with that call. Until then this is a safe no-op that reports
 * `{ ok: false, reason: "api-unavailable" }` so the crop dialog can show
 * honest feedback instead of a silent failure.
 */
export async function setResourceCover(
	crop: CoverCrop,
	log?: (message: string, data?: Record<string, unknown>) => void,
): Promise<CoverResult> {
	const warn = log ?? console.warn
	warn("setResourceCover: reserved — host cover API not yet available", {
		sceneIndex: crop.sceneIndex,
		dataUrlLength: crop.dataUrl.length,
	})
	return { ok: false, reason: "api-unavailable" }
}
