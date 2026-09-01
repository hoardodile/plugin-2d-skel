/**
 * Cover capture for the animation viewer.
 *
 * The viewer can capture a PNG of the current model frame and set it as the
 * resource cover. The crop UI is handled by the shared `@hoardodile/ui`
 * `ImageCropper`; this module only owns the cover-write boundary, which is
 * the host SDK's `api.uploadCover({ file, filename })` (client SDK, ≥0.1.6) —
 * the host performs the credentialed `PUT /api/resources/:id/cover` on the
 * plugin's behalf and invalidates the resource caches so the new cover
 * renders.
 */

/** The payload handed to the cover-write interface. */
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

/** The raw-image upload the host client SDK exposes (`api.uploadCover`). */
export type CoverUpload = (input: {
	readonly file: Blob | ArrayBuffer
	readonly filename: string
	readonly mimeType?: string
}) => Promise<{ readonly path: string }>

const PNG_DATA_URL_PREFIX = "data:image/png;base64,"

/**
 * Decode a `data:image/png;base64,…` data URL into its raw PNG bytes.
 * Returns `undefined` when the URL is missing the expected PNG data-URL
 * prefix or its base64 payload is malformed.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> | undefined {
	if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return undefined
	const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length)
	try {
		const binary = atob(payload)
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i)
		}
		return bytes
	} catch {
		return undefined
	}
}

/**
 * Upload the cropped PNG as the resource cover. The host SDK's
 * `uploadCover` receives the raw bytes plus a filename whose extension
 * drives the server's cover type check (PNG here), returns the cover path
 * on success, and invalidates the resource caches so the card re-renders
 * the new cover.
 */
export async function setResourceCover(
	crop: CoverCrop,
	upload: CoverUpload,
	log?: (message: string, data?: Record<string, unknown>) => void,
): Promise<CoverResult> {
	const bytes = dataUrlToBytes(crop.dataUrl)
	if (bytes === undefined) {
		log?.("setResourceCover: bad data URL", {
			sceneIndex: crop.sceneIndex,
			dataUrlLength: crop.dataUrl.length,
		})
		return { ok: false, reason: "bad-data-url" }
	}
	try {
		await upload({
			file: new Blob([bytes], { type: "image/png" }),
			filename: "cover.png",
			mimeType: "image/png",
		})
		return { ok: true }
	} catch (reason) {
		log?.("setResourceCover: cover upload failed", {
			sceneIndex: crop.sceneIndex,
			dataUrlLength: crop.dataUrl.length,
			reason: reason instanceof Error ? reason.message : String(reason),
		})
		return { ok: false, reason: "upload-failed" }
	}
}
