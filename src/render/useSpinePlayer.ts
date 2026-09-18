import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { parseExModelJson } from "../core/ex-model"
import {
	type MotionEntry,
	type MotionGraph,
	type MotionRef,
	parseMotionGraph,
	parseMotionRef,
} from "../core/motion-graph"
import { parseSkinStackConfig } from "../core/skin-stack-config"
import type { SpineScene } from "../shared"
import { HOME, type ViewportTransform } from "./canvas-view"
import { baseAnimationNames, defaultSkin, effectiveChoice } from "./choices"
import {
	applySkinCommand,
	parseSkinCommand,
	skinStackFromMotionGraph,
} from "./commands"
import type { SpineController } from "./engine"
import { buildHitMap } from "./hit-areas"
import { usePluginAPI } from "./hooks"
import type { SpineSettings } from "./prefs"
import { spineRuntimeVersion } from "./runtime-version"
import {
	hitTestSpinePoint,
	parseSpineBounds,
	parseSpineHitAreas,
} from "./spine-hit"
import { buildExPageUrls } from "./spine-page-map"
import {
	mountSpinePlayer,
	prepareSpineAssets,
	releaseSpineAssetUrls,
	type SpinePlayback,
	sceneRuntime,
} from "./spine-player"
import {
	type ResolvedSkinStack,
	resolveSceneSkinStack,
	toggleSkinLayer,
} from "./spine-stack"
import { textureVariant } from "./texture-format"

export type SpinePlayerStatus = "idle" | "loading" | "ready" | "error"

export type SpinePlayerNames = {
	readonly animations: readonly string[]
	readonly overlays: readonly string[]
	readonly skins: readonly string[]
}

export type SpineDialogue = {
	readonly text: string | undefined
	readonly choices: readonly {
		readonly text: string
		readonly next: MotionRef
	}[]
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
	/**
	 * The view transform the scene should mount on (a restored view). It is
	 * handed to the frame measurement, so the base is captured against the
	 * requested view instead of the engine's default fit.
	 */
	readonly viewport?: ViewportTransform
	/**
	 * Called when a tap hits no interactive hit area (or the model exposes
	 * none) — the host advances to the next animation so even models without
	 * hotspots respond to a click.
	 */
	readonly onFallbackTap?: () => void
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
		viewport: mountedViewport,
		onFallbackTap,
	} = options
	const api = usePluginAPI()
	const playbackRef = useRef<SpinePlayback | null>(null)
	const graphRef = useRef<MotionGraph>({})
	const hitMapRef = useRef<ReadonlyMap<string, MotionRef>>(new Map())
	/** The Live2DViewerEX composite skin stack, seeded at mount and refined by
	 *  `set_skins`/`add_skins`/`remove_skins` commands. */
	const skinStackRef = useRef<readonly string[]>([])
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
	// An unset skin starts on the scene's base skin, not on whatever name
	// sorts first — the toolbar's chips and the mount must agree.
	const skin =
		skinChoice === undefined
			? defaultSkin(names.skins)
			: effectiveChoice(names.skins, skinChoice)
	const overlay = effectiveChoice(names.overlays, overlayChoice)
	const [paused, setPaused] = useState(false)
	const [dialogue, setDialogue] = useState<SpineDialogue>({
		text: undefined,
		choices: [],
	})
	const [exHit, setExHit] = useState<SpineExHitData | undefined>(undefined)
	const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined)
	const [runtimeVersion, setRuntimeVersion] = useState<string | undefined>(
		undefined,
	)
	/**
	 * The live composite skin stack. A model that declares its layers (its own
	 * `<model>.skins.json`, or an EX `set_skins` graph) mounts and toggles
	 * through it; a scene that declares nothing leaves it empty and uses the
	 * `skin` choice instead.
	 */
	const [skinStack, setSkinStack] = useState<readonly string[]>([])
	/** The declaration the current stack was resolved from, for toggling. */
	const resolvedStackRef = useRef<ResolvedSkinStack | undefined>(undefined)

	const sceneKey = `${scene?.skeleton ?? ""}\u0000${scene?.atlas ?? ""}`

	useEffect(() => {
		let disposed = false
		let playback: SpinePlayback | null = null
		playbackRef.current = null
		graphRef.current = {}
		hitMapRef.current = new Map()
		skinStackRef.current = []
		resolvedStackRef.current = undefined
		playMotionRefImplRef.current = () => {}
		hitImplRef.current = () => {}
		setPaused(false)
		setStatus("idle")
		setDialogue({ text: undefined, choices: [] })
		setExHit(undefined)
		setErrorDetail(undefined)
		setRuntimeVersion(undefined)
		setSkinStack([])

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
			// Live2DViewerEX `type:9` Spine models assemble their appearance
			// from a `set_skins`/`add_skins`/`remove_skins` stack; apply it to
			// the live player rather than forwarding it to the host.
			const skinCommand = parseSkinCommand(command)
			if (skinCommand.kind !== "unknown") {
				skinStackRef.current = applySkinCommand(
					skinStackRef.current,
					skinCommand,
				)
				playbackRef.current?.setSkinStack(skinStackRef.current)
				setSkinStack(skinStackRef.current)
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

		/**
		 * Read the model's own layering declaration. A folder without one (or a
		 * malformed one) simply declares nothing, and the scene renders a single
		 * skin with the Controls panel offering the template.
		 */
		async function readSkinStackConfig() {
			if (scene?.skinStack === undefined) return undefined
			try {
				const bytes = await api.readFile(scene.skinStack)
				return parseSkinStackConfig(new TextDecoder().decode(bytes))
			} catch (reason) {
				api.logWarn("spine skins config read failed", {
					filename: scene.skinStack,
					reason: String(reason),
				})
				return undefined
			}
		}

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
			const mountSkin =
				skinChoice === undefined
					? defaultSkin(scene.skins)
					: effectiveChoice(scene.skins, skinChoice)

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
						: buildExPageUrls(
								ref.texNames,
								ref.textures,
								api.resolveFileUrl,
								textureVariant(settings.webpTextures),
							)
			}

			setStatus("loading")
			setNames({
				animations: scene.animations,
				overlays: [],
				skins: scene.skins,
			})

			// A model states how its skins compose in its own
			// `<model>.skins.json` (written by the archive tool, or hand-written
			// for any other toolchain); an EX descriptor states it with
			// `set_skins`. Both are data — this viewer carries no convention, so
			// a model that declares nothing mounts a single skin.
			const config = await readSkinStackConfig()
			if (disposed) return
			const declaredStack = skinStackFromMotionGraph(graphRef.current)
			const resolved = resolveSceneSkinStack({
				names: scene.skins,
				...(config !== undefined ? { config } : {}),
				...(declaredStack !== undefined ? { declaredStack } : {}),
			})
			resolvedStackRef.current = resolved
			// The runtime takes one skin in its constructor; the rest compose on
			// top of it once mounted.
			const layers = resolved.applies
				? resolved.defaultStack
				: mountSkin === undefined
					? []
					: [mountSkin]
			skinStackRef.current = layers
			setSkinStack(layers)

			try {
				const urls = await prepareSpineAssets({
					scene,
					readFile: (path) => api.readFile(path),
					resolveFileUrl: (filename, variant) =>
						api.resolveFileUrl(filename, variant),
					pageUrls,
					imageVariant: textureVariant(settings.webpTextures),
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
					skin: layers[0] ?? mountSkin,
					...(layers.length > 0 ? { skins: layers } : {}),
					...(mountedViewport !== undefined
						? { viewport: mountedViewport }
						: {}),
					autoplay: settings.autoplay,
					loop: settings.loop,
					debug: settings.debug,
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
		settings.webpTextures,
		reloadKey,
		onCommand,
	])

	useEffect(() => {
		if (status !== "ready") return
		if (animation !== undefined) {
			playbackRef.current?.setAnimation(animation)
			// The new animation's attachment timeline clears the slots the
			// composite skin filled (these exports blank the body's face slots
			// and re-supply them from `face/*`), so the stack is re-applied right
			// after the switch — otherwise a layer or two goes missing each time.
			if (skinStackRef.current.length > 1) {
				playbackRef.current?.reapplySkinStack()
			}
		}
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
		if (skinStackRef.current.length > 1) {
			playbackRef.current?.reapplySkinStack()
		}
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

	/**
	 * Add or remove one skin layer of the live composite. The rules come from the
	 * model's own declaration (pinned body skin, single-choice families) and are
	 * resolved once per scene; the player re-applies the merged skin and the
	 * viewport is re-fitted, since a layer can extend the model's bounds.
	 */
	const toggleSkin = useCallback(
		(name: string) => {
			const fallback = resolveSceneSkinStack({ names: names.skins })
			const next = toggleSkinLayer(
				resolvedStackRef.current ?? fallback,
				skinStackRef.current,
				name,
			)
			skinStackRef.current = next
			playbackRef.current?.setSkinStack(next)
			setSkinStack(next)
		},
		[names.skins],
	)

	const tapAt = useCallback(
		function tapAt(
			point: { readonly x: number; readonly y: number },
			viewport: {
				readonly x: number
				readonly y: number
				readonly scale: number
			},
		) {
			const host = containerRef.current
			if (host === null) return
			const data = exHit
			const rect = host.getBoundingClientRect()
			if (data !== undefined) {
				const area = hitTestSpinePoint({
					pointer: { x: point.x - rect.left, y: point.y - rect.top },
					canvasSize: { width: rect.width, height: rect.height },
					viewport,
					bounds: data.bounds,
					areas: data.areas,
				})
				if (area !== undefined) {
					playMotionRefImplRef.current(area.motion)
					return
				}
			}
			// No interactive hotspot hit (or none declared): fall back to a
			// click response so hotspot-less models aren't "dead" — the host
			// advances to the next animation.
			onFallbackTap?.()
		},
		[containerRef, exHit, onFallbackTap],
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

	const applyViewport = useCallback(function applyViewport(
		transform: ViewportTransform,
	) {
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
		skinStack,
		toggleSkin,
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
