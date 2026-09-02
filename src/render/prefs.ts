import type { Codec } from "@hoardodile/sdk-web"
import { isRecord } from "@hoardodile/sdk-web"

export type EngineBackground = "transparent" | "checker" | "solid"
export type EngineFitMode = "fit" | "width" | "height"
export type EngineAutoPlayMode = "sequential" | "shuffle"
export type EngineChromeMode = "auto" | "always"
export type InteractionMode = "interact" | "move"

/** Live2D panel tabs (the spine panel uses its own tab set). The motions,
    expressions and hit-area lists share one "controls" tab rendered as tag
    chips. */
export type Live2dPanelTab = "controls" | "display" | "info"

/** Spine panel tabs: one merged Controls tab plus Display and Info. */
export type SpinePanelTab = "controls" | "display" | "info"

export type Live2dAutoPlayMode = EngineAutoPlayMode

/**
 * One unified viewer settings object, a superset of both engines' prefs.
 * Decoding accepts the legacy live2d (`v:1/2/3`) and spine (`v:1`) payloads
 * so an existing saved setting keeps working, and the current `v:5` schema;
 * new fields default.
 */
export type EngineSettings = {
	readonly v: 5
	readonly interactionMode: InteractionMode
	readonly background: EngineBackground
	readonly solidColor: string
	readonly loop: boolean
	readonly interact: boolean
	readonly volume: number
	readonly muted: boolean
	readonly mirror: boolean
	readonly fitMode: EngineFitMode
	readonly speed: number
	readonly autoPlay: boolean
	readonly autoPlayMode: EngineAutoPlayMode
	readonly autoPlayIntervalMs: number
	readonly chrome: EngineChromeMode
	readonly live2dTab: Live2dPanelTab
	readonly spineTab: SpinePanelTab
	readonly autoplay: boolean
	readonly debug: boolean
	/** Draw the on-canvas hit-area regions over the model. */
	readonly showHitAreas: boolean
	/**
	 * Transcode model textures to lossy WebP at the source's exact pixel
	 * dimensions (via the host image-variant pipeline). Off by default so
	 * the model always loads its original textures; when on the host
	 * serves a smaller WebP re-encode.
	 */
	readonly webpTextures: boolean
}

/** The live2d subset, for the live2d player/panel. */
export type Live2dSettings = Pick<
	EngineSettings,
	| "interactionMode"
	| "background"
	| "solidColor"
	| "loop"
	| "interact"
	| "volume"
	| "muted"
	| "mirror"
	| "fitMode"
	| "speed"
	| "autoPlay"
	| "autoPlayMode"
	| "autoPlayIntervalMs"
	| "chrome"
	| "live2dTab"
	| "webpTextures"
>

/** The spine subset, for the spine player/panel. */
export type SpineSettings = Pick<
	EngineSettings,
	| "interactionMode"
	| "background"
	| "loop"
	| "speed"
	| "autoplay"
	| "debug"
	| "webpTextures"
>

export const ENGINE_SETTINGS_DEFAULT: EngineSettings = {
	v: 5,
	interactionMode: "interact",
	background: "transparent",
	solidColor: "#20242e",
	loop: true,
	interact: true,
	volume: 0.8,
	muted: false,
	mirror: false,
	fitMode: "fit",
	speed: 1,
	autoPlay: false,
	autoPlayMode: "sequential",
	autoPlayIntervalMs: 5000,
	chrome: "auto",
	live2dTab: "controls",
	spineTab: "controls",
	autoplay: true,
	debug: false,
	showHitAreas: false,
	webpTextures: false,
}

/** Solid palette shown in the viewer's background picker. */
export const ENGINE_SOLID_COLORS: readonly string[] = [
	"#20242e",
	"#2b2735",
	"#1f2a3a",
	"#3a2f2f",
	"#2f3a2f",
	"#242424",
	"#ffffff",
]

/** Playback-speed presets (multiplies the engine's delta time). */
export const ENGINE_SPEEDS: readonly number[] = [0.25, 0.5, 1, 1.5, 2]

const FIT_MODES: readonly EngineFitMode[] = ["fit", "width", "height"]
const AUTO_PLAY_MODES: readonly EngineAutoPlayMode[] = ["sequential", "shuffle"]
const CHROME_MODES: readonly EngineChromeMode[] = ["auto", "always"]
const INTERACTION_MODES: readonly InteractionMode[] = ["interact", "move"]
const LIVE2D_TABS: readonly Live2dPanelTab[] = ["controls", "display", "info"]
const SPINE_TABS: readonly SpinePanelTab[] = ["controls", "display", "info"]

function isOneOf<T extends string>(
	value: unknown,
	list: readonly T[],
): value is T {
	return (
		typeof value === "string" && (list as readonly string[]).includes(value)
	)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function clampSpeed(value: unknown): number {
	return isFiniteNumber(value) ? Math.min(2, Math.max(0.25, value)) : 1
}

function positiveNumber(value: unknown, fallback: number): number {
	return isFiniteNumber(value) && value > 0 ? value : fallback
}

export function decodeEngineSettings(raw: string): EngineSettings | undefined {
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!isRecord(parsed)) return undefined
		if (
			parsed.v !== 1 &&
			parsed.v !== 2 &&
			parsed.v !== 3 &&
			parsed.v !== 4 &&
			parsed.v !== 5
		) {
			return undefined
		}
		if (typeof parsed.loop !== "boolean") return undefined
		const interactionMode = isOneOf(parsed.interactionMode, INTERACTION_MODES)
			? parsed.interactionMode
			: ENGINE_SETTINGS_DEFAULT.interactionMode
		const background = isOneOf(parsed.background, [
			"transparent",
			"checker",
			"solid",
		])
			? parsed.background
			: ENGINE_SETTINGS_DEFAULT.background
		const loop =
			typeof parsed.loop === "boolean"
				? parsed.loop
				: ENGINE_SETTINGS_DEFAULT.loop
		const interact =
			typeof parsed.interact === "boolean"
				? parsed.interact
				: ENGINE_SETTINGS_DEFAULT.interact
		const speed = clampSpeed(parsed.speed)

		// Live2D-only fields (default for spine-only payloads).
		const solidColor =
			typeof parsed.solidColor === "string" && parsed.solidColor.length > 0
				? parsed.solidColor
				: ENGINE_SETTINGS_DEFAULT.solidColor
		const volume =
			typeof parsed.volume === "number"
				? parsed.volume
				: ENGINE_SETTINGS_DEFAULT.volume
		const muted =
			typeof parsed.muted === "boolean"
				? parsed.muted
				: ENGINE_SETTINGS_DEFAULT.muted
		const mirror =
			typeof parsed.mirror === "boolean"
				? parsed.mirror
				: ENGINE_SETTINGS_DEFAULT.mirror
		const fitMode = isOneOf(parsed.fitMode, FIT_MODES)
			? parsed.fitMode
			: ENGINE_SETTINGS_DEFAULT.fitMode
		const autoPlay =
			typeof parsed.autoPlay === "boolean"
				? parsed.autoPlay
				: ENGINE_SETTINGS_DEFAULT.autoPlay
		const autoPlayMode = isOneOf(parsed.autoPlayMode, AUTO_PLAY_MODES)
			? parsed.autoPlayMode
			: ENGINE_SETTINGS_DEFAULT.autoPlayMode
		const autoPlayIntervalMs = positiveNumber(
			parsed.autoPlayIntervalMs,
			ENGINE_SETTINGS_DEFAULT.autoPlayIntervalMs,
		)
		const chrome = isOneOf(parsed.chrome, CHROME_MODES)
			? parsed.chrome
			: ENGINE_SETTINGS_DEFAULT.chrome
		const legacyPanelTab = parsed.panelTab
		const live2dTab = isOneOf(parsed.live2dTab, LIVE2D_TABS)
			? parsed.live2dTab
			: isOneOf(legacyPanelTab, LIVE2D_TABS)
				? legacyPanelTab
				: ENGINE_SETTINGS_DEFAULT.live2dTab
		const spineTab = isOneOf(parsed.spineTab, SPINE_TABS)
			? parsed.spineTab
			: ENGINE_SETTINGS_DEFAULT.spineTab

		// Spine-only fields (default for live2d payloads).
		const autoplay =
			typeof parsed.autoplay === "boolean"
				? parsed.autoplay
				: ENGINE_SETTINGS_DEFAULT.autoplay
		const debug =
			typeof parsed.debug === "boolean"
				? parsed.debug
				: ENGINE_SETTINGS_DEFAULT.debug
		const showHitAreas =
			typeof parsed.showHitAreas === "boolean"
				? parsed.showHitAreas
				: ENGINE_SETTINGS_DEFAULT.showHitAreas
		const webpTextures =
			typeof parsed.webpTextures === "boolean"
				? parsed.webpTextures
				: ENGINE_SETTINGS_DEFAULT.webpTextures

		return {
			v: 5,
			interactionMode,
			background,
			solidColor,
			loop,
			interact,
			volume,
			muted,
			mirror,
			fitMode,
			speed,
			autoPlay,
			autoPlayMode,
			autoPlayIntervalMs,
			chrome,
			live2dTab,
			spineTab,
			autoplay,
			debug,
			showHitAreas,
			webpTextures,
		}
	} catch {
		return undefined
	}
}

export function encodeEngineSettings(value: EngineSettings): string {
	return JSON.stringify(value)
}

export function engineSettingsCodec(): Codec<EngineSettings> {
	return { encode: encodeEngineSettings, decode: decodeEngineSettings }
}

export const ENGINE_SETTINGS_CODEC = engineSettingsCodec()

export function toLive2dSettings(value: EngineSettings): Live2dSettings {
	return {
		interactionMode: value.interactionMode,
		background: value.background,
		solidColor: value.solidColor,
		loop: value.loop,
		interact: value.interact,
		volume: value.volume,
		muted: value.muted,
		mirror: value.mirror,
		fitMode: value.fitMode,
		speed: value.speed,
		autoPlay: value.autoPlay,
		autoPlayMode: value.autoPlayMode,
		autoPlayIntervalMs: value.autoPlayIntervalMs,
		chrome: value.chrome,
		live2dTab: value.live2dTab,
		webpTextures: value.webpTextures,
	}
}

export function toSpineSettings(value: EngineSettings): SpineSettings {
	return {
		interactionMode: value.interactionMode,
		background: value.background === "solid" ? "checker" : value.background,
		loop: value.loop,
		speed: value.speed,
		autoplay: value.autoplay,
		debug: value.debug,
		webpTextures: value.webpTextures,
	}
}

// Back-compat aliases for the pre-refactor module.
export const LIVE2D_SETTINGS_DEFAULT = toLive2dSettings(ENGINE_SETTINGS_DEFAULT)
export const LIVE2D_SOLID_COLORS = ENGINE_SOLID_COLORS
export const LIVE2D_SPEEDS = ENGINE_SPEEDS
export const LIVE2D_SETTINGS_CODEC = engineSettingsCodec()
export const SPINE_SETTINGS_DEFAULT = toSpineSettings(ENGINE_SETTINGS_DEFAULT)
export const SPINE_SETTINGS_CODEC = engineSettingsCodec()

export type Live2dBackground = EngineBackground
export type Live2dFitMode = EngineFitMode
export type Live2dChromeMode = EngineChromeMode
