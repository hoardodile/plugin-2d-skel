import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { parseExModelJson } from "../core/ex-model"
import {
	parseMotionGraph,
	parseMotionRef,
	type MotionEntry,
	type MotionGraph,
	type MotionRef,
} from "../core/motion-graph"
import type { SpineScene } from "../shared"
import { HOME, type ViewportTransform } from "./canvas-view"
import { baseAnimationNames, effectiveChoice } from "./choices"
import { buildHitMap } from "./hit-areas"
import { buildExPageUrls } from "./spine-page-map"
import { hitTestSpinePoint, parseSpineBounds, parseSpineHitAreas } from "./spine-hit"
import { spineRuntimeVersion } from "./runtime-version"
import { usePluginAPI } from "./hooks"
import {
	mountSpinePlayer,
	prepareSpineAssets,
	releaseSpineAssetUrls,
	sceneRuntime,
	type SpinePlayback,
} from "./spine-player"
import type { SpineController } from "./engine"
import type { SpineSettings } from "./prefs"

export type SpinePlayerStatus = "idle" | "loading" | "ready" | "error"

export type SpinePlayerNames = {
	readonly animations: readonly string[]
	readonly overlays: readonly string[]
	readonly skins: readonly string[]
}

export type SpineDialogue = {
	readonly text: string | undefined
	readonly choices: readonly { readonly text: string; readonly next: MotionRef }[]
}

export type SpineExHitData = {
	readonly bounds: NonNullable<ReturnType<typeof parseSpineBounds>>
	readonly areas: ReturnType<typeof parseSpineHitAreas>
}

const DEFAULT_EX_MOTION_DURATION = 4000

/**
 * Mounts exactly one native Spine player per scene and forwards the
 * selected animation/skin to it. EX scenes also run the descriptor's
 * motion graph: `file` maps to a native animation name, `next_mtn` and
 * choices chain entries, and sound/text ride on top of the player.
 */
export function useSpinePlayer(options: {
	readonly containerRef: RefObject<HTMLDivElement | null>
	readonly scene: (SpineScene & { readonly index: number }) | undefined
	readonly settings: SpineSettings
	readonly animationChoice: string | undefined
	readonly overlayChoice: string | undefined
	readonly skinChoice: string | undefined
	readonly onCommand: (command: string) => void
	readonly reloadKey?: number
}): SpineController {
	const {
		containerRef,
		scene,
		settings,
		animationChoice,
		overlayChoice,
		skinChoice,
		onCommand,
		reloadKey = 0,
	} = options
	const api = usePluginAPI()
	const playbackRef = useRef<SpinePlayback | null>(null)
	const graphRef = useRef<MotionGraph>({})
	const hitMapRef = useRef<ReadonlyMap<string, MotionRef>>(new Map())
	const playMotionRefImplRef = useRef<(ref: MotionRef) => void>(() => {})
	const hitImplRef = useRef<(names: readonly string[]) => void>(() => {})
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const timerRef = useRef<number | null>(null)
	const [status, setStatus] = useState<SpinePlayerStatus>("idle")
	const [names, setNames] = useState<SpinePlayerNames>({
		animations: [],
		overlays: [],
		skins: [],
	})
	const preferIdle = scene?.modelJson !== undefined
	const baseNames = baseAnimationNames(names.animations, names.overlays)
	const animation = effectiveChoice(baseNames, animationChoice, preferIdle)
	const skin = effectiveChoice(names.skins, skinChoice)
	const overlay = effectiveChoice(names.overlays, overlayChoice)
	const [paused, setPaused] = useState(false)
	const [dialogue, setDialogue] = useState<SpineDialogue>({
		text: undefined,
		choices: [],
	})
	const [exHit, setExHit] = useState<SpineExHitData | undefined>(undefined)
	const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined)
	const [runtimeVersion, setRuntimeVersion] = useState<string | undefined>(undefined)

	const sceneKey = `${scene?.skeleton ?? ""}\u0000${scene?.atlas ?? ""}`

	useEffect(() => {
		let disposed = false
		let playback: SpinePlayback | null = null
		playbackRef.current = null
		graphRef.current = {}
		hitMapRef.current = new Map()
		playMotionRefImplRef.current = () => {}
		hitImplRef.current = () => {}
		setPaused(false)
		setStatus("idle")
		setDialogue({ text: undefined, choices: [] })
		setExHit(undefined)
		setErrorDetail(undefined)
		setRuntimeVersion(undefined)

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
					playbackRef.current?.setAnimation(entry.file)
					scheduleEntry(entry, index)
				}
			}, delay)
		}

		function playMotionRefImpl(ref: MotionRef) {
			const found = entryOf(graphRef.current, ref)
			if (found === undefined) return
			const { entry, index } = found
			if (entry.file !== undefined) {
				playbackRef.current?.setAnimation(entry.file)
				setPaused(false)
			}
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
			const runtime = sceneRuntime(scene)
			if (runtime === undefined) {
				setStatus("error")
				return
			}
			setRuntimeVersion(spineRuntimeVersion(runtime))
			const mountAnimation = effectiveChoice(
				scene.animations,
				animationChoice,
				scene.modelJson !== undefined,
			)
			const mountSkin = effectiveChoice(scene.skins, skinChoice)

			let pageUrls: ReadonlyMap<string, string> | undefined
			if (scene.modelJson !== undefined) {
				const modelBytes = await api.readFile(scene.modelJson)
				const model = parseExModelJson(new TextDecoder().decode(modelBytes))
				if (model === undefined || model.kind !== "spine") {
					setStatus("error")
					return
				}
				graphRef.current = parseMotionGraph(model.raw.motions)
				hitMapRef.current = buildHitMap(model.raw.hit_areas)
				const bounds = parseSpineBounds(model.raw.bounds)
				const areas = parseSpineHitAreas(model.raw.hit_areas)
				setExHit(
					bounds === undefined || areas.length === 0
						? undefined
						: { bounds, areas },
				)
				const ref = model.atlases[0]
				pageUrls =
					ref === undefined
						? undefined
						: buildExPageUrls(ref.texNames, ref.textures, api.resolveFileUrl)
			}

			setStatus("loading")
			setNames({
				animations: scene.animations,
				overlays: [],
				skins: scene.skins,
			})

			try {
				const urls = await prepareSpineAssets({
					scene,
					readFile: (path) => api.readFile(path),
					resolveFileUrl: (filename) => api.resolveFileUrl(filename),
					pageUrls,
				})
				if (disposed) {
					if (urls !== undefined) releaseSpineAssetUrls(urls)
					return
				}
				if (urls === undefined) {
					setStatus("error")
					return
				}
				playback = await mountSpinePlayer({
					container: containerRef.current,
					scene,
					urls,
					runtime,
					animation: mountAnimation,
					skin: mountSkin,
					autoplay: settings.autoplay,
					loop: settings.loop,
					debug: settings.debug,
					skeletonViewport: scene.modelJson !== undefined,
					onReady(nextNames) {
						if (disposed) return
						setNames({
							animations:
								nextNames.animations.length > 0
									? nextNames.animations
									: scene.animations,
							overlays: nextNames.overlays,
							skins: nextNames.skins.length > 0 ? nextNames.skins : scene.skins,
						})
						setPaused(!settings.autoplay)
						setStatus("ready")
					},
					onError(reason) {
						if (disposed) return
						api.logWarn("spine load failed", { reason: String(reason) })
						setErrorDetail(String(reason))
						setStatus("error")
					},
				})
				if (disposed) {
					playback.dispose()
					return
				}
				playbackRef.current = playback
			} catch (reason) {
				if (disposed) return
				api.logWarn("spine load failed", { reason: String(reason) })
				setErrorDetail(String(reason))
				setStatus("error")
			}
		}

		void mount()
		return () => {
			disposed = true
			clearTimer()
			audioRef.current?.pause()
			audioRef.current = null
			playback?.dispose()
		}
	}, [
		api,
		containerRef,
		scene,
		sceneKey,
		settings.autoplay,
		settings.loop,
		settings.debug,
		reloadKey,
		onCommand,
	])

	useEffect(() => {
		if (status !== "ready") return
		if (animation !== undefined) playbackRef.current?.setAnimation(animation)
		if (scene?.modelJson !== undefined) {
			playbackRef.current?.setOverlayAnimation(overlay)
		} else {
			playbackRef.current?.setOverlayAnimation(undefined)
		}
		playbackRef.current?.setPaused(false)
		setPaused(false)
	}, [
		animation,
		overlay,
		scene?.modelJson,
		settings.autoplay,
		settings.loop,
		status,
	])

	useEffect(() => {
		if (status !== "ready") return
		playbackRef.current?.setSpeed(settings.speed)
	}, [settings.speed, status])

	useEffect(() => {
		if (
			status !== "ready" ||
			skin === undefined ||
			scene?.modelJson !== undefined
		)
			return
		playbackRef.current?.setSkin(skin)
	}, [skin, status, scene?.modelJson])

	const togglePause = useCallback(() => {
		setPaused((current) => {
			const next = !current
			playbackRef.current?.setPaused(next)
			return next
		})
	}, [])

	const restart = useCallback(() => {
		if (animation === undefined) return
		playbackRef.current?.setAnimation(animation)
		if (scene?.modelJson !== undefined) {
			playbackRef.current?.setOverlayAnimation(overlay)
		}
		playbackRef.current?.setPaused(false)
		setPaused(false)
	}, [animation, overlay, scene?.modelJson])

	const choose = useCallback((ref: MotionRef) => {
		playMotionRefImplRef.current(ref)
	}, [])

	const playMotionRef = useCallback((ref: MotionRef) => {
		playMotionRefImplRef.current(ref)
	}, [])

	const hit = useCallback((hitNames: readonly string[]) => {
		hitImplRef.current(hitNames)
	}, [])

	const tapAt = useCallback(
		function tapAt(
			point: { readonly x: number; readonly y: number },
			viewport: { readonly x: number; readonly y: number; readonly scale: number },
		) {
			const host = containerRef.current
			const data = exHit
			if (host === null || data === undefined) return
			const rect = host.getBoundingClientRect()
			const area = hitTestSpinePoint({
				pointer: { x: point.x - rect.left, y: point.y - rect.top },
				canvasSize: { width: rect.width, height: rect.height },
				viewport,
				bounds: data.bounds,
				areas: data.areas,
			})
			if (area !== undefined) playMotionRefImplRef.current(area.motion)
		},
		[containerRef, exHit],
	)

	const capture = useCallback(
		function capture() {
			const canvas =
				playbackRef.current?.canvas ??
				containerRef.current?.querySelector("canvas")
			return canvas?.toDataURL("image/png")
		},
		[containerRef],
	)

	const applyViewport = useCallback(function applyViewport(transform: ViewportTransform) {
		playbackRef.current?.applyViewport(transform)
	}, [])

	const getAppliedViewport = useCallback(function getAppliedViewport() {
		return playbackRef.current?.getAppliedViewport() ?? { ...HOME }
	}, [])

	return {
		engine: "spine" as const,
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
		playMotionRef,
		hit,
		tapAt,
		applyViewport,
		getAppliedViewport,
		capture,
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
