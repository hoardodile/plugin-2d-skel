import { describe, expect, test } from "vitest"
import {
	buildDragonBonesExScene,
	isDragonBonesExDocument,
} from "./dragonbones-model"
import { groupDragonBonesScenes } from "./dragonbones-scenes"
import type { ModelJsonDocument } from "./model-json"

const SKE_DOC = {
	version: { raw: "5.5" },
	armatures: ["hero"],
	animations: ["idle", "walk"],
	skins: ["default"],
}

const ATLAS = JSON.stringify({
	name: "hero",
	imagePath: "hero_tex.png",
	width: 256,
	height: 256,
	SubTexture: [{ name: "idle", x: 0, y: 0, width: 10, height: 10 }],
})

describe("groupDragonBonesScenes", () => {
	test("groups a standard skeleton + atlas + texture into a scene", () => {
		const files = ["hero_ske.json", "hero_tex.json", "hero_tex.png"]
		const scenes = groupDragonBonesScenes({
			files,
			documents: new Map([["hero_ske.json", SKE_DOC]]),
			atlasContents: new Map([["hero_tex.json", ATLAS]]),
			claimed: new Set(),
		})
		expect(scenes).toEqual([
			{
				engine: "dragonbones",
				skeleton: "hero_ske.json",
				atlas: "hero_tex.json",
				textures: ["hero_tex.png"],
				format: "json",
				kind: "standard",
				version: "5.5",
				armatures: ["hero"],
				animations: ["idle", "walk"],
				skins: ["default"],
				label: "hero",
			},
		])
	})

	test("skips a claimed (EX) skeleton", () => {
		const files = ["hero_ske.json", "hero_tex.json", "hero_tex.png"]
		const scenes = groupDragonBonesScenes({
			files,
			documents: new Map([["hero_ske.json", SKE_DOC]]),
			atlasContents: new Map([["hero_tex.json", ATLAS]]),
			claimed: new Set(["hero_ske.json"]),
		})
		expect(scenes).toEqual([])
	})

	test("returns no scene when the texture page is missing", () => {
		const files = ["hero_ske.json", "hero_tex.json"]
		const scenes = groupDragonBonesScenes({
			files,
			documents: new Map([["hero_ske.json", SKE_DOC]]),
			atlasContents: new Map([["hero_tex.json", ATLAS]]),
			claimed: new Set(),
		})
		expect(scenes).toEqual([])
	})
})

describe("ex dragonbones", () => {
	const EX_DOC: Extract<
		ModelJsonDocument,
		{ readonly kind: "ex-dragonbones" }
	> = {
		kind: "ex-dragonbones",
		skeleton: "skeleton_0",
		atlases: [
			{
				atlas: "atlases_0_atlas_0.json",
				texNames: ["role1011_tex"],
				textures: ["atlases_0_textures_0_0.png"],
			},
		],
		motionGroups: ["idle", "start"],
	}

	test("identifies an ex-dragonbones descriptor", () => {
		expect(isDragonBonesExDocument(undefined)).toBe(false)
		expect(isDragonBonesExDocument(EX_DOC)).toBe(true)
		expect(
			isDragonBonesExDocument({
				kind: "ex-spine",
				skeleton: "skeleton_0",
				atlases: [],
				motionGroups: [],
			}),
		).toBe(false)
	})

	test("builds a dragonbones/ex scene when assets are present", () => {
		const files = [
			"model0.json",
			"skeleton_0",
			"atlases_0_atlas_0.json",
			"atlases_0_textures_0_0.png",
		]
		const scene = buildDragonBonesExScene({
			modelJson: "model0.json",
			document: EX_DOC,
			files,
			skeletonDocument: SKE_DOC,
		})
		expect(scene).toEqual({
			engine: "dragonbones",
			skeleton: "skeleton_0",
			atlas: "atlases_0_atlas_0.json",
			textures: ["atlases_0_textures_0_0.png"],
			format: "dbbin",
			kind: "ex",
			version: "5.5",
			armatures: ["hero"],
			animations: ["idle", "walk"],
			skins: ["default"],
			modelJson: "model0.json",
			label: "skeleton_0",
		})
	})

	test("returns undefined when a referenced file is missing", () => {
		const scene = buildDragonBonesExScene({
			modelJson: "model0.json",
			document: EX_DOC,
			files: ["model0.json", "skeleton_0"],
			skeletonDocument: undefined,
		})
		expect(scene).toBeUndefined()
	})
})
