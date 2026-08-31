import { PLUGIN_IMAGE_PROBE_CONCURRENCY } from "@hoardodile/sdk-types/plugin"
import { SEARCH_META_VERSION } from "@hoardodile/sdk-types/resource"

import {
	type Detection,
	definePlugin,
	type ResourceAPI,
} from "@hoardodile/sdk-server"
import { mapConcurrent } from "@hoardodile/sdk-server/helpers"
import { groupLive2dScenes, serializeEngineScenes } from "./core/files.ts"
import {
	isModelJsonName,
	type ModelJsonDocument,
	parseModelJson,
} from "./core/model-json.ts"
import {
	isSkeletonName,
	readBinarySpineDocument,
	readJsonSpineHeader,
	readSpineDocument,
	type SpineDocument,
	dirname,
} from "./core/spine-format.ts"
import { groupSpineScenes } from "./core/spine-scenes.ts"
import { buildSpineExScene, isSpineExDocument } from "./core/spine-model.ts"
import {
	groupDragonBonesScenes,
} from "./core/dragonbones-scenes.ts"
import {
	buildDragonBonesExScene,
	isDragonBonesExDocument,
} from "./core/dragonbones-model.ts"
import {
	isDragonBonesAtlasName,
	isDragonBonesSkeletonFileName,
	readDragonBonesDocument,
	type DragonBonesDocument,
} from "./core/dragonbones-format.ts"
import {
	LIVE2D_RUNTIME_FILES,
	LIVE2D_RUNTIME_REASON,
} from "./runtime-assets.ts"
import type {
	DragonBonesScene,
	EngineScene,
	EngineSchema,
	SpineScene,
} from "./shared"

export default definePlugin<EngineSchema>({
	detect,
	sourceMeta,
	searchMeta,
	listFiles,
	onInstall,
})

/** The resource shape non-detect hooks read: fresh or from the session. */
async function scenesOf(
	api: ResourceAPI<EngineSchema>,
): Promise<readonly EngineScene[]> {
	const fromContext = api.context.detect
	if (fromContext !== undefined) return fromContext.scenes
	return scanScenes(api)
}

/**
 * One pass that routes each file to the scanner for its engine. A model
 * descriptor is parsed once and dispatched on its parsed kind, so a
 * `type:9` Spine config and a Cubism `model0.json` can never both claim
 * the same file.
 */
async function scanScenes(
	api: ResourceAPI<EngineSchema>,
): Promise<readonly EngineScene[]> {
	const files = await api.listFileNames()

	// 1. Parse every candidate model descriptor once (small, gate the whole
	//    resource; motion/physics files are skipped by name).
	const descriptors = files.filter(isModelJsonName)
	const documents = new Map<string, ModelJsonDocument | undefined>()
	await mapConcurrent(
		descriptors,
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			const bytes = await api.readFile(filename)
			documents.set(
				filename,
				parseModelJson(new TextDecoder().decode(bytes), filename),
			)
		},
	)

	// 2. Live2D scenes (official Cubism + EX Cubism + EX `.moc`).
	const live2dScenes = groupLive2dScenes({ files, documents })

	// 3. Live2DViewerEX `type:9` Spine scenes.
	const spineExScenes = await scanSpineExScenes(api, files, documents)

	// 4. Direct Spine exports — skeletons not claimed by an EX descriptor.
	const claimed = new Set(spineExScenes.map((scene) => scene.skeleton))
	const skeletonFiles = files.filter(
		(filename) => isSkeletonName(filename) && !claimed.has(filename),
	)
	const spineDocuments = new Map<string, SpineDocument | undefined>()
	await mapConcurrent(
		skeletonFiles,
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			try {
				spineDocuments.set(filename, await readSkeletonDocument(api, filename))
			} catch (reason) {
				api.logWarn("spine skeleton read failed", {
					filename,
					reason: String(reason),
				})
				spineDocuments.set(filename, undefined)
			}
		},
	)
	const spineStandardScenes = groupSpineScenes(files, spineDocuments)

	// 5. Live2DViewerEX `type: 10` DragonBones scenes.
	const dragonBonesExScenes = await scanDragonBonesExScenes(api, files, documents)

	// 6. Direct DragonBones exports — skeletons not claimed by an EX
	//    descriptor, paired with their `*_tex.json` atlas + page image.
	const dragonBonesClaimed = new Set(dragonBonesExScenes.map((scene) => scene.skeleton))
	const dragonBonesSkeletonFiles = files
		.filter(isDragonBonesSkeletonFileName)
		.filter((name) => !dragonBonesClaimed.has(name))
	const dragonBonesDocuments = new Map<string, DragonBonesDocument | undefined>()
	const atlasContents = new Map<string, string | undefined>()
	await mapConcurrent(
		dragonBonesSkeletonFiles,
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			try {
				const bytes = await api.readFile(filename)
				dragonBonesDocuments.set(filename, readDragonBonesDocument(bytes, filename))
			} catch (reason) {
				api.logWarn("dragonbones skeleton read failed", {
					filename,
					reason: String(reason),
				})
				dragonBonesDocuments.set(filename, undefined)
			}
		},
	)
	await mapConcurrent(
		files.filter(isDragonBonesAtlasName),
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			try {
				atlasContents.set(
					filename,
					new TextDecoder().decode(await api.readFile(filename)),
				)
			} catch (reason) {
				api.logWarn("dragonbones atlas read failed", {
					filename,
					reason: String(reason),
				})
				atlasContents.set(filename, undefined)
			}
		},
	)
	const dragonBonesStandardScenes = groupDragonBonesScenes({
		files,
		documents: dragonBonesDocuments,
		atlasContents,
		claimed: dragonBonesClaimed,
	})

	return [
		...live2dScenes,
		...spineExScenes,
		...spineStandardScenes,
		...dragonBonesExScenes,
		...dragonBonesStandardScenes,
	]
}

/** Build DragonBones EX scenes from `type: 10` descriptors whose assets are present. */
async function scanDragonBonesExScenes(
	api: ResourceAPI<EngineSchema>,
	files: readonly string[],
	documents: ReadonlyMap<string, ModelJsonDocument | undefined>,
): Promise<readonly DragonBonesScene[]> {
	const scenes: DragonBonesScene[] = []
	await mapConcurrent(
		files.filter(isModelJsonName),
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			const document = documents.get(filename)
			if (!isDragonBonesExDocument(document)) return

			const directory = dirname(filename)
			const skeleton =
				directory === ""
					? document.skeleton
					: `${directory}/${document.skeleton}`
			let skeletonDocument: DragonBonesDocument | undefined
			try {
				const bytes = await api.readFile(skeleton)
				skeletonDocument = readDragonBonesDocument(bytes, skeleton)
			} catch (reason) {
				api.logWarn("dragonbones ex skeleton read failed", {
					filename,
					skeleton,
					reason: String(reason),
				})
			}
			const scene = buildDragonBonesExScene({
				modelJson: filename,
				document,
				files,
				skeletonDocument,
			})
			if (scene !== undefined) scenes.push(scene)
		},
	)
	return scenes.sort(
		(a, b) => (a.modelJson ?? "").localeCompare(b.modelJson ?? ""),
	)
}

/** Build Spine EX scenes from `type:9` descriptors whose assets are present. */
async function scanSpineExScenes(
	api: ResourceAPI<EngineSchema>,
	files: readonly string[],
	documents: ReadonlyMap<string, ModelJsonDocument | undefined>,
): Promise<readonly SpineScene[]> {
	const scenes: SpineScene[] = []
	await mapConcurrent(
		files.filter(isModelJsonName),
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			const document = documents.get(filename)
			if (!isSpineExDocument(document)) return

			const directory = dirname(filename)
			const skeleton =
				directory === ""
					? document.skeleton
					: `${directory}/${document.skeleton}`
			const skeletonDocument = await readSkeletonDocument(api, skeleton)
			const scene = buildSpineExScene({
				modelJson: filename,
				document,
				files,
				skeletonDocument,
				skeletonFiles: files,
			})
			if (scene !== undefined) scenes.push(scene)
		},
	)
	return scenes.sort(
		(a, b) => (a.modelJson ?? "").localeCompare(b.modelJson ?? ""),
	)
}

async function readSkeletonDocument(
	api: ResourceAPI<EngineSchema>,
	filename: string,
): Promise<SpineDocument | undefined> {
	if (!filename.endsWith(".json")) {
		const bytes = await api.readFile(filename, { start: 0, end: 256 })
		return readBinarySpineDocument(bytes)
	}

	const header = await api.readFile(filename, { start: 0, end: 64 * 1024 })
	const version = readJsonSpineHeader(header)
	if (version === undefined) return undefined

	let full: Uint8Array
	try {
		full = await api.readFile(filename)
	} catch (reason) {
		api.logWarn("spine json read failed", {
			filename,
			reason: String(reason),
		})
		return { version, animations: [], skins: [] }
	}
	return (
		readSpineDocument(full, filename) ?? {
			version,
			animations: [],
			skins: [],
		}
	)
}

/**
 * A Live2D or Spine resource is any directory holding at least one
 * parseable model/scene with the files the player needs. Content decides:
 * a `.json` without a `skeleton.spine` header or a descriptor whose moc/
 * texture is missing never claims the resource.
 */
async function detect(
	api: ResourceAPI<EngineSchema>,
): Promise<Detection<EngineSchema["detect"] & object>> {
	const scenes = await scanScenes(api)
	if (scenes.length === 0) {
		return { ok: false, reasons: ["animation-model"] }
	}
	return { ok: true, scenes }
}

async function sourceMeta(
	api: ResourceAPI<EngineSchema>,
): Promise<EngineSchema["sourceMeta"] | undefined> {
	const scenes = await scenesOf(api)
	if (scenes.length === 0) return undefined

	const version = scenes.find((scene) => scene.version !== undefined)?.version
	const modelCount = scenes.length
	const animationCount = scenes.reduce(
		(sum, scene) =>
			sum +
			(scene.engine === "spine" || scene.engine === "dragonbones"
				? scene.animations.length
				: 0),
		0,
	)
	const motionCount = scenes.reduce(
		(sum, scene) =>
			sum + (scene.engine === "live2d" ? scene.motionGroups.length : 0),
		0,
	)
	return {
		version,
		modelCount,
		...(animationCount > 0 ? { animationCount } : {}),
		...(motionCount > 0 ? { motionCount } : {}),
		scenes,
	}
}

async function searchMeta(
	api: ResourceAPI<EngineSchema>,
): Promise<EngineSchema["searchMeta"] | undefined> {
	const scenes = await scenesOf(api)
	if (scenes.length === 0) return undefined
	return {
		v: SEARCH_META_VERSION,
		facets: {
			live2d: scenes.some((scene) => scene.engine === "live2d"),
			cubism: scenes.some(
				(scene) => scene.engine === "live2d" && scene.kind === "cubism",
			),
			spine: scenes.some((scene) => scene.engine === "spine"),
			dragonbones: scenes.some((scene) => scene.engine === "dragonbones"),
			standard: scenes.some((scene) => scene.kind === "standard"),
			ex: scenes.some((scene) => scene.kind === "ex"),
		},
	}
}

async function listFiles(
	api: ResourceAPI<EngineSchema>,
): Promise<readonly EngineSchema["file"][]> {
	return serializeEngineScenes(await scenesOf(api))
}

/**
 * Post-install: fetch the pinned Live2D runtime into the plugin vault in
 * ONE batched consent question (the shared dialog lists both URLs), so
 * the first Live2D preview opens without a dialog. Best-effort by
 * contract — a denial, a missing host or a network blip never fails the
 * install: the viewer's runtime loader re-checks and re-asks at preview
 * time. Spine scenes use bundled runtimes and never reach this.
 */
async function onInstall(api: ResourceAPI<EngineSchema>): Promise<void> {
	try {
		await api.download(
			LIVE2D_RUNTIME_FILES.map((entry) => ({
				url: entry.urls[0]!,
				dest: entry.dest,
				sha256: entry.sha256,
				reason: LIVE2D_RUNTIME_REASON,
			})),
		)
	} catch (err) {
		api.logWarn("live2d runtime install download failed", {
			reason: err instanceof Error ? err.message : String(err),
		})
	}
}
