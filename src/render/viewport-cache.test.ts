import { describe, expect, test } from "vitest"
import type { EngineScene } from "../shared"
import { DEFAULT_VIEWPORT } from "./canvas-view"
import {
	clearViewportCache,
	decodeViewportEntry,
	encodeViewportEntry,
	VIEWPORT_PAN_EXTENT,
	VIEWPORT_SCALE_RANGE,
	viewportCacheKeyFor,
	viewportCacheKeys,
} from "./viewport-cache"

const SPINE_SCENE = {
	engine: "spine",
	kind: "standard",
	skeleton: "hero.json",
	atlas: "hero.atlas",
	textures: [],
	format: "json",
	version: "4.2.0",
	animations: [],
	skins: [],
} as const satisfies EngineScene

const EX_SCENE = {
	...SPINE_SCENE,
	kind: "ex",
	modelJson: "model0.json",
} as const satisfies EngineScene

const LIVE2D_SCENE = {
	engine: "live2d",
	kind: "cubism",
	modelJson: "hero.model3.json",
	moc: "hero.moc3",
	textures: [],
	motionGroups: [],
	expressions: [],
} as const satisfies EngineScene

describe("viewportCacheKeyFor", () => {
	test("keys a spine scene by descriptor and skeleton", () => {
		// A standard export has no descriptor, so the key starts with the empty
		// descriptor slot — the shape the old inline key had, kept for the
		// entries already written by earlier versions.
		expect(viewportCacheKeyFor(SPINE_SCENE)).toBe("viewport::hero.json")
		expect(viewportCacheKeyFor(EX_SCENE)).toBe("viewport:model0.json:hero.json")
	})

	test("keys a live2d scene by its descriptor", () => {
		expect(viewportCacheKeyFor(LIVE2D_SCENE)).toBe("viewport:hero.model3.json")
	})

	test("falls back to the unknown-scene key", () => {
		expect(viewportCacheKeyFor(undefined)).toBe("viewport:")
	})
})

describe("viewportCacheKeys", () => {
	test("lists each scene identity once", () => {
		expect(viewportCacheKeys([SPINE_SCENE, EX_SCENE, SPINE_SCENE])).toEqual([
			"viewport::hero.json",
			"viewport:model0.json:hero.json",
		])
	})

	test("lists nothing for a resource without scenes", () => {
		expect(viewportCacheKeys(undefined)).toEqual([])
	})
})

describe("decodeViewportEntry", () => {
	test("decodes an entry written by the viewer", () => {
		const encoded = encodeViewportEntry({
			transform: { x: 12, y: -8, scale: 1.5, rotation: 0.3 },
			canvas: { width: 800, height: 600 },
			scaleRef: 1,
		})
		expect(decodeViewportEntry(encoded)).toEqual({
			transform: { x: 12, y: -8, scale: 1.5, rotation: 0.3 },
			canvas: { width: 800, height: 600 },
			scaleRef: 1,
		})
	})

	test("falls back to home for empty, malformed or incomplete payloads", () => {
		for (const raw of [
			undefined,
			"",
			"not json",
			"[]",
			'"x"',
			'{"x":1,"y":2}',
			'{"x":1,"y":2,"scale":"1"}',
			'{"x":null,"y":0,"scale":1}',
			'{"x":0,"y":0,"scale":1e999}',
		]) {
			expect(decodeViewportEntry(raw).transform).toEqual(DEFAULT_VIEWPORT)
		}
	})

	test("clamps an out-of-range zoom to the viewer's range", () => {
		expect(
			decodeViewportEntry('{"x":0,"y":0,"scale":99}').transform.scale,
		).toBe(VIEWPORT_SCALE_RANGE.maxScale)
		expect(
			decodeViewportEntry('{"x":0,"y":0,"scale":0.001}').transform.scale,
		).toBe(VIEWPORT_SCALE_RANGE.minScale)
	})

	test("clamps a pan against the canvas it was captured on", () => {
		const decoded = decodeViewportEntry(
			'{"x":999999,"y":-999999,"scale":1,"canvas":{"width":800,"height":600}}',
		).transform
		expect(decoded.x).toBe(800 * VIEWPORT_PAN_EXTENT)
		expect(decoded.y).toBe(-600 * VIEWPORT_PAN_EXTENT)
	})

	test("keeps a legacy entry's pan (no canvas to clamp against)", () => {
		expect(
			decodeViewportEntry('{"x":900,"y":-900,"scale":1}').transform,
		).toEqual({ x: 900, y: -900, scale: 1, rotation: 0 })
	})
})

describe("clearViewportCache", () => {
	test("empties every scene's entry plus the unknown-scene fallback", () => {
		const writes: { key: string; value: string }[] = []
		clearViewportCache(
			{ setCache: (key, value) => writes.push({ key, value }) },
			[SPINE_SCENE, EX_SCENE],
		)
		expect(writes.map((write) => write.key)).toEqual([
			"viewport::hero.json",
			"viewport:model0.json:hero.json",
			"viewport:",
		])
		expect(writes.every((write) => write.value === "")).toBe(true)
	})

	test("still clears the fallback key for a resource without scenes", () => {
		const writes: string[] = []
		clearViewportCache({ setCache: (key) => writes.push(key) }, undefined)
		expect(writes).toEqual(["viewport:"])
	})
})
