import { describe, expect, test } from "vitest"
import { groupLive2dScenes, serializeEngineScenes } from "./files"
import { type ModelJsonDocument, parseModelJson } from "./model-json"

const CUBISM = {
	Version: 3,
	FileReferences: {
		Moc: "Moc_0.moc3",
		Textures: ["Textures_0_0.png"],
		Motions: { Idle: [{ File: "motion.json" }] },
	},
}

const EX_LIVE2D = {
	type: 0,
	model: "model_0.moc",
	textures: ["textures_0_0.png"],
	motions: { idle: [{ file: "idle" }] },
}

const EX_SPINE = {
	type: 9,
	skeleton: "skeleton_0.json",
	atlases: [{ atlas: "atlas_0", textures: ["tex.png"] }],
	motions: {},
}

function docs(
	files: readonly string[],
	contents: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, ModelJsonDocument | undefined> {
	const map = new Map<string, ModelJsonDocument | undefined>()
	for (const filename of files) {
		const content = contents[filename]
		map.set(
			filename,
			typeof content === "string" ? parseModelJson(content) : undefined,
		)
	}
	return map
}

describe("groupLive2dScenes", () => {
	test("groups official Cubism scenes", () => {
		const files = ["Moc_0.moc3", "Textures_0_0.png", "hero.model3.json"]
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "hero.model3.json": JSON.stringify(CUBISM) }),
		})
		expect(scenes).toEqual([
			{
				modelJson: "hero.model3.json",
				engine: "live2d",
				kind: "cubism",
				label: "hero.model3.json",
				moc: "Moc_0.moc3",
				textures: ["Textures_0_0.png"],
				motionGroups: ["Idle"],
				expressions: [],
				version: "3",
			},
		])
	})

	test("groups EX .moc scenes", () => {
		const files = ["model0.json", "model_0.moc", "textures_0_0.png"]
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "model0.json": JSON.stringify(EX_LIVE2D) }),
		})
		expect(scenes[0]).toMatchObject({ kind: "ex", moc: "model_0.moc" })
	})

	test("groups Cubism-shaped model0.json as an EX scene", () => {
		const files = ["model0.json", "Moc_0.moc3", "Textures_0_0.png"]
		const scenes = groupLive2dScenes({
			files,
			documents: new Map([
				[
					"model0.json",
					{
						kind: "ex-cubism",
						moc: "Moc_0.moc3",
						textures: ["Textures_0_0.png"],
						motionGroups: ["Idle"],
						expressions: [],
						version: 3,
					},
				],
			]),
		})
		expect(scenes[0]).toMatchObject({ kind: "ex", moc: "Moc_0.moc3" })
	})

	test("builds a scene when textures carry empty placeholders", () => {
		const files = ["model0.json", "Moc_0.moc3", "Textures_0_0.png"]
		const descriptor = {
			Version: 3,
			FileReferences: {
				Moc: "Moc_0.moc3",
				Textures: ["Textures_0_0.png", ""],
				Motions: { Idle: [] },
			},
		}
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "model0.json": JSON.stringify(descriptor) }),
		})
		expect(scenes).toHaveLength(1)
		expect(scenes[0]).toMatchObject({
			moc: "Moc_0.moc3",
			textures: ["Textures_0_0.png"],
		})
	})

	test("ignores Spine and DragonBones descriptors", () => {
		const files = ["model0.json", "skeleton_0.json", "atlas_0", "tex.png"]
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "model0.json": JSON.stringify(EX_SPINE) }),
		})
		expect(scenes).toEqual([])
	})

	test("drops descriptors whose moc or textures are missing", () => {
		const files = ["model0.json", "model_0.moc"]
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "model0.json": JSON.stringify(EX_LIVE2D) }),
		})
		expect(scenes).toEqual([])
	})
})

describe("serializeEngineScenes", () => {
	test("flattens scenes into sidecar rows", () => {
		const files = ["model0.json", "model_0.moc", "textures_0_0.png"]
		const scenes = groupLive2dScenes({
			files,
			documents: docs(files, { "model0.json": JSON.stringify(EX_LIVE2D) }),
		})
		expect(serializeEngineScenes(scenes)).toEqual([
			{
				filename: "model0.json",
				role: "model",
				scene: 0,
				kind: "ex",
				label: "model0.json",
				engine: "live2d",
			},
			{ filename: "model_0.moc", role: "moc", scene: 0, engine: "live2d" },
			{
				filename: "textures_0_0.png",
				role: "texture",
				scene: 0,
				engine: "live2d",
			},
		])
	})
})
