import type { ImageVariantSpec } from "@hoardodile/sdk-web"

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
 * the lossy re-encode rather than shrinking dimensions.
 */
export function textureVariant(
	webp: boolean,
	quality?: number,
): ImageVariantSpec | undefined {
	if (!webp) return undefined
	const spec: ImageVariantSpec = { format: "webp", fit: "exact" }
	return quality === undefined ? spec : { ...spec, quality }
}
