import { describe, expect, test } from "vitest"
import type { SpineDocument } from "./spine-format"
import { groupSpineScenes, serializeSpineScenes } from "./spine-scenes"

const DOCS = new Map<string, SpineDocument>([
	["hero.json", { version: { raw: "4.1.24", major: 4, minor: 1, patch: 24 }, animations: ["idle"], skins: ["default"] }],
])

describe("groupSpineScenes", () => {
	test("groups a skeleton with its atlas and textures", () => {
		const scenes = groupSpineScenes(
			["hero.json", "hero.atlas", "hero.png"],
			DOCS,
		)
		expect(scenes).toEqual([
			{
				engine: "spine",
				skeleton: "hero.json",
				atlas: "hero.atlas",
				textures: ["hero.png"],
				format: "json",
				kind: "standard",
				version: "4.1.24",
				animations: ["idle"],
				skins: ["default"],
				label: "hero",
			},
		])
	})

	test("drops scenes without an atlas or texture", () => {
		expect(groupSpineScenes(["hero.json", "hero.png"], DOCS)).toEqual([])
		expect(groupSpineScenes(["hero.json", "hero.atlas"], DOCS)).toEqual([])
	})

	test("picks the same-base atlas before a fallback", () => {
		const scenes = groupSpineScenes(
			["hero.json", "hero.atlas", "other.atlas", "hero.png"],
			DOCS,
		)
		expect(scenes[0]?.atlas).toBe("hero.atlas")
	})

	test("resolves textures in the skeleton directory first", () => {
		const scenes = groupSpineScenes(
			[
				"spine/hero.json",
				"spine/hero.atlas",
				"spine/hero.png",
				"root.png",
			],
			new Map([
				[
					"spine/hero.json",
					{ version: { raw: "4.0.0", major: 4, minor: 0, patch: 0 }, animations: [], skins: [] },
				],
			]),
		)
		expect(scenes[0]?.textures).toEqual(["spine/hero.png"])
	})

	test("serializes scenes into sidecar rows", () => {
		const scenes = groupSpineScenes(["hero.json", "hero.atlas", "hero.png"], DOCS)
		expect(serializeSpineScenes(scenes)).toEqual([
			{
				filename: "hero.json",
				role: "skeleton",
				scene: 0,
				format: "json",
				version: "4.1.24",
			},
			{ filename: "hero.atlas", role: "atlas", scene: 0 },
			{ filename: "hero.png", role: "texture", scene: 0 },
		])
	})
})
