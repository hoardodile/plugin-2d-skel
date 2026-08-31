import type { SpineBounds, SpineHitArea } from "./spine-hit"

/**
 * Hit-area visualisation geometry, projected into container-local CSS
 * pixels. Kept separate from the React component so the projection math is
 * testable in a Node environment (spine) and against a fake model adapter
 * (live2d). The component only renders the rects.
 *
 * For Spine/DragonBones the viewport is applied natively to the engine's
 * render surface (no CSS transform on the container), so the projection
 * folds the viewport `translate(x, y) scale(scale)` around the container
 * center — the same origin the gesture layer uses.
 */

export type HitAreaRect = {
	readonly name: string
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
}

/**
 * Project EX hit areas (model units driven by `bounds`) into container-local
 * pixels. Mirror `spine-hit.ts`'s pointer → model mapping exactly — including
 * its width-based Y denominator — so the drawn region aligns with where a
 * tap actually registers. The user viewport is folded in here because the
 * engine applies it natively (no CSS transform to inherit).
 */
export function projectSpineHitRects(options: {
	readonly bounds: SpineBounds
	readonly areas: readonly SpineHitArea[]
	readonly containerWidth: number
	readonly containerHeight: number
	readonly viewport?: { readonly x: number; readonly y: number; readonly scale: number }
}): readonly HitAreaRect[] {
	const { bounds, areas, containerWidth, containerHeight, viewport } = options
	if (containerWidth <= 0 || containerHeight <= 0) return []
	const fit = Math.min(containerWidth / bounds.width, containerHeight / bounds.height)
	const halfWidth = containerWidth / 2
	const halfHeight = containerHeight / 2
	const vz = viewport?.scale ?? 1
	const vx = viewport?.x ?? 0
	const vy = viewport?.y ?? 0
	const rects: HitAreaRect[] = []
	for (const area of areas) {
		if (area.width <= 0 || area.height <= 0) continue
		// The SpinePlayer fits the viewport (`bounds`) into the container, so
		// the on-screen scale is `fit` pixels per model unit. Fold in the
		// native viewport (scale around center + translate).
		const baseX = halfWidth + (area.centerX - area.width / 2 - bounds.centerX) * fit
		const baseY = halfHeight + (area.centerY - area.height / 2 - bounds.centerY) * fit
		const baseW = area.width * fit
		const baseH = area.height * fit
		rects.push({
			name: area.name,
			x: halfWidth + (baseX - halfWidth) * vz + vx,
			y: halfHeight + (baseY - halfHeight) * vz + vy,
			width: baseW * vz,
			height: baseH * vz,
		})
	}
	return rects
}

/** Minimal surface a Live2D internal model exposes for hit-area geometry. */
export type Live2dHitAreaDef = {
	readonly id: string
	readonly name: string
	readonly index: number
}

export type PointLike = { x: number; y: number }

/** The part of the pixi model the projection needs, decoupled from pixi classes. */
export type Live2dModelLike = {
	readonly internalModel: {
		readonly localTransform?: {
			readonly apply: (
				point: PointLike,
				out: PointLike,
			) => PointLike
		}
		readonly getHitAreaDefs?: () => readonly Live2dHitAreaDef[]
		readonly getDrawableVertices?: (drawIndex: number) => ArrayLike<number>
	}
	/** Recompute the model's world transform if it may be stale. */
	readonly updateTransform?: () => void
	readonly toGlobal: (point: PointLike) => PointLike
}

/**
 * Compute each Live2D hit area's bounding box (model space, from the drawable
 * graph) and project its corners into container-local pixels via the model's
 * own transforms (so pan/zoom/mirror/fit stay aligned without manual syncing).
 * Returns `[]` when the runtime exposes no hit-area geometry.
 */
export function projectLive2dHitRects(model: Live2dModelLike): readonly HitAreaRect[] {
	const im = model.internalModel
	const localTransform = im.localTransform
	if (localTransform === undefined) return []

	model.updateTransform?.()

	// Call these as methods on `im` (not detached) so the runtime's internal
	// `this` is preserved — `getHitAreaDefs`/`getDrawableVertices` read `this.settings`.
	const defs = im.getHitAreaDefs?.() ?? []
	const rects: HitAreaRect[] = []
	for (const def of defs) {
		if (def.index < 0) continue
		const vertices = im.getDrawableVertices?.(def.index)
		if (vertices === undefined || vertices.length < 4) continue
		let minX = Infinity
		let minY = Infinity
		let maxX = -Infinity
		let maxY = -Infinity
		for (let i = 0; i < vertices.length - 1; i += 2) {
			const x = vertices[i]!
			const y = vertices[i + 1]!
			if (x < minX) minX = x
			if (x > maxX) maxX = x
			if (y < minY) minY = y
			if (y > maxY) maxY = y
		}
		if (!Number.isFinite(minX) || !Number.isFinite(minY)) continue
		const a = model.toGlobal(localTransform.apply({ x: minX, y: minY }, { x: 0, y: 0 }))
		const c = model.toGlobal(localTransform.apply({ x: maxX, y: maxY }, { x: 0, y: 0 }))
		rects.push({
			name: def.name,
			x: Math.min(a.x, c.x),
			y: Math.min(a.y, c.y),
			width: Math.abs(c.x - a.x),
			height: Math.abs(c.y - a.y),
		})
	}
	return rects
}
