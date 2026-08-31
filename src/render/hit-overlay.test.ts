import { describe, expect, test } from "vitest"
import {
	projectLive2dHitRects,
	projectSpineHitRects,
	type Live2dModelLike,
} from "./hit-overlay"

describe("projectSpineHitRects", () => {
	const bounds = { width: 100, height: 50, centerX: 10, centerY: -5 }
	const areas = [
		{
			name: "foot",
			motion: { group: "Tap下脚", entry: undefined },
			centerX: 30,
			centerY: 20,
			width: 20,
			height: 10,
			order: 0,
		},
	]

	test("projects a hit area into the container", () => {
		// Container square-ish: 200x100.
		const rects = projectSpineHitRects({
			bounds,
			areas,
			containerWidth: 200,
			containerHeight: 100,
		})
		expect(rects).toHaveLength(1)
		const rect = rects[0]!
		expect(rect.name).toBe("foot")
		// fit = min(200/100, 100/50) = 2 pixels per model unit.
		// x0 = 100 + (30-10-10)*2 = 120; x1 = 100 + (30+10-10)*2 = 160.
		expect(rect.x).toBeCloseTo(120, 5)
		expect(rect.width).toBeCloseTo(40, 5)
		// y0 = 50 + (20-5+5)*2 = 90; y1 = 50 + (20+5+5)*2 = 110.
		expect(rect.y).toBeCloseTo(90, 5)
		expect(rect.height).toBeCloseTo(20, 5)
	})

	test("returns nothing for a degenerate container", () => {
		expect(
			projectSpineHitRects({ bounds, areas, containerWidth: 0, containerHeight: 0 }),
		).toEqual([])
	})

	test("folds the native viewport (scale around center + translate) into the rects", () => {
		const rects = projectSpineHitRects({
			bounds,
			areas,
			containerWidth: 200,
			containerHeight: 100,
			viewport: { x: 10, y: 20, scale: 2 },
		})
		const rect = rects[0]!
		// base x=120,y=90,w=40,h=20; center=(100,50).
		// x = 100 + (120-100)*2 + 10 = 150; y = 50 + (90-50)*2 + 20 = 150.
		expect(rect.x).toBeCloseTo(150, 5)
		expect(rect.y).toBeCloseTo(150, 5)
		expect(rect.width).toBeCloseTo(80, 5)
		expect(rect.height).toBeCloseTo(40, 5)
	})
})

describe("projectLive2dHitRects", () => {
	function makeModel(defs: readonly { id: string; name: string; index: number }[]): Live2dModelLike {
		const vertices = new Float32Array([
			0, 0, 10, 10, 10, 0, 0, 10,
		])
		// Methods read `this`, mirroring the real runtime — so a caller that
		// detaches them (losing `this`) throws on `this.settings`/`this`.
		const internalModel = {
			settings: { hitAreas: defs },
			localTransform: {
				apply: (point: { x: number; y: number }, out: { x: number; y: number }) => {
					out.x = point.x * 2
					out.y = point.y * 2
					return out
				},
			},
			getHitAreaDefs() {
				return this.settings.hitAreas
			},
			getDrawableVertices(index: number) {
				if (index === 0) return vertices
				return new Float32Array([])
			},
		}
		return {
			internalModel,
			updateTransform: () => {},
			toGlobal: (point) => ({ x: point.x + 50, y: point.y - 10 }),
		}
	}

	test("projects vertex bounds through the model transform", () => {
		const model = makeModel([{ id: "HitArea_Body", name: "body", index: 0 }])
		const rects = projectLive2dHitRects(model)
		expect(rects).toHaveLength(1)
		const rect = rects[0]!
		expect(rect.name).toBe("body")
		// vertices span x [0,10], y [0,10] → local *2 → [0,20]; toGlobal +50/-10
		// a = (0*2+50, 0*2-10) = (50,-10); c = (20+50, 20-10) = (70,10)
		expect(rect.x).toBeCloseTo(50, 5)
		expect(rect.y).toBeCloseTo(-10, 5)
		expect(rect.width).toBeCloseTo(20, 5)
		expect(rect.height).toBeCloseTo(20, 5)
	})

	test("skips invalid hit areas and returns empty", () => {
		const model = makeModel([{ id: "x", name: "none", index: -1 }])
		expect(projectLive2dHitRects(model)).toEqual([])
	})

	test("returns empty when the runtime exposes no geometry", () => {
		const model: Live2dModelLike = {
			internalModel: {},
			toGlobal: (point) => point,
		}
		expect(projectLive2dHitRects(model)).toEqual([])
	})
})
