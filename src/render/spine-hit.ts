import { isRecord } from "@hoardodile/sdk-web"
import { type MotionRef, parseMotionRef } from "../core/motion-graph"

/**
 * Pointer → EX hit area resolution. The descriptor stores hit areas in
 * model units around `bounds`; the native player fits that box into the
 * canvas, so a pointer maps back through the current user viewport.
 */

export type SpineBounds = {
	readonly width: number
	readonly height: number
	readonly centerX: number
	readonly centerY: number
}

export type SpineHitArea = {
	readonly name: string
	readonly motion: MotionRef
	readonly centerX: number
	readonly centerY: number
	readonly width: number
	readonly height: number
	readonly order: number
}

export type SpinePointer = {
	readonly x: number
	readonly y: number
}

export type SpineViewport = {
	readonly x: number
	readonly y: number
	readonly scale: number
}

export type SpineHitTestOptions = {
	readonly pointer: SpinePointer
	readonly canvasSize: { readonly width: number; readonly height: number }
	readonly viewport: SpineViewport
}

export function parseSpineBounds(value: unknown): SpineBounds | undefined {
	if (!isRecord(value)) return undefined
	const width = numberField(value.width)
	const height = numberField(value.height)
	if (width === undefined || height === undefined) return undefined
	return {
		width,
		height,
		centerX: numberField(value.center_x) ?? 0,
		centerY: numberField(value.center_y) ?? 0,
	}
}

export function parseSpineHitAreas(value: unknown): readonly SpineHitArea[] {
	if (!Array.isArray(value)) return []
	const areas: SpineHitArea[] = []
	for (const entry of value) {
		if (!isRecord(entry)) continue
		const name = typeof entry.name === "string" ? entry.name : undefined
		const motionRaw =
			typeof entry.motion === "string" ? entry.motion : undefined
		if (name === undefined || motionRaw === undefined) continue
		const motion = parseMotionRef(motionRaw)
		if (motion === undefined) continue
		areas.push({
			name,
			motion,
			centerX: numberField(entry.center_x) ?? 0,
			centerY: numberField(entry.center_y) ?? 0,
			width: numberField(entry.width) ?? 0,
			height: numberField(entry.height) ?? 0,
			order: numberField(entry.order) ?? 0,
		})
	}
	return areas.sort((a, b) => a.order - b.order)
}

/**
 * Resolve a pointer against hit areas. Coordinates are model units: the
 * canvas's fit scale maps `bounds` into the viewport, then the user
 * gesture's translate/scale is removed.
 */
export function hitTestSpinePoint(
	options: SpineHitTestOptions & {
		readonly bounds: SpineBounds
		readonly areas: readonly SpineHitArea[]
	},
): SpineHitArea | undefined {
	const { pointer, canvasSize, viewport, bounds, areas } = options
	if (canvasSize.width <= 0 || canvasSize.height <= 0) return undefined
	// The SpinePlayer fits the viewport (`bounds`) into the canvas, so the
	// scale is `fit` pixels per model unit; the user gesture's translate/scale
	// is removed from the pointer before dividing.
	const fit = Math.min(
		canvasSize.width / bounds.width,
		canvasSize.height / bounds.height,
	)
	const halfWidth = canvasSize.width / 2
	const halfHeight = canvasSize.height / 2
	const localX = pointer.x - halfWidth - viewport.x
	const localY = pointer.y - halfHeight - viewport.y
	const modelX = localX / (fit * viewport.scale) + bounds.centerX
	const modelY = localY / (fit * viewport.scale) + bounds.centerY

	return areas.find((area) => {
		if (area.width <= 0 || area.height <= 0) return false
		return (
			Math.abs(modelX - area.centerX) <= area.width / 2 &&
			Math.abs(modelY - area.centerY) <= area.height / 2
		)
	})
}

function numberField(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
