import { describe, expect, test } from "vitest"
import { clampPan, wheelScaleFromDelta } from "./canvas-view"

describe("wheelScaleFromDelta", () => {
	test("zooms in on a negative delta and out on a positive one", () => {
		expect(wheelScaleFromDelta(1, -100, { minScale: 0.5, maxScale: 4 })).toBeGreaterThan(1)
		expect(wheelScaleFromDelta(1, 100, { minScale: 0.5, maxScale: 4 })).toBeLessThan(1)
	})

	test("clamps to the zoom range", () => {
		expect(wheelScaleFromDelta(0.6, 1000, { minScale: 0.5, maxScale: 4 })).toBe(0.5)
		expect(wheelScaleFromDelta(3.5, -1000, { minScale: 0.5, maxScale: 4 })).toBe(4)
	})
})

describe("clampPan", () => {
	const view = { width: 1000, height: 800 }

	test("keeps the model center within the canvas interior", () => {
		expect(clampPan({ x: 5000, y: -5000, scale: 2, rotation: 0 }, view, 0.6)).toEqual({
			x: 600,
			y: -480,
			scale: 2,
			rotation: 0,
		})
	})

	test("leaves in-range transforms untouched", () => {
		expect(clampPan({ x: 10, y: 20, scale: 1, rotation: 0 }, view, 0.6)).toEqual({
			x: 10,
			y: 20,
			scale: 1,
			rotation: 0,
		})
	})

	test("scales the bound with the pan extent", () => {
		expect(clampPan({ x: 300, y: 300, scale: 1, rotation: 0 }, view, 0.25)).toEqual({
			x: 250,
			y: 200,
			scale: 1,
			rotation: 0,
		})
	})
})
