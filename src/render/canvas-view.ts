import {
	clampViewportScale,
	isTapGesture,
	zoomViewportAt as uiZoomViewportAt,
	type ViewportPoint,
} from "@hoardodile/ui/hooks/use-pinch-pan"

export { clampViewportScale, isTapGesture }
export type { ViewportPoint }

/**
 * A viewer's viewport transform: `translate(x, y) scale(scale)` with the
 * target's center as origin, plus an optional `rotation` (radians, around the
 * center). The `@hoardodile/ui` `ViewportTransform` only has `{x,y,scale}`, so
 * the plugin carries rotation through its own type and math here.
 */
export type ViewportTransform = {
	readonly x: number
	readonly y: number
	readonly scale: number
	/** Rotation in radians around the viewport center (default 0). */
	readonly rotation: number
}

/**
 * The engine-agnostic "canvas operation" layer shared by Live2D, Spine and
 * DragonBones. Pure transform + gesture math, separated from the DOM hook so
 * it can be unit-tested in Node and reused by every engine host. One pointer
 * drags (pan), one pointer with Alt rotates, two pointers pinch-zoom, the
 * wheel zooms, and a still press is a tap.
 */

export type ViewportView = {
	readonly width: number
	readonly height: number
}

export type ZoomLimits = {
	readonly minScale: number
	readonly maxScale: number
}

export type PanLimits = {
	readonly panExtent: number
}

export type CanvasViewOptions = ZoomLimits & PanLimits

/** The neutral "home" transform: fit at the container center, no offset. */
export const HOME: ViewportTransform = { x: 0, y: 0, scale: 1, rotation: 0 }

/** Pan a transform by screen-space pixels (rotation carried through). */
export function panViewport(
	transform: ViewportTransform,
	delta: ViewportPoint,
): ViewportTransform {
	return { ...transform, x: transform.x + delta.x, y: transform.y + delta.y }
}

/**
 * Zoom `transform` to `nextScale` while keeping the content under `anchor`
 * (relative to the transform origin) visually fixed. Rotation is carried
 * through unchanged.
 */
export function zoomViewportAt(
	transform: ViewportTransform,
	anchor: ViewportPoint,
	nextScale: number,
	options: ZoomLimits,
): ViewportTransform {
	const scaled = uiZoomViewportAt(transform, anchor, nextScale, options)
	return { ...scaled, rotation: transform.rotation }
}

/** Rotate a transform by a radian delta around the viewport center. */
export function rotateViewport(
	transform: ViewportTransform,
	deltaRad: number,
): ViewportTransform {
	return { ...transform, rotation: transform.rotation + deltaRad }
}

/** Scale delta for one wheel step; `deltaY` in px (≈100 per notch). The
 *  factor is exponential so repeated notches compound smoothly, and tuned
 *  gentler than the original so wheel zoom does not overshoot. */
export function wheelScaleFromDelta(
	scale: number,
	deltaY: number,
	options: ZoomLimits,
): number {
	const factor = Math.exp(-deltaY * 0.0008)
	return clampViewportScale(scale * factor, options)
}

/** Clamp the pan so the model's center can't leave the canvas interior. */
export function clampPan(
	transform: ViewportTransform,
	view: ViewportView,
	panExtent: number,
): ViewportTransform {
	const maxX = view.width * panExtent
	const maxY = view.height * panExtent
	return {
		...transform,
		x: Math.min(maxX, Math.max(-maxX, transform.x)),
		y: Math.min(maxY, Math.max(-maxY, transform.y)),
	}
}

/** Clamp both the zoom scale and the pan together, so the model can neither
 *  shrink away to nothing nor be panned irretrievably off-screen. */
export function clampZoomTransform(
	transform: ViewportTransform,
	view: ViewportView,
	options: CanvasViewOptions,
): ViewportTransform {
	const scaled = { ...transform, scale: clampViewportScale(transform.scale, options) }
	return clampPan(scaled, view, options.panExtent)
}

/** The baseline fit scale for a view/mode, matching the Live2D player's fit. */
export function fitScaleFor(
	viewWidth: number,
	viewHeight: number,
	modelWidth: number,
	modelHeight: number,
	mode: "fit" | "width" | "height",
): number {
	if (mode === "width") return viewWidth / modelWidth
	if (mode === "height") return viewHeight / modelHeight
	return (Math.min(viewWidth / modelWidth, viewHeight / modelHeight) * 0.9)
}

/**
 * Recover the ACTUAL applied viewport transform from a Live2D model's live
 * pixi state (its position/scale) — the inverse of the player's `applyViewport`.
 * This is the testable interface that reveals a snap-back: after a pan the
 * model should report a non-home transform; if the model was re-fitted to
 * home, this returns `{ x: 0, y: 0, scale: 1 }` instead.
 */
export function deriveLive2dViewport(
	model: {
		readonly position: { readonly x: number; readonly y: number }
		readonly scale: { readonly x: number; readonly y: number }
		readonly rotation: number
	},
	screen: { readonly width: number; readonly height: number },
	modelSize: { readonly width: number; readonly height: number },
	fitMode: "fit" | "width" | "height",
): ViewportTransform {
	if (
		screen.width <= 0 ||
		screen.height <= 0 ||
		modelSize.width <= 0 ||
		modelSize.height <= 0
	) {
		return { ...HOME }
	}
	const base = fitScaleFor(
		screen.width,
		screen.height,
		modelSize.width,
		modelSize.height,
		fitMode,
	)
	if (base <= 0) return { ...HOME }
	return {
		x: model.position.x - screen.width / 2,
		y: model.position.y - screen.height / 2,
		// Mirror flips the sign of `scale.x`; the zoom magnitude is unchanged.
		scale: Math.abs(model.scale.x) / base,
		rotation: model.rotation,
	}
}
