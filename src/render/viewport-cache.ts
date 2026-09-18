import type { EngineScene } from "../shared"
import { DEFAULT_VIEWPORT, type ViewportTransform } from "./canvas-view"

/**
 * The viewer's per-scene pan/zoom cache: one `viewport:<scene key>` entry per
 * scene, holding the transform the user last left the model on.
 *
 * The transform is expressed in the engine's own viewport space (pan in CSS
 * pixels, zoom as a multiple of the engine's fit), so restoring it verbatim is
 * only meaningful while the stage keeps its size. The entry therefore also
 * records the canvas it was written at and the scale in use then, and a stored
 * value is rejected/clamped when it is malformed or out of range — a stale or
 * hand-edited entry must never be able to frame the model off-screen.
 */

/** The scale range the viewer clamps zoom to, shared with `useViewport`. */
export const VIEWPORT_SCALE_RANGE = { minScale: 0.25, maxScale: 8 } as const

/** Pan bound as a multiple of the canvas size (mirrors `useViewport`). */
export const VIEWPORT_PAN_EXTENT = 3

/** A stage size, in CSS pixels. */
export type ViewportCanvas = {
	readonly width: number
	readonly height: number
}

/** One cached viewport: what was applied and where it was applied. */
export type ViewportEntry = {
	readonly transform: ViewportTransform
	/** The canvas the transform was captured on, when known. */
	readonly canvas?: ViewportCanvas
	/**
	 * The engine's own fit scale when the entry was written. Pan and zoom are
	 * both expressed relative to it, so a future engine that changes its fit
	 * can convert rather than mistranslate the entry.
	 */
	readonly scaleRef?: number
}

/** The cache key for a scene's viewport (`viewport:` + its identity). */
export function viewportCacheKeyFor(scene: EngineScene | undefined): string {
	if (scene === undefined) return "viewport:"
	const key =
		scene.engine === "spine"
			? `${scene.modelJson ?? ""}:${scene.skeleton}`
			: (scene.modelJson ?? "")
	return `viewport:${key}`
}

/** Every viewport cache key a resource's scenes can have written. */
export function viewportCacheKeys(
	scenes: readonly EngineScene[] | undefined,
): readonly string[] {
	const keys = new Set<string>()
	for (const scene of scenes ?? []) {
		const key = viewportCacheKeyFor(scene)
		if (key !== "viewport:") keys.add(key)
	}
	return [...keys]
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function readCanvas(value: unknown): ViewportCanvas | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined
	}
	const record = value as Record<string, unknown>
	const width = record.width
	const height = record.height
	if (!isFiniteNumber(width) || !isFiniteNumber(height)) return undefined
	if (width <= 0 || height <= 0) return undefined
	return { width, height }
}

/**
 * Decode one cache entry. Anything unusable (empty, non-JSON, missing or
 * non-finite fields) falls back to the home transform, and a usable but
 * out-of-range transform is clamped to the viewer's own bounds — so a
 * leftovers entry can never restore an absurd zoom or an off-canvas offset.
 */
export function decodeViewportEntry(raw: string | undefined): ViewportEntry {
	if (raw === undefined || raw.length === 0)
		return { transform: DEFAULT_VIEWPORT }
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return { transform: DEFAULT_VIEWPORT }
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { transform: DEFAULT_VIEWPORT }
	}
	const record = parsed as Record<string, unknown>
	if (
		!isFiniteNumber(record.x) ||
		!isFiniteNumber(record.y) ||
		!isFiniteNumber(record.scale)
	) {
		return { transform: DEFAULT_VIEWPORT }
	}
	const canvas = readCanvas(record.canvas)
	const scaleRef = isFiniteNumber(record.scaleRef) ? record.scaleRef : undefined
	// The pan is only clamped against a known stage size; without one the live
	// canvas clamps it (`useViewport` bounds every applied transform), so a
	// legacy entry is not collapsed toward the origin here.
	const bound = (value: number, extent: number) =>
		canvas === undefined
			? value
			: clamp(
					value,
					-extent * VIEWPORT_PAN_EXTENT,
					extent * VIEWPORT_PAN_EXTENT,
				)
	const scale = clamp(
		record.scale,
		VIEWPORT_SCALE_RANGE.minScale,
		VIEWPORT_SCALE_RANGE.maxScale,
	)
	return {
		transform: {
			x: bound(record.x, canvas?.width ?? 0),
			y: bound(record.y, canvas?.height ?? 0),
			scale,
			rotation: isFiniteNumber(record.rotation) ? record.rotation : 0,
		},
		...(canvas !== undefined ? { canvas } : {}),
		...(scaleRef !== undefined ? { scaleRef } : {}),
	}
}

/**
 * Serialize one entry for `setCache`. The canvas may still be an unmeasured
 * stage (0×0); it is omitted then, so an entry never claims a capture size it
 * does not have.
 */
export function encodeViewportEntry(entry: {
	readonly transform: ViewportTransform
	readonly canvas?: ViewportCanvas
	readonly scaleRef?: number
}): string {
	const canvas =
		entry.canvas !== undefined &&
		entry.canvas.width > 0 &&
		entry.canvas.height > 0
			? entry.canvas
			: undefined
	return JSON.stringify({
		...entry.transform,
		...(canvas !== undefined ? { canvas } : {}),
		...(entry.scaleRef !== undefined ? { scaleRef: entry.scaleRef } : {}),
	})
}

/** The minimal cache surface this module writes through. */
export type ViewportCacheWriter = {
	readonly setCache: (key: string, value: string) => void
}

/**
 * Forget every stored viewport of a resource (its scenes' keys, plus the
 * unknown-scene fallback). Writing an empty value is the clear convention the
 * plugin API offers — `decodeViewportEntry("")` reads back as the home
 * transform — so a reset survives a reload instead of being revived by the
 * still-stored entry.
 */
export function clearViewportCache(
	cache: ViewportCacheWriter,
	scenes: readonly EngineScene[] | undefined,
): void {
	for (const key of [...viewportCacheKeys(scenes), "viewport:"]) {
		cache.setCache(key, "")
	}
}
