import type { DragonBonesScene } from "../shared"
import type { DragonBonesDocument } from "./dragonbones-format"
import type { ExAtlasRef, ModelJsonDocument } from "./model-json"
import { dirname, basename as spineBasename } from "./spine-format"

/**
 * Live2DViewerEX `type: 10` DragonBones descriptors. The descriptor names a
 * skeleton (JSON or DBBT binary) plus atlas refs whose page names do not
 * match archive file names; the renderer remaps pages by passing the real
 * texture to `parseTextureAtlasData`, so detection only needs to confirm
 * the assets are present and surface the version/name tables the skeleton
 * carries.
 */

/** True when a parsed descriptor is a DragonBones config we claim. */
export function isDragonBonesExDocument(
	document: ModelJsonDocument | undefined,
): document is Extract<ModelJsonDocument, { readonly kind: "ex-dragonbones" }> {
	return document !== undefined && document.kind === "ex-dragonbones"
}

/** Resolve a filename against the descriptor's own directory. */
function resolveChild(directory: string, filename: string): string {
	if (directory === "") return filename
	return `${directory}/${filename}`
}

function basename(filename: string): string {
	return spineBasename(filename)
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
	return [...textures]
}

/**
 * Build one DragonBones EX scene from a parsed descriptor. `skeletonDocument`
 * is the version/name table read from the skeleton payload (JSON or DBBT).
 */
export function buildDragonBonesExScene(options: {
	readonly modelJson: string
	readonly document: Extract<
		ModelJsonDocument,
		{ readonly kind: "ex-dragonbones" }
	>
	readonly files: readonly string[]
	readonly skeletonDocument: DragonBonesDocument | undefined
}): DragonBonesScene | undefined {
	const { modelJson, document, files, skeletonDocument } = options
	const directory = dirname(modelJson)
	const skeleton = resolveChild(directory, document.skeleton)
	if (!files.includes(skeleton)) return undefined

	const ref = document.atlases[0]
	if (ref === undefined) return undefined
	const atlas = resolveChild(directory, ref.atlas)
	if (!files.includes(atlas)) return undefined

	const textures = collectAtlasTextures(document.atlases, directory, files)
	if (textures.length === 0) return undefined

	const format = skeleton.endsWith(".json") ? "json" : "dbbin"
	return {
		engine: "dragonbones",
		skeleton,
		atlas,
		textures,
		format,
		kind: "ex",
		version: skeletonDocument?.version?.raw,
		armatures: skeletonDocument?.armatures ?? [],
		animations: skeletonDocument?.animations ?? [],
		skins: skeletonDocument?.skins ?? [],
		modelJson,
		label: document.label ?? basename(skeleton),
	}
}
