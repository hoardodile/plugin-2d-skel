import type { ViewportTransform } from "./canvas-view"

/**
 * The pure math behind the Spine player's pan/zoom.
 *
 * The bundled runtimes expose no camera, so pan/zoom is driven through the
 * skeleton's own transform (`x`/`y`/`scaleX`/`scaleY`). A user transform is
 * therefore always expressed as an offset on top of a **base**: the pose the
 * engine's own fit produced, captured once when the skeleton first reports
 * ready and never re-derived afterwards.
 *
 * The base must stay fixed. Re-capturing it from the live pose would fold the
 * transform already in effect into the base and then apply it again, so every
 * animation switch (which re-measures the frame) would compound the user's
 * pan/zoom — the "position drifts further each time" report. What *is* allowed
 * to change on a re-measure is the framing: the world-units-per-pixel of the
 * pan and the frame's centre.
 *
 * Everything here is a plain function over the runtime's surface so it is unit
 * testable without a WebGL player.
 */

/**
 * The pose (and unit scale) a user transform is applied on top of, captured
 * from the posed skeleton after the frame was configured.
 */
export type SkeletonBase = {
	readonly x: number
	readonly y: number
	readonly scaleX: number
	readonly scaleY: number
	/** World units per screen pixel along each axis, from the pinned frame. */
	readonly worldPerX: number
	readonly worldPerY: number
	/** The point the zoom is pinned to, in skeleton units. */
	readonly pivotX: number
	readonly pivotY: number
}

/** The mutable slice of a Spine `Skeleton` this module touches. */
export type SkeletonSurface = {
	x: number
	y: number
	scaleX: number
	scaleY: number
	/** Present on the 4.x builds; the legacy 3.8 build also carries one. */
	readonly rotation?: number
	readonly updateWorldTransform?: (physics?: unknown) => void
}

/**
 * World units per screen pixel for the pan. The camera's pinned viewport
 * (`viewWorld`, set when the skeleton declares a setup canvas) is the true
 * scale; falling back to the model's own bounds keeps the path for a skeleton
 * without one. `1` when neither yields a positive width.
 */
export function worldPerPixel(
	viewWorld: number | undefined,
	boundsWorld: number | undefined,
	canvasPx: number,
): number {
	if (viewWorld !== undefined && viewWorld > 0) return viewWorld / canvasPx
	if (boundsWorld !== undefined && boundsWorld > 0)
		return boundsWorld / canvasPx
	return 1
}

/**
 * Capture the base from the skeleton's current pose. Called once, while the
 * engine's fit is still the only transform in effect.
 */
export function captureBase(options: {
	readonly surface: SkeletonSurface
	readonly worldPerX: number
	readonly worldPerY: number
	readonly pivotX: number
	readonly pivotY: number
}): SkeletonBase {
	const { surface, worldPerX, worldPerY, pivotX, pivotY } = options
	return {
		x: surface.x,
		y: surface.y,
		scaleX: surface.scaleX,
		scaleY: surface.scaleY,
		worldPerX,
		worldPerY,
		pivotX,
		pivotY,
	}
}

/**
 * Take the freshly measured framing (pan units and zoom anchor) into the base,
 * leaving its pose — and therefore the user's pan/zoom — untouched.
 */
export function withFrame(
	base: SkeletonBase,
	frame: {
		readonly worldPerX: number
		readonly worldPerY: number
		readonly pivotX: number
		readonly pivotY: number
	},
): SkeletonBase {
	return { ...base, ...frame }
}

/**
 * Drive the skeleton's own transform from a user viewport transform, layered on
 * top of `base`. The scale is pivoted on the base's anchor so zooming keeps that
 * canvas point fixed, then the pan is added in screen pixels.
 */
export function applySkeletonViewport(options: {
	readonly surface: SkeletonSurface
	readonly base: SkeletonBase
	readonly transform: ViewportTransform
}): void {
	const { surface, base, transform } = options
	const tz = transform.scale
	surface.scaleX = base.scaleX * tz
	surface.scaleY = base.scaleY * tz
	surface.x =
		base.pivotX + (base.x - base.pivotX) * tz + transform.x * base.worldPerX
	surface.y =
		base.pivotY + (base.y - base.pivotY) * tz - transform.y * base.worldPerY
	// Whole-skeleton rotation isn't a field on the Skeleton in every runtime; set
	// it when present (some 4.x builds expose it), else it's a no-op.
	if ("rotation" in surface) {
		;(surface as { rotation: number }).rotation = transform.rotation
	}
}
