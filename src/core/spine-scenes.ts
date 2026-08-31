import type { EngineFile, SpineScene } from "../shared"
import {
	basename,
	dirname,
	isAtlasName,
	isTextureName,
	naturalCompare,
	type SpineDocument,
} from "./spine-format"

/**
 * Group a resource's files into renderable Spine scenes. A scene is a
 * skeleton plus the atlas/texture files around it; grouping happens in
 * the skeleton's directory first, falling back to the whole resource.
 */
export function groupSpineScenes(
	files: readonly string[],
	documents: ReadonlyMap<string, SpineDocument | undefined>,
): readonly SpineScene[] {
	const skeletons = files
		.filter((name) => documents.get(name) !== undefined)
		.sort(naturalCompare)

	const scenes: SpineScene[] = []
	for (const skeleton of skeletons) {
		const document = documents.get(skeleton)
		if (document === undefined) continue
		const format = skeleton.endsWith(".skel") ? "skel" : "json"
		const directory = dirname(skeleton)
		scenes.push({
			engine: "spine",
			skeleton,
			atlas: pickAtlas(files, skeleton, directory),
			textures: pickTextures(files, directory),
			format,
			kind: "standard",
			version: document.version?.raw,
			animations: document.animations,
			skins: document.skins,
			label: basename(skeleton),
		})
	}
	return scenes.filter(isRenderable)
}

/** A scene is only claimable when the player has pixels to draw. */
function isRenderable(scene: SpineScene): boolean {
	return scene.atlas !== undefined && scene.textures.length > 0
}

function pickAtlas(
	files: readonly string[],
	skeleton: string,
	directory: string,
): string | undefined {
	const sameBase = files.find(
		(name) =>
			isAtlasName(name) &&
			dirname(name) === directory &&
			basename(name) === basename(skeleton),
	)
	if (sameBase !== undefined) return sameBase

	const directoryAtlases = files
		.filter((name) => isAtlasName(name) && dirname(name) === directory)
		.sort(naturalCompare)
	if (directoryAtlases[0] !== undefined) return directoryAtlases[0]

	return files.filter(isAtlasName).sort(naturalCompare)[0]
}

function pickTextures(
	files: readonly string[],
	directory: string,
): readonly string[] {
	const local = files
		.filter((name) => isTextureName(name) && dirname(name) === directory)
		.sort(naturalCompare)
	if (local.length > 0) return local
	return files.filter(isTextureName).sort(naturalCompare)
}

/** Flatten scenes into the flat sidecar shape the host serializes. */
export function serializeSpineScenes(
	scenes: readonly SpineScene[],
): readonly EngineFile[] {
	const rows: EngineFile[] = []
	for (const [index, scene] of scenes.entries()) {
		if (scene.modelJson !== undefined) {
			rows.push({
				filename: scene.modelJson,
				role: "model",
				scene: index,
				kind: scene.kind === "ex" ? "ex" : undefined,
				label: scene.label ?? scene.skeleton,
			})
		}
		rows.push({
			filename: scene.skeleton,
			role: "skeleton",
			scene: index,
			format: scene.format,
			version: scene.version,
		})
		if (scene.atlas !== undefined) {
			rows.push({ filename: scene.atlas, role: "atlas", scene: index })
		}
		for (const texture of scene.textures) {
			rows.push({ filename: texture, role: "texture", scene: index })
		}
	}
	return rows
}
