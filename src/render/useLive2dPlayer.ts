import { isRecord } from "@hoardodile/sdk-web"
import { Application } from "pixi.js"
import type { Live2DModel } from "pixi-live2d-display"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import {
	type MotionChoice,
	type MotionEntry,
	type MotionGraph,
	type MotionRef,
	parseMotionGraph,
	selectMotion,
} from "../core/motion-graph"
import { useTranslation } from "../i18n"
import type { Live2dScene } from "../shared"
import type { ViewportPoint, ViewportTransform } from "./canvas-view"
import { deriveLive2dViewport, HOME } from "./canvas-view"
import { nextExpressionName, parseExCommand } from "./commands"
import type { Live2dController } from "./engine"
import { buildExpressionFileMap, buildHitMap, pathBasename } from "./hit-areas"
import {
	type HitAreaRect,
	type Live2dModelLike,
	projectLive2dHitRects,
} from "./hit-overlay"
import { usePluginAPI } from "./hooks"
import type { Live2dAutoPlayMode, Live2dFitMode, Live2dSettings } from "./prefs"
import { prepareModel } from "./prepare-model"
import { ensureLive2dRuntime, type Live2dRuntimeError } from "./runtime"
import { live2dRuntimeVersion } from "./runtime-version"
import { scaledSoundVolume } from "./sound"

export type Live2dPlayerStatus = "idle" | "loading" | "ready" | "error"

export type Live2dDialogue = {
	readonly text: string | undefined
	readonly choices: readonly MotionChoice[]
}

export type Live2dModelInfo = {
	readonly canvas: { readonly width: number; readonly height: number }
	readonly version: number | undefined
	readonly hasPhysics: boolean
	readonly hasPose: boolean
}

export type Live2dHitArea = {
	readonly name: string
	readonly group: string
	readonly entry: string | undefined
}

const DEFAULT_MOTION_DURATION = 4000

/**
 * `pixi-live2d-display` verifies the Live2D runtime globals (`window.Live2D`)
 * the moment its module evaluates, so it must only be imported AFTER
 * {@link ensureLive2dRuntime} has loaded the SDK scripts — a dynamic
 * import keeps that check off the eager module graph.
 */
type PixiLive2dModule = typeof import("pixi-live2d-display")
let pixiLive2dModule: Promise<PixiLive2dModule> | undefined

function loadPixiLive2dModule(): Promise<PixiLive2dModule> {
	// A rejected dynamic import is never cached: a transient chunk-load
	// failure (fetch race, server restart mid-retry) must re-import on
	// the next Retry instead of failing every retry with the same
	// rejection.
	pixiLive2dModule ??= import("pixi-live2d-display").catch((err) => {
		pixiLive2dModule = undefined
		throw err
	})
	return pixiLive2dModule
}

export function useLive2dPlayer(options: {
	readonly containerRef: RefObject<HTMLDivElement | null>
	readonly scene: (Live2dScene & { readonly index: number }) | undefined
	readonly settings: Live2dSettings
	readonly onCommand: (command: string) => void
	readonly reloadKey?: number
}): Live2dController {
	const { containerRef, scene, settings, onCommand, reloadKey = 0 } = options
	const api = usePluginAPI()
	const { t } = useTranslation()
	const appRef = useRef<Application | null>(null)
	const modelRef = useRef<Live2DModel | null>(null)
	const viewportRef = useRef<ViewportTransform>({ ...HOME })
	const graphRef = useRef<MotionGraph>({})
	const hitMapRef = useRef<ReadonlyMap<string, MotionRef>>(new Map())
	const expressionFileMapRef = useRef<ReadonlyMap<string, string>>(new Map())
	const currentExpressionRef = useRef<string | undefined>(undefined)
	const playRefImplRef = useRef<(ref: MotionRef) => void>(() => {})
	const playGroupImplRef = useRef<(group: string) => void>(() => {})
	const playGroupEntryImplRef = useRef<(group: string, index: number) => void>(
		() => {},
	)
	const hitImplRef = useRef<(names: readonly string[]) => void>(() => {})
	const lastGroupRef = useRef<string | undefined>(undefined)
	const recomputeHitRectsRef = useRef<(model: unknown) => void>(() => {})
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const audioTimerRef = useRef<number | null>(null)
	const soundVolumeRef = useRef(1)
	const timerRef = useRef<number | null>(null)
	const loopRef = useRef(settings.loop)
	loopRef.current = settings.loop
	const volumeRef = useRef({ volume: settings.volume, muted: settings.muted })
	volumeRef.current = { volume: settings.volume, muted: settings.muted }
	const mirrorRef = useRef(settings.mirror)
	mirrorRef.current = settings.mirror
	const fitModeRef = useRef(settings.fitMode)
	fitModeRef.current = settings.fitMode
	const speedRef = useRef(settings.speed)
	speedRef.current = settings.speed
	const autoPlayRef = useRef(settings.autoPlay)
	autoPlayRef.current = settings.autoPlay
	const autoPlayModeRef = useRef(settings.autoPlayMode)
	autoPlayModeRef.current = settings.autoPlayMode
	const autoPlayIntervalRef = useRef(settings.autoPlayIntervalMs)
	autoPlayIntervalRef.current = settings.autoPlayIntervalMs
	const [status, setStatus] = useState<Live2dPlayerStatus>("idle")
	const [runtimeError, setRuntimeError] = useState<
		Live2dRuntimeError | undefined
	>(undefined)
	const [motionGraph, setMotionGraph] = useState<MotionGraph>({})
	const [modelInfo, setModelInfo] = useState<Live2dModelInfo | undefined>(
		undefined,
	)
	const [hitAreas, setHitAreas] = useState<readonly Live2dHitArea[]>([])
	const [dialogue, setDialogue] = useState<Live2dDialogue>({
		text: undefined,
		choices: [],
	})
	const [paused, setPaused] = useState(false)
	const [currentExpression, setCurrentExpression] = useState<
		string | undefined
	>(undefined)
	const [runtimeVersion, setRuntimeVersion] = useState<string | undefined>(
		undefined,
	)
	const [hitAreaRects, setHitAreaRects] = useState<readonly HitAreaRect[]>([])

	const sceneKey = scene?.modelJson ?? ""

	useEffect(() => {
		let disposed = false
		let app: Application | null = null
		let model: Live2DModel | null = null
		let resizeObserver: ResizeObserver | null = null
		/** Filled by `mount` once the pixi-live2d-display module is loaded
		 *  (startEntry only runs with a model, so it is set by then). */
		let motionPriority: PixiLive2dModule["MotionPriority"] | undefined
		appRef.current = null
		modelRef.current = null
		viewportRef.current = { ...HOME }
		graphRef.current = {}
		hitMapRef.current = new Map()
		playRefImplRef.current = () => {}
		playGroupImplRef.current = () => {}
		playGroupEntryImplRef.current = () => {}
		hitImplRef.current = () => {}
		currentExpressionRef.current = undefined
		setCurrentExpression(undefined)
		setMotionGraph({})
		setModelInfo(undefined)
		setHitAreas([])
		setHitAreaRects([])
		setRuntimeVersion(undefined)
		clearMotionTimer()
		stopSound()
		setStatus("idle")
		setDialogue({ text: undefined, choices: [] })
		setPaused(false)

		// Project the model's hit-area geometry into container-local pixels.
		// Reads the live pixi model (refs), so it stays correct across
		// load / viewport / mirror / fit / resize without manual syncing.
		recomputeHitRectsRef.current = (current) => {
			if (current === undefined || current === null) {
				setHitAreaRects([])
				return
			}
			// Never let the hit-area projection break the model load: if the
			// runtime does not expose usable geometry, fall back to no overlay.
			try {
				setHitAreaRects(
					projectLive2dHitRects(current as unknown as Live2dModelLike),
				)
			} catch {
				setHitAreaRects([])
			}
		}

		async function mount() {
			if (scene === undefined || containerRef.current === null) return
			setRuntimeError(undefined)
			const runtime = await ensureLive2dRuntime(api, {
				reason: t("runtimeReason"),
			})
			if (disposed) return
			if (!runtime.ok) {
				setStatus("error")
				setRuntimeError(runtime.error)
				return
			}
			setRuntimeVersion(live2dRuntimeVersion())
			const pixiLive2d = await loadPixiLive2dModule()
			if (disposed) return
			motionPriority = pixiLive2d.MotionPriority
			const prepared = await prepareModel({
				scene,
				readFile: (path) => api.readFile(path),
				resolveFileUrl: (filename) => api.resolveFileUrl(filename),
				resolveBaseUrl: () => api.resolveBaseUrl(),
			})
			if (disposed || prepared === undefined) return
			if (containerRef.current === null) return

			const rawMotions = isRecord(prepared.raw.FileReferences)
				? prepared.raw.FileReferences.Motions
				: prepared.raw.motions
			graphRef.current = parseMotionGraph(rawMotions)
			setMotionGraph(graphRef.current)
			hitMapRef.current = buildHitMap(
				prepared.raw.hit_areas ?? prepared.raw.HitAreas,
			)
			expressionFileMapRef.current = buildExpressionFileMap(prepared.raw)
			setHitAreas(
				[...hitMapRef.current].map(([name, ref]) => ({
					name,
					group: ref.group,
					entry: ref.entry,
				})),
			)

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
				app.resize()
				// Pixi 7 only listens to window resizes; the iframe viewport can
				// change independently, so keep the renderer and fitted model in
				// sync with the container's actual layout box.
				resizeObserver = new ResizeObserver(() => {
					if (disposed || app === null) return
					app.resize()
					if (modelRef.current === model && model !== null) {
						// Re-fit must PRESERVE the current viewport — otherwise a
						// resize/panel shift wipes the user's pan/zoom (snap-back).
						applyViewport(viewportRef.current)
						recomputeHitRectsRef.current(model)
					}
				})
				resizeObserver.observe(containerRef.current)

				model = pixiLive2d.Live2DModel.fromSync(prepared.settings, {
					ticker: app.ticker,
					autoUpdate: true,
					autoHitTest: false,
					// Gaze is driven manually by the pointermove handler so the
					// `mouse_tracking enable/disable` commands can turn it off.
					autoFocus: false,
					onLoad: () => {
						if (disposed || model === null || app === null) return
						// Do not add the model before this point: the first Pixi
						// render must run with `internalModel` assigned, otherwise
						// `updateWebGLContext()` is skipped forever and the model
						// never draws.
						app.stage.addChild(model)
						app.resize()
						app.ticker.speed = speedRef.current
						modelRef.current = model
						// Apply the current (initial) viewport through the single
						// transform-setter so reset/restore stay consistent.
						applyViewport(viewportRef.current)
						recomputeHitRectsRef.current(model)
						setModelInfo(modelInfoOf(prepared.raw, model))
						setStatus("ready")
						setPaused(false)
					},
					onError: (error) => {
						if (disposed) return
						api.logWarn("live2d load failed", { reason: String(error) })
						setStatus("error")
					},
				})
				model.on("hit", (names) => {
					if (!disposed) playHitNames(names)
				})
				appRef.current = app
			} catch (error) {
				if (!disposed) {
					api.logWarn("live2d init failed", { reason: String(error) })
					setStatus("error")
				}
			}
		}

		function playHitNames(names: readonly string[]) {
			for (const name of names) {
				const ref = hitMapRef.current.get(name)
				if (ref !== undefined) {
					playRefImpl(ref)
					return
				}
			}
			for (const name of names) {
				if (graphRef.current[name] !== undefined) {
					playRefImpl({ group: name, entry: undefined })
					return
				}
			}
		}

		function playRefImpl(ref: MotionRef) {
			lastGroupRef.current = ref.group
			const graph = graphRef.current
			const entries = graph[ref.group] ?? []
			const entry =
				ref.entry === undefined
					? selectMotion(entries, {
							hour: new Date().getHours(),
							random: Math.random,
						})
					: (entries.find((item) => item.name === ref.entry) ?? entries[0])
			if (entry === undefined) return
			startEntry(entry, entries.indexOf(entry))
		}

		function playGroupEntryImpl(group: string, index: number) {
			const entry = graphRef.current[group]?.[index]
			if (entry !== undefined) startEntry(entry, index)
		}

		function startEntry(entry: MotionEntry, index: number) {
			const group = entryGroupOf(entry, index)
			if (
				model !== null &&
				modelRef.current === model &&
				entry.file !== undefined &&
				motionPriority !== undefined
			) {
				void model
					.motion(group, index, motionPriority.NORMAL)
					.then((started) => {
						if (started) setPaused(false)
					})
			}
			showEntry(entry)
			// A Live2DViewerEX motion can switch the face itself
			// (`expression: "serious"`), so apply it as the motion starts.
			if (entry.expression !== undefined) applyExpression(entry.expression)
			scheduleNext(entry, index)
		}

		function entryGroupOf(entry: MotionEntry, index: number): string {
			if (entry.file === undefined) return entry.name ?? ""
			for (const [group, entries] of Object.entries(graphRef.current)) {
				if (entries[index] === entry) return group
			}
			return entry.name ?? ""
		}

		function showEntry(entry: MotionEntry) {
			setDialogue({
				text: entry.text,
				choices: entry.choices,
			})
			if (entry.sound !== undefined) {
				playSound(
					api.resolveFileUrl(entry.sound),
					entry.soundDelay,
					entry.soundVolume,
				)
			} else {
				stopSound()
			}
			for (const command of entry.commands) handleCommand(command)
		}

		function scheduleNext(entry: MotionEntry, index: number) {
			clearMotionTimer()
			if (entry.choices.length > 0) return
			const delay =
				entry.motionDuration ??
				(autoPlayRef.current
					? autoPlayIntervalRef.current
					: DEFAULT_MOTION_DURATION)
			timerRef.current = window.setTimeout(() => {
				if (disposed) return
				// Live2DViewerEX runs `PostCommand` when the motion finishes —
				// the real-data tap→idle chain lives here (`start_mtn Idle`),
				// so it must run after the motion, not at its start.
				for (const command of entry.postCommands) handleCommand(command)
				if (entry.next !== undefined) {
					playRefImpl(entry.next)
				} else if (
					entry.fileLoop &&
					loopRef.current &&
					model !== null &&
					modelRef.current === model &&
					entry.file !== undefined &&
					motionPriority !== undefined
				) {
					void model.motion(
						entryGroupOf(entry, index),
						index,
						motionPriority.NORMAL,
					)
					scheduleNext(entry, index)
				} else if (autoPlayRef.current) {
					// Auto-play: cycle through the rest of the group.
					const group = entryGroupOf(entry, index)
					const entries = graphRef.current[group] ?? []
					const nextIndex = autoPlayIndex(
						entries,
						index,
						autoPlayModeRef.current,
					)
					if (nextIndex !== undefined) playGroupEntryImpl(group, nextIndex)
				}
			}, delay)
		}

		function handleCommand(command: string) {
			const parsed = parseExCommand(command)
			switch (parsed.kind) {
				case "startMotion":
					playRefImpl(parsed.ref)
					return
				case "setExpression":
					applyExpression(parsed.target)
					return
				case "nextExpression":
					applyNextExpression()
					return
				case "mouseTracking":
					// Gaze/eye-tracking is intentionally disabled (no follow).
					return
				case "unknown":
					onCommand(command)
					return
			}
		}

		function applyExpression(ref: string) {
			if (model === null) return
			const name = resolveExpressionName(ref)
			if (name !== undefined) {
				currentExpressionRef.current = name
				setCurrentExpression(name)
				void model.expression(name)
			}
		}

		/** `next_exp`: advance to the next expression in the scene's list. */
		function applyNextExpression() {
			const next = nextExpressionName(
				scene?.expressions ?? [],
				currentExpressionRef.current,
			)
			if (next !== undefined) applyExpression(next)
		}

		function resolveExpressionName(ref: string): string | undefined {
			const direct =
				expressionFileMapRef.current.get(ref) ??
				expressionFileMapRef.current.get(pathBasename(ref))
			return direct ?? ref
		}

		function clearMotionTimer() {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current)
			timerRef.current = null
		}

		function stopSound() {
			if (audioTimerRef.current !== null) {
				window.clearTimeout(audioTimerRef.current)
				audioTimerRef.current = null
			}
			audioRef.current?.pause()
			audioRef.current = null
		}

		function playSound(url: string, delay: number, volume: number | undefined) {
			stopSound()
			const audio = new Audio(url)
			soundVolumeRef.current = volume ?? 1
			audio.volume = scaledSoundVolume(
				soundVolumeRef.current,
				volumeRef.current,
			)
			audioRef.current = audio
			audioTimerRef.current = window.setTimeout(
				() => {
					if (!disposed && audioRef.current === audio) {
						void audio.play().catch(() => {})
					}
				},
				Math.max(0, delay),
			)
		}

		playRefImplRef.current = playRefImpl
		playGroupImplRef.current = (group: string) =>
			playRefImpl({ group, entry: undefined })
		playGroupEntryImplRef.current = playGroupEntryImpl
		hitImplRef.current = playHitNames

		void mount()
		return () => {
			disposed = true
			clearMotionTimer()
			stopSound()
			resizeObserver?.disconnect()
			if (model !== null) destroyLive2dModel(model)
			if (app !== null) {
				app.destroy(true, { children: true })
			}
		}
	}, [api, containerRef, scene, sceneKey, reloadKey, onCommand])

	// Playback speed is applied to the shared Pixi ticker, which scales the
	// deltaMS every frame drives (both Cubism 2 and Cubism 4 models).
	useEffect(() => {
		const app = appRef.current
		if (app !== null) app.ticker.speed = settings.speed
	}, [settings.speed])

	useEffect(() => {
		const audio = audioRef.current
		if (audio === null) return
		audio.volume = scaledSoundVolume(soundVolumeRef.current, {
			volume: settings.volume,
			muted: settings.muted,
		})
	}, [settings.volume, settings.muted])

	const togglePause = useCallback(() => {
		const app = appRef.current
		if (app === null) return
		setPaused((current) => {
			const next = !current
			if (next) app.ticker.stop()
			else app.ticker.start()
			return next
		})
	}, [])

	const restart = useCallback(() => {
		const group = lastGroupRef.current
		if (group !== undefined) playGroupImplRef.current(group)
	}, [])

	const choose = useCallback((ref: MotionRef) => {
		playRefImplRef.current(ref)
	}, [])

	const playGroup = useCallback((group: string) => {
		playGroupImplRef.current(group)
	}, [])

	const playGroupEntry = useCallback((group: string, index: number) => {
		playGroupEntryImplRef.current(group, index)
	}, [])

	const setExpression = useCallback((name: string) => {
		const model = modelRef.current
		if (model !== null) {
			currentExpressionRef.current = name
			setCurrentExpression(name)
			void model.expression(name)
		}
	}, [])

	const resetExpression = useCallback(() => {
		const model = modelRef.current
		if (model !== null) {
			currentExpressionRef.current = undefined
			setCurrentExpression(undefined)
			void model.expression()
		}
	}, [])

	const hit = useCallback((names: readonly string[]) => {
		hitImplRef.current(names)
	}, [])

	const tapAt = useCallback(
		function tapAt(point: ViewportPoint, _viewport: ViewportTransform) {
			const model = modelRef.current
			const host = containerRef.current
			if (model === null || host === null) return
			const rect = host.getBoundingClientRect()
			model.tap(point.x - rect.left, point.y - rect.top)
		},
		[containerRef],
	)

	/** "Interact"-mode drag: the Live2D gaze/drag-interaction (the model looks/
	 *  leans toward the pointer). Only driven by an in-progress drag, never on
	 *  hover. */
	const dragAt = useCallback(
		function dragAt(point: ViewportPoint) {
			const model = modelRef.current
			const host = containerRef.current
			if (model === null || host === null) return
			const rect = host.getBoundingClientRect()
			if (rect.width <= 0 || rect.height <= 0) return
			model.focus(point.x - rect.left, point.y - rect.top)
		},
		[containerRef],
	)

	const applyViewport = useCallback(function applyViewport(
		transform: ViewportTransform,
	) {
		const model = modelRef.current
		const app = appRef.current
		if (model === null || app === null) return
		const { width, height } = model.internalModel
		if (width <= 0 || height <= 0) return
		if (app.screen.width <= 0 || app.screen.height <= 0) return
		// This is the SINGLE place the model's position/scale is set: it layers
		// the user's viewport transform on top of the fit baseline. Re-fitting
		// (on load / resize) re-applies the CURRENT viewport here, never the
		// home transform, so a pan/zoom is preserved (no snap-back).
		viewportRef.current = transform
		model.anchor.set(0.5, 0.5)
		const base = fitScale(
			app.screen.width,
			app.screen.height,
			width,
			height,
			fitModeRef.current,
		)
		const xSign = mirrorRef.current ? -1 : 1
		model.scale.set(base * transform.scale * xSign, base * transform.scale)
		model.rotation = transform.rotation
		model.position.set(
			app.screen.width / 2 + transform.x,
			app.screen.height / 2 + transform.y,
		)
		recomputeHitRectsRef.current(model)
	}, [])

	const capture = useCallback(function capture() {
		const canvas = appRef.current?.view
		return canvas instanceof HTMLCanvasElement
			? canvas.toDataURL("image/png")
			: undefined
	}, [])

	/** Testable interface: recover the ACTUAL applied transform from the live
	 *  pixi model, so a re-fit snap-back is observable (returns HOME when the
	 *  model isn't ready or has no usable size). */
	const getAppliedViewport = useCallback(function getAppliedViewport() {
		const model = modelRef.current
		const app = appRef.current
		if (model === null || app === null) return { ...HOME }
		const { width, height } = model.internalModel
		if (width <= 0 || height <= 0) return { ...HOME }
		return deriveLive2dViewport(
			{
				position: model.position,
				scale: model.scale,
				rotation: model.rotation,
			},
			{ width: app.screen.width, height: app.screen.height },
			{ width, height },
			fitModeRef.current,
		)
	}, [])

	return {
		engine: "live2d" as const,
		status,
		runtimeError,
		dialogue,
		modelInfo,
		hitAreas,
		hitAreaRects,
		paused,
		currentExpression,
		runtimeVersion,
		togglePause,
		restart,
		choose,
		playGroup,
		playGroupEntry,
		motionGraph,
		setExpression,
		resetExpression,
		hit,
		tapAt,
		dragAt,
		applyViewport,
		getAppliedViewport,
		capture,
	}
}

/**
 * The next motion index for auto-play, or undefined when a group has a
 * single motion (let it play once — loop is the explicit replayer).
 * `shuffle` picks a different random entry than the one just played.
 */
function autoPlayIndex(
	entries: readonly MotionEntry[],
	currentIndex: number,
	mode: Live2dAutoPlayMode,
): number | undefined {
	if (entries.length <= 1) return undefined
	if (mode === "shuffle") {
		const others = entries
			.map((_, index) => index)
			.filter((index) => index !== currentIndex)
		return others[Math.floor(Math.random() * others.length)]
	}
	return (currentIndex + 1) % entries.length
}

/**
 * `Live2DModel.destroy()` throws when the model was torn down before its
 * async load finished (`internalModel` is still undefined). All cleanup
 * before that throw (XHR cancellation, ticker detach) has already run, so
 * swallowing the exception is safe.
 */
function destroyLive2dModel(model: Live2DModel) {
	try {
		model.destroy()
	} catch {
		// The load did not complete; nothing else to release.
	}
}

/**
 * Baseline scale for a fit mode. "fit" keeps the whole model in view with
 * a small margin; "width"/"height" fill that axis. User pinch-zoom then
 * multiplies this base.
 */
function fitScale(
	viewWidth: number,
	viewHeight: number,
	modelWidth: number,
	modelHeight: number,
	mode: Live2dFitMode,
): number {
	if (mode === "width") return viewWidth / modelWidth
	if (mode === "height") return viewHeight / modelHeight
	return Math.min(viewWidth / modelWidth, viewHeight / modelHeight) * 0.9
}

/** Surface the loaded model's native canvas + descriptor flags for the Info panel. */
function modelInfoOf(
	raw: Record<string, unknown>,
	model: Live2DModel,
): Live2dModelInfo {
	const version =
		typeof raw.Version === "number"
			? raw.Version
			: typeof raw.version === "number"
				? raw.version
				: undefined
	const fileRefs = isRecord(raw.FileReferences) ? raw.FileReferences : undefined
	const hasPhysics =
		fileRefs !== undefined &&
		(fileRefs.Physics !== undefined ||
			fileRefs.PhysicsV2 !== undefined ||
			raw.physics_v2 !== undefined ||
			raw.physics !== undefined)
	const hasPose =
		(fileRefs !== undefined && fileRefs.Pose !== undefined) ||
		raw.pose !== undefined
	const { width, height } = model.internalModel
	return { canvas: { width, height }, version, hasPhysics, hasPose }
}
