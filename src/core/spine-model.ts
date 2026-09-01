import type { SpineScene } from "../shared"
import type { ExAtlasRef, ModelJsonDocument } from "./model-json"
import { dirname, type SpineDocument } from "./spine-format"

/**
 * Live2DViewerEX `type: 9` Spine descriptors. The descriptor names a
 * skeleton plus atlas refs whose logical page names (`tex_names`) do not
 * match archive file names; the renderer remaps pages through the
 * descriptor, so detection only needs to confirm the assets are present
 * and surface the version/names the JSON skeleton carries.
 */

/** True when a parsed descriptor is a Spine config the unified detector claims. */
export function isSpineExDocument(
	document: ModelJsonDocument | undefined,
): document is Extract<ModelJsonDocument, { readonly kind: "ex-spine" }> {
	return document !== undefined && document.kind === "ex-spine"
}

/** Resolve a filename against the descriptor's own directory. */
function resolveChild(directory: string, filename: string): string {
	if (directory === "") return filename
	return `${directory}/${filename}`
}

function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

/** The texture files referenced by every atlas, filtered to what exists. */
function collectAtlasTextures(
	atlases: readonly ExAtlasRef[],
	directory: string,
	files: readonly string[],
): readonly string[] {
	const textures = new Set<string>()
	for (const atlas of atlases) {
		for (const name of atlas.textures) {
			const resolved = resolveChild(directory, name)
			if (files.includes(resolved)) textures.add(resolved)
		}
	}
	// Some EX descriptors only list `tex_names` (the atlas page names) with
	// the textures implicit in the atlas file; nothing more can be asserted
	// here, so the atlas file itself gates renderability.
	return [...textures]
}

/**
 * Build one Spine EX scene from a parsed descriptor. `skeletonDocument` is
 * the version/name read from the skeleton payload (JSON only).
 */
export function buildSpineExScene(options: {
	readonly modelJson: string
	readonly document: Extract<ModelJsonDocument, { readonly kind: "ex-spine" }>
	readonly files: readonly string[]
	readonly skeletonDocument: SpineDocument | undefined
	readonly skeletonFiles: readonly string[]
}): SpineScene | undefined {
	const { modelJson, document, files, skeletonDocument, skeletonFiles } =
		options
	const directory = dirname(modelJson)
	const skeleton = resolveChild(directory, document.skeleton)
	if (!skeletonFiles.includes(skeleton)) return undefined

	const ref = document.atlases[0]
	if (ref === undefined) return undefined
	const atlas = resolveChild(directory, ref.atlas)
	if (!files.includes(atlas)) return undefined

	const textures = collectAtlasTextures(document.atlases, directory, files)
	if (textures.length === 0) return undefined

	const format = skeleton.endsWith(".json") ? "json" : "skel"
	return {
		engine: "spine",
		skeleton,
		atlas,
		textures,
		format,
		kind: "ex",
		version: skeletonDocument?.version?.raw,
		animations: skeletonDocument?.animations ?? [],
		skins: skeletonDocument?.skins ?? [],
		modelJson,
		label: document.label ?? basename(skeleton),
	}
}
