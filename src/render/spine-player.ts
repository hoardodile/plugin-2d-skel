import spine40Url from "@esotericsoftware/spine-player-4.0/dist/iife/spine-player.js?url"
import spine41Url from "@esotericsoftware/spine-player-4.1/dist/iife/spine-player.js?url"
import spine42Url from "@esotericsoftware/spine-player-4.2/dist/iife/spine-player.js?url"
import spine43Url from "@esotericsoftware/spine-player-4.3/dist/iife/spine-player.js?url"
import { isRecord } from "@hoardodile/sdk-web"
import { HOME, type ViewportTransform } from "./canvas-view"
import { rewriteAtlas, resolveAtlasPage } from "../core/atlas"
import {
	isLegacyRejectedVersion,
	parseSpineVersion,
	runtimeFor,
	type SpineRuntime,
} from "../core/spine-format"
import type { SpineScene } from "../shared"

/** The small surface every bundled SpinePlayer build exposes. */
type NativePlayer = {
	readonly animationState?: {
		readonly setAnimation?: (
			track: number,
			name: string,
			loop?: boolean,
		) => unknown
		readonly setEmptyAnimation?: (
			track: number,
			mixDuration?: number,
		) => unknown
		readonly clearTrack?: (track: number) => unknown
	}
	readonly skeleton?: Record<string, unknown>
	readonly config?: Record<string, unknown>
	readonly canvas?: HTMLCanvasElement
	readonly sceneRenderer?: {
		readonly skeletonRenderer?: { premultipliedAlpha?: boolean }
	}
	readonly play?: () => void
	readonly pause?: () => void
	speed?: number
	readonly setAnimation?: (animation: string, loop?: boolean) => unknown
	readonly setSkin?: (...args: unknown[]) => unknown
	readonly dispose?: () => void
}

type SpinePlayerConstructor = new (
	container: HTMLElement,
	options: Record<string, unknown>,
) => NativePlayer

type SpinePlayerModule = {
	readonly SpinePlayer: SpinePlayerConstructor
}

function isSpinePlayerModule(value: unknown): value is SpinePlayerModule {
	return isRecord(value) && typeof value.SpinePlayer === "function"
}

export type SpinePlayback = {
	readonly canvas: HTMLCanvasElement | undefined
	readonly setAnimation: (name: string) => void
	readonly setOverlayAnimation: (name: string | undefined) => void
	readonly setSkin: (name: string) => void
	readonly setPaused: (paused: boolean) => void
	readonly setSpeed: (speed: number) => void
	readonly applyViewport: (transform: ViewportTransform) => void
	readonly getAppliedViewport: () => ViewportTransform
	readonly dispose: () => void
}

export type SpineAssetUrls = {
	readonly skeletonUrl: string
	readonly atlasUrl: string
	readonly atlasText?: string
	readonly skeletonText?: string
	readonly skeletonBinary?: Uint8Array
}

export type MountSpinePlayerOptions = {
	readonly container: HTMLElement
	readonly scene: SpineScene
	readonly urls: SpineAssetUrls
	readonly runtime: SpineRuntime
	readonly animation: string | undefined
	readonly skin: string | undefined
	readonly autoplay: boolean
	readonly loop: boolean
	readonly debug: boolean
	readonly skeletonViewport?: boolean
	readonly onReady: (info: {
		readonly animations: readonly string[]
		readonly overlays: readonly string[]
		readonly skins: readonly string[]
	}) => void
	readonly onError: (error: unknown) => void
}

const STANDARD_RUNTIME_URLS: Readonly<
	Record<Exclude<SpineRuntime, "legacy">, string>
> = {
	"4.0": spine40Url,
	"4.1": spine41Url,
	"4.2": spine42Url,
	"4.3": spine43Url,
}

const scriptCache = new Map<string, Promise<SpinePlayerModule>>()

/**
 * The legacy script ships in index.html and is captured once, so later
 * official runtime scripts (which reuse the same global) cannot erase it.
 */
let legacyRuntime: SpinePlayerModule | undefined

/**
 * The legacy build ignores `preserveDrawingBuffer` and always creates the
 * WebGL context with `{ alpha }` only, so `canvas.toDataURL()` races the
 * next clear and usually comes back black. Patch its context setup before
 * any player is constructed so screenshots read the last presented frame.
 */
function patchLegacyPreserveDrawingBuffer(runtime: SpinePlayerModule): void {
	const context = (
		runtime as unknown as {
			readonly webgl?: {
				readonly ManagedWebGLRenderingContext?: {
					readonly prototype: {
						setupCanvas: (
							canvas: HTMLCanvasElement,
							contextConfig?: Record<string, unknown>,
						) => void
					}
				}
			}
		}
	).webgl?.ManagedWebGLRenderingContext?.prototype
	if (context === undefined) return
	const original = context.setupCanvas
	context.setupCanvas = function setupCanvas(
		canvas: HTMLCanvasElement,
		contextConfig: Record<string, unknown> = {},
	) {
		original.call(this, canvas, {
			...contextConfig,
			preserveDrawingBuffer: true,
		})
	}
}

/**
 * The legacy 3.8 build has no `showLoading` option — `drawFrame` always
 * calls `loadingScreen.draw(isLoadingComplete())`, which fills the canvas
 * with an opaque background and paints the Spine logo + spinner centered
 * until the asset manager reports complete (then fades over ~1s). For big
 * EX textures that branded overlay dominates the viewport. Suppress it by
 * no-oping `LoadingScreen.prototype.draw` so the canvas stays clear while
 * the host surfaces the loading/error state itself. Returns false when the
 * runtime exposes no LoadingScreen to patch (an absent draw is treated as
 * already suppressed and reports false).
 */
export function patchLegacyLoadingScreen(
	runtime: SpinePlayerModule,
): boolean {
	const prototype = (
		runtime as unknown as {
			readonly webgl?: {
				readonly LoadingScreen?: {
					readonly prototype?: { draw?: (...args: unknown[]) => void }
				}
			}
		}
	).webgl?.LoadingScreen?.prototype
	if (prototype === undefined || prototype.draw === undefined) return false
	prototype.draw = function draw(..._args: unknown[]): void {
		// No-op — never paint the branded loading screen over the canvas.
	}
	return true
}

function loadLegacyRuntime(): SpinePlayerModule {
	if (legacyRuntime === undefined) {
		if (!isSpinePlayerModule(window.spine)) {
			throw new Error("Spine runtime legacy is not available")
		}
		legacyRuntime = window.spine
		patchLegacyPreserveDrawingBuffer(legacyRuntime)
		patchLegacyLoadingScreen(legacyRuntime)
	}
	return legacyRuntime
}

/**
 * Load one official runtime's IIFE build. Each build publishes the same
 * global `spine` namespace, so only the active runtime's script is
 * loaded and a later scene that needs a different version simply loads
 * its script over it.
 */
function loadStandardRuntime(
	runtime: Exclude<SpineRuntime, "legacy">,
): Promise<SpinePlayerModule> {
	const url = STANDARD_RUNTIME_URLS[runtime]
	const cached = scriptCache.get(url)
	if (cached !== undefined) return cached

	const pending = new Promise<SpinePlayerModule>((resolve, reject) => {
		const script = document.createElement("script")
		script.src = url
		script.onload = () => {
			if (isSpinePlayerModule(window.spine)) resolve(window.spine)
			else reject(new Error(`Spine runtime ${runtime} did not load`))
		}
		script.onerror = () =>
			reject(new Error(`Spine runtime ${runtime} failed to load`))
		document.head.append(script)
	})
	scriptCache.set(url, pending)
	return pending
}

declare global {
	interface Window {
		readonly spine?: { readonly SpinePlayer: SpinePlayerConstructor }
	}
}

/** Resolve the runtime a scene should load on. */
export function sceneRuntime(scene: SpineScene): SpineRuntime | undefined {
	return runtimeFor(parseSpineVersion(scene.version))
}

/**
 * Rewrite the scene atlas for EX descriptors, whose logical page names
 * (`tex_names`) do not match archive file names. Standard atlases are
 * left alone: passing the original file URL keeps every relative page
 * path resolvable by the player against the atlas directory.
 *
 * The rewritten atlas is handed to the player as a flat fake path (no
 * `/`, so its computed "parent directory" is empty) backed by a
 * `rawDataURIs` data override. That keeps the absolute page URLs we
 * embed intact — a blob URL would prefix every page with `blob:null/`.
 */
export async function prepareSpineAssets(options: {
	readonly scene: SpineScene
	readonly readFile: (path: string) => Promise<ArrayBuffer>
	readonly resolveFileUrl: (filename: string) => string
	readonly pageUrls?: ReadonlyMap<string, string>
}): Promise<SpineAssetUrls | undefined> {
	const { scene, readFile, resolveFileUrl, pageUrls } = options
	const atlas = scene.atlas
	if (atlas === undefined) return undefined

	let skeletonUrl = resolveFileUrl(scene.skeleton)
	let skeletonText: string | undefined
	let skeletonBinary: Uint8Array | undefined
	if (isLegacyRejectedVersion(parseSpineVersion(scene.version))) {
		const skeletonBytes = await readFile(scene.skeleton)
		if (scene.format === "json") {
			skeletonText = rewriteLegacyJsonVersion(
				new TextDecoder().decode(skeletonBytes),
			)
			if (skeletonText === undefined) return undefined
			skeletonUrl = "__hoardodile_legacy.json"
		} else {
			skeletonBinary = rewriteLegacyBinaryVersion(new Uint8Array(skeletonBytes))
			if (skeletonBinary === undefined) return undefined
			skeletonUrl = "__hoardodile_legacy.skel"
		}
	}

	if (pageUrls === undefined) {
		const atlasBytes = await readFile(atlas)
		const atlasText = new TextDecoder().decode(atlasBytes)
		const rewritten = rewriteAtlas(atlasText, (page) =>
			resolveFileUrl(resolveAtlasPage(atlas, page)),
		)
		if (rewritten.length === 0) return undefined
		return {
			skeletonUrl,
			atlasUrl: "__hoardodile.atlas",
			atlasText: rewritten,
			...(skeletonText !== undefined ? { skeletonText } : {}),
			...(skeletonBinary !== undefined ? { skeletonBinary } : {}),
		}
	}

	const atlasBytes = await readFile(atlas)
	const atlasText = new TextDecoder().decode(atlasBytes)
	const rewritten = rewriteAtlas(atlasText, (page) =>
		pageUrls.get(page.toLowerCase()),
	)
	if (rewritten.length === 0) return undefined

	return {
		skeletonUrl,
		atlasUrl: "__hoardodile_ex.atlas",
		atlasText: rewritten,
		...(skeletonText !== undefined ? { skeletonText } : {}),
		...(skeletonBinary !== undefined ? { skeletonBinary } : {}),
	}
}

/**
 * Replace the `3.8.75` version marker the bundled legacy runtime rejects
 * with the compatible `3.8.99` marker. Returns `undefined` when the
 * marker is absent (the document was not what the scene claimed to be).
 */
export function rewriteLegacyJsonVersion(text: string): string | undefined {
	const rewritten = text.replace(/"spine"\s*:\s*"3\.8\.75"/, `"spine":"3.8.99"`)
	return rewritten === text ? undefined : rewritten
}

/**
 * EX binary skeletons store two byte-length-prefixed strings (hash, then
 * version). Patch the version bytes in place — both strings are the same
 * six characters, so the byte layout does not move.
 */
export function rewriteLegacyBinaryVersion(
	bytes: Uint8Array,
): Uint8Array | undefined {
	const versionLengthOffset = bytes[0]
	if (versionLengthOffset === undefined) return undefined
	const versionLength = bytes[versionLengthOffset]
	if (versionLength === undefined || versionLength < 6) return undefined
	const versionOffset = versionLengthOffset + 1
	const version = new TextDecoder().decode(
		bytes.slice(versionOffset, versionOffset + 6),
	)
	if (version !== "3.8.75") return undefined
	const patched = bytes.slice()
	patched.set(new TextEncoder().encode("3.8.99"), versionOffset)
	return patched
}

/**
 * The data URI each runtime needs for a `rawDataURIs` text override.
 * The legacy and 4.2/4.3 players send the data URI through XHR, which
 * percent-decodes it; the 4.0/4.1 players slice the raw payload after the
 * first comma without any decoding, so they get the unencoded text.
 */
export function textRawDataUriFor(runtime: SpineRuntime, text: string): string {
	if (runtime === "4.0" || runtime === "4.1") {
		return `data:text/plain,${text}`
	}
	return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`
}

/** Base64 data URI for a binary `rawDataURIs` override. */
export function binaryRawDataUri(bytes: Uint8Array): string {
	return `data:application/octet-stream;base64,${bytesToBase64(bytes)}`
}

/**
 * Whether a Spine atlas uses premultiplied alpha. A `pma:true` atlas must be
 * composited through a premultiplied-alpha WebGL canvas, otherwise the region
 * seams and transparent edges show a dark fringe. Returns `false` when the
 * flag is absent or malformed.
 */
export function atlasUsesPremultipliedAlpha(atlasText: string | undefined): boolean {
	if (atlasText === undefined) return false
	const match = /^pma:\s*(true|false)\s*$/m.exec(atlasText)
	return match?.[1]?.toLowerCase() === "true"
}

/**
 * Resolve the premultiplied-alpha flag a runtime should render with. An
 * explicit `pma:true`/`pma:false` header always wins. When the flag is
 * absent, the legacy 3.8 runtime defaults to **premultiplied** because the
 * game-export atlases it serves (Live2DViewerEX `type:9`) are premultiplied
 * but omit the header — rendering them non-premultiplied is what leaves the
 * dark fringe at region seams. The 4.x builds default to non-premultiplied
 * (their atlases carry the header when premultiplied).
 */
export function resolvePremultipliedAlpha(
	atlasText: string | undefined,
	runtime: SpineRuntime,
): boolean {
	if (atlasText === undefined) return false
	const match = /^pma:\s*(true|false)\s*$/m.exec(atlasText)
	if (match !== null) return match[1]?.toLowerCase() === "true"
	return runtime === "legacy"
}

/**
 * World units per screen pixel for the pan. The camera's pinned viewport
 * (`viewWorld`, set by `configureSkeletonViewport` on EX scenes) is the true
 * scale; falling back to the model's `getBounds()` (used when there is no
 * pinned viewport, i.e. standard scenes) keeps that path unchanged. `1` when
 * neither yields a positive width.
 */
export function worldPerPixel(
	viewWorld: number | undefined,
	boundsWorld: number | undefined,
	canvasPx: number,
): number {
	if (viewWorld !== undefined && viewWorld > 0) return viewWorld / canvasPx
	if (boundsWorld !== undefined && boundsWorld > 0) return boundsWorld / canvasPx
	return 1
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = ""
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
	}
	return btoa(binary)
}

/** Release a prepared asset URL; only blob URLs need revoking. */
export function releaseSpineAssetUrls(urls: SpineAssetUrls): void {
	if (urls.atlasUrl.startsWith("blob:")) URL.revokeObjectURL(urls.atlasUrl)
}

/**
 * Hide the error overlay each Spine runtime paints into the container. The
 * official 4.x builds append a fresh inline-styled `.spine-player-error`
 * div, while the legacy 3.8 build toggles an existing classed one. Setting
 * `display:none` hides the official's inline div and re-adding
 * `spine-player-hidden` re-hides the legacy build's — both without removing
 * the node, so a later `showError` on the legacy build still finds its
 * element instead of throwing on a missing one.
 */
export function suppressSpinePlayerError(container: HTMLElement): void {
	for (const element of container.querySelectorAll(".spine-player-error")) {
		if (element instanceof HTMLElement) {
			element.style.display = "none"
			element.classList.add("spine-player-hidden")
		}
	}
}

/**
 * The legacy 3.8 build renders its full chrome — the controls bar with the
 * Spine logo button, the timeline and the button row — regardless of
 * `showControls:false` (on that build the option only gates the hover
 * behaviour, not the initial visibility), so a full-width Spine logo and
 * the controls dominate the stage. Hide that chrome so only the model
 * canvas occupies the viewport. The 4.x builds honour `showControls:false`
 * and never need this; call it for the legacy runtime only.
 */
export function suppressLegacySpineChrome(container: HTMLElement): void {
	for (const selector of [
		".spine-player-controls",
		".spine-player-buttons",
		".spine-player-timeline",
		"#spine-player-button-logo",
	]) {
		for (const element of container.querySelectorAll(selector)) {
			if (element instanceof HTMLElement) element.style.display = "none"
		}
	}
}

/** Create a SpinePlayer for one scene and wrap its playback controls. */
export async function mountSpinePlayer(
	options: MountSpinePlayerOptions,
): Promise<SpinePlayback> {
	const {
		container,
		scene,
		urls,
		runtime,
		animation,
		skin,
		autoplay,
		loop,
		debug,
		skeletonViewport = false,
		onReady,
		onError,
	} = options

	const loadedModule =
		runtime === "legacy"
			? loadLegacyRuntime()
			: await loadStandardRuntime(runtime)
	if (!isSpinePlayerModule(loadedModule)) {
		throw new Error(`Spine runtime ${runtime} is not available`)
	}
	const Constructor = loadedModule.SpinePlayer

	let ready = false
	const rawDataUris: Record<string, string> = {}
	if (urls.skeletonText !== undefined) {
		rawDataUris[urls.skeletonUrl] = textRawDataUriFor(
			runtime,
			urls.skeletonText,
		)
	} else if (urls.skeletonBinary !== undefined) {
		rawDataUris[urls.skeletonUrl] = binaryRawDataUri(urls.skeletonBinary)
	}
	if (urls.atlasText !== undefined) {
		rawDataUris[urls.atlasUrl] = textRawDataUriFor(runtime, urls.atlasText)
	}

	// Native Spine pan/zoom: drive the skeleton's own transform (x/y/scaleX/scaleY),
	// which is stable across the bundled runtime versions. Captured at ready so
	// we apply the user transform as an offset on top of the engine's fit, and
	// re-applied after a re-fit so it never snaps back. Zoom is pivoted on the
	// model's bounds center so it mirrors the viewer's center-origin transform
	// (zoom-out doesn't drift the "wrong way").
	type SkeletonBase = {
		readonly x: number
		readonly y: number
		readonly scaleX: number
		readonly scaleY: number
		readonly worldPerX: number
		readonly worldPerY: number
		readonly pivotX: number
		readonly pivotY: number
	}
	let skeletonBase: SkeletonBase | undefined
	const viewportRef = { current: { ...HOME } }

	function skeletonSurface(): { x: number; y: number; scaleX: number; scaleY: number; updateWorldTransform: () => void } | undefined {
		const skeleton = player?.skeleton
		if (skeleton === undefined) return undefined
		return skeleton as unknown as {
			x: number
			y: number
			scaleX: number
			scaleY: number
			updateWorldTransform: () => void
		}
	}

	function refreshSkeletonBase(): void {
		const surface = skeletonSurface()
		const canvas = player?.canvas
		if (surface === undefined || canvas === undefined) return
		const sw = canvas.clientWidth || canvas.width
		const sh = canvas.clientHeight || canvas.height
		if (sw <= 0 || sh <= 0) return
		// `getBounds` can throw for some skeletons mid-load ("offset cannot be
		// null"); fall back to a 1:1 world↔px scale rather than fail.
		let bounds: { x: number; y: number; width: number; height: number } | undefined
		try {
			bounds = (surface as unknown as { getBounds?: () => { x: number; y: number; width: number; height: number } }).getBounds?.()
		} catch {
			bounds = undefined
		}
		// The pan must move the model 1:1 with the cursor, in the camera's own
		// scale. On EX scenes the camera is pinned (configureSkeletonViewport)
		// to the descriptor's setup bounds (`config.viewport.width/height`),
		// which can be much larger than the animated `getBounds()` — using the
		// latter made the pan lag by that ratio (the "drag 1 m → 10 cm" report).
		// Prefer the pinned viewport dims when present, else the model's bounds.
		const viewport = isRecord(player.config?.viewport) ? player.config?.viewport : undefined
		const viewWidth = typeof viewport?.width === "number" ? viewport.width : undefined
		const viewHeight = typeof viewport?.height === "number" ? viewport.height : undefined
		const worldPerX = worldPerPixel(viewWidth, bounds?.width, sw)
		const worldPerY = worldPerPixel(viewHeight, bounds?.height, sh)
		skeletonBase = {
			x: surface.x,
			y: surface.y,
			scaleX: surface.scaleX,
			scaleY: surface.scaleY,
			worldPerX,
			worldPerY,
			pivotX: bounds !== undefined ? bounds.x + bounds.width / 2 : surface.x,
			pivotY: bounds !== undefined ? bounds.y + bounds.height / 2 : surface.y,
		}
	}

	function applyViewport(transform: ViewportTransform): void {
		const surface = skeletonSurface()
		if (surface === undefined || skeletonBase === undefined) return
		viewportRef.current = transform
		const base = skeletonBase
		const tz = transform.scale
		surface.scaleX = base.scaleX * tz
		surface.scaleY = base.scaleY * tz
		// Scale around the model's bounds center (keeps the canvas point fixed),
		// then translate by the screen-px pan.
		surface.x = base.pivotX + (base.x - base.pivotX) * tz + transform.x * base.worldPerX
		surface.y = base.pivotY + (base.y - base.pivotY) * tz - transform.y * base.worldPerY
		// Whole-skeleton rotation isn't a field on the Skeleton in every runtime; set
		// it when present (some 4.x builds expose it), else it's a no-op.
		if ("rotation" in surface) {
			;(surface as unknown as { rotation: number }).rotation = transform.rotation
		}
		// The player runs `updateWorldTransform` each frame, so setting the
		// skeleton transform here is enough — calling it manually can throw
		// ("offset cannot be null") for some skeletons mid-load.
	}

	function getAppliedViewport(): ViewportTransform {
		const surface = skeletonSurface()
		if (
			surface === undefined ||
			skeletonBase === undefined ||
			skeletonBase.worldPerX <= 0 ||
			skeletonBase.worldPerY <= 0
		) {
			return { ...HOME }
		}
		const base = skeletonBase
		const tz = base.scaleX > 0 ? surface.scaleX / base.scaleX : 1
		const anchoredX = base.pivotX + (base.x - base.pivotX) * tz
		const anchoredY = base.pivotY + (base.y - base.pivotY) * tz
		const rotation =
			"rotation" in surface
				? (surface as unknown as { rotation: number }).rotation
				: viewportRef.current.rotation
		return {
			x: (surface.x - anchoredX) / base.worldPerX,
			y: (anchoredY - surface.y) / base.worldPerY,
			scale: tz,
			rotation,
		}
	}

	const premultipliedAlpha = resolvePremultipliedAlpha(urls.atlasText, runtime)

	const player = new Constructor(container, {
		...(scene.format === "json"
			? { jsonUrl: urls.skeletonUrl }
			: { skelUrl: urls.skeletonUrl }),
		atlasUrl: urls.atlasUrl,
		...(Object.keys(rawDataUris).length > 0
			? { rawDataURIs: rawDataUris }
			: {}),
		animation: animation ?? scene.animations[0],
		skin: skin ?? scene.skins[0],
		alpha: true,
		// Match the atlas's premultiplied-alpha flag; a `pma:true` atlas on a
		// non-premultiplied canvas shows black seam fringes (common on standard
		// Spine exports like the `c###` models). The legacy 3.8 build defaults
		// to premultiplied when the header is absent (game-export atlases).
		premultipliedAlpha,
		preserveDrawingBuffer: true,
		backgroundColor: "#00000000",
		showControls: false,
		showLoading: false,
		debug,
		success: () => {
			ready = true
			if (skeletonViewport) configureSkeletonViewport(player)
			refreshSkeletonBase()
			onReady(readNamesOf(player))
			if (!autoplay) setPaused(player, true)
		},
		error: (_player: NativePlayer, message: string) => {
			// The runtimes paint their own full-screen `.spine-player-error`
			// DOM before calling this hook; hide it and route the message
			// through the host error surface instead.
			suppressSpinePlayerError(container)
			onError(message)
		},
	})

	// The legacy 3.8 build ignores `showControls:false` for the initial
	// visibility, so its controls bar + Spine logo occupy the stage — hide
	// that chrome (the 4.x builds honour the option and never need this).
	// It also ignores the `premultipliedAlpha` config option: the renderer's
	// SkeletonRenderer keeps its default `false`, which is what leaves the
	// dark seam fringe on the premultiplied game exports. Push the resolved
	// flag onto it directly here.
	if (runtime === "legacy") {
		suppressLegacySpineChrome(container)
		const skeletonRenderer = player.sceneRenderer?.skeletonRenderer
		if (skeletonRenderer !== undefined) {
			skeletonRenderer.premultipliedAlpha = premultipliedAlpha
		}
	}

	return {
		canvas: player.canvas,
		setAnimation(name) {
			setAnimation(player, name, loop)
			// A re-fit (per-animation viewport on EX scenes) cancels the camera
			// pan/zoom; re-apply the current viewport so it never snaps back.
			refreshSkeletonBase()
			applyViewport(viewportRef.current)
		},
		setOverlayAnimation(name) {
			setOverlayAnimation(player, name)
			refreshSkeletonBase()
			applyViewport(viewportRef.current)
		},
		setSkin(name) {
			setSkin(player, name)
		},
		setPaused(paused) {
			if (ready) setPaused(player, paused)
		},
		setSpeed(speed) {
			if ("speed" in player) player.speed = speed
		},
		applyViewport,
		getAppliedViewport,
		dispose() {
			releaseSpineAssetUrls(urls)
			player.dispose?.()
		},
	}
}

/**
 * Pin the native player's viewport to the skeleton canvas bounds. EX
 * exports often have animations whose automatic bounds calculation finds
 * no visible geometry (`Animation bounds are invalid`); the descriptor's
 * canvas bounds are the stable frame every animation shares.
 */
function configureSkeletonViewport(player: NativePlayer) {
	const data = player.skeleton?.data
	if (!isRecord(data)) return
	const { x, y, width, height } = data
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return
	}
	const config = player.config
	if (!isRecord(config)) return
	const viewport = isRecord(config.viewport) ? config.viewport : {}
	const animations = isRecord(viewport.animations) ? viewport.animations : {}
	config.viewport = { ...viewport, animations, x, y, width, height }
}

/** Pause/resume via the player's own controls. */
function setPaused(player: NativePlayer, paused: boolean) {
	if (paused && typeof player.pause === "function") {
		player.pause()
		return
	}
	if (!paused && typeof player.play === "function") {
		player.play()
		return
	}
	const state = player.animationState
	if (state !== undefined && "timeScale" in state) {
		state.timeScale = paused ? 0 : 1
	}
}

/** Ask the native player to play a named animation. */
function setAnimation(player: NativePlayer, name: string, loop: boolean) {
	if (typeof player.setAnimation === "function") {
		player.setAnimation(name, loop)
		return
	}
	const state = player.animationState
	if (typeof state?.setAnimation === "function") {
		state.setAnimation(0, name, loop)
	}
}

/**
 * Overlay track 1 for EX composite playback. Base motion stays on track 0;
 * expression/attachment-only animations layer on top. `undefined` clears
 * the overlay back to the base pose.
 */
function setOverlayAnimation(player: NativePlayer, name: string | undefined) {
	const state = player.animationState
	if (name !== undefined) {
		if (typeof state?.setAnimation === "function") {
			state.setAnimation(1, name, true)
		}
		return
	}
	if (typeof state?.clearTrack === "function") state.clearTrack(1)
	else if (typeof state?.setEmptyAnimation === "function") {
		state.setEmptyAnimation(1, 0.1)
	}
}

/** Ask the native player to apply a named skin, by whichever API it has. */
function setSkin(player: NativePlayer, name: string) {
	const skeleton = player.skeleton
	if (typeof skeleton?.setSkinByName === "function") {
		skeleton.setSkinByName(name)
		return
	}
	if (typeof player.setSkin === "function") {
		player.setSkin(skeleton, name)
	}
}

/** Read the animation/skin name tables off a loaded native player. */
function readNamesOf(player: NativePlayer): {
	readonly animations: readonly string[]
	readonly overlays: readonly string[]
	readonly skins: readonly string[]
} {
	const skeleton = player.skeleton
	const data = skeleton?.data
	return {
		animations: readNameList(data, "animations"),
		overlays: readOverlayNameList(data, "animations"),
		skins: readNameList(data, "skins"),
	}
}

function readNameList(data: unknown, key: string): readonly string[] {
	if (!isRecord(data) || !Array.isArray(data[key])) return []
	return data[key]
		.filter((entry): entry is Record<string, unknown> => isRecord(entry))
		.map((entry) => entry.name)
		.filter((name): name is string => typeof name === "string")
}

/** Zero-duration animations are attachment/expression poses for track 1. */
function readOverlayNameList(data: unknown, key: string): readonly string[] {
	if (!isRecord(data) || !Array.isArray(data[key])) return []
	return data[key]
		.filter(
			(entry): entry is Record<string, unknown> =>
				isRecord(entry) &&
				typeof entry.name === "string" &&
				entry.duration === 0,
		)
		.map((entry) => entry.name)
		.filter((name): name is string => typeof name === "string")
}
