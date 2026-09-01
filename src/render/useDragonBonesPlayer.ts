import { Application, Texture } from "pixi.js"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { parseExModelJson } from "../core/ex-model"
import {
	parseMotionGraph,
	parseMotionRef,
	type MotionEntry,
	type MotionGraph,
	type MotionRef,
} from "../core/motion-graph"
import type { DragonBonesScene } from "../shared"
import { HOME, type ViewportTransform } from "./canvas-view"
import { effectiveChoice } from "./choices"
import { buildHitMap } from "./hit-areas"
import { parseSpineBounds, parseSpineHitAreas } from "./spine-hit"
import type { SpineExHitData } from "./useSpinePlayer"
import { dragonBonesRuntimeVersion } from "./runtime-version"
import { usePluginAPI } from "./hooks"
import type { DragonBonesController, DragonBonesPlayerNames } from "./engine"
import type { SpineSettings } from "./prefs"
import {
	DragonBonesPixiFactory,
	type DragonBonesArmatureDisplay,
} from "./dragonbones-pixi"

export type DragonBonesPlayerStatus = "idle" | "loading" | "ready" | "error"

export type DragonBonesDialogue = {
	readonly text: string | undefined
	readonly choices: readonly { readonly text: string; readonly next: MotionRef }[]
}

const DEFAULT_EX_MOTION_DURATION = 4000

/** Monotonic counter so each mount's cache names are unique (no collisions). */
let dbMountSeq = 0

/** A single atlas ref the runtime must parse: atlas JSON + its page image. */
type AtlasRefToLoad = {
	readonly atlasData: object
	readonly texture: string
}

/**
 * Mounts exactly one DragonBones armature per scene and forwards the
 * selected animation to it. EX scenes also run the descriptor's motion
 * graph: `file` maps to a DragonBones animation name, `next_mtn` and
 * choices chain entries, and sound/text ride on top of the player.
 */
export function useDragonBonesPlayer(options: {
	readonly containerRef: RefObject<HTMLDivElement | null>
	readonly scene: (DragonBonesScene & { readonly index: number }) | undefined
	readonly settings: Pick<SpineSettings, "loop" | "speed" | "autoplay">
	readonly animationChoice: string | undefined
	readonly armatureChoice: string | undefined
	readonly onCommand: (command: string) => void
	readonly reloadKey?: number
	/**
	 * Called on tap when the model exposes no pointer hit-testing (DragonBones
	 * armatures aren't hit-tested on the canvas) — the host advances to the
	 * next animation so the model still responds to a click.
	 */
	readonly onFallbackTap?: () => void
}): DragonBonesController {
	const {
		containerRef,
		scene,
		settings,
		animationChoice,
		armatureChoice,
		onCommand,
		reloadKey = 0,
		onFallbackTap,
	} = options
	const api = usePluginAPI()
	const armatureRef = useRef<DragonBonesArmatureDisplay | null>(null)
	const appRef = useRef<Application | null>(null)
	const factoryRef = useRef<DragonBonesPixiFactory | null>(null)
	const viewportRef = useRef<ViewportTransform>({ ...HOME })
	const graphRef = useRef<MotionGraph>({})
	const hitMapRef = useRef<ReadonlyMap<string, MotionRef>>(new Map())
	const playMotionRefImplRef = useRef<(ref: MotionRef) => void>(() => {})
	const hitImplRef = useRef<(names: readonly string[]) => void>(() => {})
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const timerRef = useRef<number | null>(null)
	const pausedRef = useRef(false)
	const speedRef = useRef(settings.speed)
	const loopRef = useRef(settings.loop)
	const [status, setStatus] = useState<DragonBonesPlayerStatus>("idle")
	const [names, setNames] = useState<DragonBonesPlayerNames>({
		animations: [],
		armatures: [],
		skins: [],
	})
	const [paused, setPaused] = useState(false)
	const [dialogue, setDialogue] = useState<DragonBonesDialogue>({
		text: undefined,
		choices: [],
	})
	const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined)
	const [runtimeVersion, setRuntimeVersion] = useState<string | undefined>(undefined)
	const [exHit, setExHit] = useState<SpineExHitData | undefined>(undefined)

	const sceneKey = `${scene?.skeleton ?? ""}\u0000${scene?.atlas ?? ""}\u0000${scene?.modelJson ?? ""}`
	const animation = effectiveChoice(names.animations, animationChoice, scene?.modelJson !== undefined)
	const armature = effectiveChoice(names.armatures, armatureChoice)

	useEffect(() => {
		speedRef.current = settings.speed
		loopRef.current = settings.loop
	}, [settings.speed, settings.loop])

	useEffect(() => {
		let disposed = false
		let fitTicks = 0
		let awaitingLayout = true
		let app: Application | null = null
		let factory: DragonBonesPixiFactory | null = null
		let armatureDisplay: DragonBonesArmatureDisplay | null = null
		let resizeObserver: ResizeObserver | null = null
		let dataName: string | undefined
		const atlasNames: string[] = []
		armatureRef.current = null
		appRef.current = null
		factoryRef.current = null
		viewportRef.current = { ...HOME }
		graphRef.current = {}
		hitMapRef.current = new Map()
		playMotionRefImplRef.current = () => {}
		hitImplRef.current = () => {}
		pausedRef.current = false
		setPaused(false)
		setStatus("idle")
		setDialogue({ text: undefined, choices: [] })
		setErrorDetail(undefined)
		setExHit(undefined)

		function clearTimer() {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current)
			timerRef.current = null
		}

		function playSound(url: string, delay: number) {
			audioRef.current?.pause()
			const audio = new Audio(url)
			audioRef.current = audio
			window.setTimeout(
				() => {
					if (!disposed) void audio.play().catch(() => {})
				},
				Math.max(0, delay),
			)
		}

		function handleCommand(command: string) {
			const startMotion = command.match(/^start_mtn\s+(.+)$/)
			if (startMotion !== null) {
				const motionName = startMotion[1]
				if (motionName !== undefined) {
					const ref = parseMotionRef(motionName)
					if (ref !== undefined) playMotionRefImpl(ref)
				}
				return
			}
			onCommand(command)
		}

		function playName(name: string) {
			const armature = armatureRef.current
			if (armature === null) return
			armature.animation.play(name, loopRef.current ? 0 : 1)
			setPaused(false)
			pausedRef.current = false
		}

		function showEntry(entry: MotionEntry) {
			setDialogue({ text: entry.text, choices: entry.choices })
			if (entry.sound !== undefined) {
				playSound(api.resolveFileUrl(entry.sound), entry.soundDelay)
			}
			for (const command of entry.commands) handleCommand(command)
		}

		function scheduleEntry(entry: MotionEntry, index: number) {
			clearTimer()
			if (entry.choices.length > 0) return
			const delay = entry.motionDuration ?? DEFAULT_EX_MOTION_DURATION
			timerRef.current = window.setTimeout(() => {
				if (disposed) return
				if (entry.next !== undefined) {
					playMotionRefImpl(entry.next)
				} else if (entry.fileLoop && entry.file !== undefined) {
					playName(entry.file)
					scheduleEntry(entry, index)
				}
			}, delay)
		}

		function playMotionRefImpl(ref: MotionRef) {
			const found = entryOf(graphRef.current, ref)
			if (found === undefined) return
			const { entry, index } = found
			if (entry.file !== undefined) playName(entry.file)
			showEntry(entry)
			scheduleEntry(entry, index)
		}

		function playHitNames(hitNames: readonly string[]) {
			for (const name of hitNames) {
				const ref = hitMapRef.current.get(name)
				if (ref !== undefined) {
					playMotionRefImpl(ref)
					return
				}
			}
		}

		playMotionRefImplRef.current = playMotionRefImpl
		hitImplRef.current = playHitNames

		async function mount() {
			if (scene === undefined || containerRef.current === null) return

			setRuntimeVersion(dragonBonesRuntimeVersion())

			// Build the atlas refs (EX descriptors may split the texture
			// across several atlas pages; standard exports use the single
			// `*_tex.json` + `*_tex.png` pair).
			let atlasRefs: AtlasRefToLoad[] = []
			if (scene.modelJson !== undefined) {
				const modelBytes = await api.readFile(scene.modelJson)
				const model = parseExModelJson(new TextDecoder().decode(modelBytes))
				if (model === undefined || model.kind !== "dragonbones") {
					setStatus("error")
					return
				}
				graphRef.current = parseMotionGraph(model.raw.motions)
				hitMapRef.current = buildHitMap(model.raw.hit_areas)
				const bounds = parseSpineBounds(model.raw.bounds ?? model.raw.Bounds)
				const areas = parseSpineHitAreas(model.raw.hit_areas)
				setExHit(
					bounds === undefined || areas.length === 0
						? undefined
						: { bounds, areas },
				)
				for (const ref of model.atlases) {
					const atlasData = JSON.parse(new TextDecoder().decode(await api.readFile(ref.atlas)))
					const texture = resolveAtlasTexture(ref.textures, scene)
					if (texture !== undefined) atlasRefs.push({ atlasData, texture })
				}
			} else {
				const atlas = scene.atlas
				if (atlas === undefined) {
					setStatus("error")
					return
				}
				const atlasData = JSON.parse(new TextDecoder().decode(await api.readFile(atlas)))
				const texture = scene.textures[0]
				if (texture === undefined) {
					setStatus("error")
					return
				}
				atlasRefs.push({ atlasData, texture })
			}
			if (atlasRefs.length === 0) {
				setStatus("error")
				return
			}

			setStatus("loading")
			const canvas = document.createElement("canvas")
			containerRef.current.append(canvas)
			try {
				app = new Application({
					view: canvas,
					resizeTo: containerRef.current,
					backgroundAlpha: 0,
					antialias: true,
					autoDensity: true,
					preserveDrawingBuffer: true,
				})
				appRef.current = app
				app.resize()
				resizeObserver = new ResizeObserver(() => {
					if (disposed || app === null) return
					app.resize()
					// Re-fit must PRESERVE the current viewport (no snap-back).
					applyViewport(viewportRef.current)
				})
				resizeObserver.observe(containerRef.current)

				factory = new DragonBonesPixiFactory()
				factory.autoSearch = true
				factoryRef.current = factory
				dataName = `db-${scene.index}-${++dbMountSeq}`
				const skeletonBytes = await api.readFile(scene.skeleton)
				factory.parseDragonBonesData(
					scene.format === "json"
						? JSON.parse(new TextDecoder().decode(skeletonBytes))
						: toArrayBuffer(skeletonBytes),
					dataName,
				)

				for (const [index, ref] of atlasRefs.entries()) {
					// The custom factory assigns the atlas renderTexture AFTER the
					// sub-textures are parsed (fixing the 7.0.0 ordering bug), so
					// every sub-texture is a real Pixi texture here.
					const texture = Texture.from(api.resolveFileUrl(ref.texture))
					const atlasName = `${dataName}-atlas-${index}`
					atlasNames.push(atlasName)
					factory.parseTextureAtlasData(ref.atlasData, texture, atlasName, 1)
				}

				const armatureName = armature ?? scene.armatures[0] ?? firstArmature(factory, dataName)
				if (armatureName === undefined) {
					setStatus("error")
					return
				}
				armatureDisplay = factory.buildArmatureDisplay(armatureName, dataName)
				armatureRef.current = armatureDisplay
				if (armatureDisplay === null) {
					setStatus("error")
					return
				}
				app.stage.addChild(armatureDisplay)
				applyViewport(viewportRef.current)

				const loadedAnimations = armatureDisplay.animation.animationNames
				const armatures = [...new Set([...scene.armatures, ...runtimeArmatures(factory, dataName)])]
				setNames({
					animations: loadedAnimations.length > 0 ? loadedAnimations : scene.animations,
					armatures,
					skins: scene.skins,
				})

				const startAnimation = effectiveChoice(
					loadedAnimations.length > 0 ? loadedAnimations : scene.animations,
					animationChoice,
					scene.modelJson !== undefined,
				)
				const mountAnimation = startAnimation ?? armatureDisplay.animation.animationNames[0]
				if (mountAnimation !== undefined) {
					const prefersLoop = loopRef.current
					armatureDisplay.animation.play(mountAnimation, prefersLoop ? 0 : 1)
				}

				app.ticker.add(() => {
					if (disposed || app === null || factory === null) return
					const dt = app.ticker.deltaMS / 1000
					if (dt > 0 && !pausedRef.current) factory.advanceTime(dt * speedRef.current)
					// Wait for the container to be laid out (cold page load mounts
					// before the iframe/viewport has a size), then keep re-fitting
					// for a while so the texture finishes loading before settling.
					if (app.screen.width <= 0 || app.screen.height <= 0) {
						awaitingLayout = true
						return
					}
					if (awaitingLayout) awaitingLayout = false
					if (fitTicks < 240) {
						applyViewport(viewportRef.current)
						fitTicks++
					}
				})

				setStatus("ready")
				setPaused(!settings.autoplay)
				if (!settings.autoplay) pausedRef.current = true
			} catch (reason) {
				if (disposed) return
				api.logWarn("dragonbones load failed", {
					reason: String(reason),
					stack: reason instanceof Error ? reason.stack : undefined,
				})
				setErrorDetail(
					reason instanceof Error
						? `${reason.message}\n${reason.stack?.split("\n").slice(0, 12).join("\n")}`
						: String(reason),
				)
				setStatus("error")
			}
		}

		void mount()
		return () => {
			disposed = true
			clearTimer()
			audioRef.current?.pause()
			audioRef.current = null
			if (resizeObserver !== null) resizeObserver.disconnect()
			if (armatureDisplay !== null) {
				try {
					armatureDisplay.dispose()
				} catch {
					// already disposed
				}
			}
			if (factory !== null) {
				try {
					if (dataName !== undefined) factory.removeDragonBonesData(dataName)
					for (const name of atlasNames) factory.removeTextureAtlasData(name)
				} catch {
					// already cleared
				}
			}
			app?.destroy(true, { children: true })
			app = null
			armatureDisplay = null
			factory = null
		}
	}, [
		api,
		containerRef,
		scene,
		sceneKey,
		settings.autoplay,
		reloadKey,
		onCommand,
	])

	useEffect(() => {
		if (status !== "ready") return
		if (animation !== undefined && armatureRef.current !== null) {
			armatureRef.current.animation.play(animation, loopRef.current ? 0 : 1)
		}
		pausedRef.current = false
		setPaused(false)
	}, [animation, status])

	const togglePause = useCallback(() => {
		setPaused((current) => {
			const next = !current
			pausedRef.current = next
			return next
		})
	}, [])

	const restart = useCallback(() => {
		if (animation === undefined || armatureRef.current === null) return
		armatureRef.current.animation.play(animation, loopRef.current ? 0 : 1)
		pausedRef.current = false
		setPaused(false)
	}, [animation])

	const choose = useCallback((ref: MotionRef) => {
		playMotionRefImplRef.current(ref)
	}, [])

	const playAnimation = useCallback((name: string) => {
		if (armatureRef.current === null) return
		armatureRef.current.animation.play(name, loopRef.current ? 0 : 1)
		pausedRef.current = false
		setPaused(false)
	}, [])

	const hit = useCallback((hitNames: readonly string[]) => {
		hitImplRef.current(hitNames)
	}, [])

	const tapAt = useCallback(() => {
		// Pointer hit-testing against DragonBones armatures is not yet wired;
		// hit areas can still be triggered from the controls tab via `hit`.
		// Give click a response anyway: the host advances to the next animation.
		onFallbackTap?.()
	}, [onFallbackTap])

	const capture = useCallback(
		function capture() {
			const canvas = appRef.current?.view ?? containerRef.current?.querySelector("canvas")
			return canvas instanceof HTMLCanvasElement ? canvas.toDataURL("image/png") : undefined
		},
		[containerRef],
	)

	/** Apply the viewport natively on the armature display (Pixi transform on
	 *  top of the bounds fit), so it is shared with the `applyViewport`/`getAppliedViewport`
	 *  interface and re-fit never snaps back. */
	const applyViewport = useCallback(function applyViewport(transform: ViewportTransform) {
		const armature = armatureRef.current
		const app = appRef.current
		if (armature === null || app === null) return
		const bounds = armature.getLocalBounds()
		if (!(bounds.width > 0) || !(bounds.height > 0)) return
		if (app.screen.width <= 0 || app.screen.height <= 0) return
		viewportRef.current = transform
		const base = Math.min(app.screen.width / bounds.width, app.screen.height / bounds.height) * 0.9
		const scale = base * transform.scale
		const cx = bounds.x + bounds.width / 2
		const cy = bounds.y + bounds.height / 2
		armature.setTransform(
			app.screen.width / 2 + transform.x - cx * scale,
			app.screen.height / 2 + transform.y - cy * scale,
			scale,
			scale,
			transform.rotation,
			0,
			0,
		)
	}, [])

	/** Testable interface: recover the applied transform from the live armature
	 *  display, so a re-fit snap-back is observable. */
	const getAppliedViewport = useCallback(function getAppliedViewport() {
		const armature = armatureRef.current
		const app = appRef.current
		if (armature === null || app === null) return { ...HOME }
		const bounds = armature.getLocalBounds()
		if (!(bounds.width > 0) || !(bounds.height > 0)) return { ...HOME }
		const base = Math.min(app.screen.width / bounds.width, app.screen.height / bounds.height) * 0.9
		if (base <= 0) return { ...HOME }
		const scale = armature.scale.x
		const cx = bounds.x + bounds.width / 2
		const cy = bounds.y + bounds.height / 2
		return {
			x: armature.x - app.screen.width / 2 + cx * scale,
			y: armature.y - app.screen.height / 2 + cy * scale,
			scale: scale / base,
			rotation: armature.rotation,
		}
	}, [])

		return {
		engine: "dragonbones" as const,
		status,
		names,
		paused,
		dialogue,
		exHit,
		errorDetail,
		runtimeVersion,
		togglePause,
		restart,
		choose,
		playAnimation,
		hit,
		tapAt,
		capture,
		applyViewport,
		getAppliedViewport,
	}
}

function entryOf(
	graph: MotionGraph,
	ref: MotionRef,
): { readonly entry: MotionEntry; readonly index: number } | undefined {
	const entries = graph[ref.group]
	if (entries === undefined) return undefined
	const index =
		ref.entry === undefined
			? 0
			: entries.findIndex((entry) => entry.name === ref.entry)
	if (index === -1 || entries[index] === undefined) return undefined
	return { entry: entries[index], index }
}

/** Pick the first texture page an EX atlas ref lists that exists in the scene. */
function resolveAtlasTexture(
	textures: readonly string[],
	scene: DragonBonesScene,
): string | undefined {
	for (const name of textures) {
		if (scene.textures.includes(name)) return name
	}
	return scene.textures[0]
}

/** Convert read bytes to a clean ArrayBuffer for the binary (DBDT) parser. */
function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
	if (bytes instanceof ArrayBuffer) return bytes
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Read armature names off the cached DragonBones data (runtime-side). */
function runtimeArmatures(
	factory: DragonBonesPixiFactory,
	name: string,
): readonly string[] {
	const data = factory.getDragonBonesData(name)
	if (data === null) return []
	const armatureNames = (data as { armatureNames?: readonly string[] }).armatureNames
	return armatureNames ?? []
}

function firstArmature(
	factory: DragonBonesPixiFactory,
	name: string,
): string | undefined {
	return runtimeArmatures(factory, name)[0]
}
