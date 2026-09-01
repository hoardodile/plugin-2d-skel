import type { EngineFile, EngineScene, Live2dScene } from "../shared"
import type { ModelJsonDocument } from "./model-json"

/**
 * Group a resource's files into loadable Live2D scenes. Spine and
 * DragonBones configs are deliberately handled by the spine path — this
 * module only groups the Live2D descriptors.
 */
export function groupLive2dScenes(options: {
	readonly files: readonly string[]
	readonly documents: ReadonlyMap<string, ModelJsonDocument | undefined>
}): readonly Live2dScene[] {
	const { files, documents } = options
	const modelJsons = files.filter((name) => documents.get(name) !== undefined)

	const scenes: Live2dScene[] = []
	for (const modelJson of modelJsons) {
		const document = documents.get(modelJson)
		if (
			document === undefined ||
			(document.kind !== "cubism" &&
				document.kind !== "ex-cubism" &&
				document.kind !== "ex-live2d")
		) {
			continue
		}
		const directory = dirname(modelJson)
		const moc = resolveChild(directory, document.moc)
		if (!files.includes(moc)) continue
		const textures = document.textures
			.map((name) => resolveChild(directory, name))
			.filter((name) => files.includes(name))
		if (textures.length === 0) continue
		scenes.push({
			engine: "live2d",
			modelJson,
			kind: document.kind === "cubism" ? "cubism" : "ex",
			label: document.label ?? basename(modelJson),
			moc,
			textures,
			motionGroups: document.motionGroups,
			expressions: document.expressions,
			version:
				"version" in document && document.version !== undefined
					? String(document.version)
					: undefined,
		})
	}
	return scenes
}

function dirname(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? "" : filename.slice(0, slash)
}

function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

function resolveChild(directory: string, filename: string): string {
	if (directory === "") return filename
	return `${directory}/${filename}`
}

/**
 * Flatten both engines' scenes into the flat sidecar shape the host
 * serializes, using a single running scene index across the whole list.
 */
export function serializeEngineScenes(
	scenes: readonly EngineScene[],
): readonly EngineFile[] {
	const rows: EngineFile[] = []
	for (const [index, scene] of scenes.entries()) {
		if (scene.engine === "live2d") {
			rows.push({
				filename: scene.modelJson,
				role: "model",
				scene: index,
				kind: scene.kind,
				label: scene.label,
				engine: "live2d",
			})
			rows.push({
				filename: scene.moc,
				role: "moc",
				scene: index,
				engine: "live2d",
			})
			for (const texture of scene.textures) {
				rows.push({
					filename: texture,
					role: "texture",
					scene: index,
					engine: "live2d",
				})
			}
			continue
		}

		if (scene.modelJson !== undefined) {
			rows.push({
				filename: scene.modelJson,
				role: "model",
				scene: index,
				kind: scene.kind === "ex" ? "ex" : scene.kind,
				label: scene.label ?? scene.skeleton,
				engine: scene.engine,
			})
		}
		rows.push({
			filename: scene.skeleton,
			role: "skeleton",
			scene: index,
			format: scene.format,
			version: scene.version,
			engine: scene.engine,
		})
		if (scene.atlas !== undefined) {
			rows.push({
				filename: scene.atlas,
				role: "atlas",
				scene: index,
				engine: scene.engine,
			})
		}
		for (const texture of scene.textures) {
			rows.push({
				filename: texture,
				role: "texture",
				scene: index,
				engine: scene.engine,
			})
		}
	}
	return rows
}
