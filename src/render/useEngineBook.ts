import { useCallback, useEffect, useMemo, useState } from "react"
import type {
	DragonBonesScene,
	EngineFile,
	EngineScene,
	Live2dScene,
	ModelEngine,
	SpineScene,
} from "../shared"
import type { ViewerScene } from "./engine"
import { usePluginAPI } from "./hooks"

const SCENE_CACHE_KEY = "model"

function basename(filename: string): string {
	const slash = filename.lastIndexOf("/")
	return slash === -1 ? filename : filename.slice(slash + 1)
}

/** A friendly label: the descriptor name, else a natural fallback. */
function labelOf(scene: EngineScene): string {
	if (scene.engine === "live2d") {
		return scene.label ?? basename(scene.modelJson)
	}
	return scene.label ?? basename(scene.skeleton)
}

function friendlyLabel(scene: ViewerScene, total: number): ViewerScene {
	let label = labelOf(scene)
	if (total > 1 && /^model\d+\.json$/i.test(label)) {
		label = `Model ${scene.index + 1}`
	}
	return { ...scene, label }
}

function scenesFromMeta(scenes: readonly EngineScene[]): readonly ViewerScene[] {
	return scenes.map((scene, index) =>
		friendlyLabel({ ...scene, index } as ViewerScene, scenes.length),
	)
}

type RowGroup = {
	engine?: ModelEngine
	modelJson?: string
	moc?: string
	textures: string[]
	skeleton?: string
	atlas?: string
	format?: "json" | "skel" | "dbbin"
	version?: string
	lineKind?: "ex" | "cubism" | "standard"
}

function scenesFromFiles(files: readonly EngineFile[]): readonly ViewerScene[] {
	const byIndex = new Map<number, RowGroup>()
	for (const file of files) {
		let acc = byIndex.get(file.scene)
		if (acc === undefined) {
			acc = { textures: [] }
			byIndex.set(file.scene, acc)
		}
		acc.engine = file.engine ?? acc.engine
		switch (file.role) {
			case "model":
				acc.modelJson = file.filename
				acc.lineKind = file.kind ?? "cubism"
				break
			case "moc":
				acc.moc = file.filename
				break
			case "texture":
				acc.textures.push(file.filename)
				break
			case "skeleton":
				acc.skeleton = file.filename
				acc.format = file.format
				acc.version = file.version
				acc.modelJson = acc.modelJson ?? file.filename
				break
			case "atlas":
				acc.atlas = file.filename
				break
		}
	}

	const scenes: ViewerScene[] = []
	for (const [index, acc] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
		if (acc.skeleton !== undefined) {
			if (acc.engine === "dragonbones") {
				const dragon: DragonBonesScene & { readonly index: number } = {
					index,
					engine: "dragonbones",
					kind: acc.lineKind === "ex" ? "ex" : "standard",
					skeleton: acc.skeleton,
					atlas: acc.atlas,
					textures: acc.textures,
					format: (acc.format === "skel" ? "json" : acc.format) ??
						(acc.skeleton.endsWith(".json") ? "json" : "dbbin"),
					version: acc.version,
					armatures: [],
					animations: [],
					skins: [],
					...(acc.modelJson !== undefined ? { modelJson: acc.modelJson } : {}),
					label: basename(acc.skeleton),
				}
				scenes.push(friendlyLabel(dragon, byIndex.size))
			} else {
				const spine: SpineScene & { readonly index: number } = {
					index,
					engine: "spine",
					kind: acc.lineKind === "ex" ? "ex" : "standard",
					skeleton: acc.skeleton,
					atlas: acc.atlas,
					textures: acc.textures,
					format: (acc.format === "dbbin" ? "skel" : acc.format) ??
						(acc.skeleton.endsWith(".skel") ? "skel" : "json"),
					version: acc.version,
					animations: [],
					skins: [],
					...(acc.modelJson !== undefined ? { modelJson: acc.modelJson } : {}),
					label: basename(acc.skeleton),
				}
				scenes.push(friendlyLabel(spine, byIndex.size))
			}
		} else if (acc.modelJson !== undefined) {
			const live2d: Live2dScene & { readonly index: number } = {
				index,
				engine: "live2d",
				kind: acc.lineKind === "ex" ? "ex" : "cubism",
				modelJson: acc.modelJson,
				label: acc.modelJson,
				moc: acc.moc ?? "",
				textures: acc.textures,
				motionGroups: [],
				expressions: [],
			}
			scenes.push(friendlyLabel(live2d, byIndex.size))
		}
	}
	return scenes
}

function readCachedScene(raw: string | undefined, count: number): number {
	if (count <= 1) return 0
	const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed)) return 0
	return Math.max(0, Math.min(count - 1, parsed))
}

/** Groups the flat `listFiles` rows back into renderable engine scenes. */
export function useEngineBook() {
	const api = usePluginAPI()
	const fileQuery = api.useFileList()
	const metaScenes = api.resource.sourceMeta?.scenes

	const scenes = useMemo(() => {
		// The server-side scene list is authoritative and complete (it carries
		// engine, kind, name tables and the file references). Prefer it; the
		// flat sidecar reconstruction is only a loading-time fallback.
		if (metaScenes !== undefined && metaScenes.length > 0) {
			return scenesFromMeta(metaScenes)
		}
		return fileQuery.data === undefined ? [] : scenesFromFiles(fileQuery.data)
	}, [fileQuery.data, metaScenes])

	const [sceneIndex, setSceneIndex] = useState(() =>
		readCachedScene(api.getCache(SCENE_CACHE_KEY), Math.max(scenes.length, 1)),
	)

	const selectScene = useCallback(
		function selectScene(index: number) {
			if (scenes.length === 0) return
			const clamped = Math.max(0, Math.min(scenes.length - 1, index))
			setSceneIndex(clamped)
			api.setCache(SCENE_CACHE_KEY, String(clamped))
		},
		[api, scenes.length],
	)

	useEffect(() => {
		if (scenes.length === 0 || sceneIndex < scenes.length) return
		setSceneIndex(0)
	}, [sceneIndex, scenes.length])

	return useMemo(
		() => ({
			scenes,
			scene: scenes[sceneIndex],
			sceneIndex,
			selectScene,
			expectedCount: Math.max(scenes.length, metaScenes?.length ?? 0),
			isLoading: fileQuery.isLoading && scenes.length === 0,
			error: fileQuery.isError ? fileQuery.error : null,
		}),
		[
			scenes,
			sceneIndex,
			selectScene,
			metaScenes,
			fileQuery.isLoading,
			fileQuery.isError,
			fileQuery.error,
		],
	)
}
