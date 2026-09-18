import spine40Url from "@esotericsoftware/spine-player-4.0/dist/iife/spine-player.js?url"
import spine41Url from "@esotericsoftware/spine-player-4.1/dist/iife/spine-player.js?url"
import spine42Url from "@esotericsoftware/spine-player-4.2/dist/iife/spine-player.js?url"
import spine43Url from "@esotericsoftware/spine-player-4.3/dist/iife/spine-player.js?url"
import type { ImageVariantSpec } from "@hoardodile/sdk-web"
import { isRecord } from "@hoardodile/sdk-web"
import { atlasPagePaths, resolveAtlasPage, rewriteAtlas } from "../core/atlas"
import {
	isLegacyRejectedVersion,
	parseSpineVersion,
	runtimeFor,
	type SpineRuntime,
} from "../core/spine-format"
import type { SpineScene } from "../shared"
import { HOME, type ViewportTransform } from "./canvas-view"
import {
	applySkeletonViewport,
	captureBase,
	type SkeletonBase,
	type SkeletonSurface,
	withFrame,
	worldPerPixel,
} from "./spine-viewport"
import { textureVariantFor } from "./texture-format"

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
	/** The runtime's WebGL context wrapper, for pre-upload pixel settings. */
	readonly context?: { readonly gl?: WebGLRenderingContext }
	readonly sceneRenderer?: {
		readonly skeletonRenderer?: { premultipliedAlpha?: boolean }
		/**
		 * The renderer sizes the canvas backing store as
		 * `clientWidth * this ratio` every frame; `supersampleSpineCanvas`
		 * takes it over to render above the CSS resolution.
		 */
		getSafeDevicePixelRatio?: (cssWidth: number, cssHeight: number) => number
		/** GL size limits the runtime caches on its first ratio call. */
		maxCanvasWidth?: number
		maxCanvasHeight?: number
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
	/**
	 * The runtime's own vector class: `Skeleton.getBounds` fills the vectors it
	 * is handed (and rejects plain objects), so the frame measurement needs it.
	 */
	readonly Vector2?: Vector2Constructor
	/**
	 * The 4.x `Physics` enum: `updateWorldTransform` requires its `update`
	 * member (it throws `physics is undefined` without it), and the measurement
	 * needs a current pose. The legacy 3.8 build takes no argument.
	 */
	readonly Physics?: { readonly update?: unknown }
}

type Vector2Constructor = new () => { x: number; y: number }

/** Everything the frame measurement needs from the loaded runtime. */
type ViewportContext = {
	readonly vector: Vector2Constructor | undefined
	readonly physics: unknown
	/** A composite skin stack composes the scene's props into the frame. */
	readonly composed: boolean
}

function isSpinePlayerModule(value: unknown): value is SpinePlayerModule {
	return isRecord(value) && typeof value.SpinePlayer === "function"
}

export type SpinePlayback = {
	readonly canvas: HTMLCanvasElement | undefined
	readonly setAnimation: (name: string) => void
	readonly setOverlayAnimation: (name: string | undefined) => void
	readonly setSkin: (name: string) => void
	readonly setSkinStack: (skins: readonly string[]) => void
	/**
	 * Re-apply the stack currently in use. An animation's attachment timeline
	 * clears the slots a skin filled, so the host calls this after switching
	 * animations (and on restart) to keep every layer attached.
	 */
	readonly reapplySkinStack: () => void
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
	/**
	 * Clamped atlas pages, keyed by the page URL the atlas text names. The
	 * runtime swaps a texture path for its `rawDataURIs` entry, which is the
	 * only channel that survives the sandbox (a `blob:` URL is created under an
	 * opaque origin, and a page name that is not an `http` URL gets resolved as
	 * a relative path).
	 */
	readonly pageOverrides?: ReadonlyMap<string, string>
}

export type MountSpinePlayerOptions = {
	readonly container: HTMLElement
	readonly scene: SpineScene
	readonly urls: SpineAssetUrls
	readonly runtime: SpineRuntime
	readonly animation: string | undefined
	readonly skin: string | undefined
	/** A Live2DViewerEX composite skin stack; when set, supersedes `skin`. */
	readonly skins?: readonly string[]
	/**
	 * The viewport transform to mount on (a restored view). It seeds the frame
	 * measurement so the base is captured against the requested view rather than
	 * the engine's default fit — otherwise the first re-measure inverts the
	 * wrong transform and the applied zoom reads back as 1.
	 */
	readonly viewport?: ViewportTransform
	readonly autoplay: boolean
	readonly loop: boolean
	readonly debug: boolean
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
export function patchLegacyLoadingScreen(runtime: SpinePlayerModule): boolean {
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
 * Forget the captured legacy runtime. Only for tests: the real client loads the
 * 3.8 script once from `index.html` and must keep the same module, but a test
 * that installs its own `window.spine` fake needs the next mount to re-capture.
 */
export function resetLegacySpineRuntime(): void {
	legacyRuntime = undefined
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
		/**
		 * The `spine` namespace the bundled runtimes publish. Deliberately
		 * mutable: each runtime build replaces it when it loads, and a test
		 * installs its own fake before mounting.
		 */
		spine?: { SpinePlayer: SpinePlayerConstructor }
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
	readonly resolveFileUrl: (
		filename: string,
		variant?: ImageVariantSpec,
	) => string
	readonly pageUrls?: ReadonlyMap<string, string>
	readonly imageVariant?: ImageVariantSpec
	/**
	 * Clamp/resolve one atlas page URL (see {@link premultiplyAtlasPage}).
	 * Injected so tests can exercise the wiring without decoding images.
	 */
	readonly premultiplyPage?: (url: string) => Promise<string | undefined>
}): Promise<SpineAssetUrls | undefined> {
	const { scene, readFile, resolveFileUrl, pageUrls, imageVariant } = options
	const premultiplyPage = options.premultiplyPage ?? premultiplyAtlasPage
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
		const resolvePage = (page: string) =>
			resolveFileUrl(
				resolveAtlasPage(atlas, page),
				textureVariantFor(page, imageVariant),
			)
		const clamped = await clampedPageUrls(
			atlasText,
			resolvePage,
			premultiplyPage,
		)
		const rewritten = rewriteAtlas(atlasText, resolvePage)
		if (rewritten.length === 0) return undefined
		return {
			skeletonUrl,
			atlasUrl: "__hoardodile.atlas",
			atlasText: rewritten,
			...(clamped.size > 0 ? { pageOverrides: clamped } : {}),
			...(skeletonText !== undefined ? { skeletonText } : {}),
			...(skeletonBinary !== undefined ? { skeletonBinary } : {}),
		}
	}

	const atlasBytes = await readFile(atlas)
	const atlasText = new TextDecoder().decode(atlasBytes)
	const resolveExPage = (page: string) => pageUrls.get(page.toLowerCase())
	const clamped = await clampedPageUrls(
		atlasText,
		resolveExPage,
		premultiplyPage,
	)
	const rewritten = rewriteAtlas(atlasText, resolveExPage)
	if (rewritten.length === 0) return undefined

	return {
		skeletonUrl,
		atlasUrl: "__hoardodile_ex.atlas",
		atlasText: rewritten,
		...(clamped.size > 0 ? { pageOverrides: clamped } : {}),
		...(skeletonText !== undefined ? { skeletonText } : {}),
		...(skeletonBinary !== undefined ? { skeletonBinary } : {}),
	}
}

/**
 * Clamp the pixels of every page of a `pma: true` atlas, keyed by the page URL
 * the atlas text will point at. A non-premultiplied atlas is left alone: its
 * pages are composited as stored, so touching them would change the render.
 */
async function clampedPageUrls(
	atlasText: string,
	resolvePage: (page: string) => string | undefined,
	premultiplyPage: (url: string) => Promise<string | undefined>,
): Promise<Map<string, string>> {
	const clamped = new Map<string, string>()
	if (!atlasUsesPremultipliedAlpha(atlasText)) return clamped
	for (const page of atlasPagePaths(atlasText)) {
		const url = resolvePage(page)
		if (url === undefined) continue
		const blobUrl = await premultiplyPage(url)
		if (blobUrl !== undefined) clamped.set(url, blobUrl)
	}
	return clamped
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
export function atlasUsesPremultipliedAlpha(
	atlasText: string | undefined,
): boolean {
	if (atlasText === undefined) return false
	// Spine atlases indent page-level properties (`\tpma: true`), so the
	// header must be matched after optional leading whitespace.
	const match = /^\s*pma:\s*(true|false)\s*$/m.exec(atlasText)
	return match?.[1]?.toLowerCase() === "true"
}

/**
 * Resolve the premultiplied-alpha flag a runtime should render with. An
 * explicit `pma:true`/`pma:false` header always wins (that header is the
 * model's own config). When the flag is absent we fall back to the runtime
 * default: the legacy 3.8 build defaults to **premultiplied** (the
 * Live2DViewerEX game-export atlases it serves are premultiplied but omit
 * the header), while the 4.x build defaults to non-premultiplied. We do NOT
 * blanket-force EX exports to premultiplied: some `type:9` exports carry no
 * `pma` header and are genuinely non-premultiplied, so a shared setting would
 * be wrong — each model's own atlas is the source of truth.
 */
export function resolvePremultipliedAlpha(
	atlasText: string | undefined,
	runtime: SpineRuntime,
): boolean {
	if (atlasText === undefined) return false
	// Spine atlases indent page-level properties (`\tpma: true`), so match the
	// header after optional leading whitespace — otherwise a premultiplied
	// model is silently rendered non-premultiplied and shows a dark fringe.
	const match = /^\s*pma:\s*(true|false)\s*$/m.exec(atlasText)
	if (match !== null) return match[1]?.toLowerCase() === "true"
	return runtime === "legacy"
}

/**
 * Clamp decoded RGBA samples to the premultiplied form a `pma: true` atlas
 * promises. Returns whether anything had to change.
 *
 * The delivered pages are WebP, whose *lossy* colour plane smears the
 * neighbouring artwork into fully transparent texels (measured on one such
 * page: about 140k of 2.17M transparent pixels carry colour, e.g. RGB
 * (84,82,83) at alpha 0). A premultiplied composite adds the colour of those
 * texels at full strength while their alpha contributes nothing, so every mesh
 * edge that filters across them gains a pale fringe — hence the clamp to
 * `min(channel, alpha)` (a no-op for the pixels that are already premultiplied,
 * which almost all of them are) plus zeroing the transparent ones. This is
 * exactly what the source sites do to each decoded page before uploading it.
 */
export function clampPremultipliedRgba(data: Uint8ClampedArray): boolean {
	let changed = false
	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3] ?? 0
		if (alpha === 0) {
			if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
				data[i] = 0
				data[i + 1] = 0
				data[i + 2] = 0
				changed = true
			}
			continue
		}
		for (let channel = 0; channel < 3; channel++) {
			if ((data[i + channel] ?? 0) > alpha) {
				data[i + channel] = alpha
				changed = true
			}
		}
	}
	return changed
}

/**
 * Clamped pages, keyed by their source URL: the transform is deterministic and
 * costs a full decode plus PNG encode, so switching back to a model must not
 * pay for it twice. Bounded because each entry is a multi-megabyte string.
 */
const clampedPageCache = new Map<string, string>()
const CLAMPED_PAGE_CACHE_LIMIT = 6

/**
 * Fetch one atlas page, clamp it (see {@link clampPremultipliedRgba}) and
 * return a PNG data URI the runtime can load instead. `undefined` keeps the
 * original file: when nothing had to change — the common case for a page that
 * really is premultiplied — or when this environment cannot decode/re-encode.
 *
 * A data URI rather than a blob URL: the plugin client runs in a sandboxed
 * iframe, and `URL.createObjectURL` there hands back a `blob:null/…` URL the
 * image loader cannot resolve.
 */
export async function premultiplyAtlasPage(
	url: string,
): Promise<string | undefined> {
	const cached = clampedPageCache.get(url)
	if (cached !== undefined) return cached
	try {
		const response = await fetch(url)
		if (!response.ok) return undefined
		const blob = await response.blob()
		// Same decode options the runtime uses, so the samples we read are the
		// file's own (no decoder-side premultiplication).
		const bitmap = await createImageBitmap(blob, {
			premultiplyAlpha: "none",
			colorSpaceConversion: "none",
		})
		const canvas = document.createElement("canvas")
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const context = canvas.getContext("2d", { willReadFrequently: true })
		if (context === null) {
			bitmap.close()
			return undefined
		}
		context.drawImage(bitmap, 0, 0)
		bitmap.close()
		const image = context.getImageData(0, 0, canvas.width, canvas.height)
		if (!clampPremultipliedRgba(image.data)) return undefined
		context.putImageData(image, 0, 0)
		// PNG is the only lossless encoding available here; a second lossy pass
		// would undo the clamp it carries.
		const encoded = canvas.toDataURL("image/png")
		if (!encoded.startsWith("data:image/png")) return undefined
		if (clampedPageCache.size >= CLAMPED_PAGE_CACHE_LIMIT) {
			const oldest = clampedPageCache.keys().next().value
			if (oldest !== undefined) clampedPageCache.delete(oldest)
		}
		clampedPageCache.set(url, encoded)
		return encoded
	} catch {
		return undefined
	}
}

/** Backing-store pixels per CSS pixel the canvas is rendered at. */
const SUPERSAMPLE_SCALE = 2

/**
 * Render the canvas at (at least) 2× the CSS resolution and let the browser
 * scale the result back down.
 *
 * These game exports pack their atlas into a small lossy WebP (2048² for an
 * atlas that declares a 4344² page), so sampling it straight at CSS resolution
 * shows the encoder's blocking along the seams. The source sites render the
 * same texture into a canvas whose backing store is twice the CSS size and
 * rely on the browser's downscale to average it out; this does the same
 * through the runtime's own canvas-sizing hook (it re-reads the ratio every
 * frame, so a single override is enough). Pan/zoom math is unaffected: it is
 * expressed in CSS pixels (`clientWidth`) throughout.
 */
export function supersampleSpineCanvas(player: NativePlayer): void {
	const renderer = player.sceneRenderer
	if (renderer === undefined) return
	const original = renderer.getSafeDevicePixelRatio?.bind(renderer)
	renderer.getSafeDevicePixelRatio = (cssWidth, cssHeight) => {
		// The original call also discovers and caches the GL size limits, and
		// returns the device ratio the platform would have used.
		const base = original?.(cssWidth, cssHeight) ?? 1
		if (cssWidth <= 0 || cssHeight <= 0) {
			return Math.max(base, SUPERSAMPLE_SCALE)
		}
		const limit = Math.min(
			renderer.maxCanvasWidth !== undefined && renderer.maxCanvasWidth > 0
				? renderer.maxCanvasWidth / cssWidth
				: SUPERSAMPLE_SCALE,
			renderer.maxCanvasHeight !== undefined && renderer.maxCanvasHeight > 0
				? renderer.maxCanvasHeight / cssHeight
				: SUPERSAMPLE_SCALE,
		)
		return Math.max(base, Math.min(SUPERSAMPLE_SCALE, limit))
	}
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
		skins,
		viewport: mountedViewport,
		autoplay,
		loop,
		debug,
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
	const viewportContext: ViewportContext = {
		vector: loadedModule.Vector2,
		physics: loadedModule.Physics?.update,
		composed: (skins?.length ?? 0) > 0,
	}

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
	if (urls.pageOverrides !== undefined) {
		for (const [path, dataUri] of urls.pageOverrides) {
			rawDataUris[path] = dataUri
		}
	}

	// Native Spine pan/zoom: drive the skeleton's own transform (x/y/scaleX/scaleY),
	// which is stable across the bundled runtime versions. Captured at ready so
	// we apply the user transform as an offset on top of the engine's fit, and
	// re-applied after a re-fit so it never snaps back. Zoom is pivoted on the
	// model's bounds center so it mirrors the viewer's center-origin transform
	// (zoom-out doesn't drift the "wrong way").
	//
	// The base is re-measured whenever the frame changes, and the re-measure
	// The base is captured ONCE, on the first re-measure (when the engine's fit
	// is still the only transform in effect) and only its framing — world units
	// per pixel — is refreshed afterwards. Re-capturing the whole base from the
	// live pose would fold the user's pan/zoom into it and apply it again, so
	// every animation switch (which re-measures) compounded the offset.
	let skeletonBase: SkeletonBase | undefined
	const viewportRef = { current: { ...HOME, ...(mountedViewport ?? {}) } }

	function skeletonSurface(): SkeletonSurface | undefined {
		const skeleton = player?.skeleton
		if (skeleton === undefined) return undefined
		return skeleton as unknown as SkeletonSurface
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
		let bounds:
			| { x: number; y: number; width: number; height: number }
			| undefined
		try {
			bounds = (
				surface as unknown as {
					getBounds?: () => {
						x: number
						y: number
						width: number
						height: number
					}
				}
			).getBounds?.()
		} catch {
			bounds = undefined
		}
		// The pan must move the model 1:1 with the cursor, in the camera's own
		// scale. A pinned camera (configureSkeletonViewport) is fitted to the
		// skeleton's setup canvas (`config.viewport.width/height`), which can
		// be much larger than the animated `getBounds()` — using the latter
		// made the pan lag by that ratio (the "drag 1 m → 10 cm" report).
		// Prefer the pinned viewport dims when present, else the model's bounds.
		const viewport = isRecord(player.config?.viewport)
			? player.config?.viewport
			: undefined
		const viewWidth =
			typeof viewport?.width === "number" ? viewport.width : undefined
		const viewHeight =
			typeof viewport?.height === "number" ? viewport.height : undefined
		const worldPerX = worldPerPixel(viewWidth, bounds?.width, sw)
		const worldPerY = worldPerPixel(viewHeight, bounds?.height, sh)
		const pivotX =
			bounds !== undefined ? bounds.x + bounds.width / 2 : surface.x
		const pivotY =
			bounds !== undefined ? bounds.y + bounds.height / 2 : surface.y
		skeletonBase =
			skeletonBase === undefined
				? captureBase({ surface, worldPerX, worldPerY, pivotX, pivotY })
				: withFrame(skeletonBase, { worldPerX, worldPerY, pivotX, pivotY })
	}

	function applyViewport(transform: ViewportTransform): void {
		const surface = skeletonSurface()
		if (surface === undefined || skeletonBase === undefined) return
		viewportRef.current = transform
		// The player runs `updateWorldTransform` each frame, so setting the
		// skeleton transform here is enough — calling it manually can throw
		// ("offset cannot be null") for some skeletons mid-load.
		applySkeletonViewport({ surface, base: skeletonBase, transform })
	}

	/** The transform the engine currently has applied. */
	function getAppliedViewport(): ViewportTransform {
		return { ...viewportRef.current }
	}

	/**
	 * The stack currently composed into the skeleton. Tracked here so a later
	 * animation change can re-apply it: only one skin can go through the
	 * constructor, and every other layer has to be re-composed whenever the new
	 * animation's attachment timeline clears the slots it filled.
	 */
	let stacked: readonly string[] = Array.isArray(skins) ? skins : []

	/**
	 * Re-apply the live skin stack. `Skeleton.setSkin` only swaps attachments the
	 * previous skin had already attached and an animation's attachment timeline
	 * clears those it keys, so re-composing (skin set + slots to setup pose)
	 * is what keeps the layers attached across an animation change.
	 */
	function reapplySkins(): void {
		if (stacked.length === 0) return
		applySkinStack(player, stacked)
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
			// A composite skin stack supersedes the single `skin` the player
			// constructed with (only one skin can be handed to the constructor),
			// and it adds slots — so it must be applied before the frame is
			// measured from the posed skeleton. Re-applying it also lands the
			// setup-pose slot fill the constructor's own `skin` assignment cannot
			// do (the old skin is empty there, so it attaches nothing).
			reapplySkins()
			// Pin the frame to the skeleton's setup canvas. The runtime
			// otherwise derives the frame from the current animation's bounds
			// and reports `Animation bounds are invalid` for attachment-only
			// animations — common in game exports (Live2DViewerEX `type:9` and
			// the standard exports of the same toolchain). A skeleton whose
			// painted content overflows its declared canvas is framed by the
			// union instead, so props and extra layers are not cropped; a
			// composed scene without any authored canvas frames its own
			// content, since the runtime's fit would span the whole scene
			// (its props make the character a speck).
			configureSkeletonViewport(player, viewportContext)
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

	// Render above the CSS resolution: the exports' lossy, low-resolution
	// atlas pages otherwise show their blocking at seam level (see the fn).
	supersampleSpineCanvas(player)

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
			// An animation carries its own attachment timeline, which clears the
			// slots the body skin filled (these exports move the face onto a
			// second set of `*2` slots inside `Idle` and blank the body's own).
			// Re-composing the live stack refills them before the next frame, so
			// switching animations no longer drops overlay layers.
			reapplySkins()
			// A re-fit (per-animation viewport on EX scenes) cancels the camera
			// pan/zoom; re-apply the current viewport so it never snaps back.
			refreshSkeletonBase()
			applyViewport(viewportRef.current)
		},
		setOverlayAnimation(name) {
			setOverlayAnimation(player, name)
			reapplySkins()
			refreshSkeletonBase()
			applyViewport(viewportRef.current)
		},
		setSkin(name) {
			setSkin(player, name)
		},
		setSkinStack(skins) {
			stacked = [...skins]
			applySkinStack(player, skins)
			// A layer adds slots and can extend the painted area well past the
			// authored canvas (props, the second face rig), so the frame is
			// re-measured and the user's pan/zoom re-applied on top of it.
			configureSkeletonViewport(player, {
				...viewportContext,
				composed: skins.length > 0,
			})
			refreshSkeletonBase()
			applyViewport(viewportRef.current)
		},
		reapplySkinStack: reapplySkins,
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

/** A viewport rectangle in skeleton units. */
export type ViewportRect = {
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
}

/** Authors are allowed a pixel of slack before a frame counts as too small. */
const VIEWPORT_SLACK = 1

/**
 * The rectangle a native player should frame:
 *
 * - content bounds missing or empty → the authored canvas (or nothing);
 * - no authored canvas → `undefined`, leaving the runtime's own per-animation
 *   fit alone — except for a composed scene, whose props make that fit span a
 *   scene so wide the character shrinks to a speck, so it frames its own
 *   composed content instead;
 * - content inside the canvas → the canvas, unchanged;
 * - content overflowing the canvas → their union, so props and extra skin
 *   layers are visible instead of cropped.
 */
export function viewportFrame(
	canvas: ViewportRect | undefined,
	bounds: ViewportRect | undefined,
	options: { readonly composed?: boolean } = {},
): ViewportRect | undefined {
	const usable =
		bounds !== undefined && bounds.width > 0 && bounds.height > 0
			? bounds
			: undefined
	if (canvas === undefined) {
		return options.composed === true ? usable : undefined
	}
	if (usable === undefined) return canvas
	const contained =
		usable.x >= canvas.x - VIEWPORT_SLACK &&
		usable.y >= canvas.y - VIEWPORT_SLACK &&
		usable.x + usable.width <= canvas.x + canvas.width + VIEWPORT_SLACK &&
		usable.y + usable.height <= canvas.y + canvas.height + VIEWPORT_SLACK
	if (contained) return canvas
	const minX = Math.min(canvas.x, usable.x)
	const minY = Math.min(canvas.y, usable.y)
	const maxX = Math.max(canvas.x + canvas.width, usable.x + usable.width)
	const maxY = Math.max(canvas.y + canvas.height, usable.y + usable.height)
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Pin the native player's viewport to the frame {@link viewportFrame} picks.
 * Game exports often have animations whose automatic bounds calculation finds
 * no visible geometry (`Animation bounds are invalid`), which the runtime
 * reports as a load failure; the skeleton's own setup canvas is the stable
 * frame every animation shares. Returns silently when the skeleton declares no
 * canvas, leaving the runtime's own per-animation fit untouched.
 */
function configureSkeletonViewport(
	player: NativePlayer,
	context: ViewportContext,
) {
	const data = player.skeleton?.data
	if (!isRecord(data)) return
	const canvas = asRect(data.x, data.y, data.width, data.height)
	const frame = viewportFrame(canvas, skeletonBounds(player, context), {
		composed: context.composed,
	})
	if (frame === undefined) return
	const config = player.config
	if (!isRecord(config)) return
	const viewport = isRecord(config.viewport) ? config.viewport : {}
	const animations = isRecord(viewport.animations) ? viewport.animations : {}
	config.viewport = { ...viewport, animations, ...frame }
}

/**
 * The painted extent of the posed skeleton, or `undefined` when it cannot be
 * measured. `Skeleton.getBounds` requires the runtime's own `Vector2` (it
 * rejects plain objects), sets the minimum corner on the first vector and the
 * size on the second, and reports zeros until the pose is current — so the
 * world transform is refreshed first, with the physics mode 4.x insists on.
 */
function skeletonBounds(
	player: NativePlayer,
	context: ViewportContext,
): ViewportRect | undefined {
	const surface = player.skeleton as
		| {
				readonly getBounds?: (
					offset?: unknown,
					size?: unknown,
					temp?: readonly number[],
				) => unknown
				readonly updateWorldTransform?: (physics?: unknown) => void
		  }
		| undefined
	const vector = context.vector
	if (surface === undefined || typeof surface.getBounds !== "function") {
		return undefined
	}
	if (vector === undefined) return undefined
	try {
		updateWorldTransform(surface, context.physics)
		const offset = new vector()
		const size = new vector()
		surface.getBounds(offset, size, [])
		return asRect(offset.x, offset.y, size.x, size.y)
	} catch {
		return undefined
	}
}

/**
 * Refresh the pose before measuring it. 4.x requires the physics mode and
 * throws `physics is undefined` without it; the legacy build takes no argument
 * at all, so the argument-free call is the fallback.
 */
function updateWorldTransform(
	surface: { readonly updateWorldTransform?: (physics?: unknown) => void },
	physics: unknown,
): void {
	if (typeof surface.updateWorldTransform !== "function") return
	try {
		surface.updateWorldTransform(physics)
	} catch {
		surface.updateWorldTransform()
	}
}

function asRect(
	x: unknown,
	y: unknown,
	width: unknown,
	height: unknown,
): ViewportRect | undefined {
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		return undefined
	}
	return { x, y, width, height }
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

/**
 * A surface over the runtime's skeleton methods that `applySkinStack` needs.
 * The bundled runs expose only the single-skin `setSkin(skin)` API, so a
 * stack is reproduced by merging (copying) each resolved skin into a fresh
 * composite `Skin` and setting that — the shared data skins are never
 * mutated, letting a later `set_skins`/`remove_skins` rebuild a clean stack.
 */
type SkinSurface = {
	readonly setSkin?: (skin: unknown) => void
	readonly setSkinByName?: (name: string) => void
	/**
	 * Re-attaches every slot from the setup pose. Required after a composite
	 * `setSkin`: see `applySkinStack`.
	 */
	readonly setSlotsToSetupPose?: () => void
	/** The skin currently in use (the host reads its name to tell a composite). */
	readonly skin?: { readonly name?: string } | null
	readonly data?: { readonly findSkin?: (name: string) => unknown }
}

/** Name of the merged skin `applySkinStack` installs. */
const COMPOSITE_SKIN_NAME = "__hdo_composite_skin"

/**
 * Apply a Live2DViewerEX composite skin stack. A stack of one falls back to
 * the existing single-skin path; a longer stack is merged into a composite
 * `Skin` and set. When the runtime cannot build a composite (no name lookup,
 * no Skin constructor, or no copyable attachments) it degrades to the last
 * skin in the stack so the model still renders something.
 *
 * Setting the skin is not enough on its own. `Skeleton.setSkin` routes through
 * `Skin.attachAll`, which attaches an attachment from the new skin *only where
 * the old skin already had one attached* — so every slot the composite adds (a
 * layer's second face rig, suit or props) stays empty, which is the headless /
 * missing-pieces render. The source sites follow `setSkin` with
 * `setSlotsToSetupPose()`, and the runtime documents that as the way to reset
 * the visible attachments to the ones the setup pose names in the *new* skin.
 * The next animation frame re-applies the animation's own attachment timelines
 * on top, so this only fills the gaps.
 *
 * Every path resets the slots — including the single-skin one, because a skin
 * set through the player's constructor attaches nothing when the skeleton had
 * no skin then, and because an animation that keys a slot's attachment leaves it
 * empty until the stack is re-applied (`SpinePlayback.reapplySkinStack`).
 */
export function applySkinStack(player: NativePlayer, stack: readonly string[]) {
	const skeleton = player.skeleton as SkinSurface | undefined
	if (skeleton === undefined || stack.length === 0) return

	// A stack of one is the plain single-skin path — but it still resets the
	// slots: the skin handed to the player's constructor attaches nothing when
	// the skeleton had no skin yet (Spine only walks the setup pose's attachment
	// names in that branch), so without the reset the body skin's own slots stay
	// empty. It is also what clears the layers a previous composite filled.
	if (stack.length === 1) {
		setSkin(player, stack[0]!)
		resetSlots(skeleton)
		return
	}

	const data = skeleton.data
	if (data === undefined || typeof data.findSkin !== "function") {
		if (typeof skeleton.setSkinByName === "function") {
			skeleton.setSkinByName(stack[stack.length - 1]!)
		}
		resetSlots(skeleton)
		return
	}
	// Call `findSkin` with the SkeletonData as its receiver (an extracted
	// reference called bare loses `this` and throws `Cannot read properties of
	// undefined (reading 'skins')`).
	const findSkin = data.findSkin
	const resolved = stack
		.map((name) => findSkin.call(data, name))
		.filter((skin): skin is unknown => skin !== undefined)
	if (resolved.length === 0) return

	// Build a pristine composite skin by merging each resolved skin into it.
	const ctor = (resolved[0] as { readonly constructor?: unknown }).constructor
	let composite: unknown
	if (typeof ctor === "function") {
		try {
			composite = new (ctor as new (name: string) => unknown)(
				COMPOSITE_SKIN_NAME,
			)
		} catch {
			composite = undefined
		}
	} else {
		composite = undefined
	}
	const compositeAsSkin = composite as {
		readonly addSkin?: (skin: unknown) => void
	}
	if (
		composite === undefined ||
		typeof compositeAsSkin.addSkin !== "function"
	) {
		if (typeof skeleton.setSkinByName === "function") {
			skeleton.setSkinByName(stack[stack.length - 1]!)
		}
		resetSlots(skeleton)
		return
	}
	// `Skin.addSkin` copies attachments/bones/constraints from its argument
	// into `this` — call it with the composite as receiver so `this` points
	// at the fresh skin, leaving the shared data skins pristine.
	for (const skin of resolved) compositeAsSkin.addSkin(skin)
	if (typeof skeleton.setSkin === "function") skeleton.setSkin(composite)
	// `setSkin` only swapped the attachments the previous skin had already
	// attached, so reset the slots to pull in everything the composite adds.
	// Runs before the frame is measured, so the viewport sees the full layered
	// body.
	resetSlots(skeleton)
}

/**
 * Pull every slot back to the setup pose against the skin now installed. This
 * is the step the runtime's own docs pair with `setSkin` (and what the source
 * sites do): the visible attachments become the ones the setup pose names in
 * the *new* skin, and a later animation frame re-applies its own attachment
 * timelines on top.
 */
function resetSlots(skeleton: SkinSurface): void {
	if (typeof skeleton.setSlotsToSetupPose === "function") {
		skeleton.setSlotsToSetupPose()
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
