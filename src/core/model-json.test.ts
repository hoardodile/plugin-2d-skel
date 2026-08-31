import { describe, expect, test } from "vitest"
import { isModelJsonName, parseModelJson } from "./model-json"

const CUBISM = {
	Version: 3,
	ConfVer: 0,
	Type: 0,
	FileReferences: {
		Moc: "Moc_0.moc3",
		Textures: ["Textures_0_0.png"],
		Physics: "Physics_0.json",
		Motions: { Idle: [{ File: "Motions_Idle_0.json" }] },
		Expressions: [{ Name: "smile", File: "exp_smile.json" }],
	},
}

const EX_LIVE2D = {
	type: 0,
	model: "model_0.moc",
	textures: ["textures_0_0.png"],
	controllers: { eye_blink: {} },
	motions: { idle: [{ file: "motions_idle_0_file_0" }], tap: [] },
	expressions: [{ name: "smile", file: "expressions_0_file_0.json" }],
	options: { tex_fixed: true },
}

const EX_SPINE = {
	type: 9,
	conf_ver: 1,
	skeleton: "skeleton_0.json",
	atlases: [
		{
			atlas: "atlases_0_atlas_0",
			tex_names: ["hero"],
			textures: ["atlases_0_textures_0_0.png"],
		},
	],
	motions: { idle: [{ file: "normal", file_loop: true }] },
	options: { scale_factor: 0.09 },
}

const EX_DRAGONBONES = {
	type: 10,
	skeleton: "skeleton_0",
	atlases: [{ atlas: "atlases_0_atlas_0.json", textures: ["tex.png"] }],
	motions: { idle: [] },
}

describe("parseModelJson", () => {
	test("parses official Cubism descriptors", () => {
		expect(parseModelJson(JSON.stringify(CUBISM))).toEqual({
			kind: "cubism",
			moc: "Moc_0.moc3",
			textures: ["Textures_0_0.png"],
			motionGroups: ["Idle"],
			expressions: ["smile"],
			version: 3,
		})
		expect(
			parseModelJson(JSON.stringify(CUBISM), "hero.model3.json"),
		).toMatchObject({
			kind: "cubism",
		})
	})

	test("model0.json with Cubism-shaped JSON is still EX", () => {
		expect(parseModelJson(JSON.stringify(CUBISM), "model0.json")).toMatchObject(
			{
				kind: "ex-cubism",
				moc: "Moc_0.moc3",
			},
		)
	})

	test("drops empty placeholder textures from Cubism descriptors", () => {
		const json = {
			Version: 3,
			Type: 0,
			FileReferences: {
				Moc: "Moc_0.moc3",
				Textures: ["Textures_0_0.png", ""],
				Motions: { Idle: [] },
			},
		}
		expect(parseModelJson(JSON.stringify(json))).toMatchObject({
			kind: "cubism",
			textures: ["Textures_0_0.png"],
		})
		expect(parseModelJson(JSON.stringify(json), "model0.json")).toMatchObject({
			kind: "ex-cubism",
			moc: "Moc_0.moc3",
			textures: ["Textures_0_0.png"],
		})
	})

	test("drops empty placeholder textures from EX descriptors", () => {
		expect(
			parseModelJson(
				JSON.stringify({ type: 0, model: "model_0.moc", textures: ["a.png", ""] }),
			),
		).toMatchObject({ kind: "ex-live2d", textures: ["a.png"] })
	})

	test("accepts Cubism FileReferences when Version is omitted", () => {
		const json = {
			Type: 0,
			FileReferences: {
				Moc: "Moc_0.moc3",
				Textures: ["Textures_0_0.png"],
				Motions: { Idle: [{ File: "idle.json" }] },
			},
		}
		expect(parseModelJson(JSON.stringify(json))).toEqual({
			kind: "cubism",
			moc: "Moc_0.moc3",
			textures: ["Textures_0_0.png"],
			motionGroups: ["Idle"],
			expressions: [],
			version: 3,
		})
		expect(parseModelJson(JSON.stringify(json), "model0.json")).toMatchObject({
			kind: "ex-cubism",
			moc: "Moc_0.moc3",
			version: 3,
		})
	})

	test("parses Live2DViewerEX .moc descriptors", () => {
		expect(parseModelJson(JSON.stringify(EX_LIVE2D))).toEqual({
			kind: "ex-live2d",
			moc: "model_0.moc",
			textures: ["textures_0_0.png"],
			motionGroups: ["idle", "tap"],
			expressions: ["smile"],
		})
	})

	test("parses type 9 Spine and type 10 DragonBones descriptors", () => {
		expect(parseModelJson(JSON.stringify(EX_SPINE))).toMatchObject({
			kind: "ex-spine",
			skeleton: "skeleton_0.json",
			atlases: [
				{
					atlas: "atlases_0_atlas_0",
					texNames: ["hero"],
					textures: ["atlases_0_textures_0_0.png"],
				},
			],
			motionGroups: ["idle"],
		})
		expect(parseModelJson(JSON.stringify(EX_DRAGONBONES))).toMatchObject({
			kind: "ex-dragonbones",
		})
	})

	test("rejects motion, physics and unrelated json files", () => {
		expect(parseModelJson('{"Type":0}')).toBeUndefined()
		expect(parseModelJson('{"Meta":{"Duration":1}}')).toBeUndefined()
		expect(parseModelJson("not json")).toBeUndefined()
	})
})

describe("isModelJsonName", () => {
	test("matches descriptor names but not motion files", () => {
		expect(isModelJsonName("model0.json")).toBe(true)
		expect(isModelJsonName("dir/model1.json")).toBe(true)
		expect(isModelJsonName("hero.model3.json")).toBe(true)
		expect(isModelJsonName("hero.model.json")).toBe(true)
		expect(isModelJsonName("Motions_Idle_0_File_0.json")).toBe(false)
		expect(isModelJsonName("Physics_0.json")).toBe(false)
	})
})
