import type { ImageVariantSpec } from "@hoardodile/sdk-web"

/**
 * Textures the host would only re-encode to the same format: a WebP source
 * asked for as WebP gains nothing and pays a second lossy pass, which shows
 * up as extra blocking along an atlas's region seams.
 */
const PREENCODED_TEXTURE_EXTENSION = /\.(webp|avif)$/i

/**
 * Map the viewer's "WebP textures" toggle onto the host image-variant
 * spec used when resolving model texture URLs. OFF resolves the original
 * bytes; ON asks the host to transcode the texture to lossy WebP at the
 * source's exact pixel dimensions.
 *
 * `fit: "exact"` is mandatory for model textures: Live2D, Spine and
 * DragonBones map mesh/atlas UV coordinates onto texture pixels, so any
 * downscale (`fit: "inside"` + `maxArea`) would misalign them. The host
 * pipeline honours `fit: "exact"` by encoding the source pixels verbatim
 * (no resize) while still re-encoding to WebP, so the size win comes from
 * the lossy re-encode rather than shrinking dimensions. `exact` also tells
 * the encoder to keep the source RGB under fully transparent pixels — an
 * atlas keeps its edge bleed there, and losing it makes the mesh seams
 * blocky.
 */
export function textureVariant(
	webp: boolean,
	quality?: number,
): ImageVariantSpec | undefined {
	if (!webp) return undefined
	const spec: ImageVariantSpec = { format: "webp", fit: "exact" }
	return quality === undefined ? spec : { ...spec, quality }
}

/** True when the file is already a texture format the variant would produce. */
export function isPreencodedTexture(filename: string): boolean {
	return PREENCODED_TEXTURE_EXTENSION.test(filename.split(/[?#]/, 1)[0] ?? "")
}

/**
 * The variant to request for one texture file: `undefined` when the file is
 * already WebP/AVIF, so enabling the toggle never double-compresses a model
 * that shipped as WebP (the original bytes are strictly better).
 */
export function textureVariantFor(
	filename: string,
	variant: ImageVariantSpec | undefined,
): ImageVariantSpec | undefined {
	if (variant === undefined) return undefined
	return isPreencodedTexture(filename) ? undefined : variant
}
