import { describe, expect, test } from "vitest"
import {
	clampPan,
	clampZoomTransform,
	deriveLive2dViewport,
	panViewport,
	rotateViewport,
	wheelScaleFromDelta,
	zoomViewportAt,
	HOME,
} from "./canvas-view"

describe("wheelScaleFromDelta", () => {
	test("zooms in on a negative delta and out on a positive one", () => {
		expect(wheelScaleFromDelta(1, -100, { minScale: 0.25, maxScale: 8 })).toBeGreaterThan(1)
		expect(wheelScaleFromDelta(1, 100, { minScale: 0.25, maxScale: 8 })).toBeLessThan(1)
	})

	test("clamps to the zoom range", () => {
		expect(wheelScaleFromDelta(0.3, 1000, { minScale: 0.25, maxScale: 8 })).toBe(0.25)
		expect(wheelScaleFromDelta(7, -1000, { minScale: 0.25, maxScale: 8 })).toBe(8)
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

	test("leaves in-range transforms untouched (rotation carried through)", () => {
		expect(clampPan({ x: 10, y: 20, scale: 1, rotation: 0.5 }, view, 0.6)).toEqual({
			x: 10,
			y: 20,
			scale: 1,
			rotation: 0.5,
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

describe("clampZoomTransform", () => {
	const view = { width: 1000, height: 800 }
	const options = { minScale: 0.25, maxScale: 8, panExtent: 0.6 }

	test("clamps an out-of-range scale", () => {
		expect(clampZoomTransform({ x: 0, y: 0, scale: 50, rotation: 0 }, view, options)).toHaveProperty(
			"scale",
			8,
		)
		expect(clampZoomTransform({ x: 0, y: 0, scale: 0.01, rotation: 0 }, view, options)).toHaveProperty(
			"scale",
			0.25,
		)
	})

	test("keeps the pan reachable at the same time", () => {
		const next = clampZoomTransform({ x: 5000, y: -5000, scale: 3, rotation: 0 }, view, options)
		expect(next.scale).toBe(3)
		expect(next.x).toBe(600)
		expect(next.y).toBe(-480)
		expect(next.rotation).toBe(0)
	})
})

describe("pan / rotate / zoom carry rotation", () => {
	const t = { x: 10, y: 20, scale: 2, rotation: 0.4 } as const

	test("panViewport adds the delta and keeps rotation", () => {
		expect(panViewport(t, { x: 5, y: -3 })).toEqual({ x: 15, y: 17, scale: 2, rotation: 0.4 })
	})

	test("rotateViewport adds only the radian delta", () => {
		expect(rotateViewport(t, 0.3)).toEqual({ x: 10, y: 20, scale: 2, rotation: 0.7 })
	})

	test("zoomViewportAt keeps rotation", () => {
		const next = zoomViewportAt(t, { x: 0, y: 0 }, 4, { minScale: 0.25, maxScale: 8 })
		expect(next.rotation).toBe(0.4)
		expect(next.scale).toBe(4)
	})
})

describe("deriveLive2dViewport", () => {
	const screen = { width: 1600, height: 1200 }
	const modelSize = { width: 2048, height: 1024 }
	const fitMode = "fit" as const

	// Mirror of useLive2dPlayer.applyViewport: position = screen/2 + transform,
	// scale = base * transform.scale (mirror only flips scale.x sign).
	function applied(transform: { x: number; y: number; scale: number; rotation: number }) {
		const base =
			Math.min(screen.width / modelSize.width, screen.height / modelSize.height) * 0.9
		return {
			position: {
				x: screen.width / 2 + transform.x,
				y: screen.height / 2 + transform.y,
			},
			scale: { x: base * transform.scale, y: base * transform.scale },
			rotation: transform.rotation,
		}
	}

	test("round-trips a panned/zoomed/rotated transform back to the same viewport", () => {
		const model = applied({ x: 120, y: -80, scale: 2, rotation: 0.6 })
		expect(deriveLive2dViewport(model, screen, modelSize, fitMode)).toEqual({
			x: 120,
			y: -80,
			scale: 2,
			rotation: 0.6,
		})
	})

	test("a model re-fitted to home reports the home transform (snap-back is visible)", () => {
		const atHome = applied({ x: 0, y: 0, scale: 1, rotation: 0 })
		expect(deriveLive2dViewport(atHome, screen, modelSize, fitMode)).toEqual({
			x: 0,
			y: 0,
			scale: 1,
			rotation: 0,
		})
	})

	test("mirror flips scale.x sign without changing the reported zoom magnitude", () => {
		const model = {
			position: { x: screen.width / 2 + 40, y: screen.height / 2 },
			scale: { x: -applyScale(), y: applyScale() },
			rotation: 0,
		}
		expect(deriveLive2dViewport(model, screen, modelSize, fitMode).scale).toBe(1)
	})

	function applyScale() {
		return Math.min(screen.width / modelSize.width, screen.height / modelSize.height) * 0.9
	}

	test("returns home when the model has no usable size", () => {
		expect(
			deriveLive2dViewport(applied({ x: 10, y: 10, scale: 2, rotation: 0 }), screen, { width: 0, height: 0 }, fitMode),
		).toEqual({
			x: 0,
			y: 0,
			scale: 1,
			rotation: 0,
		})
	})
})

describe("HOME", () => {
	test("is the neutral fit transform", () => {
		expect(HOME).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 })
	})
})
