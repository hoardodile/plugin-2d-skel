import { describe, expect, test } from "vitest"
import {
	hitTestSpinePoint,
	parseSpineBounds,
	parseSpineHitAreas,
} from "./spine-hit"

describe("spine-hit", () => {
	test("parses bounds and hit areas", () => {
		const bounds = parseSpineBounds({
			width: 100,
			height: 50,
			center_x: 10,
			center_y: -5,
		})
		expect(bounds).toEqual({ width: 100, height: 50, centerX: 10, centerY: -5 })

		const areas = parseSpineHitAreas([
			{ name: "head", motion: "touch#1", center_x: 0, center_y: 0, width: 20, height: 20, order: 1 },
			{ name: "body", motion: "drag", center_x: 0, center_y: 0, width: 40, height: 60, order: 0 },
		])
		expect(areas[0]?.name).toBe("body") // sorted by order
		expect(areas[1]?.name).toBe("head")
		expect(areas[0]?.motion).toEqual({ group: "drag", entry: undefined })
	})

	test("hit-test resolves a pointer to a hit area", () => {
		const area = hitTestSpinePoint({
			pointer: { x: 100, y: 100 },
			canvasSize: { width: 200, height: 200 },
			viewport: { x: 0, y: 0, scale: 1 },
			bounds: { width: 100, height: 100, centerX: 0, centerY: 0 },
			areas: [
				{ name: "c", motion: { group: "g", entry: undefined }, centerX: 0, centerY: 0, width: 20, height: 20, order: 0 },
			],
		})
		expect(area?.name).toBe("c")
	})

	test("hit-test maps via the fitted scale (fit pixels per model unit)", () => {
		// canvas 200x200 vs bounds 100x100 → fit = 2 px/unit.
		// pointer (150,100): localX = 50 → modelX = 50/2 = 25.
		const area = hitTestSpinePoint({
			pointer: { x: 150, y: 100 },
			canvasSize: { width: 200, height: 200 },
			viewport: { x: 0, y: 0, scale: 1 },
			bounds: { width: 100, height: 100, centerX: 0, centerY: 0 },
			areas: [
				{ name: "c", motion: { group: "g", entry: undefined }, centerX: 25, centerY: 0, width: 20, height: 20, order: 0 },
			],
		})
		expect(area?.name).toBe("c")
	})

	test("does not match when the pointer is outside every area", () => {
		const area = hitTestSpinePoint({
			pointer: { x: 500, y: 500 },
			canvasSize: { width: 200, height: 200 },
			viewport: { x: 0, y: 0, scale: 1 },
			bounds: { width: 100, height: 100, centerX: 0, centerY: 0 },
			areas: [
				{ name: "c", motion: { group: "g", entry: undefined }, centerX: 0, centerY: 0, width: 20, height: 20, order: 0 },
			],
		})
		expect(area).toBeUndefined()
	})
})
