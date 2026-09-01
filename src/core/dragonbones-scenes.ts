import type { DragonBonesScene } from "../shared"
import {
	type DragonBonesDocument,
	isDragonBonesAtlasName,
	isDragonBonesSkeletonFileName,
	skeletonStem,
	textureForAtlas,
} from "./dragonbones-format"
import { dirname, isTextureName, naturalCompare } from "./spine-format"

/**
 * Group a resource's files into renderable standard-format DragonBones
 * scenes (official editor export: `*_ske.json` / `*_ske.dbbin` + `*_tex.json`
 * + `*_tex.png`). Grouping happens in the skeleton's directory first,
 * falling back to the whole resource. EX descriptors are handled separately
 * ({@link ./dragonbones-model}) and their skeletons are excluded via
 * `claimed`.
 */
export function groupDragonBonesScenes(options: {
	readonly files: readonly string[]
	readonly documents: ReadonlyMap<string, DragonBonesDocument | undefined>
	readonly atlasContents: ReadonlyMap<string, string | undefined>
	readonly claimed: ReadonlySet<string>
}): readonly DragonBonesScene[] {
	const { files, documents, atlasContents, claimed } = options
	const skeletons = files
		.filter(isDragonBonesSkeletonFileName)
		.filter((name) => documents.get(name) !== undefined && !claimed.has(name))
		.sort(naturalCompare)

	const scenes: DragonBonesScene[] = []
	for (const skeleton of skeletons) {
		const document = documents.get(skeleton)
		if (document === undefined) continue
		const directory = dirname(skeleton)
		const stem = skeletonStem(skeleton)
		const atlas = pickAtlas(files, directory, stem)
		if (atlas === undefined) continue
		const textures = textureForAtlas(
			atlas,
			atlasContents.get(atlas),
			files,
			directory,
		)
		if (textures.length === 0) continue
		const format = skeleton.endsWith(".json") ? "json" : "dbbin"
		scenes.push({
			engine: "dragonbones",
			skeleton,
			atlas,
			textures,
			format,
			kind: "standard",
			version: document.version?.raw,
			armatures: document.armatures,
			animations: document.animations,
			skins: document.skins,
			label: skeletonStem(skeleton),
		})
	}
	return scenes
}

function pickAtlas(
	files: readonly string[],
	directory: string,
	stem: string,
): string | undefined {
	const sameStem = `${stem}_tex.json`
	const local =
		sameStem !== ""
			? `${directory === "" ? sameStem : `${directory}/${sameStem}`}`
			: ""
	if (local !== "" && files.includes(local)) return local

	const directoryAtlases = files
		.filter(
			(name) => isDragonBonesAtlasName(name) && dirname(name) === directory,
		)
		.sort(naturalCompare)
	if (directoryAtlases[0] !== undefined) return directoryAtlases[0]

	return files.filter(isDragonBonesAtlasName).sort(naturalCompare)[0]
}

/** Every texture page name in the resource (used to gate renderability). */
export function collectDragonBonesTextures(
	files: readonly string[],
	directory: string,
): readonly string[] {
	const local = files
		.filter((name) => isTextureName(name) && dirname(name) === directory)
		.sort(naturalCompare)
	if (local.length > 0) return local
	return files.filter(isTextureName).sort(naturalCompare)
}
