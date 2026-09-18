import { describe, expect, test } from "vitest"
import type { ViewportTransform } from "./canvas-view"
import {
	applySkeletonViewport,
	captureBase,
	type SkeletonBase,
	type SkeletonSurface,
	withFrame,
	worldPerPixel,
} from "./spine-viewport"

function surface(patch: Partial<SkeletonSurface> = {}): SkeletonSurface {
	return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...patch }
}

const HOME: ViewportTransform = { x: 0, y: 0, scale: 1, rotation: 0 }

/**
 * The base `applySkeletonViewport` expects: the pose a skeleton reports once the
 * engine has fitted it. The frame values mirror the real exports (a ~5490-unit
 * setup canvas on a 1483px stage).
 */
const BASE: SkeletonBase = {
	x: 120,
	y: -40,
	scaleX: 1,
	scaleY: 1,
	worldPerX: 3.7,
	worldPerY: 2,
	pivotX: 100,
	pivotY: -50,
}

const TRANSFORM: ViewportTransform = {
	x: 40,
	y: -20,
	scale: 1.6,
	rotation: 0.25,
}

describe("worldPerPixel", () => {
	test("uses the pinned viewport width when present (EX scenes)", () => {
		expect(worldPerPixel(2000, 800, 1483)).toBeCloseTo(2000 / 1483)
	})

	test("falls back to the model bounds when there is no pinned viewport", () => {
		expect(worldPerPixel(undefined, 800, 1483)).toBeCloseTo(800 / 1483)
	})

	test("returns 1 when neither dimension is usable", () => {
		expect(worldPerPixel(undefined, undefined, 1483)).toBe(1)
		expect(worldPerPixel(0, 800, 1483)).toBeCloseTo(800 / 1483)
	})
})

describe("captureBase / withFrame", () => {
	test("captures the fitted pose and the frame's pan units", () => {
		const fitted = surface({ x: 12, y: 34, scaleX: 1, scaleY: 1 })
		const base = captureBase({
			surface: fitted,
			worldPerX: 3.7,
			worldPerY: 2,
			pivotX: 100,
			pivotY: -50,
		})
		expect(base.x).toBe(12)
		expect(base.y).toBe(34)
		expect(base.scaleX).toBe(1)
		expect(base.worldPerX).toBe(3.7)
	})

	test("a re-measure only takes the new framing, never the posed scale", () => {
		// The bug that compounded pan/zoom: a re-measure (animation switch)
		// recorded the already-zoomed pose as the base and applied the transform
		// again. `withFrame` deliberately leaves the pose alone.
		const zoomed = surface({ scaleX: 1.6, scaleY: 1.6, x: 999 })
		const next = withFrame(BASE, {
			worldPerX: 5,
			worldPerY: 3,
			pivotX: 200,
			pivotY: 300,
		})
		expect(next.scaleX).toBe(BASE.scaleX)
		expect(next.x).toBe(BASE.x)
		expect(next.y).toBe(BASE.y)
		expect(zoomed.scaleX).toBe(1.6)
		// The framing did change.
		expect(next.worldPerX).toBe(5)
		expect(next.pivotX).toBe(200)
	})
})

describe("applySkeletonViewport", () => {
	test("lays the transform on top of the base", () => {
		const live = surface()
		applySkeletonViewport({ surface: live, base: BASE, transform: TRANSFORM })
		expect(live.scaleX).toBeCloseTo(1.6)
		expect(live.scaleY).toBeCloseTo(1.6)
		expect(live.x).toBeCloseTo(
			BASE.pivotX + (BASE.x - BASE.pivotX) * 1.6 + TRANSFORM.x * BASE.worldPerX,
		)
		expect(live.y).toBeCloseTo(
			BASE.pivotY + (BASE.y - BASE.pivotY) * 1.6 - TRANSFORM.y * BASE.worldPerY,
		)
		expect(live.rotation).toBeCloseTo(0.25)
	})

	test("is idempotent: re-applying the same transform does not stack", () => {
		// Every animation switch re-measures the frame and re-applies the current
		// viewport. With a base captured once, that is a no-op.
		const live = surface()
		applySkeletonViewport({ surface: live, base: BASE, transform: TRANSFORM })
		const once = { ...live }
		applySkeletonViewport({ surface: live, base: BASE, transform: TRANSFORM })
		expect(live.x).toBeCloseTo(once.x)
		expect(live.y).toBeCloseTo(once.y)
		expect(live.scaleX).toBeCloseTo(once.scaleX)
	})

	test("HOME leaves the fitted pose exactly as the engine left it", () => {
		const live = surface({ x: 120, y: -40, scaleX: 1, scaleY: 1 })
		applySkeletonViewport({ surface: live, base: BASE, transform: HOME })
		expect(live.x).toBe(120)
		expect(live.y).toBe(-40)
		expect(live.scaleX).toBe(1)
	})

	test("panning moves the model by screen pixels through the frame's units", () => {
		const live = surface()
		applySkeletonViewport({
			surface: live,
			base: BASE,
			transform: { x: 10, y: 0, scale: 1, rotation: 0 },
		})
		expect(live.x).toBeCloseTo(BASE.x + 10 * BASE.worldPerX)
		// Screen y grows downward, the skeleton's grows upward.
		applySkeletonViewport({
			surface: live,
			base: BASE,
			transform: { x: 0, y: 10, scale: 1, rotation: 0 },
		})
		expect(live.y).toBeCloseTo(BASE.y - 10 * BASE.worldPerY)
	})

	test("tolerates a runtime without a rotation field", () => {
		const live = surface()
		delete (live as { rotation?: number }).rotation
		expect(() =>
			applySkeletonViewport({
				surface: live,
				base: BASE,
				transform: TRANSFORM,
			}),
		).not.toThrow()
		expect(live.scaleX).toBeCloseTo(1.6)
	})
})
